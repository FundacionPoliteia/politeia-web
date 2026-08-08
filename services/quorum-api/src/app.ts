import crypto from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { Webhook } from 'svix';
import { ZodError } from 'zod';
import { roleAssignmentSchema } from '@politeia/quorum-contracts';
import { authenticateGoogleCredential, buildSession, readSession, requireAuth, requireCsrf, requirePublicAccess, requireRole, sessionCookieOptions } from './auth.js';
import { exportFirestoreBackup } from './backup.js';
import { config } from './config.js';
import {
  changeProjectVisibility, createProject, getManageBootstrap, getPublicBootstrap, getPublicProject, listPublicProjects,
  previewProject, publishProject, restoreRevision, saveCatalog, saveGlossaryTerm, saveLegislator, saveWorkflow, updateProject, updateSettings,
} from './contentService.js';
import { ApiError } from './errors.js';
import { streamEditorialImage, streamPdf, uploadEditorialImage, uploadPdf } from './files.js';
import { dispatchPendingMail } from './mail.js';
import { openApiSpec } from './openapi.js';
import { confirmFollow, deleteSubscription, exportSubscription, getPreferences, requestFollow, updatePreferences } from './subscriptions.js';
import { newId, store } from './store.js';
import { bulkImportAllExternalLegislators, bulkImportExternalLegislators, importExternalLegislator, searchExternalLegislators } from './integrations/legislatorImport.js';
import { getIntegrationOverview } from './integrations/registry.js';
import { syncHcdnLegislators, syncSenateLegislators } from './integrations/sync.js';
import { syncAllLegislatorSources, syncDueLegislators } from './integrations/scheduler.js';
import {
  applyLegislatorSuggestion, dismissLegislatorSuggestion, listLegislatorRevisions, listLegislatorSuggestions,
  reopenLegislatorSuggestion, restoreLegislatorRevision,
} from './integrations/legislatorReview.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.pdfMaxBytes, files: 1 } });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.imageMaxBytes, files: 1 } });
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const integrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('etag', 'strong');
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use((req, _res, next) => { req.requestId = req.header('x-request-id') || crypto.randomUUID(); next(); });
  app.use(cors({ origin: corsOrigin, credentials: true, optionsSuccessStatus: 204 }));
  app.options('*', cors({ origin: corsOrigin, credentials: true }));
  app.post('/v1/webhooks/resend', express.raw({ type: 'application/json', limit: '256kb' }), resendWebhook);
  app.use(express.json({ limit: '1mb' }));
  app.use(originGuard);
  app.use(['/v1/manage', '/v1/auth', '/v1/me', '/v1/public/follows', '/v1/public/metrics'], (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'quorum-api', version: '0.1.0', store: config.dataStore }));
  app.get('/readyz', asyncHandler(async (_req, res) => {
    await store().list('settings');
    res.json({ ok: true, service: 'quorum-api', store: config.dataStore, database: config.dataStore === 'firestore' ? config.firestoreDatabaseId : null });
  }));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));

  app.use('/v1/public', requirePublicAccess);
  app.get('/v1/public/bootstrap', publicLimiter, publicContentCache, asyncHandler(async (_req, res) => res.json(await getPublicBootstrap())));
  app.get('/v1/public/projects', publicLimiter, publicContentCache, asyncHandler(async (_req, res) => res.json({ items: await listPublicProjects() })));
  app.get('/v1/public/projects/:slug', publicLimiter, publicContentCache, asyncHandler(async (req, res) => res.json({ item: await getPublicProject(String(req.params.slug)) })));
  app.get('/v1/public/files/:id', publicLimiter, asyncHandler(streamPdf));
  app.get('/v1/public/media/:id', publicLimiter, asyncHandler(streamEditorialImage));
  app.post('/v1/public/follows/request', sensitiveLimiter, asyncHandler(async (req, res) => {
    await verifyTurnstile(req.body?.turnstileToken, req.ip);
    res.status(202).json(await requestFollow(req.body));
  }));
  app.post('/v1/public/follows/confirm', sensitiveLimiter, asyncHandler(async (req, res) => res.json(await confirmFollow(String(req.body?.token || '')))));
  app.get('/v1/public/follows/preferences', sensitiveLimiter, asyncHandler(async (req, res) => res.json({ item: await getPreferences(String(req.query.token || '')) })));
  app.patch('/v1/public/follows/preferences', sensitiveLimiter, asyncHandler(async (req, res) => res.json({ item: await updatePreferences(String(req.body?.token || ''), Array.isArray(req.body?.projectIds) ? req.body.projectIds.map(String) : []) })));
  app.post('/v1/public/follows/unsubscribe', sensitiveLimiter, asyncHandler(async (req, res) => res.json({ item: await updatePreferences(String(req.body?.token || ''), []) })));
  app.get('/v1/public/follows/export', sensitiveLimiter, asyncHandler(async (req, res) => res.json(await exportSubscription(String(req.query.token || '')))));
  app.delete('/v1/public/follows/preferences', sensitiveLimiter, asyncHandler(async (req, res) => res.json(await deleteSubscription(String(req.body?.token || '')))));
  app.post('/v1/public/metrics', publicLimiter, asyncHandler(async (req, res) => {
    const allowed = new Set(['search-used', 'filter-used', 'share-clicked', 'follow-opened', 'project-opened']);
    const event = String(req.body?.event || '');
    if (!allowed.has(event)) throw new ApiError(422, 'metric_invalid', 'Evento no permitido');
    await store().incrementMetric(new Date().toISOString().slice(0, 10), event);
    res.status(202).json({ accepted: true });
  }));

  app.post('/v1/auth/google', sensitiveLimiter, asyncHandler(async (req, res) => {
    const user = await authenticateGoogleCredential(String(req.body?.credential || ''));
    res.cookie(config.sessionCookieName, buildSession(user), sessionCookieOptions());
    res.json({ user });
  }));
  app.post('/v1/auth/logout', (req, res) => {
    res.clearCookie(config.sessionCookieName, sessionCookieOptions());
    res.status(204).end();
  });
  app.get('/v1/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.use('/v1/manage', requireAuth, requireCsrf);
  app.get('/v1/manage/bootstrap', requireRole('quorum_editor'), asyncHandler(async (_req, res) => res.json(await getManageBootstrap())));
  app.get('/v1/manage/projects/:id/preview', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await previewProject(String(req.params.id)) })));
  app.post('/v1/manage/projects/:id/preview', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await previewProject(String(req.params.id), req.body) })));
  app.post('/v1/manage/projects', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.status(201).json({ item: await createProject(req.body, req.user!.email) })));
  app.patch('/v1/manage/projects/:id', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await updateProject(String(req.params.id), req.body, req.user!.email) })));
  app.post('/v1/manage/projects/:id/publish', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json(await publishProject(String(req.params.id), req.body, req.user!.email))));
  app.post('/v1/manage/projects/:id/revisions/:revisionId/restore', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await restoreRevision(String(req.params.id), String(req.params.revisionId), req.user!.email) })));
  app.post('/v1/manage/projects/:id/unpublish', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await changeProjectVisibility(String(req.params.id), 'unpublished', req.user!.email) })));
  app.post('/v1/manage/projects/:id/archive', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await changeProjectVisibility(String(req.params.id), 'archived', req.user!.email) })));
  app.post('/v1/manage/legislators', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.status(201).json({ item: await saveLegislator(null, req.body, req.user!.email) })));
  app.put('/v1/manage/legislators/:id', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await saveLegislator(String(req.params.id), req.body, req.user!.email) })));
  app.get('/v1/manage/integrations', requireRole('quorum_editor'), asyncHandler(async (_req, res) => res.json(await getIntegrationOverview())));
  app.post('/v1/manage/integrations/hcdn-legislators/sync', integrationLimiter, requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await syncHcdnLegislators(req.user!.email, { trigger: 'manual', forceDownload: req.body?.forceDownload === true }))));
  app.post('/v1/manage/integrations/senate-legislators/sync', integrationLimiter, requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await syncSenateLegislators(req.user!.email, { trigger: 'manual', forceDownload: req.body?.forceDownload === true }))));
  app.post('/v1/manage/integrations/legislators/sync-all', integrationLimiter, requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await syncAllLegislatorSources(req.user!.email, { trigger: 'manual', forceDownload: req.body?.forceDownload === true }))));
  app.get('/v1/manage/integrations/legislators/changes', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json(await listLegislatorSuggestions(req.query))));
  app.post('/v1/manage/integrations/legislators/changes/:id/apply', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json(await applyLegislatorSuggestion(String(req.params.id), req.body, req.user!.email, req.user!.roles.includes('quorum_admin')))));
  app.post('/v1/manage/integrations/legislators/changes/:id/dismiss', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await dismissLegislatorSuggestion(String(req.params.id), req.body, req.user!.email) })));
  app.post('/v1/manage/integrations/legislators/changes/:id/reopen', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await reopenLegislatorSuggestion(String(req.params.id), req.user!.email) })));
  app.get('/v1/manage/integrations/legislators/search', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json(await searchExternalLegislators(String(req.query.q || '')))));
  app.post('/v1/manage/integrations/legislators/import', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json(await importExternalLegislator(req.body, req.user!.email))));
  app.post('/v1/manage/integrations/legislators/bulk-import', integrationLimiter, requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await bulkImportExternalLegislators(req.body, req.user!.email))));
  app.post('/v1/manage/integrations/legislators/bulk-import-all', integrationLimiter, requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await bulkImportAllExternalLegislators(req.body, req.user!.email))));
  app.get('/v1/manage/legislators/:id/revisions', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ items: await listLegislatorRevisions(String(req.params.id)) })));
  app.post('/v1/manage/legislators/:id/revisions/:revisionId/restore', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json(await restoreLegislatorRevision(String(req.params.id), String(req.params.revisionId), req.user!.email))));
  app.post('/v1/manage/glossary', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.status(201).json({ item: await saveGlossaryTerm(null, req.body, req.user!.email) })));
  app.put('/v1/manage/glossary/:id', requireRole('quorum_editor'), asyncHandler(async (req, res) => res.json({ item: await saveGlossaryTerm(String(req.params.id), req.body, req.user!.email) })));
  app.post('/v1/manage/catalogs', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.status(201).json({ item: await saveCatalog(null, req.body, req.user!.email) })));
  app.put('/v1/manage/catalogs/:id', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await saveCatalog(String(req.params.id), req.body, req.user!.email) })));
  app.post('/v1/manage/workflows', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.status(201).json({ item: await saveWorkflow(null, req.body, req.user!.email) })));
  app.post('/v1/manage/workflows/:id/version', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await saveWorkflow(String(req.params.id), req.body, req.user!.email) })));
  app.patch('/v1/manage/settings', requireRole('quorum_admin'), asyncHandler(async (req, res) => res.json({ item: await updateSettings(req.body, req.user!.email) })));
  app.put('/v1/manage/roles/:email', requireRole('quorum_admin'), asyncHandler(async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const item = roleAssignmentSchema.parse({ id: email.replace(/[^a-z0-9]+/g, '-'), email, roles: req.body?.roles, active: req.body?.active !== false, updatedAt: new Date().toISOString() });
    await store().set('roles', item.id, item);
    res.json({ item });
  }));
  app.post('/v1/manage/documents', requireRole('quorum_editor'), upload.single('file'), asyncHandler(async (req, res) => res.status(201).json({ item: await uploadPdf(req.file!, req.user!.email, req.body || {}) })));
  app.post('/v1/manage/media/images', requireRole('quorum_editor'), imageUpload.single('file'), asyncHandler(async (req, res) => res.status(201).json({ item: await uploadEditorialImage(req.file!, req.user!.email) })));

  app.post('/v1/operations/mail/dispatch', asyncHandler(async (req, res) => {
    if (!config.mailDispatchToken || req.header('authorization') !== `Bearer ${config.mailDispatchToken}`) throw new ApiError(401, 'invalid_dispatch_token', 'Token de operación inválido');
    res.json({ items: await dispatchPendingMail() });
  }));
  app.post('/v1/operations/backups/export', asyncHandler(async (req, res) => res.status(202).json(await exportFirestoreBackup(req))));
  app.post('/v1/operations/integrations/legislators/sync-due', asyncHandler(async (req, res) => res.json(await syncDueLegislators(req))));

  app.use((_req, _res, next) => next(new ApiError(404, 'route_not_found', 'Ruta no encontrada')));
  app.use(errorHandler);
  return app;
}

