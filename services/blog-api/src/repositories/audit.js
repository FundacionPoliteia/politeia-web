import { db, serverTimestamp } from '../firestore.js';

export async function writeAuditLog({ actorEmail, action, resourceType, resourceId, before, after }) {
  await db().collection('auditLogs').add({
    actorEmail,
    action,
    resourceType,
    resourceId,
    before: before || null,
    after: after || null,
    createdAt: serverTimestamp(),
  });
}
