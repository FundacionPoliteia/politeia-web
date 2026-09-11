import { describe, expect, it } from 'vitest';
import { photoUrlSchema, projectPositionSchema } from './index.js';

const photoUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTDoQcAPT3KOJT0ZFPI6ewt9yGk8nxTjJ9Wyzuwryu-fw&s=10';
const position = { id: 'voice', name: 'Juan', stance: 'for', quote: 'Una declaración', photoUrl };

describe('URLs de fotos al volver a editar', () => {
  it('conserva el dominio encrypted de Google y sus parámetros en cada guardado', () => {
    expect(photoUrlSchema.parse(photoUrl)).toBe(photoUrl);
    const stored = JSON.parse(JSON.stringify(projectPositionSchema.parse(position)));
    expect(projectPositionSchema.parse({ ...stored, quote: 'Declaración corregida' }).photoUrl).toBe(photoUrl);
  });
  it('atribuye un enlace de fuente inválido a la fuente, no a la foto', () => {
    const result = projectPositionSchema.safeParse({ ...position, sourceUrl: 'Una fuente sin URL' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path)).toEqual([['sourceUrl']]);
    expect(projectPositionSchema.safeParse({ ...position, sourceUrl: '' }).success).toBe(true);
  });
  it('continúa rechazando protocolos inseguros y URLs con credenciales', () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AA', 'https://user:pass@example.com/a.png']) {
      expect(photoUrlSchema.safeParse(url).success).toBe(false);
    }
  });
});
