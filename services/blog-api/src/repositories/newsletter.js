import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { MAIL_CHANNELS, createResendBroadcast, syncResendContact } from '../mail/provider.js';
import { escapeHtml, renderMailLayout, renderNewsletterConfirmation } from '../mail/templates.js';
import { createMailDelivery } from './mail.js';

const subscriptions = () => db().collection('newsletterSubscriptions');
const campaigns = () => db().collection('newsletterCampaigns');
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export async function requestNewsletterSubscription({ email, source = 'blog', locale = 'es-AR' }) {
  const cleanEmail = validateEmail(email);
  requireTokenSecret();
  const ref = subscriptions().doc(subscriptionId(cleanEmail));
  const existingDoc = await ref.get();
  const existing = existingDoc.exists ? serializeDoc(existingDoc) : null;
  if (existing?.status === 'subscribed') return { accepted: true };

  const token = signNewsletterToken({ email: cleanEmail, action: 'confirm' });
  const confirmUrl = `${apiPublicUrl()}/v1/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const rendered = renderNewsletterConfirmation({ confirmUrl });
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    email: cleanEmail,
    status: 'pending',
    source: sanitizeShortText(source, 80),
    locale: sanitizeShortText(locale, 20),
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    confirmedAt: null,
    unsubscribedAt: null,
  }, { merge: true });

  await createMailDelivery({
    channel: MAIL_CHANNELS.newsletter,
    type: 'newsletter.confirmation',
    recipient: cleanEmail,
    subject: 'Confirma tu suscripcion a Politeia',
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `newsletter-confirm:${subscriptionId(cleanEmail)}:${tokenFingerprint(token)}`,
  });
  return { accepted: true };
}

export async function confirmNewsletterSubscription(token) {
  const payload = verifyNewsletterToken(token, 'confirm');
  const ref = subscriptions().doc(subscriptionId(payload.email));
  const doc = await ref.get();
  if (!doc.exists) throw new HttpError(400, 'La solicitud de suscripcion no existe o vencio');

  const provider = await syncResendContact({ email: payload.email, subscribed: true });
  if (!provider.ok) throw new HttpError(502, 'No pudimos confirmar la suscripcion en este momento');
  await ref.set({
    status: 'subscribed',
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unsubscribedAt: null,
    providerContactId: provider.data?.id || '',
  }, { merge: true });
  return { email: payload.email, status: 'subscribed' };
}

export async function unsubscribeNewsletter(token) {
  const payload = verifyNewsletterToken(token, 'unsubscribe', { allowExpired: true });
  const ref = subscriptions().doc(subscriptionId(payload.email));
  const provider = await syncResendContact({ email: payload.email, subscribed: false });
  if (!provider.ok) throw new HttpError(502, 'No pudimos procesar la baja en este momento');
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    email: payload.email,
    status: 'unsubscribed',
    unsubscribedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { email: payload.email, status: 'unsubscribed' };
}

export async function getNewsletterOverview() {
  const snapshot = await subscriptions().get();
  const items = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey && item.audienceKey === config.newsletterAudienceKey);
  return {
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    provider: config.mailProvider,
    segmentConfigured: Boolean(config.resendSegmentId),
    topicConfigured: Boolean(config.resendTopicId),
    counts: {
      subscribed: items.filter((item) => item.status === 'subscribed').length,
      pending: items.filter((item) => item.status === 'pending').length,
      unsubscribed: items.filter((item) => item.status === 'unsubscribed').length,
    },
  };
}

export async function sendNewsletterTest({ to, subject, content, actorEmail }) {
  const cleanEmail = validateEmail(to);
  const cleanSubject = sanitizeShortText(subject, 180);
  const cleanContent = sanitizeCampaignHtml(content);
  if (!cleanSubject || !stripHtml(cleanContent)) throw new HttpError(400, 'subject and content are required');
  const rendered = renderMailLayout({
    preheader: cleanSubject,
    heading: cleanSubject,
    bodyHtml: cleanContent,
    bodyText: stripHtml(cleanContent),
  });
  return createMailDelivery({
    channel: MAIL_CHANNELS.newsletter,
    type: 'newsletter.test',
    recipient: cleanEmail,
    subject: `[PRUEBA] ${cleanSubject}`,
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `newsletter-test:${normalizeEmail(actorEmail)}:${Date.now()}`,
  });
}

export async function createNewsletterCampaign({ name, subject, previewText = '', content, send = false }, actorEmail) {
  const cleanSubject = sanitizeShortText(subject, 180);
  const cleanName = sanitizeShortText(name || subject, 120);
  const cleanPreview = sanitizeShortText(previewText, 180);
  const cleanContent = sanitizeCampaignHtml(content);
  if (!cleanSubject || !stripHtml(cleanContent)) throw new HttpError(400, 'subject and content are required');

  const unsubscribe = '<p style="margin-top:32px;font-size:12px;color:#737489">Si ya no queres recibir estas novedades, podes darte de baja desde {{{RESEND_UNSUBSCRIBE_URL}}}.</p>';
  const rendered = renderMailLayout({
    preheader: cleanPreview || cleanSubject,
    heading: cleanSubject,
    bodyHtml: `${cleanContent}${unsubscribe}`,
    bodyText: `${stripHtml(cleanContent)}\n\nPodes darte de baja desde el enlace incluido por el proveedor.`,
  });
  const ref = campaigns().doc();
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    name: cleanName,
    subject: cleanSubject,
    previewText: cleanPreview,
    contentHtml: cleanContent,
    status: 'creating',
    provider: config.mailProvider,
    providerCampaignId: '',
    createdBy: normalizeEmail(actorEmail),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const provider = await createResendBroadcast({
    name: `${config.mailProjectKey}: ${cleanName}`,
    subject: cleanSubject,
    previewText: cleanPreview,
    html: rendered.html,
    text: rendered.text,
    send: send === true,
  });
  if (!provider.ok) {
    await ref.update({ status: 'failed', lastError: provider.error || 'Provider failed', updatedAt: serverTimestamp() });
    throw new HttpError(502, provider.error || 'No pudimos crear la campana');
  }
  await ref.update({
    status: provider.status || (send ? 'sent' : 'draft'),
    providerCampaignId: provider.providerMessageId || provider.data?.id || '',
    lastError: '',
    updatedAt: serverTimestamp(),
  });
  return serializeDoc(await ref.get());
}

export function createNewsletterUnsubscribeUrl(email) {
  const token = signNewsletterToken({ email: validateEmail(email), action: 'unsubscribe', ttlMs: 365 * 24 * 60 * 60 * 1000 });
  return `${apiPublicUrl()}/v1/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

function signNewsletterToken({ email, action, ttlMs = TOKEN_TTL_MS }) {
  requireTokenSecret();
  const payload = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    action,
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    exp: Date.now() + ttlMs,
  })).toString('base64url');
  const signature = createHmac('sha256', config.newsletterTokenSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyNewsletterToken(token, expectedAction, { allowExpired = false } = {}) {
  requireTokenSecret();
  const [payloadPart, signaturePart] = String(token || '').split('.');
  if (!payloadPart || !signaturePart) throw new HttpError(400, 'Token invalido');
  const expected = createHmac('sha256', config.newsletterTokenSecret).update(payloadPart).digest();
  const actual = Buffer.from(signaturePart, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(400, 'Token invalido');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(400, 'Token invalido');
  }
  if (payload.action !== expectedAction || payload.projectKey !== config.mailProjectKey || payload.audienceKey !== config.newsletterAudienceKey) {
    throw new HttpError(400, 'Token invalido');
  }
  if (!allowExpired && Number(payload.exp) < Date.now()) throw new HttpError(400, 'El enlace vencio');
  payload.email = validateEmail(payload.email);
  return payload;
}

function sanitizeCampaignHtml(value = '') {
  const raw = String(value).trim();
  const source = raw.includes('<')
    ? raw
    : raw.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`).join('');
  return sanitizeHtml(source, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  }).trim();
}

function validateEmail(value = '') {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Ingresa un email valido');
  }
  return email;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function sanitizeShortText(value = '', maxLength = 180) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stripHtml(value = '') {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function subscriptionId(email) {
  return createHash('sha256')
    .update([config.mailProjectKey, config.newsletterAudienceKey, normalizeEmail(email)].join('|'))
    .digest('hex');
}

function tokenFingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 20);
}

function requireTokenSecret() {
  if (!config.newsletterTokenSecret) throw new HttpError(503, 'Newsletter token secret is not configured');
}

function apiPublicUrl() {
  return String(config.apiPublicUrl || '').replace(/\/$/, '');
}
