import {Connection,PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddress,unpackAccount,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as sdk from './privacy-sdk.js';
import {ASSETS,DEFAULT_RPC,GENESIS} from './config.js';
import {parseUnits,formatUnits,statusLabel,validRpc} from './core.js';
import {PROGRAM,RELAYER,SIGN_MESSAGE,checkedNumber,withdrawalQuote,validateWithdrawal,scopedStorage,depositSolReserve,sameWithdrawalFees} from './privacy-guards.js';
import {createPrivateActivity} from './private-activity.js';
import {digestProof,verifyActivityStatus} from './activity-status.js';
import {createActivityView} from './activity-view.js';
const $=id=>document.getElementById(id),rawFetch=globalThis.fetch.bind(globalThis);
let owner=null,provider=null,enc=null,wasm=null,storage=null,notes=[null,null],publicBalances=[null,null],epoch=0,busy=false,review=null,operation=null,abort=new AbortController(),hidden=false;
let formRevision=0,lastWithdrawal=null,activity=null,activityRecords=[];
const activityView=createActivityView();
let endpoint=DEFAULT_RPC;try{endpoint=validRpc(sessionStorage.getItem('hushmark-rpc')||DEFAULT_RPC);}catch{}
let connection=new Connection(endpoint,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,opts)=>rawFetch(url,{...opts,signal:AbortSignal.timeout(20000)})});
function message(s){$('privacy-status').textContent=s;}
function fail(e){message(e?.code===4001?'Request declined.':String(e?.message||'Operation failed.').replace(/https?:\/\/\S+/g,'[service]').slice(0,350));}
function guard(version=epoch){if(!owner||!enc||version!==epoch||abort.signal.aborted)throw new Error('Privacy session locked or account changed. Unlock again.');}
function controls(value){busy=value;document.querySelectorAll('[data-action]').forEach(el=>el.disabled=value);$('lock').disabled=false;}
function resetReview(){formRevision++;review=null;$('acknowledge').checked=false;$('payment-review').hidden=true;}
function lock(){activity?.close();activity=null;activityRecords=[];activityView.lock();provider?.removeListener?.('accountChanged',onAccount);provider?.removeListener?.('disconnect',onAccount);epoch++;abort.abort();abort=new AbortController();enc?.resetEncryptionKey();enc=null;owner=null;storage=null;notes=[null,null];publicBalances=[null,null];resetReview();$('owner').textContent='Wallet not connected';$('unlock-state').textContent='LOCKED';render();message('Privacy session locked. Keys have been discarded from memory.');}
async function persistActivity(record){if(!activity)return;try{activityRecords=await activity.upsert(record);activityView.update(activityRecords);}catch{activityView.warn('Local activity could not be saved. Wallet operations remain available.');}}
function render(){ASSETS.forEach((a,i)=>{$('public-'+i).textContent=publicBalances[i]===null?'—':formatUnits(publicBalances[i],a.decimals);$('private-'+i).textContent=hidden?'••••••':notes[i]===null?'—':formatUnits(notes[i].reduce((n,u)=>n+BigInt(u.amount.toString()),0n),a.decimals);});$('hide-balances').textContent=hidden?'Show private balances':'Hide private balances';}
async function network(){if(await connection.getGenesisHash()!==GENESIS)throw new Error('The selected RPC is not Solana mainnet.');const program=await connection.getAccountInfo(new PublicKey(PROGRAM));if(!program?.executable)throw new Error('Privacy program unavailable on this network.');}
sdk.setLogger((level,text)=>{if(level==='info'&&busy){if(/proof/i.test(text))message('Generating your zero-knowledge proof on this device…');else if(/decrypt/i.test(text))message('Scanning and decrypting encrypted notes locally. First sync can take several minutes…');}});
// Gate all SDK relay submissions against the exact user-approved operation.
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
 const mutation=url.origin===RELAYER&&init?.method==='POST'&&/^\/(deposit|withdraw)(\/|$)/.test(url.pathname);
 if(mutation){guard(operation?.version);if(!operation||operation.submitted)throw new Error('No unsubmitted payment approval.');const body=JSON.parse(init.body);
  if(url.pathname.startsWith('/withdraw')){if(operation.type!=='withdraw')throw new Error('Unexpected withdrawal.');validateWithdrawal(body,operation);operation.proofBytes=body.serializedProof;operation.proofDigest=await digestProof(Uint8Array.from(Buffer.from(body.serializedProof,'base64')));}
  else{if(operation.type!=='deposit'||body.signedTransaction!==operation.signedBytes)throw new Error('Unexpected deposit payload.');}
  operation.submitted=true;message('Submitting the reviewed proof to Privacy Cash…');
 }
 const submittedOperation=mutation?operation:null;
 const signals=[AbortSignal.timeout(60000)];if(init?.signal)signals.push(init.signal);if(url.origin===RELAYER)signals.push(abort.signal);
 const response=await rawFetch(input,{...init,signal:AbortSignal.any(signals)});
 if(mutation){const result=await response.clone().json().catch(()=>null);if(result?.signature){if(submittedOperation.type==='deposit'&&result.signature!==submittedOperation.signature)throw new Error('Relayer returned a different transaction signature.');submittedOperation.signature=result.signature;if(submittedOperation.type==='withdraw')lastWithdrawal={signature:result.signature,proofBytes:submittedOperation.proofBytes};await persistActivity({...{id:submittedOperation.activityId,signature:result.signature,status:'submitted',updatedAt:Date.now()},...(submittedOperation.proofDigest?{proofDigest:submittedOperation.proofDigest}:{})});showTransaction(result.signature,'Submitted; awaiting network verification');}}
 return response;
};
async function unlock(){
 if(!$('software-wallet').checked)throw new Error('Confirm that this is a software wallet. Hardware-wallet recovery is not supported by this protocol SDK.');
 const selected=$('provider').value;provider=selected==='phantom'?(window.phantom?.solana||(window.solana?.isPhantom?window.solana:null)):window.solflare;
 if(!provider?.signMessage||!provider?.signTransaction)throw new Error('Open this site in Phantom or Solflare’s wallet browser, or install its extension.');
 await network();await provider.connect();lock();const version=epoch,key=new PublicKey(provider.publicKey.toString());
 provider.removeListener?.('accountChanged',onAccount);provider.removeListener?.('disconnect',onAccount);provider.on?.('accountChanged',onAccount);provider.on?.('disconnect',onAccount);
 const bytes=new TextEncoder().encode(SIGN_MESSAGE),sign=async()=>{const result=await provider.signMessage(bytes,'utf8');const sig=new Uint8Array(result.signature||result);if(epoch!==version||provider.publicKey?.toString()!==key.toBase58())throw new Error('Account changed while unlocking.');if(sig.length!==64||!nacl.sign.detached.verify(bytes,sig,key.toBytes()))throw new Error('Invalid wallet signature.');return sig;};
 message('Sign the protocol unlock message twice. Hushmark checks that your wallet can reproduce the same recovery key.');const first=await sign(),second=await sign();
 if(!nacl.verify(first,second))throw new Error('This wallet produces inconsistent signatures. Deposits are blocked to protect recoverability.');
 const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',first)).toString('hex'),fpKey='hushmark:privacy-fingerprint:'+key.toBase58();
 const saved=localStorage.getItem(fpKey);if(saved&&saved!==fingerprint)throw new Error('The unlock signature differs from the saved recovery fingerprint. Use the original wallet; do not deposit.');
 localStorage.setItem(fpKey,fingerprint);let activityWarning='';try{activity=await createPrivateActivity({owner:key.toBase58(),signature:first,storage:localStorage});activityRecords=await activity.read();}catch{activity=null;activityRecords=[];activityWarning='Local activity could not be opened. Wallet operations remain available.';}wasm=await sdk.WasmFactory.getInstance();if(epoch!==version)throw new Error('Session changed.');enc=new sdk.EncryptionService();enc.deriveEncryptionKeyFromSignature(first);first.fill(0);second.fill(0);owner=key;storage=scopedStorage(sessionStorage,key.toBase58());$('owner').textContent=key.toBase58();$('unlock-state').textContent='UNLOCKED';activityView.unlock(activityRecords,activityWarning);await publicRefresh();message('Unlocked. Sync private balances to scan existing notes, or deposit to the pool.');
}
function onAccount(){lock();}
async function publicRefresh(){guard();const version=epoch,key=owner;const sol=await connection.getBalance(key);const address=await getAssociatedTokenAddress(new PublicKey(ASSETS[1].mint),key),info=await connection.getAccountInfo(address);guard(version);publicBalances=[BigInt(sol),info?unpackAccount(address,info,TOKEN_PROGRAM_ID).amount:0n];render();}
async function scan(index){guard();const version=epoch;message('Scanning encrypted '+ASSETS[index].symbol+' notes. No balance is assumed before the scan finishes.');const params={connection,publicKey:owner,encryptionService:enc,storage,abortSignal:abort.signal};const result=index===0?await sdk.getUtxos(params):await sdk.getUtxosSPL({...params,mintAddress:ASSETS[index].mint});guard(version);notes[index]=result;render();return result;}
async function prepare(){
 guard();resetReview();const revision=formRevision,version=epoch;const index=Number($('asset').value),asset=ASSETS[index],gross=parseUnits($('amount').value,asset.decimals),type=$('operation').value,recipientInput=$('recipient').value.trim();await network();guard(version);
 checkedNumber(gross);
 const config=await rawFetch(RELAYER+'/config',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Protocol fee service unavailable.');return r.json();});
 let recipient=null,fee=0n,net=gross;
 if(type==='withdraw'){
  try{recipient=new PublicKey(recipientInput).toBase58();if(!PublicKey.isOnCurve(new PublicKey(recipient).toBytes()))throw 0;}catch{throw new Error('Enter a valid recipient wallet address.');}
  if(recipient===owner.toBase58())throw new Error('Choose a different recipient wallet. Withdrawing back to the funding wallet defeats unlinkability.');
  const available=await scan(index),largest=available.map(n=>BigInt(n.amount.toString())).sort((a,b)=>a>b?-1:a<b?1:0).slice(0,2).reduce((a,b)=>a+b,0n);
  if(gross>largest)throw new Error('Amount exceeds what two available notes can cover. Choose a smaller withdrawal; partial sends are blocked.');
  const rate=await sdk.getConfig('withdraw_fee_rate'),rent=index===0?await sdk.getConfig('withdraw_rent_fee'):(await sdk.getConfig('rent_fees')).usdc;
  if(rate!==config.withdraw_fee_rate||rent!==(index===0?config.withdraw_rent_fee:config.rent_fees.usdc))throw new Error('Protocol fees changed. Reload before reviewing.');
  ({fee,net}=withdrawalQuote(gross,rate,rent,asset.decimals));const min=config.minimum_withdrawal?.[asset.symbol.toLowerCase()];if(!Number.isFinite(min)||checkedNumber(gross)/10**asset.decimals<min)throw new Error('Amount is below the protocol withdrawal minimum.');
 }else{await publicRefresh();if(publicBalances[index]<gross)throw new Error('Insufficient public wallet balance.');if(publicBalances[0]<depositSolReserve(index)+(index===0?gross:0n))throw new Error(index===0?'Keep at least 0.000205 SOL in addition to the deposit for network fees.':'Keep at least 0.002 SOL in the public wallet for a USDC deposit, as required by the protocol SDK.');}
 guard(version);if(revision!==formRevision)throw new Error('Payment details changed during review. Review the current details again.');review={type,asset,index,gross,fee,net,recipient,version,created:Date.now(),feeConfig:config};
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
async function checkStatus(){const signature=$('check-status').dataset.signature;if(!signature)throw new Error('No transaction to check.');const {value:[status]}=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});if(status?.confirmationStatus==='finalized'&&!status.err&&lastWithdrawal?.signature===signature){$('tx-state').textContent='Verifying withdrawal transaction details';const tx=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!tx||tx.meta?.err)throw new Error('Withdrawal transaction details are not yet verified. Check finality again.');const keys=tx.transaction.message.getAccountKeys({accountKeysFromLookups:tx.meta?.loadedAddresses});const matches=tx.transaction.message.compiledInstructions.some(ix=>keys.get(ix.programIdIndex)?.toBase58()===PROGRAM&&Buffer.from(ix.data).toString('base64')===lastWithdrawal.proofBytes);if(!matches){$('tx-state').textContent='Proof mismatch — withdrawal not verified';throw new Error('The returned transaction does not contain the approved withdrawal proof. Do not treat it as a completed withdrawal.');}}$('tx-state').textContent=statusLabel(status);message(status?.confirmationStatus==='finalized'&&!status.err?'Transaction finalized on Solana. Sync private balances to read the updated notes.':'Network status: '+statusLabel(status)+'. Do not repeat an uncertain payment.');}
async function execute(){
 const p=review;if(!p)throw new Error('Review a payment first.');guard(p.version);if(Date.now()-p.created>120000){resetReview();throw new Error('Review expired. Review again.');}if(!$('acknowledge').checked)throw new Error('Acknowledge the privacy boundary before proceeding.');
 await network();const current=await rawFetch(RELAYER+'/config',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Protocol fee service unavailable.');return r.json();});guard(p.version);if(review!==p)throw new Error('Payment details changed. Review again.');if(p.type==='withdraw'&&!sameWithdrawalFees(current,p.feeConfig,p.index)){resetReview();throw new Error('Protocol fee or minimum changed. Review again.');}
 operation=p;p.activityId=crypto.randomUUID();const activityEntry={id:p.activityId,type:p.type,asset:p.asset.symbol,amount:p.gross.toString(),createdAt:Date.now(),updatedAt:Date.now(),status:'preparing'};if(p.type==='withdraw'){activityEntry.netAmount=p.net.toString();activityEntry.fee=p.fee.toString();}await persistActivity(activityEntry);review=null;notes[p.index]=null;render();$('payment-review').hidden=true;message('Preparing encrypted notes and generating the payment proof…');
 const params={connection,publicKey:owner,encryptionService:enc,storage,lightWasm:wasm,keyBasePath:'/privacy-circuit/transaction2'};
 try{
  const result=p.type==='deposit'?(p.index===0?await sdk.deposit({...params,amount_in_lamports:checkedNumber(p.gross),transactionSigner:tx=>signDeposit(tx,p)}):await sdk.depositSPL({...params,mintAddress:new PublicKey(p.asset.mint),base_units:checkedNumber(p.gross),transactionSigner:tx=>signDeposit(tx,p)})):(p.index===0?await sdk.withdraw({...params,recipient:new PublicKey(p.recipient),amount_in_lamports:checkedNumber(p.gross)}):await sdk.withdrawSPL({...params,recipient:new PublicKey(p.recipient),mintAddress:p.asset.mint,base_units:checkedNumber(p.gross)}));
  showTransaction(result.tx,'Submitted');await checkStatus();
 }catch(e){if(p.signature){showTransaction(p.signature,'Settlement not yet verified');message('A signature exists. Check its status before trying again.');}else if(p.submitted)message('Submission outcome is uncertain. Sync your private balance and verify onchain activity before retrying.');else throw e;}
 finally{operation=null;}
}
function action(id,fn){$(id).addEventListener('click',async()=>{if(busy)return;controls(true);try{await fn();}catch(e){fail(e);}finally{controls(false);}});}
action('unlock',unlock);action('sync',async()=>{guard();await publicRefresh();await scan(Number($('asset').value));message('Selected asset synced. Balance is calculated from decrypted, unspent notes.');});action('review-payment',prepare);action('confirm-payment',execute);action('check-status',checkStatus);
$('activity-clear-yes').addEventListener('click',async()=>{if(!activity)return;activityRecords=await activity.clear();activityView.update(activityRecords);$('activity-clear-confirm').hidden=true;});$('activity-list').addEventListener('click',async event=>{const id=event.target.closest('[data-activity-refresh]')?.dataset.activityRefresh;const record=activityRecords.find(item=>item.id===id);if(!record||!activity||busy)return;controls(true);try{await persistActivity({id,status:await verifyActivityStatus(record,connection,guard),updatedAt:Date.now()});}catch(error){fail(error);}finally{controls(false);}});$('lock').addEventListener('click',lock);$('provider').addEventListener('change',lock);$('hide-balances').addEventListener('click',()=>{hidden=!hidden;render();});$('cancel-review').addEventListener('click',resetReview);
for(const id of ['amount','recipient','asset','operation'])$(id).addEventListener('input',()=>{resetReview();$('recipient-field').hidden=$('operation').value==='deposit';});
action('save-rpc',async()=>{const next=validRpc($('rpc').value.trim());const c=new Connection(next,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,opts)=>rawFetch(url,{...opts,signal:AbortSignal.timeout(20000)})});if(await c.getGenesisHash()!==GENESIS)throw new Error('RPC must connect to Solana mainnet.');lock();endpoint=next;connection=c;sessionStorage.setItem('hushmark-rpc',next);message('Mainnet RPC configured. Unlock your wallet again.');});
$('rpc').value=endpoint;render();
