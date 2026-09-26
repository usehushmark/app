// Offline probe: all networking is blocked; no wallet or signing is provided.
import assert from 'node:assert/strict';
import {depositSPL} from '../node_modules/privacycash/dist/depositSPL.js';
import {withdrawSPL} from '../node_modules/privacycash/dist/withdrawSPL.js';
import {getUtxosSPL} from '../node_modules/privacycash/dist/getUtxosSPL.js';
const mintAddress='F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump';
let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Network prohibited in offline probe');};
for(const [name,run] of Object.entries({depositSPL,withdrawSPL,getUtxosSPL})){
 await assert.rejects(run({mintAddress,base_units:1}),error=>error.message==='token not found: '+mintAddress);
 console.log(name+': rejects HUSHM before signing or network access');
}
assert.equal(calls,0);console.log('Verified: 0 network calls, 0 signatures, 0 transactions.');
