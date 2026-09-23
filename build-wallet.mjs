import {build} from 'esbuild';
await build({entryPoints:['src/wallet.js'],outfile:'dist/wallet.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,inject:['src/polyfill.js'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
