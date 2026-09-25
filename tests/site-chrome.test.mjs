import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Docs and Roadmap pages use dedicated chrome and justified reading styles',async()=>{
  const [docs,roadmap,css]=await Promise.all([
    readFile('dist/docs/index.html','utf8'),
    readFile('dist/roadmap/index.html','utf8'),
    readFile('dist/site-layout.css','utf8')
  ]);

  assert.match(docs,/class="site-wrap docs-page"/);
  assert.match(roadmap,/class="site-wrap roadmap-page"/);
  assert.match(css,/\.docs-page \.docs-content p,\.docs-page \.docs-content li/);
  assert.match(css,/\.docs-page \.site-header/);
  assert.match(css,/\.roadmap-page \.site-header/);
  assert.match(css,/\.docs-page footer,\.roadmap-page footer/);
  assert.match(docs,/<nav aria-label="Main navigation">[\s\S]*<\/nav><div class="header-actions"><a class="social-link header-x-link"[\s\S]*<a class="header-cta"/);
  assert.match(css,/\.header-actions \.social-link\{[^}]*border:0;[^}]*background:transparent/);
  assert.match(css,/\.site-header \.header-actions\{display:grid;[^}]*grid-row:1 \/ span 2/);
});
