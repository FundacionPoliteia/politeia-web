import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { normalizeEmail } from './users.js';
import { isValidSlug, slugify } from '../utils/slug.js';

const profiles = () => db().collection('userProfiles');

export async function getUserProfile(user) {
  const email = normalizeEmail(user?.email);
  if (!email) throw new HttpError(401, 'Missing user email');

  const doc = await profiles().doc(profileId(email)).get();
  return toUserProfile(doc.exists ? serializeDoc(doc) : { email }, user);
}

export async function updateUserProfile(user, data) {
  const email = normalizeEmail(user?.email);
  if (!email) throw new HttpError(401, 'Missing user email');

  const ref = profiles().doc(profileId(email));
  const beforeDoc = await ref.get();
  const before = beforeDoc.exists ? toUserProfile(serializeDoc(beforeDoc), user) : null;
  const clean = sanitizeProfile(data);
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const patch = {
    ...clean,
    email,
    fullName,
    authorSlug: slugify(fullName),
    updatedAt: serverTimestamp(),
    updatedBy: email,
  };
  if (!beforeDoc.exists) {
    patch.createdAt = serverTimestamp();
    patch.createdBy = email;
  }

  await ref.set(patch, { merge: true });
  const after = toUserProfile(serializeDoc(await ref.get()), user);
  await writeAuditLog({
    actorEmail: email,
    action: before ? 'profile.update' : 'profile.create',
    resourceType: 'userProfile',
    resourceId: email,
    before,
    after,
  });

  return after;
}

export async function getPublicAuthorProfileBySlug(slug = '') {
  const cleanSlug = slugify(slug);
  if (!cleanSlug || !isValidSlug(cleanSlug)) return null;

  const snapshot = await profiles()
    .where('authorSlug', '==', cleanSlug)
    .limit(10)
    .get();

  const item = snapshot.docs
    .map((doc) => serializeDoc(doc))
    .map(toPublicAuthorProfile)
    .find(Boolean);

  return item || null;
}

export async function resolveUserDisplayName(user) {
  const profile = await getUserProfile(user);
  return profile.fullName || user?.name || user?.email || '';
}

export function sanitizeProfile(data = {}) {
  const firstName = normalizeText(data.firstName).slice(0, 80);
  const lastName = normalizeText(data.lastName).slice(0, 80);
  const description = normalizeText(data.description).slice(0, 500);
  const photoUrl = normalizeUrl(data.photoUrl);
  const publicProfileEnabled = normalizeBoolean(data.publicProfileEnabled);

  return {
    firstName,
    lastName,
    description,
    photoUrl,
    publicProfileEnabled,
  };
}

export function buildFullName(firstName = '', lastName = '') {
  return [normalizeText(firstName), normalizeText(lastName)].filter(Boolean).join(' ');
}

function toUserProfile(item, user) {
  const clean = sanitizeProfile(item || {});
  return {
    id: item?.id || profileId(user?.email),
    email: normalizeEmail(item?.email || user?.email),
    ...clean,
    fullName: buildFullName(clean.firstName, clean.lastName),
    authorSlug: slugify(item?.authorSlug || buildFullName(clean.firstName, clean.lastName)),
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || '',
  };
}

function toPublicAuthorProfile(item) {
  const clean = sanitizeProfile(item || {});
  const fullName = buildFullName(clean.firstName, clean.lastName);
  if (!clean.publicProfileEnabled || !fullName) return null;

  return {
    fullName,
    authorSlug: slugify(item?.authorSlug || fullName),
    description: clean.description,
    photoUrl: clean.photoUrl,
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeUrl(value) {
  const clean = normalizeText(value);
  if (!clean) return '';
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:') throw new Error('invalid protocol');
    return url.toString();
  } catch (_err) {
    throw new HttpError(400, 'photoUrl must be a valid https URL');
  }
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function profileId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}
