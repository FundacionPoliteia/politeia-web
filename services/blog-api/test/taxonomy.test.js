import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCategory, sanitizeTags, taxonomyId, taxonomyKey } from '../src/utils/taxonomy.js';

test('sanitizeTags deduplicates equivalent tags and returns title case', () => {
  assert.deepEqual(
    sanitizeTags(['retórica', 'Retórica', ' RETÓRICA ', 'política pública', '', '  ']),
    ['Retórica', 'Política Pública']
  );
});

test('taxonomyKey ignores case, accents and repeated spaces', () => {
  assert.equal(taxonomyKey(' RETÓRICA institucional '), taxonomyKey('retorica institucional'));
});

test('sanitizeCategory normalizes a single shared category label', () => {
  assert.equal(sanitizeCategory('  relaciones   internacionales  '), 'Relaciones Internacionales');
});

test('taxonomyId creates a Firestore-safe category id', () => {
  assert.equal(taxonomyId('Relaciones Internacionales / Seguridad'), 'relaciones-internacionales-seguridad');
});
