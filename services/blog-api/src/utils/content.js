import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img',
    'h1',
    'h2',
    'h3',
    'figure',
    'figcaption',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }, true),
  },
};

export function markdownToSafeHtml(markdown = '') {
  const rawHtml = marked.parse(stripReviewCommentMarkup(stripImageAlt(markdown)), { async: false, mangle: false, headerIds: false, gfm: true });
  return htmlToSafeHtml(rawHtml);
}

export function htmlToSafeHtml(html = '') {
  return sanitizeHtml(html, sanitizeOptions);
}

export function htmlToMarkdown(html = '') {
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
  });
  turndown.use(gfm);

  turndown.addRule('horizontalRule', {
    filter: 'hr',
    replacement: () => '\n\n---\n\n',
  });
  addHtmlTableRule(turndown);

  return turndown
    .turndown(htmlToSafeHtml(html))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripMarkdown(markdown = '') {
  return stripReviewCommentMarkup(markdown)
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildExcerpt(markdown = '', fallback = '', maxLength = 180) {
  const text = (fallback || stripMarkdown(markdown)).trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function stripImageAlt(markdown = '') {
  return markdown.replace(/!\[[^\]]*]\(([^)]+)\)/g, '![]($1)');
}

export function stripReviewCommentMarkup(markdown = '') {
  return markdown.replace(/<span\b[^>]*data-review-comment-id=["'][^"']+["'][^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

function addHtmlTableRule(turndown) {
  turndown.addRule('htmlTable', {
    filter: 'table',
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });
}