function publicContentCache(_req: Request, res: Response, next: NextFunction) {
  res.set('Cache-Control', config.publicAccessRequired ? 'private, no-store' : 'public, max-age=30, s-maxage=300, stale-while-revalidate=600');
  next();
}

function corsOrigin(origin: string | undefined, callback: (error: Error | null, value?: boolean | string) => void) {
  if (!origin) return callback(null, true);
  if (config.allowedOrigins.includes(origin.toLowerCase())) return callback(null, origin);
  callback(new Error('Origin not allowed'));
}

function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = String(req.header('origin') || '').toLowerCase();
  if (!origin || config.allowedOrigins.includes(origin)) return next();
  next(new ApiError(403, 'origin_not_allowed', 'Origen no permitido'));
}

async function verifyTurnstile(token: string, remoteIp?: string) {
  if (!config.turnstileSecretKey) {
    if (config.nodeEnv === 'production') throw new ApiError(503, 'turnstile_not_configured', 'La protección antiabuso no está configurada');
    return;
  }
  const body = new URLSearchParams({ secret: config.turnstileSecretKey, response: String(token || ''), remoteip: remoteIp || '' });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const result = await response.json() as { success?: boolean };
  if (!result.success) throw new ApiError(422, 'turnstile_failed', 'No pudimos validar la solicitud');
}

