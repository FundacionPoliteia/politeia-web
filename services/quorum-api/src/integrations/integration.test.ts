import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExternalLegislatorRecord, ExternalSource, Legislator, LegislatorImportSuggestion } from '@politeia/quorum-contracts';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { createMemoryStore, setStoreForTests, type DataStore } from '../store.js';
import { bulkImportAllExternalLegislators, bulkImportExternalLegislators, importExternalLegislator } from './legislatorImport.js';
import { ensureSourceRegistry } from './registry.js';
import { applyLegislatorSuggestion, listLegislatorRevisions } from './legislatorReview.js';
import { sourceIsDue } from './scheduler.js';
import { syncHcdnLegislators, syncSenateLegislators } from './sync.js';

let testStore: DataStore;
const configuredDataStore = config.dataStore;

beforeEach(() => {
  testStore = createMemoryStore(true); setStoreForTests(testStore);
  config.dataStore = 'memory';
  config.congressImportEnabled = true; config.hcdnImportEnabled = true; config.senateImportEnabled = true; config.congressImportMode = 'assisted'; config.hcdnMinimumCurrentLegislators = 1; config.senateMinimumCurrentLegislators = 1;
});

afterEach(() => {
  config.dataStore = configuredDataStore;
  config.congressImportEnabled = false; config.hcdnImportEnabled = false; config.senateImportEnabled = false; config.congressImportMode = 'shadow'; config.hcdnMinimumCurrentLegislators = 200; config.senateMinimumCurrentLegislators = 70;
  setStoreForTests(null);
});

