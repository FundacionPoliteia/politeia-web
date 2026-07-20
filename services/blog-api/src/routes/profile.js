import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError } from '../errors.js';
import {
  createManagedAuthorProfile,
  deleteManagedAuthorProfile,
  getPublicAuthorProfileBySlug,
  getUserProfile,
  listPublicAuthorProfiles,
  listUserProfiles,
  updateAuthorProfileAsAdmin,
  updateUserProfile,
} from '../repositories/profiles.js';
import {
  approveProfileClaim,
  blockProfileClaim,
  createProfileClaim,
  getProfileClaimMatch,
  listManagedProfileClaims,
  listMyProfileClaims,
  releaseProfileClaim,
  withdrawProfileClaim,
} from '../repositories/profileClaims.js';

export function profileRouter({ writeLimiter }) {
  const router = Router();

  router.get('/public', async (req, res, next) => {
    try {
      const result = await listPublicAuthorProfiles({ limit: req.query.limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/public/:slug', async (req, res, next) => {
    try {
      const item = await getPublicAuthorProfileBySlug(req.params.slug);
      if (!item) throw new HttpError(404, 'Author profile not found');
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.get('/manage', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
      const result = await listUserProfiles();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/manage/claims', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
      res.json(await listManagedProfileClaims());
    } catch (err) {
      next(err);
    }
  });

  router.post('/manage/claims/:id/approve', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await approveProfileClaim(req.params.id, req.user);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/manage/claims/:id/block', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await blockProfileClaim(req.params.id, req.user, req.body || {});
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/manage/claims/:id/release', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await releaseProfileClaim(req.params.id, req.user);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/manage', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await createManagedAuthorProfile(req.body || {}, req.user.email);
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/manage/:id', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await updateAuthorProfileAsAdmin(req.params.id, req.body || {}, req.user.email);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/manage/:id', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const item = await deleteManagedAuthorProfile(req.params.id, req.user.email);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.get('/claim-match', requireAuth, async (req, res, next) => {
    try {
      res.json(await getProfileClaimMatch(req.user));
    } catch (err) {
      next(err);
    }
  });

  router.get('/claims/me', requireAuth, async (req, res, next) => {
    try {
      res.json(await listMyProfileClaims(req.user));
    } catch (err) {
      next(err);
    }
  });

  router.post('/claims', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await createProfileClaim(req.user, req.body || {});
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/claims/:id/withdraw', writeLimiter, requireAuth, async (req, res, next) => {
    try {
      const item = await withdrawProfileClaim(req.params.id, req.user);
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
