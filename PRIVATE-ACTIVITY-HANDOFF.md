> Historical v3 notes. For the current v4 package, use WALLET-TOOLS-HANDOFF.md. Encrypted backup/restore now supports moving saved history between origins with the same wallet.

# Hushmark private activity update

## What users get

The Private wallet page now includes **Private activity**: a wallet-scoped, encrypted local record of new SOL/USDC deposits and withdrawals initiated from that browser. Unlock with the same wallet to see the latest 100 records. Hide the list, check network status manually, or clear only this wallet's local history with an inline confirmation.

The update does not add an analytics service or a history backend. It does not need an API key or an additional unlock signature. Stored records omit recipient addresses and sensitive wallet/signature key material. A withdrawal receipt is compared to a saved hash of the approved proof, including after reload.

## Integrating into a newer deployed copy

This package contains the source snapshot in this workspace. If the production repository has newer changes, merge these changes there; preserve its domain, links, contract-address display and other unrelated production edits.

Primary changes:

- `src/private-activity.js`: encryption, validation, storage isolation and lifecycle.
- `src/activity-status.js`: network status and withdrawal-proof matching.
- `src/activity-view.js`: safe DOM rendering and hide/clear controls.
- `src/activity-markup.js`: wallet section and documentation copy.
- `src/privacy.js`: journal integration with unlock, lock, deposit and withdrawal.
- `generate-privacy.mjs`: mounts the wallet section, adds documentation, corrects the old no-token text to the owner's current HUSHM direction, and lists the integrated feature on the roadmap.
- `dist/privacy.css`: scoped journal styles; existing branding is retained.
- `tests/`: journal/status unit tests and activity/payment browser regressions.

## Build and publish

Use Node 24 and pnpm 11.19.0, then `pnpm install --frozen-lockfile` and `pnpm build`. Keep the authored `dist` directory; the build does not recreate every image and stylesheet. The output directory is `dist`. For a source-based Nixpacks static deployment, keep the included configuration. See `DEPLOY.md` for the existing host settings.

Publish over HTTPS at the domain root. The static ZIP has `index.html` at its root and includes the proof assets. The source ZIP includes `dist` plus the buildable source and tests. Neither includes dependencies or a secret environment file.

After deployment, unlock on the production origin and check the new section, lock/hide behavior and reload recovery. Journal data stays with its browser profile and origin: records on localhost do not migrate to `hushmark.io`. No pre-existing payments are imported. Clearing browser storage removes this list, not the funds or public transactions.

## Test scope

See `VERIFICATION.md` for exact results. Browser payment tests use temporary fixture wallets and block fund submissions; their finality responses are test fixtures. This change is not an independent security audit or a resolution of a wallet-provider domain/transaction warning. No production deployment or real transfer is performed by packaging this update.
