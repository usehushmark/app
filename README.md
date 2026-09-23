# Hushmark privacy integration

The current product is a private-payment interface on Solana using Privacy Cash SDK 1.2.2. It replaces the public-transfer-first pages, not the underlying source history. No Hushmark token exists.

## Run

Node 24+ and pnpm 11. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm start`. Local preview is http://127.0.0.1:4173.

Current page generator: generate-privacy.mjs. Browser source: src/privacy.js, src/privacy-sdk.js, src/privacy-guards.js. Build: build-privacy.mjs. The build copies the SDK's exact circuit2/transaction2.wasm and transaction2.zkey into dist/privacy-circuit and bundles the SDK locally. dist is tracked authored output, not a directory to delete. Old generators and public-transfer source are retained as history and are not the current build entrypoint.

## Implemented

- Phantom/Solflare software-wallet unlock with two verified, identical protocol-message signatures and a local recovery fingerprint.
- SDK-derived keys only in memory; no recovery-phrase collection and no signature upload.
- Account-scoped tab cache for encrypted notes/scan offsets; explicit private-note sync and actual unspent-note balances.
- SOL/USDC SDK deposit/withdraw paths, bundled ZK proving assets, reviewed fee/net outcome.
- Exact relay recipient/mint/amount/fee checks; partial withdrawals blocked.
- Deposit message verification, protocol-program allowlist, amount matching, fee ceiling, preflight and wallet signature verification.
- Actual genesis/program checks and distinct submitted/not-found/failed/finalized states.
- No optimistic private balance, simulated balance, token sale or invented receipt.

## Privacy and recovery limits

Deposit funding addresses/amounts and withdrawal recipients/amounts remain public. The protocol aims for unlinkability, not full transaction invisibility. Timing, matching amounts, address reuse and service metadata matter. The SDK queries note indices from the relayer; this reveals queried encrypted-note identifiers to that provider. There is no claim of affiliation, perfect anonymity or independent Hushmark audit.

The exact message `Privacy Money account sign in` derives spending/decryption keys. Its signature is highly sensitive and must not be shared. Any trusted interface requesting the same message can derive the same keys. Hardware wallets are not supported by the upstream SDK. Fingerprint mismatch or nondeterministic signatures block unlocking. Losing the original wallet/signature-recovery path may prevent recovery of deposited assets.

## Verification

Unit tests cover numeric precision, status classification, fee arithmetic, relay intent mismatch and owner cache isolation. Browser checks covered four responsive routes, actual SDK/hasher loading, real mainnet program/account reads with a fresh empty test wallet, deterministic unlock, empty-note scanning, invalid withdrawal and session lock.

Actual browser proof generation and SDK deposit transaction assembly passed with the bundled circuit and proving key. All transfer writes were intercepted in the test. The displayed finality in that integration test was a fixture, not real settlement.

Browser withdrawal testing also passed authenticated note encryption/decryption, tamper rejection, private balance reconstruction, actual withdrawal proof generation and exact reviewed relay payload checks. Withdrawal submission and finality were intercepted fixtures as well.

A funded mainnet deposit, recovery after reload and withdrawal through Hushmark remain UNVERIFIED. An independent security review is outstanding. Public RPC/relayer availability is not guaranteed. Do not infer a verified production launch from a mainnet setting.

## Sources

- https://github.com/Privacy-Cash/privacy-cash-sdk (ISC)
- https://privacycash.mintlify.app/sdk/frontend
- https://privacycash.mintlify.app/sdk/deposit-fe
- https://privacycash.mintlify.app/sdk/withdraw-fe
- https://privacycash.mintlify.app/sdk/balance-fe

The bundled SDK includes third-party cryptographic components with their own licenses; retained bundle notices must accompany redistribution. Historical snarkjs license: dist/vendor/snarkjs-LICENSE.txt.


## Functional audit update (2026-09-22)

See VERIFICATION.md for the current test record and repeat commands. SOL and USDC proof flows, synthetic-note recovery after reload, cancellation/account-change controls and mismatched withdrawal receipt rejection passed browser checks. The test relay and finality responses were fixtures; funded mainnet settlement remains unverified. Browser regression scripts are preserved in tests/browser and require a Playwright runtime.
