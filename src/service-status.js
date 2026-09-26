import {GENESIS} from './config.js';
import {PROGRAM,RELAYER} from './privacy-guards.js';

export function validFeeService(config) {
  return Number.isFinite(config?.withdraw_fee_rate)&&config.withdraw_fee_rate>=0&&config.withdraw_fee_rate<1
    && Number.isFinite(config?.withdraw_rent_fee)&&config.withdraw_rent_fee>=0
    && Number.isFinite(config?.rent_fees?.usdc)&&config.rent_fees.usdc>=0
    && ['sol','usdc'].every(a=>Number.isFinite(config.minimum_withdrawal?.[a])&&config.minimum_withdrawal[a]>0);
}

export async function checkServices({rpc,fetch=globalThis.fetch,signal,onResult=()=>{}}) {
  const started=Date.now();
  const rpcRead=async(method,params)=>{
    const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});
    if(!response.ok)throw new Error('RPC unavailable');
    const body=await response.json();if(body.error)throw new Error('RPC rejected the read');return body.result;
  };
  const mainnet=rpcRead('getGenesisHash',[]).then(hash=>{if(hash!==GENESIS)throw new Error('Wrong network');});
  const tasks={
    rpc:async()=>{await mainnet;const slot=await rpcRead('getSlot',[{commitment:'finalized'}]);if(!Number.isSafeInteger(slot)||slot<=0)throw new Error('Invalid slot');return 'Solana mainnet is responding.';},
    program:async()=>{await mainnet;const account=await rpcRead('getAccountInfo',[PROGRAM,{encoding:'base64',commitment:'finalized'}]);if(!account?.value?.executable)throw new Error('Program unavailable');return 'Privacy program is available on the selected RPC.';},
    relayer:async()=>{const response=await fetch(RELAYER+'/config',{signal});if(!response.ok||!validFeeService(await response.json()))throw new Error('Fee service unavailable');return 'Current protocol fees are available.';},
  };
  return Object.fromEntries(await Promise.all(Object.entries(tasks).map(async([name,run])=>{
    let result;try{result={status:'available',detail:await run(),checkedAt:Date.now(),latency:Date.now()-started};}
    catch{result={status:'unavailable',detail:name==='rpc'?'Connection failed or is not Solana mainnet.':name==='program'?'Could not verify the privacy program.':'Could not retrieve valid protocol fees.',checkedAt:Date.now()};}
    if(!signal?.aborted)onResult(name,result);
    return [name,result];
  })));
}
