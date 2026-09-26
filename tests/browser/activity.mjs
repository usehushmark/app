import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import bs58 from 'bs58';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.ACTIVITY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Activity tests only target a local preview.');
const program = '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';
const proof = Uint8Array.from([1, 2, 3]);
const proofDigest = createHash('sha256').update(proof).digest('hex');
const createdAt = Date.now() - 60_000;
const deposit = {
  id: '6b916c36-17b8-4b14-b74e-d9b4d14eaa21', type: 'deposit', asset: 'SOL',
  amount: '123456789', netAmount: '123456789', fee: '0', createdAt,
  updatedAt: createdAt, status: 'submitted', signature: bs58.encode(new Uint8Array(64).fill(4)),
};
const withdrawal = {
  id: '616e9b73-9460-471e-a8b6-f37992063222', type: 'withdraw', asset: 'USDC',
  amount: '87654321', netAmount: '87653445', fee: '876', createdAt: createdAt + 1,
  updatedAt: createdAt + 1, status: 'submitted', signature: bs58.encode(new Uint8Array(64).fill(5)), proofDigest,
};
const records = [deposit, withdrawal];
const privateValues = [deposit.signature, withdrawal.signature, '0.123456789', '87.654321'];
const bundleOptions = {bundle: true, format: 'iife', platform: 'browser', write: false, inject: ['src/polyfill.js']};
const providerBundle = await build({...bundleOptions, entryPoints: ['tests/browser/provider.js']});
// Test-only helper uses the journal's public API; the application exposes no testing hook.
const journalBundle = await build({...bundleOptions, stdin: {
  resolveDir: process.cwd(), sourcefile: 'activity-fixture.js', contents: `
    import {Keypair} from '@solana/web3.js';
    import nacl from 'tweetnacl';
    import {createPrivateActivity, privateActivityStorageKey} from './src/private-activity.js';
    import {SIGN_MESSAGE} from './src/privacy-guards.js';
    const alternateSeed = () => Uint8Array.from({length: 32}, (_, i) => i + 33);
    const keyFor = alternate => Keypair.fromSeed(alternate ? alternateSeed() : new Uint8Array(window.__auditSeed));
    async function withJournal(run, alternate = false) {
      const key = keyFor(alternate);
      const signature = nacl.sign.detached(new TextEncoder().encode(SIGN_MESSAGE), key.secretKey);
      const journal = await createPrivateActivity({owner: key.publicKey.toBase58(), signature, storage: localStorage, crypto});
      signature.fill(0);
      try { return await run(journal); } finally { journal.close(); }
    }
    window.activityFixture = {
      owner: () => keyFor(false).publicKey.toBase58(),
      storageKey: (alternate = false) => privateActivityStorageKey(keyFor(alternate).publicKey.toBase58()),
      read: () => withJournal(journal => journal.read()),
      seed: (records, alternate = false) => withJournal(async journal => {
        for (const record of records) await journal.upsert(record);
        return journal.read();
      }, alternate),
    };
  `,
}});

const browser = await chromium.launch({executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true});
const context = await browser.newContext({serviceWorkers: 'block'});
const page = await context.newPage();
const errors = [], blocked = [], rpcCalls = [];
let withdrawalReceipt = 'missing';
const statuses = new Map();
const status = (confirmationStatus, err = null) => ({slot: 100, confirmations: confirmationStatus === 'finalized' ? null : 1, confirmationStatus, err});
const config = {withdraw_fee_rate: .0035, withdraw_rent_fee: .006, rent_fees: {usdc: .7}, minimum_withdrawal: {sol: .01, usdc: 2}};
page.on('pageerror', error => errors.push(error.message));

await page.addInitScript({content: `
  window.__auditSeed = Array.from({length: 32}, (_, i) => i + (window.name === 'activity-account-b' ? 33 : 1));
  ${providerBundle.outputFiles[0].text}
  ${journalBundle.outputFiles[0].text}
`});

