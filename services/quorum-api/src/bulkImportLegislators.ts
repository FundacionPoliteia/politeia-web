import { config } from './config.js';
import { bulkImportAllExternalLegislators } from './integrations/legislatorImport.js';
import { syncHcdnLegislators, syncSenateLegislators } from './integrations/sync.js';

async function main() {
  if (!process.argv.includes('--confirm')) throw new Error('La carga requiere --confirm');
  if (config.dataStore !== 'firestore') throw new Error('La carga persistente requiere DATA_STORE=firestore');
  if (config.firestoreDatabaseId !== 'quorum-staging') throw new Error('La carga inicial sólo está habilitada para quorum-staging');
  if (!config.congressImportEnabled || !config.hcdnImportEnabled || !config.senateImportEnabled || config.congressImportMode === 'shadow') {
    throw new Error('Las integraciones de Diputados y Senado deben estar habilitadas en modo assisted');
  }
  if (!config.sourceSnapshotsBucket) throw new Error('Falta SOURCE_SNAPSHOTS_BUCKET');
  const actorEmail = (process.env.IMPORT_ACTOR_EMAIL || config.devAuthEmail).toLowerCase();
  const deputies = await syncHcdnLegislators(actorEmail);
  const senators = await syncSenateLegislators(actorEmail);
  const result = await bulkImportAllExternalLegislators({ snapshots: [
    { sourceId: 'hcdn-legislators', snapshotId: deputies.snapshot.id },
    { sourceId: 'senate-legislators', snapshotId: senators.snapshot.id },
  ] }, actorEmail);
  console.info(JSON.stringify({ environment: config.firestoreDatabaseId, sync: [
    { source: 'hcdn-legislators', status: deputies.run.status, records: deputies.run.recordCount },
    { source: 'senate-legislators', status: senators.run.status, records: senators.run.recordCount },
  ], import: result }, null, 2));
  if (result.totals.failed) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
