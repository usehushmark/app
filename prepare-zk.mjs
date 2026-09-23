// Copy only public proving assets and freshly generated SYNTHETIC fixtures.
// Never copy ../hushmark/private or real holder credentials into the site.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createDemoBatch } from '../hushmark/src/hushmark.mjs';
await mkdir('dist/zk', {recursive:true});
await mkdir('dist/vendor', {recursive:true});
const batch=createDemoBatch();
await writeFile('dist/zk/samples.json',JSON.stringify({
  developmentOnly:true, synthetic:true, root:batch.signedRoot.root,
  credentials:{experienced:batch.credentials[0],starter:batch.credentials[1]}
},null,2));
for(const [from,to] of [
 ['../hushmark/artifacts/reputation_js/reputation.wasm','dist/zk/reputation.wasm'],
 ['../hushmark/artifacts/reputation.zkey','dist/zk/reputation.zkey'],
 ['../hushmark/artifacts/verification_key.json','dist/zk/verification_key.json'],
 ['../hushmark/circuits/reputation.circom','dist/zk/reputation.circom'],
 ['../hushmark/node_modules/snarkjs/build/snarkjs.min.js','dist/vendor/snarkjs.min.js'],
 ['../hushmark/node_modules/snarkjs/COPYING','dist/vendor/snarkjs-LICENSE.txt']
]) await copyFile(from,to);
console.log('Prepared real proving assets and public synthetic sample inputs.');
await globalThis.curve_bn128?.terminate();
