# Hushmark privacy integration

The current product is a private-payment interface on Solana using Privacy Cash SDK 1.2.2. It replaces the public-transfer-first pages, not the underlying source history. HUSHM is the project token; the integrated private pool supports SOL, USDC and USDT.

## Run

Node 24.x and pnpm 11.19.0. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm start`. Local preview is http://127.0.0.1:4173.

Current page generator: generate-privacy.mjs. Browser source: src/privacy.js, src/privacy-sdk.js, src/privacy-guards.js. Build: build-privacy.mjs. The build copies the SDK's exact circuit2/transaction2.wasm and transaction2.zkey into dist/privacy-circuit and bundles the SDK locally. dist is tracked authored output, not a directory to delete. Old generators and public-transfer source are retained as history and are not the current build entrypoint.

## Implemented

- Phantom/Solflare software-wallet unlock with two verified, identical protocol-message signatures and a local recovery fingerprint.
- SDK-derived keys only in memory; no recovery-phrase collection and no signature upload.
- Account-scoped tab cache for encrypted notes/scan offsets; explicit private-note sync and actual unspent-note balances.
- SOL/USDC/USDT SDK deposit/withdraw paths, bundled ZK proving assets, reviewed fee/net outcome.
- Exact relay recipient/mint/amount/fee checks; partial withdrawals blocked.
- Deposit message verification, protocol-program allowlist, amount matching, fee ceiling, preflight and wallet signature verification.
- Actual genesis/program checks and distinct submitted/not-found/failed/finalized states.
- No optimistic private balance, simulated balance, token sale or invented receipt.

## Wallet tools (v4)

- Download an encrypted history JSON file, preview its record counts, and merge it with the same wallet on another browser or domain. New restored transaction statuses require a fresh manual check. No history upload or backend is involved.
- Idle auto-lock defaults to 5 minutes, with 15 and 30 minute choices. It also checks expiry on return to a background tab and before guarded actions. Already submitted transactions may still settle; uncertain activity is not labeled safely retryable.
- Create SOL/USDC/USDT payment requests as links and downloadable QR images. The unsigned link exposes recipient, net amount and expiry to anyone with it. It never auto-connects or submits. The payer explicitly applies it and reviews gross debit/current fees; manual edits detach it.
- Check selected mainnet RPC, executable protocol program and valid protocol fee configuration. This is point-in-time availability, not a security audit or settlement guarantee.

Source modules: `src/private-activity.js`, `src/idle-session.js`, `src/payment-request.js`, `src/service-status.js`, `src/wallet-tools-view.js`. Current public navigation, CA controls and whitepaper are preserved in `templates/` and `dist/`. See `WALLET-TOOLS-HANDOFF.md` for deployment and acceptance steps.

## Privacy and recovery limits

### Private activity history

New deposit and withdrawal attempts initiated here are kept in an encrypted, wallet-scoped browser journal. It retains the latest 100 records, including atomic amounts, quoted fees, timestamps, lifecycle status, the transaction signature when available and a hash of the approved withdrawal proof. Recipient addresses, unlock signatures and private keys are never stored in this journal. There is no history backend or analytics upload.

`src/private-activity.js` derives a separate nonextractable AES-256-GCM key with HKDF-SHA256 from the existing verified unlock signature, with owner-bound salt and domain-separated info. Every write uses a fresh 96-bit nonce and authenticated owner/schema data. Writes are serialized using Web Locks where available. Browser storage names expose the wallet address; stored content is encrypted, not the storage metadata. A compromised site/browser while unlocked remains outside this protection.

Same-wallet unlock on the same site/browser recovers the journal without an additional signature prompt. Lock or account change discards the key and removes decrypted history and the latest transaction from the DOM. Hide history removes the list from the DOM. Explicit clear only removes that wallet's journal, not protocol note caches, recovery fingerprints or funds. History is not a backup of funds or private notes. Earlier transactions are not automatically scanned; encrypted activity backups can be restored with the same wallet on another browser or domain.

Opening history performs no transaction-history RPC scan. Manual status refresh contacts the selected RPC, and opening an explorer is an explicit third-party navigation. Withdrawal finality (including a finalized failed receipt) requires matching the approved proof hash. An interrupted submission remains uncertain. Storage errors retain existing encrypted data and do not block wallet operations; users see that history may be incomplete. Corrupt records require an explicit local clear before new records can be saved.

Deposit funding addresses/amounts and withdrawal recipients/amounts remain public. The protocol aims for unlinkability, not full transaction invisibility. Timing, matching amounts, address reuse and service metadata matter. The SDK queries note indices from the relayer; this reveals queried encrypted-note identifiers to that provider. There is no claim of affiliation, perfect anonymity or independent Hushmark audit.

The exact message `Privacy Money account sign in` derives spending/decryption keys. Its signature is highly sensitive and must not be shared. Any trusted interface requesting the same message can derive the same keys. Hardware wallets are not supported by the upstream SDK. Fingerprint mismatch or nondeterministic signatures block unlocking. Losing the original wallet/signature-recovery path may prevent recovery of deposited assets.

## Verification

Unit tests cover numeric precision, status classification, fee arithmetic, relay intent mismatch and owner cache isolation. Browser checks covered four responsive routes, actual SDK/hasher loading, real mainnet program/account reads with a fresh empty test wallet, deterministic unlock, empty-note scanning, invalid withdrawal and session lock.

Actual browser proof generation and SDK deposit transaction assembly passed with the bundled circuit and proving key. All transfer writes were intercepted in the test. The displayed finality in that integration test was a fixture, not real settlement.

Browser withdrawal testing also passed authenticated note encryption/decryption, tamper rejection, private balance reconstruction, actual withdrawal proof generation and exact reviewed relay payload checks. Withdrawal submission and finality were intercepted fixtures as well.

On 2026-09-24, the owner reported successful testing through Hushmark with real SOL and USDC. See VERIFICATION.md for the scope of that report and the separate automated test record. An independent security review is outstanding. Public RPC/relayer availability is not guaranteed.

## Sources

- https://github.com/Privacy-Cash/privacy-cash-sdk (ISC)
- https://privacycash.mintlify.app/sdk/frontend
- https://privacycash.mintlify.app/sdk/deposit-fe
- https://privacycash.mintlify.app/sdk/withdraw-fe
- https://privacycash.mintlify.app/sdk/balance-fe

The bundled SDK includes third-party cryptographic components with their own licenses; retained bundle notices must accompany redistribution. Historical snarkjs license: dist/vendor/snarkjs-LICENSE.txt.


## Functional audit update (2026-09-22)

See VERIFICATION.md for the current test record and repeat commands. SOL and USDC proof flows, synthetic-note recovery after reload, cancellation/account-change controls and mismatched withdrawal receipt rejection passed browser checks. The relay and finality responses in those automated tests were fixtures. Browser regression scripts are preserved in tests/browser and require a Playwright runtime.


## USDT extension (v5)

USDT uses Solana mint `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, six decimals and the legacy SPL Token program supported by Privacy Cash SDK 1.2.2. Asset selection, public/private balances, deposit, withdrawal, net-amount requests, encrypted history and backup restoration include USDT. Its fees and minimum are read from `usdt` configuration entries, never copied from USDC. HUSHM remains unsupported in the private pool.

Read `USDT-HANDOFF.md` and the latest section of `VERIFICATION.md` before deployment. v5 can read earlier SOL/USDC activity backups; older v4 code cannot read backups containing USDT, so upgrade both devices before restoring those files.
