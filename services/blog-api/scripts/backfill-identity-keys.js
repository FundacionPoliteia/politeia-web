import { db } from '../src/firestore.js';
import { buildFullName, identityNameKey } from '../src/repositories/profiles.js';

const applyChanges = process.argv.includes('--apply');
const database = db();

const [profileSnapshot, postSnapshot] = await Promise.all([
  database.collection('userProfiles').get(),
  database.collection('posts').get(),
]);

const profileUpdates = profileSnapshot.docs
  .map((doc) => ({ ref: doc.ref, data: doc.data() }))
  .map((item) => ({
    ...item,
    key: identityNameKey(
      item.data.fullName || buildFullName(item.data.firstName, item.data.lastName),
    ),
  }))
  .filter((item) => item.key && item.data.identityNameKey !== item.key);

const postUpdates = postSnapshot.docs
  .map((doc) => ({ ref: doc.ref, data: doc.data() }))
  .map((item) => ({
    ...item,
    key: identityNameKey(item.data.authorName),
  }))
  .filter((item) => item.key && item.data.authorIdentityNameKey !== item.key);

console.log(JSON.stringify({
  mode: applyChanges ? 'apply' : 'dry-run',
  profilesScanned: profileSnapshot.size,
  profilesToUpdate: profileUpdates.length,
  postsScanned: postSnapshot.size,
  postsToUpdate: postUpdates.length,
}));

if (!applyChanges) {
  console.log('No se escribieron cambios. Ejecuta nuevamente con --apply para aplicar el backfill.');
  process.exit(0);
}

const updates = [
  ...profileUpdates.map((item) => ({ ref: item.ref, patch: { identityNameKey: item.key } })),
  ...postUpdates.map((item) => ({ ref: item.ref, patch: { authorIdentityNameKey: item.key } })),
];

for (let index = 0; index < updates.length; index += 400) {
  const batch = database.batch();
  updates.slice(index, index + 400).forEach(({ ref, patch }) => {
    batch.set(ref, patch, { merge: true });
  });
  await batch.commit();
}

console.log(JSON.stringify({ updated: updates.length }));
