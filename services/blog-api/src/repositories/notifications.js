import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';
import { writeAuditLog } from './audit.js';

export const NOTIFICATION_EVENTS = {
  postSubmittedReview: 'postSubmittedReview',
  commentCreated: 'commentCreated',
  commentResolved: 'commentResolved',
  commentReopened: 'commentReopened',
  postPublished: 'postPublished',
  roleChanged: 'roleChanged',
};

const DEFAULT_EVENTS = {
  [NOTIFICATION_EVENTS.postSubmittedReview]: true,
  [NOTIFICATION_EVENTS.commentCreated]: true,
  [NOTIFICATION_EVENTS.commentResolved]: true,
  [NOTIFICATION_EVENTS.commentReopened]: true,
  [NOTIFICATION_EVENTS.postPublished]: true,
  [NOTIFICATION_EVENTS.roleChanged]: true,
};

const preferences = () => db().collection('notificationPreferences');
const events = () => db().collection('notificationEvents');
const deliveries = () => db().collection('emailDeliveries');

export async function getNotificationPreferences(user) {
  const email = normalizeEmail(user?.email);
  const ref = email ? preferences().doc(preferenceId(email)) : null;
  const doc = ref ? await ref.get() : null;
  if (doc?.exists) {
    await ref.set({
      email,
      name: user?.name || email,
      roles: sanitizeRoles(user?.roles || []),
      identityUpdatedAt: serverTimestamp(),
    }, { merge: true });
    return toPreference(serializeDoc(await ref.get()), user);
  }
  return toPreference(null, user);
}

export async function updateNotificationPreferences(user, body = {}) {
  const email = normalizeEmail(user?.email);
  const before = await getNotificationPreferences(user);
  const next = toPreference({
    ...before,
    enabled: body.enabled === true,
    events: sanitizeEvents(body.events || before.events),
    updatedAt: serverTimestamp(),
    updatedBy: email,
    email,
    name: user?.name || email,
    roles: sanitizeRoles(user?.roles || []),
  }, user);

  const ref = preferences().doc(preferenceId(email));
  await ref.set({
    email: next.email,
    name: next.name,
    roles: next.roles,
    enabled: next.enabled,
    events: next.events,
    updatedAt: serverTimestamp(),
    updatedBy: email,
  }, { merge: true });

  const after = toPreference(serializeDoc(await ref.get()), user);
  await writeAuditLog({
    actorEmail: email,
    action: 'notifications.preferences.update',
    resourceType: 'notificationPreferences',
    resourceId: email,
    before,
    after,
  });
  return after;
}

export async function notifyPostSubmittedForReview(post, actor) {
  const recipients = await listOptedInRecipients({
    eventKey: NOTIFICATION_EVENTS.postSubmittedReview,
    roles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.submittedReview',
    eventKey: NOTIFICATION_EVENTS.postSubmittedReview,
    actor,
    post,
    recipients,
    subject: `Nuevo post en revision: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} envio un post a revision.`,
      `Titulo: ${post.title}`,
      `Autor: ${post.authorName || post.authorEmail}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyCommentCreated(post, comment, actor) {
  if (!isReviewerActor(actor)) return null;
  const recipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.commentCreated,
    emails: [post.authorEmail],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'comment.created',
    eventKey: NOTIFICATION_EVENTS.commentCreated,
    actor,
    post,
    comment,
    recipients,
    subject: `Nuevo comentario en tu post: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} dejo un comentario de revision.`,
      `Post: ${post.title}`,
      comment.selectedText ? `Texto seleccionado: "${comment.selectedText}"` : '',
      `Comentario: ${comment.body}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].filter(Boolean).join('\n'),
  });
}

