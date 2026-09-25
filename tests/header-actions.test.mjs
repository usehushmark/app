import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('header actions keep the X icon borderless and vertically centered',async()=>{
  const css=await readFile('dist/site-layout.css','utf8');

  assert.match(css,/\.site-header \.header-actions\{[^}]*align-items:center[^}]*gap:20px/);
  assert.match(css,/\.header-x-link\{[^}]*width:16px[^}]*border:none[^}]*background:transparent[^}]*box-shadow:none/);
});
