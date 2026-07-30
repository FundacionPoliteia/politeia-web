import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import mammoth from 'mammoth';
import { config, requireConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { db, serializeDoc, serverTimestamp, Timestamp } from '../firestore.js';
import { MAIL_CHANNELS, sendMail } from '../mail/provider.js';
import { writeAuditLog } from './audit.js';

const applications = () => db().collection('teamApplications');
const APPLICATION_STATUSES = new Set(['new', 'reviewing', 'contacted', 'archived']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function createTeamApplication({ body = {}, file, idempotencyKey, requestMeta = {} }) {
  requireConfig(['applicationsBucket']);
  const safeKey = sanitizeIdempotencyKey(idempotencyKey);
  const ref = applications().doc(applicationId(safeKey));
  const existing = await ref.get();
  if (existing.exists) return { item: serializeDoc(existing), duplicate: true };

  const input = sanitizeApplication(body);
  const inspectedFile = await inspectCv(file);
  const objectPath = `applications/${new Date().toISOString().slice(0, 10)}/${ref.id}.${inspectedFile.extension}`;
  await uploadPrivateObject({
    path: objectPath,
    buffer: file.buffer,
    contentType: inspectedFile.contentType,
  });

  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + config.applicationRetentionDays * 24 * 60 * 60 * 1000);
  await ref.create({
    ...input,
    status: 'new',
    internalNote: '',
    cv: {
      bucket: config.applicationsBucket,
      path: objectPath,
      originalName: sanitizeFileName(file.originalname),
      contentType: inspectedFile.contentType,
      size: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    },
    consent: {
      accepted: true,
      version: '2026-07-28',
      acceptedAt: serverTimestamp(),
    },
    idempotencyKey: safeKey,
    notificationStatus: config.applicationRecipients.length ? 'pending' : 'skipped',
    notificationError: '',
    source: 'public-site',
    requestMeta: {
      country: String(requestMeta.country || '').slice(0, 2),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt,
  });

  const created = serializeDoc(await ref.get());
  const notification = await notifyApplication(created).catch((error) => ({
    ok: false,
    error: error?.message || 'notification failed',
  }));
  await ref.set({
    notificationStatus: notification.ok ? (notification.status || 'sent') : 'failed',
    notificationError: notification.ok ? '' : String(notification.error || 'notification failed').slice(0, 300),
    notificationUpdatedAt: serverTimestamp(),
  }, { merge: true });

  await createAdminNotification(created).catch((error) => {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'application in-app notification failed',
      applicationId: created.id,
      error: error?.message || 'unknown error',
    }));
  });
  return { item: serializeDoc(await ref.get()), duplicate: false };
}

export async function listTeamApplications({ status = '', limit = 30, cursor = '' } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 50);
  let query = applications().orderBy('createdAt', 'desc');
  if (status && APPLICATION_STATUSES.has(status)) query = applications().where('status', '==', status).orderBy('createdAt', 'desc');
  if (cursor) {
    const cursorDoc = await applications().doc(cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }
  const snapshot = await query.limit(pageSize + 1).get();
  const docs = snapshot.docs.slice(0, pageSize);
  return {
    items: docs.map((doc) => applicationSummary(serializeDoc(doc))),
    nextCursor: snapshot.docs.length > pageSize ? docs.at(-1)?.id || '' : '',
  };
}

export async function getTeamApplication(id) {
  const doc = await applications().doc(id).get();
  if (!doc.exists) throw new HttpError(404, 'Postulacion no encontrada');
  return serializeDoc(doc);
}

export async function updateTeamApplication(id, body, actorEmail) {
  const ref = applications().doc(id);
  const before = await getTeamApplication(id);
  const update = { updatedAt: serverTimestamp(), updatedBy: actorEmail };
  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.has(body.status)) throw new HttpError(400, 'Estado invalido');
    update.status = body.status;
  }
  if (body.internalNote !== undefined) update.internalNote = String(body.internalNote || '').trim().slice(0, 4000);
  await ref.set(update, { merge: true });
  const after = await getTeamApplication(id);
  await writeAuditLog({
    actorEmail,
    action: 'application.update',
    resourceType: 'teamApplication',
    resourceId: id,
    before: { status: before.status },
    after: { status: after.status },
  });
  return after;
}

export async function resendApplicationNotification(id, actorEmail) {
  const item = await getTeamApplication(id);
  const result = await notifyApplication(item);
  await applications().doc(id).set({
    notificationStatus: result.ok ? (result.status || 'sent') : 'failed',
    notificationError: result.ok ? '' : String(result.error || 'notification failed').slice(0, 300),
    notificationUpdatedAt: serverTimestamp(),
  }, { merge: true });
  await writeAuditLog({
    actorEmail,
    action: 'application.notification.retry',
    resourceType: 'teamApplication',
    resourceId: id,
    after: { ok: result.ok === true },
  });
  if (!result.ok) throw new HttpError(502, 'No se pudo reenviar el aviso');
  return getTeamApplication(id);
}

