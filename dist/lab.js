const $=id=>document.getElementById(id);
const FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
let worker,fixture,bundle,request,busy=false,phase='ready',sequence=0;
const pending=new Map();
function rpc(action,data){
  if(!worker){
    worker=new Worker('/zk-worker.js');
    worker.onmessage=({data:m})=>{const handler=pending.get(m.id);if(!handler)return;pending.delete(m.id);clearTimeout(handler.timeout);m.ok?handler.resolve(m.result):handler.reject(new Error(m.error));};
    worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timeout);p.reject(new Error('The proof engine could not start. Refresh and try a current browser.'));}pending.clear();worker.terminate();worker=undefined;};
  }
  return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);worker?.terminate();worker=undefined;reject(new Error('Proof operation timed out. Try again on a device with more available memory.'));},120000);pending.set(id,{resolve,reject,timeout});worker.postMessage({id,action,...data});});
}
function state(next,title,message,icon='∴'){
  phase=next;$('state-badge').textContent=next.toUpperCase();$('output-title').textContent=title;$('status-message').textContent=message;$('state-icon').textContent=icon;
  $('proof-state').className=next==='rejected'?'error-state':next==='verified'?'success-state':'';
}
function controls(){
  $('generate').disabled=busy;$('holder').disabled=busy;$('threshold').disabled=busy;
  $('generate').textContent=busy?'Working on this device…':'Generate proof ↗';
  $('verify').disabled=busy||!bundle||request?.used;
  $('tamper').disabled=busy||!bundle||!request?.used;
  $('replay').disabled=busy||!bundle||!request?.used;
  document.querySelector('.lab-output').classList.toggle('is-busy',busy);
}
async function samples(){if(!fixture){const response=await fetch('/zk/samples.json');if(!response.ok)throw new Error('Sample credentials could not be loaded.');fixture=await response.json();if(fixture.synthetic!==true||fixture.developmentOnly!==true)throw new Error('Unexpected credential source.');}return fixture;}
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return(BigInt('0x'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''))%FIELD).toString();}
function nonce(){const bytes=crypto.getRandomValues(new Uint8Array(31));return BigInt('0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')).toString();}
function publicEnvelope(){return{developmentOnly:true,syntheticCredentials:true,request:{audience:request.audience,threshold:request.threshold,nonce:request.nonce,expiresAt:request.expiresAt},publicSignalOrder:['requestTag','root','threshold','audienceField','nonce'],publicSignals:bundle.publicSignals,proof:bundle.proof};}
async function generate(options){
  if(busy)throw new Error('A proof operation is already running.');
  if(options){if(!['experienced','starter'].includes(options.holder)||![3,10,20].includes(options.threshold))throw new Error('Choose an available sample and threshold.');$('holder').value=options.holder;$('threshold').value=String(options.threshold);}
  busy=true;bundle=undefined;request=undefined;$('result-facts').hidden=true;$('public-details').hidden=true;
  state('proving','Building your proof.','The sample credential is being processed on this device. First use downloads the proof engine.');controls();
  let eligible;
  try{
    if(!crypto.subtle)throw new Error('A secure browser connection is required.');
    const data=await samples();const credential=data.credentials[$('holder').value];const threshold=Number($('threshold').value);
    eligible=credential.completed>=threshold;
    const audience='hushmark.demo/recruiter';request={threshold,audience,audienceField:await digest('hushmark:audience:v1\0'+audience),nonce:nonce(),expiresAt:Date.now()+300000,used:false};
    const input={secret:credential.secret,completed:String(credential.completed),siblings:credential.siblings,directions:credential.directions,root:data.root,threshold:String(threshold),audience:request.audienceField,nonce:request.nonce};
    bundle=await rpc('prove',{input});
    $('claim-text').textContent=`At least ${threshold} completed jobs`;$('result-facts').hidden=false;$('public-details').hidden=false;$('public-data').textContent=JSON.stringify(publicEnvelope(),null,2);
    state('generated','Proof generated.','The proof is ready. Verify it against this request and the pinned sample batch.','↗');
    return{phase,threshold,proofGenerated:true};
  }catch(error){bundle=undefined;state('rejected',eligible===false?'Requirement not met.':'Proof could not be generated.',eligible===false?'This sample has fewer completed jobs than the requested minimum. The circuit rejected the claim.':error.message,'×');return{phase,proofGenerated:false,reason:$('status-message').textContent};}
  finally{busy=false;controls();}
}
async function verifyEnvelope(candidate){
  if(!request||!candidate)throw new Error('Generate a proof first.');
  if(request.used)return{accepted:false,reason:'This request was already consumed. Generate a new proof for a new request.'};
  if(Date.now()>=request.expiresAt)return{accepted:false,reason:'This request expired. Generate a new proof.'};
  const s=candidate.publicSignals;
  if(!Array.isArray(s)||s.length!==5||s[1]!==fixture.root||s[2]!==String(request.threshold)||s[3]!==request.audienceField||s[4]!==request.nonce)return{accepted:false,reason:'The proof does not match this request.'};
  const result=await rpc('verify',{proof:candidate.proof,signals:s});
  if(result.accepted&&Date.now()>=request.expiresAt)return{accepted:false,reason:'The request expired during verification.'};
  if(result.accepted)request.used=true;
  return{accepted:result.accepted,reason:result.accepted?'The threshold and sample-batch membership passed cryptographic verification.':'The cryptographic proof was rejected.'};
}
async function verify(){if(busy)throw new Error('A proof operation is already running.');busy=true;controls();try{const result=await verifyEnvelope(bundle);state(result.accepted?'verified':'rejected',result.accepted?'Requirement verified.':'Verification rejected.',result.reason,result.accepted?'✓':'×');return result;}catch(error){state('rejected','Verification unavailable.',error.message,'×');return{accepted:false,reason:error.message};}finally{busy=false;controls();}}
async function testTamper(){if(busy||!bundle||!request?.used)return;busy=true;controls();try{const altered=structuredClone(bundle.publicSignals);altered[0]=(BigInt(altered[0])+1n).toString();const result=await rpc('verify',{proof:bundle.proof,signals:altered});state(result.accepted?'unexpected':'rejected',result.accepted?'Unexpected result.':'Tampered proof rejected.',result.accepted?'The modified proof was accepted. Do not rely on this session.':'Changing the request tag breaks the cryptographic check. The original proof remains unchanged.',result.accepted?'!':'×');}catch(error){state('rejected','Tamper test could not finish.',error.message,'×');}finally{busy=false;controls();}}
$('generate').addEventListener('click',()=>generate());$('verify').addEventListener('click',verify);$('tamper').addEventListener('click',testTamper);
$('replay').addEventListener('click',async()=>{const result=await verifyEnvelope(bundle);state('rejected','Replay rejected.',result.reason,'×');controls();});
for(const id of ['holder','threshold'])$(id).addEventListener('change',()=>{bundle=undefined;request=undefined;$('result-facts').hidden=true;$('public-details').hidden=true;state('ready','Ready for a new claim.','Generate a fresh proof for the selected credential and requirement.');controls();});
$('download').addEventListener('click',()=>{if(!bundle)return;const url=URL.createObjectURL(new Blob([JSON.stringify(publicEnvelope(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hushmark-demo-proof.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Optional browser-native agent tools share the same visible flow and validation.
const context=document.modelContext;
if(context?.registerTool){
  const lifetime=new AbortController();window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
  for(const tool of [
    {name:'read_hushmark_lab',description:'Read the current public Proof Lab state. Does not reveal a private witness.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({phase,threshold:Number($('threshold').value),proofGenerated:!!bundle,consumed:!!request?.used})},
    {name:'generate_hushmark_sample_proof',description:'Generate a real ZK proof in the visible lab using a public synthetic credential. Does not use a wallet or real personal data.',inputSchema:{type:'object',properties:{holder:{type:'string',enum:['experienced','starter']},threshold:{type:'integer',enum:[3,10,20]}},required:['holder','threshold'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>!['holder','threshold'].includes(k)))throw new Error('Invalid proof configuration');return generate(input);}},
    {name:'verify_hushmark_sample_proof',description:'Verify the generated sample proof and consume its single-use request in this tab.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:verify}
  ])try{Promise.resolve(context.registerTool(tool,{signal:lifetime.signal})).catch(()=>{});}catch{}
}
