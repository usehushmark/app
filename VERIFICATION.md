# Functional verification — updated 2026-09-26

This records the owner's real-asset testing report and the separate automated implementation checks. It is not an independent security audit.

## USDT extension v5 — 2026-09-26

- Added USDT mint `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, six decimals, to the existing Solana integration. SDK 1.2.2 registers the mint; finalized account reads found its legacy SPL mint and protocol-owned tree. Relayer config supplies USDT-specific rent and minimum values. Read-only evidence is recorded by `scripts/check-usdt-support.mjs`.
- All 37 unit tests passed, including USDT fee/minimum isolation, exact net-amount requests, six-decimal validation, fee-service readiness and mixed SOL/USDC/USDT encrypted backup restoration. Existing tests continue passing.
- The browser wallet-tools suite passed with USDT requests and USDT journal fixtures: QR, explicit request application, expiry, encrypted export/import, owner mismatch, idle lock and service failures. Existing state/activity browser suites passed.
- USDT deposit and request-based withdrawal passed using actual SDK proof generation, intercepted submission, fixture finality, exact mint/net amount checks, encrypted activity, same-wallet reload and mismatched-proof rejection. No funded USDT transaction was sent.
- The initial live-read-dependent tests encountered public RPC timeouts and a transient missing lookup-table result. Both public RPCs later returned the lookup table. USDT passed on a sequential retry. The optional `AUDIT_RPC` and `AUDIT_NODE_RPC=1` test transport isolates browser-origin transport issues by forwarding only `get*` RPC reads from Node. It does not change the application RPC setting or forward financial writes. SOL and USDC deposit/request-withdrawal regressions then both passed using the alternate mainnet RPC with Node read transport; their signing, proofs, journal and receipt checks still ran in the browser. Submissions and finality remained intercepted fixtures.
- Desktop (1440px) wallet and mobile (390px) request/QR layouts were visually inspected without horizontal overflow.
- A clean source copy installed 264 pinned packages with Node 24.19.0/pnpm 11.19.0, built successfully and passed all 37 unit tests. All 29 static assets matched the working build byte-for-byte. Docker/Nixpacks execution itself was not tested on this Windows host.

USDT is implemented locally and packaged for deployment, not independently audited or verified by a new funded mainnet test. Public RPC availability remains a real dependency. Deploy v5 before importing USDT-containing backups; v4 does not understand the added asset. No production deployment was performed.

## Wallet tools v4 — 2026-09-26

- 33 unit tests passed. Added same-wallet encrypted backup portability, non-destructive rejection of wrong-wallet/corrupt/conflicting files, duplicate merge, 100-record retention, restored status downgrading and lock-during-restore protection. Existing encryption and payment checks remain passing.
- Added payment request validation, HTTPS/loopback origins, expiry/precision checks and exact net-to-gross SOL/USDC fee calculations. Idle tests cover delayed background timers, deadline checks before interaction and timeout changes. Service tests cover wrong network, missing/invalid fees, offline results and aborted checks.
- `tests/browser/wallet-tools.mjs` passed encrypted file download/upload, merge preview, duplicate handling, wrong-wallet rejection, QR creation/download, link parsing without automatic wallet signatures, explicit request application, manual-edit detachment, expiry, idle DOM clearing, persisted timeout selection, independent service failures, RPC result reset and docs/roadmap search.
- Existing state and private activity browser regressions passed. SOL and USDC deposit flows passed. Both SOL and USDC request-based withdrawals used the actual SDK proof generator and matched the requested recipient net amount exactly in the intercepted relay payload; history recovery and mismatched-proof rejection passed.
- `tests/browser/idle-submission.mjs` passed auto-lock after an intercepted withdrawal was sent: decrypted DOM was cleared, one uncertain encrypted record survived, and no second submission occurred.
- A fresh source copy installed all 264 locked packages with Node 24.19.0 and pnpm 11.19.0, built successfully and passed all 33 unit tests. All 29 static files matched the working build byte-for-byte. This is a clean Windows build, not a Docker/Nixpacks server validation.
- New wallet tools were visually inspected at 1440px and 390px without horizontal overflow. The current public header/footer, token address, X link, whitepaper and document search were preserved.

All financial submissions in these browser tests were intercepted. Fixture finality is not real settlement. No funds were moved and no deployment was performed by this task. The owner-reported mainnet test below is separate.

## Private activity update — 2026-09-26

- 21 unit tests passed, including real WebCrypto journal encryption/reload, owner and key isolation, ciphertext tampering, fresh nonces, nonextractable keys, signature-copy zeroization, record validation, 100-record retention, storage quota failures, browser-lock serialization and session-close races.
- Status tests distinguish missing, processing, confirmed, failed and finalized outcomes. A withdrawal's returned transaction must contain its approved proof before it can be called finalized or failed onchain. A finalized status attached to a different proof is rejected.
- The local-browser activity regression passed empty/locked/hidden states, same-wallet recovery, different-wallet isolation, two-signature unlock (no additional journal signature), manual status refresh, corrupt-journal handling without blocking unlock, and account-scoped clear/cancel preserving note caches and fingerprints.
- The existing browser session/state regression passed after the integration: signature rejection, balance hiding, review edits, confirmation cancellation, account change and provider change. No financial submission was made.
- SOL and USDC deposit/withdrawal browser regressions passed actual SDK proof construction, automatic journal creation, exact amount/asset/signature binding, ciphertext-only persistence, same-wallet reload and manual status refresh. Withdrawal proof mismatches persist on the same record across reload, and a matching receipt restores verified finality. Lock removes both the journal list and latest transaction identifiers from the DOM. History actions never submit an additional payment.
- The production build succeeded. Populated history was visually checked at 1440px and 390px with no horizontal overflow. The source and static archives are separately verified for CRC integrity and byte-for-byte agreement with packaged files.
- The activity tests intercept external calls and return fixture RPC receipts; they do not establish mainnet settlement, installed-wallet compatibility or independent audit coverage.

The journal only covers attempts initiated here after this update. It does not automatically import earlier payments. In v4, an explicit encrypted backup can transfer recorded history between devices or domains. Storage failures may leave an incomplete journal. The change has not been publicly deployed by this local test run.

## Owner-reported real-asset testing — 2026-09-24

The owner reported personally testing Hushmark successfully with real SOL and USDC. This updates the earlier status that real-asset testing had not been completed.

Transaction signatures, the exact tested flows, wallet/browser details, and recovery coverage were not supplied with the report and have not been independently inspected. The report does not establish exhaustive feature coverage or an independent security review.

## Automated checks passed — 2026-09-22

- Seven unit tests: integer amounts, status classification, HTTPS RPC validation, SOL/USDC fee-change detection, SDK SOL reserves, relay recipient/amount/fee/mint checks, owner-scoped caches.
- Public Home, Wallet, Docs and Roadmap pages load without browser errors. Production-origin browser requests reach the mainnet RPC and current relayer fee configuration.
- Browser unlock validates two deterministic Ed25519 signatures, actual mainnet genesis/program, empty public balances and no assumed private balance.
- Both SOL and USDC deposits construct actual browser ZK proofs and protocol transactions, validate and sign the transaction, and produce the exact intercepted relay payload.
- Both SOL and USDC withdrawals decrypt authentic synthetic notes, recover the same wallet/fingerprint after reload, reconstruct balances, generate actual ZK proofs and match the reviewed recipient, mint, fee and amount.
- A deliberately mismatched returned withdrawal transaction proof is rejected, even when its mocked status says finalized.
- Rejected signatures, hide/show balance, form edits during review, cancellation during confirmation, account changes and provider changes do not submit payments.

In these automated checks, all deposit/withdrawal relay requests were intercepted. RPC submission was blocked. Balances, synthetic notes, simulation and transaction receipts used in payment tests were fixtures. No real assets moved in these checks. Software-wallet providers were controlled fixtures, not installed Phantom/Solflare extensions.

## Fixed

- USDC deposit review now requires the SDK minimum reserve of 0.002 SOL.
- SOL withdrawal rent, percentage, USDC rent and minimum changes invalidate approval.
- Form changes/cancellation while network checks are pending cannot approve stale details.
- Session locking aborts pending relay reads; provider changes invalidate the session.
- Custom RPC calls and confirmation fee requests have timeouts.
- Private balance is marked unread after initiating a payment, pending resync.
- Withdrawal finalization checks the actual returned transaction contains the approved protocol proof.

## Coverage limits

The owner's report does not specify recovery after reload or mobile wallet in-app-browser coverage. An independent security review remains outstanding. Public RPC and protocol services can fail or rate-limit requests; a new hosting deployment also needs its own access and wallet checks.

## Repeat browser checks

Start `node serve.mjs` separately. Provide Playwright through PLAYWRIGHT_MODULE (module path or installed playwright) and optionally BROWSER_EXECUTABLE. Run from the project root:

- `node --test tests/*.test.mjs`
- `node tests/browser/state.mjs`
- `node tests/browser/activity.mjs`
- `node tests/browser/wallet-tools.mjs`
- `node tests/browser/idle-submission.mjs`
- `node tests/browser/deposit.mjs`
- `node tests/browser/withdraw.mjs`
- Repeat deposit and withdraw with `AUDIT_ASSET=USDC` and `AUDIT_ASSET=USDT`. Set `AUDIT_REQUEST=1` for request-based SOL/USDC withdrawals.
- `node tests/browser/live-readonly.cjs`
- For diagnostic read transport only: set `AUDIT_RPC=https://api.mainnet-beta.solana.com` and `AUDIT_NODE_RPC=1` for deposit/withdraw scripts. This forwards only reads; it is not a production transport change.

The browser payment tests create throwaway fixture wallets and intercept all financial submissions. Their finalized labels must never be reported as mainnet settlements.
