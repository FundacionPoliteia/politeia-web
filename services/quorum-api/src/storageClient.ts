import { Storage, type StorageOptions } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import { config } from './config.js';

const googleAuth = new GoogleAuth({
  projectId: config.gcpProjectId || undefined,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

let storagePromise: Promise<Storage> | null = null;

export function getStorage() {
  storagePromise ||= createStorage();
  return storagePromise;
}

async function createStorage() {
  const compatibilityStorage = new Storage({ projectId: config.gcpProjectId || undefined });
  const authClient = compatibilityStorage.authClient;
  authClient.getProjectId = async () => config.gcpProjectId || googleAuth.getProjectId();
  authClient.getRequestHeaders = async (url) => plainHeaders(await googleAuth.getRequestHeaders(url));
  authClient.authorizeRequest = async (options) => ({
    ...options,
    headers: { ...plainHeaders(options?.headers), ...plainHeaders(await googleAuth.getRequestHeaders(options?.url)) },
  });
  return new Storage({
    projectId: config.gcpProjectId || undefined,
    authClient: authClient as unknown as StorageOptions['authClient'],
  });
}

function plainHeaders(value: unknown): Record<string, string> {
  if (!value) return {};
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
  return {};
}
