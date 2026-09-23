import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnits,formatUnits,statusLabel,validRpc} from '../src/core.js';
test('amounts preserve SOL and USDC precision without floating-point rounding',()=>{
 assert.equal(parseUnits('0.000000001',9),1n);assert.equal(parseUnits('12.345678',6),12345678n);
 assert.equal(formatUnits(parseUnits('1000000000.123456789',9),9),'1000000000.123456789');
 for(const value of ['0','-1','1e3','NaN','0.0000001','1,000','18446744073709551616'])assert.throws(()=>parseUnits(value,6));
});
test('missing, failed and merely confirmed signatures never report finalization',()=>{
 assert.equal(statusLabel(null),'Not found');assert.equal(statusLabel({confirmationStatus:'confirmed',err:null}),'Confirmed');
 assert.equal(statusLabel({confirmationStatus:'finalized',err:{InstructionError:[0,'error']}}),'Failed');
 assert.equal(statusLabel({confirmationStatus:'finalized',err:null}),'Finalized');
});
test('RPC settings require TLS and exclude embedded credentials',()=>{
 assert.equal(validRpc('https://example.com/rpc'),'https://example.com/rpc');
 for(const url of ['javascript:alert(1)','http://localhost:8899','https://user:pass@example.com','https://example.com/#secret'])assert.throws(()=>validRpc(url));
});
