import { createHash } from 'node:crypto';
import {
  externalSourceSchema, externalSyncRunSchema, sourceSnapshotSchema,
  type ExternalLegislatorRecord, type ExternalSource, type ExternalSyncRun, type SourceSnapshot,
} from '@politeia/quorum-contracts';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { newId, store } from '../store.js';
import { downloadCurrentDeputies } from './hcdn/client.js';
import { normalizeCurrentDeputies } from './hcdn/legislators.js';
import { buildAndPersistLegislatorDiff } from './legislatorDiff.js';
import { ensureSourceRegistry, HCDN_LEGISLATORS_SOURCE_ID, SENATE_LEGISLATORS_SOURCE_ID } from './registry.js';
import { downloadCurrentSenators } from './senate/client.js';
import { normalizeCurrentSenators } from './senate/legislators.js';
import { archiveSourcePayload } from './snapshots.js';

export type SyncTrigger = 'scheduled' | 'manual' | 'cli';
export type SyncOptions = { trigger?: SyncTrigger; forceDownload?: boolean };
export type DownloadRequest = { etag: string | null; lastModified: string | null; forceDownload: boolean };
export type Download = {
  resourceId: string; resourceUrl: string; sourceModifiedAt: string | null;
  payload: Buffer | null; sha256: string | null; notModified?: boolean;
  etag?: string | null; lastModified?: string | null;
};
type Downloader = (request?: DownloadRequest) => Promise<Download>;
type Normalized = { rows: unknown[]; records: ExternalLegislatorRecord[]; schemaFingerprint: string };

export async function syncHcdnLegislators(actorEmail: string, optionsOrDownloader: SyncOptions | Downloader = {}, injectedDownloader?: Downloader) {
  const { options, downloader } = resolveArguments(optionsOrDownloader, injectedDownloader || downloadCurrentDeputies);
  return syncLegislatorSource({
    actorEmail, options, sourceId: HCDN_LEGISLATORS_SOURCE_ID, disabledMessage: 'La integración con Diputados está desactivada', downloader,
    normalize: (payload, snapshotId, observedAt) => normalizeCurrentDeputies(payload, snapshotId, observedAt, config.hcdnMinimumCurrentLegislators),
  });
}

export async function syncSenateLegislators(actorEmail: string, optionsOrDownloader: SyncOptions | Downloader = {}, injectedDownloader?: Downloader) {
  const { options, downloader } = resolveArguments(optionsOrDownloader, injectedDownloader || downloadCurrentSenators);
  return syncLegislatorSource({
    actorEmail, options, sourceId: SENATE_LEGISLATORS_SOURCE_ID, disabledMessage: 'La integración con el Senado está desactivada', downloader,
    normalize: (payload, snapshotId, observedAt) => normalizeCurrentSenators(payload, snapshotId, observedAt, config.senateMinimumCurrentLegislators),
  });
}

