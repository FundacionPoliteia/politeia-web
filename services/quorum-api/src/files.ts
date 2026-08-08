import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { cachedGet, cacheTtl } from './dataCache.js';
import { ApiError, notFound } from './errors.js';
import { getStorage } from './storageClient.js';
import { newId, store } from './store.js';


export async function uploadPdf(file: Express.Multer.File, actorEmail: string, input: Record<string, unknown>) {
  if (!config.documentsBucket) throw new ApiError(503, 'documents_not_configured', 'El almacenamiento de documentos no está configurado');
  if (!file || file.mimetype !== 'application/pdf' || file.size > config.pdfMaxBytes || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new ApiError(422, 'invalid_pdf', 'El archivo debe ser un PDF válido dentro del límite permitido');
  }
  const title = String(input.title || '').trim();
  const sourceLabel = String(input.sourceLabel || '').trim();
  const documentDate = String(input.documentDate || '').trim();
  if (title.length < 2 || sourceLabel.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    throw new ApiError(422, 'document_metadata_required', 'Completá título, fuente y fecha del documento');
  }
  const id = newId('document');
  const objectName = `official/${new Date().getUTCFullYear()}/${randomUUID()}.pdf`;
  const storage = await getStorage();
  await storage.bucket(config.documentsBucket).file(objectName).save(file.buffer, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: { cacheControl: 'public,max-age=31536000,immutable', metadata: { uploadedBy: actorEmail, originalName: file.originalname } },
  });
  const record = { id, title, sourceLabel, documentDate, objectName, originalName: file.originalname, size: file.size, uploadedBy: actorEmail, createdAt: new Date().toISOString() };
  await store().set('uploads', id, record);
  return { ...record, url: `${config.publicApiUrl}/v1/public/files/${id}` };
}

export async function streamPdf(req: Request, res: Response) {
  const record = await cachedGet<{ id: string; objectName: string; originalName: string }>(store(), 'uploads', String(req.params.id), cacheTtl.immutableAsset);
  if (!record) throw notFound('Documento');
  if (!config.documentsBucket) throw new ApiError(503, 'documents_not_configured', 'El almacenamiento no está configurado');
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `inline; filename="${safeFilename(record.originalName)}"`);
  res.setHeader('cache-control', 'public,max-age=31536000,immutable');
  const storage = await getStorage();
  storage.bucket(config.documentsBucket).file(record.objectName).createReadStream()
    .on('error', () => res.destroy())
    .pipe(res);
}

const imageTypes: Record<string, { extension: string; valid: (buffer: Buffer) => boolean }> = {
  'image/jpeg': { extension: 'jpg', valid: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', valid: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', valid: (buffer) => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/gif': { extension: 'gif', valid: (buffer) => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')) },
};

export async function uploadEditorialImage(file: Express.Multer.File, actorEmail: string) {
  if (!config.documentsBucket) throw new ApiError(503, 'images_not_configured', 'El almacenamiento de imágenes no está configurado');
  const type = file && imageTypes[file.mimetype];
  if (!file || !type || file.size > config.imageMaxBytes || !type.valid(file.buffer)) throw new ApiError(422, 'invalid_image', 'La imagen debe ser JPG, PNG, WebP o GIF y respetar el límite de tamaño');
  const id = newId('image'); const objectName = `editorial/${new Date().getUTCFullYear()}/${randomUUID()}.${type.extension}`;
  const storage = await getStorage();
  await storage.bucket(config.documentsBucket).file(objectName).save(file.buffer, { resumable: false, contentType: file.mimetype, metadata: { cacheControl: 'public,max-age=31536000,immutable', metadata: { uploadedBy: actorEmail, originalName: file.originalname } } });
  const record = { id, kind: 'image', objectName, originalName: file.originalname, contentType: file.mimetype, size: file.size, uploadedBy: actorEmail, createdAt: new Date().toISOString() };
  await store().set('uploads', id, record);
  return { ...record, url: `${config.publicApiUrl}/v1/public/media/${id}` };
}

export async function streamEditorialImage(req: Request, res: Response) {
  const record = await cachedGet<{ id: string; kind?: string; objectName: string; contentType: string }>(store(), 'uploads', String(req.params.id), cacheTtl.immutableAsset);
  if (!record || record.kind !== 'image') throw notFound('Imagen');
  if (!config.documentsBucket) throw new ApiError(503, 'images_not_configured', 'El almacenamiento no está configurado');
  res.setHeader('content-type', record.contentType); res.setHeader('cache-control', 'public,max-age=31536000,immutable');
  getStorage().then((storage) => storage.bucket(config.documentsBucket).file(record.objectName).createReadStream().on('error', () => res.destroy()).pipe(res)).catch(() => res.destroy());
}

function safeFilename(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120); }
