import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import {
  listApiRequestLogs,
  listMailOperationLogs,
  sendAdminResendTest,
} from '../repositories/operations.js';

export function adminOperationsRouter({ writeLimiter }) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/logs/requests', async (req, res, next) => {
    try {
      res.json(await listApiRequestLogs({ limit: req.query.limit }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/logs/mail', async (req, res, next) => {
    try {
      res.json(await listMailOperationLogs({ limit: req.query.limit }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/logs/resend-test', writeLimiter, async (req, res, next) => {
    try {
      const item = await sendAdminResendTest(req.user, req.requestId);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
