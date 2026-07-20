import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { clearRoleCache } from '../auth.js';
import { writeAuditLog } from './audit.js';
import { buildFullName, identityNameKey, sanitizeProfile } from './profiles.js';
import { grantBlogRoleForProfileClaim, normalizeEmail } from './users.js';
import {
  notifyProfileClaimApproved,
  notifyProfileClaimBlocked,
  notifyProfileClaimReleased,
  notifyProfileClaimRequested,
  notifyProfileClaimSuperseded,
  safeNotify,
} from './notifications.js';

const claims = () => db().collection('profileClaims');
const profiles = () => db().collection('userProfiles');
const posts = () => db().collection('posts');
const ACTIVE_STATUSES = ['pending', 'processing'];
const PUBLIC_POST_STATUSES = ['published', 'published-edition'];

export async function getProfileClaimMatch(user) {
  const email = requireEmail(user);
  const account = await getAccountProfile(email);
  const fullName = buildFullName(account?.firstName, account?.lastName);
  const [managedProfile, ownClaims] = await Promise.all([
    findManagedProfileByName(fullName),
    listClaimsForEmail(email),
  ]);
  const activeClaim = ownClaims.find((item) => ACTIVE_STATUSES.includes(item.status)) || null;
  const latestClaim = activeClaim || ownClaims[0] || null;

  return {
    candidate: managedProfile ? await toCandidate(managedProfile) : null,
    claim: latestClaim ? toUserClaim(latestClaim) : null,
    nameLocked: Boolean(activeClaim),
  };
}

