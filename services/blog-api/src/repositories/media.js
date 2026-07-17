import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { config } from '../config.js';

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
  const path = `blog/${Date.now()}-${cryptoRandom()}.${extension}`;
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  });
  const storage = google.storage({ version: 'v1', auth });

  await storage.objects.insert({
    bucket: config.mediaBucket,
    name: path,
    requestBody: {
      name: path,
      contentType: file.mimetype,
      cacheControl: 'public, max-age=31536000',
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer),
    },
  });

  const url = `https://storage.googleapis.com/${config.mediaBucket}/${path}`;
  const doc = await db().collection('media').add({
    url,
    kind: 'cloud-storage',
    path,
    contentType: file.mimetype,
    size: file.size,
    uploadedBy: actorEmail,
    createdAt: serverTimestamp(),
  });
  return serializeDoc(await doc.get());
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 12);
}