// Every request is reviewed. Only local assets and the listed fake read responses are allowed.
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin === base.origin && ['GET', 'HEAD'].includes(request.method())) {
    await route.continue();
    return;
  }
  if (url.hostname === 'api3.privacycash.org' && request.method() === 'GET') {
    if (url.pathname === '/config') { await route.fulfill({json: config}); return; }
    if (url.pathname === '/utxos/range') {
      await route.fulfill({json: {encrypted_outputs: [], hasMore: false, total: 0}});
      return;
    }
  }
  if (url.hostname === 'solana-rpc.publicnode.com' && request.method() === 'POST') {
    const req = request.postDataJSON();
    rpcCalls.push({method: req.method, params: req.params});
    const ctx = value => ({context: {slot: 100}, value});
    let result;
    if (req.method === 'getGenesisHash') result = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
    else if (req.method === 'getBalance') result = ctx(2_000_000_000);
    else if (req.method === 'getAccountInfo') result = ctx(req.params[0] === program
      ? {data: ['', 'base64'], executable: true, owner: '11111111111111111111111111111111', lamports: 1, rentEpoch: 0}
      : null);
    else if (req.method === 'getSignatureStatuses') result = ctx(req.params[0].map(signature => statuses.get(signature) ?? null));
    else if (req.method === 'getTransaction') {
      assert.equal(req.params[0], withdrawal.signature, 'Only the withdrawal proof fixture may be fetched.');
      if (withdrawalReceipt === 'missing') result = null;
      else result = {
        slot: 100, blockTime: 1,
        meta: {err: null, fee: 5000, preBalances: [0], postBalances: [0]},
        transaction: {
          signatures: [withdrawal.signature],
          message: {
            header: {numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1},
            accountKeys: [program], recentBlockhash: '1'.repeat(32),
            instructions: [{programIdIndex: 0, accounts: [], data: bs58.encode(withdrawalReceipt === 'mismatch' ? Uint8Array.from([3, 2, 1]) : proof)}],
          },
        },
        version: 'legacy',
      };
    } else {
      blocked.push(`RPC ${req.method}`);
      await route.abort();
      return;
    }
    await route.fulfill({json: {jsonrpc: '2.0', id: req.id, result}});
    return;
  }
  blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
  await route.abort();
});

async function unlock() {
  await page.locator('#software-wallet').check();
  await page.locator('#unlock').click();
  await page.waitForFunction(() => !document.getElementById('unlock').disabled, {}, {timeout: 60_000});
  assert.equal(await page.locator('#unlock-state').textContent(), 'UNLOCKED', await page.locator('#privacy-status').textContent());
  assert.equal(await page.evaluate(() => window.fixtureSigns), 2, 'Opening local history requires no extra wallet signature.');
}

async function assertNoPrivateDom(reason) {
  assert.equal(await page.locator('[data-activity-id]').count(), 0, reason);
  const html = await page.locator('body').innerHTML();
  for (const value of privateValues) assert.ok(!html.includes(value), `${reason}: private value remains in the DOM`);
}

async function assertVisibleRecords() {
  await page.waitForFunction(() => document.querySelectorAll('[data-activity-id]').length === 2);
  const text = await page.locator('#activity-list').innerText();
  assert.match(text, /0\.123456789/);
  assert.match(text, /87\.654321/);
  assert.match(text, /SOL/);
  assert.match(text, /USDC/);
  assert.equal(await page.locator('[data-activity-id]').first().getAttribute('data-activity-id'), withdrawal.id, 'Newest record appears first.');
}

async function refresh(record, expected) {
  await page.locator(`[data-activity-refresh="${record.id}"]`).click();
  await page.waitForFunction(id => {
    const button = document.querySelector(`[data-activity-refresh="${id}"]`);
    return button && !button.disabled;
  }, record.id, {timeout: 15_000});
  const updated = (await page.evaluate(() => window.activityFixture.read())).find(item => item.id === record.id);
  assert.equal(updated.status, expected, await page.locator('#privacy-status').textContent());
  if (expected !== 'finalized') assert.doesNotMatch(await page.locator(`[data-activity-id="${record.id}"]`).innerText(), /^Finalized$/m);
}

