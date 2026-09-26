import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPrivateActivity, privateActivityStorageKey, ACTIVITY_MAX_RECORDS, ACTIVITY_MAX_STORAGE_BYTES} from '../src/private-activity.js';

const owner = '11111111111111111111111111111111';
const otherOwner = '22222222222222222222222222222222';
const signature = Uint8Array.from({length: 64}, (_, index) => index + 1);
const storageKey = privateActivityStorageKey(owner);
function storageFixture() {
  const data = new Map();
  return {data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
}
function record(overrides = {}) {
  return {id: 'activity_1', type: 'deposit', asset: 'SOL', amount: '987654321', createdAt: 1000, updatedAt: 1000, status: 'preparing', ...overrides};
}
function open(storage, options = {}) {
  return createPrivateActivity({owner, signature, storage, crypto: webcrypto, ...options});
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function controlledCrypto(method, before) {
  return {
    getRandomValues: array => webcrypto.getRandomValues(array),
    subtle: new Proxy(webcrypto.subtle, {get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === method) return async (...args) => { await before(...args); return value.apply(target, args); };
      return typeof value === 'function' ? value.bind(target) : value;
    }}),
  };
}

test('real crypto roundtrip/reload keeps the journal encrypted and snapshots immutable', async () => {
  const storage = storageFixture();
  const originalSignature = signature.slice();
  let importCopy;
  let derivedKey;
  const crypto = controlledCrypto('importKey', async (_format, bytes) => { importCopy = bytes; });
  const derive = crypto.subtle.deriveKey;
  const wrappedCrypto = {...crypto, subtle: new Proxy(crypto.subtle, {get(target, property) {
    if (property === 'deriveKey') return async (...args) => { derivedKey = await derive(...args); return derivedKey; };
    return Reflect.get(target, property);
  }})};
  const journal = await open(storage, {crypto: wrappedCrypto});
  assert.equal(storage.data.size, 0, 'creating a journal must not read or write stored data');
  assert.deepEqual(signature, originalSignature, 'caller signature is not modified');
  assert.ok(importCopy.every(byte => byte === 0), 'temporary signature copy is zeroed');
  assert.equal(derivedKey.extractable, false);
  assert.deepEqual(await journal.read(), []);
  const input = record({signature: '3'.repeat(88), proofDigest: 'a'.repeat(64), netAmount: '987654300', fee: '21'});
  const result = await journal.upsert(input);
  input.status = 'failed';
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]));
  assert.equal(result[0].status, 'preparing');
  assert.throws(() => { result[0].amount = '1'; }, TypeError);
  const raw = storage.getItem(storageKey);
  const envelope = JSON.parse(raw);
  assert.deepEqual(Object.keys(envelope).sort(), ['ciphertext', 'iv', 'version']);
  for (const secret of ['activity_1', '987654321', '987654300', 'preparing', 'deposit', 'proofDigest', 'recipient', '3'.repeat(88), 'a'.repeat(64)]) assert.equal(raw.includes(secret), false, secret);
  assert.equal(Buffer.from(envelope.iv, 'base64').length, 12);
  assert.ok(Buffer.byteLength(raw) <= ACTIVITY_MAX_STORAGE_BYTES);
  journal.close();
  const reloaded = await open(storage);
  assert.deepEqual(await reloaded.read(), result);
  const merged = await reloaded.upsert({id: 'activity_1', status: 'submitted', updatedAt: 2000});
  assert.equal(merged[0].amount, '987654321');
  assert.equal(merged[0].status, 'submitted');
  assert.notEqual(JSON.parse(storage.getItem(storageKey)).iv, envelope.iv);
  reloaded.close();
});

