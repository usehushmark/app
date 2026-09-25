import {PROGRAM} from './privacy-guards.js';

export const activityStatusLabel = status => ({
  preparing: 'Preparation recorded',
  'not-submitted': 'Not submitted',
  'submission-unknown': 'Submission outcome unknown',
  submitted: 'Submitted',
  processing: 'Processing',
  confirmed: 'Confirmed',
  finalized: 'Finalized',
  failed: 'Failed',
  'not-found': 'Not found',
  'proof-mismatch': 'Proof mismatch',
  unverified: 'Receipt unverified',
}[status] || 'Unknown');

export async function digestProof(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Withdrawal proof bytes are required.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

function pendingStatus(status) {
  if (!status) return 'not-found';
  if (status.err) return 'failed';
  if (status.confirmationStatus === 'finalized') return 'finalized';
  return status.confirmationStatus === 'confirmed' ? 'confirmed' : 'processing';
}

export async function verifyActivityStatus(record, connection, guard) {
  guard();
  const {value: [status]} = await connection.getSignatureStatuses([record.signature], {searchTransactionHistory: true});
  guard();
  const result = pendingStatus(status);
  if (result !== 'finalized' || record.type !== 'withdraw') return result;
  if (!record.proofDigest) return 'unverified';
  const transaction = await connection.getTransaction(record.signature, {commitment: 'finalized', maxSupportedTransactionVersion: 0});
  guard();
  if (!transaction || transaction.meta?.err) return 'unverified';
  for (const instruction of transaction.transaction.message.compiledInstructions || []) {
    const keys = transaction.transaction.message.getAccountKeys({accountKeysFromLookups: transaction.meta?.loadedAddresses});
    if (keys.get(instruction.programIdIndex)?.toBase58() !== PROGRAM) continue;
    const bytes = instruction.data instanceof Uint8Array ? instruction.data : Uint8Array.from(instruction.data || []);
    if (await digestProof(bytes) === record.proofDigest) return 'finalized';
    guard();
  }
  return 'proof-mismatch';
}
