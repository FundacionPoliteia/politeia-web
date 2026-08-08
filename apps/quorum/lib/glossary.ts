import type { GlossaryTerm } from '@politeia/quorum-contracts';

export type GlossaryTextSegment =
  | { type: 'text'; text: string }
  | { type: 'term'; text: string; term: GlossaryTerm; start: number };

export function annotateGlossaryText(text: string, terms: GlossaryTerm[], occurrenceMode: 'all' | 'first' = 'all'): GlossaryTextSegment[] {
  const eligible = terms.filter((item) => item.published && item.inlineEnabled && item.shortDefinition.trim());
  if (!text || !eligible.length) return [{ type: 'text', text }];
  const indexed = normalizeWithMap(text);
  const candidates = eligible.flatMap((term) => [term.term, ...term.aliases]
    .map((phrase) => ({ term, phrase: normalizePhrase(phrase) }))
    .filter((item) => item.phrase.length >= 2));
  const matches: Array<{ start: number; end: number; term: GlossaryTerm }> = [];
  for (const candidate of candidates) {
    let from = 0;
    while (from < indexed.value.length) {
      const index = indexed.value.indexOf(candidate.phrase, from);
      if (index < 0) break;
      const endIndex = index + candidate.phrase.length;
      const left = index === 0 || indexed.value[index - 1] === ' ';
      const right = endIndex === indexed.value.length || indexed.value[endIndex] === ' ';
      if (left && right) matches.push({ start: indexed.starts[index], end: indexed.ends[endIndex - 1], term: candidate.term });
      from = index + Math.max(1, candidate.phrase.length);
    }
  }
  matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start) || left.term.id.localeCompare(right.term.id));
  const selected: typeof matches = []; const usedTerms = new Set<string>(); let occupiedUntil = -1;
  for (const match of matches) {
    if ((occurrenceMode === 'first' && usedTerms.has(match.term.id)) || match.start < occupiedUntil) continue;
    selected.push(match); usedTerms.add(match.term.id); occupiedUntil = match.end;
  }
  if (!selected.length) return [{ type: 'text', text }];
  const result: GlossaryTextSegment[] = []; let cursor = 0;
  for (const match of selected) {
    if (match.start > cursor) result.push({ type: 'text', text: text.slice(cursor, match.start) });
    result.push({ type: 'term', text: text.slice(match.start, match.end), term: match.term, start: match.start });
    cursor = match.end;
  }
  if (cursor < text.length) result.push({ type: 'text', text: text.slice(cursor) });
  return result;
}

export function glossaryMatches(text: string, terms: GlossaryTerm[], occurrenceMode: 'all' | 'first' = 'all') {
  return annotateGlossaryText(text, terms, occurrenceMode).filter((item): item is Extract<GlossaryTextSegment, { type: 'term' }> => item.type === 'term');
}

export function glossaryOccurrenceId(sectionId: string, termId: string, ordinal: number) {
  return `${sectionId}:${termId}:${ordinal}`;
}

function normalizeWithMap(value: string) {
  let normalized = ''; const starts: number[] = []; const ends: number[] = []; let offset = 0;
  for (const character of value) {
    const width = character.length;
    const folded = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
    const word = /[\p{L}\p{N}]/u.test(folded);
    const output = word ? folded : ' ';
    for (const part of output) {
      if (part === ' ' && normalized.endsWith(' ')) { ends[ends.length - 1] = offset + width; continue; }
      normalized += part; starts.push(offset); ends.push(offset + width);
    }
    offset += width;
  }
  return { value: normalized, starts, ends };
}
function normalizePhrase(value: string) { return normalizeWithMap(value.trim()).value.trim(); }
