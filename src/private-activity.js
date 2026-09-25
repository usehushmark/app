const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const ACTIVITY_SCHEMA_VERSION = 1;
export const ACTIVITY_MAX_RECORDS = 100;
export const ACTIVITY_MAX_STORAGE_BYTES = 200 * 1024;
export const ACTIVITY_STATUSES = Object.freeze([
  'preparing', 'not-submitted', 'submission-unknown', 'submitted', 'processing',
  'confirmed', 'finalized', 'failed', 'not-found', 'proof-mismatch', 'unverified',
]);

const allowedFields = new Set(['id', 'type', 'asset', 'amount', 'netAmount', 'fee', 'createdAt', 'updatedAt', 'status', 'signature', 'proofDigest']);
const requiredFields = ['id', 'type', 'asset', 'amount', 'createdAt', 'updatedAt', 'status'];
const statuses = new Set(ACTIVITY_STATUSES);
const ownerPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const atomicPattern = /^(0|[1-9][0-9]{0,19})$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const maxAtomic = 18446744073709551615n;
const corruptMessage = 'Private activity could not be decrypted or is invalid. Existing data was kept.';

export function privateActivityStorageKey(owner) {
  if (typeof owner !== 'string' || !ownerPattern.test(owner)) throw new TypeError('Invalid activity account.');
  return `hushmark:activity:v1:${owner}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function checkAtomic(value, field) {
  if (typeof value !== 'string' || !atomicPattern.test(value) || BigInt(value) > maxAtomic) throw new TypeError(`Invalid activity ${field}.`);
}

function checkPatch(value) {
  if (!isPlainObject(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowedFields.has(key))) throw new TypeError('Unsupported activity record field.');
  const patch = {...value};
  if ('id' in patch && (typeof patch.id !== 'string' || !idPattern.test(patch.id))) throw new TypeError('Invalid activity ID.');
  if ('type' in patch && !['deposit', 'withdraw'].includes(patch.type)) throw new TypeError('Invalid activity type.');
  if ('asset' in patch && !['SOL', 'USDC'].includes(patch.asset)) throw new TypeError('Invalid activity asset.');
  for (const field of ['amount', 'netAmount', 'fee']) if (field in patch) checkAtomic(patch[field], field);
  for (const field of ['createdAt', 'updatedAt']) if (field in patch && (!Number.isSafeInteger(patch[field]) || patch[field] < 0)) throw new TypeError(`Invalid activity ${field}.`);
  if ('status' in patch && (typeof patch.status !== 'string' || !statuses.has(patch.status))) throw new TypeError('Invalid activity status.');
  if ('signature' in patch && (typeof patch.signature !== 'string' || !signaturePattern.test(patch.signature))) throw new TypeError('Invalid activity signature.');
  if ('proofDigest' in patch && (typeof patch.proofDigest !== 'string' || !digestPattern.test(patch.proofDigest))) throw new TypeError('Invalid activity proof digest.');
  return patch;
}

function checkRecord(value) {
  const record = checkPatch(value);
  if (requiredFields.some(field => !Object.hasOwn(record, field))) throw new TypeError('Incomplete activity record.');
  if (record.updatedAt < record.createdAt) throw new TypeError('Invalid activity timestamps.');
  if (record.type !== 'withdraw' && ('netAmount' in record || 'fee' in record || 'proofDigest' in record)) throw new TypeError('Deposit records cannot contain withdrawal fields.');
  return Object.freeze(record);
}

function snapshot(records) {
  return Object.freeze([...records].sort((left, right) => right.createdAt - left.createdAt || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)));
}

function toBase64(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 8192) result += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(result);
}

function fromBase64(value) {
  if (typeof value !== 'string' || !value.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error(corruptMessage);
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Error(corruptMessage);
  return bytes;
}

export async function createPrivateActivity({owner, signature, storage, crypto = globalThis.crypto}) {
  const storageKey = privateActivityStorageKey(owner);
  if (!(signature instanceof Uint8Array) || signature.byteLength !== 64) throw new TypeError('A 64-byte unlock signature is required for private activity.');
  if (!storage || ['getItem', 'setItem', 'removeItem'].some(method => typeof storage[method] !== 'function')) throw new TypeError('Private activity storage is unavailable.');
  if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') throw new Error('Secure browser cryptography is unavailable.');

  const signatureCopy = new Uint8Array(signature);
  let material;
  try {
    material = await crypto.subtle.importKey('raw', signatureCopy, 'HKDF', false, ['deriveKey']);
  } finally {
    signatureCopy.fill(0);
  }
  let key = await crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256',
    salt: encoder.encode(`hushmark:activity:v1:owner:${owner}`),
    info: encoder.encode('Hushmark private activity journal / v1 / AES-256-GCM'),
  }, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  material = null;
  const additionalData = encoder.encode(JSON.stringify({schema: ACTIVITY_SCHEMA_VERSION, owner, purpose: 'hushmark-private-activity'}));
  const locks = globalThis.navigator?.locks;
  let closed = false;
  let queue = Promise.resolve();

  function ensureOpen() {
    if (closed || !key) throw new Error('Private activity session is closed.');
  }

  function enqueue(operation) {
    const next = queue.then(async () => {
      ensureOpen();
      const run = async () => {
        ensureOpen();
        const result = await operation();
        ensureOpen();
        return result;
      };
      return typeof locks?.request === 'function' ? locks.request(storageKey, {mode: 'exclusive'}, run) : run();
    });
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function readLatest() {
    ensureOpen();
    const stored = storage.getItem(storageKey);
    if (stored === null) return snapshot([]);
    let plaintext;
    try {
      if (typeof stored !== 'string' || encoder.encode(stored).byteLength > ACTIVITY_MAX_STORAGE_BYTES) throw new Error(corruptMessage);
      const envelope = JSON.parse(stored);
      if (!isPlainObject(envelope) || Object.keys(envelope).sort().join(',') !== 'ciphertext,iv,version' || envelope.version !== ACTIVITY_SCHEMA_VERSION) throw new Error(corruptMessage);
      const iv = fromBase64(envelope.iv);
      const ciphertext = fromBase64(envelope.ciphertext);
      if (iv.byteLength !== 12 || ciphertext.byteLength < 18) throw new Error(corruptMessage);
      plaintext = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData, tagLength: 128}, key, ciphertext));
      ensureOpen();
      const records = JSON.parse(decoder.decode(plaintext));
      if (!Array.isArray(records) || records.length > ACTIVITY_MAX_RECORDS) throw new Error(corruptMessage);
      const checked = records.map(checkRecord);
      if (new Set(checked.map(record => record.id)).size !== checked.length) throw new Error(corruptMessage);
      return snapshot(checked);
    } catch {
      ensureOpen();
      throw new Error(corruptMessage);
    } finally {
      plaintext?.fill(0);
    }
  }

  async function write(records) {
    ensureOpen();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify(records));
    let encrypted;
    try {
      encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData, tagLength: 128}, key, plaintext);
    } finally {
      plaintext.fill(0);
    }
    const envelope = JSON.stringify({version: ACTIVITY_SCHEMA_VERSION, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted))});
    if (encoder.encode(envelope).byteLength > ACTIVITY_MAX_STORAGE_BYTES) throw new Error('Private activity exceeds the local storage limit.');
    storage.setItem(storageKey, envelope);
    return snapshot(records);
  }

  return Object.freeze({
    read: () => enqueue(readLatest),
    upsert(record) {
      let patch;
      try { ensureOpen(); patch = checkPatch(record); } catch (error) { return Promise.reject(error); }
      return enqueue(async () => {
        const current = await readLatest();
        const previous = current.find(item => item.id === patch.id);
        const updated = checkRecord({...previous, ...patch});
        return write(snapshot([...current.filter(item => item.id !== updated.id), updated]).slice(0, ACTIVITY_MAX_RECORDS));
      });
    },
    clear: () => enqueue(async () => { storage.removeItem(storageKey); return snapshot([]); }),
    close: () => { closed = true; key = null; },
  });
}