async function syncLegislatorSource(input: {
  actorEmail: string; options: SyncOptions; sourceId: string; disabledMessage: string; downloader: Downloader;
  normalize: (payload: Buffer, snapshotId: string, observedAt: string) => Normalized;
}) {
  const { actorEmail } = input;
  const source = (await ensureSourceRegistry()).find((item) => item.id === input.sourceId)!;
  if (!source.enabled) throw new ApiError(503, 'integration_disabled', input.disabledMessage);
  const startedAt = new Date().toISOString();
  const runId = newId('source-run');
  const trigger = input.options.trigger || 'manual';
  const forceDownload = input.options.forceDownload === true;
  const leaseUntil = new Date(Date.now() + 15 * 60_000).toISOString();
  const acquired = await store().acquireIntegrationLease(source.id, runId, leaseUntil);
  if (!acquired) throw new ApiError(409, 'integration_sync_running', 'Ya hay una sincronización de esta fuente en curso');

  let run = externalSyncRunSchema.parse({
    id: runId, sourceId: source.id, status: 'running', startedAt, completedAt: null, actorEmail,
    trigger, forceDownload, snapshotId: null, recordCount: 0, changes: { added: 0, removed: 0, changed: 0 },
    errorCode: null, errorMessage: null,
  });
  await store().set('externalSyncRuns', run.id, run);
  let terminalRecorded = false;
  try {
    const download = await input.downloader({
      etag: forceDownload ? null : source.httpEtag,
      lastModified: forceDownload ? null : source.httpLastModified,
      forceDownload,
    });
    const previous = source.lastSnapshotId ? await store().get<SourceSnapshot>('sourceSnapshots', source.lastSnapshotId) : null;
    const nextValidators = {
      httpEtag: download.etag ?? source.httpEtag,
      httpLastModified: download.lastModified ?? source.httpLastModified,
    };

    if (download.notModified) {
      if (!previous) throw new ApiError(409, 'source_cache_missing', 'La fuente respondió sin cambios pero no existe un snapshot local válido');
      run = finishRun(run, 'unchanged', previous.id, previous.recordCount);
      await finalize(source, run, {
        ...nextValidators, lastAttemptAt: startedAt, lastSuccessfulSyncAt: run.completedAt,
        nextScheduledSyncAt: nextSuccessfulSyncAt(), consecutiveFailures: 0, lastError: null,
      });
      await audit('integration.sync.unchanged', actorEmail, source.id, { runId, snapshotId: previous.id, via: 'http-304', trigger });
      return { run, snapshot: previous, unchanged: true };
    }
    if (!download.payload || !download.sha256) throw new ApiError(502, 'official_source_empty', 'La fuente oficial no devolvió contenido utilizable');

    if (previous?.sha256 === download.sha256 && previous.status === 'valid') {
      run = finishRun(run, 'unchanged', previous.id, previous.recordCount);
      await finalize(source, run, {
        ...nextValidators, lastAttemptAt: startedAt, lastSuccessfulSyncAt: run.completedAt,
        nextScheduledSyncAt: nextSuccessfulSyncAt(), consecutiveFailures: 0, lastError: null,
      });
      await audit('integration.sync.unchanged', actorEmail, source.id, { runId, snapshotId: previous.id, via: 'sha256', trigger });
      return { run, snapshot: previous, unchanged: true };
    }

    const snapshotId = newId('source-snapshot');
    let normalized: Normalized;
    try {
      normalized = input.normalize(download.payload, snapshotId, startedAt);
    } catch (error) {
      const objectPath = await archiveSourcePayload(source.id, snapshotId, download.payload, download.sha256);
      const reason = error instanceof Error ? error.message : 'El snapshot no superó la validación';
      const snapshot = sourceSnapshotSchema.parse({
        id: snapshotId, sourceId: source.id, datasetId: source.datasetId, resourceId: download.resourceId, resourceUrl: download.resourceUrl,
        retrievedAt: startedAt, sourceModifiedAt: download.sourceModifiedAt, objectPath, sha256: download.sha256, byteSize: download.payload.byteLength,
        recordCount: 0, schemaFingerprint: createHash('sha256').update('unknown-schema').digest('hex'), status: 'quarantined', quarantineReason: reason,
      });
      await store().set('sourceSnapshots', snapshot.id, snapshot);
      run = finishRun(run, 'quarantined', snapshot.id, 0, errorCode(error), reason);
      await finalizeFailure(source, run, startedAt, nextValidators, reason, true);
      terminalRecorded = true;
      await audit('integration.snapshot.quarantined', actorEmail, source.id, { runId, snapshotId, reason, trigger });
      throw error;
    }

    const objectPath = await archiveSourcePayload(source.id, snapshotId, download.payload, download.sha256);
    const snapshot = sourceSnapshotSchema.parse({
      id: snapshotId, sourceId: source.id, datasetId: source.datasetId, resourceId: download.resourceId, resourceUrl: download.resourceUrl,
      retrievedAt: startedAt, sourceModifiedAt: download.sourceModifiedAt, objectPath, sha256: download.sha256, byteSize: download.payload.byteLength,
      recordCount: normalized.rows.length, schemaFingerprint: normalized.schemaFingerprint, status: 'valid', quarantineReason: null,
    });
    await store().set('sourceSnapshots', snapshot.id, snapshot);
    await writeInChunks(normalized.records, 20, (record) => store().set('externalLegislators', record.id, record));
    const changes = await buildAndPersistLegislatorDiff(source.id, source.lastSnapshotId, snapshot.id, normalized.records);
    run = finishRun(run, 'succeeded', snapshot.id, normalized.records.length, null, null, changes);
    await finalize(source, run, {
      ...nextValidators, lastAttemptAt: startedAt, lastSuccessfulSyncAt: run.completedAt, lastObservedChangeAt: startedAt,
      nextScheduledSyncAt: nextSuccessfulSyncAt(), consecutiveFailures: 0, lastSnapshotId: snapshot.id, lastError: null,
    });
    terminalRecorded = true;
    await audit('integration.sync.succeeded', actorEmail, source.id, {
      runId, snapshotId, imported: normalized.records.length, rawRecords: normalized.rows.length,
      changes: run.changes, trigger, forceDownload,
    });
    return { run, snapshot, unchanged: false, imported: normalized.records.length, changes: run.changes };
  } catch (error) {
    if (!terminalRecorded) {
      const message = error instanceof Error ? error.message : 'Falló la sincronización';
      run = finishRun(run, 'failed', null, 0, errorCode(error), message);
      await finalizeFailure(source, run, startedAt, {}, message);
      await audit('integration.sync.failed', actorEmail, source.id, { runId, code: errorCode(error), message, trigger });
    }
    throw error;
  }
}