export async function downloadTeamApplicationCv(id, actorEmail) {
  const item = await getTeamApplication(id);
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  const storage = google.storage({ version: 'v1', auth });
  const response = await storage.objects.get({
    bucket: item.cv.bucket,
    object: item.cv.path,
    alt: 'media',
  }, { responseType: 'stream' });
  await writeAuditLog({
    actorEmail,
    action: 'application.cv.download',
    resourceType: 'teamApplication',
    resourceId: id,
  });
  return { item, stream: response.data };
}

export async function deleteTeamApplication(id, actorEmail) {
  const item = await getTeamApplication(id);
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
  const storage = google.storage({ version: 'v1', auth });
  await storage.objects.delete({ bucket: item.cv.bucket, object: item.cv.path }).catch((error) => {
    if (error?.code !== 404) throw error;
  });
  await applications().doc(id).delete();
  await writeAuditLog({
    actorEmail,
    action: 'application.delete',
    resourceType: 'teamApplication',
    resourceId: id,
    before: { status: item.status },
  });
}

export async function inspectCv(file = {}) {
  if (!file?.buffer?.length) throw new HttpError(400, 'El CV es obligatorio');
  if (file.size > MAX_FILE_SIZE) throw new HttpError(400, 'El CV no puede superar los 5 MB');
  if (file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { contentType: 'application/pdf', extension: 'pdf' };
  }
  const isZip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  if (isZip) {
    try {
      await mammoth.extractRawText({ buffer: file.buffer });
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
      };
    } catch {
      throw new HttpError(400, 'El archivo DOCX no es valido');
    }
  }
  throw new HttpError(400, 'El CV debe ser un PDF o DOCX valido');
}

function sanitizeApplication(body) {
  const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const area = String(body.area || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const message = String(body.message || '').trim().slice(0, 4000);
  if (fullName.length < 3) throw new HttpError(400, 'Ingresa tu nombre y apellido');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Ingresa un email valido');
  if (!area) throw new HttpError(400, 'Selecciona un area de interes');
  if (message.length < 20) throw new HttpError(400, 'Contanos brevemente por que queres sumarte');
  if (body.consent !== 'true' && body.consent !== true) throw new HttpError(400, 'Debes aceptar el tratamiento de tus datos');
  const linkedinUrl = String(body.linkedinUrl || '').trim();
  if (linkedinUrl && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(linkedinUrl)) {
    throw new HttpError(400, 'El enlace de LinkedIn no es valido');
  }
  return {
    fullName,
    email,
    phone: String(body.phone || '').trim().slice(0, 40),
    linkedinUrl: linkedinUrl.slice(0, 500),
    area,
    message,
  };
}

async function uploadPrivateObject({ path, buffer, contentType }) {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
  const storage = google.storage({ version: 'v1', auth });
  await storage.objects.insert({
    bucket: config.applicationsBucket,
    name: path,
    uploadType: 'media',
    requestBody: { contentType },
    media: { mimeType: contentType, body: Readable.from(buffer) },
  });
}

async function notifyApplication(item) {
  if (!config.applicationRecipients.length) return { ok: true, status: 'skipped' };
  return sendMail({
    channel: MAIL_CHANNELS.internal,
    to: config.applicationRecipients,
    subject: `Nueva postulacion para ${item.area}`,
    text: [
      'Se recibio una nueva postulacion para integrar el equipo de Politeia.',
      `Area: ${item.area}`,
      `Revisala en ${config.appBaseUrl}/admin?tab=applications&application=${item.id}`,
      'El CV permanece en almacenamiento privado y solo puede descargarse desde el panel.',
    ].join('\n'),
    idempotencyKey: `application-${item.id}`,
  });
}

async function createAdminNotification(item) {
  await db().collection('notificationEvents').add({
    type: 'application.created',
    eventKey: `application-created:${item.id}`,
    targetRoles: ['admin'],
    targetEmails: [],
    excludeEmails: [],
    applicationId: item.id,
    postId: '',
    postTitle: '',
    actorEmail: '',
    actorName: 'Sitio publico',
    metadata: { area: item.area },
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

function applicationId(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function sanitizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[a-zA-Z0-9._:-]{16,160}$/.test(key)) throw new HttpError(400, 'Idempotency-Key invalida');
  return key;
}

function sanitizeFileName(value) {
  return String(value || 'cv').replace(/[^\w.\- ]+/g, '').trim().slice(0, 180) || 'cv';
}

function applicationSummary(item = {}) {
  return {
    id: item.id,
    fullName: item.fullName || '',
    email: item.email || '',
    phone: item.phone || '',
    linkedinUrl: item.linkedinUrl || '',
    area: item.area || '',
    message: item.message || '',
    cv: item.cv ? {
      originalName: item.cv.originalName || '',
      contentType: item.cv.contentType || '',
      size: Number(item.cv.size) || 0,
    } : null,
    status: item.status || 'new',
    notificationStatus: item.notificationStatus || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
  };
}
