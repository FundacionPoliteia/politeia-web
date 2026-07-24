import { HttpError } from '../errors.js';

export const POST_STATUSES = new Set(['draft', 'review', 'published', 'archived']);
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

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

export function assertOptionalBoolean(value, field) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be a boolean`);
  }
}

export function assertExcerptMode(value, field = 'excerptMode') {
  if (value !== undefined && value !== 'auto' && value !== 'manual') {
    throw new HttpError(400, `${field} must be auto or manual`);
  }
}

export function assertReferences(value, field = 'references') {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpError(400, `${field} must be an array with at most 50 items`);
  }
  value.forEach((reference, index) => {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      throw new HttpError(400, `${field}[${index}] must be an object`);
    }
    if (typeof reference.text !== 'string' || reference.text.trim().length > 1000) {
      throw new HttpError(400, `${field}[${index}].text must be a string with at most 1000 characters`);
    }
    if (reference.url !== undefined && reference.url !== '') {
      assertHttpsUrl(reference.url, `${field}[${index}].url`);
    }
  });
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
