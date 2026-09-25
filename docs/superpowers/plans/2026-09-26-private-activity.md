# Private Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an encrypted, wallet-scoped local journal for Hushmark deposits and withdrawals without changing protocol transaction behavior or exposing private activity while locked.

**Architecture:** Keep the current application as the source of truth and add four focused modules: encrypted persistence, status verification, safe DOM rendering, and static markup. Integrate the journal into the existing `src/privacy.js` unlock, lock, relay, and finality paths without changing the existing two-signature recovery flow, then inject the new wallet and Docs content through the current generator and enhancer.

**Tech Stack:** Browser Web Crypto (HKDF + AES-GCM), localStorage, Solana Web3.js, vanilla ES modules, Node test runner, Playwright, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-26-private-activity-design.md`

## Global Constraints

- Preserve `SIGN_MESSAGE = 'Privacy Money account sign in'`, the two-signature unlock flow, Privacy Cash note-key behavior, relay payload validation, and recipient validation exactly as implemented.
- Derive a separate, non-extractable AES-256-GCM activity key with HKDF SHA-256 from the first existing unlock signature; never request a third signature.
- Persist one encrypted owner-scoped localStorage envelope at `hushmark:activity:v1:<owner>`, retaining at most 100 records and 200 KiB.
- Persist only record ID, type, asset, atomic amount, net amount, fee, timestamps, status, public signature, and withdrawal proof digest.
- Never persist recipients, raw proofs, signatures used as key material, private-note keys, errors, or balances; clear decrypted DOM on hide and lock.
- Never silently overwrite corrupt activity ciphertext; retain it until an explicit owner-scoped clear.
- All status checks are manual. Pending, missing, and unverified withdrawals must never be rendered as finalized.
- Keep current HUSHM/CA controls, Whitepaper routing, mobile chrome, Docs/Roadmap shell, and deployment configuration authoritative. Do not copy archived `dist` files or deployment manifests.

## Review Focus

- A storage quota or localStorage exception must warn about incomplete history without blocking a valid unlocked wallet session; cover in Task 4.
- Malformed, oversized, cross-owner, or authentication-failed ciphertext must stay stored and cannot be replaced until explicit clear; cover in Task 1.
- A session lock that occurs during an RPC response must prevent the status result from reaching the DOM or local journal; cover in Task 2.
- A record at retention or serialized-size limits must keep only valid bounded data and fail before unsafe persistence; cover in Task 1.
- A recipient, raw proof, or saved amount must not remain in localStorage or DOM while locked/hidden; cover in Task 5.

---

## File Structure

- Create `src/private-activity.js`: validate bounded records; derive and manage the encrypted owner-scoped journal.
- Create `src/activity-status.js`: translate record status and verify a saved public signature, including withdrawal proof-digest binding.
- Create `src/activity-view.js`: create and remove activity DOM nodes safely without interpolating private values as HTML.
- Create `src/activity-markup.js`: own wallet activity section and Docs content strings.
- Modify `src/privacy.js`: connect journal/view lifecycle to existing session and payment flow.
- Modify `generate-privacy.mjs`: place activity markup after wallet controls, Docs content before Token status, and the integrated Roadmap entry.
- Modify `site-enhance.mjs`: expose `Activity` as the sixth Docs sidebar/search section.
- Modify `dist/privacy.css`: style the journal responsively without changing existing header/footer styles.
- Create `tests/private-activity.test.mjs` and `tests/activity-status.test.mjs`: test cryptographic persistence and status semantics.
- Create `tests/browser/activity.mjs`: test locked DOM behavior, owner isolation, network requests, responsive layout, and manual refresh.
- Modify `tests/site-enhance.test.mjs`: assert generated Docs navigation includes the activity section and six-section count.

### Task 1: Encrypted activity persistence

**Files:**
- Create: `src/private-activity.js`
- Test: `tests/private-activity.test.mjs`

**Interfaces:**
- Consumes: a base58 wallet owner string, exactly 64-byte existing unlock signature, Storage-compatible `{getItem,setItem,removeItem}`, and Web Crypto.
- Produces: `privateActivityStorageKey(owner)`, constants `ACTIVITY_SCHEMA_VERSION`, `ACTIVITY_MAX_RECORDS`, `ACTIVITY_MAX_STORAGE_BYTES`, `ACTIVITY_STATUSES`, and `createPrivateActivity({owner, signature, storage, crypto})` returning `{read(), upsert(record), clear(), close()}`.

- [ ] **Step 1: Write the failing persistence and privacy tests**

```js
test('encrypts owner-scoped records and never stores plaintext fields', async () => {
  const journal = await open(storageFixture());
  await journal.upsert(record({signature: '3'.repeat(88), proofDigest: 'a'.repeat(64)}));
  const ciphertext = storage.getItem(privateActivityStorageKey(owner));
  assert.doesNotMatch(ciphertext, /activity_1|987654321|3{88}|a{64}/);
  assert.deepEqual(await journal.read(), [record({signature: '3'.repeat(88), proofDigest: 'a'.repeat(64)})]);
});

