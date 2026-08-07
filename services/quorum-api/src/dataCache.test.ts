import { afterEach, describe, expect, it } from 'vitest';
import { cachedList, clearDataCache } from './dataCache.js';
import { createMemoryStore } from './store.js';

describe('data cache', () => {
  afterEach(() => clearDataCache());

  it('deduplicates concurrent and repeated reads', async () => {
    const dataStore = createMemoryStore(false);
    const originalList = dataStore.list.bind(dataStore);
    let reads = 0;
    dataStore.list = async <T>(collection: Parameters<typeof originalList>[0]) => {
      reads += 1;
      return originalList<T>(collection);
    };

    await Promise.all([
      cachedList(dataStore, 'legislators', 60_000),
      cachedList(dataStore, 'legislators', 60_000),
      cachedList(dataStore, 'legislators', 60_000),
    ]);
    await cachedList(dataStore, 'legislators', 60_000);

    expect(reads).toBe(1);
  });

  it('invalidates a collection immediately after a successful write', async () => {
    const dataStore = createMemoryStore(false);
    const originalList = dataStore.list.bind(dataStore);
    let reads = 0;
    dataStore.list = async <T>(collection: Parameters<typeof originalList>[0]) => {
      reads += 1;
      return originalList<T>(collection);
    };

    await cachedList(dataStore, 'legislators', 60_000);
    await dataStore.set('legislators', 'one', { id: 'one', fullName: 'Persona' });
    const items = await cachedList<{ id: string }>(dataStore, 'legislators', 60_000);

    expect(reads).toBe(2);
    expect(items).toHaveLength(1);
  });
});
