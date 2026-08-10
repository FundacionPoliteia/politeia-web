import { db, serverTimestamp } from '../firestore.js';

export async function writeAuditLog({ actorEmail, action, resourceType, resourceId, before, after }) {
  await db().collection('auditLogs').add({
    actorEmail,
    action,
    resourceType,
    resourceId,
    before: sanitizeAuditValue(before),
    after: sanitizeAuditValue(after),
    createdAt: serverTimestamp(),
  });
}

export function sanitizeAuditValue(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeAuditValue(item));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeAuditValue(item)]));
  }
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
