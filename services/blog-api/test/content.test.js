import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, htmlToSafeHtml, markdownToSafeHtml, stripMarkdown } from '../src/utils/content.js';

test('htmlToMarkdown keeps article structure and removes unsafe HTML', () => {
  const html = `
    <h2>Analisis</h2>
    <p>Texto con <strong>negrita</strong> y <a href="https://politeia.ar">link</a>.</p>
    <table><thead><tr><th>Nombre</th><th>Valor</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>
    <script>alert("bad")</script>
    <img src="https://storage.googleapis.com/bucket/image.jpg" onerror="bad()" />
  `;

  const safeHtml = htmlToSafeHtml(html);
  const markdown = htmlToMarkdown(html);

  assert.equal(safeHtml.includes('<script>'), false);
  assert.equal(safeHtml.includes('onerror'), false);
  assert.match(markdown, /## Analisis/);
  assert.match(markdown, /\*\*negrita\*\*/);
  assert.match(markdown, /<table>/);
  assert.match(markdown, /<th>Nombre<\/th>/);
  assert.match(markdown, /!\[\]\(https:\/\/storage\.googleapis\.com\/bucket\/image\.jpg\)/);
});

test('htmlToMarkdown preserves complex HTML tables instead of pipe markdown', () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <th>Termino</th>
          <th>Funciones</th>
        </tr>
        <tr>
          <td>Pretexto</td>
          <td>Linea uno<br />Linea dos<ul><li>Punto</li></ul></td>
        </tr>
      </tbody>
    </table>
  `;

  const markdown = htmlToMarkdown(html);

  assert.match(markdown, /<table>/);
  assert.match(markdown, /<br>/);
  assert.match(markdown, /<li>Punto<\/li>/);
  assert.doesNotMatch(markdown, /\| Termino \|/);
});

test('public HTML strips review comment anchors while keeping text', () => {
  const markdown = 'Texto <span data-review-comment-id="abc123">comentado</span> visible.';

  const html = markdownToSafeHtml(markdown);

  assert.equal(html.includes('data-review-comment-id'), false);
  assert.equal(html.includes('<span'), false);
  assert.match(html, /Texto comentado visible/);
  assert.equal(stripMarkdown(markdown), 'Texto comentado visible.');
});
