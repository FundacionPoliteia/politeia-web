import { GoogleAuth } from 'google-auth-library';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { hasFirestoreTestOverride } from './firestore.js';

const ADC_HELP = 'Faltan credenciales locales validas de Google Cloud. Ejecuta npm.cmd run blog-api:cloud:auth, npm.cmd run blog-api:cloud:project y npm.cmd run blog-api:cloud:quota-project para usar Firestore/Cloud Storage reales desde el backend local.';
const CACHE_TTL_MS = 30 * 1000;

let cachedCheck = {
  checkedAt: 0,
  ok: false,
  error: null,
};

export async function requireGoogleCloudCredentials(_req, _res, next) {
  if (hasFirestoreTestOverride()) return next();
  try {
    await ensureGoogleCloudCredentials();
    next();
  } catch (err) {
    next(err);
  }
}

async function ensureGoogleCloudCredentials() {
  const now = Date.now();
  if (now - cachedCheck.checkedAt < CACHE_TTL_MS) {
    if (cachedCheck.ok) return;
    throw credentialsError(cachedCheck.error);
  }

  try {
    const auth = new GoogleAuth({
      projectId: config.gcpProjectId || undefined,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    await client.getAccessToken();
    cachedCheck = { checkedAt: now, ok: true, error: null };
  } catch (err) {
    cachedCheck = { checkedAt: now, ok: false, error: err };
    throw credentialsError(err);
  }
}

function credentialsError(err) {
  return new HttpError(503, ADC_HELP, {
    cause: err?.message || 'Google Cloud Application Default Credentials are not available',
  });
}
