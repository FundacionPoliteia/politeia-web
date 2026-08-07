import crypto from 'node:crypto';
import type { Subscription } from '@politeia/quorum-contracts';
import { ApiError, notFound } from './errors.js';
import { getSettings } from './contentService.js';
import { newId, store } from './store.js';

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export async function requestFollow(input: unknown) {
  const body = input as Record<string, unknown>;
  const email = String(body?.email || '').trim().toLowerCase();
  const projectId = String(body?.projectId || '').trim();
  const consent = body?.consent === true;
  if (!/^\S+@\S+\.\S+$/.test(email) || !projectId || !consent) throw new ApiError(422, 'follow_invalid', 'Ingresá un email válido y aceptá la política de privacidad');
  const settings = await getSettings();
  if (!settings.subscriptionsEnabled || !settings.privacyPolicyApproved) throw new ApiError(503, 'subscriptions_disabled', 'El seguimiento por correo todavía no está habilitado');
  const project = await store().get<{ id: string; title: string; status: string }>('publicProjects', projectId);
  if (!project || project.status !== 'published') throw notFound('Proyecto');
  const id = emailId(email);
  const existing = await store().get<Subscription>('subscriptions', id);
  const timestamp = new Date().toISOString();
  const subscription: Subscription = {
    id,
    email,
    projectIds: [...new Set([...(existing?.projectIds || []), projectId])],
    status: existing?.status === 'active' ? 'active' : 'pending',
    consentAt: timestamp,
    confirmedAt: existing?.confirmedAt || null,
    updatedAt: timestamp,
  };
  await store().set('subscriptions', id, subscription);
  if (subscription.status === 'active') return { status: 'active' as const };
  const token = await createToken(id, 'confirm');
  const jobId = newId('mail');
  await store().set('mailJobs', jobId, {
    id: jobId, type: 'follow-confirmation', subscriptionId: id, projectId, token,
    status: 'pending', attempts: 0, createdAt: timestamp, updatedAt: timestamp,
  });
  return { status: 'pending' as const, ...(process.env.NODE_ENV !== 'production' ? { debugToken: token } : {}) };
}

export async function confirmFollow(token: string) {
  const record = await consumeToken(token, 'confirm');
  const subscription = await store().get<Subscription>('subscriptions', record.subscriptionId);
  if (!subscription) throw notFound('Suscripción');
  const updated: Subscription = { ...subscription, status: 'active', confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await store().set('subscriptions', updated.id, updated);
  const manageToken = await createToken(updated.id, 'manage', 365 * 24 * 60 * 60 * 1000);
  return { subscription: updated, manageToken };
}

export async function getPreferences(token: string) {
  const record = await readToken(token, 'manage');
  const subscription = await store().get<Subscription>('subscriptions', record.subscriptionId);
  if (!subscription || subscription.status === 'deleted') throw notFound('Suscripción');
  return subscription;
}

export async function updatePreferences(token: string, projectIds: string[]) {
  const record = await readToken(token, 'manage');
  const subscription = await store().get<Subscription>('subscriptions', record.subscriptionId);
  if (!subscription) throw notFound('Suscripción');
  const updated: Subscription = { ...subscription, projectIds: [...new Set(projectIds)], status: projectIds.length ? 'active' : 'unsubscribed', updatedAt: new Date().toISOString() };
  await store().set('subscriptions', updated.id, updated);
  return updated;
}

export async function deleteSubscription(token: string) {
  const record = await readToken(token, 'manage');
  const subscription = await store().get<Subscription>('subscriptions', record.subscriptionId);
  if (!subscription) throw notFound('Suscripción');
  const updated: Subscription = { ...subscription, email: `deleted-${subscription.id}@invalid.local`, projectIds: [], status: 'deleted', updatedAt: new Date().toISOString() };
  await store().set('subscriptions', updated.id, updated);
  return { deleted: true };
}

export async function exportSubscription(token: string) {
  const subscription = await getPreferences(token);
  return { exportedAt: new Date().toISOString(), data: subscription };
}

export async function createManageTokenForSubscription(subscriptionId: string) {
  return createToken(subscriptionId, 'manage', 365 * 24 * 60 * 60 * 1000);
}

async function createToken(subscriptionId: string, purpose: 'confirm' | 'manage', ttl = TOKEN_TTL_MS) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  await store().set('subscriptionTokens', hash, { id: hash, subscriptionId, purpose, expiresAt: new Date(Date.now() + ttl).toISOString(), usedAt: null });
  return token;
}

async function readToken(token: string, purpose: 'confirm' | 'manage') {
  const record = await store().get<{ id: string; subscriptionId: string; purpose: string; expiresAt: string; usedAt: string | null }>('subscriptionTokens', tokenHash(token));
  if (!record || record.purpose !== purpose || new Date(record.expiresAt).getTime() < Date.now() || (purpose === 'confirm' && record.usedAt)) {
    throw new ApiError(400, 'token_invalid', 'El enlace no es válido o venció');
  }
  return record;
}

async function consumeToken(token: string, purpose: 'confirm') {
  const record = await readToken(token, purpose);
  await store().set('subscriptionTokens', record.id, { ...record, usedAt: new Date().toISOString() });
  return record;
}

function tokenHash(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function emailId(email: string) { return crypto.createHash('sha256').update(email).digest('hex'); }
