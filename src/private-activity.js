// This journal is local to the browser. Its key is separate from protocol note keys.
export const ACTIVITY_SCHEMA_VERSION = 1;
export const ACTIVITY_MAX_RECORDS = 100;
export const ACTIVITY_MAX_STORAGE_BYTES = 200 * 1024;
export const ACTIVITY_MAX_BACKUP_BYTES = 220 * 1024;
export const ACTIVITY_STATUSES = Object.freeze([
  'preparing', 'not-submitted', 'submission-unknown', 'submitted', 'processing',
  'confirmed', 'finalized', 'failed', 'not-found', 'proof-mismatch', 'unverified',
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const fields = new Set(['id', 'type', 'asset', 'amount', 'netAmount', 'fee', 'createdAt', 'updatedAt', 'status', 'signature', 'proofDigest']);
const required = ['id', 'type', 'asset', 'amount', 'createdAt', 'updatedAt', 'status'];
const optional = ['netAmount', 'fee', 'signature', 'proofDigest'];
const statuses = new Set(ACTIVITY_STATUSES);
const ownerPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const atomicPattern = /^(0|[1-9][0-9]{0,19})$/;
const maxAtomic = 18446744073709551615n;
const closedMessage = 'Private activity session is closed.';
const corruptMessage = 'Private activity could not be decrypted or is invalid. Existing data was kept.';

export function privateActivityStorageKey(owner) {
  if (typeof owner !== 'string' || !ownerPattern.test(owner)) throw new TypeError('Invalid activity account.');
  return 'hushmark:activity:v1:' + owner;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function checkedPatch(value) {
  if (!plainObject(value)) throw new TypeError('Invalid activity record.');
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.has(key))) {
    throw new TypeError('Unsupported activity record field.');
  }
  const patch = {};
  for (const field of fields) {
    if (Object.hasOwn(value, field) && value[field] !== undefined) patch[field] = value[field];
  }
  if (typeof patch.id !== 'string' || !idPattern.test(patch.id)) throw new TypeError('Invalid activity record id.');
  return patch;
}

function checkedRecord(value) {
  const record = checkedPatch(value);
  if (required.some(field => !Object.hasOwn(record, field))) throw new TypeError('Incomplete activity record.');
  if (!['deposit', 'withdraw'].includes(record.type) || !['SOL', 'USDC'].includes(record.asset)) throw new TypeError('Invalid activity type or asset.');
  for (const field of ['amount', 'netAmount', 'fee']) {
    if (field !== 'amount' && !Object.hasOwn(record, field)) continue;
    const amount = record[field];
    if (typeof amount !== 'string' || !atomicPattern.test(amount) || BigInt(amount) > maxAtomic) throw new TypeError('Invalid atomic activity amount.');
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (!Number.isSafeInteger(record[field]) || record[field] < 0 || record[field] > 8640000000000000) throw new TypeError('Invalid activity timestamp.');
  }
  if (record.updatedAt < record.createdAt || !statuses.has(record.status)) throw new TypeError('Invalid activity status or timestamp.');
  if (Object.hasOwn(record, 'signature') && (typeof record.signature !== 'string' || !signaturePattern.test(record.signature))) throw new TypeError('Invalid activity transaction signature.');
  if (Object.hasOwn(record, 'proofDigest') && (typeof record.proofDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.proofDigest))) throw new TypeError('Invalid activity proof digest.');
  // Copy only the documented fields, in a stable order, into a detached snapshot.
  const clean = {};
  for (const field of [...required, ...optional]) if (Object.hasOwn(record, field)) clean[field] = record[field];
  return Object.freeze(clean);
}