async function finalize(source: ExternalSource, run: ExternalSyncRun, changes: Partial<ExternalSource>) {
  const next = externalSourceSchema.parse({
    ...source, ...changes, syncLeaseRunId: null, syncLeaseUntil: null, updatedAt: new Date().toISOString(),
  });
  await store().finalizeIntegrationRun(next, run);
}

async function finalizeFailure(source: ExternalSource, run: ExternalSyncRun, attemptedAt: string, changes: Partial<ExternalSource>, message: string, quarantined = false) {
  const failures = source.consecutiveFailures + 1;
  await finalize(source, run, {
    ...changes, lastAttemptAt: attemptedAt, consecutiveFailures: failures,
    nextScheduledSyncAt: new Date(Date.now() + (quarantined ? 7 * 86_400_000 : retryDelayMs(failures))).toISOString(), lastError: message,
  });
}

function finishRun(
  run: ExternalSyncRun, status: ExternalSyncRun['status'], snapshotId: string | null, recordCount: number,
  code: string | null = null, message: string | null = null,
  changes: ExternalSyncRun['changes'] = { added: 0, removed: 0, changed: 0 },
) {
  return externalSyncRunSchema.parse({ ...run, status, completedAt: new Date().toISOString(), snapshotId, recordCount, changes, errorCode: code, errorMessage: message });
}

function resolveArguments(value: SyncOptions | Downloader, defaultDownloader: Downloader) {
  return typeof value === 'function' ? { options: {} as SyncOptions, downloader: value } : { options: value, downloader: defaultDownloader };
}
function nextSuccessfulSyncAt() { return new Date(Date.now() + config.congressSyncIntervalDays * 86_400_000).toISOString(); }
function retryDelayMs(failures: number) { return failures === 1 ? 86_400_000 : failures === 2 ? 3 * 86_400_000 : 7 * 86_400_000; }
async function audit(type: string, actorEmail: string, targetId: string, details: Record<string, unknown>) {
  const id = newId('audit');
  await store().set('audits', id, { id, type, actorEmail, targetId, details, createdAt: new Date().toISOString() });
}
async function writeInChunks<T>(items: T[], size: number, action: (item: T) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(action));
}
function errorCode(error: unknown) { return error instanceof ApiError ? error.code : 'integration_unknown_error'; }
