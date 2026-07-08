import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from './config.js';
import { HttpError } from './errors.js';
import {
  isAllowedAssignedExternalEmail,
  isPrimaryDomainEmail,
  resolveAssignedRoles,
} from './repositories/users.js';

const oauthClient = new OAuth2Client(config.googleClientId || undefined);
const roleCache = new Map();

export function clearRoleCache(email = '') {
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail) {
    roleCache.delete(cleanEmail);
    return;
  }
  roleCache.clear();
}

export function attachRequestContext(req, _res, next) {
  req.requestId = req.header('x-request-id') || crypto.randomUUID();
  next();
}

export async function requireAuth(req, _res, next) {
  try {
    req.user = await authenticate(req);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(requiredRole) {
  return (req, _res, next) => {
    const roles = expandRoles(req.user?.roles || []);
    if (roles.includes(requiredRole)) return next();
    next(new HttpError(403, 'Insufficient role'));
  };
}

export function requireAnyRole(requiredRoles) {
  return (req, _res, next) => {
    const roles = expandRoles(req.user?.roles || []);
    if (requiredRoles.some((role) => roles.includes(role))) return next();
    next(new HttpError(403, 'Insufficient role'));
  };
}

async function authenticate(req) {
  if (config.devAuth && config.nodeEnv !== 'production') {
    return {
      email: config.devAuthEmail,
      name: 'Local Developer',
      roles: expandRoles(config.devAuthRoles),
      authMode: 'dev',
    };
  }

  const sessionUser = await readSessionUser(req);
  if (sessionUser) return sessionUser;

  const token = readBearerToken(req);
  if (!token) throw new HttpError(401, 'Missing bearer token');
  return authenticateGoogleCredential(token);
}

export async function authenticateGoogleCredential(token) {
  if (!config.googleClientId) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');

  const ticket = await oauthClient.verifyIdToken({
    idToken: token,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  const email = normalizeEmail(payload?.email);
  if (!email) throw new HttpError(401, 'Google token has no email');
  if (payload?.email_verified !== true) throw new HttpError(401, 'Google email is not verified');
  const assignedRoles = await resolveAssignedRoles(email);
  if (!isPrimaryDomainEmail(email) && !hasAssignedExternalAccess(email, assignedRoles)) {
    throw new HttpError(401, `Only @${config.allowedEmailDomain} accounts or assigned @${config.allowedAssignedEmailDomains.join(', @')} accounts can access this service`);
  }

  const roles = expandRoles(await resolveRoles(email, assignedRoles));
  return {
    email,
    name: payload.name || email,
    picture: payload.picture || '',
    roles,
    authMode: 'google',
  };
}

export function buildSessionCookie(user) {
  if (!config.sessionSecret) throw new HttpError(500, 'SESSION_SECRET is not configured');

  const now = Date.now();
  const payload = {
    email: user.email,
    name: user.name || user.email,
    picture: user.picture || '',
      roles: expandRoles(user.roles),
    authMode: 'session',
    iat: now,
    exp: now + config.sessionTtlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signSessionBody(body);
  return `${body}.${signature}`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
    maxAge: config.sessionTtlMs,
    path: '/',
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
    path: '/',
  };
}

function readBearerToken(req) {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

async function readSessionUser(req) {
  const token = readCookie(req, config.sessionCookieName);
  if (!token) return null;
  const user = verifySessionCookie(token);
  if (!user) return null;
  const builtInRoles = resolveBuiltInRoles(user.email);
  if (builtInRoles.length) {
    return {
      ...user,
      roles: expandRoles([...(user.roles || []), ...builtInRoles]),
    };
  }
  if (isPrimaryDomainEmail(user.email)) return user;

  const assignedRoles = await resolveAssignedRoles(user.email);
  if (!hasAssignedExternalAccess(user.email, assignedRoles)) return null;
  return {
    ...user,
    roles: expandRoles(assignedRoles),
  };
}

export function verifySessionCookie(token) {
  if (!config.sessionSecret) throw new HttpError(500, 'SESSION_SECRET is not configured');

  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = signSessionBody(body);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    const email = normalizeEmail(payload.email);
    const roles = expandRoles(payload.roles);
    if (!email || !isAllowedSessionEmail(email, roles)) return null;
    return {
      email,
      name: payload.name || email,
      picture: payload.picture || '',
      roles,
      authMode: 'session',
    };
  } catch (_err) {
    return null;
  }
}

function signSessionBody(body) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(body)
    .digest('base64url');
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(req, name) {
  const header = req.header('cookie') || '';
  const cookies = header.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return '';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isAllowedSessionEmail(email, roles) {
  if (isPrimaryDomainEmail(email)) return true;
  return hasAssignedExternalAccess(email, roles);
}

function hasAssignedExternalAccess(email, assignedRoles) {
  return isAllowedAssignedExternalEmail(email) && expandRoles(assignedRoles).length > 0;
}

async function resolveRoles(email, assignedRoles = null) {
  const cached = roleCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.roles;

  const roles = resolveBuiltInRoles(email);
  if (!roles.includes('admin')) {
    if (isPrimaryDomainEmail(email) && config.adminGroupEmail && await isGroupMember(email, config.adminGroupEmail)) {
      roles.push('admin');
    } else if (isPrimaryDomainEmail(email) && config.reviewerGroupEmail && await isGroupMember(email, config.reviewerGroupEmail)) {
      roles.push('reviewer');
    } else if (isPrimaryDomainEmail(email) && config.blogGroupEmail && await isGroupMember(email, config.blogGroupEmail)) {
      roles.push('blog');
    }
  }
  roles.push(...(assignedRoles || await resolveAssignedRoles(email)));

  const expandedRoles = expandRoles(roles);
  roleCache.set(email, { roles: expandedRoles, expiresAt: Date.now() + config.roleCacheTtlMs });
  return expandedRoles;
}

export function expandRoles(value) {
  const roles = new Set(Array.isArray(value) ? value : []);
  if (roles.has('admin')) {
    roles.add('reviewer');
    roles.add('blog');
  }
  if (roles.has('reviewer')) roles.add('blog');
  return ['admin', 'reviewer', 'blog'].filter((role) => roles.has(role));
}

export function resolveBuiltInRoles(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return [];
  return config.defaultAdminEmails.includes(cleanEmail) ? ['admin'] : [];
}

async function isGroupMember(memberEmail, groupEmail) {
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/cloud-identity.groups.readonly'],
  });
  const cloudidentity = google.cloudidentity({ version: 'v1', auth });
  const lookup = await cloudidentity.groups.lookup({ 'groupKey.id': groupEmail });
  const groupName = lookup.data.name;
  if (!groupName) return false;

  const response = await cloudidentity.groups.memberships.checkTransitiveMembership({
    parent: groupName,
    query: `member_key_id == '${memberEmail}'`,
  });

  return response.data.hasMembership === true;
}
