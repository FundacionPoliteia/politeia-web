import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { MAIL_CHANNELS, createResendBroadcast, syncResendContact } from '../mail/provider.js';
import { renderEditorialMail, renderMailLayout, renderNewsletterConfirmation } from '../mail/templates.js';
import { createMailDelivery } from './mail.js';

const subscriptions = () => db().collection('newsletterSubscriptions');
const campaigns = () => db().collection('newsletterCampaigns');
const templates = () => db().collection('newsletterTemplates');
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_CUSTOM_TEMPLATES = 20;
const BASE_NEWSLETTER_TEMPLATES = [
  {
    id: 'base-weekly-summary',
    name: 'Resumen semanal',
    campaignName: 'Resumen semanal',
    subject: 'Lo mas importante de la semana en Politeia',
    previewText: 'Notas, ideas y novedades para leer con tiempo.',
    content: '<h2>Lo mas importante de la semana</h2><p>Escribi una apertura breve que conecte los temas de esta edicion.</p><hr><h3>Para seguir leyendo</h3><p>Presenta las notas destacadas y agrega sus enlaces.</p><h3>Una idea para cerrar</h3><p>Deja una pregunta o reflexion breve para la comunidad.</p>',
    builtIn: true,
  },
  {
    id: 'base-new-article',
    name: 'Nueva nota',
    campaignName: 'Lanzamiento de nota',
    subject: 'Nueva nota en Politeia: completa el titulo',
    previewText: 'Una nueva lectura para comprender el debate publico.',
    content: '<h2>Una nueva nota en Politeia</h2><p>Presenta el tema, la pregunta principal y por que vale la pena leerla.</p><blockquote>Agrega una frase destacada del articulo.</blockquote><p>Inclui el enlace a la nota y una invitacion breve a compartirla.</p>',
    builtIn: true,
  },
  {
    id: 'base-project-update',
    name: 'Actualizacion de proyecto',
    campaignName: 'Actualizacion de proyecto',
    subject: 'Novedades de proyecto en Politeia',
    previewText: 'Avances, proximos pasos y formas de participar.',
    content: '<h2>En que estamos trabajando</h2><p>Resume el avance principal y su impacto.</p><h3>Lo que sigue</h3><ul><li>Proximo paso o hito.</li><li>Fecha importante.</li><li>Forma de participar.</li></ul><p>Cerra con un enlace o contacto relevante.</p>',
    builtIn: true,
  },
];

