import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getUserUiPreferences, updateUserUiPreferences } from '../repositories/uiPreferences.js';

export function uiPreferencesRouter({ writeLimiter }) {
  const router = Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const item = await getUserUiPreferences(req.user.email);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await updateUserUiPreferences(req.user.email, req.body || {});
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
