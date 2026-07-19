import { config } from '../config.js';
import { db, serializeDoc } from '../firestore.js';
import { HttpError } from '../errors.js';
import { MAIL_CHANNELS } from '../mail/provider.js';
import { createMailDelivery } from './mail.js';

const requestLogs = () => db().collection('apiRequestLogs');
const deliveries = () => db().collection('emailDeliveries');

export async function recordApiRequest(entry = {}) {
  if (!config.apiRequestLogsEnabled) return null;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.apiRequestLogsRetentionDays * 24 * 60 * 60 * 1000);
  const item = {
    projectKey: config.mailProjectKey,
    requestId: cleanText(entry.requestId, 120),
    method: cleanMethod(entry.method),
    path: cleanPath(entry.path),
    area: requestArea(entry.path),
    queryKeys: cleanQueryKeys(entry.queryKeys),
    status: cleanNumber(entry.status, 0, 599),
    durationMs: cleanNumber(entry.durationMs, 0, 60 * 60 * 1000),
    responseBytes: cleanNumber(entry.responseBytes, 0, Number.MAX_SAFE_INTEGER),
    actorEmail: cleanEmail(entry.actorEmail),
    originHost: cleanOriginHost(entry.origin),
    errorMessage: redactSecrets(cleanText(entry.errorMessage, 500)),
    aborted: Boolean(entry.aborted),
    createdAt,
    expiresAt,
  };
  const ref = await requestLogs().add(item);
  return { id: ref.id, ...item };
}

export async function listApiRequestLogs({ limit = 250 } = {}) {
  const cleanLimit = Math.min(Math.max(Number(limit) || 250, 1), 500);
  const snapshot = await requestLogs().orderBy('createdAt', 'desc').limit(cleanLimit).get();
  return {
    items: snapshot.docs
      .map(serializeDoc)
      .filter((item) => item.projectKey === config.mailProjectKey),
    limit: cleanLimit,
    retentionDays: config.apiRequestLogsRetentionDays,
  };
}

export async function listMailOperationLogs({ limit = 200 } = {}) {
  const cleanLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const snapshot = await deliveries().orderBy('createdAt', 'desc').limit(cleanLimit).get();
  const items = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey)
    .map((item) => ({
      id: item.id,
      channel: item.channel || '',
      type: item.type || '',
      recipientEmail: item.recipientEmail || '',
      subject: item.subject || '',
      status: item.status || '',
      provider: item.provider || '',
      attempts: Number(item.attempts || 0),
      lastError: redactSecrets(item.lastError || ''),
      providerMessageId: item.providerMessageId || '',
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      sentAt: item.sentAt || null,
      deliveredAt: item.deliveredAt || null,
      providerStatus: item.providerStatus || '',
      providerStatusAt: item.providerStatusAt || null,
    }));
  return { items, limit: cleanLimit };
}

export async function sendAdminResendTest(user, requestId) {
  if (config.mailProvider !== 'resend') {
    throw new HttpError(409, `MAIL_PROVIDER is ${config.mailProvider}; set it to resend before running a real test`);
  }
  if (!config.resendApiKey) throw new HttpError(503, 'RESEND_API_KEY is not configured');
  const recipientEmail = cleanEmail(user?.email);
  if (!recipientEmail) throw new HttpError(400, 'Authenticated admin email is required');
  const now = new Date();
  const item = await createMailDelivery({
    channel: MAIL_CHANNELS.internal,
    type: 'admin.resend.test',
    recipient: { email: recipientEmail, name: user?.name || recipientEmail },
    subject: 'Prueba operativa de Resend - Politeia',
    text: `Esta es una prueba administrativa enviada el ${now.toISOString()}. Request ID: ${requestId}`,
    html: `<p>Esta es una prueba administrativa de Resend para Politeia.</p><p><strong>Fecha:</strong> ${escapeHtml(now.toISOString())}</p><p><strong>Request ID:</strong> ${escapeHtml(requestId)}</p>`,
    idempotencyKey: `admin-resend-test:${requestId}`,
  });
  if (item.status === 'failed') {
    throw new HttpError(502, 'Resend rejected the test email', {
      providerError: item.lastError || 'Unknown provider error',
    });
  }
  return sanitizeMailLog(item);
}

function sanitizeMailLog(item = {}) {
  return {
    id: item.id,
    channel: item.channel || '',
    type: item.type || '',
    recipientEmail: item.recipientEmail || '',
    subject: item.subject || '',
    status: item.status || '',
    provider: item.provider || '',
    attempts: Number(item.attempts || 0),
    lastError: redactSecrets(item.lastError || ''),
    providerMessageId: item.providerMessageId || '',
    createdAt: item.createdAt || null,
    sentAt: item.sentAt || null,
  };
}

function requestArea(value = '') {
  const parts = cleanPath(value).split('/').filter(Boolean);
  return parts[0] === 'v1' ? parts[1] || 'api' : parts[0] || 'root';
}

function cleanQueryKeys(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => cleanText(item, 80)).filter(Boolean);
}

function cleanMethod(value) {
  return cleanText(value, 12).toUpperCase();
}

function cleanPath(value) {
  const path = cleanText(value, 320).split('?')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanOriginHost(value) {
  try {
    return new URL(String(value || '')).host.slice(0, 255);
  } catch {
    return '';
  }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

function cleanNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(Math.round(number), min), max);
}

function redactSecrets(value = '') {
  return String(value)
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/\bre_[A-Za-z0-9_-]{12,}\b/g, '[redacted-resend-key]')
    .replace(/([?&](?:token|credential|secret|key)=)[^\s&]+/gi, '$1[redacted]')
    .slice(0, 500);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
