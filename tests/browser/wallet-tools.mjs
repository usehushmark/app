const requestedAsset=process.env.AUDIT_ASSET==='USDT'?'USDT':'USDC';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {Keypair} from '@solana/web3.js';
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
  id: '616e9b73-9460-471e-a8b6-f37992063222', type: 'withdraw', asset: requestedAsset,
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
let withdrawalReceipt = 'missing',offlineFees=false;
const statuses = new Map();
const status = (confirmationStatus, err = null) => ({slot: 100, confirmations: confirmationStatus === 'finalized' ? null : 1, confirmationStatus, err});
const config = {withdraw_fee_rate: .0035, withdraw_rent_fee: .006, rent_fees: {usdc: .7,usdt:.9}, minimum_withdrawal: {sol: .01, usdc: 2,usdt:3}};
page.on('pageerror', error => errors.push(error.message));

await page.addInitScript({content: `
  window.__clockOffset=0;const originalNow=Date.now;Date.now=()=>originalNow()+window.__clockOffset;
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
    if (url.pathname === '/config') { await route.fulfill(offlineFees?{status:503,body:'offline'}:{json:config}); return; }
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
    else if (req.method === 'getSlot') result=100;
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


async function unlock(){await page.locator('#software-wallet').check();await page.locator('#unlock').click();await page.waitForFunction(()=>!document.getElementById('unlock').disabled,{}, {timeout:60000});assert.equal(await page.locator('#unlock-state').textContent(),'UNLOCKED',await page.locator('#privacy-status').textContent());}
try{
 mkdirSync('qa',{recursive:true});
 await page.goto(base.href+'wallet/');await page.evaluate(records=>activityFixture.seed(records),records);await unlock();
 const downloadEvent=page.waitForEvent('download');await page.locator('#activity-export').click();const download=await downloadEvent;await download.saveAs('qa/history-backup.json');
 const backup=readFileSync('qa/history-backup.json','utf8');assert.equal(JSON.parse(backup).format,'hushmark-activity-backup');assert.ok(!backup.includes(deposit.signature));
 await page.locator('#activity-clear').click();await page.locator('#activity-clear-yes').click();await page.waitForFunction(()=>document.querySelectorAll('[data-activity-id]').length===0);
 await page.locator('#activity-import-file').setInputFiles('qa/history-backup.json');await page.waitForFunction(()=>!document.getElementById('backup-review').hidden);assert.match(await page.locator('#backup-review-details').textContent(),/2 new/);
 await page.locator('#backup-confirm').click();await page.waitForFunction(()=>document.querySelectorAll('[data-activity-id]').length===2);assert.equal(await page.locator('[data-status="unverified"]').count(),2);
 await page.locator('#activity-import-file').setInputFiles('qa/history-backup.json');await page.waitForFunction(()=>!document.getElementById('backup-review').hidden);assert.match(await page.locator('#backup-review-details').textContent(),/0 new, 2 already/);await page.locator('#backup-cancel').click();
 const bad=JSON.parse(backup);bad.owner='2'.repeat(32);await page.locator('#activity-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.getElementById('backup-state').textContent.includes('different wallet'));assert.equal(await page.locator('[data-activity-id]').count(),2);
 console.log('Backup download, restore, duplicate merge and wrong-wallet rejection passed.');
 const recipient=Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey.toBase58();
 await page.locator('#request-recipient').fill(recipient);await page.locator('#request-amount').fill('2');await page.locator('#request-asset').selectOption(requestedAsset);await page.locator('#request-create').click();await page.waitForFunction(()=>!document.getElementById('request-result').hidden);
 const link=await page.locator('#request-link').inputValue();assert.ok(link.startsWith(base.origin+'/wallet/#pay='));assert.ok(await page.locator('#request-qr').evaluate(img=>img.naturalWidth===520));
 const qrEvent=page.waitForEvent('download');await page.locator('#request-download').click();await (await qrEvent).saveAs('qa/request-qr.png');
 await page.goto("about:blank");await page.goto(link);await page.waitForFunction(()=>!document.getElementById('incoming-request').hidden);assert.equal(new URL(page.url()).hash,'');assert.equal(await page.evaluate(()=>window.fixtureSigns||0),0);assert.equal(await page.locator('#unlock-state').textContent(),'LOCKED');
 await page.locator('#request-use').click();assert.match(await page.locator('#request-incoming-state').textContent(),/locked/i);await unlock();await page.locator('#request-use').click();assert.equal(await page.locator('#operation').inputValue(),'withdraw');assert.equal(await page.locator('#asset').inputValue(),requestedAsset==='USDT'?'2':'1');assert.equal(await page.locator('#amount').inputValue(),'2');assert.equal(await page.locator('#recipient').inputValue(),recipient);assert.match(await page.locator('label[for=amount]').textContent(),/Recipient amount/);
 await page.locator('#amount').fill('3');assert.equal(await page.locator('label[for=amount]').textContent(),'Amount debited');
 console.log('QR/download/link parsing and explicit request application passed; no auto-unlock/payment.');
 await page.locator('#service-check').click();await page.waitForFunction(()=>!document.getElementById('service-check').disabled);assert.equal(await page.locator('.service-badge[data-state=available]').count(),3);
 offlineFees=true;await page.locator('#service-check').click();await page.waitForFunction(()=>!document.getElementById('service-check').disabled);assert.equal(await page.locator('#service-relayer-status').textContent(),'Unavailable');assert.equal(await page.locator('#service-rpc-status').textContent(),'Available');offlineFees=false;
 await page.locator('.rpc-settings').evaluate(e=>e.open=true);await page.locator('#save-rpc').click();await page.waitForFunction(()=>!document.getElementById('save-rpc').disabled);assert.equal(await page.locator('.service-badge[data-state=unknown]').count(),3);await unlock();
 console.log('Live service state rendering, independent failure and RPC reset passed.');
 await page.evaluate(()=>window.__clockOffset=300001);await page.locator('#request-own-wallet').click();assert.equal(await page.locator('#unlock-state').textContent(),'LOCKED');assert.equal(await page.locator('[data-activity-id]').count(),0);assert.equal(await page.locator('#review-recipient').textContent(),'');assert.equal(await page.locator('#request-link').inputValue(),'');
 console.log('Expired session could not be revived by a click; private DOM cleared.');
 // The old request must expire even after unlocking again.
 await page.evaluate(()=>window.__clockOffset=86400001);await unlock();await page.locator('#request-use').click();assert.match(await page.locator('#request-incoming-state').textContent(),/expired/);
 await page.locator('#auto-lock-minutes').selectOption('15');await page.reload();assert.equal(await page.locator('#auto-lock-minutes').inputValue(),'15');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#payment-request-section').scrollIntoViewIfNeeded();await page.screenshot({path:'qa/wallet-tools-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#payment-request-section').scrollIntoViewIfNeeded();await page.screenshot({path:'qa/wallet-tools-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const route of ['docs/','roadmap/']){await page.goto(base.href+route);await page.locator('[data-search-input]').fill('zzzz-nomatch');assert.equal(await page.locator('[data-search-empty]').isVisible(),true);await page.locator('[data-search-input]').fill('');assert.equal(await page.locator('[data-search-empty]').isVisible(),false);}
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);console.log('All wallet-tools browser checks passed. No financial network submissions.');
}finally{await browser.close();}
