import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { MAIL_CHANNELS, channelSender, sendMail } from '../mail/provider.js';

const deliveries = () => db().collection('emailDeliveries');

export async function createMailDelivery({
  channel = MAIL_CHANNELS.internal,
  eventId = '',
  eventKey = '',
  type = '',
  recipient,
  subject,
  text = '',
  html = '',
  replyTo = '',
  headers = {},
  idempotencyKey = '',
}) {
  const recipientEmail = normalizeEmail(recipient?.email || recipient);
  const stableKey = idempotencyKey || [eventId, eventKey, type, recipientEmail].filter(Boolean).join(':');
  const deliveryRef = stableKey
    ? deliveries().doc(deliveryId(config.mailProjectKey, channel, stableKey, recipientEmail))
    : deliveries().doc();
  const existing = await deliveryRef.get();
  if (existing.exists) {
    const item = serializeDoc(existing);
    if (['sent', 'logged', 'skipped'].includes(item.status)) return item;
  }

  const previous = existing.exists ? serializeDoc(existing) : null;
  await deliveryRef.set({
    projectKey: config.mailProjectKey,
    channel,
    eventId,
    eventKey,
    type,
    recipientEmail,
    recipientName: recipient?.name || recipientEmail,
    from: channelSender(channel),
    replyTo: replyTo || config.mailReplyTo || '',
    subject,
    text,
    html,
    status: 'pending',
    provider: config.mailProvider,
    attempts: Number(previous?.attempts || 0),
    lastError: '',
    providerMessageId: '',
    idempotencyKey: stableKey,
    createdAt: previous?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    sentAt: null,
  }, { merge: true });

  const result = await sendMail({
    channel,
    to: recipientEmail,
    subject,
    text,
    html,
    replyTo,
    headers,
    idempotencyKey: stableKey,
  });
  const current = serializeDoc(await deliveryRef.get());
  await deliveryRef.update(result.ok ? {
    status: result.status,
    attempts: Number(current.attempts || 0) + 1,
    providerMessageId: result.providerMessageId || '',
    lastError: '',
    sentAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } : {
    status: 'failed',
    attempts: Number(current.attempts || 0) + 1,
    lastError: result.error || 'Mail provider failed',
    updatedAt: serverTimestamp(),
  });
  return serializeDoc(await deliveryRef.get());
}

function deliveryId(projectKey, channel, stableKey, email) {
  return createHash('sha256')
    .update([projectKey, channel, stableKey, email].join('|'))
    .digest('hex');
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}
