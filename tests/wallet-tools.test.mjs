import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {createPaymentRequestLink,parsePaymentRequest,validatePaymentRequest,quoteRequestedNet} from '../src/payment-request.js';
import {createIdleSession} from '../src/idle-session.js';
import {checkServices} from '../src/service-status.js';
import {GENESIS} from '../src/config.js';
const now=1700000000000,recipient=Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58();
const request={v:1,recipient,asset:'SOL',amount:'0.1000',expires:now+60000};
test('payment links roundtrip on the current HTTPS origin with exact canonical amount and no query payload',()=>{
 const link=new URL(createPaymentRequestLink(request,'https://hushmark.io',now));
 assert.equal(link.pathname,'/wallet/');assert.equal(link.search,'');assert.equal(parsePaymentRequest(link.hash,now).amount,'0.1');assert.equal(parsePaymentRequest('#activity',now),null);
 assert.equal(new URL(createPaymentRequestLink(request,'http://127.0.0.1:4173',now)).port,'4173');
 for(const origin of ['http://example.com','https://user:pass@example.com','file:///wallet'])assert.throws(()=>createPaymentRequestLink(request,origin,now));
});
test('requests reject expired, excess precision, unknown fields/assets, invalid recipients, zero and oversized input',()=>{
 for(const patch of [{expires:now},{expires:now+32*86400000},{asset:'HUSHM'},{amount:'0'},{amount:'-1'},{amount:'0.0000000001'},{amount:'1e5'},{recipient:'<script>'},{recipient:7},{extra:true}])assert.throws(()=>validatePaymentRequest({...request,...patch},now));
 assert.throws(()=>parsePaymentRequest('#pay='+'a'.repeat(1900),now));assert.throws(()=>parsePaymentRequest('#pay=<script>',now));
});
test('net requests calculate exact recipient units with SOL and USDC fees and reject invalid fee data',()=>{
 for(const [decimals,rent] of [[9,.006],[6,.7]])for(const net of [1n,10n,123456n,5000000n,100000000n,999999999999n]){
  const q=quoteRequestedNet(net,.0035,rent,decimals);assert.equal(q.net,net);assert.equal(q.gross-q.fee,net);
  assert.equal(q.fee,BigInt(Math.floor(Number(q.gross)*.0035+10**decimals*rent)));
 }
 for(const rate of [1,-1,NaN,Infinity])assert.throws(()=>quoteRequestedNet(10n,rate,.006,9));
 assert.throws(()=>quoteRequestedNet(BigInt(Number.MAX_SAFE_INTEGER),.1,1,9));
});
function idleFixture(){let time=0,expires=0,scheduled;const idle=createIdleSession({now:()=>time,onExpire:()=>expires++,setTimer:fn=>{scheduled=fn;return 1;},clearTimer:()=>{scheduled=null;}});return {idle,advance:n=>time+=n,fire:()=>scheduled?.(),expired:()=>expires};}
test('idle expiry cannot be revived by a late click after background timer throttling',()=>{
 const f=idleFixture();f.idle.start();f.advance(299999);assert.equal(f.idle.check(),true);f.advance(1);f.idle.touch();assert.equal(f.expired(),1);assert.equal(f.idle.check(),false);f.idle.touch();assert.equal(f.expired(),1);
});
test('activity resets inactivity; shortening timeout checks deadline; stop discards timer',()=>{
 const f=idleFixture();f.idle.setMinutes(15);f.idle.start();f.advance(4*60000);f.idle.touch();f.advance(4*60000);assert.equal(f.idle.check(),true);f.advance(60000);f.idle.setMinutes(5);assert.equal(f.expired(),1);
 f.idle.start();f.idle.stop();f.advance(30*60000);f.fire();assert.equal(f.expired(),1);assert.throws(()=>f.idle.setMinutes(0));
});
const fees={withdraw_fee_rate:.0035,withdraw_rent_fee:.006,rent_fees:{usdc:.7,usdt:.9},minimum_withdrawal:{sol:.01,usdc:2,usdt:3}};
function services(options={}){const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,init});if(options.offline)throw new Error('offline');if(init?.method==='POST'){const {method}=JSON.parse(init.body);return Response.json({result:method==='getGenesisHash'?(options.wrong?'wrong':GENESIS):method==='getSlot'?123:{value:{executable:!options.noProgram}}});}return Response.json(options.badFees?{}:fees);}};}
test('service checks verify mainnet, program and fees using read calls only',async()=>{
 const f=services(),r=await checkServices({rpc:'https://rpc.example',fetch:f.fetch});assert.deepEqual(Object.values(r).map(x=>x.status),['available','available','available']);
 assert.ok(f.calls.every(c=>!c.init?.method||['getGenesisHash','getSlot','getAccountInfo'].includes(JSON.parse(c.init.body).method)));assert.equal(f.calls.filter(c=>c.init?.body?.includes('getGenesisHash')).length,1);
});
test('wrong network never shows an available program and independent failures remain separate',async()=>{
 let f=services({wrong:true}),r=await checkServices({rpc:'https://rpc.example',fetch:f.fetch});assert.equal(r.rpc.status,'unavailable');assert.equal(r.program.status,'unavailable');assert.equal(r.relayer.status,'available');
 f=services({badFees:true});r=await checkServices({rpc:'https://rpc.example',fetch:f.fetch});assert.equal(r.rpc.status,'available');assert.equal(r.relayer.status,'unavailable');
 f=services({offline:true});r=await checkServices({rpc:'https://rpc.example',fetch:f.fetch});assert.ok(Object.values(r).every(x=>x.status==='unavailable'));
});
test('aborted service check does not publish stale results',async()=>{
 const c=new AbortController();c.abort();let published=0;
 const r=await checkServices({rpc:'https://rpc.example',signal:c.signal,fetch:async()=>{throw c.signal.reason;},onResult:()=>published++});assert.equal(published,0);assert.ok(Object.values(r).every(x=>x.status==='unavailable'));
});

test('USDT requests preserve six-decimal precision and exact net amount',()=>{
 const link=createPaymentRequestLink({...request,asset:'USDT',amount:'5.123456'},'https://hushmark.io',now);
 assert.equal(parsePaymentRequest(new URL(link).hash,now).asset,'USDT');assert.equal(parsePaymentRequest(new URL(link).hash,now).amount,'5.123456');
 assert.throws(()=>validatePaymentRequest({...request,asset:'USDT',amount:'5.1234567'},now));
 assert.equal(quoteRequestedNet(5123456n,.0035,.9,6).net,5123456n);
});
test('service readiness requires a USDT rent and minimum as well as existing assets',async()=>{
 const fetch=async(url,init)=>init?.method==='POST'?Response.json({result:JSON.parse(init.body).method==='getGenesisHash'?GENESIS:JSON.parse(init.body).method==='getSlot'?100:{value:{executable:true}}}):Response.json({...fees,rent_fees:{usdc:.7}});
 const r=await checkServices({rpc:'https://rpc.example',fetch});assert.equal(r.relayer.status,'unavailable');assert.equal(r.rpc.status,'available');
});
