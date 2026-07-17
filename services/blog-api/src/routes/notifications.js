import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getNotificationPreferences,
  listInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from '../repositories/notifications.js';

export function notificationsRouter({ writeLimiter }) {
  const router = Router();

  router.get('/preferences', requireAuth, async (req, res, next) => {
    try {
      const item = await getNotificationPreferences(req.user);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/preferences', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await updateNotificationPreferences(req.user, req.body || {});
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.get('/inbox', requireAuth, async (req, res, next) => {
    try {
      const result = await listInAppNotifications(req.user, { limit: req.query.limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:eventId/read', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await markNotificationRead(req.params.eventId, req.user);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/read-all', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const result = await markAllNotificationsRead(req.user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
