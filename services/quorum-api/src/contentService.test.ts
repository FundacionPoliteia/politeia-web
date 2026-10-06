import { afterEach, describe, expect, it } from 'vitest';
import { getManageBootstrap } from './contentService.js';
import { createMemoryStore, setStoreForTests } from './store.js';

describe('editorial bootstrap', () => {
  afterEach(() => setStoreForTests(null));

  it('deduplicates repeated full reads and invalidates immediately after any collection write', async () => {
    const dataStore = createMemoryStore(true);
    const originalList = dataStore.list.bind(dataStore);
    let reads = 0;
    dataStore.list = async <T>(collection: Parameters<typeof originalList>[0]) => {
      reads += 1;
      return originalList<T>(collection);
    };
    setStoreForTests(dataStore);

    const first = await getManageBootstrap();
    const second = await getManageBootstrap();
    expect(second).toEqual(first);
    expect(reads).toBe(9);

    await dataStore.set('catalogs', 'new-chamber', {
      id: 'new-chamber', kind: 'chamber', label: 'Nueva cámara', description: '', order: 100, active: true,
    });
    const refreshed = await getManageBootstrap();

    expect(reads).toBe(18);
    expect(refreshed.catalogs.some((item) => item.id === 'new-chamber')).toBe(true);
  });
});
