import {EncryptionService} from 'privacycash/utils';
import {WasmFactory} from '@lightprotocol/hasher.rs';
import {Utxo} from '../../node_modules/privacycash/dist/models/utxo.js';
import {Keypair} from '../../node_modules/privacycash/dist/models/keypair.js';
import {MerkleTree} from '../../node_modules/privacycash/dist/utils/merkle_tree.js';
window.makePrivateNote=async({mint,amount="1000000000"}={})=>{
 const signature=(await window.phantom.solana.signMessage(new TextEncoder().encode('Privacy Money account sign in'))).signature;
 const enc=new EncryptionService();enc.deriveEncryptionKeyFromSignature(signature);const wasm=await WasmFactory.getInstance();
 const note=new Utxo({lightWasm:wasm,amount,mintAddress:mint,blinding:'1234567',index:0,keypair:new Keypair(enc.getUtxoPrivateKeyV2(),wasm)});
 const encrypted=enc.encryptUtxo(note);if(enc.decrypt(encrypted).toString()!==`${amount}|1234567|0|${mint||'11111111111111111111111111111112'}`)throw new Error('Encrypted-note round trip failed');const tampered=Buffer.from(encrypted);tampered[tampered.length-1]^=1;let rejected=false;try{enc.decrypt(tampered);}catch{rejected=true;}if(!rejected)throw new Error('Tampered ciphertext accepted');
 const tree=new MerkleTree(26,wasm,[note.getCommitment()]);return {encrypted:encrypted.toString('hex'),root:tree.root(),path:tree.path(0)};
};
