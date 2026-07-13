import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { normalizeEmail } from './users.js';
import { isValidSlug, slugify } from '../utils/slug.js';

const profiles = () => db().collection('userProfiles');
const posts = () => db().collection('posts');

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
  const before = beforeDoc.exists ? await toUserProfile(serializeDoc(beforeDoc), user) : null;
  const clean = sanitizeProfile({ ...(before || {}), ...(data || {}) });
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const canSharePublicProfile = await authorNameExists(fullName);
  const publicProfileEnabled = canSharePublicProfile && clean.publicProfileEnabled;
  const patch = {
    ...clean,
    publicProfileEnabled,
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
  const after = await toUserProfile(serializeDoc(await ref.get()), user);
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

export async function listUserProfiles() {
  const snapshot = await profiles().get();
  const items = await Promise.all(snapshot.docs
    .map((doc) => serializeDoc(doc))
    .map((item) => toUserProfile(item, { email: item?.email })));
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  return { items };
}

export async function createManagedAuthorProfile(data, actorEmail = '') {
  const clean = sanitizeProfile(data || {});
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const authorSlug = slugify(fullName);
  if (!fullName || !authorSlug) throw new HttpError(400, 'firstName and lastName are required');

  const existing = await profiles()
    .where('authorSlug', '==', authorSlug)
    .limit(1)
    .get();
  if (!existing.empty && existing.docs.length > 0) {
    throw new HttpError(409, 'Author profile already exists');
  }

  const canSharePublicProfile = await authorNameExists(fullName);
  const ref = profiles().doc(`managed-author-${authorSlug}`);
  const patch = {
    ...clean,
    email: '',
    managedAuthor: true,
    publicProfileEnabled: canSharePublicProfile && clean.publicProfileEnabled,
    fullName,
    authorSlug,
    createdAt: serverTimestamp(),
    createdBy: actorEmail,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };

  await ref.set(patch, { merge: false });
  const after = await toUserProfile(serializeDoc(await ref.get()), { email: '' });
  await writeAuditLog({
    actorEmail,
    action: 'profile.managedAuthor.create',
    resourceType: 'userProfile',
    resourceId: authorSlug,
    before: null,
    after,
  });

  return after;
}

export async function updateManagedAuthorProfile(id = '', data, actorEmail = '') {
  const cleanId = normalizeText(id);
  if (!cleanId) throw new HttpError(400, 'profile id is required');

  const ref = profiles().doc(cleanId);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Author profile not found');

  const before = await toUserProfile(serializeDoc(beforeDoc), { email: '' });
  if (!before.managedAuthor) {
    throw new HttpError(403, 'Only managed author profiles can be edited');
  }

  const clean = sanitizeProfile({ ...before, ...(data || {}) });
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const authorSlug = slugify(fullName);
  if (!fullName || !authorSlug) throw new HttpError(400, 'firstName and lastName are required');

  const existing = await profiles()
    .where('authorSlug', '==', authorSlug)
    .limit(10)
    .get();
  const duplicate = existing.docs
    .map((doc) => serializeDoc(doc))
    .find((item) => item?.id !== cleanId);
  if (duplicate) throw new HttpError(409, 'Author profile already exists');

  const canSharePublicProfile = await authorNameExists(fullName);
  const patch = {
    ...clean,
    email: '',
    managedAuthor: true,
    publicProfileEnabled: canSharePublicProfile && clean.publicProfileEnabled,
    fullName,
    authorSlug,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };

  await ref.set(patch, { merge: true });
  const after = await toUserProfile(serializeDoc(await ref.get()), { email: '' });
  await writeAuditLog({
    actorEmail,
    action: 'profile.managedAuthor.update',
    resourceType: 'userProfile',
    resourceId: cleanId,
    before,
    after,
  });

  return after;
}

export async function deleteManagedAuthorProfile(id = '', actorEmail = '') {
  const cleanId = normalizeText(id);
  if (!cleanId) throw new HttpError(400, 'profile id is required');

  const ref = profiles().doc(cleanId);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Author profile not found');

  const before = await toUserProfile(serializeDoc(beforeDoc), { email: '' });
  if (!before.managedAuthor) {
    throw new HttpError(403, 'Only managed author profiles can be deleted');
  }

  await ref.delete();
  await writeAuditLog({
    actorEmail,
    action: 'profile.managedAuthor.delete',
    resourceType: 'userProfile',
    resourceId: cleanId,
    before,
    after: null,
  });

  return before;
}

export async function getPublicAuthorProfileBySlug(slug = '') {
  const cleanSlug = slugify(slug);
  if (!cleanSlug || !isValidSlug(cleanSlug)) return null;

  const snapshot = await profiles()
    .where('authorSlug', '==', cleanSlug)
    .limit(10)
    .get();

  const items = await Promise.all(snapshot.docs
    .map((doc) => serializeDoc(doc))
    .map((item) => toPublicAuthorProfile(item)));
  const item = items.find(Boolean);

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
  const closingPhrase = normalizeText(data.closingPhrase).slice(0, 220);
  const photoUrl = normalizeUrl(data.photoUrl);
  const publicProfileEnabled = normalizeBoolean(data.publicProfileEnabled);

  return {
    firstName,
    lastName,
    description,
    closingPhrase,
    photoUrl,
    publicProfileEnabled,
  };
}

export function buildFullName(firstName = '', lastName = '') {
  return [normalizeText(firstName), normalizeText(lastName)].filter(Boolean).join(' ');
}

async function toUserProfile(item, user) {
  const clean = sanitizeProfile(item || {});
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const canSharePublicProfile = await authorNameExists(fullName);
  return {
    id: item?.id || profileId(user?.email),
    email: normalizeEmail(item?.email || user?.email),
    ...clean,
    managedAuthor: item?.managedAuthor === true,
    publicProfileEnabled: canSharePublicProfile && clean.publicProfileEnabled,
    canSharePublicProfile,
    fullName,
    authorSlug: slugify(item?.authorSlug || fullName),
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || '',
  };
}

async function toPublicAuthorProfile(item) {
  const clean = sanitizeProfile(item || {});
  const fullName = buildFullName(clean.firstName, clean.lastName);
  if (!clean.publicProfileEnabled || !fullName || !(await authorNameExists(fullName))) return null;

  return {
    fullName,
    authorSlug: slugify(item?.authorSlug || fullName),
    description: clean.description,
    closingPhrase: clean.closingPhrase,
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

async function authorNameExists(fullName = '') {
  const cleanFullName = normalizeText(fullName);
  if (!cleanFullName) return false;

  const snapshot = await posts()
    .where('authorName', '==', cleanFullName)
    .limit(1)
    .get();

  return snapshot.docs.some((doc) => {
    const post = serializeDoc(doc);
    return post && !post.deletedAt;
  });
}

function profileId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}
