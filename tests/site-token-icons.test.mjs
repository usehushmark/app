import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceHtml} from '../site-enhance.mjs';

test('Wallet enhancement adds Web3 token icons beside SOL and USDC labels',()=>{
  const html='<html><head></head><body><main><div class="asset-balance"><span>SOL</span><strong>—</strong></div><div class="asset-balance"><span>USDC</span><strong>—</strong></div></main></body></html>';
  const output=enhanceHtml(html,'wallet');

  assert.match(output,/class="token-label"/);
  assert.match(output,/class="web3icons token-icon"/);
  assert.match(output,/>SOL<\/span>/);
  assert.match(output,/>USDC<\/span>/);
});
