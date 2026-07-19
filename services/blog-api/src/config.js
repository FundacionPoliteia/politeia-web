import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnvFile();

const require = createRequire(import.meta.url);
const packageInfo = require('../package.json');

export const config = {
  appVersion: packageInfo.version || '1.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '',
  mediaBucket: process.env.MEDIA_BUCKET || '',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || 'politeia.ar',
  allowedAssignedEmailDomains: (process.env.ALLOWED_ASSIGNED_EMAIL_DOMAINS || 'gmail.com')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-session-secret'),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'politeia_session',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  sessionCookieSameSite: process.env.SESSION_COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production',
  blogGroupEmail: process.env.BLOG_GROUP_EMAIL || '',
  adminGroupEmail: process.env.ADMIN_GROUP_EMAIL || '',
  reviewerGroupEmail: process.env.REVIEWER_GROUP_EMAIL || '',
  defaultAdminEmails: (process.env.DEFAULT_ADMIN_EMAILS || 'dev@politeia.ar,info@politeia.ar')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  mailProvider: process.env.MAIL_PROVIDER || 'console',
  mailProjectKey: process.env.MAIL_PROJECT_KEY || 'politeia',
  mailBrandName: process.env.MAIL_BRAND_NAME || 'Politeia',
  mailFrom: process.env.MAIL_FROM || 'Politeia <no-reply@politeia.ar>',
  mailFromInternal: process.env.MAIL_FROM_INTERNAL || process.env.MAIL_FROM || 'Politeia Interno <notificaciones@politeia.ar>',
  mailFromUpdates: process.env.MAIL_FROM_UPDATES || process.env.MAIL_FROM || 'Politeia Updates <updates@politeia.ar>',
  mailFromNewsletter: process.env.MAIL_FROM_NEWSLETTER || process.env.MAIL_FROM || 'Politeia Newsletter <newsletter@politeia.ar>',
  mailReplyTo: process.env.MAIL_REPLY_TO || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
  resendSegmentId: process.env.RESEND_SEGMENT_ID || '',
  resendTopicId: process.env.RESEND_TOPIC_ID || '',
  newsletterAudienceKey: process.env.NEWSLETTER_AUDIENCE_KEY || 'politeia-newsletter',
  newsletterTokenSecret: process.env.NEWSLETTER_TOKEN_SECRET || process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-newsletter-secret'),
  publicSiteUrl: process.env.PUBLIC_SITE_URL || 'https://www.politeia.ar',
  apiPublicUrl: process.env.API_PUBLIC_URL || 'http://localhost:8080',
  appBaseUrl: process.env.APP_BASE_URL || 'https://admin.politeia.ar',
  devAuth: process.env.DEV_AUTH === 'true',
  devAuthEmail: process.env.DEV_AUTH_EMAIL || 'dev@politeia.ar',
  devAuthRoles: (process.env.DEV_AUTH_ROLES || 'admin')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean),
  roleCacheTtlMs: Number(process.env.ROLE_CACHE_TTL_MS || 5 * 60 * 1000),
};

export function requireConfig(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }
}

function loadEnvFile() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(currentDir, '..', '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1).trim());
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseEnvValue(value) {
  const withoutComment = stripInlineComment(value).trim();
  return unquoteEnvValue(withoutComment);
}

function stripInlineComment(value) {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? '' : quote || char;
      continue;
    }
    if (char === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function unquoteEnvValue(value) {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}
