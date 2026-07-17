export function slugify(input = '') {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function buildGeneratedSlug(title = '', uniqueId = '', maxBaseLength = 64) {
  const base = trimSlugToLength(slugify(title), maxBaseLength) || 'post';
  const suffix = slugify(uniqueId).replace(/-/g, '').slice(0, 8);
  return suffix ? `${base}-${suffix}` : base;
}

export function isValidSlug(slug = '') {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function trimSlugToLength(slug, maxLength) {
  if (slug.length <= maxLength) return slug;
  return slug
    .slice(0, maxLength)
    .replace(/-[^-]*$/g, '')
    .replace(/^-+|-+$/g, '');
}
