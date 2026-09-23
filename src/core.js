export function parseUnits(value, decimals) {
  const text=String(value).trim();
  if(!/^\d+(\.\d+)?$/.test(text)||text.length>35) throw new Error('Enter a positive decimal amount.');
  const [whole,fraction='']=text.split('.');
  if(fraction.length>decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
  if(units<=0n||units>18446744073709551615n) throw new Error('Amount is outside the supported range.');
  return units;
}
export function formatUnits(units, decimals) {
  const n=BigInt(units),base=10n**BigInt(decimals),fraction=(n%base).toString().padStart(decimals,'0').replace(/0+$/,'');
  return (n/base).toString()+(fraction?'.'+fraction:'');
}
export function statusLabel(status) {
  if(!status) return 'Not found';
  if(status.err) return 'Failed';
  if(status.confirmationStatus==='finalized') return 'Finalized';
  if(status.confirmationStatus==='confirmed') return 'Confirmed';
  return 'Processing';
}
export function validRpc(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash) throw new Error('Use an HTTPS Solana RPC URL without a username or password.');
  return url.href;
}
