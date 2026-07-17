import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneratedSlug, slugify, isValidSlug } from '../src/utils/slug.js';

test('slugify normalizes Spanish titles', () => {
  assert.equal(
    slugify('¿Qué es el Grupo Wagner y qué tiene que ver con el Kremlin?'),
    'que-es-el-grupo-wagner-y-que-tiene-que-ver-con-el-kremlin'
  );
});

test('isValidSlug accepts only lowercase URL slugs', () => {
  assert.equal(isValidSlug('analisis-politico-2026'), true);
  assert.equal(isValidSlug('Análisis político'), false);
  assert.equal(isValidSlug('bad--slug'), false);
});

test('buildGeneratedSlug keeps title words and adds a short unique suffix', () => {
  assert.equal(
    buildGeneratedSlug('Una mirada larga sobre instituciones democraticas y participacion ciudadana', 'AbC123456789', 38),
    'una-mirada-larga-sobre-instituciones-abc12345'
  );
});
