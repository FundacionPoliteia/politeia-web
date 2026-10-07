import { collections, type CollectionKey } from './store.js';

/** Every persistent Quórum collection is promoted except the delivery queue, which must not resend staging mail. */
export const stagingPromotionExcludedCollections: CollectionKey[] = ['mailJobs'];
export const stagingPromotionCollections: CollectionKey[] = (Object.keys(collections) as CollectionKey[])
  .filter((collection) => !stagingPromotionExcludedCollections.includes(collection));

const publicAssetPath = /\/v1\/public\/(?:media|files)\/([^/?#\s"'<>]+)/g;

export interface PromotionLocations {
  sourceApiBase: string;
  productionApiBase: string;
  sourceDocumentsBucket: string;
  productionDocumentsBucket: string;
  sourceSnapshotsBucket: string;
  productionSnapshotsBucket: string;
}

export function rewriteStagingApiUrls<T>(value: T, sourceApiBase: string, productionApiBase: string): T {
  const source = sourceApiBase.replace(/\/$/, '');
  const target = productionApiBase.replace(/\/$/, '');
  return visit(value, (text) => text.split(source).join(target)) as T;
}

export function rewriteStagingStorageUris<T>(value: T, locations: Pick<PromotionLocations, 'sourceDocumentsBucket' | 'productionDocumentsBucket' | 'sourceSnapshotsBucket' | 'productionSnapshotsBucket'>): T {
  const replacements: Array<[string, string]> = [
    [`gs://${locations.sourceDocumentsBucket}/`, `gs://${locations.productionDocumentsBucket}/`],
    [`gs://${locations.sourceSnapshotsBucket}/`, `gs://${locations.productionSnapshotsBucket}/`],
  ];
  return visit(value, (text) => replacements.reduce((result, [source, target]) => result.split(source).join(target), text)) as T;
}

export function hasStagingPromotionReferences(value: unknown, locations: PromotionLocations): boolean {
  const markers = [
    new URL(locations.sourceApiBase).origin,
    `gs://${locations.sourceDocumentsBucket}/`,
    `gs://${locations.sourceSnapshotsBucket}/`,
  ];
  let found = false;
  visit(value, (text) => {
    if (markers.some((marker) => text.includes(marker))) found = true;
    return text;
  });
  return found;
}

export function referencedUploadIds(values: unknown[]): Set<string> {
  const ids = new Set<string>();
  const visitValue = (value: unknown) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(publicAssetPath)) {
        try { ids.add(decodeURIComponent(match[1])); } catch { ids.add(match[1]); }
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach(visitValue); return; }
    if (isPlainObject(value)) Object.values(value).forEach(visitValue);
  };
  values.forEach(visitValue);
  return ids;
}

export function preparePromotionRecord(collection: CollectionKey, value: unknown, locations: PromotionLocations) {
  const apiRewritten = rewriteStagingApiUrls(value, locations.sourceApiBase, locations.productionApiBase);
  const rewritten = rewriteStagingStorageUris(apiRewritten, locations);
  if (collection === 'settings' && isPlainObject(rewritten)) {
    // Do not initiate email delivery in production as a side effect of moving batch data.
    return { ...rewritten, subscriptionsEnabled: false };
  }
  if (collection === 'metrics' && isPlainObject(rewritten)) {
    // Keep batch analytics intact, but distinguish it from production traffic.
    return { ...rewritten, sourceEnvironment: 'staging' };
  }
  return rewritten;
}

export interface CollectionPromotionPlan {
  toWrite: Array<{ id: string; value: unknown }>;
  unchanged: string[];
  conflicts: string[];
}

export function planCollectionPromotion(source: Map<string, unknown>, target: Map<string, unknown>, prepare: (id: string, value: unknown) => unknown): CollectionPromotionPlan {
  const toWrite: CollectionPromotionPlan['toWrite'] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];

  for (const id of target.keys()) if (!source.has(id)) conflicts.push(`${id}: extra en producción`);
  for (const [id, sourceValue] of source) {
    const value = prepare(id, sourceValue);
    if (!target.has(id)) toWrite.push({ id, value });
    else if (stableJson(target.get(id)) === stableJson(value)) unchanged.push(id);
    else conflicts.push(`${id}: distinto en producción`);
  }

  return { toWrite, unchanged, conflicts };
}

export function equivalentStorageObject(sourceMetadata: Record<string, unknown>, targetMetadata: Record<string, unknown>) {
  if (sourceMetadata.size !== undefined && targetMetadata.size !== undefined && String(sourceMetadata.size) !== String(targetMetadata.size)) return false;
  for (const hash of ['md5Hash', 'crc32c']) {
    const sourceHash = sourceMetadata[hash];
    const targetHash = targetMetadata[hash];
    if (typeof sourceHash === 'string' && typeof targetHash === 'string') return sourceHash === targetHash;
  }
  return false;
}

function visit(value: unknown, transformString: (value: string) => string): unknown {
  if (typeof value === 'string') return transformString(value);
  if (Array.isArray(value)) return value.map((item) => visit(item, transformString));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, transformString)]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  const candidate = value as { toDate?: () => Date };
  if (typeof candidate.toDate === 'function') return { $date: candidate.toDate().toISOString() };
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
}
