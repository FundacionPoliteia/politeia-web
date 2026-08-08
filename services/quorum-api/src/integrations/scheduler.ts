import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { ensureSourceRegistry, HCDN_LEGISLATORS_SOURCE_ID, SENATE_LEGISLATORS_SOURCE_ID } from './registry.js';
import { syncHcdnLegislators, syncSenateLegislators, type SyncOptions } from './sync.js';

const auth = new OAuth2Client();

export async function syncDueLegislators(req: Request) {
  if (!config.congressAutoSyncEnabled || !config.congressSyncInvokerEmail) throw new ApiError(503, 'congress_auto_sync_disabled', 'La sincronización automática del Congreso está desactivada');
  await verifyScheduler(req);
  const sources = (await ensureSourceRegistry()).filter((item) => item.enabled);
  const now = Date.now();
  const due = sources.filter((item) => sourceIsDue(item, now));
  const results = [];
  for (const source of due) {
    try {
      const result = await syncOne(source.id, config.congressSyncInvokerEmail, { trigger: 'scheduled' });
      results.push({ sourceId: source.id, ok: true, status: result.run.status, changes: result.run.changes });
    } catch (error) {
      results.push({ sourceId: source.id, ok: false, error: error instanceof Error ? error.message : 'Error desconocido' });
    }
  }
  return { checkedAt: new Date().toISOString(), due: due.length, skipped: sources.length - due.length, results };
}

export function sourceIsDue(source: { nextScheduledSyncAt: string | null }, now = Date.now()) {
  return !source.nextScheduledSyncAt || new Date(source.nextScheduledSyncAt).valueOf() <= now;
}

export async function syncAllLegislatorSources(actorEmail: string, options: SyncOptions = {}) {
  const sources = (await ensureSourceRegistry()).filter((item) => item.enabled);
  if (!sources.length) throw new ApiError(503, 'integration_disabled', 'Las integraciones legislativas están desactivadas');
  const results = [];
  for (const source of sources) {
    try {
      const value = await syncOne(source.id, actorEmail, { trigger: options.trigger || 'manual', forceDownload: options.forceDownload });
      results.push({ sourceId: source.id, ok: true, ...value });
    } catch (error) {
      results.push({ sourceId: source.id, ok: false, error: error instanceof Error ? error.message : 'Error desconocido' });
    }
  }
  return { results };
}

async function syncOne(sourceId: string, actorEmail: string, options: SyncOptions) {
  if (sourceId === HCDN_LEGISLATORS_SOURCE_ID) return syncHcdnLegislators(actorEmail, options);
  if (sourceId === SENATE_LEGISLATORS_SOURCE_ID) return syncSenateLegislators(actorEmail, options);
  throw new ApiError(404, 'source_not_found', 'Fuente legislativa desconocida');
}

async function verifyScheduler(req: Request) {
  const bearer = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) throw new ApiError(401, 'scheduler_auth_required', 'Falta la identidad del programador');
  try {
    const audience = `${req.protocol}://${req.get('host')}`;
    const ticket = await auth.verifyIdToken({ idToken: bearer, audience });
    const payload = ticket.getPayload();
    const trustedIssuer = payload?.iss === 'https://accounts.google.com' || payload?.iss === 'accounts.google.com';
    if (!trustedIssuer || payload?.aud !== audience || payload?.email?.toLowerCase() !== config.congressSyncInvokerEmail || payload.email_verified !== true) throw new Error('identity mismatch');
  } catch {
    throw new ApiError(403, 'scheduler_identity_invalid', 'Identidad de sincronización no autorizada');
  }
}
