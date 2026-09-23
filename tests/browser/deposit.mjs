import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
mkdirSync('qa',{recursive:true});
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
const spl=process.env.AUDIT_ASSET==='USDC',mint=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');let tokenInfo,ata;
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await build({entryPoints:['tests/browser/provider.js'],outfile:'qa/privacy-provider-bundle.js',bundle:true,format:'iife',platform:'browser',inject:['src/polyfill.js']});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript({path:'qa/privacy-provider-bundle.js'});let submitted=0,signature;
 await page.route(url=>url.hostname==='api3.privacycash.org',async route=>{
  const request=route.request(),url=request.url();if(request.method()!=='GET'){
   if(url.endsWith(spl?'/deposit/spl':'/deposit')){const body=request.postDataJSON();const tx=VersionedTransaction.deserialize(Buffer.from(body.signedTransaction,'base64'));signature=bs58.encode(tx.signatures[0]);submitted++;await route.fulfill({json:{success:true,signature}});return;}
   await route.abort();throw new Error('Unexpected outbound mutation blocked: '+url);
  }
  if(url.includes('/utxos/range')){await route.fulfill({json:{encrypted_outputs:[],hasMore:false,total:0}});return;}
  if(url.includes('/utxos/check/')){await route.fulfill({json:{exists:true}});return;}
  await route.continue();
 });
 await page.route(url=>url.hostname==='solana-rpc.publicnode.com',async route=>{const req=route.request().postDataJSON();const ctx=value=>({context:{slot:100},value});let result;
  if(req.method==='sendTransaction'){await route.abort();throw new Error('Direct network submission forbidden in tests.');}
  if(spl&&req.method==='getAccountInfo'&&req.params[0]===ata)result=ctx(tokenInfo);
  else if(req.method==='getBalance')result=ctx(2000000000);
  else if(req.method==='simulateTransaction')result=ctx({err:null,logs:[],unitsConsumed:500000});
  else if(req.method==='getSignatureStatuses')result=ctx([{slot:100,err:null,confirmations:null,confirmationStatus:'finalized'}]);
  else{await route.continue();return;}
  await route.fulfill({json:{jsonrpc:'2.0',id:req.id,result}});
 });
 await page.goto('http://127.0.0.1:4173/wallet/');if(spl){const owner=new PublicKey(await page.evaluate(()=>window.privacyFixtureAddress));ata=getAssociatedTokenAddressSync(mint,owner).toBase58();const data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner,amount:100000000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);tokenInfo={data:[data.toString('base64'),'base64'],executable:false,owner:TOKEN_PROGRAM_ID.toBase58(),lamports:2039280,rentEpoch:0};await page.locator('#asset').selectOption('1');}await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{},{timeout:60000});assert.equal(await page.locator('#unlock-state').textContent(),'UNLOCKED');
 await page.locator('#amount').fill(spl?'5':'0.1');await page.locator('#review-payment').click();await page.locator('#payment-review').waitFor({state:'visible',timeout:30000});await page.locator('#acknowledge').check();await page.locator('#confirm-payment').click();
 await page.waitForFunction(()=>!document.getElementById('confirm-payment').disabled,{},{timeout:180000});console.log('Proof flow status:',await page.locator('#privacy-status').textContent());assert.equal(submitted,1);assert.equal(await page.evaluate(()=>window.fixtureTxSigns),1);assert.equal(await page.locator('#tx-state').textContent(),'Finalized');assert.deepEqual(errors,[]);console.log('PASS: actual browser proof generation with bundled circuit, actual protocol transaction assembly, guarded wallet signing and intercepted relay submission. Every transfer write was blocked from reaching the network. Finality was a fixture, not a real settlement.');
}finally{await browser.close();}
