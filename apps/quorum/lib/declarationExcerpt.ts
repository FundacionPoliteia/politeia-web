export const DECLARATION_PREVIEW_LIMIT = 254;

const graphemeSegmenter = typeof Intl.Segmenter === 'undefined'
  ? null
  : new Intl.Segmenter('es', { granularity: 'grapheme' });

function visibleCharacters(value: string) {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value), (part) => part.segment)
    : Array.from(value);
}

export function declarationExcerpt(value: string): string | null {
  const characters = visibleCharacters(value);
  if (characters.length <= DECLARATION_PREVIEW_LIMIT) return null;

  const clipped = characters.slice(0, DECLARATION_PREVIEW_LIMIT).join('');
  const atWordBoundary = clipped.replace(/\s+\S*$/u, '');
  return `${atWordBoundary || clipped}…`;
}