test('retains invalid ciphertext until explicit clear and rejects writes', async () => {
  storage.setItem(privateActivityStorageKey(owner), '{"version":1,"iv":"bad","ciphertext":"bad"}');
  const journal = await open(storage);
  await assert.rejects(journal.read(), /could not be decrypted/);
  await assert.rejects(journal.upsert(record()), /could not be decrypted/);
  await journal.clear();
  assert.equal(storage.getItem(privateActivityStorageKey(owner)), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/private-activity.test.mjs`

Expected: FAIL because `src/private-activity.js` does not exist.

- [ ] **Step 3: Implement the bounded encrypted journal**

```js
export async function createPrivateActivity({owner, signature, storage, crypto = globalThis.crypto}) {
  const key = await deriveOwnerBoundActivityKey(owner, signature, crypto);
  return Object.freeze({
    read: () => enqueue(readLatest),
    upsert: record => enqueue(() => mergeAndWrite(record)),
    clear: () => enqueue(clearOwnerJournal),
    close: () => { closed = true; key = null; },
  });
}
```

Implement strict object-key validation; accepted records are limited to the fields in the global constraints. Use HKDF with owner-bound salt and activity-specific `info`, AES-GCM with a fresh 12-byte IV and authenticated schema/owner additional data, an in-process queue plus `navigator.locks` where available, and zero temporary signature/plaintext byte arrays in `finally` blocks. Validate envelope shape, size, duplicate IDs, status, type, asset, atomic integers, signature, proof-digest format, and maximum record count before returning a frozen time-sorted snapshot.

- [ ] **Step 4: Expand the test file for boundaries and failure modes**

```js
test('keeps journals isolated by owner and key material', async () => {
  const first = await open(storage, {owner, signature});
  await first.upsert(record());
  const second = await open(storage, {owner: otherOwner, signature: alternateSignature});
  assert.deepEqual(await second.read(), []);
});

test('caps records and rejects an encoded envelope above 200 KiB', async () => {
  const journal = await open(storage);
  for (let index = 0; index < ACTIVITY_MAX_RECORDS + 1; index++) await journal.upsert(record({id: `activity_${index}`, createdAt: index, updatedAt: index}));
  assert.equal((await journal.read()).length, ACTIVITY_MAX_RECORDS);
  storage.setItem(privateActivityStorageKey(owner), 'x'.repeat(ACTIVITY_MAX_STORAGE_BYTES + 1));
  await assert.rejects(journal.read(), /could not be decrypted/);
});
```

Also test invalid 64-byte key material, unsupported record fields such as `recipient` and `rawProof`, storage exceptions, queued immutable patches, close-after-read rejection, and concurrent upserts.

- [ ] **Step 5: Run the persistence tests**

Run: `node --test tests/private-activity.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add src/private-activity.js tests/private-activity.test.mjs
git commit -m "Add encrypted private activity journal"
```

### Task 2: Transaction-status verification

**Files:**
- Create: `src/activity-status.js`
- Test: `tests/activity-status.test.mjs`

**Interfaces:**
- Consumes: a journal record, Solana connection exposing `getSignatureStatuses()` and `getTransaction()`, the Privacy Cash `PROGRAM` ID, and a session `guard()`.
- Produces: `digestProof(bytes)`, `activityStatusLabel(status)`, and `verifyActivityStatus(record, connection, guard)` resolving an allowed activity status.

- [ ] **Step 1: Write the failing status tests**

```js
test('requires a matching withdrawal proof before finalized', async () => {
  const proof = Uint8Array.from([1, 2, 3]);
  const record = {type: 'withdraw', signature: '3'.repeat(88), proofDigest: await digestProof(proof)};
  assert.equal(await verifyActivityStatus(record, fixture('finalized', proof).connection, () => {}), 'finalized');
  assert.equal(await verifyActivityStatus(record, fixture('finalized', Uint8Array.from([9])).connection, () => {}), 'proof-mismatch');
});

test('does not convert missing or pending responses into finality', async () => {
  for (const status of [null, {confirmationStatus: 'processed', err: null}, {confirmationStatus: 'confirmed', err: null}]) {
    assert.notEqual(await verifyActivityStatus(depositRecord, fixture(status).connection, () => {}), 'finalized');
  }
});
```

- [ ] **Step 2: Run the status tests to verify they fail**

Run: `node --test tests/activity-status.test.mjs`

Expected: FAIL because `src/activity-status.js` does not exist.

- [ ] **Step 3: Implement digest and status verification**

```js
export async function verifyActivityStatus(record, connection, guard) {
  guard();
  const {value: [status]} = await connection.getSignatureStatuses([record.signature], {searchTransactionHistory: true});
  guard();
  if (!status) return 'not-found';
  if (status.confirmationStatus !== 'finalized') return status.confirmationStatus === 'confirmed' ? 'confirmed' : 'processing';
  if (record.type === 'deposit') return status.err ? 'failed' : 'finalized';
  return verifyFinalizedWithdrawal(record, status, connection, guard);
}
```

For a withdrawal, fetch the finalized transaction only when the signature status is finalized, locate a compiled instruction for `PROGRAM`, hash its instruction data with SHA-256, and compare it to the saved proof digest. Return `unverified` when the receipt/digest is unavailable and `proof-mismatch` for a non-matching digest. Call `guard()` before and after every awaited network read.

- [ ] **Step 4: Add lock and failure regression tests**

```js
test('does not publish a status when the session locks during an RPC read', async () => {
  let locked = false;
  const connection = {getSignatureStatuses: async () => { locked = true; return {value: [{confirmationStatus: 'finalized', err: null}]}; }};
  await assert.rejects(verifyActivityStatus(depositRecord, connection, () => { if (locked) throw new Error('Locked'); }), /Locked/);
});
```

Also cover a finalized deposit failure, a finalized withdrawal whose transaction itself has an error, missing transaction receipts, a missing proof digest, and ensure deposit checks never call `getTransaction()`.

- [ ] **Step 5: Run the status tests**

Run: `node --test tests/activity-status.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the status module**

```bash
git add src/activity-status.js tests/activity-status.test.mjs
git commit -m "Verify private activity transaction status"
```

### Task 3: Static wallet, Docs, Roadmap, and responsive journal UI

**Files:**
- Create: `src/activity-markup.js`
- Modify: `generate-privacy.mjs`
- Modify: `site-enhance.mjs:52-58`
- Modify: `dist/privacy.css`
- Test: `tests/site-enhance.test.mjs`

**Interfaces:**
- Consumes: the current wallet, Docs, and Roadmap generator templates and the Docs enhancement shell.
- Produces: `privateActivity`, `activityDocs`, the activity element IDs consumed by `createActivityView()`, and a sixth `Activity` Docs sidebar link.

- [ ] **Step 1: Write the failing generated-content test**

```js
test('adds the encrypted activity section to generated wallet and Docs navigation', async () => {
  const html = await readFile('dist/docs/index.html', 'utf8');
  assert.match(html, /6 SECTIONS/);
  assert.match(html, /href="#activity"[^>]*>Activity/);
  assert.match(html, /id="activity"/);
  const wallet = await readFile('dist/wallet/index.html', 'utf8');
  assert.match(wallet, /id="activity-section"/);
  assert.match(wallet, /id="activity-list"/);
});
```

- [ ] **Step 2: Run the generated-content test to verify it fails**

Run: `node --test tests/site-enhance.test.mjs`

Expected: FAIL because generated pages have five Docs sections and no activity markup.

- [ ] **Step 3: Add static markup and integrate it into current generators**

```js
import {privateActivity, activityDocs} from './src/activity-markup.js';

const wallet = `...existing wallet content...</div>${privateActivity}<div class="lab-explainer">...`;
const docs = `...existing limits section...${activityDocs}<section id="token">...`;
```

Keep the current header/Whitepaper link, current tested wording, HUSHM token text, and existing Roadmap items. Add one integrated Roadmap item describing encrypted local records and manual status refresh. In `site-enhance.mjs`, change the Docs label to `6 SECTIONS` and insert `['Activity','#activity']` before Token status.

The markup must include exactly: `activity-section`, `activity-heading`, `activity-toggle`, `activity-clear`, `activity-clear-confirm`, `activity-clear-yes`, `activity-clear-no`, `activity-state`, and `activity-list`. Keep all record values out of static HTML; `activity-list` remains empty until the unlocked view renders it.

- [ ] **Step 4: Add responsive journal styles**

```css
.private-activity { margin: 40px 0 48px; padding: 32px; border: 1px solid var(--line); border-radius: 12px; background: #0d1013; }
.journal-row { display: grid; grid-template-columns: 1.1fr 1fr 1.2fr; gap: 16px 24px; border-top: 1px solid var(--line); padding: 24px 0; }
@media (max-width: 800px) { .private-activity { padding: 22px 18px; } .journal-row { grid-template-columns: 1fr 1fr; gap: 18px 12px; } }
```

Use scoped `.journal-*` rules only; avoid header, footer, or generic button selector changes. Include `display:none!important` for hidden descendants, long-value wrapping, and mobile grid placement that keeps row actions within the viewport.

- [ ] **Step 5: Run the build and generated-content tests**

Run: `pnpm build; node --test tests/site-enhance.test.mjs`

Expected: PASS; generated wallet has an empty activity list and Docs has the sixth search section.

- [ ] **Step 6: Commit static integration**

```bash
git add src/activity-markup.js generate-privacy.mjs site-enhance.mjs dist/privacy.css tests/site-enhance.test.mjs
git commit -m "Add private activity wallet and documentation UI"
```

### Task 4: Wallet lifecycle integration

**Files:**
- Create: `src/activity-view.js`
- Modify: `src/privacy.js:1-101`
- Test: `tests/browser/activity.mjs`

**Interfaces:**
- Consumes: `createPrivateActivity`, `digestProof`, `verifyActivityStatus`, `createActivityView`, existing `owner`, `connection`, `guard`, wallet payment review, and existing transaction display.
- Produces: encrypted records before/after relay submission, manual row refresh, owner-scoped clear, activity lock cleanup, and existing `#transaction` finality behavior backed by the unified activity verifier.

- [ ] **Step 1: Write the failing browser lifecycle test**

```js
await page.goto(new URL('wallet/', base).href);
assert.equal(await page.locator('[data-activity-id]').count(), 0);
await unlock();
assert.equal(await page.evaluate(() => window.fixtureSigns), 2);
await page.evaluate(records => window.activityFixture.seed(records), records);
await page.reload();
await unlock();
await page.waitForFunction(() => document.querySelectorAll('[data-activity-id]').length === 2);
await page.locator('#lock').click();
assert.equal(await page.locator('[data-activity-id]').count(), 0);
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `pnpm build; pnpm start` in one terminal, then `node tests/browser/activity.mjs` in a second terminal.

Expected: FAIL because the wallet has no journal initialization or activity DOM lifecycle.

- [ ] **Step 3: Build the safe DOM view**

```js
export function createActivityView() {
  let locked = true, visible = true, records = [], warning = '', busy = false;
  function render() { list.replaceChildren(); if (locked || !visible) return; /* use textContent nodes only */ }
  return {unlock(records, warning = ''), update(records), warn(text), lock(), setBusy(value)};
}
```

Use `document.createElement()` and `textContent`, never `innerHTML` for record values. On lock and hide, call `replaceChildren()` before returning. Set Explorer links only from validated saved public signatures with `noopener noreferrer` and `referrerPolicy='no-referrer'`. Clear confirmation must call only the current owner journal’s `clear()`.

- [ ] **Step 4: Merge journal lifecycle into `src/privacy.js`**

```js
const activityView = createActivityView();
let activity = null, activityRecords = [];

// after the existing two matching signatures unlock the account
activity = await createPrivateActivity({owner: owner.toBase58(), signature: firstSignature, storage: localStorage});
activityRecords = await activity.read();
activityView.unlock(activityRecords);

// before relayer submission
await persistActivity({id: crypto.randomUUID(), type, asset, amount, netAmount, fee, status: 'submission-unknown'});
```

Keep the existing unlock guard and first signature only long enough to initialize the journal. A failure to create/read the journal must call `activityView.unlock([], warning)` and continue the wallet session. On lock call `activity?.close()`, set `activity = null`, clear `activityRecords`, and call `activityView.lock()` before rendering unlocked state.

Replace the single `lastWithdrawal` memory field with record-aware finality status: calculate a withdrawal proof digest before any relay request; after each response upsert the signature/status; route both the existing `#check-status` button and activity row refresh through `verifyActivityStatus`. Re-check `guard()` before updating the page or journal after every await. Add a `storage` event listener that reloads only the current unlocked owner's journal.

- [ ] **Step 5: Extend browser test coverage for privacy and availability**

```js
const ciphertext = await page.evaluate(key => localStorage.getItem(key), storageKey);
for (const value of [record.signature, record.amount, record.proofDigest]) assert.ok(!ciphertext.includes(value));
await page.locator('#activity-toggle').click();
assert.equal(await page.locator('[data-activity-id]').count(), 0);
await page.locator('#activity-clear').click();
await page.locator('#activity-clear-yes').click();
assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null);
```

Cover a different wallet owner, tampered ciphertext retained until clear, no third wallet signature, no unexpected RPC/relay requests while viewing history, proof-matching/mismatching withdrawal refresh, storage failure that leaves the wallet unlocked, and clear behavior preserving note cache, recovery fingerprint, other owners, and unrelated localStorage entries.

- [ ] **Step 6: Run the lifecycle browser test**

Run: `node tests/browser/activity.mjs`

Expected: PASS with no unexpected requests, no page errors, and no private row values in the DOM while locked or hidden.

- [ ] **Step 7: Commit wallet integration**

```bash
git add src/activity-view.js src/privacy.js tests/browser/activity.mjs
git commit -m "Track encrypted private payment activity"
```

### Task 5: Full regression, visual safety, and release verification

**Files:**
- Modify if needed: `tests/browser/deposit.mjs`
- Modify if needed: `tests/browser/withdraw.mjs`
- Generated: `dist/index.html`, `dist/wallet/index.html`, `dist/docs/index.html`, `dist/roadmap/index.html`, `dist/privacy.js`

**Interfaces:**
- Consumes: completed journal, status, static markup, and wallet integrations.
- Produces: a production build whose current wallet, Docs, Roadmap, Whitepaper, HUSHM/CA, and mobile layouts regress no behavior.

- [ ] **Step 1: Add assertions to existing payment browser tests**

```js
assert.equal(await page.evaluate(() => window.fixtureSigns), 2, 'Payment flow retains the existing two signatures.');
assert.equal(await page.locator('[data-activity-id]').count(), 0, 'No private rows are shown before an activity is recorded.');
```

Keep existing deposit/withdraw relay assertions intact. Assert the successful fixture submission produces a matching journal record without a recipient or raw proof in its serialized ciphertext.

- [ ] **Step 2: Build and run all unit tests**

Run: `pnpm build; pnpm test`

Expected: PASS.

- [ ] **Step 3: Run browser and responsive checks**

Run: `pnpm start` in one terminal, then `node tests/browser/deposit.mjs; node tests/browser/withdraw.mjs; node tests/browser/activity.mjs` in a second terminal.

Expected: PASS; `tests/browser/activity.mjs` verifies `document.documentElement.scrollWidth <= innerWidth` at 1440px and 390px and captures activity screenshots for inspection.

- [ ] **Step 4: Inspect generated output and whitespace**

Run: `git diff --check; rg -n "activity-section|id=\"activity\"|6 SECTIONS|Private activity history" dist/wallet/index.html dist/docs/index.html dist/roadmap/index.html`

Expected: no whitespace errors; generated pages include the feature in the intended wallet, Docs, and Roadmap locations.

- [ ] **Step 5: Commit and push the release**

```bash
git add src generate-privacy.mjs site-enhance.mjs dist tests
git commit -m "Release encrypted private activity history"
git push origin main
```

## Self-Review

- **Spec coverage:** Tasks 1–2 cover cryptographic storage and proof-bound finality. Task 3 covers wallet/Docs/Roadmap markup and responsive presentation. Task 4 covers unlock/lock/submission/manual-refresh integration. Task 5 verifies current payment flows, generated content, and release artifacts.
- **Placeholder scan:** No deferred implementation markers are present; every task names files, interfaces, commands, expected results, and concrete test/implementation behavior.
- **Type consistency:** `createPrivateActivity()` returns `read`, `upsert`, `clear`, and `close`; `verifyActivityStatus()` returns activity status strings; `createActivityView()` consumes record arrays and keeps private values node-based. The same names are used in later tasks.
- **Review focus:** Storage failure is tested in Task 4; corrupt/oversized/foreign ciphertext and bounds are tested in Task 1; lock race is tested in Task 2; record retention is tested in Task 1; storage/DOM private-data exposure is tested in Tasks 4–5.