test('owner, wrong signature, ciphertext swapping and tampering never silently replace records', async () => {
  const storage = storageFixture();
  const first = await open(storage);
  await first.upsert(record());
  const original = storage.getItem(storageKey);
  const wrong = await open(storage, {signature: new Uint8Array(64).fill(77)});
  await assert.rejects(wrong.read(), /could not be decrypted/);
  await assert.rejects(wrong.upsert(record({id: 'replacement'})), /could not be decrypted/);
  assert.equal(storage.getItem(storageKey), original);
  const second = await open(storage, {owner: otherOwner});
  assert.deepEqual(await second.read(), []);
  storage.setItem(privateActivityStorageKey(otherOwner), original);
  await assert.rejects(second.read(), /could not be decrypted/);
  const envelope = JSON.parse(original);
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[ciphertext.length - 1] ^= 1;
  storage.setItem(storageKey, JSON.stringify({...envelope, ciphertext: ciphertext.toString('base64')}));
  await assert.rejects(first.read(), /could not be decrypted/);
  const corrupt = storage.getItem(storageKey);
  await assert.rejects(first.upsert(record()), /could not be decrypted/);
  assert.equal(storage.getItem(storageKey), corrupt);
  assert.deepEqual(await first.clear(), []);
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(storage.getItem(privateActivityStorageKey(otherOwner)), original);
  first.close(); wrong.close(); second.close();
});

test('malformed, oversized and unexpected envelope fields are kept until explicitly cleared', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  for (const raw of ['bad json', '{}', JSON.stringify({version: 2, iv: 'AA==', ciphertext: 'AA=='}), 'x'.repeat(ACTIVITY_MAX_STORAGE_BYTES + 1)]) {
    storage.setItem(storageKey, raw);
    await assert.rejects(journal.read(), /could not be decrypted/);
    await assert.rejects(journal.upsert(record()), /could not be decrypted/);
    assert.equal(storage.getItem(storageKey), raw);
    await journal.clear();
  }
  journal.close();
});

test('record validation rejects unsupported and sensitive fields without writing', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  const invalid = [
    {recipient: owner}, {notes: 'private'}, {error: 'raw error'}, {proof: 'raw proof'},
    {id: '../bad'}, {asset: 'OTHER'}, {type: 'transfer'}, {status: 'success'},
    {amount: '1.2'}, {amount: '-1'}, {amount: '01'}, {amount: 10}, {amount: '18446744073709551616'},
    {netAmount: '-1'}, {fee: '1e3'}, {signature: '0'.repeat(88)}, {proofDigest: 'A'.repeat(64)},
    {createdAt: NaN}, {updatedAt: 999}, {createdAt: 0.1}, {updatedAt: Infinity},
  ];
  for (const changes of invalid) await assert.rejects(journal.upsert(record(changes)));
  await assert.rejects(journal.upsert({id: 'incomplete'}), /Incomplete/);
  assert.equal(storage.data.size, 0);
  await journal.upsert(record());
  const original = storage.getItem(storageKey);
  await assert.rejects(journal.upsert({id: 'activity_1', recipient: owner}));
  assert.equal(storage.getItem(storageKey), original);
  journal.close();
});

test('concurrent calls are serialized, updates read latest, and retention keeps 100 newest records', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  await Promise.all(Array.from({length: 105}, (_, index) => journal.upsert(record({id: 'record_' + index, createdAt: index + 1, updatedAt: index + 1}))));
  const records = await journal.read();
  assert.equal(records.length, ACTIVITY_MAX_RECORDS);
  assert.equal(records[0].id, 'record_104');
  assert.equal(records.at(-1).id, 'record_5');
  const otherInstance = await open(storage);
  await otherInstance.upsert(record({id: 'external', createdAt: 2000, updatedAt: 2000}));
  await journal.upsert({id: 'record_104', status: 'confirmed', updatedAt: 3000});
  assert.ok((await otherInstance.read()).some(item => item.id === 'external'));
  assert.equal((await journal.read()).find(item => item.id === 'record_104').status, 'confirmed');
  journal.close(); otherInstance.close();
});

