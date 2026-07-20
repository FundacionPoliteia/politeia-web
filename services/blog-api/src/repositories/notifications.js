import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';
import { MAIL_CHANNELS, sendMail } from '../mail/provider.js';
import { renderEditorialMail } from '../mail/templates.js';
import { writeAuditLog } from './audit.js';
import { createMailDelivery } from './mail.js';

export { sendMail };

export const NOTIFICATION_EVENTS = {
  postSubmittedReview: 'postSubmittedReview',
  commentCreated: 'commentCreated',
  commentReplied: 'commentReplied',
  commentResolved: 'commentResolved',
  commentReopened: 'commentReopened',
  postPublished: 'postPublished',
  postEditRequested: 'postEditRequested',
  postEditEnabled: 'postEditEnabled',
  roleChanged: 'roleChanged',
  profileClaimRequested: 'profileClaimRequested',
  profileClaimApproved: 'profileClaimApproved',
  profileClaimBlocked: 'profileClaimBlocked',
  profileClaimReleased: 'profileClaimReleased',
  profileClaimSuperseded: 'profileClaimSuperseded',
};

const DEFAULT_EVENTS = {
  [NOTIFICATION_EVENTS.postSubmittedReview]: true,
  [NOTIFICATION_EVENTS.commentCreated]: true,
  [NOTIFICATION_EVENTS.commentReplied]: true,
  [NOTIFICATION_EVENTS.commentResolved]: true,
  [NOTIFICATION_EVENTS.commentReopened]: true,
  [NOTIFICATION_EVENTS.postPublished]: true,
  [NOTIFICATION_EVENTS.postEditRequested]: true,
  [NOTIFICATION_EVENTS.postEditEnabled]: true,
  [NOTIFICATION_EVENTS.roleChanged]: true,
  [NOTIFICATION_EVENTS.profileClaimRequested]: true,
  [NOTIFICATION_EVENTS.profileClaimApproved]: true,
  [NOTIFICATION_EVENTS.profileClaimBlocked]: true,
  [NOTIFICATION_EVENTS.profileClaimReleased]: true,
  [NOTIFICATION_EVENTS.profileClaimSuperseded]: true,
};

const preferences = () => db().collection('notificationPreferences');
const events = () => db().collection('notificationEvents');
const reads = () => db().collection('notificationReads');
const DAY_MS = 24 * 60 * 60 * 1000;
const INBOX_RECENT_DAYS = 3;
const INBOX_RETENTION_DAYS = 7;
const INBOX_RETENTION_MS = INBOX_RETENTION_DAYS * DAY_MS;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let nextCleanupAt = 0;

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

export async function listInAppNotifications(user, { limit = 50 } = {}) {
  const email = normalizeEmail(user?.email);
  if (!email) return inboxResult([], 0);

  await cleanupExpiredNotifications().catch(logNotificationCleanupError);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 300);
  const userRoles = sanitizeRoles(user?.roles || []);
  const since = Date.now() - INBOX_RETENTION_MS;
  const [eventsSnapshot, readsSnapshot] = await Promise.all([
    events().get(),
    reads().where('userEmail', '==', email).get(),
  ]);
  const readByEventId = new Map(
    readsSnapshot.docs
      .map(serializeDoc)
      .filter((item) => item?.eventId)
      .map((item) => [item.eventId, item.readAt || null])
  );
  const relevant = eventsSnapshot.docs
    .map(serializeDoc)
    .filter((event) => isEventRelevantForUser(event, { email, roles: userRoles }))
    .filter((event) => eventTimestamp(event) >= since)
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .map((event) => toInboxItem(event, readByEventId.get(event.id) || null));

  return {
    items: relevant.slice(0, safeLimit),
    unreadCount: relevant.filter((item) => !item.readAt).length,
    recentDays: INBOX_RECENT_DAYS,
    retentionDays: INBOX_RETENTION_DAYS,
  };
}

