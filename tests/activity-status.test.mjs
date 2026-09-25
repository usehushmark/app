import assert from 'node:assert/strict';
import test from 'node:test';
import {digestProof, verifyActivityStatus} from '../src/activity-status.js';

const proof = Uint8Array.from([1, 2, 3]);
const withdrawal = {type: 'withdraw', signature: '3'.repeat(88), proofDigest: await digestProof(proof)};
const deposit = {type: 'deposit', signature: '4'.repeat(88)};

function fixture(status, instruction = proof) {
  let transactionReads = 0;
  return {
    transactionReads: () => transactionReads,
    connection: {
      getSignatureStatuses: async () => ({value: [status]}),
      getTransaction: async () => {
        transactionReads++;
        return instruction === null ? null : {
          meta: {err: null, loadedAddresses: undefined},
          transaction: {message: {getAccountKeys: () => ({get: () => ({toBase58: () => '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'})}), compiledInstructions: [{programIdIndex: 0, data: instruction}] }},
        };
      },
    },
  };
}

test('requires a matching withdrawal proof before finalized', async () => {
  assert.equal(await verifyActivityStatus(withdrawal, fixture({confirmationStatus: 'finalized', err: null}).connection, () => {}), 'finalized');
  assert.equal(await verifyActivityStatus(withdrawal, fixture({confirmationStatus: 'finalized', err: null}, Uint8Array.from([9])).connection, () => {}), 'proof-mismatch');
});

test('does not turn missing or pending results into finality', async () => {
  for (const value of [null, {confirmationStatus: 'processed', err: null}, {confirmationStatus: 'confirmed', err: null}]) {
    assert.notEqual(await verifyActivityStatus(deposit, fixture(value).connection, () => {}), 'finalized');
  }
});

test('does not publish a status after a session lock during RPC work', async () => {
  let locked = false;
  const connection = {getSignatureStatuses: async () => { locked = true; return {value: [{confirmationStatus: 'finalized', err: null}]}; }};
  await assert.rejects(verifyActivityStatus(deposit, connection, () => { if (locked) throw new Error('Locked'); }), /Locked/);
});