async function resendWebhook(req: Request, res: Response) {
  if (!config.resendWebhookSecret) throw new ApiError(503, 'webhook_not_configured', 'Webhook no configurado');
  const payload = req.body.toString('utf8');
  const event = new Webhook(config.resendWebhookSecret).verify(payload, {
    'svix-id': String(req.header('svix-id') || ''),
    'svix-timestamp': String(req.header('svix-timestamp') || ''),
    'svix-signature': String(req.header('svix-signature') || ''),
  }) as Record<string, unknown>;
  const id = newId('mail-event');
  await store().set('audits', id, { id, type: 'mail.webhook', actorEmail: 'resend', targetId: '', details: event, createdAt: new Date().toISOString() });
  res.status(204).end();
}

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res, next)).catch(next); };
}

function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(422).json({ error: { code: 'validation_error', message: 'Revisá los datos enviados', requestId: req.requestId, details: error.flatten() } });
  if (error instanceof Error && error.message === 'Origin not allowed') return res.status(403).json({ error: { code: 'origin_not_allowed', message: 'Origen no permitido', requestId: req.requestId } });
  const apiError = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'Ocurrió un error inesperado');
  if (apiError.status >= 500) console.error(req.requestId, error);
  return res.status(apiError.status).json({ error: { code: apiError.code, message: apiError.message, requestId: req.requestId, ...(apiError.details ? { details: apiError.details } : {}) } });
}
