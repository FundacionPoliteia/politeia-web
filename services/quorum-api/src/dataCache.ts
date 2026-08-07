import type { CollectionKey, DataStore } from './store.js';

type CacheEntry = {
  expiresAt: number;
  generation: number;
  value?: unknown;
  pending?: Promise<unknown>;
};

const entries = new Map<string, CacheEntry>();
const generations = new Map<string, number>();

export const cacheTtl = {
  publicProjection: 60_000,
  referenceData: 5 * 60_000,
  operationalOverview: 15_000,
  externalSnapshot: 5 * 60_000,
  immutableAsset: 60 * 60_000,
} as const;

export async function cachedValue<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const generation = generations.get(key) || 0;
  const existing = entries.get(key);
  if (existing?.value !== undefined && existing.expiresAt > Date.now() && existing.generation === generation) return existing.value as T;
  if (existing?.pending && existing.generation === generation) return existing.pending as Promise<T>;

  const pending = loader().then((value) => {
    if ((generations.get(key) || 0) === generation) entries.set(key, { value, expiresAt: Date.now() + ttlMs, generation });
    return value;
  }).catch((error) => {
    if (entries.get(key)?.pending === pending) entries.delete(key);
    throw error;
  });
  entries.set(key, { pending, expiresAt: 0, generation });
  return pending;
}

export function cachedList<T>(dataStore: DataStore, collection: CollectionKey, ttlMs: number): Promise<T[]> {
  return cachedValue(`collection:list:${collection}`, ttlMs, () => dataStore.list<T>(collection));
}

export function cachedGet<T>(dataStore: DataStore, collection: CollectionKey, id: string, ttlMs: number): Promise<T | null> {
  return cachedValue(`collection:get:${collection}:${id}`, ttlMs, () => dataStore.get<T>(collection, id));
}

export function invalidateCollectionCache(collection: CollectionKey) {
  invalidatePrefix(`collection:list:${collection}`);
  invalidatePrefix(`collection:get:${collection}:`);
  if (['publicProjects', 'legislators', 'glossary', 'catalogs', 'workflows', 'settings'].includes(collection)) invalidatePrefix('derived:public:');
}

export function clearDataCache() {
  for (const key of entries.keys()) invalidateKey(key);
  entries.clear();
}

function invalidatePrefix(prefix: string) {
  const keys = new Set([...entries.keys(), ...generations.keys()].filter((key) => key.startsWith(prefix)));
  for (const key of keys) invalidateKey(key);
}

function invalidateKey(key: string) {
  generations.set(key, (generations.get(key) || 0) + 1);
  entries.delete(key);
}
