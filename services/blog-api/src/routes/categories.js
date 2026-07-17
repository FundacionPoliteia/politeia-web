import { Router } from 'express';
import { requireAnyRole, requireAuth } from '../auth.js';
import { createCategory, deleteCategory, listCategories } from '../repositories/categories.js';
import { assertNonEmptyString } from '../utils/validation.js';

export function categoriesRouter({ writeLimiter }) {
  const router = Router();

  router.get('/', requireAuth, requireAnyRole(['blog', 'reviewer']), async (_req, res, next) => {
    try {
      const result = await listCategories();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', writeLimiter, requireAuth, requireAnyRole(['blog', 'reviewer']), async (req, res, next) => {
    try {
      assertNonEmptyString(req.body.name, 'name');
      const category = await createCategory(req.body.name, req.user.email);
      res.status(201).json({ item: category });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', writeLimiter, requireAuth, requireAnyRole(['admin', 'reviewer']), async (req, res, next) => {
    try {
      const category = await deleteCategory(req.params.id, req.user.email);
      res.json({ item: category });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
