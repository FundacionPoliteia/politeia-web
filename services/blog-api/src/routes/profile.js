import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { HttpError } from '../errors.js';
import {
  getPublicAuthorProfileBySlug,
  getUserProfile,
  updateUserProfile,
} from '../repositories/profiles.js';

export function profileRouter({ writeLimiter }) {
  const router = Router();

  router.get('/public/:slug', async (req, res, next) => {
    try {
      const item = await getPublicAuthorProfileBySlug(req.params.slug);
      if (!item) throw new HttpError(404, 'Author profile not found');
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

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
