import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import {
  createTeamApplication,
  deleteTeamApplication,
  downloadTeamApplicationCv,
  getTeamApplication,
  listTeamApplications,
  resendApplicationNotification,
  updateTeamApplication,
} from '../repositories/applications.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const publicLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

export function applicationsRouter({ writeLimiter }) {
  const router = Router();

  router.post('/', publicLimiter, uploadCv, async (req, res, next) => {
    try {
      if (String(req.body.website || '').trim()) return res.status(202).json({ ok: true });
      await verifyTurnstile(req.body.turnstileToken, req.ip);
      const result = await createTeamApplication({
        body: req.body,
        file: req.file,
        idempotencyKey: req.get('Idempotency-Key'),
        requestMeta: { country: req.get('CF-IPCountry') },
      });
      res.status(result.duplicate ? 200 : 201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.use('/manage', requireAuth, requireRole('admin'));

  router.get('/manage', async (req, res, next) => {
    try {
      res.json(await listTeamApplications(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get('/manage/:id', async (req, res, next) => {
    try {
      res.json({ item: await getTeamApplication(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/manage/:id/cv', async (req, res, next) => {
    try {
      const { item, stream } = await downloadTeamApplicationCv(req.params.id, req.user.email);
      res.setHeader('Content-Type', item.cv.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.cv.originalName)}"`);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/manage/:id', writeLimiter, async (req, res, next) => {
    try {
      res.json({ item: await updateTeamApplication(req.params.id, req.body || {}, req.user.email) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/manage/:id/resend-notification', writeLimiter, async (req, res, next) => {
    try {
      res.json({ item: await resendApplicationNotification(req.params.id, req.user.email) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/manage/:id', writeLimiter, async (req, res, next) => {
    try {
      await deleteTeamApplication(req.params.id, req.user.email);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function uploadCv(req, res, next) {
  upload.single('cv')(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(400, 'El CV no puede superar los 5 MB'));
      return;
    }
    next(error);
  });
}

async function verifyTurnstile(token, remoteIp) {
  if (!config.turnstileSecretKey) {
    if (config.nodeEnv !== 'production') return;
    throw new HttpError(503, 'La validacion anti-spam no esta disponible');
  }
  if (!token) throw new HttpError(400, 'Completa la validacion anti-spam');
  const body = new URLSearchParams({
    secret: config.turnstileSecretKey,
    response: String(token),
    remoteip: String(remoteIp || ''),
  });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new HttpError(400, 'No pudimos validar el envio. Intenta nuevamente');
}
