# Hushmark USDT extension — v5

USDT is integrated alongside SOL and USDC on Solana. The local preview is updated; the public website has not been deployed by this task.

## Scope

- Official USDT mint: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, six decimals, legacy SPL Token program.
- Deposit, encrypted-note scan, private/public balance, reviewed withdrawal and protocol-specific USDT fee/minimum handling.
- Exact recipient-net requests through link/QR, with payer review and explicit authorization.
- Encrypted activity recording, export/restore, status verification and three-asset session clearing.
- Fee-service readiness now checks all three supported assets.
- Existing SOL/USDC behavior, branding, CA and whitepaper retained. Owner-reported real-money testing still refers to SOL/USDC; no new funded USDT test is claimed.

## Protocol compatibility evidence

The installed SDK 1.2.2 registers this exact USDT mint. Finalized reads found the USDT Merkle-tree account `G27iu2M2hpczYT2ynvHj6Dx56xkKgQBNVbLocKFPwXwk` owned by the configured Privacy Cash program. The public relayer configuration supplies USDT rent and minimum entries. `scripts/check-usdt-support.mjs` repeats read-only checks; snapshots can become stale. RPC timeouts occurred during validation, and live availability is not guaranteed.

## Deploy

Use **Hushmark-Nixpacks-Deploy-v5.zip** for the current source-build/static Nixpacks workflow. Use **Hushmark-Static-Deploy-v5.zip** for direct static upload. Instructions remain in `DEPLOY.md`. Keep `dist/` authored assets and `templates/`; Node 24.x and pnpm 11.19.0. No new secret or backend is needed.

After replacing the complete deployment and clearing old asset caches, verify USDT appears in balances, transfer selection and payment-request selection. Generate links on the public HTTPS origin, not localhost. Existing SOL/USDC backups remain readable. Backups containing USDT require v5 on the destination; v4 will reject their unsupported asset rather than silently relabel it.

The automated financial flow tests intercept submissions and use fixture finality. No real tokens were moved. For final production acceptance, the owner must review and approve any small funded test in their own wallet. Do not send keys or protocol unlock signatures.

## Repeat tests

Run `pnpm test` and the browser tests documented in `VERIFICATION.md`. For the payment regression scripts, set `AUDIT_ASSET=USDT`; use `AUDIT_REQUEST=1` for withdrawal requests with an exact recipient net amount. Financial writes are intercepted. The proof-flow scripts depend on live read-only RPC/protocol services, so inspect service failures separately from assertion failures.
