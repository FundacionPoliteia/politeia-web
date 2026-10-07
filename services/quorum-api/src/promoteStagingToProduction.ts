import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth, type AuthClient } from 'google-auth-library';
import { collections, type CollectionKey } from './store.js';
import { copyStorageObject, listStorageObjects, type PlannedStorageCopy } from './storagePromotionClient.js';
import {
  equivalentStorageObject, hasStagingPromotionReferences, planCollectionPromotion, preparePromotionRecord,
  stagingPromotionCollections, type PromotionLocations,
} from './stagingPromotion.js';

const projectId = 'politeia-quorum';
const sourceDatabaseId = 'quorum-staging';
const targetDatabaseId = 'quorum-production';
const sourceDocumentsBucket = `${projectId}-quorum-staging-documents`;
const targetDocumentsBucket = `${projectId}-quorum-production-documents`;
const sourceSnapshotsBucket = `${projectId}-quorum-staging-source-snapshots`;
const targetSnapshotsBucket = `${projectId}-quorum-production-source-snapshots`;
const locations: PromotionLocations = {
  sourceApiBase: 'https://staging.quorum.politeia.ar/api/quorum',
  productionApiBase: 'https://quorum.politeia.ar/api/quorum',
  sourceDocumentsBucket,
  productionDocumentsBucket: targetDocumentsBucket,
  sourceSnapshotsBucket,
  productionSnapshotsBucket: targetSnapshotsBucket,
};

type DocumentMap = Map<string, unknown>;
type CollectionMaps = Map<CollectionKey, DocumentMap>;

async function readCollection(db: Firestore, key: CollectionKey): Promise<DocumentMap> {
  const snapshot = await db.collection(collections[key]).get();
  return new Map(snapshot.docs.map((document) => [document.id, document.data()]));
}

async function readCollections(db: Firestore, keys: CollectionKey[]): Promise<CollectionMaps> {
  const rows = await Promise.all(keys.map(async (key) => [key, await readCollection(db, key)] as const));
  return new Map(rows);
}

function planCollections(source: CollectionMaps, target: CollectionMaps) {
  return stagingPromotionCollections.map((key) => {
    const sourceRows = source.get(key) || new Map();
    const targetRows = target.get(key) || new Map();
    const plan = planCollectionPromotion(sourceRows, targetRows, (_id, value) => preparePromotionRecord(key, value, locations));
    return { key, sourceRows, targetRows, ...plan };
  });
}

function parseMode(args: string[]) {
  const valid = new Set(['--dry-run', '--apply', '--confirm-production=quorum-production']);
  const unknown = args.filter((arg) => !valid.has(arg));
  if (unknown.length) throw new Error(`Argumentos no reconocidos: ${unknown.join(', ')}`);
  if (args.includes('--dry-run') && args.includes('--apply')) throw new Error('Elegí --dry-run o --apply, no ambos.');
  const apply = args.includes('--apply');
  if (apply && !args.includes('--confirm-production=quorum-production')) {
    throw new Error('La escritura requiere --confirm-production=quorum-production.');
  }
  if (!apply && args.includes('--confirm-production=quorum-production')) throw new Error('La confirmación sólo se admite junto con --apply.');
  return apply ? 'apply' as const : 'dry-run' as const;
}

async function planBucketCopy(storageClient: Pick<AuthClient, 'request'>, sourceBucketName: string, targetBucketName: string) {
  const [sourceFiles, targetFiles] = await Promise.all([
    listStorageObjects(storageClient, sourceBucketName),
    listStorageObjects(storageClient, targetBucketName),
  ]);
  const sourceByName = new Map(sourceFiles.map((file) => [file.name, file]));
  const targetByName = new Map(targetFiles.map((file) => [file.name, file]));
  const copies: PlannedStorageCopy[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];

  for (const objectName of targetByName.keys()) {
    if (!sourceByName.has(objectName)) conflicts.push(`${targetBucketName}/${objectName}: objeto extra en producción`);
  }

  for (const [objectName, sourceFile] of sourceByName) {
    const existingTarget = targetByName.get(objectName);
    if (!existingTarget) {
      copies.push({ objectName, sourceBucketName, targetBucketName, sourceGeneration: sourceFile.generation });
      continue;
    }
    if (equivalentStorageObject(sourceFile, existingTarget)) unchanged.push(objectName);
    else conflicts.push(`${targetBucketName}/${objectName}: el objeto ya existe distinto en producción`);
  }

  return { sourceBucketName, targetBucketName, sourceCount: sourceFiles.length, targetCount: targetFiles.length, copies, unchanged, conflicts };
}

function logRoleAssignments(rows: Map<string, unknown> | undefined) {
  console.log('Roles heredados (email · roles · estado):');
  const assignments: Array<{ id: string; email?: unknown; roles?: unknown; active?: unknown }> = [...(rows || new Map()).entries()]
    .map(([id, value]) => {
      const record = value as Record<string, unknown>;
      return { id, email: record.email, roles: record.roles, active: record.active };
    })
    .sort((left, right) => String(left.email || left.id).localeCompare(String(right.email || right.id)));
  if (!assignments.length) console.log('- No hay asignaciones explícitas; se mantienen los administradores iniciales configurados en la API.');
  for (const item of assignments) {
    const roles = Array.isArray(item.roles) ? item.roles.join(', ') : '';
    console.log(`- ${String(item.email || item.id)} · ${roles} · ${item.active === false ? 'inactivo' : 'activo'}`);
  }
}

