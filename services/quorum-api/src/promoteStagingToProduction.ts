import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { collections, type CollectionKey } from './store.js';
import {
  equivalentStorageObject, planCollectionPromotion, preparePromotionRecord,
  referencedUploadIds, stagingPromotionCollections,
} from './stagingPromotion.js';

const projectId = 'politeia-quorum';
const sourceDatabaseId = 'quorum-staging';
const targetDatabaseId = 'quorum-production';
const sourceDocumentsBucket = `${projectId}-quorum-staging-documents`;
const targetDocumentsBucket = `${projectId}-quorum-production-documents`;
const sourceApiBase = 'https://staging.quorum.politeia.ar/api/quorum';
const targetApiBase = 'https://quorum.politeia.ar/api/quorum';

type DocumentMap = Map<string, unknown>;
type CollectionMaps = Map<CollectionKey, DocumentMap>;
type UploadRecord = { objectName?: unknown };

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
    const plan = planCollectionPromotion(sourceRows, targetRows, (_id, value) => preparePromotionRecord(key, value, sourceApiBase, targetApiBase));
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

async function inspectUploads(source: Firestore, target: Firestore, sourceFiles: Storage, targetFiles: Storage, sourceContent: CollectionMaps, targetContent: CollectionMaps) {
  const sourceUploads = await readCollection(source, 'uploads');
  const targetUploads = await readCollection(target, 'uploads');
  const references = referencedUploadIds(stagingPromotionCollections.flatMap((key) => [...(sourceContent.get(key)?.values() || [])]));
  const missingRecords = [...references].filter((id) => !sourceUploads.has(id));
  const selected = new Map<string, unknown>();
  const conflicts: string[] = missingRecords.map((id) => `${id}: el contenido referencia un medio sin registro`);
  const missingFiles: Array<{ id: string; objectName: string }> = [];
  const equivalentFiles: string[] = [];

  for (const id of references) {
    const value = sourceUploads.get(id) as UploadRecord | undefined;
    if (!value) continue;
    const objectName = typeof value.objectName === 'string' ? value.objectName : '';
    if (!objectName || objectName.startsWith('/') || objectName.split('/').includes('..')) {
      conflicts.push(`${id}: ruta de archivo inválida`);
      continue;
    }
    selected.set(id, value);
    const [sourceMetadata] = await sourceFiles.bucket(sourceDocumentsBucket).file(objectName).getMetadata().catch(() => [null]);
    if (!sourceMetadata) {
      conflicts.push(`${id}: falta el archivo ${objectName} en el bucket de staging`);
      continue;
    }
    const destination = targetFiles.bucket(targetDocumentsBucket).file(objectName);
    const [exists] = await destination.exists();
    if (!exists) {
      missingFiles.push({ id, objectName });
      continue;
    }
    const [targetMetadata] = await destination.getMetadata();
    if (!equivalentStorageObject(sourceMetadata as Record<string, unknown>, targetMetadata as Record<string, unknown>)) {
      conflicts.push(`${id}: el archivo ${objectName} ya existe distinto en producción`);
    } else {
      equivalentFiles.push(id);
    }
  }

  const targetUploadSubset = new Map([...targetUploads].filter(([id]) => references.has(id)));
  const uploadPlan = planCollectionPromotion(selected, targetUploadSubset, (_id, value) => value);
  const extraTargetUploads = [...targetUploads.keys()].filter((id) => !references.has(id));
  for (const id of extraTargetUploads) conflicts.push(`${id}: registro de archivo extra en producción`);
  conflicts.push(...uploadPlan.conflicts.map((conflict) => `uploads/${conflict}`));

  return { references, selected, uploadPlan, missingFiles, equivalentFiles, conflicts };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const source = new Firestore({ projectId, databaseId: sourceDatabaseId });
  const target = new Firestore({ projectId, databaseId: targetDatabaseId });
  const storage = new Storage({ projectId });

  const [sourceContent, targetContent] = await Promise.all([
    readCollections(source, stagingPromotionCollections),
    readCollections(target, stagingPromotionCollections),
  ]);
  if (!sourceContent.get('settings')?.has('public')) throw new Error('Falta la configuración editorial "public" en quorum-staging.');

  const recordPlans = planCollections(sourceContent, targetContent);
  const uploads = await inspectUploads(source, target, storage, storage, sourceContent, targetContent);
  const conflicts = [...recordPlans.flatMap((plan) => plan.conflicts.map((conflict) => `${plan.key}/${conflict}`)), ...uploads.conflicts];

  console.log(`Modo: ${mode === 'apply' ? 'APLICAR' : 'simulación (sin escrituras)'}`);
  console.log(`Proyecto: ${projectId} · origen: ${sourceDatabaseId} · destino: ${targetDatabaseId}`);
  console.log('Colección                 Staging  Producción  Nuevos  Iguales');
  for (const plan of recordPlans) {
    console.log(`${plan.key.padEnd(25)} ${String(plan.sourceRows.size).padStart(7)} ${String(plan.targetRows.size).padStart(11)} ${String(plan.toWrite.length).padStart(7)} ${String(plan.unchanged.length).padStart(8)}`);
  }
  console.log(`Medios referenciados: ${uploads.references.size}; archivos por copiar: ${uploads.missingFiles.length}; ya coinciden: ${uploads.equivalentFiles.length}`);
  if (conflicts.length) {
    console.error('La promoción se detiene; no se escribirá nada. Conflictos detectados:');
    conflicts.forEach((conflict) => console.error(`- ${conflict}`));
    process.exitCode = 1;
    return;
  }

  if (mode === 'dry-run') {
    console.log('Simulación aprobable. Para escribir, volver a ejecutar explícitamente con --apply --confirm-production=quorum-production.');
    return;
  }

  // Files first: after Firestore records are written, every migrated media URL is already live.
  for (const file of uploads.missingFiles) {
    await storage.bucket(sourceDocumentsBucket).file(file.objectName).copy(storage.bucket(targetDocumentsBucket).file(file.objectName));
  }
  for (const plan of recordPlans) {
    for (const document of plan.toWrite) {
      const value = preparePromotionRecord(plan.key, document.value, sourceApiBase, targetApiBase);
      await target.collection(collections[plan.key]).doc(document.id).create(value as Record<string, unknown>);
    }
  }
  for (const document of uploads.uploadPlan.toWrite) {
    await target.collection(collections.uploads).doc(document.id).create(document.value as Record<string, unknown>);
  }

  const [verified] = await Promise.all([readCollections(target, stagingPromotionCollections)]);
  const verification = planCollections(sourceContent, verified);
  const verificationConflicts = verification.flatMap((plan) => plan.conflicts.map((conflict) => `${plan.key}/${conflict}`));
  const verificationUploads = await readCollection(target, 'uploads');
  for (const id of uploads.references) if (!verificationUploads.has(id)) verificationConflicts.push(`uploads/${id}: no se verificó`);
  if (verificationConflicts.length) throw new Error(`La copia terminó pero la verificación detectó diferencias: ${verificationConflicts.join('; ')}`);
  console.log('Promoción completada y verificada. Staging no fue modificado.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
