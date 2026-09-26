import {Connection,PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddress,unpackAccount,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as sdk from './privacy-sdk.js';
import {ASSETS,DEFAULT_RPC,GENESIS} from './config.js';
import {parseUnits,formatUnits,validRpc} from './core.js';
import {PROGRAM,RELAYER,SIGN_MESSAGE,checkedNumber,withdrawalQuote,validateWithdrawal,scopedStorage,depositSolReserve,sameWithdrawalFees} from './privacy-guards.js';
import {createPrivateActivity,privateActivityStorageKey} from './private-activity.js';
import {createActivityView} from './activity-view.js';
import {createIdleSession} from './idle-session.js';
import {createWalletTools} from './wallet-tools-view.js';
import {validatePaymentRequest,quoteRequestedNet} from './payment-request.js';
import {activityStatusLabel,digestProof,verifyActivityStatus} from './activity-status.js';
const $=id=>document.getElementById(id),rawFetch=globalThis.fetch.bind(globalThis);
let owner=null,provider=null,enc=null,wasm=null,storage=null,notes=[null,null],publicBalances=[null,null],epoch=0,busy=false,review=null,operation=null,abort=new AbortController(),hidden=false;
let formRevision=0,lastPayment=null,activity=null,activityRecords=[],selectedRequest=null;
const idle=createIdleSession({onExpire:()=>{lock();message('Session auto-locked after inactivity. A submitted payment may still complete; unlock and check its status before retrying.');}});
let walletTools;
function detachRequest(){selectedRequest=null;document.querySelector('label[for="amount"]').textContent='Amount debited';}
const activityView=createActivityView();
const activityWarning='Local history could not be read or saved. It may be incomplete. Wallet access is still available; check payment status before retrying. Clearing local history removes these records only.';
let endpoint=DEFAULT_RPC;try{endpoint=validRpc(sessionStorage.getItem('hushmark-rpc')||DEFAULT_RPC);}catch{}
let connection=new Connection(endpoint,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,opts)=>rawFetch(url,{...opts,signal:AbortSignal.timeout(20000)})});
function message(s){$('privacy-status').textContent=s;}
function fail(e){message(e?.code===4001?'Request declined.':String(e?.message||'Operation failed.').replace(/https?:\/\/\S+/g,'[service]').slice(0,350));}
function guard(version=epoch){if(owner&&enc)idle.check();if(!owner||!enc||version!==epoch||abort.signal.aborted)throw new Error('Privacy session locked or account changed. Unlock again.');}
function controls(value){busy=value;activityView.setBusy(value);document.querySelectorAll('[data-action]').forEach(el=>el.disabled=value);$('lock').disabled=false;}
function resetReview(){formRevision++;review=null;$('acknowledge').checked=false;$('payment-review').hidden=true;}
function clearTransaction(){lastPayment=null;$('transaction').hidden=true;$('tx-link').removeAttribute('href');$('tx-link').textContent='';$('tx-state').textContent='';delete $('check-status').dataset.signature;}
function lock(){idle.stop();walletTools?.lock();detachRequest();for(const id of ['review-action','review-amount','review-recipient','review-fee','review-net'])$(id).textContent='';provider?.removeListener?.('accountChanged',onAccount);provider?.removeListener?.('disconnect',onAccount);epoch++;abort.abort();abort=new AbortController();enc?.resetEncryptionKey();enc=null;owner=null;storage=null;activity?.close();activity=null;activityRecords=[];activityView.lock();clearTransaction();notes=[null,null];publicBalances=[null,null];resetReview();$('owner').textContent='Wallet not connected';$('unlock-state').textContent='LOCKED';render();message('Privacy session locked. Keys have been discarded from memory.');}

