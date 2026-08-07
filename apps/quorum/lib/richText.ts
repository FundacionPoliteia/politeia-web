import { marked } from 'marked';

export type RichTextFormat = 'plain' | 'markdown';

export function richTextPlainText(value: string, format: RichTextFormat = 'plain') {
  if (format === 'plain') return normalizeWhitespace(value);
  const tokens = marked.lexer(value || '', { gfm: true });
  return normalizeWhitespace(tokens.map(tokenText).filter(Boolean).join(' '));
}

export function richTextExcerpt(value: string, format: RichTextFormat = 'plain', maxLength = 180) {
  const plain = richTextPlainText(value, format);
  if (plain.length <= maxLength) return plain;
  const candidate = plain.slice(0, maxLength + 1);
  const boundary = candidate.lastIndexOf(' ');
  const end = boundary >= Math.floor(maxLength * .65) ? boundary : maxLength;
  return `${plain.slice(0, end).trimEnd()}…`;
}

function tokenText(token: any): string {
  if (!token) return '';
  if (token.type === 'space' || token.type === 'hr') return '';
  if (token.type === 'image') return token.text || '';
  if (token.type === 'code' || token.type === 'codespan') return token.text || '';
  if (token.type === 'br') return ' ';
  if (token.type === 'table') {
    return [
      ...(token.header || []).map((cell: any) => tokensText(cell.tokens)),
      ...(token.rows || []).flatMap((row: any[]) => row.map((cell) => tokensText(cell.tokens))),
    ].join(' ');
  }
  if (token.type === 'list') return (token.items || []).map((item: any) => tokensText(item.tokens)).join(' ');
  if (Array.isArray(token.tokens)) return tokensText(token.tokens);
  return typeof token.text === 'string' ? token.text : '';
}

function tokensText(tokens: any[] = []) {
  return tokens.map(tokenText).filter(Boolean).join(' ');
}

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
