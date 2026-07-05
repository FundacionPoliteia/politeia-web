import { Router } from 'express';
import { clearRoleCache, requireAuth, requireRole } from '../auth.js';
import { HttpError } from '../errors.js';
import {
  deleteUserRoleAssignment,
  isPrimaryDomainEmail,
  listUserRoleAssignments,
  upsertUserRoleAssignment,
} from '../repositories/users.js';
import { notifyRolesChanged, safeNotify } from '../repositories/notifications.js';

export function usersRouter({ writeLimiter }) {
  const router = Router();

  router.use(requireAuth, requireRole('admin'), requirePrimaryDomainAdmin);

  router.get('/', async (_req, res, next) => {
    try {
      const result = await listUserRoleAssignments();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:email/roles', writeLimiter, async (req, res, next) => {
    try {
      const item = await upsertUserRoleAssignment(req.params.email, req.body?.roles || [], req.user.email);
      clearRoleCache(item.email);
      await safeNotify(() => notifyRolesChanged(item, req.user.email));
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:email', writeLimiter, async (req, res, next) => {
    try {
      const item = await deleteUserRoleAssignment(req.params.email, req.user.email);
      clearRoleCache(item.email);
      await safeNotify(() => notifyRolesChanged(item, req.user.email));
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function requirePrimaryDomainAdmin(req, _res, next) {
  if (isPrimaryDomainEmail(req.user?.email)) return next();
  return next(new HttpError(403, 'Only primary-domain admins can manage role assignments'));
}