async function loadActivity(version=epoch){
 const journal=activity;if(!journal)return;
 try{const records=await journal.read();guard(version);if(journal!==activity)return;activityRecords=records;activityView.update(records);}
 catch(e){if(version===epoch&&journal===activity)activityView.warn(activityWarning);}
}
async function recordActivity(p,status){
 guard(p.version);
 p.activityRecord={...p.activityRecord,status,updatedAt:Math.max(Date.now(),p.activityRecord.createdAt),...(p.signature?{signature:p.signature}:{}),...(p.proofDigest?{proofDigest:p.proofDigest}:{})};
 if(!p.activityStore){activityView.warn(activityWarning);return;}
 try{const records=await p.activityStore.upsert(p.activityRecord);guard(p.version);if(p.activityStore===activity){activityRecords=records;activityView.update(records);}}
 catch(e){guard(p.version);activityView.warn(activityWarning);}
}
function render(){ASSETS.forEach((a,i)=>{$('public-'+i).textContent=publicBalances[i]===null?'—':formatUnits(publicBalances[i],a.decimals);$('private-'+i).textContent=hidden?'••••••':notes[i]===null?'—':formatUnits(notes[i].reduce((n,u)=>n+BigInt(u.amount.toString()),0n),a.decimals);});$('hide-balances').textContent=hidden?'Show private balances':'Hide private balances';}
async function network(){if(await connection.getGenesisHash()!==GENESIS)throw new Error('The selected RPC is not Solana mainnet.');const program=await connection.getAccountInfo(new PublicKey(PROGRAM));if(!program?.executable)throw new Error('Privacy program unavailable on this network.');}
sdk.setLogger((level,text)=>{if(level==='info'&&busy){if(/proof/i.test(text))message('Generating your zero-knowledge proof on this device…');else if(/decrypt/i.test(text))message('Scanning and decrypting encrypted notes locally. First sync can take several minutes…');}});
// Gate all SDK relay submissions against the exact user-approved operation.
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
 const mutation=url.origin===RELAYER&&init?.method==='POST'&&/^\/(deposit|withdraw)(\/|$)/.test(url.pathname);
 if(mutation){guard(operation?.version);if(!operation||operation.submitted)throw new Error('No unsubmitted payment approval.');if(operation.request)validatePaymentRequest(operation.request);const body=JSON.parse(init.body);
  if(url.pathname.startsWith('/withdraw')){if(operation.type!=='withdraw')throw new Error('Unexpected withdrawal.');validateWithdrawal(body,operation);operation.proofDigest=await digestProof(Buffer.from(body.serializedProof,'base64'));guard(operation.version);}
  else{if(operation.type!=='deposit'||body.signedTransaction!==operation.signedBytes)throw new Error('Unexpected deposit payload.');}
  // Persist an uncertain state BEFORE crossing the network boundary. A crash
  // or timed-out response must never look like a safely retryable payment.
  await recordActivity(operation,'submission-unknown');guard(operation.version);
  operation.submitted=true;message('Submitting the reviewed proof to Privacy Cash…');
 }
 const submittedOperation=mutation?operation:null;
 const signals=[AbortSignal.timeout(60000)];if(init?.signal)signals.push(init.signal);if(url.origin===RELAYER)signals.push(abort.signal);
 const response=await rawFetch(input,{...init,signal:AbortSignal.any(signals)});
 if(mutation){const result=await response.clone().json().catch(()=>null);guard(submittedOperation.version);if(result?.signature){if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(result.signature))throw new Error('Invalid transaction signature.');if(submittedOperation.type==='deposit'&&result.signature!==submittedOperation.signature)throw new Error('Relayer returned a different transaction signature.');submittedOperation.signature=result.signature;await recordActivity(submittedOperation,'submitted');lastPayment=submittedOperation;showTransaction(result.signature,'Submitted; awaiting network verification');}}
 return response;
};
async function unlock(){
 if(!$('software-wallet').checked)throw new Error('Confirm that this is a software wallet. Hardware-wallet recovery is not supported by this protocol SDK.');
 const selected=$('provider').value;provider=selected==='phantom'?(window.phantom?.solana||(window.solana?.isPhantom?window.solana:null)):window.solflare;
 if(!provider?.signMessage||!provider?.signTransaction)throw new Error('Open this site in Phantom or Solflare’s wallet browser, or install its extension.');
 await network();await provider.connect();lock();const version=epoch,key=new PublicKey(provider.publicKey.toString());
 provider.removeListener?.('accountChanged',onAccount);provider.removeListener?.('disconnect',onAccount);provider.on?.('accountChanged',onAccount);provider.on?.('disconnect',onAccount);
 const bytes=new TextEncoder().encode(SIGN_MESSAGE),sign=async()=>{const result=await provider.signMessage(bytes,'utf8');const sig=new Uint8Array(result.signature||result);if(epoch!==version||provider.publicKey?.toString()!==key.toBase58())throw new Error('Account changed while unlocking.');if(sig.length!==64||!nacl.sign.detached.verify(bytes,sig,key.toBytes()))throw new Error('Invalid wallet signature.');return sig;};
 message('Sign the protocol unlock message twice. Hushmark checks that your wallet can reproduce the same recovery key.');let first,second,journal;
 try{
  first=await sign();second=await sign();
  if(!nacl.verify(first,second))throw new Error('This wallet produces inconsistent signatures. Deposits are blocked to protect recoverability.');
  const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',first)).toString('hex'),fpKey='hushmark:privacy-fingerprint:'+key.toBase58();
  const saved=localStorage.getItem(fpKey);if(saved&&saved!==fingerprint)throw new Error('The unlock signature differs from the saved recovery fingerprint. Use the original wallet; do not deposit.');
  localStorage.setItem(fpKey,fingerprint);wasm=await sdk.WasmFactory.getInstance();
  let journalError='';
  try{journal=await createPrivateActivity({owner:key.toBase58(),signature:first,storage:localStorage});}catch{journalError=activityWarning;}
  if(epoch!==version)throw new Error('Session changed.');
  enc=new sdk.EncryptionService();enc.deriveEncryptionKeyFromSignature(first);owner=key;storage=scopedStorage(sessionStorage,key.toBase58());activity=journal||null;idle.start();
  $('owner').textContent=key.toBase58();$('unlock-state').textContent='UNLOCKED';activityView.unlock([],journalError);
 }catch(e){journal?.close();throw e;}finally{first?.fill(0);second?.fill(0);}
 await loadActivity(version);await publicRefresh();message('Unlocked. Sync private balances to scan existing notes, or deposit to the pool.');
}
function onAccount(){lock();}
async function publicRefresh(){guard();const version=epoch,key=owner;const sol=await connection.getBalance(key);const address=await getAssociatedTokenAddress(new PublicKey(ASSETS[1].mint),key),info=await connection.getAccountInfo(address);guard(version);publicBalances=[BigInt(sol),info?unpackAccount(address,info,TOKEN_PROGRAM_ID).amount:0n];render();}
async function scan(index){guard();const version=epoch;message('Scanning encrypted '+ASSETS[index].symbol+' notes. No balance is assumed before the scan finishes.');const params={connection,publicKey:owner,encryptionService:enc,storage,abortSignal:abort.signal};const result=index===0?await sdk.getUtxos(params):await sdk.getUtxosSPL({...params,mintAddress:ASSETS[index].mint});guard(version);notes[index]=result;render();return result;}
async function prepare(){
 guard();resetReview();const revision=formRevision,version=epoch;const index=Number($('asset').value),asset=ASSETS[index],type=$('operation').value,recipientInput=$('recipient').value.trim(),request=selectedRequest?validatePaymentRequest(selectedRequest):null;let gross=parseUnits($('amount').value,asset.decimals);if(request&&(type!=='withdraw'||request.asset!==asset.symbol||request.recipient!==recipientInput||request.amount!==formatUnits(gross,asset.decimals)))throw new Error('Request details changed. Apply the request again.');await network();guard(version);
 checkedNumber(gross);
 const config=await rawFetch(RELAYER+'/config',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Protocol fee service unavailable.');return r.json();});
 let recipient=null,fee=0n,net=gross;
 if(type==='withdraw'){
  try{recipient=new PublicKey(recipientInput).toBase58();if(!PublicKey.isOnCurve(new PublicKey(recipient).toBytes()))throw 0;}catch{throw new Error('Enter a valid recipient wallet address.');}
  if(recipient===owner.toBase58())throw new Error('Choose a different recipient wallet. Withdrawing back to the funding wallet defeats unlinkability.');
  if(request){const quote=quoteRequestedNet(gross,config.withdraw_fee_rate,index===0?config.withdraw_rent_fee:config.rent_fees?.usdc,asset.decimals);gross=quote.gross;}
  const available=await scan(index),largest=available.map(n=>BigInt(n.amount.toString())).sort((a,b)=>a>b?-1:a<b?1:0).slice(0,2).reduce((a,b)=>a+b,0n);
  if(gross>largest)throw new Error('Amount exceeds what two available notes can cover. Choose a smaller withdrawal; partial sends are blocked.');
  const rate=await sdk.getConfig('withdraw_fee_rate'),rent=index===0?await sdk.getConfig('withdraw_rent_fee'):(await sdk.getConfig('rent_fees')).usdc;
  if(rate!==config.withdraw_fee_rate||rent!==(index===0?config.withdraw_rent_fee:config.rent_fees.usdc))throw new Error('Protocol fees changed. Reload before reviewing.');
  ({fee,net}=withdrawalQuote(gross,rate,rent,asset.decimals));const min=config.minimum_withdrawal?.[asset.symbol.toLowerCase()];if(!Number.isFinite(min)||checkedNumber(gross)/10**asset.decimals<min)throw new Error('Amount is below the protocol withdrawal minimum.');
 }else{await publicRefresh();if(publicBalances[index]<gross)throw new Error('Insufficient public wallet balance.');if(publicBalances[0]<depositSolReserve(index)+(index===0?gross:0n))throw new Error(index===0?'Keep at least 0.000205 SOL in addition to the deposit for network fees.':'Keep at least 0.002 SOL in the public wallet for a USDC deposit, as required by the protocol SDK.');}
 guard(version);if(revision!==formRevision)throw new Error('Payment details changed during review. Review the current details again.');review={type,asset,index,gross,fee,net,recipient,version,created:Date.now(),feeConfig:config,request};
 $('review-action').textContent=type==='deposit'?'Deposit to private pool':'Withdraw from private pool';$('review-amount').textContent=formatUnits(gross,asset.decimals)+' '+asset.symbol;$('review-recipient').textContent=type==='deposit'?PROGRAM:recipient;$('review-fee').textContent=type==='deposit'?'Network fee shown in your wallet; maximum 0.000205 SOL':formatUnits(fee,asset.decimals)+' '+asset.symbol;$('review-net').textContent=formatUnits(net,asset.decimals)+' '+asset.symbol;$('payment-review').hidden=false;message('Review the amount and destination. Deposit/withdrawal amounts remain public onchain.');
}
async function signDeposit(tx,p){
 guard(p.version);const tables=await Promise.all(tx.message.addressTableLookups.map(async l=>{const result=await connection.getAddressLookupTable(l.accountKey);if(!result.value)throw new Error('Protocol lookup table unavailable.');return result.value;}));
 const decoded=TransactionMessage.decompile(tx.message,{addressLookupTableAccounts:tables});if(!decoded.payerKey.equals(owner)||tx.message.header.numRequiredSignatures!==1)throw new Error('Unexpected deposit signer.');
 const ix=decoded.instructions.filter(i=>i.programId.toBase58()===PROGRAM);if(ix.length!==1)throw new Error('Missing privacy protocol instruction.');
 for(const i of decoded.instructions)if(![PROGRAM,ComputeBudgetProgram.programId.toBase58(),ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()].includes(i.programId.toBase58()))throw new Error('Unexpected instruction in the deposit.');
 const data=Buffer.from(ix[0].data);if(data.length<504||data.readBigInt64LE(488)!==p.gross||data.readBigUInt64LE(496)!==0n)throw new Error('Deposit amount differs from the reviewed amount.');
 if(p.asset.mint&&!ix[0].keys.some(k=>k.pubkey.toBase58()===p.asset.mint))throw new Error('Deposit token mint mismatch.');
 const fee=await connection.getFeeForMessage(tx.message,'finalized');if(fee.value===null||fee.value>205000)throw new Error('Deposit network fee exceeds the reviewed maximum.');
 const simulation=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});if(simulation.value.err)throw new Error('Network preflight rejected the deposit. Nothing was submitted.');
 guard(p.version);message('Proof ready. Review and approve the deposit in your wallet.');const original=tx.message.serialize();const signed=await provider.signTransaction(VersionedTransaction.deserialize(tx.serialize()));guard(p.version);
 if(!Buffer.from(signed.message.serialize()).equals(Buffer.from(original))||!nacl.sign.detached.verify(original,signed.signatures[0],owner.toBytes()))throw new Error('Wallet changed the reviewed deposit.');
 p.signature=bs58.encode(signed.signatures[0]);p.signedBytes=Buffer.from(signed.serialize()).toString('base64');return signed;
}
function showTransaction(signature,state){if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature))throw new Error('Invalid transaction signature.');$('transaction').hidden=false;$('tx-link').href='https://explorer.solana.com/tx/'+signature;$('tx-link').textContent=signature;$('tx-state').textContent=state;$('check-status').dataset.signature=signature;}
async function checkStatus(){
 const p=lastPayment;if(!p?.signature)throw new Error('No transaction to check.');guard(p.version);
 const status=await verifyActivityStatus({...p.activityRecord,signature:p.signature,proofDigest:p.proofDigest},connection,()=>guard(p.version));
 await recordActivity(p,status);guard(p.version);showTransaction(p.signature,activityStatusLabel(status));
 message(status==='finalized'?'Transaction finalized on Solana. Sync private balances to read the updated notes.':'Network status: '+activityStatusLabel(status)+'. Do not repeat an uncertain payment.');
}
async function refreshActivity(id){
 guard();const version=epoch,journal=activity,record=activityRecords.find(r=>r.id===id);if(!journal||!record?.signature)throw new Error('No saved transaction to check.');
 const status=await verifyActivityStatus(record,connection,()=>guard(version));guard(version);
 try{const records=await journal.upsert({id,status,updatedAt:Math.max(Date.now(),record.createdAt)});guard(version);activityRecords=records;activityView.update(records);}catch(e){guard(version);activityView.warn(activityWarning);}
 if(lastPayment?.activityRecord?.id===id){lastPayment.activityRecord={...lastPayment.activityRecord,status};showTransaction(record.signature,activityStatusLabel(status));}
 message('Saved transaction status: '+activityStatusLabel(status)+'.'+(status==='finalized'?'':' Check balances before retrying an uncertain payment.'));
}
async function execute(){
 const p=review;if(!p)throw new Error('Review a payment first.');guard(p.version);if(p.request)validatePaymentRequest(p.request);if(Date.now()-p.created>120000){resetReview();throw new Error('Review expired. Review again.');}if(!$('acknowledge').checked)throw new Error('Acknowledge the privacy boundary before proceeding.');
 await network();const current=await rawFetch(RELAYER+'/config',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Protocol fee service unavailable.');return r.json();});guard(p.version);if(review!==p)throw new Error('Payment details changed. Review again.');if(p.request)validatePaymentRequest(p.request);if(p.type==='withdraw'&&!sameWithdrawalFees(current,p.feeConfig,p.index)){resetReview();throw new Error('Protocol fee or minimum changed. Review again.');}
 clearTransaction();operation=p;review=null;notes[p.index]=null;render();$('payment-review').hidden=true;message('Preparing encrypted notes and generating the payment proof…');
 p.activityStore=activity;const createdAt=Date.now();p.activityRecord={id:crypto.randomUUID(),type:p.type,asset:p.asset.symbol,amount:p.gross.toString(),netAmount:p.net.toString(),fee:p.fee.toString(),createdAt,updatedAt:createdAt,status:'preparing'};
 const params={connection,publicKey:owner,encryptionService:enc,storage,lightWasm:wasm,keyBasePath:'/privacy-circuit/transaction2'};
 try{
  await recordActivity(p,'preparing');guard(p.version);
  const result=p.type==='deposit'?(p.index===0?await sdk.deposit({...params,amount_in_lamports:checkedNumber(p.gross),transactionSigner:tx=>signDeposit(tx,p)}):await sdk.depositSPL({...params,mintAddress:new PublicKey(p.asset.mint),base_units:checkedNumber(p.gross),transactionSigner:tx=>signDeposit(tx,p)})):(p.index===0?await sdk.withdraw({...params,recipient:new PublicKey(p.recipient),amount_in_lamports:checkedNumber(p.gross)}):await sdk.withdrawSPL({...params,recipient:new PublicKey(p.recipient),mintAddress:p.asset.mint,base_units:checkedNumber(p.gross)}));
  guard(p.version);if(result.tx!==p.signature)throw new Error('Protocol returned an unexpected transaction signature.');lastPayment=p;showTransaction(result.tx,'Submitted');await checkStatus();
 }catch(e){
  guard(p.version);
  if(p.signature){await recordActivity(p,p.submitted?'unverified':'not-submitted');lastPayment=p;showTransaction(p.signature,p.submitted?'Settlement not yet verified':'Signed; not submitted by this interface');message('A signature exists. Check its status before trying again.');}
  else if(p.submitted){await recordActivity(p,'submission-unknown');message('Submission outcome is uncertain. Sync your private balance and verify onchain activity before retrying.');}
  else{await recordActivity(p,'not-submitted');throw e;}
 }
 finally{if(operation===p)operation=null;}
}
function action(id,fn){$(id).addEventListener('click',async()=>{if(busy)return;controls(true);try{await fn();}catch(e){fail(e);}finally{controls(false);}});}
action('unlock',unlock);action('sync',async()=>{guard();await publicRefresh();await scan(Number($('asset').value));message('Selected asset synced. Balance is calculated from decrypted, unspent notes.');});action('review-payment',prepare);action('confirm-payment',execute);action('check-status',checkStatus);
action('activity-clear-yes',async()=>{guard();const version=epoch,journal=activity;$('activity-clear-confirm').hidden=true;if(!journal){activityView.warn(activityWarning);return;}try{const records=await journal.clear();guard(version);activityRecords=records;activityView.update(records);clearTransaction();}catch(e){guard(version);activityView.warn('Local history could not be cleared. Your pool funds are unchanged.');}});
$('activity-list').addEventListener('click',async event=>{const button=event.target.closest('button[data-activity-refresh]');if(!button||busy)return;controls(true);try{await refreshActivity(button.dataset.activityRefresh);}catch(e){fail(e);}finally{controls(false);}});
window.addEventListener('storage',event=>{if(owner&&event.storageArea===localStorage&&event.key===privateActivityStorageKey(owner.toBase58()))void loadActivity();});
$('lock').addEventListener('click',lock);$('provider').addEventListener('change',lock);$('hide-balances').addEventListener('click',()=>{hidden=!hidden;render();});$('cancel-review').addEventListener('click',resetReview);
for(const id of ['amount','recipient','asset','operation'])$(id).addEventListener('input',()=>{detachRequest();resetReview();$('recipient-field').hidden=$('operation').value==='deposit';});
action('save-rpc',async()=>{const next=validRpc($('rpc').value.trim());const c=new Connection(next,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,opts)=>rawFetch(url,{...opts,signal:AbortSignal.timeout(20000)})});if(await c.getGenesisHash()!==GENESIS)throw new Error('RPC must connect to Solana mainnet.');lock();endpoint=next;connection=c;walletTools.resetServices();sessionStorage.setItem('hushmark-rpc',next);message('Mainnet RPC configured. Unlock your wallet again.');});
$('rpc').value=endpoint;activityView.lock();render();

