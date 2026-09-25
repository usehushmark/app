import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('private wallet does not render the retired funded-test notice',async()=>{
  const html=await readFile('dist/wallet/index.html','utf8');

  assert.doesNotMatch(html,/Real Solana assets · Privacy Cash protocol\./);
  assert.doesNotMatch(html,/funded end-to-end test/);
});