export async function requestNewsletterSubscription({ email, source = 'blog', locale = 'es-AR', topics = null }) {
  const cleanEmail = validateEmail(email);
  const topicPreferences = sanitizeTopicPreferences(topics);
  requireTokenSecret();
  const ref = subscriptions().doc(subscriptionId(cleanEmail));
  const existingDoc = await ref.get();
  const existing = existingDoc.exists ? serializeDoc(existingDoc) : null;
  if (existing?.status === 'subscribed') return { accepted: true };

  const token = signNewsletterToken({ email: cleanEmail, action: 'confirm', topics: topicPreferences });
  const confirmUrl = `${apiPublicUrl()}/v1/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const rendered = renderNewsletterConfirmation({ confirmUrl });
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    email: cleanEmail,
    status: 'pending',
    source: sanitizeShortText(source, 80),
    locale: sanitizeShortText(locale, 20),
    topicPreferences,
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

  const topicPreferences = sanitizeTopicPreferences(payload.topics);
  const provider = await syncResendContact({ email: payload.email, subscribed: true, topics: topicPreferences });
  if (!provider.ok) {
    throw new HttpError(
      502,
      'No pudimos confirmar la suscripcion en este momento',
      config.nodeEnv === 'production'
        ? undefined
        : {
            providerError: provider.error || 'Unknown provider error',
            providerStatusCode: provider.statusCode || 0,
          },
    );
  }
  await ref.set({
    status: 'subscribed',
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unsubscribedAt: null,
    topicPreferences,
    providerContactId: provider.data?.id || '',
  }, { merge: true });
  return { email: payload.email, status: 'subscribed', topics: topicPreferences };
}

export async function unsubscribeNewsletter(token) {
  return updateNewsletterPreferences(token, { newsletter: false, newPosts: false });
}

export async function requestNewsletterPreferences(email) {
  const cleanEmail = validateEmail(email);
  const ref = subscriptions().doc(subscriptionId(cleanEmail));
  const doc = await ref.get();
  if (!doc.exists) return { accepted: true };
  const manageUrl = createNewsletterPreferencesUrl(cleanEmail);
  const rendered = renderEditorialMail({
    subject: 'Administra tus preferencias de Politeia',
    text: 'Usa este enlace para elegir que novedades queres recibir o para darte de baja de todos los envios.',
    actionUrl: manageUrl,
    actionLabel: 'Administrar preferencias',
  });
  await createMailDelivery({
    channel: MAIL_CHANNELS.newsletter,
    type: 'newsletter.preferences',
    recipient: cleanEmail,
    subject: 'Administra tus preferencias de Politeia',
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `newsletter-preferences:${subscriptionId(cleanEmail)}:${Math.floor(Date.now() / 60000)}`,
  });
  return { accepted: true };
}

export async function getNewsletterPreferences(token) {
  const payload = verifyNewsletterToken(token, ['preferences', 'unsubscribe'], { allowExpired: true });
  const doc = await subscriptions().doc(subscriptionId(payload.email)).get();
  if (!doc.exists) throw new HttpError(404, 'La suscripcion no existe');
  const item = serializeDoc(doc);
  return { email: payload.email, status: item.status || 'pending', topics: subscriptionTopics(item) };
}

export async function updateNewsletterPreferences(token, topics) {
  const payload = verifyNewsletterToken(token, ['preferences', 'unsubscribe'], { allowExpired: true });
  const ref = subscriptions().doc(subscriptionId(payload.email));
  const doc = await ref.get();
  if (!doc.exists) throw new HttpError(404, 'La suscripcion no existe');
  const topicPreferences = sanitizeTopicPreferences(topics);
  const subscribed = topicPreferences.newsletter || topicPreferences.newPosts;
  const provider = await syncResendContact({ email: payload.email, subscribed, topics: topicPreferences });
  if (!provider.ok) {
    throw new HttpError(
      502,
      'No pudimos procesar la baja en este momento',
      config.nodeEnv === 'production'
        ? undefined
        : {
            providerError: provider.error || 'Unknown provider error',
            providerStatusCode: provider.statusCode || 0,
          },
    );
  }
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    email: payload.email,
    status: subscribed ? 'subscribed' : 'unsubscribed',
    topicPreferences,
    unsubscribedAt: subscribed ? null : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { email: payload.email, status: subscribed ? 'subscribed' : 'unsubscribed', topics: topicPreferences };
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
    topicConfigured: Boolean(config.resendTopicNewsletterId),
    newPostsTopicConfigured: Boolean(config.resendTopicNewPostsId),
    counts: {
      subscribed: items.filter((item) => item.status === 'subscribed').length,
      newsletter: items.filter((item) => item.status === 'subscribed' && subscriptionTopics(item).newsletter).length,
      newPosts: items.filter((item) => item.status === 'subscribed' && subscriptionTopics(item).newPosts).length,
      pending: items.filter((item) => item.status === 'pending').length,
      unsubscribed: items.filter((item) => item.status === 'unsubscribed').length,
    },
  };
}

export async function listNewsletterSubscribers({ status, limit = 50 } = {}) {
  const cleanStatus = String(status || '').trim().toLowerCase();
  if (!['subscribed', 'pending'].includes(cleanStatus)) {
    throw new HttpError(400, 'status must be subscribed or pending');
  }
  const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const snapshot = await subscriptions().get();
  const items = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey
      && item.audienceKey === config.newsletterAudienceKey
      && item.status === cleanStatus)
    .sort((left, right) => subscriberDate(right).localeCompare(subscriberDate(left)));

  return {
    status: cleanStatus,
    total: items.length,
    items: items.slice(0, cleanLimit).map((item) => ({
      id: item.id,
      email: item.email,
      status: item.status,
      source: item.source || '',
      locale: item.locale || '',
      requestedAt: item.requestedAt || null,
      confirmedAt: item.confirmedAt || null,
      updatedAt: item.updatedAt || null,
      topics: subscriptionTopics(item),
    })),
  };
}

export async function listNewsletterTemplates() {
  const snapshot = await templates().get();
  const custom = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey && item.audienceKey === config.newsletterAudienceKey)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .map(toNewsletterTemplate);
  return { items: [...BASE_NEWSLETTER_TEMPLATES, ...custom] };
}

export async function createNewsletterTemplate(body = {}, actorEmail = '') {
  const name = sanitizeShortText(body.name, 80);
  const campaignName = sanitizeShortText(body.campaignName || body.name, 120);
  const subject = sanitizeShortText(body.subject, 180);
  const previewText = sanitizeShortText(body.previewText, 180);
  const content = sanitizeCampaignHtml(body.content);
  if (!name || !subject || !stripHtml(content)) throw new HttpError(400, 'name, subject and content are required');

  const existing = await templates().get();
  const customCount = existing.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey && item.audienceKey === config.newsletterAudienceKey)
    .length;
  if (customCount >= MAX_CUSTOM_TEMPLATES) throw new HttpError(409, `Solo podes guardar hasta ${MAX_CUSTOM_TEMPLATES} plantillas`);

  const ref = templates().doc();
  await ref.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    name,
    campaignName,
    subject,
    previewText,
    content,
    builtIn: false,
    createdBy: normalizeEmail(actorEmail),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return toNewsletterTemplate(serializeDoc(await ref.get()));
}

export async function deleteNewsletterTemplate(templateId = '') {
  const id = String(templateId || '').trim();
  if (!id || BASE_NEWSLETTER_TEMPLATES.some((item) => item.id === id)) throw new HttpError(400, 'La plantilla base no se puede eliminar');
  const ref = templates().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpError(404, 'Plantilla no encontrada');
  const item = serializeDoc(doc);
  if (item.projectKey !== config.mailProjectKey || item.audienceKey !== config.newsletterAudienceKey) {
    throw new HttpError(404, 'Plantilla no encontrada');
  }
  await ref.delete();
  return { id, deleted: true };
}

export async function sendNewsletterTest({ to, subject, previewText = '', content, actorEmail }) {
  const cleanEmail = validateEmail(to);
  const cleanSubject = sanitizeShortText(subject, 180);
  const cleanPreview = sanitizeShortText(previewText, 180);
  const cleanContent = sanitizeCampaignHtml(content);
  if (!cleanSubject || !stripHtml(cleanContent)) throw new HttpError(400, 'subject and content are required');
  const unsubscribeUrl = createNewsletterUnsubscribeUrl(cleanEmail);
  const preferencesUrl = createNewsletterPreferencesUrl(cleanEmail);
  const rendered = renderMailLayout({
    preheader: cleanPreview || cleanSubject,
    heading: cleanSubject,
    bodyHtml: cleanContent,
    bodyText: stripHtml(cleanContent),
    unsubscribeUrl,
    preferencesUrl,
  });
  return createMailDelivery({
    channel: MAIL_CHANNELS.newsletter,
    type: 'newsletter.test',
    recipient: cleanEmail,
    subject: `[PRUEBA] ${cleanSubject}`,
    text: rendered.text,
    html: rendered.html,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    idempotencyKey: `newsletter-test:${normalizeEmail(actorEmail)}:${Date.now()}`,
  });
}

export function renderNewsletterPreview({ subject, previewText = '', content }) {
  const cleanSubject = sanitizeShortText(subject, 180);
  const cleanPreview = sanitizeShortText(previewText, 180);
  const cleanContent = sanitizeCampaignHtml(content);
  if (!cleanSubject || !stripHtml(cleanContent)) throw new HttpError(400, 'subject and content are required');
  return renderMailLayout({
    preheader: cleanPreview || cleanSubject,
    heading: cleanSubject,
    bodyHtml: cleanContent,
    bodyText: stripHtml(cleanContent),
    unsubscribeUrl: '#newsletter-unsubscribe-preview',
    preferencesUrl: '#newsletter-preferences-preview',
  });
}

export async function createNewsletterCampaign({ name, subject, previewText = '', content, send = false }, actorEmail) {
  const cleanSubject = sanitizeShortText(subject, 180);
  const cleanName = sanitizeShortText(name || subject, 120);
  const cleanPreview = sanitizeShortText(previewText, 180);
  const cleanContent = sanitizeCampaignHtml(content);
  if (!cleanSubject || !stripHtml(cleanContent)) throw new HttpError(400, 'subject and content are required');

  const rendered = renderMailLayout({
    preheader: cleanPreview || cleanSubject,
    heading: cleanSubject,
    bodyHtml: cleanContent,
    bodyText: stripHtml(cleanContent),
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    preferencesUrl: publicPreferencesUrl('{{{contact.email}}}'),
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
    topicId: config.resendTopicNewsletterId || config.resendTopicId,
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

export function createNewsletterPreferencesUrl(email) {
  const cleanEmail = validateEmail(email);
  const token = signNewsletterToken({ email: cleanEmail, action: 'preferences', ttlMs: 365 * 24 * 60 * 60 * 1000 });
  return publicPreferencesUrl(cleanEmail, token);
}

function signNewsletterToken({ email, action, ttlMs = TOKEN_TTL_MS, topics = undefined }) {
  requireTokenSecret();
  const payload = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    action,
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    ...(topics ? { topics: sanitizeTopicPreferences(topics) } : {}),
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
  const expectedActions = Array.isArray(expectedAction) ? expectedAction : [expectedAction];
  if (!expectedActions.includes(payload.action) || payload.projectKey !== config.mailProjectKey || payload.audienceKey !== config.newsletterAudienceKey) {
    throw new HttpError(400, 'Token invalido');
  }
  if (!allowExpired && Number(payload.exp) < Date.now()) throw new HttpError(400, 'El enlace vencio');
  payload.email = validateEmail(payload.email);
  return payload;
}

export function subscriptionTopics(item = {}) {
  if (!item.topicPreferences || typeof item.topicPreferences !== 'object') {
    return { newsletter: true, newPosts: true };
  }
  return sanitizeTopicPreferences(item.topicPreferences);
}

function sanitizeTopicPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    newsletter: source.newsletter !== false,
    newPosts: source.newPosts !== false,
  };
}

function publicPreferencesUrl(email = '', token = '') {
  const url = new URL('/blog', config.publicSiteUrl);
  url.searchParams.set('newsletter', 'preferencias');
  if (email) url.searchParams.set('email', email);
  if (token) url.searchParams.set('token', token);
  url.hash = 'news';
  return preserveResendContactPlaceholder(url.toString());
}

function preserveResendContactPlaceholder(value) {
  return String(value).replace(/%7B%7B%7Bcontact\.email%7D%7D%7D/gi, '{{{contact.email}}}');
}

function sanitizeCampaignHtml(value = '') {
  const raw = String(value).trim();
  const source = raw.includes('<')
    ? raw
    : marked.parse(raw, { async: false, gfm: true });
  const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
  const clean = sanitizeHtml(source, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
  const textFont = "'Archivo','Helvetica Neue',Arial,sans-serif";
  const displayFont = "'Fraunces',Georgia,'Times New Roman',serif";
  return sanitizeHtml(clean, {
    allowedTags,
    allowedAttributes: {
      p: ['style'],
      h2: ['style'],
      h3: ['style'],
      ul: ['style'],
      ol: ['style'],
      li: ['style'],
      blockquote: ['style'],
      a: ['href', 'title', 'target', 'rel', 'style'],
      hr: ['style'],
      img: ['src', 'alt', 'title', 'style'],
      table: ['style'],
      th: ['colspan', 'rowspan', 'style'],
      td: ['colspan', 'rowspan', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      p: sanitizeHtml.simpleTransform('p', { style: `margin:0 0 18px;color:#42445b;font-family:${textFont};font-size:16px;line-height:1.65` }, true),
      h2: sanitizeHtml.simpleTransform('h2', { style: `margin:30px 0 14px;color:#1a1a37;font-family:${displayFont};font-size:26px;line-height:1.2;font-weight:700` }, true),
      h3: sanitizeHtml.simpleTransform('h3', { style: `margin:24px 0 12px;color:#1a1a37;font-family:${displayFont};font-size:21px;line-height:1.25;font-weight:700` }, true),
      ul: sanitizeHtml.simpleTransform('ul', { style: `margin:0 0 20px;padding-left:24px;color:#42445b;font-family:${textFont};font-size:16px;line-height:1.6` }, true),
      ol: sanitizeHtml.simpleTransform('ol', { style: `margin:0 0 20px;padding-left:24px;color:#42445b;font-family:${textFont};font-size:16px;line-height:1.6` }, true),
      li: sanitizeHtml.simpleTransform('li', { style: 'margin:0 0 8px' }, true),
      blockquote: sanitizeHtml.simpleTransform('blockquote', { style: `margin:24px 0;padding:6px 0 6px 18px;border-left:4px solid #137a9f;color:#1a1a37;font-family:${displayFont};font-size:19px;line-height:1.5` }, true),
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer', style: `color:#137a9f;font-family:${textFont};font-weight:700;text-decoration:underline` }, true),
      hr: sanitizeHtml.simpleTransform('hr', { style: 'margin:28px 0;border:0;border-top:1px solid #dcdde3' }, true),
      img: sanitizeHtml.simpleTransform('img', { style: 'display:block;width:100%;max-width:100%;height:auto;margin:24px auto;border:0;border-radius:6px' }, true),
      table: sanitizeHtml.simpleTransform('table', { style: `width:100%;margin:24px 0;border-collapse:collapse;color:#42445b;font-family:${textFont};font-size:14px;line-height:1.45` }, true),
      th: sanitizeHtml.simpleTransform('th', { style: 'padding:10px;border:1px solid #dcdde3;background:#f7f5f2;color:#1a1a37;font-weight:700;text-align:left' }, true),
      td: sanitizeHtml.simpleTransform('td', { style: 'padding:10px;border:1px solid #dcdde3;vertical-align:top' }, true),
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

function subscriberDate(item = {}) {
  return String(item.confirmedAt || item.requestedAt || item.updatedAt || '');
}

function toNewsletterTemplate(item = {}) {
  return {
    id: item.id,
    name: item.name || 'Plantilla',
    campaignName: item.campaignName || '',
    subject: item.subject || '',
    previewText: item.previewText || '',
    content: item.content || '',
    builtIn: item.builtIn === true,
    createdBy: item.createdBy || '',
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
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
