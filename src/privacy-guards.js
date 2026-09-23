export const PROGRAM='9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';
export const RELAYER='https://api3.privacycash.org';
export const SIGN_MESSAGE='Privacy Money account sign in';
export function depositSolReserve(index){return index===0?205000n:2000000n;}
export function sameWithdrawalFees(current,approved,index){
 const rent=c=>index===0?c.withdraw_rent_fee:c.rent_fees?.usdc;
 return current.withdraw_fee_rate===approved.withdraw_fee_rate&&rent(current)===rent(approved)&&current.minimum_withdrawal?.[index===0?'sol':'usdc']===approved.minimum_withdrawal?.[index===0?'sol':'usdc'];
}
export function checkedNumber(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount exceeds the protocol SDK precision limit.');return Number(n);}
export function withdrawalQuote(gross,rate,rent,decimals){
 if(!Number.isFinite(rate)||rate<0||rate>=1||!Number.isFinite(rent)||rent<0)throw new Error('Invalid protocol fee configuration.');
 const fee=BigInt(Math.floor(checkedNumber(gross)*rate+10**decimals*rent));
 if(fee>=gross)throw new Error('Amount does not cover the withdrawal fee.');
 return {gross,fee,net:gross-fee};
}
export function validateWithdrawal(body,review){
 if(body.recipient!==review.recipient||BigInt(body.extAmount)!==-review.net||BigInt(body.fee)!==review.fee||((body.mintAddress||null)!==(review.asset.mint||null)))throw new Error('The withdrawal changed after review. Nothing was submitted.');
}
export function scopedStorage(storage,owner){const prefix='hushmark:privacy:'+owner+':';return{getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)};}