try {
  await page.goto(new URL('wallet/', base).href);
  await assertNoPrivateDom('Initial locked state');
  assert.match(await page.locator('#activity-state').innerText(), /unlock|lock/i);
  await unlock();
  assert.equal(await page.locator('[data-activity-id]').count(), 0);
  assert.match(await page.locator('#activity-state').innerText(), /no |empty|yet/i);

  await page.evaluate(records => window.activityFixture.seed(records), records);
  const owner = await page.evaluate(() => window.activityFixture.owner());
  const storageKey = `hushmark:activity:v1:${owner}`;
  const originalCiphertext = await page.evaluate(key => localStorage.getItem(key), storageKey);
  const envelope = JSON.parse(originalCiphertext);
  assert.equal(typeof envelope.ciphertext, 'string');
  assert.ok(envelope.ciphertext.length > 20);
  for (const record of records) {
    for (const value of [record.id, record.signature, record.amount, record.proofDigest].filter(Boolean)) {
      assert.ok(!originalCiphertext.includes(value), 'Persistent journal must not contain record plaintext.');
    }
  }
  await page.reload();
  await assertNoPrivateDom('Reload before unlock');
  await unlock();
  await assertVisibleRecords();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), originalCiphertext, 'Unlock/read does not rewrite saved records.');

  await page.locator('#activity-toggle').click();
  await assertNoPrivateDom('Hidden activity');
  await page.locator('#activity-toggle').click();
  await assertVisibleRecords();
  await page.locator('#lock').click();
  assert.equal(await page.locator('#unlock-state').textContent(), 'LOCKED');
  await assertNoPrivateDom('Explicit lock');

  await page.evaluate(() => { window.name = 'activity-account-b'; });
  await page.reload();
  await unlock();
  assert.notEqual(await page.locator('#owner').textContent(), owner);
  await assertNoPrivateDom('Different wallet must not see original history');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), originalCiphertext);
  await page.evaluate(() => { window.name = ''; });
  await page.reload();
  await unlock();
  await assertVisibleRecords();

  statuses.set(deposit.signature, null);
  await refresh(deposit, 'not-found');
  statuses.set(deposit.signature, status('processed'));
  await refresh(deposit, 'processing');
  statuses.set(deposit.signature, status('confirmed'));
  await refresh(deposit, 'confirmed');
  statuses.set(deposit.signature, status('finalized', {InstructionError: [0, {Custom: 9}]}));
  await refresh(deposit, 'failed');
  statuses.set(deposit.signature, status('finalized'));
  await refresh(deposit, 'finalized');
  assert.equal(rpcCalls.filter(call => call.method === 'getTransaction').length, 0, 'Deposit refresh does not apply the withdrawal proof rule.');

  statuses.set(withdrawal.signature, status('finalized'));
  withdrawalReceipt = 'missing';
  await refresh(withdrawal, 'unverified');
  withdrawalReceipt = 'mismatch';
  await refresh(withdrawal, 'proof-mismatch');
  withdrawalReceipt = 'match';
  await refresh(withdrawal, 'finalized');
  assert.equal(rpcCalls.filter(call => call.method === 'getTransaction').length, 3, 'Every finalized withdrawal status must inspect its proof.');

  mkdirSync('qa', {recursive: true});
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 900});
    await assertVisibleRecords();
    const dimensions = await page.evaluate(() => ({viewport: innerWidth, content: document.documentElement.scrollWidth}));
    assert.ok(dimensions.content <= dimensions.viewport, `Activity causes horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: `qa/activity-${width}.png`, fullPage: true});
  }

  // A finalized error on an unrelated transaction is not evidence that this withdrawal failed.
  statuses.set(withdrawal.signature, status('finalized', {InstructionError: [0, {Custom: 9}]}));
  withdrawalReceipt = 'mismatch';
  await refresh(withdrawal, 'proof-mismatch');
  withdrawalReceipt = 'match';
  await refresh(withdrawal, 'failed');
  assert.equal(rpcCalls.filter(call => call.method === 'getTransaction').length, 5, 'Failed finalized withdrawals still require their approved proof.');

  // Clear is local and owner-scoped: preserve note cache, recovery fingerprint and another owner's journal.
  await page.evaluate(records => window.activityFixture.seed(records, true), records);
  const otherStorageKey = await page.evaluate(() => window.activityFixture.storageKey(true));
  const otherCiphertext = await page.evaluate(key => localStorage.getItem(key), otherStorageKey);
  const fingerprintKey = `hushmark:privacy-fingerprint:${owner}`;
  const fingerprint = await page.evaluate(key => localStorage.getItem(key), fingerprintKey);
  const noteKey = `hushmark:privacy:${owner}:activity-test-sentinel`;
  await page.evaluate(key => {
    sessionStorage.setItem(key, 'preserve-encrypted-note-cache');
    localStorage.setItem('hushmark:activity-test-unrelated', 'preserve-local-preference');
  }, noteKey);
  const beforeCancel = await page.evaluate(key => localStorage.getItem(key), storageKey);
  await page.locator('#activity-clear').click();
  assert.equal(await page.locator('#activity-clear-confirm').isVisible(), true);
  await page.locator('#activity-clear-no').click();
  assert.equal(await page.locator('#activity-clear-confirm').isVisible(), false);
  await assertVisibleRecords();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), beforeCancel);
  await page.locator('#activity-clear').click();
  await page.locator('#activity-clear-yes').click();
  await page.waitForFunction(key => localStorage.getItem(key) === null, storageKey);
  await assertNoPrivateDom('Cleared journal');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), otherStorageKey), otherCiphertext);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), fingerprintKey), fingerprint);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), noteKey), 'preserve-encrypted-note-cache');
  assert.equal(await page.evaluate(() => localStorage.getItem('hushmark:activity-test-unrelated')), 'preserve-local-preference');

  await page.evaluate(records => window.activityFixture.seed(records), records);
  const tampered = await page.evaluate(key => {
    const envelope = JSON.parse(localStorage.getItem(key));
    const bytes = Uint8Array.from(atob(envelope.ciphertext), value => value.charCodeAt(0));
    bytes[0] ^= 1;
    envelope.ciphertext = btoa(String.fromCharCode(...bytes));
    const altered = JSON.stringify(envelope);
    localStorage.setItem(key, altered);
    return altered;
  }, storageKey);
  await page.reload();
  await unlock();
  await assertNoPrivateDom('Tampered journal');
  assert.match(await page.locator('#activity-state').innerText(), /could not|cannot|unable|unavailable|invalid|decrypt|unreadable|failed/i);
  const rejected = await page.evaluate(async record => {
    try { await window.activityFixture.seed([record]); return false; } catch { return true; }
  }, deposit);
  assert.equal(rejected, true, 'Tampered records cannot be silently overwritten.');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), tampered);
  await page.locator('#activity-clear').click();
  await page.locator('#activity-clear-yes').click();
  await page.waitForFunction(key => localStorage.getItem(key) === null, storageKey);
  assert.equal(await page.locator('#unlock-state').textContent(), 'UNLOCKED', 'Local journal failure must not block the wallet session.');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), otherStorageKey), otherCiphertext);

  assert.equal(await page.evaluate(() => window.fixtureTxSigns || 0), 0);
  assert.deepEqual(blocked, [], 'Unexpected requests are blocked, including every financial mutation.');
  assert.deepEqual(errors, []);
  console.log('PASS: encrypted activity recovery, owner isolation, locked/hidden DOM privacy, owner-scoped clear, tamper protection and proof-checked withdrawal status. RPC results were fixtures; no financial submission or real settlement occurred.');
} finally {
  await browser.close();
}
