import { Router } from 'express';
import {
  authenticateGoogleCredential,
  buildSessionCookie,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from '../auth.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

export const authRouter = Router();

authRouter.post('/google', async (req, res, next) => {
  try {
    const credential = req.body?.credential;
    if (typeof credential !== 'string' || !credential.trim()) {
      throw new HttpError(400, 'credential is required');
    }

    const user = await authenticateGoogleCredential(credential);
    const session = buildSessionCookie(user);
    res.cookie(config.sessionCookieName, session, sessionCookieOptions());
    res.json({ user: { ...user, authMode: 'session' } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(config.sessionCookieName, clearSessionCookieOptions());
  res.json({ ok: true });
});