export async function createProfileClaim(user, body = {}) {
  const email = requireEmail(user);
  const account = await getAccountProfile(email);
  const fullName = buildFullName(account?.firstName, account?.lastName);
  if (!fullName) throw new HttpError(400, 'Completa nombre y apellido antes de solicitar la vinculacion');

  const requestedProfileId = normalizeId(body.managedProfileId);
  const managedProfile = requestedProfileId
    ? await getManagedProfile(requestedProfileId)
    : await findManagedProfileByName(fullName);
  if (!managedProfile || identityNameKey(managedProfile.fullName) !== identityNameKey(fullName)) {
    throw new HttpError(409, 'El perfil gestionado ya no coincide con tu nombre');
  }

  const existing = await listClaimsForEmail(email);
  const duplicate = existing.find((item) => item.managedProfileId === managedProfile.id && ACTIVE_STATUSES.includes(item.status));
  if (duplicate) return toUserClaim(duplicate);
  const blocked = existing.find((item) => item.managedProfileId === managedProfile.id && item.status === 'blocked');
  if (blocked) throw new HttpError(403, 'Esta solicitud esta bloqueada. Contacta a un administrador');

  const ref = claims().doc();
  const postCount = await countMatchingPosts(managedProfile.fullName);
  const claim = {
    managedProfileId: managedProfile.id,
    requesterEmail: email,
    requesterName: user?.name || email,
    fullName: managedProfile.fullName,
    identityKey: identityNameKey(managedProfile.fullName),
    status: 'pending',
    affectedPostCount: postCount,
    managedProfileSnapshot: managedProfileSnapshot(managedProfile),
    requestedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await ref.set(claim);
  const created = serializeDoc(await ref.get());
  await auditClaim(email, 'profileClaim.request', created, null, created);
  await safeNotify(() => notifyProfileClaimRequested(created, user));
  return toUserClaim(created);
}

export async function listMyProfileClaims(user) {
  const items = await listClaimsForEmail(requireEmail(user));
  return { items: items.map(toUserClaim) };
}

export async function withdrawProfileClaim(id, user) {
  const email = requireEmail(user);
  const claim = await getClaim(id);
  if (claim.requesterEmail !== email) throw new HttpError(404, 'Solicitud no encontrada');
  if (claim.status !== 'pending') throw new HttpError(409, 'Solo se puede cancelar una solicitud pendiente');
  const after = await updateClaim(claim.id, {
    status: 'withdrawn',
    withdrawnAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await auditClaim(email, 'profileClaim.withdraw', claim, claim, after);
  return toUserClaim(after);
}

export async function listManagedProfileClaims() {
  const snapshot = await claims().get();
  const items = snapshot.docs
    .map(serializeDoc)
    .sort((a, b) => timestampValue(b.updatedAt || b.createdAt) - timestampValue(a.updatedAt || a.createdAt))
    .map(toAdminClaim);
  return {
    items,
    pendingCount: items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length,
  };
}

export async function approveProfileClaim(id, adminUser) {
  const actorEmail = requireEmail(adminUser);
  let claim = await getClaim(id);
  if (claim.status === 'approved') return toAdminClaim(claim);
  if (!ACTIVE_STATUSES.includes(claim.status)) throw new HttpError(409, 'La solicitud no se puede aprobar en su estado actual');

  const managedProfile = await getManagedProfile(claim.managedProfileId);
  if (!managedProfile) {
    const unavailable = await updateClaim(claim.id, {
      status: 'superseded',
      reviewedAt: serverTimestamp(),
      reviewedBy: actorEmail,
      updatedAt: serverTimestamp(),
    });
    await safeNotify(() => notifyProfileClaimSuperseded(unavailable, adminUser));
    throw new HttpError(409, 'El perfil gestionado ya no esta disponible');
  }

  const account = await getAccountProfile(claim.requesterEmail);
  const accountName = buildFullName(account?.firstName, account?.lastName);
  if (identityNameKey(accountName) !== identityNameKey(managedProfile.fullName)) {
    throw new HttpError(409, 'El nombre actual del solicitante ya no coincide con el perfil');
  }
  await db().runTransaction(async (transaction) => {
    const claimRef = claims().doc(claim.id);
    const profileRef = profiles().doc(managedProfile.id);
    const [claimDoc, profileDoc] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(profileRef),
    ]);
    if (!claimDoc.exists || !profileDoc.exists) throw new HttpError(409, 'La solicitud ya no esta disponible');
    const currentClaim = serializeDoc(claimDoc);
    const currentProfile = serializeDoc(profileDoc);
    if (currentClaim.status === 'approved') return;
    if (!ACTIVE_STATUSES.includes(currentClaim.status)) throw new HttpError(409, 'La solicitud no se puede aprobar en su estado actual');
    if (currentProfile.activeClaimId && currentProfile.activeClaimId !== claim.id) {
      throw new HttpError(409, 'Otra solicitud esta procesando este perfil');
    }
    transaction.set(claimRef, {
      status: 'processing',
      processingStartedAt: currentClaim.processingStartedAt || serverTimestamp(),
      reviewedBy: actorEmail,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(profileRef, {
      activeClaimId: claim.id,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
  claim = serializeDoc(await claims().doc(claim.id).get());

  const transferredPostCount = await transferPostOwnership({
    claim,
    managedProfile,
    actorEmail,
  });
  const assignment = await grantBlogRoleForProfileClaim(claim.requesterEmail, actorEmail, claim.id);

  const accountRef = profiles().doc(profileId(claim.requesterEmail));
  const managedClean = sanitizeProfile(managedProfile);
  await accountRef.set({
    ...managedClean,
    email: claim.requesterEmail,
    managedAuthor: false,
    fullName: managedProfile.fullName,
    authorSlug: managedProfile.authorSlug,
    publicProfileEnabled: managedClean.publicProfileEnabled,
    publicProfilePreferenceSet: true,
    ownershipClaimId: claim.id,
    claimedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    ...(account?.createdAt ? {} : { createdAt: serverTimestamp(), createdBy: claim.requesterEmail }),
  }, { merge: true });

  const after = await db().runTransaction(async (transaction) => {
    const [claimDoc, managedDoc] = await Promise.all([
      transaction.get(claims().doc(claim.id)),
      transaction.get(profiles().doc(managedProfile.id)),
    ]);
    if (!claimDoc.exists) throw new HttpError(404, 'Solicitud no encontrada');
    if (!managedDoc.exists) {
      const current = serializeDoc(claimDoc);
      if (current.status === 'approved') return current;
      throw new HttpError(409, 'El perfil gestionado ya no esta disponible');
    }
    transaction.set(claims().doc(claim.id), {
      status: 'approved',
      approvedAt: serverTimestamp(),
      reviewedAt: serverTimestamp(),
      reviewedBy: actorEmail,
      updatedAt: serverTimestamp(),
      transferredPostCount,
      grantedRoles: assignment.roles,
      managedProfileSnapshot: managedProfileSnapshot(managedProfile),
    }, { merge: true });
    transaction.delete(profiles().doc(managedProfile.id));
    return { ...serializeDoc(claimDoc), status: 'approved', transferredPostCount, grantedRoles: assignment.roles };
  });

  const otherSnapshot = await claims().where('managedProfileId', '==', managedProfile.id).get();
  const superseded = otherSnapshot.docs
    .map(serializeDoc)
    .filter((item) => item.id !== claim.id && ACTIVE_STATUSES.includes(item.status));
  await Promise.all(superseded.map(async (item) => {
    const next = await updateClaim(item.id, {
      status: 'superseded',
      reviewedAt: serverTimestamp(),
      reviewedBy: actorEmail,
      updatedAt: serverTimestamp(),
    });
    await safeNotify(() => notifyProfileClaimSuperseded(next, adminUser));
  }));

  clearRoleCache(claim.requesterEmail);
  const approved = await getClaim(claim.id);
  await auditClaim(actorEmail, 'profileClaim.approve', approved, claim, approved);
  await safeNotify(() => notifyProfileClaimApproved(approved, adminUser));
  return toAdminClaim(approved || after);
}

export async function blockProfileClaim(id, adminUser, body = {}) {
  const actorEmail = requireEmail(adminUser);
  const claim = await getClaim(id);
  if (claim.status !== 'pending') throw new HttpError(409, 'Solo se puede bloquear una solicitud pendiente');
  const after = await updateClaim(claim.id, {
    status: 'blocked',
    blockReason: normalizeText(body.reason).slice(0, 300),
    blockedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedBy: actorEmail,
    updatedAt: serverTimestamp(),
  });
  await profiles().doc(claim.managedProfileId).set({ activeClaimId: null }, { merge: true }).catch(() => {});
  await auditClaim(actorEmail, 'profileClaim.block', after, claim, after);
  await safeNotify(() => notifyProfileClaimBlocked(after, adminUser));
  return toAdminClaim(after);
}

export async function releaseProfileClaim(id, adminUser) {
  const actorEmail = requireEmail(adminUser);
  const claim = await getClaim(id);
  if (claim.status !== 'blocked') throw new HttpError(409, 'Solo se puede desbloquear una solicitud bloqueada');
  const after = await updateClaim(claim.id, {
    status: 'released',
    releasedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedBy: actorEmail,
    updatedAt: serverTimestamp(),
  });
  await auditClaim(actorEmail, 'profileClaim.release', after, claim, after);
  await safeNotify(() => notifyProfileClaimReleased(after, adminUser));
  return toAdminClaim(after);
}

async function transferPostOwnership({ claim, managedProfile, actorEmail }) {
  const snapshot = await posts().get();
  const matching = snapshot.docs
    .map(serializeDoc)
    .filter((post) => post && !post.deletedAt && identityNameKey(post.authorName) === claim.identityKey);
  const claimedAt = serverTimestamp();
  for (let index = 0; index < matching.length; index += 50) {
    const chunk = matching.slice(index, index + 50);
    await Promise.all(chunk.map((post) => posts().doc(post.id).set({
      authorEmail: claim.requesterEmail,
      ...(PUBLIC_POST_STATUSES.includes(post.status) || post.publicAuthorEmail
        ? { publicAuthorEmail: claim.requesterEmail }
        : {}),
      ownershipClaimId: claim.id,
      claimedAt,
      claimedBy: actorEmail,
      updatedAt: serverTimestamp(),
    }, { merge: true })));
  }
  return matching.length;
}

async function findManagedProfileByName(fullName = '') {
  const key = identityNameKey(fullName);
  if (!key) return null;
  const snapshot = await profiles().get();
  const matches = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item?.managedAuthor === true && identityNameKey(profileFullName(item)) === key);
  return matches[0] ? { ...matches[0], fullName: profileFullName(matches[0]) } : null;
}

async function getManagedProfile(id = '') {
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  const doc = await profiles().doc(cleanId).get();
  if (!doc.exists) return null;
  const item = serializeDoc(doc);
  return item?.managedAuthor === true ? { ...item, fullName: profileFullName(item) } : null;
}

async function getAccountProfile(email = '') {
  const doc = await profiles().doc(profileId(email)).get();
  return doc.exists ? serializeDoc(doc) : null;
}

async function listClaimsForEmail(email = '') {
  const snapshot = await claims().where('requesterEmail', '==', normalizeEmail(email)).get();
  return snapshot.docs
    .map(serializeDoc)
    .sort((a, b) => timestampValue(b.updatedAt || b.createdAt) - timestampValue(a.updatedAt || a.createdAt));
}

async function countMatchingPosts(fullName = '') {
  const key = identityNameKey(fullName);
  const snapshot = await posts().get();
  return snapshot.docs
    .map(serializeDoc)
    .filter((post) => post && !post.deletedAt && identityNameKey(post.authorName) === key)
    .length;
}

async function toCandidate(profile) {
  const clean = sanitizeProfile(profile);
  const isPublic = clean.publicProfileEnabled === true;
  return {
    id: profile.id,
    fullName: profile.fullName,
    postCount: await countMatchingPosts(profile.fullName),
    ...(isPublic ? {
      description: clean.description,
      focusArea: clean.focusArea,
      photoUrl: clean.photoUrl,
    } : {}),
  };
}

function toUserClaim(item) {
  return {
    id: item.id,
    managedProfileId: item.managedProfileId,
    fullName: item.fullName,
    status: item.status,
    affectedPostCount: Number(item.affectedPostCount ?? item.transferredPostCount) || 0,
    blockReason: item.blockReason || '',
    requestedAt: item.requestedAt || item.createdAt || '',
    updatedAt: item.updatedAt || '',
    approvedAt: item.approvedAt || '',
  };
}

function toAdminClaim(item) {
  return {
    ...toUserClaim(item),
    requesterEmail: item.requesterEmail,
    requesterName: item.requesterName || item.requesterEmail,
    reviewedAt: item.reviewedAt || '',
    reviewedBy: item.reviewedBy || '',
    transferredPostCount: Number(item.transferredPostCount) || 0,
  };
}

function managedProfileSnapshot(profile) {
  return {
    id: profile.id,
    ...sanitizeProfile(profile),
    fullName: profile.fullName,
    authorSlug: profile.authorSlug || '',
    managedAuthor: true,
  };
}

async function getClaim(id = '') {
  const cleanId = normalizeId(id);
  if (!cleanId) throw new HttpError(400, 'claim id is required');
  const doc = await claims().doc(cleanId).get();
  if (!doc.exists) throw new HttpError(404, 'Solicitud no encontrada');
  return serializeDoc(doc);
}

async function updateClaim(id, patch) {
  const ref = claims().doc(id);
  await ref.set(patch, { merge: true });
  return serializeDoc(await ref.get());
}

async function auditClaim(actorEmail, action, claim, before, after) {
  await writeAuditLog({
    actorEmail,
    action,
    resourceType: 'profileClaim',
    resourceId: claim.id,
    before,
    after,
  });
}

function requireEmail(user) {
  const email = normalizeEmail(user?.email);
  if (!email) throw new HttpError(401, 'Missing user email');
  return email;
}

function profileFullName(profile = {}) {
  return buildFullName(profile.firstName, profile.lastName) || normalizeText(profile.fullName);
}

function profileId(email = '') {
  return normalizeEmail(email).replaceAll('/', '_');
}

function normalizeId(value = '') {
  return typeof value === 'string' ? value.trim().replaceAll('/', '_') : '';
}

function normalizeText(value = '') {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return value instanceof Date ? value.getTime() : 0;
}