function summarizeConflicts(conflicts: string[]) {
  console.error(`La promoción se detiene; no se escribirá nada. Conflictos: ${conflicts.length}`);
  conflicts.slice(0, 50).forEach((conflict) => console.error(`- ${conflict}`));
  if (conflicts.length > 50) console.error(`… y ${conflicts.length - 50} más; corregí los conflictos y volvé a simular.`);
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const source = new Firestore({ projectId, databaseId: sourceDatabaseId });
  const target = new Firestore({ projectId, databaseId: targetDatabaseId });
  const googleAuth = new GoogleAuth({ projectId, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const storageClient = await googleAuth.getClient();

  const [sourceContent, targetContent] = await Promise.all([
    readCollections(source, stagingPromotionCollections),
    readCollections(target, stagingPromotionCollections),
  ]);
  if (!sourceContent.get('settings')?.has('public')) throw new Error('Falta la configuración editorial "public" en quorum-staging.');

  const recordPlans = planCollections(sourceContent, targetContent);
  const unmappedReferences = recordPlans.flatMap((plan) => plan.toWrite.flatMap((record) => hasStagingPromotionReferences(record.value, locations) ? [`${plan.key}/${record.id}: quedó una referencia de staging sin reescribir`] : []));
  const [documents, snapshots] = await Promise.all([
    planBucketCopy(storageClient, sourceDocumentsBucket, targetDocumentsBucket),
    planBucketCopy(storageClient, sourceSnapshotsBucket, targetSnapshotsBucket),
  ]);
  const conflicts = [
    ...recordPlans.flatMap((plan) => plan.conflicts.map((conflict) => `${plan.key}/${conflict}`)),
    ...documents.conflicts,
    ...snapshots.conflicts,
    ...unmappedReferences,
  ];

  console.log(`Modo: ${mode === 'apply' ? 'APLICAR' : 'simulación (sin escrituras)'}`);
  console.log(`Proyecto: ${projectId} · origen: ${sourceDatabaseId} · destino: ${targetDatabaseId}`);
  console.log(`Colecciones persistentes: ${stagingPromotionCollections.length}; excluida deliberadamente: mailJobs`);
  console.log('Colección                 Staging  Producción  Nuevos  Iguales');
  for (const plan of recordPlans) {
    console.log(`${plan.key.padEnd(25)} ${String(plan.sourceRows.size).padStart(7)} ${String(plan.targetRows.size).padStart(11)} ${String(plan.toWrite.length).padStart(7)} ${String(plan.unchanged.length).padStart(8)}`);
  }
  for (const bucket of [documents, snapshots]) {
    console.log(`${bucket.sourceBucketName} → ${bucket.targetBucketName}: origen ${bucket.sourceCount}; destino ${bucket.targetCount}; por copiar ${bucket.copies.length}; iguales ${bucket.unchanged.length}`);
  }
  logRoleAssignments(sourceContent.get('roles'));
  if (conflicts.length) {
    summarizeConflicts(conflicts);
    process.exitCode = 1;
    return;
  }

  if (mode === 'dry-run') {
    console.log('Simulación aprobable. Para escribir, volver a ejecutar explícitamente con --apply --confirm-production=quorum-production.');
    return;
  }

  // Copy each object only if the destination name is still absent. If a run stops midway, rerun after a new dry-run.
  for (const bucket of [documents, snapshots]) {
    for (const item of bucket.copies) {
      await copyStorageObject(storageClient, item);
    }
  }
  // Create-only Firestore writes preserve any production data if the plan became stale after review.
  for (const plan of recordPlans) {
    for (const document of plan.toWrite) {
      const value = preparePromotionRecord(plan.key, document.value, locations);
      await target.collection(collections[plan.key]).doc(document.id).create(value as Record<string, unknown>);
    }
  }

  const [verifiedCollections, verifiedDocuments, verifiedSnapshots] = await Promise.all([
    readCollections(target, stagingPromotionCollections),
    planBucketCopy(storageClient, sourceDocumentsBucket, targetDocumentsBucket),
    planBucketCopy(storageClient, sourceSnapshotsBucket, targetSnapshotsBucket),
  ]);
  const verification = planCollections(sourceContent, verifiedCollections);
  const verificationConflicts = verification.flatMap((plan) => plan.conflicts.map((conflict) => `${plan.key}/${conflict}`));
  for (const bucket of [verifiedDocuments, verifiedSnapshots]) {
    if (bucket.copies.length) verificationConflicts.push(`${bucket.targetBucketName}: quedan ${bucket.copies.length} objetos sin verificar`);
    verificationConflicts.push(...bucket.conflicts);
  }
  if (verificationConflicts.length) throw new Error(`La copia terminó pero la verificación detectó diferencias: ${verificationConflicts.slice(0, 50).join('; ')}`);
  console.log('Promoción completa y verificada. Staging no fue modificado; la cola mailJobs no se copió.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
