import { describe, expect, it } from 'vitest';
import { declarationExcerpt, DECLARATION_PREVIEW_LIMIT } from '../../lib/declarationExcerpt';

describe('extracto de declaraciones', () => {
  it('no colapsa una declaración de exactamente 254 caracteres visibles', () => {
    expect(declarationExcerpt('a'.repeat(254))).toBeNull();
  });

  it('colapsa desde el carácter 255 y conserva el límite cuando no hay espacios', () => {
    expect(declarationExcerpt('a'.repeat(255))).toBe('a'.repeat(DECLARATION_PREVIEW_LIMIT) + '…');
  });

  it('prefiere un límite de palabra sin dejar un extracto vacío', () => {
    expect(declarationExcerpt('palabra '.repeat(40))).toBe('palabra '.repeat(31).trimEnd() + '…');
    expect(declarationExcerpt('x'.repeat(255))).not.toBe('…');
  });

  it('cuenta grafemas completos sin cortar acentos combinados ni emojis', () => {
    const accent = 'e\u0301';
    const emoji = '👨‍👩‍👧‍👦';
    const accentExcerpt = declarationExcerpt(accent.repeat(255));
    const emojiExcerpt = declarationExcerpt(emoji.repeat(255));

    expect(accentExcerpt?.startsWith(accent.repeat(DECLARATION_PREVIEW_LIMIT))).toBe(true);
    expect(emojiExcerpt?.startsWith(emoji.repeat(DECLARATION_PREVIEW_LIMIT))).toBe(true);
  });
});