export async function notifyCommentStatusChanged(post, comment, actor, status) {
  if (!isReviewerActor(actor)) return null;
  const eventKey = status === 'resolved'
    ? NOTIFICATION_EVENTS.commentResolved
    : NOTIFICATION_EVENTS.commentReopened;
  const recipients = await listOptedInEmails({
    eventKey,
    emails: [post.authorEmail],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: status === 'resolved' ? 'comment.resolved' : 'comment.reopened',
    eventKey,
    actor,
    post,
    comment,
    recipients,
    subject: `${status === 'resolved' ? 'Comentario resuelto' : 'Comentario reabierto'}: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} ${status === 'resolved' ? 'resolvio' : 'reabrio'} un comentario.`,
      `Post: ${post.title}`,
      `Comentario: ${comment.body}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyPostPublished(post, actor) {
  if (!isReviewerActor(actor)) return null;
  const recipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.postPublished,
    emails: [post.authorEmail],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.published',
    eventKey: NOTIFICATION_EVENTS.postPublished,
    actor,
    post,
    recipients,
    subject: `Post publicado: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} publico tu post.`,
      `Titulo: ${post.title}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyRolesChanged(assignment, actorEmail) {
  const recipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.roleChanged,
    emails: [assignment.email],
    excludeEmails: [actorEmail],
  });
  return queueNotification({
    type: 'user.roles.changed',
    eventKey: NOTIFICATION_EVENTS.roleChanged,
    actor: { email: actorEmail, name: actorEmail },
    recipients,
    subject: 'Tus permisos internos fueron actualizados',
    text: [
      'Un admin actualizo tus permisos internos en Politeia.',
      `Roles actuales: ${(assignment.roles || []).join(', ') || 'sin roles activos'}`,
      `Abrir panel: ${config.appBaseUrl}/admin`,
    ].join('\n'),
    metadata: { assignment },
  });
}

export async function safeNotify(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'notification failed',
      error: err?.message || String(err),
    }));
    return null;
  }
}

async function queueNotification({ type, eventKey, actor, post = null, comment = null, recipients = [], subject, text, metadata = {} }) {
  const cleanRecipients = dedupeRecipients(recipients);
  if (!cleanRecipients.length) {
    console.info(JSON.stringify({
      severity: 'INFO',
      message: 'notification skipped',
      reason: 'no opted-in recipients',
      type,
      eventKey,
      actorEmail: normalizeEmail(actor?.email),
      postId: post?.id || '',
      postAuthorEmail: normalizeEmail(post?.authorEmail),
    }));
    return null;
  }

  const eventRef = events().doc();
  const event = {
    type,
    eventKey,
    actorEmail: normalizeEmail(actor?.email),
    actorName: actor?.name || actor?.email || '',
    postId: post?.id || '',
    postTitle: post?.title || '',
    postAuthorEmail: normalizeEmail(post?.authorEmail),
    commentId: comment?.id || '',
    subject,
    text,
    metadata,
    recipientCount: cleanRecipients.length,
    status: 'processed',
    createdAt: serverTimestamp(),
    processedAt: serverTimestamp(),
  };
  await eventRef.set(event);

  const createdDeliveries = [];
  for (const recipient of cleanRecipients) {
    createdDeliveries.push(await createDelivery({
      eventId: eventRef.id,
      eventKey,
      type,
      recipient,
      subject,
      text,
    }));
  }
  return { eventId: eventRef.id, deliveries: createdDeliveries };
}

async function createDelivery({ eventId, eventKey, type, recipient, subject, text }) {
  const deliveryRef = deliveries().doc();
  const base = {
    eventId,
    eventKey,
    type,
    recipientEmail: recipient.email,
    recipientName: recipient.name || recipient.email,
    from: config.mailFrom,
    replyTo: config.mailReplyTo || '',
    subject,
    text,
    status: 'pending',
    provider: config.mailProvider,
    attempts: 0,
    lastError: '',
    providerMessageId: '',
    createdAt: serverTimestamp(),
    sentAt: null,
  };
  await deliveryRef.set(base);

  const result = await sendMail({ to: recipient.email, subject, text });
  const patch = result.ok
    ? {
        status: result.status,
        attempts: 1,
        providerMessageId: result.providerMessageId || '',
        sentAt: serverTimestamp(),
      }
    : {
        status: 'failed',
        attempts: 1,
        lastError: result.error || 'Mail provider failed',
      };
  await deliveryRef.update(patch);
  return serializeDoc(await deliveryRef.get());
}

