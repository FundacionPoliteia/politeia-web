import { assertRuntimeConfig, config } from './config.js';
import { newId, store, type CollectionKey } from './store.js';

assertRuntimeConfig();
if (config.dataStore !== 'firestore') throw new Error('La verificación persistente requiere DATA_STORE=firestore');

const keys = ['projects', 'publicProjects', 'legislators', 'glossary', 'workflows', 'catalogs', 'revisions', 'settings'] satisfies CollectionKey[];
const entries = await Promise.all(keys.map(async (key) => [key, (await store().list(key)).length] as const));
const counts = Object.fromEntries(entries);

if (!counts.settings || !counts.workflows || !counts.catalogs) {
  throw new Error('Firestore responde, pero faltan datos base. Ejecutá npm run quorum:seed');
}

const probeId = newId('persistence-probe');
try {
  await store().set('audits', probeId, { id: probeId, action: 'persistence_probe', createdAt: new Date().toISOString() });
  if (!await store().get('audits', probeId)) throw new Error('Firestore aceptó la escritura pero no devolvió el registro de prueba');
} finally {
  await store().delete('audits', probeId);
}

console.info(JSON.stringify({ ok: true, readWrite: true, project: config.gcpProjectId, database: config.firestoreDatabaseId, counts }, null, 2));
