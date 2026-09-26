import QRCode from 'qrcode';
import {ACTIVITY_MAX_BACKUP_BYTES} from './private-activity.js';
import {createPaymentRequestLink,parsePaymentRequest,validatePaymentRequest} from './payment-request.js';
import {checkServices} from './service-status.js';

const $=id=>document.getElementById(id);
const say=(id,e)=>{$(id).textContent=String(e?.message||e).slice(0,250);};
function download(href,name){const a=document.createElement('a');a.href=href;a.download=name;a.click();}

export function createWalletTools({getSession,applyRequest,getRpc,fetch}) {
  let pending=null,generation=0,serviceGeneration=0,serviceAbort=null,incoming=null;
  function clearBackup(){pending=null;$('backup-review').hidden=true;$('backup-review-details').textContent='';$('activity-import-file').value='';}
  function clearRequest(){generation++;$('request-result').hidden=true;$('request-link').value='';$('request-qr').removeAttribute('src');}
  async function backupAction(fn){
    try{const session=getSession();await fn(session);}catch(e){say('backup-state',e);}
  }
  function same(session){const current=getSession();if(current.journal!==session.journal||current.version!==session.version)throw new Error('Session changed. Unlock and try again.');return current;}
  $('activity-export').addEventListener('click',()=>backupAction(async s=>{
    const text=await s.journal.exportBackup();same(s);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));download(url,'Hushmark-encrypted-history.json');setTimeout(()=>URL.revokeObjectURL(url),1000);
    say('backup-state','Encrypted history downloaded. Keep your original wallet for recovery.');
  }));
  $('activity-import').addEventListener('click',()=>{try{getSession();clearBackup();$('activity-import-file').click();}catch(e){say('backup-state',e);}});
  $('activity-import-file').addEventListener('change',()=>backupAction(async s=>{
    const file=$('activity-import-file').files[0];if(!file)return;
    if(file.size>ACTIVITY_MAX_BACKUP_BYTES)throw new Error('Backup file is too large.');
    const text=await file.text();same(s);const result=await s.journal.inspectBackup(text);same(s);
    pending={text,session:s};$('backup-review-details').textContent=`${result.count} records: ${result.added} new, ${result.duplicates} already saved. ${result.retained} will be kept; ${result.dropped} older records will be dropped.`;
    $('backup-review').hidden=false;say('backup-state','Backup validated locally. Review before restoring.');
  }));
  $('backup-confirm').addEventListener('click',()=>backupAction(async()=>{
    if(!pending)throw new Error('Choose a backup first.');const p=pending;same(p.session);
    const records=await p.session.journal.restoreBackup(p.text);same(p.session).update(records);clearBackup();say('backup-state','History restored. Refresh transaction statuses to verify their current state.');
  }));
  $('backup-cancel').addEventListener('click',clearBackup);

  for(const id of ['request-recipient','request-amount','request-asset','request-duration'])$(id).addEventListener('input',()=>{clearRequest();say('request-create-state','');});
  $('request-own-wallet').addEventListener('click',()=>{try{const s=getSession();clearRequest();$('request-recipient').value=s.owner;say('request-create-state','Connected wallet selected as recipient.');}catch(e){say('request-create-state',e);}});
  $('request-create').addEventListener('click',async()=>{
    clearRequest();const version=generation;
    try{
      const duration=Number($('request-duration').value);if(![3600000,86400000,604800000].includes(duration))throw new Error('Choose a valid expiry.');
      const link=createPaymentRequestLink({v:1,recipient:$('request-recipient').value.trim(),asset:$('request-asset').value,amount:$('request-amount').value.trim(),expires:Date.now()+duration},location.origin);
      const qr=await QRCode.toDataURL(link,{width:520,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}});
      if(version!==generation)return;$('request-link').value=link;$('request-qr').src=qr;$('request-result').hidden=false;say('request-create-state','Request ready. Share the link or QR with your payer.');
    }catch(e){if(version===generation)say('request-create-state',e);}
  });
  $('request-copy').addEventListener('click',async()=>{try{const link=$('request-link').value;if(!link)return;await navigator.clipboard.writeText(link);say('request-create-state','Payment link copied.');}catch{$('request-link').select();say('request-create-state','Select and copy the payment link manually.');}});
  $('request-download').addEventListener('click',()=>{const source=$('request-qr').getAttribute('src');if(source)download(source,'Hushmark-payment-request.png');});
  function readIncoming(){
    if(!location.hash.startsWith('#pay='))return;
    const hash=location.hash;history.replaceState(null,'',location.pathname+location.search);
    incoming=null;$('incoming-request').hidden=false;$('incoming-details').textContent='';$('incoming-expiry').textContent='';
    try{incoming=parsePaymentRequest(hash);$('incoming-details').textContent=`${incoming.amount} ${incoming.asset} to ${incoming.recipient}`;$('incoming-expiry').textContent='Expires '+new Date(incoming.expires).toLocaleString();say('request-incoming-state','Unlock your wallet, then choose Use this request.');$('request-use').hidden=false;}
    catch(e){$('request-use').hidden=true;say('request-incoming-state',e);}
  }
  $('request-use').addEventListener('click',()=>{try{if(!incoming)throw new Error('No valid request.');applyRequest(validatePaymentRequest(incoming));say('request-incoming-state','Request applied. Review the total debit and fees before confirming.');}catch(e){say('request-incoming-state',e);}});
  $('request-dismiss').addEventListener('click',()=>{incoming=null;$('incoming-request').hidden=true;});
  window.addEventListener('hashchange',readIncoming);readIncoming();

  function serviceResult(name,result){$('service-'+name+'-status').textContent=result.status==='available'?'Available':'Unavailable';$('service-'+name+'-status').dataset.state=result.status;$('service-'+name+'-detail').textContent=result.detail+' Checked '+new Date(result.checkedAt).toLocaleTimeString()+'.';}
  function resetServices(){serviceGeneration++;serviceAbort?.abort();$('service-check').disabled=false;for(const name of ['rpc','program','relayer']){$('service-'+name+'-status').textContent='Not checked';$('service-'+name+'-status').dataset.state='unknown';$('service-'+name+'-detail').textContent='Run a check to read current availability.';}say('service-check-state','No checks have run for this connection yet.');}
  $('service-check').addEventListener('click',async()=>{
    const version=++serviceGeneration;serviceAbort?.abort();serviceAbort=new AbortController();$('service-check').disabled=true;say('service-check-state','Checking services…');
    try{const results=await checkServices({rpc:getRpc(),fetch,signal:AbortSignal.any([serviceAbort.signal,AbortSignal.timeout(12000)]),onResult:(n,r)=>{if(version===serviceGeneration)serviceResult(n,r);}});if(version!==serviceGeneration)return;for(const [n,r] of Object.entries(results))serviceResult(n,r);say('service-check-state','Check completed. Results can change; recheck before relying on them.');}
    catch(e){if(version===serviceGeneration)say('service-check-state','Service check failed. Try again.');}
    finally{if(version===serviceGeneration)$('service-check').disabled=false;}
  });
  return {resetServices,lock(){clearBackup();clearRequest();$('backup-state').textContent='';$('request-recipient').value='';$('request-amount').value='';$('request-create-state').textContent='';}};
}
