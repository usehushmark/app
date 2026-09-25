import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mobile footer gives the brand, tagline, privacy link, and X link separate grid areas', async () => {
  const css = await readFile('dist/site-layout.css', 'utf8');
  const html = await readFile('dist/index.html', 'utf8');

  assert.match(html, /class="footer-boundary-link" href="\/docs\/#limits"/);
  assert.match(
    css,
    /grid-template-areas:\s*"brand brand"\s*"tagline tagline"\s*"boundary social"/,
  );
  assert.match(css, /\.footer-top \.brand\{grid-area:brand\}/);
  assert.match(css, /\.footer-top p\{grid-area:tagline/);
  assert.match(css, /\.footer-top \.footer-boundary-link\{grid-area:boundary/);
  assert.match(css, /\.footer-top \.social-link\{grid-area:social/);
});

test('mobile footer excludes the brand from the privacy-link placement rule', async () => {
  const css = await readFile('dist/site-layout.css', 'utf8');

  assert.match(css, /\.footer-top \.footer-boundary-link\{grid-column:1;grid-row:3/);
  assert.doesNotMatch(css, /\.footer-top>a:not\(\.social-link\)\{grid-column:1;grid-row:3/);
});

test('site shell and chrome span the viewport while preserving content gutters', async () => {
  const css = await readFile('dist/site-layout.css', 'utf8');

  assert.match(css, /\.site-wrap\{--site-gutter:64px;width:100%\}/);
  assert.match(css, /\.site-header,footer\{width:100vw;margin-left:calc\(50% - 50vw\)/);
});