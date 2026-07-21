import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import {
  confirmNewsletterSubscription,
  createNewsletterCampaign,
  createNewsletterTemplate,
  deleteNewsletterTemplate,
  getNewsletterOverview,
  getNewsletterPreferences,
  listNewsletterSubscribers,
  listNewsletterTemplates,
  requestNewsletterSubscription,
  requestNewsletterPreferences,
  renderNewsletterPreview,
  sendNewsletterTest,
  updateNewsletterPreferences,
} from '../repositories/newsletter.js';

export function newsletterRouter({ writeLimiter }) {
  const router = Router();

  router.post('/subscribe', writeLimiter, async (req, res, next) => {
    try {
      if (String(req.body?.website || '').trim()) return res.status(202).json({ accepted: true });
      await requestNewsletterSubscription({
        email: req.body?.email,
        source: req.body?.source || 'blog',
        locale: req.body?.locale || 'es-AR',
        topics: req.body?.topics,
      });
      res.status(202).json({ accepted: true, message: 'Revisa tu email para confirmar la suscripcion.' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/confirm', async (req, res, next) => {
    try {
      await confirmNewsletterSubscription(req.query.token);
      res.redirect(303, publicStatusUrl('confirmado'));
    } catch (err) {
      if (err.status && err.status < 500) return res.redirect(303, publicStatusUrl('error'));
      next(err);
    }
  });

  router.get('/unsubscribe', async (req, res, next) => {
    try {
      res.redirect(303, publicStatusUrl('preferencias', { token: req.query.token }));
    } catch (err) {
      if (err.status && err.status < 500) return res.redirect(303, publicStatusUrl('error'));
      next(err);
    }
  });

  router.use('/admin', requireAuth, requireRole('newsletter'));

  router.get('/admin/overview', async (_req, res, next) => {
    try {
      res.json(await getNewsletterOverview());
    } catch (err) {
      next(err);
    }
  });

  router.post('/preferences/request', writeLimiter, async (req, res, next) => {
    try {
      await requestNewsletterPreferences(req.body?.email);
      res.status(202).json({ accepted: true, message: 'Revisa tu email para administrar tus preferencias.' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/preferences', async (req, res, next) => {
    try {
      res.json(await getNewsletterPreferences(req.query.token));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/preferences', writeLimiter, async (req, res, next) => {
    try {
      res.json(await updateNewsletterPreferences(req.body?.token, req.body?.topics));
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/subscribers', async (req, res, next) => {
    try {
      res.json(await listNewsletterSubscribers({
        status: req.query.status,
        limit: req.query.limit,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/templates', async (_req, res, next) => {
    try {
      res.json(await listNewsletterTemplates());
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/templates', writeLimiter, async (req, res, next) => {
    try {
      const item = await createNewsletterTemplate(req.body || {}, req.user.email);
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/templates/:templateId', writeLimiter, async (req, res, next) => {
    try {
      res.json({ item: await deleteNewsletterTemplate(req.params.templateId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/test', writeLimiter, async (req, res, next) => {
    try {
      const item = await sendNewsletterTest({ ...req.body, actorEmail: req.user.email });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/preview', async (req, res, next) => {
    try {
      res.json(renderNewsletterPreview(req.body || {}));
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/campaigns', writeLimiter, async (req, res, next) => {
    try {
      const item = await createNewsletterCampaign(req.body || {}, req.user.email);
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function publicStatusUrl(status, params = {}) {
  const url = new URL('/blog', config.publicSiteUrl);
  url.searchParams.set('newsletter', status);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, String(value));
  });
  url.hash = 'news';
  return url.toString();
}
