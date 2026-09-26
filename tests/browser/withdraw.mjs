import {mkdirSync} from 'node:fs';
mkdirSync('qa',{recursive:true});
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Keypair} from '@solana/web3.js';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {createHash} from 'node:crypto';
import {createPrivateActivity,privateActivityStorageKey} from '../../src/private-activity.js';
import {createPaymentRequestLink} from '../../src/payment-request.js';
import {SIGN_MESSAGE} from '../../src/privacy-guards.js';
const auditSeed=Array.from({length:32},(_,i)=>i+1),fixtureKey=Keypair.fromSeed(Uint8Array.from(auditSeed));
async function readHistory(page){
 const key=privateActivityStorageKey(fixtureKey.publicKey.toBase58());
 const raw=await page.evaluate(key=>localStorage.getItem(key),key);
 assert.ok(raw,'The SDK operation must create its history automatically.');
 assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['ciphertext','iv','version']);
 const unlockSignature=nacl.sign.detached(new TextEncoder().encode(SIGN_MESSAGE),fixtureKey.secretKey);
 const journal=await createPrivateActivity({owner:fixtureKey.publicKey.toBase58(),signature:unlockSignature,storage:{getItem:name=>name===key?raw:null,setItem(){throw new Error('Test history reader must not write.');},removeItem(){throw new Error('Test history reader must not clear.');}}});
 unlockSignature.fill(0);
 try{return{raw,records:await journal.read()};}finally{journal.close();}
}
async function assertLockedDom(page){
 assert.equal(await page.locator('[data-activity-id]').count(),0);
 assert.equal(await page.locator('#tx-link').textContent(),'');
 assert.equal(await page.locator('#tx-link').getAttribute('href'),null);
 assert.equal(await page.locator('#tx-state').textContent(),'');
 assert.equal(await page.locator('#transaction').isVisible(),false);
}
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await build({entryPoints:['tests/browser/notes-fixture.js'],outfile:'qa/privacy-notes-bundle.js',bundle:true,format:'iife',platform:'browser',inject:['src/privacy-polyfill.js'],alias:{crypto:'crypto-browserify',stream:'stream-browserify',util:'util',assert:'assert'},define:{global:'globalThis','process.env':'{}'},drop:['console']});
const requested=process.env.AUDIT_REQUEST==='1';
const spl=process.env.AUDIT_ASSET==='USDC',mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
await build({entryPoints:['tests/browser/provider.js'],outfile:'qa/privacy-provider-bundle.js',bundle:true,format:'iife',platform:'browser',inject:['src/polyfill.js']});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript({content:`window.__auditSeed=${JSON.stringify(auditSeed)};\n${await readFile('qa/privacy-provider-bundle.js','utf8')}`});let fixture=null,submitted=0,body,mismatch=false,transactionChecks=0;
 await page.route(url=>url.hostname==='api3.privacycash.org',async route=>{const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){if(url.pathname==='/utxos/indices'){await route.fulfill({json:{indices:req.postDataJSON().encrypted_outputs.map(()=>0)}});return;}if(url.pathname===(spl?'/withdraw/spl':'/withdraw')){submitted++;body=req.postDataJSON();await route.fulfill({json:{success:true,signature:'3'.repeat(88)}});return;}await route.abort();throw new Error('Blocked unexpected write');}
  if(url.pathname==='/utxos/range'){await route.fulfill({json:{encrypted_outputs:Number(url.searchParams.get('start'))===0?[fixture.encrypted]:[],hasMore:false,total:1}});return;}
  if(url.pathname.includes('/merkle/proofv2/')){await route.fulfill({json:{root:fixture.root,nextIndex:2,proofs:[fixture.path,{pathElements:Array(26).fill('0'),pathIndices:Array(26).fill(0)}]}});return;}
  if(url.pathname.includes('/utxos/check/')){await route.fulfill({json:{exists:true}});return;}await route.continue();
 });
 await page.route(url=>url.hostname==='solana-rpc.publicnode.com',async route=>{const req=route.request().postDataJSON();if(req.method==='sendTransaction'){await route.abort();throw new Error('Network write blocked');}if(req.method==='getTransaction'){transactionChecks++;await route.fulfill({json:{jsonrpc:'2.0',id:req.id,result:{slot:100,blockTime:1,meta:{err:null,fee:5000,preBalances:[0],postBalances:[0]},transaction:{signatures:['3'.repeat(88)],message:{header:{numRequiredSignatures:0,numReadonlySignedAccounts:0,numReadonlyUnsignedAccounts:1},accountKeys:['9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'],recentBlockhash:'1'.repeat(32),instructions:[{programIdIndex:0,accounts:[],data:bs58.encode(Buffer.from(mismatch?'AAAA':body.serializedProof,'base64'))}]}},version:'legacy'}}});return;}if(req.method==='getSignatureStatuses'){await route.fulfill({json:{jsonrpc:'2.0',id:req.id,result:{context:{slot:100},value:[{slot:100,err:null,confirmations:null,confirmationStatus:'finalized'}]}}});return;}await route.continue();});
 await page.goto('http://127.0.0.1:4173/wallet/');await page.addScriptTag({content:await readFile('qa/privacy-notes-bundle.js','utf8')});fixture=await page.evaluate(({spl,mint})=>window.makePrivateNote(spl?{mint,amount:'10000000'}:{}),{spl,mint});if(spl)await page.locator('#asset').selectOption('1');
 await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});
 const recoveredOwner=await page.locator('#owner').textContent();await page.reload();if(spl)await page.locator('#asset').selectOption('1');await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});assert.equal(await page.locator('#owner').textContent(),recoveredOwner);console.log('Reload recovery: same wallet and encryption fingerprint');await page.locator('#operation').selectOption('withdraw');const recipient=Keypair.generate().publicKey.toBase58();await page.locator('#recipient').fill(recipient);await page.locator('#amount').fill(spl?'5':'0.1');if(requested){const link=createPaymentRequestLink({v:1,recipient,asset:spl?'USDC':'SOL',amount:spl?'5':'0.1',expires:Date.now()+3600000},'http://127.0.0.1:4173');await page.evaluate(hash=>{location.hash=hash;},new URL(link).hash);await page.locator('#request-use').click();}await page.locator('#review-payment').click();await page.waitForFunction(()=>!document.getElementById('review-payment').disabled,{},{timeout:60000});console.log('Review:',await page.locator('#privacy-status').textContent());assert.equal(await page.locator('#payment-review').isVisible(),true);assert.equal(await page.locator(spl?'#private-1':'#private-0').textContent(),spl?'10':'1');await page.locator('#acknowledge').check();await page.locator('#confirm-payment').click();await page.waitForFunction(()=>!document.getElementById('confirm-payment').disabled,{},{timeout:180000});console.log('Withdrawal:',await page.locator('#privacy-status').textContent());assert.equal(await page.locator('#tx-state').textContent(),'Finalized');assert.equal(submitted,1);assert.equal(body.recipient,recipient);assert.equal(requested?-body.extAmount:-body.extAmount+body.fee,spl?5000000:100000000);if(requested)console.log('Requested net amount matched the actual SDK relay payload exactly.');assert.equal(await page.evaluate(()=>window.fixtureTxSigns||0),0);
 const {raw,records}=await readHistory(page);assert.equal(records.length,1);const saved=records[0];
 assert.equal(saved.type,'withdraw');assert.equal(saved.asset,spl?'USDC':'SOL');assert.equal(saved.amount,requested?String(-body.extAmount+body.fee):(spl?'5000000':'100000000'));assert.equal(saved.status,'finalized');assert.equal(saved.signature,'3'.repeat(88));
 assert.equal(saved.netAmount,String(-body.extAmount));assert.equal(saved.fee,String(body.fee));assert.equal(saved.proofDigest,createHash('sha256').update(Buffer.from(body.serializedProof,'base64')).digest('hex'));
 assert.equal(Object.hasOwn(saved,'recipient'),false);assert.equal(Object.hasOwn(saved,'proof'),false);
 for(const value of [saved.id,saved.amount,saved.signature,saved.proofDigest,recipient,'finalized'])assert.equal(raw.includes(value),false,'Journal must not persist payment plaintext.');
 assert.equal(await page.locator(`[data-activity-id="${saved.id}"] [data-status]`).getAttribute('data-status'),'finalized');
 mismatch=true;await page.locator('#check-status').click();await page.waitForFunction(()=>!document.getElementById('check-status').disabled);assert.match(await page.locator('#tx-state').textContent(),/Proof mismatch/);
 const rejectedHistory=(await readHistory(page)).records;assert.equal(rejectedHistory.length,1);assert.equal(rejectedHistory[0].id,saved.id);assert.equal(rejectedHistory[0].status,'proof-mismatch');assert.equal(rejectedHistory[0].proofDigest,saved.proofDigest);console.log('Wrong returned transaction proof rejected and saved on the same activity record');
 await page.locator('#lock').click();await assertLockedDom(page);
 await page.reload();await assertLockedDom(page);await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});
 assert.equal(await page.locator('#owner').textContent(),recoveredOwner);assert.equal(await page.locator('[data-activity-id]').count(),1);assert.equal(await page.locator(`[data-activity-id="${saved.id}"] [data-status]`).getAttribute('data-status'),'proof-mismatch');
 const checksBeforeRefresh=transactionChecks;mismatch=false;await page.locator(`[data-activity-refresh="${saved.id}"]`).click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:30000});
 assert.ok(transactionChecks>checksBeforeRefresh,'Reloaded withdrawal refresh must inspect the transaction proof.');
 const recoveredHistory=(await readHistory(page)).records;assert.equal(recoveredHistory.length,1);assert.equal(recoveredHistory[0].id,saved.id);assert.equal(recoveredHistory[0].status,'finalized');assert.equal(recoveredHistory[0].proofDigest,saved.proofDigest);assert.equal(submitted,1,'History refresh must never resubmit a withdrawal.');
 await page.locator('#lock').click();await assertLockedDom(page);assert.deepEqual(errors,[]);
 console.log('PASS: actual browser authenticated notes, private balance, withdrawal proof and exact relay payload; automatic encrypted history, persisted proof mismatch, same-wallet reload and proof-checked status refresh. Submission/finality were fixtures; no network transfer.');
}finally{await browser.close();}

