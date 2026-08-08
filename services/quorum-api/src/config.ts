import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnvFile();

const list = (value: string) => value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
const dataStore = process.env.DATA_STORE || (process.env.NODE_ENV === 'production' ? 'firestore' : 'memory');

if (dataStore !== 'memory' && dataStore !== 'firestore') throw new Error(`DATA_STORE inválido: ${dataStore}`);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8090),
  dataStore: dataStore as 'memory' | 'firestore',
  gcpProjectId: process.env.GCP_PROJECT_ID || '',
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
  documentsBucket: process.env.DOCUMENTS_BUCKET || '',
  backupsBucket: process.env.BACKUPS_BUCKET || '',
  sourceSnapshotsBucket: process.env.SOURCE_SNAPSHOTS_BUCKET || '',
  backupInvokerEmail: (process.env.BACKUP_INVOKER_EMAIL || '').toLowerCase(),
  publicApiUrl: (process.env.PUBLIC_API_URL || 'http://localhost:8090').replace(/\/$/, ''),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS || 'http://localhost:3100,http://gestion.localhost:3100'),
  sessionSecret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'quorum-local-session-secret-change-me'),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'quorum_session',
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN || 'politeia.ar').toLowerCase(),
  allowedExternalDomains: list(process.env.ALLOWED_EXTERNAL_DOMAINS || 'gmail.com'),
  defaultAdminEmails: [...new Set(['dev@politeia.ar', 'info@politeia.ar', ...list(process.env.DEFAULT_ADMIN_EMAILS || '')])],
  publicAccessRequired: process.env.PUBLIC_ACCESS_REQUIRED === 'true',
  publicAccessAllowedEmails: list(process.env.PUBLIC_ACCESS_ALLOWED_EMAILS || ''),
  publicAccessAllowedDomains: list(process.env.PUBLIC_ACCESS_ALLOWED_DOMAINS || ''),
  publicAccessGateSecret: process.env.PUBLIC_ACCESS_GATE_SECRET || '',
  devAuth: process.env.DEV_AUTH === 'true',
  devAuthEmail: (process.env.DEV_AUTH_EMAIL || 'dev@politeia.ar').toLowerCase(),
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
  mailProvider: process.env.MAIL_PROVIDER || 'console',
  mailFrom: process.env.MAIL_FROM || 'Quórum Politeia <quorum@politeia.ar>',
  mailDispatchToken: process.env.MAIL_DISPATCH_TOKEN || '',
  nextRevalidateUrl: process.env.NEXT_REVALIDATE_URL || '',
  nextRevalidateSecret: process.env.NEXT_REVALIDATE_SECRET || '',
  pdfMaxBytes: Number(process.env.PDF_MAX_BYTES || 15 * 1024 * 1024),
  imageMaxBytes: Number(process.env.IMAGE_MAX_BYTES || 8 * 1024 * 1024),
  congressImportEnabled: process.env.CONGRESS_IMPORT_ENABLED === 'true',
  hcdnImportEnabled: process.env.HCDN_IMPORT_ENABLED === 'true',
  senateImportEnabled: process.env.SENATE_IMPORT_ENABLED === 'true',
  congressImportMode: process.env.CONGRESS_IMPORT_MODE || 'shadow',
  congressAutoSyncEnabled: process.env.CONGRESS_AUTO_SYNC_ENABLED === 'true',
  congressSyncIntervalDays: Math.max(1, Number(process.env.CONGRESS_SYNC_INTERVAL_DAYS || 90)),
  congressSyncInvokerEmail: (process.env.CONGRESS_SYNC_INVOKER_EMAIL || '').toLowerCase(),
  congressFetchTimeoutMs: Number(process.env.CONGRESS_FETCH_TIMEOUT_MS || 20_000),
  congressMaxDownloadBytes: Number(process.env.CONGRESS_MAX_DOWNLOAD_BYTES || 8 * 1024 * 1024),
  hcdnMinimumCurrentLegislators: Number(process.env.HCDN_MINIMUM_CURRENT_LEGISLATORS || 200),
  senateMinimumCurrentLegislators: Number(process.env.SENATE_MINIMUM_CURRENT_LEGISLATORS || 70),
};

export function assertRuntimeConfig() {
  if (config.dataStore !== 'firestore') return;
  if (!config.gcpProjectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando DATA_STORE=firestore');
  if (!config.firestoreDatabaseId || config.firestoreDatabaseId === '(default)') {
    throw new Error('FIRESTORE_DATABASE_ID debe señalar explícitamente una base nombrada cuando DATA_STORE=firestore');
  }
}

export function assertProductionConfig() {
  assertRuntimeConfig();
  if (config.nodeEnv !== 'production') return;
  const required: Array<keyof typeof config> = [
    'gcpProjectId', 'documentsBucket', 'backupsBucket', 'backupInvokerEmail', 'sessionSecret', 'googleClientId', 'mailDispatchToken',
  ];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  if (config.publicAccessRequired && !config.publicAccessGateSecret) throw new Error('PUBLIC_ACCESS_GATE_SECRET is required when public access is restricted');
  if (config.publicAccessRequired && config.publicAccessGateSecret.length < 32) throw new Error('PUBLIC_ACCESS_GATE_SECRET must contain at least 32 characters');
  if (config.congressImportEnabled && !config.sourceSnapshotsBucket) throw new Error('SOURCE_SNAPSHOTS_BUCKET is required when Congress imports are enabled');
  if (config.congressAutoSyncEnabled && !config.congressSyncInvokerEmail) throw new Error('CONGRESS_SYNC_INVOKER_EMAIL is required when automatic Congress sync is enabled');
}

function loadEnvFile() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(currentDir, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
