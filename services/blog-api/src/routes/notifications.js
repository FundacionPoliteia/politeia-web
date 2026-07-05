import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getNotificationPreferences,
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

  return router;
}
