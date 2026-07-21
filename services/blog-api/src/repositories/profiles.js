import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { normalizeEmail } from './users.js';
import { isValidSlug, slugify } from '../utils/slug.js';

const profiles = () => db().collection('userProfiles');
const posts = () => db().collection('posts');
const profileClaims = () => db().collection('profileClaims');
const PUBLIC_AUTHOR_STATUSES = ['published', 'published-edition'];

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
  if (before && await hasPendingClaimForEmail(email)) {
    const requestedName = buildFullName(data?.firstName ?? before.firstName, data?.lastName ?? before.lastName);
    if (identityNameKey(requestedName) !== identityNameKey(before.fullName)) {
      throw new HttpError(409, 'No podes cambiar el nombre mientras haya una solicitud de vinculacion pendiente');
    }
  }
  const clean = sanitizeProfile({ ...(before || {}), ...(data || {}) });
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const patch = {
    ...clean,
    publicProfileEnabled: clean.publicProfileEnabled,
    publicProfilePreferenceSet: true,
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

  const ref = profiles().doc(`managed-author-${authorSlug}`);
  const patch = {
    ...clean,
    email: '',
    managedAuthor: true,
    publicProfileEnabled: clean.publicProfileEnabled,
    publicProfilePreferenceSet: true,
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

export async function updateAuthorProfileAsAdmin(id = '', data, actorEmail = '') {
  const cleanId = normalizeText(id);
  if (!cleanId) throw new HttpError(400, 'profile id is required');

  const ref = profiles().doc(cleanId);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Author profile not found');

  const stored = serializeDoc(beforeDoc);
  const storedAccountEmail = stored?.managedAuthor === true
    ? ''
    : normalizeEmail(stored?.email || stored?.id);
  const before = await toUserProfile(stored, { email: storedAccountEmail });
  const isManagedAuthor = before.managedAuthor === true;
  const hasPendingClaim = isManagedAuthor
    ? await hasPendingClaimForManagedProfile(cleanId)
    : await hasPendingClaimForEmail(before.email);
  if (hasPendingClaim) {
    const requestedName = buildFullName(data?.firstName ?? before.firstName, data?.lastName ?? before.lastName);
    if (identityNameKey(requestedName) !== identityNameKey(before.fullName)) {
      throw new HttpError(409, 'No se puede cambiar el nombre de un perfil con solicitudes de vinculacion pendientes');
    }
  }

  const clean = sanitizeProfile({ ...before, ...(data || {}) });
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const authorSlug = slugify(fullName);
  if (!fullName || !authorSlug) throw new HttpError(400, 'firstName and lastName are required');

  if (isManagedAuthor) {
    const existing = await profiles()
      .where('authorSlug', '==', authorSlug)
      .limit(10)
      .get();
    const duplicate = existing.docs
      .map((doc) => serializeDoc(doc))
      .find((item) => item?.id !== cleanId);
    if (duplicate) throw new HttpError(409, 'Author profile already exists');
  }

  const patch = {
    ...clean,
    email: isManagedAuthor ? '' : before.email,
    managedAuthor: isManagedAuthor,
    publicProfileEnabled: clean.publicProfileEnabled,
    publicProfilePreferenceSet: true,
    fullName,
    authorSlug,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };

  await ref.set(patch, { merge: true });
  const after = await toUserProfile(serializeDoc(await ref.get()), { email: before.email });
  await writeAuditLog({
    actorEmail,
    action: isManagedAuthor ? 'profile.managedAuthor.update' : 'profile.admin.update',
    resourceType: 'userProfile',
    resourceId: cleanId,
    before,
    after,
  });

  return after;
}

export const updateManagedAuthorProfile = updateAuthorProfileAsAdmin;

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
  if (await hasPendingClaimForManagedProfile(cleanId)) {
    throw new HttpError(409, 'No se puede eliminar un perfil con solicitudes de vinculacion pendientes');
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

  const exactSnapshot = await profiles()
    .where('authorSlug', '==', cleanSlug)
    .limit(10)
    .get();
  let candidateDocs = exactSnapshot.docs;

  if (!candidateDocs.length) {
    const fallbackSnapshot = await profiles().get();
    candidateDocs = fallbackSnapshot.docs.filter((doc) => {
      const item = serializeDoc(doc);
      const fullName = buildFullName(item?.firstName, item?.lastName);
      return slugify(item?.authorSlug || fullName) === cleanSlug;
    });
  }

  const items = await Promise.all(candidateDocs
    .map((doc) => serializeDoc(doc))
    .sort((left, right) => Number(right?.managedAuthor === true) - Number(left?.managedAuthor === true))
    .map((item) => toPublicAuthorProfile(item)));
  const item = items.find(Boolean);

  return item || null;
}

export async function listPublicAuthorProfiles({ limit = 24 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const [profileSnapshot, postSnapshot] = await Promise.all([
    profiles().get(),
    posts().orderBy('publishedAt', 'desc').limit(300).get(),
  ]);
  const authorStats = buildAuthorStats(postSnapshot.docs.map((doc) => serializeDoc(doc)));
  const items = profileSnapshot.docs
    .map((doc) => serializeDoc(doc))
    .sort((left, right) => Number(right?.managedAuthor === true) - Number(left?.managedAuthor === true))
    .map((item) => toPublicAuthorProfileFromStats(item, authorStats))
    .filter(Boolean)
    .filter((item, index, source) => source.findIndex((candidate) => authorKey(candidate.fullName) === authorKey(item.fullName)) === index)
    .sort((a, b) => {
      const dateCompare = String(b.latestPostDate || '').localeCompare(String(a.latestPostDate || ''));
      if (dateCompare) return dateCompare;
      return a.fullName.localeCompare(b.fullName);
    })
    .slice(0, safeLimit);

  return { items };
}

export async function resolveUserDisplayName(user) {
  const profile = await getUserProfile(user);
  return profile.fullName || user?.name || user?.email || '';
}

export async function getInternalProfileSummaryByEmail(email = '') {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const doc = await profiles().doc(profileId(cleanEmail)).get();
  if (!doc.exists) return null;

  const item = serializeDoc(doc);
  const clean = sanitizeProfile(item || {});
  return {
    email: cleanEmail,
    fullName: buildFullName(clean.firstName, clean.lastName),
    photoUrl: clean.photoUrl,
  };
}

export function sanitizeProfile(data = {}) {
  const firstName = normalizeText(data.firstName).slice(0, 80);
  const lastName = normalizeText(data.lastName).slice(0, 80);
  const description = normalizeText(data.description).slice(0, 500);
  const focusArea = normalizeText(data.focusArea).slice(0, 180);
  const closingPhrase = normalizeText(data.closingPhrase).slice(0, 220);
  const photoUrl = normalizeUrl(data.photoUrl);
  const publicProfileEnabled = normalizeBoolean(data.publicProfileEnabled);

  return {
    firstName,
    lastName,
    description,
    focusArea,
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
  const canSharePublicProfile = await authorNameExists(fullName) && !(item?.managedAuthor !== true && await managedProfileExistsForName(fullName));
  const publicProfileEnabled = resolvePublicProfilePreference(item, clean);
  return {
    id: item?.id || profileId(user?.email),
    email: normalizeEmail(item?.email || user?.email),
    ...clean,
    managedAuthor: item?.managedAuthor === true,
    publicProfileEnabled,
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
  if (!resolvePublicProfilePreference(item, clean) || !fullName || !(await authorNameExists(fullName))) return null;

  return {
    fullName,
    authorSlug: slugify(item?.authorSlug || fullName),
    description: clean.description,
    focusArea: clean.focusArea,
    closingPhrase: clean.closingPhrase,
    photoUrl: clean.photoUrl,
  };
}

function toPublicAuthorProfileFromStats(item, authorStats) {
  const clean = sanitizeProfile(item || {});
  const fullName = buildFullName(clean.firstName, clean.lastName);
  const stats = authorStats.get(authorKey(fullName));
  if (!resolvePublicProfilePreference(item, clean) || !fullName || !stats) return null;

  return {
    fullName,
    authorSlug: slugify(item?.authorSlug || fullName),
    description: clean.description,
    focusArea: clean.focusArea,
    closingPhrase: clean.closingPhrase,
    photoUrl: clean.photoUrl,
    postCount: stats.postCount,
    latestPostTitle: stats.latestPostTitle,
    latestPostSlug: stats.latestPostSlug,
    latestPostDate: stats.latestPostDate,
    categories: [...stats.categories].slice(0, 4),
  };
}

function buildAuthorStats(items = []) {
  const stats = new Map();
  items
    .filter((post) => post && !post.deletedAt && PUBLIC_AUTHOR_STATUSES.includes(post.status))
    .forEach((post) => {
      const fullName = normalizeText(post.authorName);
      const key = authorKey(fullName);
      if (!key) return;
      const current = stats.get(key) || {
        postCount: 0,
        latestPostTitle: '',
        latestPostSlug: '',
        latestPostDate: '',
        categories: new Set(),
      };
      current.postCount += 1;
      if (!current.latestPostDate || String(post.publishedAt || post.updatedAt || '').localeCompare(String(current.latestPostDate)) > 0) {
        current.latestPostTitle = post.title || '';
        current.latestPostSlug = post.publicSlug || post.slug || '';
        current.latestPostDate = post.publishedAt || post.updatedAt || '';
      }
      if (post.category) current.categories.add(normalizeText(post.category));
      stats.set(key, current);
    });
  return stats;
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

function resolvePublicProfilePreference(item = {}, clean = sanitizeProfile(item)) {
  if (item?.publicProfilePreferenceSet === true) return clean.publicProfileEnabled;
  if (item?.managedAuthor === true) return true;
  return clean.publicProfileEnabled;
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

function authorKey(fullName = '') {
  return normalizeText(fullName).toLocaleLowerCase('es-AR');
}

export function identityNameKey(fullName = '') {
  return normalizeText(fullName).toLocaleLowerCase('es-AR');
}

async function managedProfileExistsForName(fullName = '') {
  const key = identityNameKey(fullName);
  if (!key) return false;
  const snapshot = await profiles().get();
  return snapshot.docs.some((doc) => {
    const item = serializeDoc(doc);
    return item?.managedAuthor === true && identityNameKey(item.fullName || buildFullName(item.firstName, item.lastName)) === key;
  });
}

async function hasPendingClaimForEmail(email = '') {
  const snapshot = await profileClaims().where('requesterEmail', '==', normalizeEmail(email)).get();
  return snapshot.docs.some((doc) => ['pending', 'processing'].includes(serializeDoc(doc)?.status));
}

async function hasPendingClaimForManagedProfile(managedProfileId = '') {
  const snapshot = await profileClaims().where('managedProfileId', '==', managedProfileId).get();
  return snapshot.docs.some((doc) => ['pending', 'processing'].includes(serializeDoc(doc)?.status));
}

function profileId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}