describe('integración legislativa aislada', () => {
  it('inicializa el registro una vez y no lo reescribe durante el polling', async () => {
    await ensureSourceRegistry();
    const originalSet = testStore.set.bind(testStore);
    let sourceWrites = 0;
    testStore.set = async (collection, id, value) => {
      if (collection === 'externalSources') sourceWrites += 1;
      return originalSet(collection, id, value);
    };

    await ensureSourceRegistry();
    await ensureSourceRegistry();

    expect(sourceWrites).toBe(0);
  });

  it('es idempotente y no crea snapshots ni registros duplicados', async () => {
    const downloader = async () => ({ resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: '2026-08-03T12:00:00.000Z', payload: fixturePayload(), sha256: 'c'.repeat(64) });
    const first = await syncHcdnLegislators('dev@politeia.ar', downloader);
    const second = await syncHcdnLegislators('dev@politeia.ar', downloader);
    expect(first.unchanged).toBe(false); expect(second.unchanged).toBe(true);
    expect(await testStore.list('sourceSnapshots')).toHaveLength(1);
    expect(await testStore.list('externalLegislators')).toHaveLength(1);
    expect(await testStore.list('externalSyncRuns')).toHaveLength(2);
  });

  it('usa validadores HTTP y trata 304 como una comprobacion exitosa', async () => {
    const first = await syncHcdnLegislators('dev@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload(), sha256: '9'.repeat(64), etag: '"snapshot-1"', lastModified: 'Mon, 03 Aug 2026 12:00:00 GMT',
    }));
    const second = await syncHcdnLegislators('dev@politeia.ar', async (request) => {
      expect(request).toMatchObject({ etag: '"snapshot-1"', lastModified: 'Mon, 03 Aug 2026 12:00:00 GMT', forceDownload: false });
      return { resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null, payload: null, sha256: null, notModified: true, etag: '"snapshot-1"' };
    });
    expect(second).toMatchObject({ unchanged: true, snapshot: { id: first.snapshot.id } });
    expect(await testStore.list('sourceSnapshots')).toHaveLength(1);
    const source = await testStore.get<ExternalSource>('externalSources', 'hcdn-legislators');
    expect(source?.consecutiveFailures).toBe(0);
    expect(new Date(source!.nextScheduledSyncAt!).valueOf()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    expect(sourceIsDue(source!)).toBe(false);
    expect(sourceIsDue({ nextScheduledSyncAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('mantiene vigente el ultimo snapshot cuando una descarga queda en cuarentena', async () => {
    const first = await syncHcdnLegislators('dev@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload(), sha256: 'a'.repeat(64),
    }));
    await expect(syncHcdnLegislators('dev@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: Buffer.from('{}'), sha256: 'b'.repeat(64),
    }))).rejects.toBeTruthy();
    const source = await testStore.get<ExternalSource>('externalSources', 'hcdn-legislators');
    expect(source).toMatchObject({ lastSnapshotId: first.snapshot.id, consecutiveFailures: 1 });
    expect(new Date(source!.nextScheduledSyncAt!).valueOf()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect((await testStore.list<ExternalLegislatorRecord>('externalLegislators')).filter((item) => item.snapshotId === first.snapshot.id)).toHaveLength(1);
    expect((await testStore.list<{ status: string }>('sourceSnapshots')).some((item) => item.status === 'quarantined')).toBe(true);
  });

  it('conserva el snapshot anterior intacto hasta completar uno nuevo', async () => {
    const firstDownloader = async () => ({ resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: '2026-08-03T12:00:00.000Z', payload: fixturePayload(), sha256: 'c'.repeat(64) });
    const secondDownloader = async () => ({ resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: '2026-08-04T12:00:00.000Z', payload: fixturePayload('UNION CIVICA RADICAL'), sha256: 'd'.repeat(64) });
    const first = await syncHcdnLegislators('dev@politeia.ar', firstDownloader);
    const second = await syncHcdnLegislators('dev@politeia.ar', secondDownloader);
    const records = await testStore.list<ExternalLegislatorRecord>('externalLegislators');
    expect(records).toHaveLength(2);
    expect(records.map((item) => item.snapshotId)).toEqual(expect.arrayContaining([first.snapshot.id, second.snapshot.id]));
    expect(new Set(records.map((item) => item.id)).size).toBe(2);
  });

  it('crea una sugerencia ante un cambio oficial sin modificar silenciosamente el perfil local', async () => {
    const first = await syncHcdnLegislators('admin@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload(), sha256: 'e'.repeat(64),
    }));
    const imported = await bulkImportExternalLegislators({ snapshotId: first.snapshot.id }, 'admin@politeia.ar');
    expect(imported.created).toBe(1);
    const [localBefore] = await testStore.list<Legislator>('legislators');

    const second = await syncHcdnLegislators('admin@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload('UNION CIVICA RADICAL'), sha256: 'f'.repeat(64),
    }));
    expect(second.changes).toMatchObject({ added: 0, removed: 0, changed: 1 });
    expect((await testStore.get<Legislator>('legislators', localBefore.id))?.bloc).toBe(localBefore.bloc);

    const [suggestion] = await testStore.list<LegislatorImportSuggestion>('importSuggestions');
    expect(suggestion).toMatchObject({ changeType: 'changed', status: 'pending', localLegislatorId: localBefore.id });
    expect(suggestion.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bloc', previousValue: localBefore.bloc, nextValue: 'Union Civica Radical' }),
    ]));
  });

  it('aplica solo los campos elegidos y crea una revision inmutable', async () => {
    const first = await syncHcdnLegislators('admin@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload(), sha256: '7'.repeat(64),
    }));
    await bulkImportExternalLegislators({ snapshotId: first.snapshot.id }, 'admin@politeia.ar');
    const [localBefore] = await testStore.list<Legislator>('legislators');
    await syncHcdnLegislators('admin@politeia.ar', async () => ({
      resourceId: 'resource-1', resourceUrl: 'https://datos.hcdn.gob.ar/example.json', sourceModifiedAt: null,
      payload: fixturePayload('UNION CIVICA RADICAL'), sha256: '8'.repeat(64),
    }));
    const [suggestion] = await testStore.list<LegislatorImportSuggestion>('importSuggestions');

    const result = await applyLegislatorSuggestion(suggestion.id, { fields: ['bloc'], confirmPublic: false }, 'editor@politeia.ar', false);
    expect(result.item).toMatchObject({ id: localBefore.id, bloc: 'Union Civica Radical', fullName: localBefore.fullName });
    expect(result.suggestion).toMatchObject({ status: 'applied', appliedFields: ['bloc'] });
    const revisions = await listLegislatorRevisions(localBefore.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ before: { bloc: localBefore.bloc }, after: { bloc: 'Union Civica Radical' }, fields: ['bloc'] });
  });

  it('importa campos seleccionados sólo a un perfil privado con procedencia', async () => {
    const [registered] = await ensureSourceRegistry();
    const source = { ...registered, lastSnapshotId: 'snapshot-1', lastSuccessfulSyncAt: '2026-08-03T15:00:00.000Z' } satisfies ExternalSource;
    await testStore.set('externalSources', source.id, source);
    await testStore.set('externalLegislators', 'hcdn-legislators:hcdn0001', externalRecord());
    const result = await importExternalLegislator({ externalId: 'HCDN0001', createNew: true, fields: ['fullName', 'district', 'bloc', 'mandateStart', 'mandateEnd'] }, 'dev@politeia.ar');
    expect(result.item).toMatchObject({ fullName: 'María Pérez', district: 'Buenos Aires', bloc: 'Unión Por La Patria', published: false });
    expect(await testStore.list('externalEntityLinks')).toHaveLength(1);
    expect(await testStore.list('fieldProvenance')).toHaveLength(5);
  });

  it('no permite importar mientras la fuente está en modo shadow', async () => {
    config.congressImportMode = 'shadow';
    const [registered] = await ensureSourceRegistry();
    await testStore.set('externalSources', registered.id, { ...registered, lastSnapshotId: 'snapshot-1' });
    await testStore.set('externalLegislators', 'hcdn-legislators:hcdn0001', externalRecord());
    await expect(importExternalLegislator({ externalId: 'HCDN0001', createNew: true, fields: ['fullName'] }, 'dev@politeia.ar')).rejects.toMatchObject({ code: 'integration_shadow_mode' } satisfies Partial<ApiError>);
    expect(await testStore.list('legislators')).toHaveLength(0);
  });

  it('no sobrescribe un perfil público desde la fuente externa', async () => {
    const [registered] = await ensureSourceRegistry();
    await testStore.set('externalSources', registered.id, { ...registered, lastSnapshotId: 'snapshot-1' });
    await testStore.set('externalLegislators', 'hcdn-legislators:hcdn0001', externalRecord());
    const local: Legislator = { id: 'legislator-local', slug: 'maria-perez', fullName: 'María Pérez', party: '', bloc: '', district: 'Buenos Aires', office: 'diputado', mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: true, updatedAt: '2026-08-03T15:00:00.000Z' };
    await testStore.set('legislators', local.id, local);
    await expect(importExternalLegislator({ externalId: 'HCDN0001', localLegislatorId: local.id, fields: ['bloc'] }, 'dev@politeia.ar')).rejects.toMatchObject({ code: 'published_legislator_requires_draft' } satisfies Partial<ApiError>);
    expect((await testStore.get<Legislator>('legislators', local.id))?.bloc).toBe('');
  });

  it('crea masivamente los perfiles privados faltantes y puede repetirse sin duplicar', async () => {
    const [registered] = await ensureSourceRegistry();
    await testStore.set('externalSources', registered.id, { ...registered, lastSnapshotId: 'snapshot-1' });
    const first = externalRecord();
    const second = externalRecord({ id: 'hcdn-legislators:snapshot-1:hcdn0002', externalId: 'HCDN0002', fullName: 'Juan Gómez', givenNames: 'Juan', familyName: 'Gómez', district: 'Córdoba', rawFingerprint: 'b'.repeat(64) });
    await testStore.set('externalLegislators', first.id, first);
    await testStore.set('externalLegislators', second.id, second);

    const imported = await bulkImportExternalLegislators({ snapshotId: 'snapshot-1' }, 'admin@politeia.ar');
    expect(imported).toMatchObject({ total: 2, created: 2, alreadyLinked: 0, needsReview: 0, failed: 0 });
    expect(await testStore.list('legislators')).toHaveLength(2);
    expect((await testStore.list<Legislator>('legislators')).every((item) => !item.published)).toBe(true);
    expect(await testStore.list('externalEntityLinks')).toHaveLength(2);
    expect(await testStore.list('fieldProvenance')).toHaveLength(10);

    const repeated = await bulkImportExternalLegislators({ snapshotId: 'snapshot-1' }, 'admin@politeia.ar');
    expect(repeated).toMatchObject({ total: 2, created: 0, alreadyLinked: 2, needsReview: 0, failed: 0 });
    expect(await testStore.list('legislators')).toHaveLength(2);
  });

  it('separa para revisión una coincidencia local sin vínculo en vez de duplicarla', async () => {
    const [registered] = await ensureSourceRegistry();
    await testStore.set('externalSources', registered.id, { ...registered, lastSnapshotId: 'snapshot-1' });
    const record = externalRecord();
    await testStore.set('externalLegislators', record.id, record);
    const local: Legislator = { id: 'manual-maria', slug: 'maria-perez', fullName: 'María Pérez', party: '', bloc: '', district: 'Buenos Aires', office: 'diputado', mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: false, updatedAt: '2026-08-03T15:00:00.000Z' };
    await testStore.set('legislators', local.id, local);
    const result = await bulkImportExternalLegislators({ snapshotId: 'snapshot-1' }, 'admin@politeia.ar');
    expect(result).toMatchObject({ total: 1, created: 0, needsReview: 1, failed: 0 });
    expect(await testStore.list('legislators')).toHaveLength(1);
    expect(await testStore.list('externalEntityLinks')).toHaveLength(0);
  });

  it('sincroniza e importa las dos cámaras como perfiles privados diferenciados', async () => {
    const deputies = await syncHcdnLegislators('admin@politeia.ar', async () => ({ resourceId: 'hcdn-current', resourceUrl: 'https://datos.hcdn.gob.ar/current.json', sourceModifiedAt: null, payload: fixturePayload(), sha256: '1'.repeat(64) }));
    const senators = await syncSenateLegislators('admin@politeia.ar', async () => ({ resourceId: 'senate-current', resourceUrl: 'https://www.senado.gob.ar/current.json', sourceModifiedAt: null, payload: senateFixturePayload(), sha256: '2'.repeat(64) }));
    const result = await bulkImportAllExternalLegislators({ snapshots: [
      { sourceId: 'hcdn-legislators', snapshotId: deputies.snapshot.id },
      { sourceId: 'senate-legislators', snapshotId: senators.snapshot.id },
    ] }, 'admin@politeia.ar');
    expect(result.totals).toMatchObject({ total: 2, created: 2, needsReview: 0, failed: 0 });
    const legislators = await testStore.list<Legislator>('legislators');
    expect(legislators.map((item) => item.office).sort()).toEqual(['diputado', 'senador']);
    expect(new Set(legislators.map((item) => item.id)).size).toBe(2);
    expect(legislators.every((item) => !item.published)).toBe(true);
  });
});

