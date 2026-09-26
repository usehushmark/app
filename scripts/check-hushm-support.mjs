// Read-only feasibility check. No wallet, private key, signature or transaction submission.
import {PublicKey} from '@solana/web3.js';
import {tokens,PROGRAM_ID} from '../node_modules/privacycash/dist/utils/constants.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {GENESIS,DEFAULT_RPC} from '../src/config.js';
const mint='F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump';
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tree=m=>PublicKey.findProgramAddressSync([Buffer.from('merkle_tree'),new PublicKey(m).toBuffer()],PROGRAM_ID)[0].toBase58();
async function read(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Read failed '+response.status);return response.json();}
const rpc=(method,params)=>read(DEFAULT_RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>{if(r.error)throw new Error(r.error.message);return r.result;});
const report={checkedAt:new Date().toISOString(),mint,program:PROGRAM_ID.toBase58(),rpc:DEFAULT_RPC,sdkVersion:JSON.parse(await readFile('node_modules/privacycash/package.json','utf8')).version,sdkContainsHushm:tokens.some(t=>t.pubkey.toBase58()===mint),sdkTokens:tokens.map(t=>({name:t.name,mint:t.pubkey.toBase58()})),hushmTree:tree(mint),usdcControlTree:tree(usdc)};
const results=await Promise.allSettled([
 rpc('getGenesisHash',[]),
 rpc('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized'}]),
 rpc('getMultipleAccounts',[[tree(mint),tree(usdc)],{encoding:'base64',commitment:'finalized'}]),
 read('https://api3.privacycash.org/config'),
 read('https://registry.npmjs.org/privacycash/latest'),
]);
for(const [i,name] of ['genesis','mintAccount','pools','relayerConfig','latestSdk'].entries()){
 const r=results[i];if(r.status!=='fulfilled'){report[name]={error:r.reason.message};continue;}
 const v=r.value;
 if(name==='genesis')report.mainnetVerified=v===GENESIS;
 else if(name==='mintAccount')report.mintAccount={slot:v.context.slot,owner:v.value?.owner,info:v.value?.data?.parsed?.info??null};
 else if(name==='pools')report.pools={slot:v.context.slot,hushm:v.value[0]?{owner:v.value[0].owner,bytes:Buffer.from(v.value[0].data[0],'base64').length}:null,usdcControl:v.value[1]?{owner:v.value[1].owner,bytes:Buffer.from(v.value[1].data[0],'base64').length}:null};
 else if(name==='latestSdk')report.latestSdk={version:v.version,repository:v.repository};
 else report.relayerConfig=v;
}
await mkdir('qa',{recursive:true});await writeFile('qa/hushm-support-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
