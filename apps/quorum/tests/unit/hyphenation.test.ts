import { describe, expect, it } from 'vitest';
import { softHyphenate } from '../../lib/hyphenation';

describe('glossary soft hyphenation', () => {
  it('adds a Spanish break opportunity before the -ación suffix', () => {
    expect(softHyphenate('Desburocratización')).toBe('Desburocratiz\u00adación');
  });

  it('leaves short words intact and keeps every original character', () => {
    const result = softHyphenate('Ley de Anticonstitucionalmente');
    expect(result).toBe('Ley de Anticonstitucional\u00admente');
    expect(result.replaceAll('\u00ad', '')).toBe('Ley de Anticonstitucionalmente');
  });
});
