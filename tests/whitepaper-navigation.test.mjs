import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('the header exposes a public Whitepaper PDF link with split mobile navigation and X lanes', async () => {
  const [html, css, pdf] = await Promise.all([
    readFile('dist/index.html', 'utf8'),
    readFile('dist/site-layout.css', 'utf8'),
    stat('dist/whitepaper/Hushmark-Whitepaper-v1.0.pdf'),
  ]);

  assert.match(html, /<a href="\/whitepaper\/Hushmark-Whitepaper-v1\.0\.pdf"[^>]*>Whitepaper<\/a>/);
  assert.ok(pdf.size > 0);
  assert.match(css, /\.site-header nav\{grid-column:1;grid-row:2;[^}]*overflow-x:auto/);
  assert.match(css, /\.site-header nav\{grid-column:1;grid-row:2;width:100%;padding-right:12px/);
  assert.match(css, /\.site-header \.header-actions \.social-link\{position:relative;grid-column:2;grid-row:2/);
  assert.doesNotMatch(css, /\.site-header \.header-actions \.social-link\{position:absolute/);
});