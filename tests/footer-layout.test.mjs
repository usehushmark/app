import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mobile footer gives the brand, tagline, privacy link, and X link separate grid areas', async () => {
  const css = await readFile('dist/site-layout.css', 'utf8');

  assert.match(
    css,
    /grid-template-areas:\s*"brand brand"\s*"tagline tagline"\s*"boundary social"/,
  );
  assert.match(css, /\.footer-top \.brand\{grid-area:brand\}/);
  assert.match(css, /\.footer-top p\{grid-area:tagline/);
  assert.match(css, /\.footer-top>a:not\(\.social-link\)\{grid-area:boundary/);
  assert.match(css, /\.footer-top \.social-link\{grid-area:social/);
});