function snapshot(records) {
  return Object.freeze([...records].sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

function base64(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}

function unbase64(value) {
  if (typeof value !== 'string' || !value.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error(corruptMessage);
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error(corruptMessage);
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
    salt: encoder.encode('hushmark:activity:v1:owner:' + owner),
    info: encoder.encode('Hushmark private activity journal / v1 / AES-256-GCM'),
  }, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  material = null;
  const aad = encoder.encode(JSON.stringify({schema: ACTIVITY_SCHEMA_VERSION, owner, purpose: 'hushmark-private-activity'}));
  const locks = globalThis.navigator?.locks;
  let closed = false;
  let queue = Promise.resolve();

  function ensureOpen() {
    if (closed || !key) throw new Error(closedMessage);
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
      return typeof locks?.request === 'function'
        ? locks.request(storageKey, {mode: 'exclusive'}, run)
        : run();
    });
    // Keep sequencing state without retaining decrypted result arrays internally.
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function readLatest() {
    ensureOpen();
    const stored = storage.getItem(storageKey);
    ensureOpen();
    if (stored === null) return snapshot([]);
    return decodeEnvelope(stored);
  }

  async function decodeEnvelope(stored) {
    let plaintext;
    try {
      if (typeof stored !== 'string' || stored.length > ACTIVITY_MAX_STORAGE_BYTES || encoder.encode(stored).length > ACTIVITY_MAX_STORAGE_BYTES) throw new Error(corruptMessage);
      const envelope = JSON.parse(stored);
      if (!plainObject(envelope) || Object.keys(envelope).sort().join(',') !== 'ciphertext,iv,version' || envelope.version !== ACTIVITY_SCHEMA_VERSION) throw new Error(corruptMessage);
      const iv = unbase64(envelope.iv);
      const ciphertext = unbase64(envelope.ciphertext);
      if (iv.length !== 12 || ciphertext.length < 18) throw new Error(corruptMessage);
      plaintext = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, ciphertext));
      ensureOpen();
      const parsed = JSON.parse(decoder.decode(plaintext));
      if (!Array.isArray(parsed) || parsed.length > ACTIVITY_MAX_RECORDS) throw new Error(corruptMessage);
      const records = parsed.map(checkedRecord);
      if (new Set(records.map(record => record.id)).size !== records.length) throw new Error(corruptMessage);
      return snapshot(records);
    } catch {
      ensureOpen();
      throw new Error(corruptMessage);
    } finally {
      plaintext?.fill(0);
    }
  }

  async function encodeEnvelope(records) {
    ensureOpen();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify(records));
    let encrypted;
    try {
      encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, plaintext);
    } finally {
      plaintext.fill(0);
    }
    ensureOpen();
    const encoded = JSON.stringify({version: ACTIVITY_SCHEMA_VERSION, iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted))});
    if (encoded.length > ACTIVITY_MAX_STORAGE_BYTES) throw new Error('Private activity exceeds the local storage limit.');
    ensureOpen();
    return encoded;
  }

  async function write(records) {
    const encoded = await encodeEnvelope(records);
    ensureOpen();
    storage.setItem(storageKey, encoded);
    return snapshot(records);
  }

  async function decodeBackup(text) {
    ensureOpen();
    if (typeof text !== 'string' || text.length > ACTIVITY_MAX_BACKUP_BYTES || encoder.encode(text).length > ACTIVITY_MAX_BACKUP_BYTES) throw new Error('Backup file is too large or invalid.');
    const backup = JSON.parse(text);
    if (!plainObject(backup) || Object.keys(backup).sort().join(',') !== 'envelope,format,owner,version' || backup.format !== 'hushmark-activity-backup' || backup.version !== 1) throw new Error('Unsupported Hushmark activity backup.');
    if (backup.owner !== owner) throw new Error('This backup belongs to a different wallet. Unlock its original wallet.');
    return decodeEnvelope(JSON.stringify(backup.envelope));
  }

  function mergeBackup(current, incoming) {
    const records = new Map(current.map(record => [record.id, record]));
    let added = 0;
    for (const record of incoming) {
      const existing = records.get(record.id);
      if (existing) {
        for (const field of ['type','asset','amount','createdAt','netAmount','fee']) {
          if (existing[field] !== record[field]) throw new Error('Backup conflicts with a saved activity. Existing history was kept.');
        }
        for (const field of ['signature','proofDigest']) {
          if (existing[field] && record[field] && existing[field] !== record[field]) throw new Error('Backup transaction details conflict with saved history.');
        }
        // Preserve local verified state, but recover a missing locator/proof from
        // the authenticated backup. It still requires an explicit network check.
        const extra = {};
        for (const field of ['signature','proofDigest']) if (!existing[field] && record[field]) extra[field] = record[field];
        records.set(record.id, checkedRecord({...existing, ...extra, ...(extra.signature ? {status:'unverified'} : {})}));
      } else {
        added++;
        records.set(record.id, checkedRecord({...record, status: record.signature ? 'unverified' : record.status === 'not-submitted' ? 'not-submitted' : 'submission-unknown'}));
      }
    }
    const sorted = snapshot([...records.values()]);
    return {records: snapshot(sorted.slice(0, ACTIVITY_MAX_RECORDS)), added, duplicates: incoming.length-added, dropped: Math.max(0, sorted.length-ACTIVITY_MAX_RECORDS)};
  }

  return Object.freeze({
    read() { return enqueue(readLatest); },
    exportBackup() {
      return enqueue(async () => {
        const records = await readLatest();
        const envelope = JSON.parse(await encodeEnvelope(records));
        ensureOpen();
        return JSON.stringify({format:'hushmark-activity-backup',version:1,owner,envelope});
      });
    },
    inspectBackup(text) {
      return enqueue(async () => {
        const incoming = await decodeBackup(text);
        const current = await readLatest();
        const {added,duplicates,dropped,records} = mergeBackup(current,incoming);
        return Object.freeze({count:incoming.length,added,duplicates,dropped,retained:records.length});
      });
    },
    restoreBackup(text) {
      return enqueue(async () => {
        const incoming = await decodeBackup(text);
        const current = await readLatest();
        const result = mergeBackup(current,incoming);
        ensureOpen();
        return write(result.records);
      });
    },
    upsert(record) {
      // Snapshot the input before yielding, so caller edits cannot change queued writes.
      let patch;
      try { ensureOpen(); patch = checkedPatch(record); } catch (error) { return Promise.reject(error); }
      return enqueue(async () => {
        const current = await readLatest();
        ensureOpen();
        const previous = current.find(item => item.id === patch.id);
        const updated = checkedRecord({...previous, ...patch});
        const records = snapshot([...current.filter(item => item.id !== updated.id), updated]).slice(0, ACTIVITY_MAX_RECORDS);
        return write(records);
      });
    },
    clear() {
      return enqueue(async () => {
        ensureOpen();
        storage.removeItem(storageKey);
        return snapshot([]);
      });
    },
    close() { closed = true; key = null; },
  });
}
