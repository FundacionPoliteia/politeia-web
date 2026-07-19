import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';

const webhookEvents = () => db().collection('mailWebhookEvents');
const deliveries = () => db().collection('emailDeliveries');
const subscriptions = () => db().collection('newsletterSubscriptions');
const campaigns = () => db().collection('newsletterCampaigns');

export async function processResendWebhook(svixId, event = {}) {
  const cleanSvixId = String(svixId || '').trim();
  const ref = webhookEvents().doc(webhookEventId(cleanSvixId));
  const existing = await ref.get();
  if (existing.exists) return { duplicate: true, item: serializeDoc(existing) };

  const type = String(event.type || 'unknown');
  const data = event.data || {};
  const providerMessageId = String(data.email_id || '');
  const recipientEmails = Array.isArray(data.to) ? data.to.map(normalizeEmail).filter(Boolean) : [];
  await ref.set({
    provider: 'resend',
    projectKey: config.mailProjectKey,
    svixId: cleanSvixId,
    type,
    providerMessageId,
    providerCampaignId: String(data.broadcast_id || ''),
    recipientEmails,
    subject: String(data.subject || ''),
    payload: event,
    providerCreatedAt: event.created_at || null,
    processedAt: serverTimestamp(),
  });

  await Promise.all([
    updateDeliveries(providerMessageId, type, data),
    updateCampaign(data.broadcast_id, type),
    suppressRecipients(recipientEmails, type, data),
    syncContactUnsubscribe(type, data),
  ]);
  return { duplicate: false, item: serializeDoc(await ref.get()) };
}

async function updateDeliveries(providerMessageId, type, data) {
  if (!providerMessageId) return;
  const snapshot = await deliveries().where('providerMessageId', '==', providerMessageId).get();
  await Promise.all(snapshot.docs.map((doc) => deliveries().doc(doc.id).set({
    providerStatus: type,
    providerStatusAt: serverTimestamp(),
    ...(type === 'email.delivered' ? { status: 'delivered', deliveredAt: serverTimestamp() } : {}),
    ...(['email.failed', 'email.bounced', 'email.complained', 'email.suppressed'].includes(type) ? {
      status: type.replace('email.', ''),
      lastError: webhookErrorMessage(type, data),
    } : {}),
  }, { merge: true })));
}

async function updateCampaign(providerCampaignId, type) {
  if (!providerCampaignId) return;
  const snapshot = await campaigns().where('providerCampaignId', '==', providerCampaignId).get();
  await Promise.all(snapshot.docs.map((doc) => campaigns().doc(doc.id).set({
    lastProviderEvent: type,
    lastProviderEventAt: serverTimestamp(),
  }, { merge: true })));
}

async function suppressRecipients(emails, type, data) {
  if (!['email.bounced', 'email.complained', 'email.suppressed'].includes(type)) return;
  const snapshot = await subscriptions().get();
  const targets = new Set(emails);
  const matching = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey)
    .filter((item) => targets.has(normalizeEmail(item.email)));
  await Promise.all(matching.map((item) => subscriptions().doc(item.id).set({
    status: 'suppressed',
    suppressionReason: webhookErrorMessage(type, data),
    suppressedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })));
}

async function syncContactUnsubscribe(type, data) {
  if (type !== 'contact.updated' || data?.unsubscribed !== true) return;
  const email = normalizeEmail(data.email);
  if (!email) return;
  const snapshot = await subscriptions().get();
  const matching = snapshot.docs
    .map(serializeDoc)
    .filter((item) => item.projectKey === config.mailProjectKey)
    .filter((item) => item.audienceKey === config.newsletterAudienceKey)
    .filter((item) => normalizeEmail(item.email) === email);
  await Promise.all(matching.map((item) => subscriptions().doc(item.id).set({
    status: 'unsubscribed',
    unsubscribedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    providerContactId: String(data.id || item.providerContactId || ''),
  }, { merge: true })));
}

function webhookErrorMessage(type, data) {
  return data?.bounce?.message || data?.failed?.reason || type;
}

function webhookEventId(value) {
  return createHash('sha256').update(value || 'missing').digest('hex');
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}
