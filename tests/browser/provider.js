import {Keypair} from '@solana/web3.js';
import nacl from 'tweetnacl';
const key=window.__auditSeed?Keypair.fromSeed(new Uint8Array(window.__auditSeed)):Keypair.generate(),handlers={};
window.privacyFixtureAddress=key.publicKey.toBase58();
window.phantom={solana:{publicKey:key.publicKey,connect:async()=>{},on:(e,f)=>handlers[e]=f,removeListener:e=>delete handlers[e],signMessage:async message=>{if(window.rejectUnlock)throw Object.assign(new Error('Declined'),{code:4001});window.fixtureSigns=(window.fixtureSigns||0)+1;return{signature:nacl.sign.detached(message,key.secretKey)};},signTransaction:async tx=>{window.fixtureTxSigns=(window.fixtureTxSigns||0)+1;tx.sign([key]);return tx;}}};
window.fixtureAccountChange=()=>handlers.accountChanged?.();
