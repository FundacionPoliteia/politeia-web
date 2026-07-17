import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';
import { config } from './config.js';

let firestore;
let firestoreOverride = false;

export function db() {
  if (!firestore) {
    firestore = new Firestore(config.gcpProjectId ? { projectId: config.gcpProjectId } : {});
  }
  return firestore;
}

export function setFirestoreForTests(instance) {
  firestore = instance;
  firestoreOverride = Boolean(instance);
}

export function hasFirestoreTestOverride() {
  return firestoreOverride;
}

export const serverTimestamp = FieldValue.serverTimestamp;
export { Timestamp };

export function serializeDoc(doc) {
  if (!doc.exists) return null;
  return serializeData({ id: doc.id, ...doc.data() });
}

export function serializeData(value) {
  if (Array.isArray(value)) return value.map(serializeData);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeData(item)])
    );
  }
  return value;
}
