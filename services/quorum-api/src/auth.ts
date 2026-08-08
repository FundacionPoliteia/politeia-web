import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Role, RoleAssignment } from '@politeia/quorum-contracts';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { store } from './store.js';

const googleClient = new OAuth2Client(config.googleClientId || undefined);

export interface SessionUser {
  email: string;
  name: string;
  picture: string;
  roles: Role[];
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request { user?: SessionUser; requestId: string; }
  }
}

export async function authenticateGoogleCredential(credential: string): Promise<SessionUser> {
  if (!config.googleClientId) throw new ApiError(500, 'google_not_configured', 'Google OAuth no está configurado');
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  const payload = ticket.getPayload();
  const email = normalizeEmail(payload?.email || '');
  if (!email || payload?.email_verified !== true) throw new ApiError(401, 'invalid_google_identity', 'La cuenta de Google no pudo verificarse');
  const roles = await resolveRoles(email);
  if (!roles.length && !isPublicAccessEmailAllowed(email)) throw new ApiError(403, 'account_not_assigned', 'La cuenta no tiene acceso asignado a Quórum');
  return { email, name: payload?.name || email, picture: payload?.picture || '', roles, csrfToken: crypto.randomBytes(24).toString('base64url') };
}

export async function resolveRoles(email: string): Promise<Role[]> {
  const cleanEmail = normalizeEmail(email);
  if (config.defaultAdminEmails.includes(cleanEmail)) return ['quorum_admin', 'quorum_editor'];
  const assignments = await store().list<RoleAssignment>('roles');
  const assignment = assignments.find((item) => item.email === cleanEmail && item.active);
  if (assignment) return expandRoles(assignment.roles);
  return [];
}

export function requirePublicAccess(req: Request, _res: Response, next: NextFunction) {
  if (!config.publicAccessRequired) return next();
  const serverKey = req.header('x-quorum-public-access-key') || '';
  if (serverKey && config.publicAccessGateSecret && safeEqual(serverKey, config.publicAccessGateSecret)) return next();
  const user = readSession(req);
  if (!user) return next(new ApiError(401, 'public_access_authentication_required', 'Iniciá sesión para acceder a esta versión de prueba'));
  if (!user.roles.length && !isPublicAccessEmailAllowed(user.email)) return next(new ApiError(403, 'public_access_not_assigned', 'Esta cuenta no está incluida en la prueba privada'));
  req.user = user;
  next();
}

export function isPublicAccessEmailAllowed(email: string) {
  if (!config.publicAccessRequired) return false;
  const cleanEmail = normalizeEmail(email);
  const domain = cleanEmail.split('@')[1] || '';
  return config.publicAccessAllowedEmails.includes(cleanEmail) || config.publicAccessAllowedDomains.includes(domain);
}

export function buildSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readSession(req: Request): SessionUser | null {
  if ((config.devAuth || process.env.DEV_AUTH === 'true') && config.nodeEnv !== 'production') {
    return { email: config.devAuthEmail, name: 'Desarrollo local', picture: '', roles: ['quorum_admin', 'quorum_editor'], csrfToken: 'dev-csrf' };
  }
  const token = readCookie(req, config.sessionCookieName);
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser & { exp: number };
    if (!value.exp || value.exp < Date.now()) return null;
    return { email: value.email, name: value.name, picture: value.picture, roles: expandRoles(value.roles), csrfToken: value.csrfToken };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) return next(new ApiError(401, 'authentication_required', 'Iniciá sesión para continuar'));
  req.user = user;
  next();
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (expandRoles(req.user?.roles || []).includes(role)) return next();
    next(new ApiError(403, 'insufficient_role', 'No tenés permisos para realizar esta acción'));
  };
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  if ((config.devAuth || process.env.DEV_AUTH === 'true') && config.nodeEnv !== 'production') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.header('x-csrf-token') || '';
  if (!req.user || !token || !safeEqual(token, req.user.csrfToken)) return next(new ApiError(403, 'csrf_invalid', 'La sesión de edición venció; volvé a ingresar'));
  next();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
    ...(config.sessionCookieDomain ? { domain: config.sessionCookieDomain } : {}),
  };
}

export function expandRoles(roles: Role[]): Role[] {
  const result = new Set<Role>(roles);
  if (result.has('quorum_admin')) result.add('quorum_editor');
  return ['quorum_admin', 'quorum_editor'].filter((role) => result.has(role as Role)) as Role[];
}

function readCookie(req: Request, name: string) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
