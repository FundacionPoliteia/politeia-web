import { externalSourceSchema, type ExternalSource, type ExternalSyncRun, type IntegrationMode } from '@politeia/quorum-contracts';
import { config } from '../config.js';
import { cachedList, cacheTtl } from '../dataCache.js';
import { store } from '../store.js';

export const HCDN_LEGISLATORS_SOURCE_ID = 'hcdn-legislators';
export const SENATE_LEGISLATORS_SOURCE_ID = 'senate-legislators';

const sourceDefinitions = [{
  id: HCDN_LEGISLATORS_SOURCE_ID,
  label: 'Diputados — composición de la Cámara',
  organization: 'Honorable Cámara de Diputados de la Nación',
  datasetId: 'legisladores',
  datasetUrl: 'https://datos.hcdn.gob.ar/dataset/legisladores',
  license: 'Creative Commons Attribution',
  attribution: 'Fuente: Honorable Cámara de Diputados de la Nación — Datos Abiertos',
}, {
  id: SENATE_LEGISLATORS_SOURCE_ID,
  label: 'Senado — composición de la Cámara',
  organization: 'Honorable Senado de la Nación',
  datasetId: 'senadores-vigentes',
  datasetUrl: 'https://www.senado.gob.ar/micrositios/DatosAbiertos/ExportarListadoSenadores/json',
  license: 'Datos públicos del Senado de la Nación',
  attribution: 'Fuente: Honorable Senado de la Nación — Datos Abiertos',
}] as const;

export async function ensureSourceRegistry(): Promise<ExternalSource[]> {
  const timestamp = new Date().toISOString();
  return Promise.all(sourceDefinitions.map(async (definition) => {
    const existing = await store().get<ExternalSource>('externalSources', definition.id);
    const candidate = externalSourceSchema.parse({
      ...definition,
      mode: integrationMode(),
      enabled: config.congressImportEnabled && (
        (definition.id === HCDN_LEGISLATORS_SOURCE_ID && config.hcdnImportEnabled)
        || (definition.id === SENATE_LEGISLATORS_SOURCE_ID && config.senateImportEnabled)
      ),
      lastAttemptAt: existing?.lastAttemptAt || null,
      lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt || null,
      lastObservedChangeAt: existing?.lastObservedChangeAt || null,
      nextScheduledSyncAt: existing?.nextScheduledSyncAt || null,
      consecutiveFailures: existing?.consecutiveFailures || 0,
      httpEtag: existing?.httpEtag || null,
      httpLastModified: existing?.httpLastModified || null,
      syncLeaseRunId: existing?.syncLeaseRunId || null,
      syncLeaseUntil: existing?.syncLeaseUntil || null,
      lastSnapshotId: existing?.lastSnapshotId || null,
      lastError: existing?.lastError || null,
      updatedAt: existing?.updatedAt || timestamp,
    });
    const changed = !existing || registryConfiguration(existing) !== registryConfiguration(candidate);
    const source = changed ? { ...candidate, updatedAt: timestamp } : candidate;
    if (changed) await store().set('externalSources', source.id, source);
    return source;
  }));
}

function registryConfiguration(source: ExternalSource) {
  const { updatedAt: _updatedAt, ...stable } = source;
  return JSON.stringify(stable);
}

export async function getIntegrationOverview() {
  const sources = await ensureSourceRegistry();
  const dataStore = store();
  const [runs, snapshots, records, links, suggestions] = await Promise.all([
    cachedList<ExternalSyncRun>(dataStore, 'externalSyncRuns', cacheTtl.operationalOverview),
    cachedList(dataStore, 'sourceSnapshots', cacheTtl.referenceData),
    cachedList(dataStore, 'externalLegislators', cacheTtl.externalSnapshot),
    cachedList(dataStore, 'externalEntityLinks', cacheTtl.referenceData),
    store().list<{ sourceId: string; status: string; nextSnapshotId: string }>('importSuggestions'),
  ]);
  const timestamp = Date.now();
  const latestRun = new Map(sources.map((source) => [source.id, runs.filter((run) => run.sourceId === source.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]]));
  const currentSuggestions = suggestions.filter((item) => sources.some((source) => source.id === item.sourceId && source.lastSnapshotId === item.nextSnapshotId));
  return {
    enabled: config.congressImportEnabled,
    autoSyncEnabled: config.congressAutoSyncEnabled,
    syncIntervalDays: config.congressSyncIntervalDays,
    sources: sources.map((source) => ({
      ...source,
      freshness: source.syncLeaseUntil && new Date(source.syncLeaseUntil).valueOf() > timestamp ? 'syncing'
        : source.consecutiveFailures >= 3 || latestRun.get(source.id)?.status === 'quarantined' ? 'attention'
          : !source.nextScheduledSyncAt ? 'due'
            : new Date(source.nextScheduledSyncAt).valueOf() <= timestamp ? 'due'
              : new Date(source.nextScheduledSyncAt).valueOf() - timestamp <= 14 * 86_400_000 ? 'expiring' : 'fresh',
      pendingChanges: currentSuggestions.filter((item) => item.sourceId === source.id && item.status === 'pending').length,
    })),
    counts: { runs: runs.length, snapshots: snapshots.length, legislators: records.length, links: links.length, pendingChanges: currentSuggestions.filter((item) => item.status === 'pending').length },
  };
}

function integrationMode(): IntegrationMode {
  return ['shadow', 'assisted', 'active'].includes(config.congressImportMode) ? config.congressImportMode as IntegrationMode : 'shadow';
}
