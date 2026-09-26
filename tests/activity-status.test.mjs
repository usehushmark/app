import test from 'node:test';
import assert from 'node:assert/strict';
import {PROGRAM} from '../src/privacy-guards.js';
import {digestProof,verifyActivityStatus} from '../src/activity-status.js';

const bytes=new Uint8Array([1,2,3]);
const record={type:'withdraw',signature:'3'.repeat(88),proofDigest:await digestProof(bytes)};
const status=(confirmationStatus='finalized',err=null)=>({confirmationStatus,err});
function setup(value,proof=bytes,transactionError=null){
 let reads=0;
 const connection={
  getSignatureStatuses:async()=>({value:[value]}),
  getTransaction:async()=>{reads++;return proof===null?null:{meta:{err:transactionError},transaction:{message:{getAccountKeys:()=>({get:()=>({toBase58:()=>PROGRAM})}),compiledInstructions:[{programIdIndex:0,data:proof}]}}};},
 };
 return {connection,reads:()=>reads};
}
test('withdrawal finality requires its exact approved proof, including failed transaction receipts',async()=>{
 for(const err of [null,{InstructionError:[0,'Custom']}]){
  const matched=setup(status('finalized',err));
  assert.equal(await verifyActivityStatus(record,matched.connection,()=>{}),err?'failed':'finalized');
  const mismatch=setup(status('finalized',err),new Uint8Array([9]));
  assert.equal(await verifyActivityStatus(record,mismatch.connection,()=>{}),'proof-mismatch');
  const missing=setup(status('finalized',err),null);
  assert.equal(await verifyActivityStatus(record,missing.connection,()=>{}),'unverified');
 }
 const noDigest=setup(status());
 assert.equal(await verifyActivityStatus({...record,proofDigest:undefined},noDigest.connection,()=>{}),'unverified');
 assert.equal(noDigest.reads(),0);
});
test('unknown and pending states are never treated as finality; a bound deposit can report failure',async()=>{
 for(const [value,expected] of [[null,'not-found'],[status('processed'),'processing'],[status('confirmed'),'confirmed'],[status('confirmed',{err:1}),'unverified']]){
  const {connection}=setup(value);
  assert.equal(await verifyActivityStatus(record,connection,()=>{}),expected);
 }
 const failed=setup(status('finalized',{err:1}));
 assert.equal(await verifyActivityStatus({...record,type:'deposit'},failed.connection,()=>{}),'failed');
 assert.equal(failed.reads(),0);
});
test('locking during a network read prevents the result from reaching the UI or journal',async()=>{
 let locked=false;
 const connection={getSignatureStatuses:async()=>{locked=true;return {value:[status()]};}};
 await assert.rejects(verifyActivityStatus(record,connection,()=>{if(locked)throw new Error('Locked');}),/Locked/);
});
