import {PublicKey} from '@solana/web3.js';
import {ASSETS} from './config.js';
import {parseUnits,formatUnits} from './core.js';
import {withdrawalQuote,checkedNumber} from './privacy-guards.js';

export function validatePaymentRequest(value,now=Date.now()) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='amount,asset,expires,recipient,v' || value.v!==1)throw new Error('Invalid payment request format.');
  const asset=ASSETS.find(a=>a.symbol===value.asset);
  if(!asset || typeof value.amount!=='string' || typeof value.recipient!=='string')throw new Error('Unsupported payment request.');
  let recipient;
  try{const key=new PublicKey(value.recipient);if(!PublicKey.isOnCurve(key.toBytes()))throw 0;recipient=key.toBase58();}catch{throw new Error('Enter a valid recipient wallet address.');}
  const amount=parseUnits(value.amount,asset.decimals);checkedNumber(amount);
  if(!Number.isSafeInteger(value.expires) || value.expires<=now || value.expires>now+31*86400000)throw new Error('This payment request has expired or has an invalid expiry.');
  return Object.freeze({v:1,recipient,asset:asset.symbol,amount:formatUnits(amount,asset.decimals),expires:value.expires});
}

export function createPaymentRequestLink(value,origin,now=Date.now()) {
  const request=validatePaymentRequest(value,now),url=new URL('/wallet/',origin);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:' && !(local&&url.protocol==='http:'))throw new Error('Payment links require HTTPS.');
  if(url.username||url.password)throw new Error('Invalid website origin.');
  // A fragment keeps request details out of the initial HTTP request/referrer.
  url.hash='pay='+btoa(JSON.stringify(request)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return url.href;
}

export function parsePaymentRequest(hash,now=Date.now()) {
  if(!hash.startsWith('#pay='))return null;
  const encoded=hash.slice(5);
  if(encoded.length>1800 || !/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('Invalid payment request link.');
  try{return validatePaymentRequest(JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/'))),now);}catch(e){throw new Error(e?.message?.includes('expired')?e.message:'Invalid payment request link.');}
}

export function quoteRequestedNet(net,rate,rent,decimals) {
  checkedNumber(net);
  if(!Number.isFinite(rate)||rate<0||rate>=1||!Number.isFinite(rent)||rent<0)throw new Error('Protocol fees are unavailable.');
  const max=BigInt(Number.MAX_SAFE_INTEGER);
  const netAt=gross=>gross-BigInt(Math.floor(Number(gross)*rate+10**decimals*rent));
  if(netAt(max)<net)throw new Error('Requested amount exceeds the supported payment limit.');
  let lo=net,hi=max;
  while(lo<hi){const mid=(lo+hi)/2n;if(netAt(mid)>=net)hi=mid;else lo=mid+1n;}
  const quote=withdrawalQuote(lo,rate,rent,decimals);
  if(quote.net!==net)throw new Error('The requested net amount cannot be matched exactly.');
  return quote;
}
