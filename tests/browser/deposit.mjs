async function continueRpcRead(route){
 if(process.env.AUDIT_NODE_RPC!=='1'){await route.continue();return;}
 const payload=route.request().postDataJSON();if(!/^get[A-Z]/.test(payload.method))throw new Error('Non-read RPC blocked');
 const response=await fetch(auditRpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 const body=await response.text();await route.fulfill({status:response.status,contentType:'application/json',body});
}
const auditRpc=process.env.AUDIT_RPC||DEFAULT_RPC;
import {ASSETS,DEFAULT_RPC} from '../../src/config.js';
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
mkdirSync('qa',{recursive:true});
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {PublicKey,Keypair} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import nacl from 'tweetnacl';
import {createPrivateActivity,privateActivityStorageKey} from '../../src/private-activity.js';
import {SIGN_MESSAGE} from '../../src/privacy-guards.js';
const asset=ASSETS.find(a=>a.symbol===(process.env.AUDIT_ASSET||'SOL'));assert.ok(asset,'Unsupported test asset');const index=ASSETS.indexOf(asset),spl=!!asset.mint,mint=new PublicKey(asset.mint||ASSETS[1].mint);let tokenInfo,ata;
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
async function unlockWallet(page){
 await page.locator('#software-wallet').check();await page.locator('#unlock').click();
 await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});
 assert.equal(await page.locator('#unlock-state').textContent(),'UNLOCKED',await page.locator('#privacy-status').textContent());
 assert.equal(await page.locator('#owner').textContent(),fixtureKey.publicKey.toBase58());
}
async function assertLockedDom(page){
 assert.equal(await page.locator('[data-activity-id]').count(),0);
 assert.equal(await page.locator('#tx-link').textContent(),'');
 assert.equal(await page.locator('#tx-link').getAttribute('href'),null);
 assert.equal(await page.locator('#tx-state').textContent(),'');
 assert.equal(await page.locator('#transaction').isVisible(),false);
}
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await build({entryPoints:['tests/browser/provider.js'],outfile:'qa/privacy-provider-bundle.js',bundle:true,format:'iife',platform:'browser',inject:['src/polyfill.js']});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript({content:`if(location.hostname==='127.0.0.1')sessionStorage.setItem('hushmark-rpc',${JSON.stringify(auditRpc)});window.__auditSeed=${JSON.stringify(auditSeed)};\n${await readFile('qa/privacy-provider-bundle.js','utf8')}`});let submitted=0,signature,statusChecks=0;
 await page.route(url=>url.hostname==='api3.privacycash.org',async route=>{
  const request=route.request(),url=request.url();if(request.method()!=='GET'){
   if(url.endsWith(spl?'/deposit/spl':'/deposit')){const body=request.postDataJSON();if(spl)assert.equal(body.mintAddress,mint.toBase58());const tx=VersionedTransaction.deserialize(Buffer.from(body.signedTransaction,'base64'));signature=bs58.encode(tx.signatures[0]);submitted++;await route.fulfill({json:{success:true,signature}});return;}
   await route.abort();throw new Error('Unexpected outbound mutation blocked: '+url);
  }
  if(url.includes('/utxos/range')){await route.fulfill({json:{encrypted_outputs:[],hasMore:false,total:0}});return;}
  if(url.includes('/utxos/check/')){await route.fulfill({json:{exists:true}});return;}
  await route.continue();
 });
 await page.route(url=>url.hostname===new URL(auditRpc).hostname,async route=>{const req=route.request().postDataJSON();const ctx=value=>({context:{slot:100},value});let result;
  if(req.method==='sendTransaction'){await route.abort();throw new Error('Direct network submission forbidden in tests.');}
  if(spl&&req.method==='getAccountInfo'&&req.params[0]===ata)result=ctx(tokenInfo);
  else if(req.method==='getBalance')result=ctx(2000000000);
  else if(req.method==='simulateTransaction')result=ctx({err:null,logs:[],unitsConsumed:500000});
  else if(req.method==='getSignatureStatuses'){statusChecks++;result=ctx([{slot:100,err:null,confirmations:null,confirmationStatus:'finalized'}]);}
  else{await continueRpcRead(route);return;}
  await route.fulfill({json:{jsonrpc:'2.0',id:req.id,result}});
 });
 await page.goto('http://127.0.0.1:4173/wallet/');if(spl){const owner=new PublicKey(await page.evaluate(()=>window.privacyFixtureAddress));ata=getAssociatedTokenAddressSync(mint,owner).toBase58();const data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner,amount:100000000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);tokenInfo={data:[data.toString('base64'),'base64'],executable:false,owner:TOKEN_PROGRAM_ID.toBase58(),lamports:2039280,rentEpoch:0};await page.locator('#asset').selectOption(String(index));}await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});assert.equal(await page.locator('#unlock-state').textContent(),'UNLOCKED',await page.locator('#privacy-status').textContent());
 await page.locator('#amount').fill(spl?'5':'0.1');await page.locator('#review-payment').click();await page.locator('#payment-review').waitFor({state:'visible',timeout:30000});await page.locator('#acknowledge').check();await page.locator('#confirm-payment').click();
 await page.waitForFunction(()=>!document.getElementById('confirm-payment').disabled,{},{timeout:180000});console.log('Proof flow status:',await page.locator('#privacy-status').textContent());assert.equal(submitted,1);assert.equal(await page.evaluate(()=>window.fixtureTxSigns),1);assert.equal(await page.locator('#tx-state').textContent(),'Finalized');
 const {raw,records}=await readHistory(page);assert.equal(records.length,1);const saved=records[0];
 assert.equal(saved.type,'deposit');assert.equal(saved.asset,asset.symbol);assert.equal(saved.amount,spl?'5000000':'100000000');assert.equal(saved.status,'finalized');assert.equal(saved.signature,signature);
 for(const value of [saved.id,saved.amount,saved.signature,'finalized'])assert.equal(raw.includes(value),false,'Journal must encrypt '+value);
 assert.equal(await page.locator(`[data-activity-id="${saved.id}"] [data-status]`).getAttribute('data-status'),'finalized');
 await page.locator('#lock').click();await assertLockedDom(page);
 await page.reload();await assertLockedDom(page);await unlockWallet(page);
 assert.equal(await page.locator('[data-activity-id]').count(),1);assert.deepEqual((await readHistory(page)).records,records);
 const beforeRefresh=statusChecks;await page.locator(`[data-activity-refresh="${saved.id}"]`).click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:30000});
 assert.ok(statusChecks>beforeRefresh,'Reloaded activity refresh must query the network fixture.');assert.equal((await readHistory(page)).records[0].status,'finalized');assert.equal(submitted,1,'History recovery/refresh cannot submit another payment.');
 await page.locator('#lock').click();await assertLockedDom(page);assert.deepEqual(errors,[]);
 console.log('PASS: actual browser proof/transaction assembly, guarded signing, intercepted deposit, automatically encrypted activity, same-wallet reload, status refresh and locked DOM clearing. Every transfer write was blocked from reaching the network. Finality was a fixture, not a real settlement.');
}finally{await browser.close();}
