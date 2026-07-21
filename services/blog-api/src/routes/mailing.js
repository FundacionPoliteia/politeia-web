import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import {
  dispatchMailing,
  getMailingAdminOverview,
  listMailingJobs,
  renderMailingPreview,
  sendMailingTest,
  updateMailingJobs,
  updateMailingSettings,
} from '../repositories/mailingAutomation.js';

export function mailingRouter({ writeLimiter }) {
  const router = Router();

  router.post('/dispatch', writeLimiter, async (req, res, next) => {
    try {
      requireDispatchToken(req);
      res.json(await dispatchMailing());
    } catch (err) {
      next(err);
    }
  });

  router.get('/publication-policy', requireAuth, requireRole('reviewer'), async (_req, res, next) => {
    try {
      const overview = await getMailingAdminOverview();
      res.json({
        enabled: overview.settings.enabled,
        automaticByDefault: overview.settings.automaticByDefault,
        weeklyLimit: overview.settings.weeklyLimit,
        dispatchIntervalHours: overview.settings.dispatchIntervalHours,
        gracePeriodMinutes: overview.settings.gracePeriodMinutes,
        sentThisWeek: overview.sentThisWeek,
        remainingThisWeek: overview.remainingThisWeek,
        nextDispatchAt: overview.nextDispatchAt,
      });
    } catch (err) {
      next(err);
    }
  });

  router.use('/admin', requireAuth, requireRole('admin'));

  router.get('/admin/overview', async (_req, res, next) => {
    try {
      const [overview, jobs] = await Promise.all([getMailingAdminOverview(), listMailingJobs()]);
      res.json({ ...overview, jobs: jobs.items });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/admin/settings', writeLimiter, async (req, res, next) => {
    try {
      res.json({ item: await updateMailingSettings(req.body || {}, req.user.email) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/preview', async (req, res, next) => {
    try {
      res.json(await renderMailingPreview(req.body || {}));
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/test', writeLimiter, async (req, res, next) => {
    try {
      res.json({ item: await sendMailingTest(req.body || {}, req.user.email) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/jobs/actions', writeLimiter, async (req, res, next) => {
    try {
      res.json(await updateMailingJobs(req.body || {}, req.user.email));
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/dispatch', writeLimiter, async (_req, res, next) => {
    try {
      res.json(await dispatchMailing({ force: true }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function requireDispatchToken(req) {
  if (!config.mailingDispatchToken) throw new HttpError(503, 'MAILING_DISPATCH_TOKEN is not configured');
  const authorization = String(req.get('authorization') || '');
  const token = authorization.replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(config.mailingDispatchToken);
  const actual = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, 'Invalid mailing dispatch token');
}
