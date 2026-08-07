import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '@politeia/quorum-contracts';
import { migrateGlossaryInline } from './migrateGlossaryInline.js';
import { createMemoryStore, setStoreForTests, type DataStore } from './store.js';

describe('glossary inline migration', () => {
  let testStore: DataStore;
  beforeEach(() => { testStore = createMemoryStore(true); setStoreForTests(testStore); });
  afterEach(() => setStoreForTests(null));

  it('adds safe defaults once and leaves inline rendering disabled', async () => {
    await testStore.set('glossary', 'dictamen', {
      id: 'dictamen', slug: 'dictamen', term: 'Dictamen',
      definition: 'Primera oracion explicativa. Segunda oracion.', references: [], published: true,
      updatedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(await migrateGlossaryInline('migration@politeia.ar')).toEqual({ total: 1, updated: 1, unchanged: 0 });
    expect(await testStore.get<GlossaryTerm>('glossary', 'dictamen')).toMatchObject({
      aliases: [], shortDefinition: 'Primera oracion explicativa.', inlineEnabled: false, updatedBy: 'migration@politeia.ar',
    });
    expect(await migrateGlossaryInline('migration@politeia.ar')).toEqual({ total: 1, updated: 0, unchanged: 1 });
    expect(await testStore.list('audits')).toHaveLength(1);
  });
});
