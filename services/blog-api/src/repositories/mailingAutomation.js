import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { createResendBroadcast } from '../mail/provider.js';
import { escapeHtml, renderMailLayout } from '../mail/templates.js';
import { createMailDelivery } from './mail.js';
import { createNewsletterPreferencesUrl, subscriptionTopics } from './newsletter.js';

const settingsCollection = () => db().collection('mailingAutomationSettings');
const jobsCollection = () => db().collection('postMailingJobs');
const bucketsCollection = () => db().collection('mailingWeeklyBuckets');
const campaignsCollection = () => db().collection('newsletterCampaigns');
const postsCollection = () => db().collection('posts');
const subscriptionsCollection = () => db().collection('newsletterSubscriptions');

export const DEFAULT_MAILING_SETTINGS = Object.freeze({
  enabled: false,
  automaticByDefault: true,
  weeklyLimit: 2,
  dispatchIntervalHours: 12,
  gracePeriodMinutes: 10,
  timeZone: 'America/Argentina/Buenos_Aires',
  singleSubject: 'Nueva nota en Politeia: {{title}}',
  digestSubject: '{{count}} nuevas notas para leer en Politeia',
  singlePreheader: 'Una nueva lectura ya esta disponible en el blog.',
  digestPreheader: 'Las nuevas notas publicadas por Politeia.',
  digestIntro: 'Mira las nuevas notas que publicamos.',
  ctaLabel: 'Leer la nota',
  maxFullCards: 6,
});

export async function getMailingAdminOverview() {
  const [settings, jobs, subscribers] = await Promise.all([
    getMailingSettings(),
    listProjectDocs(jobsCollection()),
    listProjectDocs(subscriptionsCollection()),
  ]);
  const currentWeekId = mailingWeekId(new Date(), settings.timeZone);
  const bucketDoc = await bucketsCollection().doc(bucketId(currentWeekId)).get();
  const bucket = bucketDoc.exists ? serializeDoc(bucketDoc) : { sentCount: 0, overrideCount: 0 };
  return {
    settings,
    currentWeekId,
    sentThisWeek: Number(bucket.sentCount) || 0,
    overrideCount: Number(bucket.overrideCount) || 0,
    remainingThisWeek: Math.max(0, settings.weeklyLimit - (Number(bucket.sentCount) || 0)),
    recipientCount: subscribers.filter((item) => item.status === 'subscribed' && subscriptionTopics(item).newPosts).length,
    queuedCount: jobs.filter((item) => ['queued', 'digest_pending', 'failed'].includes(item.status)).length,
    nextDispatchAt: nextDispatchAt(settings),
  };
}

export async function getMailingSettings() {
  const doc = await settingsCollection().doc(config.mailProjectKey).get();
  return normalizeSettings(doc.exists ? serializeDoc(doc) : {});
}

