import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getUserProfile,
  updateUserProfile,
} from '../repositories/profiles.js';

export function profileRouter({ writeLimiter }) {
  const router = Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const item = await getUserProfile(req.user);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await updateUserProfile(req.user, req.body || {});
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
