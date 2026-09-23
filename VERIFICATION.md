# Functional verification — 2026-09-22

This is an implementation audit and test record, not an independent security audit or proof of funded production settlement.

## Passed

- Seven unit tests: integer amounts, status classification, HTTPS RPC validation, SOL/USDC fee-change detection, SDK SOL reserves, relay recipient/amount/fee/mint checks, owner-scoped caches.
- Public Home, Wallet, Docs and Roadmap pages load without browser errors. Production-origin browser requests reach the mainnet RPC and current relayer fee configuration.
- Browser unlock validates two deterministic Ed25519 signatures, actual mainnet genesis/program, empty public balances and no assumed private balance.
- Both SOL and USDC deposits construct actual browser ZK proofs and protocol transactions, validate and sign the transaction, and produce the exact intercepted relay payload.
- Both SOL and USDC withdrawals decrypt authentic synthetic notes, recover the same wallet/fingerprint after reload, reconstruct balances, generate actual ZK proofs and match the reviewed recipient, mint, fee and amount.
- A deliberately mismatched returned withdrawal transaction proof is rejected, even when its mocked status says finalized.
- Rejected signatures, hide/show balance, form edits during review, cancellation during confirmation, account changes and provider changes do not submit payments.

All deposit/withdrawal relay requests were intercepted. RPC submission was blocked. Balances, synthetic notes, simulation and transaction receipts used in payment tests were fixtures. No real assets moved. Software-wallet providers in automated tests were controlled fixtures, not installed Phantom/Solflare extensions.

## Fixed

- USDC deposit review now requires the SDK minimum reserve of 0.002 SOL.
- SOL withdrawal rent, percentage, USDC rent and minimum changes invalidate approval.
- Form changes/cancellation while network checks are pending cannot approve stale details.
- Session locking aborts pending relay reads; provider changes invalidate the session.
- Custom RPC calls and confirmation fee requests have timeouts.
- Private balance is marked unread after initiating a payment, pending resync.
- Withdrawal finalization checks the actual returned transaction contains the approved protocol proof.

## Not yet verified

Funded mainnet deposit, recovery of those real notes, withdrawal, recipient balance change and actual Phantom/Solflare wallet approval. Mobile wallet in-app-browser signing also needs a device check. Public RPC and protocol services can fail or rate-limit requests.

## Repeat browser checks

Start `node serve.mjs` separately. Provide Playwright through PLAYWRIGHT_MODULE (module path or installed playwright) and optionally BROWSER_EXECUTABLE. Run from the project root:

- `node --test tests/*.test.mjs`
- `node tests/browser/state.mjs`
- `node tests/browser/deposit.mjs`
- `node tests/browser/withdraw.mjs`
- Repeat deposit and withdraw with `AUDIT_ASSET=USDC`.
- `node tests/browser/live-readonly.cjs`

The browser payment tests create throwaway fixture wallets and intercept all financial submissions. Their finalized labels must never be reported as mainnet settlements.
