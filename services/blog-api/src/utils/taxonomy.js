export function sanitizeTags(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const tag = titleCaseTag(cleanTaxonomyText(item));
    if (!tag) return;
    const key = taxonomyKey(tag);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(tag);
  });

  return result;
}

export function sanitizeCategory(value) {
  return sanitizeTags([value])[0] || '';
}

export function cleanTaxonomyText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function taxonomyKey(value) {
  return cleanTaxonomyText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function taxonomyId(value) {
  return taxonomyKey(value)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCaseTag(value) {
  return cleanTaxonomyText(value)
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s/-])(\p{L})/gu, (match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-AR')}`);
}