test('navigator locks serialize read-modify-write across independent journal instances', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const queues = new Map();
  const names = [];
  const locks = {request(name, options, callback) {
    assert.equal(options.mode, 'exclusive');
    names.push(name);
    const next = (queues.get(name) || Promise.resolve()).then(callback);
    queues.set(name, next.catch(() => {}));
    return next;
  }};
  Object.defineProperty(globalThis, 'navigator', {value: {locks}, configurable: true});
  try {
    const storage = storageFixture();
    const first = await open(storage);
    const second = await open(storage);
    await Promise.all([first.upsert(record({id: 'one'})), second.upsert(record({id: 'two'}))]);
    assert.equal((await first.read()).length, 2);
    assert.ok(names.length >= 3 && names.every(name => name === storageKey));
    first.close(); second.close();
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});

test('close during encryption rejects in-flight and queued work without writing', async () => {
  const entered = deferred(), release = deferred();
  const storage = storageFixture();
  const crypto = controlledCrypto('encrypt', async () => { entered.resolve(); await release.promise; });
  const journal = await open(storage, {crypto});
  const writing = journal.upsert(record());
  const writingRejected = assert.rejects(writing, /session is closed/);
  const queued = journal.upsert(record({id: 'queued'}));
  const queuedRejected = assert.rejects(queued, /session is closed/);
  await entered.promise;
  journal.close();
  release.resolve();
  await Promise.all([writingRejected, queuedRejected]);
  assert.equal(storage.data.size, 0);
  await assert.rejects(journal.read(), /session is closed/);
  await assert.rejects(journal.clear(), /session is closed/);
  await assert.rejects(journal.upsert(record()), /session is closed/);
});

test('close during decryption does not return decrypted records or perform queued clear', async () => {
  const storage = storageFixture();
  const seed = await open(storage);
  await seed.upsert(record()); seed.close();
  const original = storage.getItem(storageKey);
  const entered = deferred(), release = deferred();
  const crypto = controlledCrypto('decrypt', async () => { entered.resolve(); await release.promise; });
  const journal = await open(storage, {crypto});
  const reading = journal.read();
  const readRejected = assert.rejects(reading, /session is closed/);
  const clearing = journal.clear();
  const clearRejected = assert.rejects(clearing, /session is closed/);
  await entered.promise;
  journal.close(); release.resolve();
  await Promise.all([readRejected, clearRejected]);
  assert.equal(storage.getItem(storageKey), original);
});

test('storage failure preserves old ciphertext and never falls back to plaintext', async () => {
  const storage = storageFixture();
  const journal = await open(storage);
  await journal.upsert(record());
  const original = storage.getItem(storageKey);
  let attempted;
  storage.setItem = (_key, value) => { attempted = value; throw new Error('Quota exceeded'); };
  await assert.rejects(journal.upsert({id: 'activity_1', status: 'submitted', updatedAt: 2000}), /Quota exceeded/);
  assert.equal(storage.getItem(storageKey), original);
  assert.equal(attempted.includes('submitted'), false);
  assert.deepEqual(Object.keys(JSON.parse(attempted)).sort(), ['ciphertext', 'iv', 'version']);
  assert.equal((await journal.read())[0].status, 'preparing');
  storage.getItem = () => { throw new Error('Storage denied'); };
  await assert.rejects(journal.read(), /Storage denied/);
  journal.close();
});

test('closing while a browser lock is pending prevents queued writes', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const entered = deferred(), release = deferred();
  Object.defineProperty(globalThis, 'navigator', {value: {locks: {
    async request(_name, _options, callback) { entered.resolve(); await release.promise; return callback(); },
  }}, configurable: true});
  try {
    const storage = storageFixture();
    const journal = await open(storage);
    const write = journal.upsert(record());
    const rejected = assert.rejects(write, /session is closed/);
    await entered.promise;
    journal.close(); release.resolve();
    await rejected;
    assert.equal(storage.data.size, 0);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});

