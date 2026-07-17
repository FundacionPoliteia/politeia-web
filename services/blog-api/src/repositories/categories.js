import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { sanitizeCategory, taxonomyId, taxonomyKey } from '../utils/taxonomy.js';

const categories = () => db().collection('categories');

export async function listCategories() {
  const snapshot = await categories().orderBy('name', 'asc').get();
  const items = snapshot.docs
    .map(serializeDoc)
    .filter((category) => category && !category.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return { items };
}

export async function createCategory(name, actorEmail) {
  const cleanName = sanitizeCategory(name);
  const id = taxonomyId(cleanName);
  if (!cleanName || !id) throw new HttpError(400, 'category name is required');

  const ref = categories().doc(id);
  const beforeDoc = await ref.get();
  const before = beforeDoc.exists ? serializeDoc(beforeDoc) : null;

  if (before && !before.deletedAt) return before;

  const patch = {
    name: cleanName,
    key: taxonomyKey(cleanName),
    deletedAt: null,
    updatedAt: serverTimestamp(),
  };
  if (!before) patch.createdAt = serverTimestamp();

  await ref.set(patch, { merge: true });
  const after = serializeDoc(await ref.get());

  await writeAuditLog({
    actorEmail,
    action: before ? 'category.restore' : 'category.create',
    resourceType: 'category',
    resourceId: id,
    before,
    after,
  });

  return after;
}

export async function deleteCategory(id, actorEmail) {
  const ref = categories().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Category not found');

  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Category not found');

  await ref.update({
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail,
    action: 'category.delete',
    resourceType: 'category',
    resourceId: id,
    before,
    after,
  });

  return after;
}
