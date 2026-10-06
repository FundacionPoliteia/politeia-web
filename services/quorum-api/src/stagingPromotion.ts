import type { CollectionKey } from './store.js';

/** Editorial records to promote. Authorization, subscriptions and telemetry are intentionally excluded. */
export const stagingPromotionCollections: CollectionKey[] = [
  'projects', 'publicProjects', 'revisions', 'legislators', 'legislatorRevisions',
  'glossary', 'catalogs', 'workflows', 'settings', 'teamMembers',
  'externalEntityLinks', 'fieldProvenance', 'votingSnapshots', 'votingSources',
];

const publicAssetPath = /\/v1\/public\/(?:media|files)\/([^/?#\s"'<>]+)/g;

export function rewriteStagingApiUrls<T>(value: T, sourceApiBase: string, productionApiBase: string): T {
  const source = sourceApiBase.replace(/\/$/, '');
  const target = productionApiBase.replace(/\/$/, '');
  return visit(value, (text) => text.split(source).join(target)) as T;
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

export function preparePromotionRecord(collection: CollectionKey, value: unknown, sourceApiBase: string, productionApiBase: string) {
  const rewritten = rewriteStagingApiUrls(value, sourceApiBase, productionApiBase);
  if (collection !== 'settings' || !isPlainObject(rewritten)) return rewritten;
  // Email subscriptions are an operational feature, not editorial content. Keep them disabled
  // until production consent, provider credentials and delivery tests are explicitly approved.
  return { ...rewritten, subscriptionsEnabled: false };
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
  return Boolean(sourceMetadata.md5Hash) && sourceMetadata.md5Hash === targetMetadata.md5Hash;
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
