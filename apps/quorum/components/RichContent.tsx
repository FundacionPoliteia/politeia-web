'use client';

import { Fragment, type ReactNode } from 'react';
import { marked } from 'marked';
import type { GlossaryTerm } from '@politeia/quorum-contracts';
import GlossaryAnnotatedText from '@/components/GlossaryAnnotatedText';
import { glossaryMatches } from '@/lib/glossary';
export { richTextPlainText as markdownPlainText } from '@/lib/richText';

export default function RichContent({ value, format = 'plain', terms = [], sectionId, occurrenceMode = 'all', excludedOccurrenceIds = [], className = '' }: { value: string; format?: 'plain' | 'markdown'; terms?: GlossaryTerm[]; sectionId: string; occurrenceMode?: 'all' | 'first' | 'custom'; excludedOccurrenceIds?: string[]; className?: string }) {
  if (format === 'plain') return <GlossaryAnnotatedText text={value} terms={terms} sectionId={sectionId} occurrenceMode={occurrenceMode} excludedOccurrenceIds={excludedOccurrenceIds} />;
  const seen = new Set<string>(); const occurrenceCounts = new Map<string, number>(); let textIndex = 0;
  const inline = (tokens: any[]): ReactNode => tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === 'text' || token.type === 'escape') {
      if (token.tokens?.length) return <Fragment key={key}>{inline(token.tokens)}</Fragment>;
      const eligible = occurrenceMode === 'first' ? terms.filter((term) => !seen.has(term.id)) : terms;
      const offsets = Object.fromEntries(terms.map((term) => [term.id, occurrenceCounts.get(term.id) || 0]));
      const matches = glossaryMatches(token.text || '', eligible, occurrenceMode === 'first' ? 'first' : 'all');
      for (const match of matches) { seen.add(match.term.id); occurrenceCounts.set(match.term.id, (occurrenceCounts.get(match.term.id) || 0) + 1); }
      return <GlossaryAnnotatedText as="span" text={token.text || ''} terms={eligible} sectionId={`${sectionId}-text-${textIndex++}`} occurrenceSectionId={sectionId} occurrenceMode={occurrenceMode} occurrenceOffsets={offsets} excludedOccurrenceIds={excludedOccurrenceIds} key={key} />;
    }
    if (token.type === 'strong') return <strong key={key}>{inline(token.tokens || [])}</strong>;
    if (token.type === 'em') return <em key={key}>{inline(token.tokens || [])}</em>;
    if (token.type === 'del') return <del key={key}>{inline(token.tokens || [])}</del>;
    if (token.type === 'codespan') return <code key={key}>{token.text}</code>;
    if (token.type === 'br') return <br key={key} />;
    if (token.type === 'link') return safeUrl(token.href) ? <a href={token.href} target="_blank" rel="noopener noreferrer" key={key}>{inline(token.tokens || [])}</a> : <Fragment key={key}>{inline(token.tokens || [])}</Fragment>;
    if (token.type === 'image') return safeUrl(token.href) ? <img src={token.href} alt={token.text || ''} loading="lazy" key={key} /> : null;
    return token.raw ? <Fragment key={key}>{token.raw}</Fragment> : null;
  });
  const blocks = (tokens: any[]): ReactNode => tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === 'space') return null;
    if (token.type === 'heading') { const Heading = `h${Math.min(3, Math.max(2, token.depth || 2))}` as 'h2' | 'h3'; return <Heading key={key}>{inline(token.tokens || [])}</Heading>; }
    if (token.type === 'paragraph') return <p key={key}>{inline(token.tokens || [])}</p>;
    if (token.type === 'text') return <p key={key}>{inline(token.tokens || [token])}</p>;
    if (token.type === 'blockquote') return <blockquote key={key}>{blocks(token.tokens || [])}</blockquote>;
    if (token.type === 'list') { const List = token.ordered ? 'ol' : 'ul'; return <List start={token.ordered ? token.start || 1 : undefined} key={key}>{(token.items || []).map((item: any, itemIndex: number) => <li key={itemIndex}>{blocks(item.tokens || [])}</li>)}</List>; }
    if (token.type === 'table') return <div className="rich-table-scroll" key={key}><table><thead><tr>{(token.header || []).map((cell: any, cellIndex: number) => <th align={token.align?.[cellIndex] || undefined} key={cellIndex}>{inline(cell.tokens || [])}</th>)}</tr></thead><tbody>{(token.rows || []).map((row: any[], rowIndex: number) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td align={token.align?.[cellIndex] || undefined} key={cellIndex}>{inline(cell.tokens || [])}</td>)}</tr>)}</tbody></table></div>;
    if (token.type === 'hr') return <hr key={key} />;
    if (token.type === 'code') return <pre key={key}><code>{token.text}</code></pre>;
    return token.tokens ? <Fragment key={key}>{blocks(token.tokens)}</Fragment> : null;
  });
  return <div className={`rich-public-content ${className}`.trim()}>{blocks(marked.lexer(value || '', { gfm: true }))}</div>;
}

function safeUrl(value: string) { try { const url = new URL(value, 'https://quorum.politeia.ar'); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