export async function sendMail({ to, subject, text }) {
  if (config.mailProvider === 'disabled') {
    return { ok: true, status: 'skipped', providerMessageId: 'disabled' };
  }

  if (config.mailProvider === 'resend') {
    return sendResendMail({ to, subject, text });
  }

  if (config.mailProvider !== 'console') {
    return { ok: false, error: `Unknown MAIL_PROVIDER: ${config.mailProvider}` };
  }

  console.info(JSON.stringify({
    severity: 'INFO',
    message: 'mail delivery',
    provider: config.mailProvider,
    from: config.mailFrom,
    to,
    subject,
    text,
  }));
  return { ok: true, status: 'logged', providerMessageId: `console-${Date.now()}` };
}

async function sendResendMail({ to, subject, text }) {
  if (!config.resendApiKey) {
    return { ok: false, error: 'Missing RESEND_API_KEY for MAIL_PROVIDER=resend' };
  }

  const payload = {
    from: config.mailFrom,
    to: [to],
    subject,
    text,
  };
  if (config.mailReplyTo) payload.reply_to = config.mailReplyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.message || data?.error || `Resend returned ${res.status}`;
    return { ok: false, error: message };
  }

  return { ok: true, status: 'sent', providerMessageId: data?.id || '' };
}

async function listOptedInEmails({ eventKey, emails = [], excludeEmails = [] }) {
  const recipients = [];
  for (const email of emails.map(normalizeEmail).filter(Boolean)) {
    const doc = await preferences().doc(preferenceId(email)).get();
    const preference = toPreference(doc.exists ? serializeDoc(doc) : null, { email });
    if (preferenceAcceptsEvent(preference, eventKey) && !emailSet(excludeEmails).has(email)) {
      recipients.push(preference);
    }
  }
  return recipients;
}

async function listOptedInRecipients({ eventKey, roles = [], excludeEmails = [] }) {
  const snapshot = await preferences()
    .where('enabled', '==', true)
    .limit(300)
    .get();
  const excluded = emailSet(excludeEmails);
  return snapshot.docs
    .map((doc) => toPreference(serializeDoc(doc), null))
    .filter((preference) => (
      preferenceAcceptsEvent(preference, eventKey)
      && !excluded.has(preference.email)
      && roles.some((role) => preference.roles.includes(role))
    ));
}

function preferenceAcceptsEvent(preference, eventKey) {
  return Boolean(preference?.enabled && preference?.events?.[eventKey] === true);
}

function toPreference(item, user) {
  const email = normalizeEmail(item?.email || user?.email);
  return {
    email,
    name: item?.name || user?.name || email,
    roles: sanitizeRoles(item?.roles || user?.roles || []),
    enabled: item?.enabled === true,
    events: sanitizeEvents(item?.events || DEFAULT_EVENTS),
    updatedAt: item?.updatedAt || null,
    updatedBy: item?.updatedBy || '',
  };
}

function sanitizeEvents(value = {}) {
  return Object.fromEntries(
    Object.keys(DEFAULT_EVENTS).map((key) => [key, value[key] !== false])
  );
}

function sanitizeRoles(value = []) {
  const roles = new Set(Array.isArray(value) ? value : []);
  return ['admin', 'reviewer', 'blog'].filter((role) => roles.has(role));
}

function dedupeRecipients(recipients = []) {
  const seen = new Set();
  return recipients.filter((recipient) => {
    const email = normalizeEmail(recipient?.email);
    if (!email || seen.has(email)) return false;
    seen.add(email);
    recipient.email = email;
    return true;
  });
}

function isReviewerActor(actor) {
  const roles = actor?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

function adminPostUrl(postId) {
  return `${config.appBaseUrl}/admin${postId ? `?post=${encodeURIComponent(postId)}` : ''}`;
}

function preferenceId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}

function emailSet(emails = []) {
  return new Set(emails.map(normalizeEmail).filter(Boolean));
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
