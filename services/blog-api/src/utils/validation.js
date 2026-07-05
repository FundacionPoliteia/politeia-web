import { HttpError } from '../errors.js';

export const POST_STATUSES = new Set(['draft', 'review', 'published', 'archived']);
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} is required`);
  }
}

export function assertOptionalString(value, field) {
  if (value !== undefined && typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string`);
  }
}

export function assertStringArray(value, field) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HttpError(400, `${field} must be an array of strings`);
  }
}

export function assertHttpsUrl(value, field) {
  assertNonEmptyString(value, field);
  let url;
  try {
    url = new URL(value);
  } catch (e) {
    throw new HttpError(400, `${field} must be a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, `${field} must use https`);
  }
}
