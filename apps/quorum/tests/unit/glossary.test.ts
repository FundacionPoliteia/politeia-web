import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '@politeia/quorum-contracts';
import { annotateGlossaryText, glossaryMatches } from '../../lib/glossary';

describe('contextual glossary annotation', () => {
  it('matches terms and aliases regardless of case or accents', () => {
    const term = glossaryTerm({ term: 'Comisi\u00f3n', aliases: ['tratamiento en comision'] });
    const matches = glossaryMatches('El TRATAMIENTO EN COMISI\u00d3N contin\u00faa.', [term]);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('TRATAMIENTO EN COMISI\u00d3N');
  });

  it('uses word boundaries and does not find ley inside leyenda', () => {
    const matches = glossaryMatches('La leyenda acompa\u00f1a a la ley.', [glossaryTerm({ term: 'ley' })]);
    expect(matches.map((item) => item.text)).toEqual(['ley']);
  });

  it('prefers the longest phrase and marks every occurrence by default', () => {
    const sanction = glossaryTerm({ id: 'sanction', term: 'sanci\u00f3n' });
    const half = glossaryTerm({ id: 'half', term: 'media sanci\u00f3n' });
    const matches = glossaryMatches('La media sanci\u00f3n no es una sanci\u00f3n definitiva. Otra media sanci\u00f3n.', [sanction, half]);
    expect(matches.map((item) => [item.term.id, item.text])).toEqual([
      ['half', 'media sanci\u00f3n'],
      ['sanction', 'sanci\u00f3n'],
      ['half', 'media sanci\u00f3n'],
    ]);
  });

  it('can mark only the first occurrence of each term', () => {
    const democracy = glossaryTerm({ id: 'democracy', term: 'democracia' });
    const matches = glossaryMatches('Democracia, instituciones de la democracia y m\u00e1s democracia.', [democracy], 'first');
    expect(matches.map((item) => item.text)).toEqual(['Democracia']);
  });

  it('ignores private, disabled or incomplete terms', () => {
    const terms = [
      glossaryTerm({ id: 'private', term: 'dictamen', published: false }),
      glossaryTerm({ id: 'disabled', term: 'comisi\u00f3n', inlineEnabled: false }),
      glossaryTerm({ id: 'empty', term: 'sanci\u00f3n', shortDefinition: '' }),
    ];
    expect(annotateGlossaryText('Dictamen, comisi\u00f3n y sanci\u00f3n.', terms)).toEqual([{ type: 'text', text: 'Dictamen, comisi\u00f3n y sanci\u00f3n.' }]);
  });
});

function glossaryTerm(overrides: Partial<GlossaryTerm> = {}): GlossaryTerm {
  return {
    id: 'term', slug: 'termino', term: 'Termino', shortDefinition: 'Definicion contextual.',
    definition: 'Definicion completa.', definitionFormat: 'plain', aliases: [], inlineEnabled: true, references: [],
    published: true, updatedAt: '2026-08-03T12:00:00.000Z', updatedBy: 'editor@politeia.ar',
    ...overrides,
  };
}
