# Hushmark wallet tools — v4 handoff

This package implements the four announced wallet tools. It is ready for the site operator to deploy; this task did not publish to hushmark.io.

## Choose one archive

- **Hushmark-Nixpacks-Deploy-v4.zip**: source plus built site. For the existing Nixpacks/static hosting workflow, extract at the repository root, retain all folders, and use `nixpacks.toml`. Static mode enabled; publish `/dist`. Details: `DEPLOY.md`.
- **Hushmark-Static-Deploy-v4.zip**: built site only. Upload its contents as the domain root, or use the ZIP for a compatible direct-upload host. No build step.

Use Node 24.x and pnpm 11.19.0 for source builds. Run `pnpm install --frozen-lockfile --prod=false`, `pnpm build`, then `pnpm start` for local preview. `dist/` contains authored assets and must not be deleted before building. Keep `templates/` too. No new database or private environment variables are required.

## What works

1. **Encrypted history backup and restore** in Private activity after unlocking. Download JSON, restore with the same wallet, inspect merge counts and explicitly confirm. Existing records are retained; at most the newest 100 remain. Corrupt, wrong-wallet or conflicting files cannot replace history. Imported signed records require a new network status check. This backs up recorded activity, not private notes or funds.
2. **Idle auto-lock** in the account panel: 5 minutes by default, or 15/30. Background-tab return and guarded actions check the same deadline. A payment already submitted can complete after locking; the saved uncertain state is retained for investigation, not retried automatically.
3. **Payment links and QR** below Private activity. Enter a public recipient, SOL/USDC net amount and 1 hour/24 hour/7 day expiry. Opening a link never signs or submits. Unlock, choose Use this request, review gross debit and fees, then confirm. Editing payment fields detaches the request. Expired requests are rejected. A QR/link is an unsigned request, not proof of identity or payment. Protocol minimums, fees and available note balances still apply.
4. **Service status** next to the request form. Explicit read-only checks verify the selected mainnet RPC, executable privacy program and fee endpoint. Results show check times; changing RPC clears them. Availability is not a guarantee of settlement or a security audit.

The source preserves the public site's header/footer, $HUSHM CA controls, X link, whitepaper and searchable docs/roadmap. No hosting analytics beacon is embedded. Hosting-level analytics configuration remains the operator's responsibility.

## After your deployment

- Open `/wallet/` in a fresh tab on HTTPS after purging old HTML/JS/CSS caches together. Check the new controls and all navigation links.
- Unlock with your original software wallet. Download and restore a small history backup, confirming counts. History from localhost is not auto-migrated; use the backup explicitly if needed.
- Generate a link on the production domain and open it in another browser. Confirm recipient and amount, then verify that opening it alone does not trigger a signature or payment. Do not share links generated on localhost.
- Check services. Offline/rate-limited results must show unavailable rather than a green placeholder. Recheck after network changes.
- Check auto-lock with 5 minutes of inactivity and then unlock again. Investigate any uncertain transaction before retrying.
- An optional real payment remains the owner's action in their wallet. These automated tests used intercepted submissions and do not claim new mainnet settlement or an independent security audit.

See `VERIFICATION.md` for test scope and repeat commands. Never send a seed phrase or protocol unlock signature to anyone.
