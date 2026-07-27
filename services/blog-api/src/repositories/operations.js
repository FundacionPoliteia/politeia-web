import { config } from '../config.js';
import { db, hasFirestoreTestOverride, serializeDoc, Timestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { MAIL_CHANNELS } from '../mail/provider.js';
import { createMailDelivery } from './mail.js';
import { GoogleAuth } from 'google-auth-library';

const requestLogs = () => db().collection('apiRequestLogs');
const deliveries = () => db().collection('emailDeliveries');

export async function recordApiRequest(entry = {}) {
  if (!config.apiRequestFirestoreLogsEnabled && !config.apiRequestLogsEnabled) return null;
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

export async function listApiRequestLogs({
  limit = 50,
  pageToken = '',
  from = '',
  to = '',
  method = '',
  status = '',
  path = '',
  requestId = '',
  text = '',
} = {}) {
  const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
  if (!hasFirestoreTestOverride()) {
    return listCloudApiRequestLogs({
      limit: cleanLimit,
      pageToken,
      from,
      to,
      method,
      status,
      path,
      requestId,
      text,
    });
  }
  const snapshot = await requestLogs().orderBy('createdAt', 'desc').limit(cleanLimit).get();
  return {
    items: snapshot.docs
      .map(serializeDoc)
      .filter((item) => item.projectKey === config.mailProjectKey),
    limit: cleanLimit,
    retentionDays: config.apiRequestLogsRetentionDays,
    nextPageToken: '',
  };
}

export async function listMailOperationLogs({ limit = 50, cursor = '' } = {}) {
  const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
  let query = deliveries().orderBy('createdAt', 'desc').limit(cleanLimit + 1);
  if (cursor && !hasFirestoreTestOverride()) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) query = query.startAfter(Timestamp.fromDate(cursorDate));
  }
  const snapshot = await query.get();
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
  const page = items.slice(0, cleanLimit);
  return {
    items: page,
    limit: cleanLimit,
    nextCursor: items.length > cleanLimit ? page[page.length - 1]?.createdAt || '' : '',
  };
}

async function listCloudApiRequestLogs(filters = {}) {
  if (!config.gcpProjectId) throw new HttpError(503, 'GCP_PROJECT_ID is not configured');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const response = await client.request({
    url: 'https://logging.googleapis.com/v2/entries:list',
    method: 'POST',
    data: {
      resourceNames: [`projects/${config.gcpProjectId}`],
      filter: buildCloudLogFilter(filters),
      orderBy: 'timestamp desc',
      pageSize: filters.limit,
      pageToken: cleanText(filters.pageToken, 1000) || undefined,
    },
  });
  const entries = response.data?.entries || [];
  return {
    items: entries.map(toCloudRequestLog).filter(Boolean),
    limit: filters.limit,
    retentionDays: null,
    source: 'cloud-logging',
    nextPageToken: response.data.nextPageToken || '',
  };
}

function buildCloudLogFilter(filters = {}) {
  const clauses = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${escapeCloudFilter(config.cloudRunServiceName)}"`,
    'jsonPayload.message="api request completed"',
  ];
  const fromDate = parseLogDate(filters.from, new Date(Date.now() - 24 * 60 * 60 * 1000));
  const toDate = parseLogDate(filters.to, null);
  clauses.push(`timestamp>="${fromDate.toISOString()}"`);
  if (toDate) clauses.push(`timestamp<="${toDate.toISOString()}"`);
  if (filters.method) clauses.push(`jsonPayload.method="${escapeCloudFilter(cleanMethod(filters.method))}"`);
  if (filters.path) clauses.push(`jsonPayload.path:"${escapeCloudFilter(cleanText(filters.path, 180))}"`);
  if (filters.requestId) clauses.push(`jsonPayload.requestId="${escapeCloudFilter(cleanText(filters.requestId, 120))}"`);
  if (filters.text) clauses.push(`SEARCH("${escapeCloudFilter(cleanText(filters.text, 180))}")`);
  appendCloudStatusFilter(clauses, filters.status);
  return clauses.join(' AND ');
}

function appendCloudStatusFilter(clauses, status = '') {
  if (status === 'success') clauses.push('jsonPayload.status>=200', 'jsonPayload.status<300');
  else if (status === 'redirect') clauses.push('jsonPayload.status>=300', 'jsonPayload.status<400');
  else if (status === 'client-error') clauses.push('jsonPayload.status>=400', 'jsonPayload.status<500');
  else if (status === 'server-error') clauses.push('jsonPayload.status>=500');
  else if (/^\d{3}$/.test(String(status))) clauses.push(`jsonPayload.status=${Number(status)}`);
}

function toCloudRequestLog(entry = {}) {
  const payload = entry.jsonPayload || {};
  if (!payload.requestId && !payload.path) return null;
  return {
    id: entry.insertId || payload.requestId || '',
    requestId: payload.requestId || '',
    method: payload.method || '',
    path: cleanPath(payload.path || '/'),
    area: requestArea(payload.path || '/'),
    queryKeys: [],
    status: Number(payload.status || 0),
    durationMs: Number(payload.durationMs || 0),
    responseBytes: Number(payload.responseBytes || 0),
    actorEmail: cleanEmail(payload.actorEmail),
    originHost: cleanText(payload.originHost, 255),
    errorMessage: redactSecrets(cleanText(payload.errorMessage, 500)),
    createdAt: entry.timestamp || entry.receiveTimestamp || null,
  };
}

function parseLogDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

function escapeCloudFilter(value = '') {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
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