function fixturePayload(bloc = 'UNION POR LA PATRIA') {
  return Buffer.from(JSON.stringify([{ ID: 'HCDN0001', APELLIDO: 'PÉREZ', NOMBRE: 'MARÍA', GENERO: 'F', DISTRITO: 'BUENOS AIRES', INICIO: '2025-12-10T00:00:00', FIN: '2029-12-09T00:00:00', JURAMENTO: '2025-12-03T00:00:00', CESE: null, BLOQUE: bloc, BLOQUE_INICIO: '2025-12-10T00:00:00', BLOQUE_FIN: '2029-12-09T00:00:00' }]));
}

function senateFixturePayload() {
  return Buffer.from(JSON.stringify({ table: { rows: [{ ID: '546', BLOQUE: 'BLOQUE FEDERAL', APELLIDO: 'PÉREZ', NOMBRE: 'MARÍA', PROVINCIA: 'CÓRDOBA', 'PARTIDO O ALIANZA': 'UNIÓN PROVINCIAL', D_LEGAL: '2023-12-10', C_LEGAL: '2029-12-09', D_REAL: '2023-12-10', C_REAL: 'Sin Datos' }] } }));
}

function externalRecord(overrides: Partial<ExternalLegislatorRecord> = {}): ExternalLegislatorRecord {
  return { id: 'hcdn-legislators:snapshot-1:hcdn0001', sourceId: 'hcdn-legislators', externalId: 'HCDN0001', snapshotId: 'snapshot-1', officialUrl: 'https://datos.hcdn.gob.ar/dataset/legisladores', fullName: 'María Pérez', givenNames: 'María', familyName: 'Pérez', gender: 'F', district: 'Buenos Aires', mandateStart: '2025-12-10', mandateEnd: '2029-12-09', oathDate: '2025-12-03', cessationDate: null, currentBloc: 'Unión Por La Patria', blocHistory: [{ name: 'Unión Por La Patria', start: '2025-12-10', end: '2029-12-09' }], observedAt: '2026-08-03T15:00:00.000Z', rawFingerprint: 'a'.repeat(64), ...overrides };
}
