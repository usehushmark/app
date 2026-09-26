import {PROGRAM} from './privacy-guards.js';

export const activityStatusLabel = status => ({
  preparing: 'Preparation recorded',
  'not-submitted': 'Not submitted',
  'submission-unknown': 'Submission outcome unknown',
  submitted: 'Submitted',
  processing: 'Processing',
  confirmed: 'Confirmed · awaiting finality',
  finalized: 'Finalized',
  failed: 'Failed onchain',
  'not-found': 'Not found · outcome unknown',
  'proof-mismatch': 'Proof mismatch — withdrawal not verified',
  unverified: 'Settlement not yet verified',
}[status] || 'Settlement not yet verified');

export async function digestProof(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}

// A saved signature is a locator, not proof of settlement. A withdrawal must
// also contain the exact approved proof, including after a browser reload.
export async function verifyActivityStatus(record, connection, guard) {
  guard();
  const {value: [status]} = await connection.getSignatureStatuses([record.signature], {searchTransactionHistory: true});
  guard();
  if (!status) return 'not-found';
  if (status.err && record.type !== 'withdraw') return 'failed';
  if (status.err && status.confirmationStatus !== 'finalized') return 'unverified';
  if (status.confirmationStatus !== 'finalized') return status.confirmationStatus === 'confirmed' ? 'confirmed' : 'processing';
  if (record.type !== 'withdraw') return 'finalized';
  if (!record.proofDigest) return 'unverified';
  const tx = await connection.getTransaction(record.signature, {commitment: 'finalized', maxSupportedTransactionVersion: 0});
  guard();
  if (!tx || !tx.meta) return 'unverified';
  const keys = tx.transaction.message.getAccountKeys({accountKeysFromLookups: tx.meta.loadedAddresses});
  for (const ix of tx.transaction.message.compiledInstructions) {
    if (keys.get(ix.programIdIndex)?.toBase58() !== PROGRAM) continue;
    const digest = await digestProof(ix.data);
    guard();
    if (digest === record.proofDigest) return tx.meta.err || status.err ? 'failed' : 'finalized';
  }
  return 'proof-mismatch';
}
