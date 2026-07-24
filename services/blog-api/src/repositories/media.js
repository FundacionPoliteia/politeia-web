import { Readable } from 'node:stream';
import { google } from 'googleapis';
import sharp from 'sharp';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

const MAIL_THUMBNAIL_WIDTH = 480;
const MAIL_THUMBNAIL_HEIGHT = 270;
const SUPPORTED_IMAGE_FORMATS = Object.freeze({
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' },
  avif: { contentType: 'image/avif', extension: 'avif' },
  gif: { contentType: 'image/gif', extension: 'gif' },
});

export async function saveExternalMedia({ url, actorEmail }) {
  const doc = await db().collection('media').add({
    url,
    kind: 'external',
    path: null,
    contentType: null,
    size: null,
    uploadedBy: actorEmail,
    createdAt: serverTimestamp(),
  });
  return serializeDoc(await doc.get());
}

export async function saveUploadedMedia({ file, actorEmail }) {
  const inspected = await inspectUploadedImage(file);
  const { extension, contentType } = inspected;
  const objectId = `${Date.now()}-${cryptoRandom()}`;
  const path = `blog/${objectId}.${extension}`;
  const thumbnailPath = `blog/thumbnails/${objectId}.webp`;
  const thumbnailBuffer = await createMailThumbnail(file.buffer);
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  });
  const storage = google.storage({ version: 'v1', auth });

  await Promise.all([
    uploadObject(storage, { path, contentType, buffer: file.buffer }),
    uploadObject(storage, { path: thumbnailPath, contentType: 'image/webp', buffer: thumbnailBuffer }),
  ]);

  const url = `https://storage.googleapis.com/${config.mediaBucket}/${path}`;
  const thumbnailUrl = `https://storage.googleapis.com/${config.mediaBucket}/${thumbnailPath}`;
  const doc = await db().collection('media').add({
    url,
    thumbnailUrl,
    kind: 'cloud-storage',
    path,
    thumbnailPath,
    contentType,
    size: file.size,
    thumbnailContentType: 'image/webp',
    thumbnailSize: thumbnailBuffer.length,
    uploadedBy: actorEmail,
    createdAt: serverTimestamp(),
  });
  return serializeDoc(await doc.get());
}

export async function createMailThumbnail(buffer) {
  return sharp(buffer, { animated: false, failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: MAIL_THUMBNAIL_WIDTH,
      height: MAIL_THUMBNAIL_HEIGHT,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .webp({ quality: 68, effort: 4 })
    .toBuffer();
}

export async function inspectUploadedImage(file = {}) {
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw new HttpError(400, 'image file is empty');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      animated: true,
      failOn: 'error',
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new HttpError(400, 'image file is invalid or corrupted');
  }

  const detectedFormat = metadata.format === 'heif' && metadata.compression === 'av1'
    ? 'avif'
    : metadata.format;
  const detected = SUPPORTED_IMAGE_FORMATS[detectedFormat];
  if (!detected) {
    throw new HttpError(400, 'file must be JPEG, PNG, WebP, AVIF, or GIF');
  }

  const claimedType = normalizeImageMimeType(file.mimetype);
  if (claimedType && claimedType !== detected.contentType) {
    throw new HttpError(400, 'image content does not match its file type');
  }

  return {
    ...detected,
    width: metadata.width || null,
    height: metadata.height || null,
    pages: metadata.pages || 1,
  };
}

async function uploadObject(storage, { path, contentType, buffer }) {
  await storage.objects.insert({
    bucket: config.mediaBucket,
    name: path,
    requestBody: {
      name: path,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    media: {
      mimeType: contentType,
      body: Readable.from(buffer),
    },
  });
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 12);
}

function normalizeImageMimeType(value = '') {
  const cleanValue = String(value || '').trim().toLowerCase();
  return cleanValue === 'image/jpg' ? 'image/jpeg' : cleanValue;
}