export async function updateMailingSettings(body = {}, actorEmail = '') {
  if (Object.prototype.hasOwnProperty.call(body, 'timeZone') && !isValidTimeZone(body.timeZone)) {
    throw new HttpError(400, 'La zona horaria no es valida');
  }
  const current = await getMailingSettings();
  const next = normalizeSettings({ ...current, ...body });
  await settingsCollection().doc(config.mailProjectKey).set({
    ...next,
    projectKey: config.mailProjectKey,
    updatedBy: normalizeEmail(actorEmail),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return getMailingSettings();
}

export async function queuePublishedPostMail(post, actor, { notifySubscribers = true } = {}) {
  if (!post?.id) return null;
  const ref = jobsCollection().doc(jobId(post.id));
  const existingDoc = await ref.get();
  const existing = existingDoc.exists ? serializeDoc(existingDoc) : null;
  const settings = await getMailingSettings();
  if (existing?.sentAt && notifySubscribers) {
    await ref.set({ lastPublishedAt: post.publishedAt || new Date().toISOString(), updatedAt: serverTimestamp() }, { merge: true });
    return serializeDoc(await ref.get());
  }
  const now = new Date();
  const status = notifySubscribers && settings.enabled ? 'queued' : 'excluded';
  await ref.set({
    projectKey: config.mailProjectKey,
    postId: post.id,
    postTitle: publicPostValue(post, 'title'),
    postSlug: publicPostValue(post, 'slug'),
    publishedAt: post.publishedAt || now.toISOString(),
    status,
    excludedReason: notifySubscribers ? (settings.enabled ? '' : 'automation_disabled') : 'publication_opt_out',
    dueAt: new Date(now.getTime() + settings.gracePeriodMinutes * 60000).toISOString(),
    queuedBy: normalizeEmail(actor?.email),
    lastError: '',
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return serializeDoc(await ref.get());
}

export async function listMailingJobs({ status = '', limit = 200 } = {}) {
  const items = await listProjectDocs(jobsCollection());
  const cleanStatus = String(status || '').trim();
  return {
    items: items
      .filter((item) => !cleanStatus || item.status === cleanStatus)
      .sort((left, right) => String(right.publishedAt || right.updatedAt || '').localeCompare(String(left.publishedAt || left.updatedAt || '')))
      .slice(0, Math.min(Math.max(Number(limit) || 200, 1), 500)),
  };
}

export async function updateMailingJobs({ jobIds = [], action = '' } = {}, actorEmail = '') {
  const ids = [...new Set((Array.isArray(jobIds) ? jobIds : []).map(String).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, 'Selecciona al menos una nota');
  if (!['queue', 'exclude', 'retry', 'send-now'].includes(action)) throw new HttpError(400, 'Accion de mailing invalida');
  const jobs = [];
  for (const id of ids) {
    const doc = await jobsCollection().doc(id).get();
    if (doc.exists) jobs.push(serializeDoc(doc));
  }
  if (!jobs.length) throw new HttpError(404, 'No encontramos notas para actualizar');
  if (action === 'send-now') {
    return sendMailingCampaign(jobs, { actorEmail, forced: true, campaignType: jobs.length > 1 ? 'post_digest_forced' : 'post_single_forced' });
  }
  const status = action === 'exclude' ? 'excluded' : 'queued';
  await Promise.all(jobs.map((job) => jobsCollection().doc(job.id).set({
    status,
    excludedReason: status === 'excluded' ? 'admin_excluded' : '',
    lastError: action === 'retry' ? '' : job.lastError || '',
    dueAt: action === 'retry' || action === 'queue' ? new Date().toISOString() : job.dueAt,
    updatedBy: normalizeEmail(actorEmail),
    updatedAt: serverTimestamp(),
  }, { merge: true })));
  return listMailingJobs();
}

export async function renderMailingPreview({ jobIds = [], mode = 'single' } = {}) {
  const jobs = await resolveJobs(jobIds);
  const previewJobs = jobs.length ? jobs : syntheticJobs(mode === 'stack' ? 4 : 1);
  return renderPostMail(previewJobs, await getMailingSettings());
}

export async function sendMailingTest({ to, jobIds = [], mode = 'single' } = {}, actorEmail = '') {
  const email = validateEmail(to);
  const jobs = await resolveJobs(jobIds);
  const previewJobs = jobs.length ? jobs : syntheticJobs(mode === 'stack' ? 4 : 1);
  const rendered = renderPostMail(previewJobs, await getMailingSettings(), { testEmail: email });
  return createMailDelivery({
    channel: 'newsletter',
    type: 'mailing.post.test',
    recipient: email,
    subject: `[PRUEBA] ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `mailing-post-test:${normalizeEmail(actorEmail)}:${Date.now()}`,
  });
}

export async function dispatchMailing({ force = false, now = new Date() } = {}) {
  const settingsRef = settingsCollection().doc(config.mailProjectKey);
  const settings = await getMailingSettings();
  if (!settings.enabled && !force) return { skipped: true, reason: 'disabled' };
  if (!force && !dispatchIsDue(settings, now)) return { skipped: true, reason: 'interval', nextDispatchAt: nextDispatchAt(settings) };

  const leaseAcquired = await db().runTransaction(async (transaction) => {
    const doc = await transaction.get(settingsRef);
    const data = doc.exists ? serializeDoc(doc) : {};
    if (data.dispatchLeaseUntil && new Date(data.dispatchLeaseUntil).getTime() > now.getTime()) return false;
    transaction.set(settingsRef, {
      projectKey: config.mailProjectKey,
      dispatchLeaseUntil: new Date(now.getTime() + 15 * 60000).toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!leaseAcquired) return { skipped: true, reason: 'locked' };

  const result = { sent: [], queuedForDigest: [], failed: [] };
  try {
    const weekId = mailingWeekId(now, settings.timeZone);
    const bucketRef = bucketsCollection().doc(bucketId(weekId));
    const bucketDoc = await bucketRef.get();
    let sentCount = bucketDoc.exists ? Number(bucketDoc.data().sentCount) || 0 : 0;
    const allJobs = await listProjectDocs(jobsCollection());
    const digest = allJobs.filter((job) => job.status === 'digest_pending' && String(job.digestWeekId || '') <= weekId);
    if (digest.length && sentCount < settings.weeklyLimit) {
      const campaign = await safeSend(digest, { campaignType: 'post_digest', weekId });
      if (campaign.ok) {
        sentCount += 1;
        result.sent.push(campaign.item);
      } else result.failed.push(...digest.map((job) => job.id));
    }

    const dueJobs = allJobs
      .filter((job) => ['queued', 'failed'].includes(job.status))
      .filter((job) => !job.dueAt || new Date(job.dueAt).getTime() <= now.getTime())
      .sort((left, right) => String(left.publishedAt || '').localeCompare(String(right.publishedAt || '')));
    for (const job of dueJobs) {
      if (sentCount < settings.weeklyLimit) {
        const campaign = await safeSend([job], { campaignType: 'post_single', weekId });
        if (campaign.ok) {
          sentCount += 1;
          result.sent.push(campaign.item);
        } else result.failed.push(job.id);
      } else {
        const digestWeekId = nextMailingWeekId(weekId);
        await jobsCollection().doc(job.id).set({ status: 'digest_pending', digestWeekId, updatedAt: serverTimestamp() }, { merge: true });
        result.queuedForDigest.push(job.id);
      }
    }
    await bucketRef.set({ projectKey: config.mailProjectKey, weekId, sentCount, updatedAt: serverTimestamp() }, { merge: true });
    return result;
  } finally {
    await settingsRef.set({
      lastAutomaticDispatchAt: now.toISOString(),
      dispatchLeaseUntil: null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

async function safeSend(jobs, options) {
  try {
    return { ok: true, item: await sendMailingCampaign(jobs, options) };
  } catch (err) {
    await Promise.all(jobs.map((job) => jobsCollection().doc(job.id).set({
      status: 'failed', lastError: err?.message || 'No pudimos enviar la campana', updatedAt: serverTimestamp(),
    }, { merge: true })));
    return { ok: false, error: err };
  }
}

async function sendMailingCampaign(jobs, { actorEmail = 'scheduler', forced = false, campaignType = 'post_single', weekId = '' } = {}) {
  const currentPosts = [];
  for (const job of jobs) {
    const postDoc = await postsCollection().doc(job.postId).get();
    if (!postDoc.exists) continue;
    const post = serializeDoc(postDoc);
    if (!['published', 'published-edition'].includes(post.status) || post.deletedAt) {
      await jobsCollection().doc(job.id).set({ status: 'canceled', lastError: 'La nota ya no esta publicada', updatedAt: serverTimestamp() }, { merge: true });
      continue;
    }
    currentPosts.push({ job, post });
  }
  if (!currentPosts.length) throw new HttpError(409, 'No hay notas publicadas para enviar');
  const settings = await getMailingSettings();
  const rendered = renderPostMail(currentPosts.map(({ job, post }) => ({ ...job, ...post, id: job.id, postId: post.id })), settings);
  const campaignRef = campaignsCollection().doc();
  const idempotencyKey = `post-mailing:${config.mailProjectKey}:${campaignType}:${currentPosts.map(({ job }) => job.id).sort().join(',')}:${weekId || 'manual'}`;
  await campaignRef.set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    campaignType,
    name: rendered.subject,
    subject: rendered.subject,
    previewText: rendered.previewText,
    status: 'creating',
    provider: config.mailProvider,
    providerCampaignId: '',
    postIds: currentPosts.map(({ post }) => post.id),
    jobIds: currentPosts.map(({ job }) => job.id),
    forced,
    createdBy: normalizeEmail(actorEmail),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const provider = await createResendBroadcast({
    name: `${config.mailProjectKey}: ${rendered.subject}`,
    subject: rendered.subject,
    previewText: rendered.previewText,
    html: rendered.html,
    text: rendered.text,
    send: true,
    topicId: config.resendTopicNewPostsId,
    idempotencyKey,
  });
  if (!provider.ok) {
    await campaignRef.set({ status: 'failed', lastError: provider.error || 'Provider failed', updatedAt: serverTimestamp() }, { merge: true });
    throw new HttpError(502, provider.error || 'No pudimos enviar la campana');
  }
  const sentAt = new Date().toISOString();
  await Promise.all(currentPosts.map(({ job }) => jobsCollection().doc(job.id).set({
    status: 'sent', sentAt, campaignId: campaignRef.id, providerCampaignId: provider.providerMessageId || '', lastError: '', updatedAt: serverTimestamp(),
  }, { merge: true })));
  await campaignRef.set({
    status: provider.status || 'sent',
    providerCampaignId: provider.providerMessageId || provider.data?.id || '',
    sentAt,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (forced) await incrementOverrideBucket(sentAt, settings.timeZone);
  return serializeDoc(await campaignRef.get());
}

function renderPostMail(items, settings, { testEmail = '' } = {}) {
  const posts = items.map(toMailPost);
  const stacked = posts.length > 1;
  const subject = interpolate(stacked ? settings.digestSubject : settings.singleSubject, {
    title: posts[0]?.title || 'Nueva nota',
    count: posts.length,
  });
  const previewText = stacked ? settings.digestPreheader : settings.singlePreheader;
  const bodyHtml = `${stacked ? `<p style="margin:0 0 24px">${escapeHtml(settings.digestIntro)}</p>` : ''}${posts.slice(0, settings.maxFullCards).map((post) => renderPostCard(post, settings.ctaLabel)).join('')}${posts.length > settings.maxFullCards ? `<p style="margin:20px 0"><strong>Y ${posts.length - settings.maxFullCards} notas mas.</strong></p>` : ''}`;
  const bodyText = posts.map((post) => `${post.title}\n${post.excerpt}\n${post.url}`).join('\n\n');
  const preferencesUrl = testEmail
    ? createNewsletterPreferencesUrl(testEmail)
    : publicPreferencesUrlForBroadcast();
  const rendered = renderMailLayout({
    preheader: previewText,
    heading: stacked ? 'Nuevas notas en Politeia' : posts[0]?.title || 'Nueva nota en Politeia',
    bodyHtml,
    bodyText,
    preferencesUrl,
    unsubscribeUrl: testEmail ? '' : '{{{RESEND_UNSUBSCRIBE_URL}}}',
  });
  return { ...rendered, subject, previewText, posts };
}

function renderPostCard(post, ctaLabel) {
  const image = post.coverImage
    ? `<td width="148" valign="top" style="width:148px;padding:20px 0 20px 20px"><img alt="" src="${escapeHtml(post.coverImage)}" width="128" height="92" style="display:block;width:128px;height:92px;object-fit:cover;border:0;border-radius:6px"></td>`
    : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 24px;border:1px solid #dcdde3;border-top:4px solid #137a9f"><tr>${image}<td valign="top" style="padding:20px"><p style="margin:0 0 7px;color:#137a9f;font-size:11px;font-weight:800;text-transform:uppercase">${escapeHtml(post.category || 'Nota')}</p><h2 style="margin:0 0 8px;color:#1a1a37;font-family:'Fraunces',Georgia,serif;font-size:22px;line-height:1.2">${escapeHtml(post.title)}</h2><p style="margin:0 0 10px;color:#42445b;font-size:14px;line-height:1.5">${escapeHtml(post.excerpt)}</p><p style="margin:0 0 14px;color:#737489;font-size:12px">${escapeHtml(post.authorName)}</p><a href="${escapeHtml(post.url)}" style="display:inline-block;padding:9px 13px;border-radius:6px;background:#137a9f;color:#fff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(ctaLabel)}</a></td></tr></table>`;
}

function toMailPost(item = {}) {
  const slug = publicPostValue(item, 'slug');
  return {
    title: publicPostValue(item, 'title') || item.postTitle || 'Nueva nota',
    excerpt: publicPostValue(item, 'excerpt') || 'Una nueva lectura ya esta disponible.',
    coverImage: publicPostValue(item, 'coverImageThumbnail') || publicPostValue(item, 'coverImage'),
    authorName: publicPostValue(item, 'authorName'),
    category: publicPostValue(item, 'category'),
    url: new URL(`/blog/${encodeURIComponent(slug)}`, config.publicSiteUrl).toString(),
  };
}

function publicPostValue(post, key) {
  const publicKey = `public${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return String(post?.[publicKey] || post?.[key] || '').trim();
}

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_MAILING_SETTINGS,
    enabled: value.enabled === true,
    automaticByDefault: value.automaticByDefault !== false,
    weeklyLimit: clampNumber(value.weeklyLimit, 0, 7, DEFAULT_MAILING_SETTINGS.weeklyLimit),
    dispatchIntervalHours: clampNumber(value.dispatchIntervalHours, 1, 168, DEFAULT_MAILING_SETTINGS.dispatchIntervalHours),
    gracePeriodMinutes: clampNumber(value.gracePeriodMinutes, 0, 1440, DEFAULT_MAILING_SETTINGS.gracePeriodMinutes),
    timeZone: normalizeTimeZone(value.timeZone),
    singleSubject: cleanText(value.singleSubject, 180) || DEFAULT_MAILING_SETTINGS.singleSubject,
    digestSubject: cleanText(value.digestSubject, 180) || DEFAULT_MAILING_SETTINGS.digestSubject,
    singlePreheader: cleanText(value.singlePreheader, 180) || DEFAULT_MAILING_SETTINGS.singlePreheader,
    digestPreheader: cleanText(value.digestPreheader, 180) || DEFAULT_MAILING_SETTINGS.digestPreheader,
    digestIntro: cleanText(value.digestIntro, 300) || DEFAULT_MAILING_SETTINGS.digestIntro,
    ctaLabel: cleanText(value.ctaLabel, 40) || DEFAULT_MAILING_SETTINGS.ctaLabel,
    maxFullCards: clampNumber(value.maxFullCards, 1, 12, DEFAULT_MAILING_SETTINGS.maxFullCards),
    lastAutomaticDispatchAt: value.lastAutomaticDispatchAt || null,
  };
}

function normalizeTimeZone(value) {
  const candidate = cleanText(value, 80) || DEFAULT_MAILING_SETTINGS.timeZone;
  return isValidTimeZone(candidate) ? candidate : DEFAULT_MAILING_SETTINGS.timeZone;
}

function isValidTimeZone(value) {
  const candidate = cleanText(value, 80);
  if (!candidate) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format();
    return true;
  } catch {
    return false;
  }
}

function dispatchIsDue(settings, now) {
  if (!settings.lastAutomaticDispatchAt) return true;
  return now.getTime() - new Date(settings.lastAutomaticDispatchAt).getTime() >= settings.dispatchIntervalHours * 3600000;
}

function nextDispatchAt(settings) {
  const base = settings.lastAutomaticDispatchAt ? new Date(settings.lastAutomaticDispatchAt) : new Date();
  return new Date(base.getTime() + settings.dispatchIntervalHours * 3600000).toISOString();
}

export function mailingWeekId(date = new Date(), timeZone = DEFAULT_MAILING_SETTINGS.timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const current = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const offset = (current.getUTCDay() + 6) % 7;
  current.setUTCDate(current.getUTCDate() - offset);
  return current.toISOString().slice(0, 10);
}

function nextMailingWeekId(weekId) {
  const next = new Date(`${weekId}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString().slice(0, 10);
}

async function incrementOverrideBucket(dateValue, timeZone) {
  const weekId = mailingWeekId(new Date(dateValue), timeZone);
  const ref = bucketsCollection().doc(bucketId(weekId));
  const doc = await ref.get();
  const current = doc.exists ? doc.data() : {};
  await ref.set({ projectKey: config.mailProjectKey, weekId, overrideCount: (Number(current.overrideCount) || 0) + 1, updatedAt: serverTimestamp() }, { merge: true });
}

async function resolveJobs(ids = []) {
  const jobs = [];
  for (const id of [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]) {
    const doc = await jobsCollection().doc(id).get();
    if (!doc.exists) continue;
    const job = serializeDoc(doc);
    const postDoc = job.postId ? await postsCollection().doc(job.postId).get() : null;
    if (postDoc?.exists) {
      const post = serializeDoc(postDoc);
      jobs.push({ ...job, ...post, id: job.id, postId: post.id });
    } else {
      jobs.push(job);
    }
  }
  return jobs;
}

async function listProjectDocs(collection) {
  const snapshot = await collection.get();
  return snapshot.docs.map(serializeDoc).filter((item) => item.projectKey === config.mailProjectKey);
}

function syntheticJobs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `preview-${index + 1}`,
    postId: `preview-${index + 1}`,
    title: index === 0 ? 'Una nueva mirada sobre la politica cotidiana' : `Nota de ejemplo ${index + 1}`,
    excerpt: 'Ideas, datos y preguntas para comprender mejor una conversacion publica.',
    category: index % 2 ? 'Democracia' : 'Analisis',
    authorName: 'Equipo Politeia',
    slug: `nota-de-ejemplo-${index + 1}`,
  }));
}

function publicPreferencesUrlForBroadcast() {
  const url = new URL('/blog', config.publicSiteUrl);
  url.searchParams.set('newsletter', 'preferencias');
  url.searchParams.set('email', '{{{contact.email}}}');
  url.hash = 'news';
  return url.toString().replace(/%7B%7B%7Bcontact\.email%7D%7D%7D/gi, '{{{contact.email}}}');
}

function jobId(postId) {
  return createHash('sha256').update(`${config.mailProjectKey}|${postId}`).digest('hex');
}

function bucketId(weekId) {
  return createHash('sha256').update(`${config.mailProjectKey}|${weekId}`).digest('hex');
}

function interpolate(template, values) {
  return String(template || '').replace(/\{\{(title|count)\}\}/g, (_match, key) => String(values[key] ?? ''));
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), min), max) : fallback;
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Ingresa un email valido');
  return email;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}
