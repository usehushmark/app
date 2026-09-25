import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import test from 'node:test';
import {
  ACTIVITY_MAX_RECORDS,
  ACTIVITY_MAX_STORAGE_BYTES,
  createPrivateActivity,
  privateActivityStorageKey,
} from '../src/private-activity.js';

const owner = '11111111111111111111111111111111';
const otherOwner = '22222222222222222222222222222222';
const signature = Uint8Array.from({length: 64}, (_, index) => index + 1);
const alternateSignature = Uint8Array.from({length: 64}, (_, index) => index + 2);

function storageFixture() {
  const data = new Map();
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

function record(overrides = {}) {
  return {
    id: 'activity_1', type: 'deposit', asset: 'SOL', amount: '987654321',
    createdAt: 1000, updatedAt: 1000, status: 'preparing', ...overrides,
  };
}

async function open(storage, options = {}) {
  return createPrivateActivity({owner, signature, storage, crypto: webcrypto, ...options});
}

test('encrypts owner-scoped records and never stores plaintext fields', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  const saved = record({
    type: 'withdraw', asset: 'USDC', signature: '3'.repeat(88),
    netAmount: '987000000', fee: '654321', proofDigest: 'a'.repeat(64),
  });
  await journal.upsert(saved);
  const ciphertext = storage.getItem(privateActivityStorageKey(owner));

  assert.doesNotMatch(ciphertext, /activity_1|987654321|3{88}|a{64}/);
  assert.deepEqual(await journal.read(), [saved]);
});

test('retains invalid ciphertext until explicit clear and rejects writes', async () => {
  const storage = storageFixture();
  const storageKey = privateActivityStorageKey(owner);
  storage.setItem(storageKey, '{"version":1,"iv":"bad","ciphertext":"bad"}');
  const journal = await open(storage);

  await assert.rejects(journal.read(), /could not be decrypted/);
  await assert.rejects(journal.upsert(record()), /could not be decrypted/);
  assert.equal(storage.getItem(storageKey), '{"version":1,"iv":"bad","ciphertext":"bad"}');
  await journal.clear();
  assert.equal(storage.getItem(storageKey), null);
});

test('keeps journals isolated by owner and key material', async () => {
  const storage = storageFixture();
  const first = await open(storage);
  await first.upsert(record());
  const second = await open(storage, {owner: otherOwner, signature: alternateSignature});

  assert.deepEqual(await second.read(), []);
  await assert.rejects(open(storage, {signature: alternateSignature}).then(journal => journal.read()), /could not be decrypted/);
});

test('caps valid records and rejects an oversized encrypted envelope', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  for (let index = 0; index < ACTIVITY_MAX_RECORDS + 1; index++) {
    await journal.upsert(record({id: `activity_${index}`, createdAt: index, updatedAt: index}));
  }
  assert.equal((await journal.read()).length, ACTIVITY_MAX_RECORDS);

  storage.setItem(privateActivityStorageKey(owner), 'x'.repeat(ACTIVITY_MAX_STORAGE_BYTES + 1));
  await assert.rejects(journal.read(), /could not be decrypted/);
});

test('rejects private fields and closes the derived key after lock', async () => {
  const journal = await open(storageFixture());
  await assert.rejects(journal.upsert({...record(), recipient: 'public-address'}), /Unsupported activity record field/);
  await assert.rejects(journal.upsert({...record(), rawProof: 'secret'}), /Unsupported activity record field/);
  journal.close();
  await assert.rejects(journal.read(), /session is closed/);
});