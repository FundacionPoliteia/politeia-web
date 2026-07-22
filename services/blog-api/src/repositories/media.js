import { Readable } from 'node:stream';
import { google } from 'googleapis';
import sharp from 'sharp';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';

const MAIL_THUMBNAIL_WIDTH = 480;
const MAIL_THUMBNAIL_HEIGHT = 270;

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
  const extension = file.mimetype === 'image/png'
    ? 'png'
    : file.mimetype === 'image/webp'
      ? 'webp'
      : 'jpg';
  const objectId = `${Date.now()}-${cryptoRandom()}`;
  const path = `blog/${objectId}.${extension}`;
  const thumbnailPath = `blog/thumbnails/${objectId}.webp`;
  const thumbnailBuffer = await createMailThumbnail(file.buffer);
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  });
  const storage = google.storage({ version: 'v1', auth });

  await Promise.all([
    uploadObject(storage, { path, contentType: file.mimetype, buffer: file.buffer }),
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
    contentType: file.mimetype,
    size: file.size,
    thumbnailContentType: 'image/webp',
    thumbnailSize: thumbnailBuffer.length,
    uploadedBy: actorEmail,
    createdAt: serverTimestamp(),
  });
  return serializeDoc(await doc.get());
}

export async function createMailThumbnail(buffer) {
  return sharp(buffer)
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