export async function markNotificationRead(eventId = '', user) {
  const email = normalizeEmail(user?.email);
  const cleanEventId = normalizeId(eventId);
  if (!email || !cleanEventId) return null;

  const eventDoc = await events().doc(cleanEventId).get();
  if (!eventDoc.exists) return null;
  const event = serializeDoc(eventDoc);
  if (!isEventRelevantForUser(event, { email, roles: sanitizeRoles(user?.roles || []) })) return null;

  const ref = reads().doc(readId(cleanEventId, email));
  await ref.set({
    eventId: cleanEventId,
    userEmail: email,
    readAt: serverTimestamp(),
    expiresAt: notificationExpiration(event),
  }, { merge: true });
  return toInboxItem(event, serializeDoc(await ref.get()).readAt || null);
}

export async function markAllNotificationsRead(user) {
  const inbox = await listInAppNotifications(user, { limit: 300 });
  await Promise.all(inbox.items
    .filter((item) => !item.readAt)
    .map((item) => markNotificationRead(item.id, user)));
  return listInAppNotifications(user, { limit: 300 });
}

export async function cleanupExpiredNotifications({ force = false, now = Date.now() } = {}) {
  if (!force && now < nextCleanupAt) return { deletedEvents: 0, deletedReads: 0, skipped: true };
  nextCleanupAt = now + CLEANUP_INTERVAL_MS;
  const cutoff = now - INBOX_RETENTION_MS;
  const [eventsSnapshot, readsSnapshot] = await Promise.all([events().get(), reads().get()]);
  const retainedEventIds = new Set();
  const expiredEventDocs = [];

  for (const doc of eventsSnapshot.docs) {
    const event = serializeDoc(doc);
    if (eventTimestamp(event) < cutoff) expiredEventDocs.push(doc);
    else retainedEventIds.add(doc.id);
  }

  const orphanReadDocs = readsSnapshot.docs.filter((doc) => {
    const item = serializeDoc(doc);
    return !item?.eventId || !retainedEventIds.has(item.eventId);
  });

  await Promise.all([
    ...expiredEventDocs.map((doc) => events().doc(doc.id).delete()),
    ...orphanReadDocs.map((doc) => reads().doc(doc.id).delete()),
  ]);

  return {
    deletedEvents: expiredEventDocs.length,
    deletedReads: orphanReadDocs.length,
    skipped: false,
  };
}

