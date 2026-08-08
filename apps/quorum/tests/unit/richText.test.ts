import { describe, expect, it } from 'vitest';
import { richTextExcerpt, richTextPlainText } from '../../lib/richText';

describe('salidas de texto enriquecido', () => {
  it('extrae sólo el texto visible de formatos y enlaces', () => {
    const markdown = '## Institución\n\nUna **institución** es una [organización](https://example.com/organizacion) *establecida*.\n\n![Congreso](https://example.com/congreso.jpg)';
    expect(richTextPlainText(markdown, 'markdown')).toBe('Institución Una institución es una organización establecida. Congreso');
  });

  it('convierte listas y tablas sin filtrar su sintaxis', () => {
    const markdown = '- Primer punto\n- Segundo punto\n\n| Cámara | Estado |\n| --- | --- |\n| Diputados | Comisión |';
    const output = richTextPlainText(markdown, 'markdown');
    expect(output).toContain('Primer punto Segundo punto');
    expect(output).toContain('Cámara Estado Diputados Comisión');
    expect(output).not.toContain('|');
  });

  it('crea extractos legibles sin cortar una palabra', () => {
    expect(richTextExcerpt('Una **institución** establecida para organizar la vida pública.', 'markdown', 35)).toBe('Una institución establecida para…');
  });
});
