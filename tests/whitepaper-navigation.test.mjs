import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('the header exposes a public Whitepaper PDF link and keeps room for mobile nav scrolling', async () => {
  const [html, css, pdf] = await Promise.all([
    readFile('dist/index.html', 'utf8'),
    readFile('dist/site-layout.css', 'utf8'),
    stat('dist/whitepaper/Hushmark-Whitepaper-v1.0.pdf'),
  ]);

  assert.match(html, /<a href="\/whitepaper\/Hushmark-Whitepaper-v1\.0\.pdf"[^>]*>Whitepaper<\/a>/);
  assert.ok(pdf.size > 0);
  assert.match(css, /\.site-header nav\{grid-column:1\/-1;[^}]*padding-right:52px/);
  assert.match(css, /\.site-header \.header-actions \.social-link\{position:absolute;[^}]*bottom:16px/);
});