export async function notifyPostSubmittedForReview(post, actor) {
  const emailRecipients = await listOptedInRecipients({
    eventKey: NOTIFICATION_EVENTS.postSubmittedReview,
    roles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.submittedReview',
    eventKey: NOTIFICATION_EVENTS.postSubmittedReview,
    actor,
    post,
    emailRecipients,
    targetRoles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
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
  const emailRecipients = await listOptedInEmails({
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
    emailRecipients,
    targetEmails: [post.authorEmail],
    excludeEmails: [actor?.email],
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
  const eventKey = status === 'resolved'
    ? NOTIFICATION_EVENTS.commentResolved
    : NOTIFICATION_EVENTS.commentReopened;
  const { targetEmails, targetRoles } = commentReplyTargets(post, comment, actor);
  const directRecipients = await listOptedInEmails({
    eventKey,
    emails: targetEmails,
    excludeEmails: [actor?.email],
  });
  const roleRecipients = targetRoles.length
    ? await listOptedInRecipients({ eventKey, roles: targetRoles, excludeEmails: [actor?.email] })
    : [];
  return queueNotification({
    type: status === 'resolved' ? 'comment.resolved' : 'comment.reopened',
    eventKey,
    actor,
    post,
    comment,
    emailRecipients: [...directRecipients, ...roleRecipients],
    targetEmails,
    targetRoles,
    excludeEmails: [actor?.email],
    subject: `${status === 'resolved' ? 'Comentario resuelto' : 'Comentario reabierto'}: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} ${status === 'resolved' ? 'resolvio' : 'reabrio'} un comentario.`,
      `Post: ${post.title}`,
      `Comentario: ${latestCommentReply(comment)?.body || comment.body}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyCommentReplied(post, comment, actor) {
  const eventKey = NOTIFICATION_EVENTS.commentReplied;
  const { targetEmails, targetRoles } = commentReplyTargets(post, comment, actor);
  const directRecipients = await listOptedInEmails({
    eventKey,
    emails: targetEmails,
    excludeEmails: [actor?.email],
  });
  const roleRecipients = targetRoles.length
    ? await listOptedInRecipients({ eventKey, roles: targetRoles, excludeEmails: [actor?.email] })
    : [];
  return queueNotification({
    type: 'comment.reply',
    eventKey,
    actor,
    post,
    comment,
    emailRecipients: [...directRecipients, ...roleRecipients],
    targetEmails,
    targetRoles,
    excludeEmails: [actor?.email],
    subject: `Nueva respuesta en comentario: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} respondio un comentario.`,
      `Post: ${post.title}`,
      `Respuesta: ${latestCommentReply(comment)?.body || comment.body}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyPostPublished(post, actor) {
  if (!isReviewerActor(actor)) return null;
  const emailRecipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.postPublished,
    emails: [post.authorEmail],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.published',
    eventKey: NOTIFICATION_EVENTS.postPublished,
    actor,
    post,
    emailRecipients,
    targetEmails: [post.authorEmail],
    excludeEmails: [actor?.email],
    subject: `Post publicado: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} publico tu post.`,
      `Titulo: ${post.title}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyPostEditRequested(post, actor) {
  const emailRecipients = await listOptedInRecipients({
    eventKey: NOTIFICATION_EVENTS.postEditRequested,
    roles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.editRequested',
    eventKey: NOTIFICATION_EVENTS.postEditRequested,
    actor,
    post,
    emailRecipients,
    targetRoles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
    subject: `Solicitud de edición: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} solicitó habilitar una edicion.`,
      `Titulo: ${post.title}`,
      `Autor: ${post.authorName || post.authorEmail}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyPostEditEnabled(post, actor) {
  if (!isReviewerActor(actor)) return null;
  const directRecipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.postEditEnabled,
    emails: [post.authorEmail],
    excludeEmails: [actor?.email],
  });
  const roleRecipients = await listOptedInRecipients({
    eventKey: NOTIFICATION_EVENTS.postEditEnabled,
    roles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'post.editEnabled',
    eventKey: NOTIFICATION_EVENTS.postEditEnabled,
    actor,
    post,
    emailRecipients: [...directRecipients, ...roleRecipients],
    targetEmails: [post.authorEmail],
    targetRoles: ['admin', 'reviewer'],
    excludeEmails: [actor?.email],
    subject: `Edicion habilitada: ${post.title}`,
    text: [
      `${actor?.name || actor?.email} habilito la edicion de tu post.`,
      `Titulo: ${post.title}`,
      `Abrir panel: ${adminPostUrl(post.id)}`,
    ].join('\n'),
  });
}

export async function notifyRolesChanged(assignment, actorEmail) {
  const emailRecipients = await listOptedInEmails({
    eventKey: NOTIFICATION_EVENTS.roleChanged,
    emails: [assignment.email],
    excludeEmails: [actorEmail],
  });
  return queueNotification({
    type: 'user.roles.changed',
    eventKey: NOTIFICATION_EVENTS.roleChanged,
    actor: { email: actorEmail, name: actorEmail },
    emailRecipients,
    targetEmails: [assignment.email],
    excludeEmails: [actorEmail],
    subject: 'Tus permisos internos fueron actualizados',
    text: [
      'Un admin actualizo tus permisos internos en Politeia.',
      `Roles actuales: ${(assignment.roles || []).join(', ') || 'sin roles activos'}`,
      `Abrir panel: ${config.appBaseUrl}/admin`,
    ].join('\n'),
    metadata: { assignment },
  });
}

export async function notifyProfileClaimRequested(claim, actor) {
  const emailRecipients = await listOptedInRecipients({
    eventKey: NOTIFICATION_EVENTS.profileClaimRequested,
    roles: ['admin'],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type: 'profile.claim.requested',
    eventKey: NOTIFICATION_EVENTS.profileClaimRequested,
    actor,
    profileClaim: claim,
    emailRecipients,
    targetRoles: ['admin'],
    excludeEmails: [actor?.email],
    subject: `Nueva solicitud de vinculacion: ${claim.fullName}`,
    text: [
      `${actor?.name || actor?.email} solicito vincularse con el perfil ${claim.fullName}.`,
      `Email: ${claim.requesterEmail}`,
      `Notas alcanzadas: ${claim.affectedPostCount || 0}`,
      `Abrir panel: ${config.appBaseUrl}/admin`,
    ].join('\n'),
  });
}

export async function notifyProfileClaimApproved(claim, actor) {
  return notifyProfileClaimOutcome({
    claim,
    actor,
    type: 'profile.claim.approved',
    eventKey: NOTIFICATION_EVENTS.profileClaimApproved,
    subject: `Perfil vinculado: ${claim.fullName}`,
    text: `Tu cuenta ya esta vinculada con ${claim.fullName}. Heredaste el acceso a ${claim.transferredPostCount || claim.affectedPostCount || 0} notas.`,
  });
}

export async function notifyProfileClaimBlocked(claim, actor) {
  return notifyProfileClaimOutcome({
    claim,
    actor,
    type: 'profile.claim.blocked',
    eventKey: NOTIFICATION_EVENTS.profileClaimBlocked,
    subject: `Solicitud bloqueada: ${claim.fullName}`,
    text: claim.blockReason
      ? `La solicitud fue bloqueada. Motivo: ${claim.blockReason}`
      : 'La solicitud fue bloqueada. Contacta a un administrador si necesitas revisarla.',
  });
}

export async function notifyProfileClaimReleased(claim, actor) {
  return notifyProfileClaimOutcome({
    claim,
    actor,
    type: 'profile.claim.released',
    eventKey: NOTIFICATION_EVENTS.profileClaimReleased,
    subject: `Solicitud desbloqueada: ${claim.fullName}`,
    text: 'Ya podes volver a solicitar la vinculacion de este perfil.',
  });
}

export async function notifyProfileClaimSuperseded(claim, actor) {
  return notifyProfileClaimOutcome({
    claim,
    actor,
    type: 'profile.claim.superseded',
    eventKey: NOTIFICATION_EVENTS.profileClaimSuperseded,
    subject: `Perfil no disponible: ${claim.fullName}`,
    text: 'El perfil fue vinculado con otra cuenta y ya no esta disponible.',
  });
}

async function notifyProfileClaimOutcome({ claim, actor, type, eventKey, subject, text }) {
  const emailRecipients = await listOptedInEmails({
    eventKey,
    emails: [claim.requesterEmail],
    excludeEmails: [actor?.email],
  });
  return queueNotification({
    type,
    eventKey,
    actor,
    profileClaim: claim,
    emailRecipients,
    targetEmails: [claim.requesterEmail],
    excludeEmails: [actor?.email],
    subject,
    text: `${text}\nAbrir perfil: ${config.appBaseUrl}/admin`,
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

async function queueNotification({
  type,
  eventKey,
  actor,
  post = null,
  comment = null,
  profileClaim = null,
  emailRecipients = [],
  targetEmails = [],
  targetRoles = [],
  excludeEmails = [],
  subject,
  text,
  metadata = {},
}) {
  const cleanEmailRecipients = dedupeRecipients(emailRecipients);
  const cleanTargetEmails = [...emailSet(targetEmails)];
  const cleanTargetRoles = sanitizeRoles(targetRoles);
  const cleanExcludeEmails = [...emailSet(excludeEmails)];
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
    commentBody: latestCommentReply(comment)?.body || comment?.body || '',
    commentSelectedText: comment?.selectedTextCurrent || latestCommentReply(comment)?.selectedText || comment?.selectedText || '',
    profileClaimId: profileClaim?.id || '',
    managedProfileId: profileClaim?.managedProfileId || '',
    profileName: profileClaim?.fullName || '',
    requesterEmail: normalizeEmail(profileClaim?.requesterEmail),
    targetEmails: cleanTargetEmails,
    targetRoles: cleanTargetRoles,
    excludeEmails: cleanExcludeEmails,
    subject,
    text,
    metadata,
    recipientCount: cleanTargetEmails.length + cleanTargetRoles.length,
    emailRecipientCount: cleanEmailRecipients.length,
    status: 'processed',
    createdAt: serverTimestamp(),
    processedAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + INBOX_RETENTION_MS),
  };
  await cleanupExpiredNotifications().catch(logNotificationCleanupError);
  await eventRef.set(event);

  const createdDeliveries = [];
  const rendered = renderEditorialMail({
    subject,
    text,
    actionUrl: post?.id ? adminPostUrl(post.id) : `${config.appBaseUrl}/admin`,
  });
  for (const recipient of cleanEmailRecipients) {
    createdDeliveries.push(await createMailDelivery({
      channel: MAIL_CHANNELS.internal,
      eventId: eventRef.id,
      eventKey,
      type,
      recipient,
      subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: `${eventRef.id}:${recipient.email}`,
    }));
  }
  return { eventId: eventRef.id, deliveries: createdDeliveries };
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

function commentReplyTargets(post, comment, actor) {
  const actorIsReviewer = isReviewerActor(actor);
  return {
    targetEmails: actorIsReviewer ? [post.authorEmail] : [comment.authorEmail],
    targetRoles: actorIsReviewer ? [] : ['admin', 'reviewer'],
  };
}

function latestCommentReply(comment = {}) {
  const replies = Array.isArray(comment?.replies) ? comment.replies : [];
  return replies[replies.length - 1] || null;
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
  return ['admin', 'reviewer', 'blog', 'newsletter'].filter((role) => roles.has(role));
}

function toInboxItem(event, readAt = null) {
  return {
    id: event.id,
    type: event.type || '',
    eventKey: event.eventKey || '',
    subject: event.subject || '',
    text: event.text || '',
    actorEmail: normalizeEmail(event.actorEmail),
    actorName: event.actorName || event.actorEmail || '',
    postId: event.postId || '',
    postTitle: event.postTitle || '',
    commentId: event.commentId || '',
    commentBody: event.commentBody || '',
    commentSelectedText: event.commentSelectedText || '',
    profileClaimId: event.profileClaimId || '',
    managedProfileId: event.managedProfileId || '',
    profileName: event.profileName || '',
    requesterEmail: normalizeEmail(event.requesterEmail),
    createdAt: event.createdAt || null,
    readAt,
  };
}

function isEventRelevantForUser(event, user) {
  const email = normalizeEmail(user?.email);
  if (!email || normalizeEmail(event?.actorEmail) === email) return false;
  if (emailSet(event?.excludeEmails || []).has(email)) return false;
  if (emailSet(event?.targetEmails || []).has(email)) return true;
  const userRoles = sanitizeRoles(user?.roles || []);
  const eventRoles = sanitizeRoles(event?.targetRoles || []);
  return eventRoles.some((role) => userRoles.includes(role));
}

function eventTimestamp(event) {
  const value = event?.createdAt;
  if (!value) return 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Date.parse(String(value)) || 0;
}

function notificationExpiration(event) {
  const createdAt = eventTimestamp(event) || Date.now();
  return new Date(createdAt + INBOX_RETENTION_MS);
}

function inboxResult(items, unreadCount) {
  return {
    items,
    unreadCount,
    recentDays: INBOX_RECENT_DAYS,
    retentionDays: INBOX_RETENTION_DAYS,
  };
}

function logNotificationCleanupError(err) {
  nextCleanupAt = 0;
  console.error(JSON.stringify({
    severity: 'ERROR',
    message: 'notification retention cleanup failed',
    error: err?.message || String(err),
  }));
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

function readId(eventId, email) {
  return `${normalizeId(eventId)}__${preferenceId(email)}`;
}

function normalizeId(value = '') {
  return typeof value === 'string' ? value.trim().replaceAll('/', '_') : '';
}

function emailSet(emails = []) {
  return new Set(emails.map(normalizeEmail).filter(Boolean));
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
