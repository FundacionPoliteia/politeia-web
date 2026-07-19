import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import {
  confirmNewsletterSubscription,
  createNewsletterCampaign,
  getNewsletterOverview,
  requestNewsletterSubscription,
  sendNewsletterTest,
  unsubscribeNewsletter,
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
      await unsubscribeNewsletter(req.query.token);
      res.redirect(303, publicStatusUrl('baja'));
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

  router.post('/admin/test', writeLimiter, async (req, res, next) => {
    try {
      const item = await sendNewsletterTest({ ...req.body, actorEmail: req.user.email });
      res.json({ item });
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

function publicStatusUrl(status) {
  const url = new URL('/blog', config.publicSiteUrl);
  url.searchParams.set('newsletter', status);
  url.hash = 'news';
  return url.toString();
}
