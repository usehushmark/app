import test from 'node:test';
import assert from 'node:assert/strict';
import {withdrawalQuote,validateWithdrawal,checkedNumber,scopedStorage,depositSolReserve,sameWithdrawalFees} from '../src/privacy-guards.js';
test('confirmation detects SOL rent, USDC rent, percentage and minimum changes',()=>{
 const config={withdraw_fee_rate:.0035,withdraw_rent_fee:.006,rent_fees:{usdc:.7},minimum_withdrawal:{sol:.01,usdc:2}};
 assert.equal(sameWithdrawalFees(config,config,0),true);
 assert.equal(sameWithdrawalFees({...config,withdraw_rent_fee:.007},config,0),false);
 assert.equal(sameWithdrawalFees({...config,rent_fees:{usdc:.8}},config,1),false);
 assert.equal(sameWithdrawalFees({...config,withdraw_fee_rate:.004},config,0),false);
 assert.equal(sameWithdrawalFees({...config,minimum_withdrawal:{sol:1}},config,0),false);
 assert.equal(depositSolReserve(0),205000n);assert.equal(depositSolReserve(1),2000000n);
});
test('withdrawal review matches protocol fee arithmetic and rejects invalid fees',()=>{
 assert.deepEqual(withdrawalQuote(100000000n,.0035,.006,9),{gross:100000000n,fee:6350000n,net:93650000n});
 assert.throws(()=>withdrawalQuote(1n,.0035,.006,9));assert.throws(()=>withdrawalQuote(100n,NaN,0,9));assert.throws(()=>checkedNumber(9007199254740992n));
});
test('relay payload cannot change recipient, amount, fee or token after approval',()=>{
 const review={recipient:'approved',net:1000n,fee:12n,asset:{mint:'mint'}};const body={recipient:'approved',extAmount:-1000,fee:12,mintAddress:'mint'};
 assert.doesNotThrow(()=>validateWithdrawal(body,review));for(const change of [{recipient:'other'},{extAmount:-900},{fee:13},{mintAddress:'other'}])assert.throws(()=>validateWithdrawal({...body,...change},review));
});
test('encrypted note caches are separated by owner',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},a=scopedStorage(storage,'a'),b=scopedStorage(storage,'b');a.setItem('notes','encrypted');assert.equal(a.getItem('notes'),'encrypted');assert.equal(b.getItem('notes'),null);
});