walletTools=createWalletTools({
 getSession(){guard();if(busy)throw new Error('Wait for the current wallet action to finish.');if(!activity)throw new Error('Local history is unavailable in this browser.');return {journal:activity,version:epoch,owner:owner.toBase58(),update(records){activityRecords=records;activityView.update(records);}};},
 applyRequest(request){guard();if(busy)throw new Error('Wait for the current wallet action to finish.');resetReview();selectedRequest=request;$('operation').value='withdraw';$('asset').value=String(ASSETS.findIndex(a=>a.symbol===request.asset));$('amount').value=request.amount;$('recipient').value=request.recipient;$('recipient-field').hidden=false;document.querySelector('label[for="amount"]').textContent='Recipient amount requested';},
 getRpc:()=>endpoint,fetch:rawFetch,
});
try{const saved=Number(localStorage.getItem('hushmark:auto-lock-minutes'));if([5,15,30].includes(saved))idle.setMinutes(saved);}catch{}
$('auto-lock-minutes').value=String(idle.getMinutes());
$('auto-lock-minutes').addEventListener('change',()=>{idle.setMinutes(Number($('auto-lock-minutes').value));try{localStorage.setItem('hushmark:auto-lock-minutes',String(idle.getMinutes()));}catch{}});
for(const event of ['pointerdown','keydown','input','wheel'])document.addEventListener(event,e=>{if(e.isTrusted)idle.touch();},{capture:true,passive:true});
for(const event of ['focus','pageshow'])window.addEventListener(event,()=>idle.check());
document.addEventListener('visibilitychange',()=>idle.check());
window.addEventListener('pagehide',lock);
