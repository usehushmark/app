// Navigation uses native links, so every page works without JavaScript.
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
  const target=document.querySelector(link.getAttribute('href'));
  if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
}));

let copyToastTimer;
async function copyText(value){
try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
  }catch{}
  const input=document.createElement('textarea');
  input.value=value;
  input.setAttribute('readonly','');
  input.style.position='fixed';
  input.style.opacity='0';
  document.body.append(input);
  input.select();
  const copied=document.execCommand('copy');
  input.remove();
  if(!copied)throw new Error('Clipboard access unavailable');
}
document.querySelectorAll('[data-copy-contract]').forEach(button=>button.addEventListener('click',async()=>{
  const control=button.closest('[data-contract-address]');
  const status=control?.querySelector('[data-copy-status]');
  const address=control?.dataset.contractAddress;
  if(!address||!status)return;
  try{
    await copyText(address);
    status.textContent=control.dataset.copySuccess||'Address copied';
  }catch{
    status.textContent=control.dataset.copyError||'Copy failed. Copy the address manually.';
  }
  status.dataset.visible='true';
  clearTimeout(copyToastTimer);
  copyToastTimer=setTimeout(()=>{status.dataset.visible='false';},2400);
}));