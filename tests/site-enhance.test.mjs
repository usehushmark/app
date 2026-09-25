import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceHtml} from '../site-enhance.mjs';

test('Docs enhancement adds sidebar search without replacing content',()=>{
  const html='<html><head></head><body><main><div class="page-heading"><h1>Docs</h1></div><div class="docs-content"><section id="overview"><h2>Overview</h2><p>Keep this content.</p></section><div class="reference-links"></div></div></main></body></html>';
  const output=enhanceHtml(html,'docs');

  assert.match(output,/class="page-shell docs-shell"/);
  assert.match(output,/data-search-input="docs"/);
  assert.match(output,/Keep this content\./);
  assert.match(output,/site-search\.js/);
});

test('Roadmap enhancement adds searchable phase navigation',()=>{
  const html='<html><head></head><body><main><div class="roadmap-list"><article class="milestone"><div class="milestone-index">01</div><h2>Integrated</h2></article></div></main></body></html>';
  const output=enhanceHtml(html,'roadmap');

  assert.match(output,/class="page-shell roadmap-shell"/);
  assert.match(output,/data-search-input="roadmap"/);
  assert.match(output,/id="milestone-1"/);
});

test('site enhancement versions the layout stylesheet for cache-safe deployments',()=>{
  const output=enhanceHtml('<html><head></head><body></body></html>','home');

  assert.match(output,/site-layout\.css\?v=20260925-3/);
});
test('site enhancement adds a HUSHM token CA copy control to the footer',()=>{
  const html='<html><head></head><body><footer><p>An open world deserves a private layer.</p></footer></body></html>';
  const output=enhanceHtml(html,'home');

  assert.match(output,/\$HUSHM/);
  assert.match(output,/data-contract-address="F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump"/);
  assert.match(output,/data-copy-contract/);
  assert.match(output,/CA copied/);
});