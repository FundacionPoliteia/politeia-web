import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';

export const ASSIGNABLE_ROLES = ['admin', 'reviewer', 'blog', 'newsletter'];

const users = () => db().collection('users');

export async function listUserRoleAssignments() {
  const snapshot = await users().orderBy('updatedAt', 'desc').limit(200).get();
  const items = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item && !item.deletedAt)
    .map(toUserRoleAssignment)
    .sort((a, b) => a.email.localeCompare(b.email));

  return { items };
}

export async function resolveAssignedRoles(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return [];

  const doc = await users().doc(roleAssignmentId(cleanEmail)).get();
  if (!doc.exists) return [];

  const assignment = serializeDoc(doc);
  if (!assignment || assignment.deletedAt || assignment.active === false) return [];
  return sanitizeAssignedRoles(assignment.roles);
}

export async function upsertUserRoleAssignment(email, roles, actorEmail) {
  const cleanEmail = normalizeEmail(email);
  assertAllowedEmail(cleanEmail);
  assertPrimaryDomainActor(actorEmail);
  const cleanRoles = sanitizeAssignedRoles(roles);
  const ref = users().doc(roleAssignmentId(cleanEmail));
  const beforeDoc = await ref.get();
  const before = beforeDoc.exists ? serializeDoc(beforeDoc) : null;

  const patch = {
    email: cleanEmail,
    roles: cleanRoles,
    active: cleanRoles.length > 0,
    deletedAt: null,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };
  if (!before) {
    patch.createdAt = serverTimestamp();
    patch.createdBy = actorEmail;
  }

  await ref.set(patch, { merge: true });
  const after = toUserRoleAssignment(serializeDoc(await ref.get()));
  await writeAuditLog({
    actorEmail,
    action: before ? 'user.roles.update' : 'user.roles.create',
    resourceType: 'user',
    resourceId: cleanEmail,
    before,
    after,
  });

  return after;
}

export async function deleteUserRoleAssignment(email, actorEmail) {
  const cleanEmail = normalizeEmail(email);
  assertAllowedEmail(cleanEmail);
  assertPrimaryDomainActor(actorEmail);
  const ref = users().doc(roleAssignmentId(cleanEmail));
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'User role assignment not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'User role assignment not found');

  await ref.update({
    roles: [],
    active: false,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  });

  const after = toUserRoleAssignment(serializeDoc(await ref.get()));
  await writeAuditLog({
    actorEmail,
    action: 'user.roles.delete',
    resourceType: 'user',
    resourceId: cleanEmail,
    before,
    after,
  });

  return after;
}

export async function grantBlogRoleForProfileClaim(email, actorEmail, claimId) {
  const cleanEmail = normalizeEmail(email);
  assertAllowedEmail(cleanEmail);
  const ref = users().doc(roleAssignmentId(cleanEmail));
  const beforeDoc = await ref.get();
  const before = beforeDoc.exists ? serializeDoc(beforeDoc) : null;
  const roles = sanitizeAssignedRoles([...(before?.roles || []), 'blog']);

  await ref.set({
    email: cleanEmail,
    roles,
    active: true,
    deletedAt: null,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    profileClaimId: claimId,
    ...(before ? {} : {
      createdAt: serverTimestamp(),
      createdBy: actorEmail,
    }),
  }, { merge: true });

  const after = toUserRoleAssignment(serializeDoc(await ref.get()));
  if (!(before?.roles || []).includes('blog')) {
    await writeAuditLog({
      actorEmail,
      action: 'profileClaim.role.grant',
      resourceType: 'user',
      resourceId: cleanEmail,
      before,
      after: { ...after, profileClaimId: claimId },
    });
  }
  return after;
}

export function sanitizeAssignedRoles(value) {
  const source = Array.isArray(value) ? value : [];
  const roles = new Set(source.map((role) => String(role).trim().toLowerCase()));
  return ASSIGNABLE_ROLES.filter((role) => roles.has(role));
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isAllowedRoleEmail(email) {
  return isPrimaryDomainEmail(email) || isAllowedAssignedExternalEmail(email);
}

export function isPrimaryDomainEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const allowedDomain = normalizeEmail(config.allowedEmailDomain).replace(/^@/, '');
  if (!cleanEmail || !allowedDomain) return false;
  return cleanEmail.endsWith(`@${allowedDomain}`);
}

export function isAllowedAssignedExternalEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const domain = cleanEmail.split('@')[1] || '';
  return Boolean(cleanEmail) && config.allowedAssignedEmailDomains.includes(domain);
}

function assertAllowedEmail(email) {
  if (!isAllowedRoleEmail(email)) {
    const allowed = [config.allowedEmailDomain, ...config.allowedAssignedEmailDomains]
      .map((domain) => `@${domain}`)
      .join(' or ');
    throw new HttpError(400, `email must belong to ${allowed}`);
  }
}

function assertPrimaryDomainActor(actorEmail) {
  if (!isPrimaryDomainEmail(actorEmail)) {
    throw new HttpError(403, `Only @${config.allowedEmailDomain} admins can manage role assignments`);
  }
}

function roleAssignmentId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}

function toUserRoleAssignment(item) {
  return {
    ...item,
    email: normalizeEmail(item.email || item.id),
    roles: sanitizeAssignedRoles(item.roles),
    active: item.active !== false && !item.deletedAt,
  };
}
