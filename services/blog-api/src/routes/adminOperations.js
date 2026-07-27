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
      res.json(await listApiRequestLogs({
        limit: req.query.limit,
        pageToken: req.query.pageToken,
        from: req.query.from,
        to: req.query.to,
        method: req.query.method,
        status: req.query.status,
        path: req.query.path,
        requestId: req.query.requestId,
        text: req.query.text,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/logs/mail', async (req, res, next) => {
    try {
      res.json(await listMailOperationLogs({
        limit: req.query.limit,
        cursor: req.query.cursor,
      }));
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