test('signature copies are erased even when key import fails, and creation never accesses storage', async () => {
  let copy;
  const crypto = controlledCrypto('importKey', async (_format, bytes) => { copy = bytes; throw new Error('Import unavailable'); });
  const originalSignature = signature.slice();
  const noAccess = {getItem() { throw new Error('Must not read'); }, setItem() { throw new Error('Must not write'); }, removeItem() { throw new Error('Must not remove'); }};
  await assert.rejects(open(noAccess, {crypto}), /Import unavailable/);
  assert.ok(copy.every(byte => byte === 0));
  assert.deepEqual(signature, originalSignature);
  const journal = await open(noAccess);
  journal.close();
});

test('backup is encrypted, same-wallet portable and restores new signatures as unverified', async()=>{
 const source=storageFixture(),journal=await open(source);await journal.upsert(record({status:'finalized',signature:'3'.repeat(88)}));
 const before=source.data.get(storageKey),backup=await journal.exportBackup();assert.equal(source.data.get(storageKey),before);
 for(const secret of ['activity_1','987654321','finalized','3'.repeat(88)])assert.equal(backup.includes(secret),false);
 const target=storageFixture(),restored=await open(target);assert.equal((await restored.inspectBackup(backup)).added,1);assert.equal(target.data.size,0);
 const records=await restored.restoreBackup(backup);assert.equal(records[0].status,'unverified');assert.equal(records[0].amount,'987654321');
 assert.equal((await restored.inspectBackup(backup)).duplicates,1);assert.equal((await restored.restoreBackup(backup)).length,1);
});
test('wrong-wallet, corrupted and conflicting backups never overwrite current history',async()=>{
 const target=storageFixture(),journal=await open(target);await journal.upsert(record());const original=target.data.get(storageKey);
 const source=await open(storageFixture());await source.upsert(record({amount:'1'}));const conflicting=await source.exportBackup();await assert.rejects(journal.restoreBackup(conflicting),/conflict/);
 const own=JSON.parse(await journal.exportBackup());own.owner=otherOwner;await assert.rejects(journal.restoreBackup(JSON.stringify(own)),/different wallet/);
 own.owner=owner;own.envelope.ciphertext='AAAA';await assert.rejects(journal.restoreBackup(JSON.stringify(own)));
 await assert.rejects(journal.restoreBackup('x'.repeat(225281)));assert.equal(target.data.get(storageKey),original);
});
test('backup merge retains the newest 100, preserves local verification and uncertain unsigned outcomes',async()=>{
 const a=await open(storageFixture()),b=await open(storageFixture());
 for(let i=0;i<100;i++)await a.upsert(record({id:'a'+i,createdAt:i+1,updatedAt:i+1}));
 await b.upsert(record({id:'b',createdAt:101,updatedAt:101,status:'submission-unknown'}));const backup=await a.exportBackup();
 assert.equal((await b.inspectBackup(backup)).dropped,1);const records=await b.restoreBackup(backup);assert.equal(records.length,100);assert.ok(records.some(r=>r.id==='b'));assert.ok(!records.some(r=>r.id==='a0'));assert.ok(records.every(r=>r.status==='submission-unknown'));
 const sig='3'.repeat(88);await b.upsert(record({id:'b',createdAt:101,updatedAt:102,status:'finalized',signature:sig}));const own=await b.exportBackup();assert.equal((await b.restoreBackup(own)).find(r=>r.id==='b').status,'finalized');
});
test('locking during backup decryption cancels restore without writing',async()=>{
 const source=await open(storageFixture());await source.upsert(record());const backup=await source.exportBackup();
 const wait=deferred(),target=storageFixture();const journal=await open(target,{crypto:controlledCrypto('decrypt',()=>wait.promise)});
 const promise=journal.restoreBackup(backup);await new Promise(resolve=>setTimeout(resolve,10));journal.close();wait.resolve();await assert.rejects(promise);assert.equal(target.data.size,0);
});
