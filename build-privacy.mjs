import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('dist/privacy-circuit',{recursive:true});
for(const ext of ['wasm','zkey'])await copyFile(`node_modules/privacycash/circuit2/transaction2.${ext}`,`dist/privacy-circuit/transaction2.${ext}`);
await build({entryPoints:['src/privacy.js'],outfile:'dist/privacy.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,drop:['console'],inject:['src/privacy-polyfill.js'],alias:{crypto:'crypto-browserify',stream:'stream-browserify',util:'util',assert:'assert'},define:{'global':'globalThis','process.env':'{}','process.browser':'true','process.version':'""'},legalComments:'eof'});

await mkdir('dist/whitepaper',{recursive:true});
await copyFile('whitepaper/Hushmark-Whitepaper-v1.0.pdf','dist/whitepaper/Hushmark-Whitepaper-v1.0.pdf');