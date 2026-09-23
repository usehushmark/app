import {Connection,PublicKey,Transaction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {getMint,getAssociatedTokenAddress,unpackAccount,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import bs58 from 'bs58';
import QRCode from 'qrcode';
import {ASSETS,DEFAULT_RPC,GENESIS} from './config.js';
import {parseUnits,formatUnits,statusLabel,validRpc} from './core.js';
const $=id=>document.getElementById(id);
let endpoint=DEFAULT_RPC;
try{endpoint=validRpc(sessionStorage.getItem('hushmark-rpc')||DEFAULT_RPC);}catch{}
let connection,provider,owner=null,epoch=0,busy=false,prepared=null,hidden=false,balances=null,history=[],pending=new Map();
const short=s=>s.slice(0,7)+'…'+s.slice(-7);
const explorer=s=>'https://explorer.solana.com/tx/'+encodeURIComponent(s);
function message(s){$('wallet-status').textContent=s;}
function error(e){return e?.code===4001?'Request declined in your wallet. No new transaction was submitted.':String(e?.message||'Request failed.').replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,350);}
function setBusy(value){busy=value;for(const id of ['connect','refresh','review-send','confirm-send','save-rpc','disconnect'])$(id).disabled=value;}
function clearReview(){prepared=null;$('review').hidden=true;$('send-form').hidden=false;}
function assertOwner(address,version){if(!owner||owner.toBase58()!==address||version!==epoch)throw new Error('Wallet or connection changed. Review the payment again.');}
function createConnection(){connection=new Connection(endpoint,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(20000)})});}
async function verifyNetwork(){if(await connection.getGenesisHash()!==GENESIS)throw new Error('This RPC is not Solana mainnet. Connection refused.');}
function renderBalance(){ASSETS.forEach((a,i)=>{$('balance-'+i).textContent=hidden?'••••••':balances?formatUnits(balances[i],a.decimals):'—';});$('toggle-balance').textContent=hidden?'Show balances':'Hide balances';$('toggle-balance').setAttribute('aria-pressed',String(hidden));}
function resetConnection(){epoch++;owner=null;balances=null;history=[];pending.clear();clearReview();$('synced').textContent='Balances load after connection.';$('address').textContent='Connect your wallet';$('receive-address').textContent='Connect a wallet to receive assets.';$('qr').hidden=true;$('disconnect').hidden=true;$('connect').hidden=false;renderBalance();renderHistory();}
function renderHistory(){
 const records=new Map(history.map(r=>[r.signature,r]));for(const [signature,r] of pending)records.set(signature,{...records.get(signature),...r,signature});
 const list=$('activity');list.replaceChildren();const picker=$('report-record'),selected=picker.value;picker.replaceChildren();
 for(const r of [...records.values()].slice(0,30)){
  const row=document.createElement('article');row.className='activity-row';const info=document.createElement('div');const a=document.createElement('a');a.href=explorer(r.signature);a.target='_blank';a.rel='noopener noreferrer';a.textContent=short(r.signature);const label=document.createElement('span');label.textContent=(r.label||statusLabel(r))+(r.blockTime?' · '+new Date(r.blockTime*1000).toLocaleString():'');info.append(a,label);row.append(info);list.append(row);
  if(!r.err&&(r.label||statusLabel(r))==='Finalized'){const option=document.createElement('option');option.value=r.signature;option.textContent=short(r.signature);picker.append(option);}
 }
 if(!list.childNodes.length)list.textContent=owner?'No transactions loaded. Refresh to read recent activity.':'Connect a wallet to load activity.';
 if([...picker.options].some(o=>o.value===selected))picker.value=selected;
 $('export-report').disabled=!picker.value;
}
async function tokenAccounts(key,mint){
 const mintKey=new PublicKey(mint),address=await getAssociatedTokenAddress(mintKey,key),info=await connection.getAccountInfo(address,'finalized');if(!info)return [];
 const account=unpackAccount(address,info,TOKEN_PROGRAM_ID);if(!account.mint.equals(mintKey)||!account.owner.equals(key))throw new Error('Token account does not match this wallet and mint.');
 return [{address,state:account.isFrozen?'frozen':account.isInitialized?'initialized':'uninitialized',tokenAmount:{amount:account.amount.toString()}}];
}
async function refresh(){
 if(!owner)throw new Error('Connect a wallet first.');const key=owner,address=key.toBase58(),version=epoch;await verifyNetwork();
 const sol=await connection.getBalance(key,'finalized');if(!Number.isSafeInteger(sol))throw new Error('Balance exceeds safe RPC numeric precision.');
 const tokens=await Promise.all(ASSETS.slice(1).map(a=>tokenAccounts(key,a.mint)));assertOwner(address,version);
 balances=[BigInt(sol),...tokens.map(accounts=>accounts.reduce((n,a)=>n+BigInt(a.tokenAmount.amount),0n))];renderBalance();$('synced').textContent='Read from mainnet · '+new Date().toLocaleTimeString();
 // Include associated token account activity, where incoming SPL transfers are indexed.
 const keys=[key,...tokens.flat().map(a=>a.address)];const results=await Promise.allSettled(keys.map(k=>connection.getSignaturesForAddress(k,{limit:20},'finalized')));assertOwner(address,version);
 const unique=new Map();for(const result of results)if(result.status==='fulfilled')for(const row of result.value)unique.set(row.signature,row);
 history=[...unique.values()].sort((a,b)=>b.slot-a.slot);renderHistory();
 if(results.some(r=>r.status==='rejected'))message('Balances updated. Some transaction history could not be loaded; refresh to retry.');
}
async function connect(){
 if(provider){provider.removeListener?.('accountChanged',accountChanged);provider.removeListener?.('disconnect',disconnected);}
 const choice=$('wallet-provider').value;provider=choice==='phantom'?(window.phantom?.solana|| (window.solana?.isPhantom?window.solana:null)):window.solflare;
 if(!provider?.connect||!provider.signTransaction)throw new Error('Open this site in the selected wallet’s browser, or install its browser extension. Never enter a seed phrase here.');
 await verifyNetwork();await provider.connect();if(!provider.publicKey)throw new Error('The wallet did not provide an account.');
 resetConnection();owner=new PublicKey(provider.publicKey.toString());provider.on?.('accountChanged',accountChanged);provider.on?.('disconnect',disconnected);
 $('address').textContent=owner.toBase58();$('receive-address').textContent=owner.toBase58();$('disconnect').hidden=false;$('connect').hidden=true;
 await QRCode.toCanvas($('qr'),'solana:'+owner.toBase58(),{width:210,margin:3});$('qr').hidden=false;
 await refresh();message('Wallet connected to Solana mainnet. Keys remain in your wallet.');
}
function accountChanged(){resetConnection();message('Wallet account changed. Connect again to load this account.');}
function disconnected(){resetConnection();message('Wallet disconnected.');}
async function review(){
 if(!owner)throw new Error('Connect a wallet first.');const key=owner,address=key.toBase58(),version=epoch,asset=ASSETS[Number($('asset').value)];
 const amount=parseUnits($('amount').value,asset.decimals);let recipient;try{recipient=new PublicKey($('recipient').value.trim());}catch{throw new Error('Enter a valid Solana wallet address.');}
 if(!PublicKey.isOnCurve(recipient.toBytes()))throw new Error('Use a standard wallet address, not a program or token account.');
 if(recipient.equals(key))throw new Error('Choose a recipient different from your connected wallet.');
 await verifyNetwork();const recipientInfo=await connection.getAccountInfo(recipient,'finalized');
 if(recipientInfo&&(recipientInfo.executable||!recipientInfo.owner.equals(SystemProgram.programId)||recipientInfo.data.length))throw new Error('Recipient must be a standard Solana wallet address.');
 const latest=await connection.getLatestBlockhash('finalized');const tx=new Transaction({feePayer:key,...latest});let rent=0;
 tx.add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}));
 if(!asset.mint){tx.add(SystemProgram.transfer({fromPubkey:key,toPubkey:recipient,lamports:amount}));}
 else{
  const mint=new PublicKey(asset.mint),mintInfo=await getMint(connection,mint,'finalized',TOKEN_PROGRAM_ID);
  if(mintInfo.decimals!==asset.decimals||!mintInfo.isInitialized)throw new Error('Token configuration does not match its onchain mint.');
  const accounts=(await tokenAccounts(key,asset.mint)).filter(a=>a.state==='initialized'&&BigInt(a.tokenAmount.amount)>0n);
  if(accounts.reduce((n,a)=>n+BigInt(a.tokenAmount.amount),0n)<amount)throw new Error('Insufficient spendable '+asset.symbol+' balance.');
  const destination=await getAssociatedTokenAddress(mint,recipient);const existing=await connection.getAccountInfo(destination,'finalized');
  if(!existing)rent=await connection.getMinimumBalanceForRentExemption(165,'finalized');
  tx.add(createAssociatedTokenAccountIdempotentInstruction(key,destination,recipient,mint));
  let remaining=amount;for(const source of accounts){if(!remaining)break;const take=BigInt(source.tokenAmount.amount)<remaining?BigInt(source.tokenAmount.amount):remaining;tx.add(createTransferCheckedInstruction(source.address,mint,destination,key,take,asset.decimals));remaining-=take;}
 }
 const {value:fee}=await connection.getFeeForMessage(tx.compileMessage(),'finalized');if(fee===null)throw new Error('Fee unavailable. Review again.');
 const available=await connection.getBalance(key,'finalized');if(!Number.isSafeInteger(available))throw new Error('Unsupported balance precision.');
 if(BigInt(available)<BigInt(fee+rent)+(asset.mint?0n:amount))throw new Error('Insufficient SOL for the amount, network fee and any recipient token-account rent.');
 const simulation=await connection.simulateTransaction(tx);if(simulation.value.err)throw new Error('Network preflight rejected this payment. Check the balance and recipient, then retry.');
 assertOwner(address,version);prepared={tx,asset,amount,recipient:recipient.toBase58(),address,version,...latest,created:Date.now()};
 $('review-to').textContent=prepared.recipient;$('review-from').textContent=address;$('review-amount').textContent=formatUnits(amount,asset.decimals)+' '+asset.symbol;$('review-fee').textContent=formatUnits(BigInt(fee),9)+' SOL';$('review-rent').textContent=formatUnits(BigInt(rent),9)+' SOL';
 $('send-form').hidden=true;$('review').hidden=false;message('Review the full recipient address. This is a public mainnet transfer.');
}
async function send(){
 const p=prepared;if(!p)throw new Error('Review a payment first.');assertOwner(p.address,p.version);
 if(Date.now()-p.created>45000||await connection.getBlockHeight('finalized')>p.lastValidBlockHeight){clearReview();throw new Error('The payment review expired. Review again for a fresh fee and blockhash.');}
 await verifyNetwork();assertOwner(p.address,p.version);const expected=p.tx.serializeMessage();
 message('Approve or reject the exact transaction in your wallet.');const unsigned=Transaction.from(p.tx.serialize({requireAllSignatures:false,verifySignatures:false}));const signed=await provider.signTransaction(unsigned);assertOwner(p.address,p.version);
 if(!Buffer.from(signed.serializeMessage()).equals(Buffer.from(expected))||!signed.verifySignatures())throw new Error('The signed transaction differs from the reviewed payment or has an invalid signature. Nothing was submitted.');
 const bytes=signed.serialize(),signature=bs58.encode(signed.signature);prepared=null;pending.set(signature,{label:'Submitting'});renderHistory();
 try{const returned=await connection.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'});if(returned!==signature)throw new Error('RPC signature mismatch.');}
 catch{pending.set(signature,{label:'Submission uncertain'});message('Submission could not be confirmed. Check the transaction link before retrying to avoid a duplicate payment.');renderHistory();clearReview();return;}
 pending.set(signature,{label:'Submitted'});renderHistory();clearReview();$('send-form').reset();message('Submitted to the network. Waiting for finality; this is not yet a completed payment.');
 await poll(signature,p.address,p.version,p.lastValidBlockHeight);
}
async function poll(signature,address,version,lastValidBlockHeight){
 for(let attempt=0;attempt<20;attempt++){
  if(!owner||version!==epoch||owner.toBase58()!==address)return;
  try{
   const {value:[status]}=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});assertOwner(address,version);
   const label=statusLabel(status);pending.set(signature,{label,err:status?.err});renderHistory();
   if(status?.err){message('The network rejected this transaction. Network fees may still apply.');await refresh();return;}
   if(label==='Finalized'){message('Transaction finalized on Solana mainnet.');await refresh();return;}
   if(!status&&await connection.getBlockHeight('finalized')>lastValidBlockHeight){message('The transaction is not found and its blockhash has expired. Check the explorer before retrying.');return;}
  }catch{message('Status lookup interrupted. Use Refresh or the transaction link to check settlement.');return;}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 message('Finality has not been verified yet. Refresh activity or check the transaction link before retrying.');
}
async function refreshPending(){if(!owner)return;const address=owner.toBase58(),version=epoch;for(const signature of pending.keys()){const {value:[status]}=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});assertOwner(address,version);pending.set(signature,{label:statusLabel(status),err:status?.err});}renderHistory();}
async function exportReport(){
 if(!owner)throw new Error('Connect your wallet.');const signature=$('report-record').value;if(!signature)throw new Error('Select a finalized transaction.');const address=owner.toBase58(),version=epoch;
 const tx=await connection.getParsedTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});assertOwner(address,version);
 if(!tx||!tx.meta||tx.meta.err)throw new Error('A successful finalized transaction could not be verified.');
 const report={network:'solana-mainnet',signature,explorer:explorer(signature),fetchedAt:new Date().toISOString(),transaction:tx};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hushmark-'+signature.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Downloaded finalized onchain data. This report contains publicly visible transaction information.');
}
function action(id,fn){$(id).addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await fn();}catch(e){message(error(e));}finally{setBusy(false);}});}
action('connect',connect);action('disconnect',async()=>{await provider?.disconnect();resetConnection();});
action('refresh',async()=>{message('Reading mainnet…');await refresh();await refreshPending();});
action('confirm-send',send);action('export-report',exportReport);
$('send-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;clearReview();setBusy(true);message('Checking balance, address and network fee…');try{await review();}catch(e){message(error(e));}finally{setBusy(false);}});
$('edit-send').addEventListener('click',()=>{if(!busy)clearReview();});
$('toggle-balance').addEventListener('click',()=>{hidden=!hidden;renderBalance();});
action('copy-address',async()=>{if(!owner)throw new Error('Connect a wallet first.');await navigator.clipboard.writeText(owner.toBase58());message('Solana wallet address copied.');});
action('save-rpc',async()=>{const next=validRpc($('rpc-url').value.trim()),previous=endpoint;endpoint=next;createConnection();try{await verifyNetwork();}catch(e){endpoint=previous;createConnection();throw e;}try{sessionStorage.setItem('hushmark-rpc',endpoint);}catch{}clearReview();epoch++;message('Mainnet RPC verified.');if(owner)await refresh();});
for(const name of ['send','receive','report'])$('tab-'+name).addEventListener('click',()=>tab(name));
function tab(name){for(const n of ['send','receive','report']){$('tab-'+n).setAttribute('aria-selected',String(n===name));$('tab-'+n).tabIndex=n===name?0:-1;$('panel-'+n).hidden=n!==name;}}
document.querySelector('.wallet-tabs').addEventListener('keydown',e=>{const names=['send','receive','report'],index=names.indexOf(document.activeElement.id.replace('tab-',''));let n;if(e.key==='ArrowRight')n=(index+1)%3;if(e.key==='ArrowLeft')n=(index+2)%3;if(e.key==='Home')n=0;if(e.key==='End')n=2;if(n!==undefined){e.preventDefault();tab(names[n]);$('tab-'+names[n]).focus();}});
for(const [i,a] of ASSETS.entries()){const option=document.createElement('option');option.value=i;option.textContent=a.symbol;$('asset').append(option);}
$('rpc-url').value=endpoint;createConnection();renderBalance();renderHistory();
