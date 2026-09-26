# HUSHM private-pool integration: verification result

Checked: 2026-09-26T11:04:32.523Z (UTC). Current Hushmark integration: Privacy Cash SDK 1.2.2. npm latest also returned 1.2.2 at this check.

## Result

HUSHM cannot currently be enabled through the unmodified integration. No production UI, supported asset list, wallet transaction flow or v4 ZIP was changed. No wallet was connected and no funds were sent.

## Verified evidence

- HUSHM mint: `F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump`. Onchain metadata identifies HUSHMARK / HUSHM, six decimals, initialized. Owner program is `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022). Mint and freeze authorities are null. These facts do not establish a security audit or liquidity.
- Mainnet genesis was verified against Hushmark's configured genesis. The first identity read timed out; its separate retry succeeded. Account observations were finalized at slot 450655768.
- The installed SDK's supported token registry does not contain HUSHM. Deposit, withdrawal and private-balance scanning reject unregistered mint addresses with `token not found`.
- Following the installed SDK's exact `merkle_tree` + mint PDA derivation, expected HUSHM tree `GwKcSfXLjNmwb7ejzc5xJum1KVs8TVvXPaNaZbyWVjGT` has no account. USDC control tree `EWLATxsYVfC9asoDqUPvsFTkvKyFtHKFWfJ7WGigHaxp` exists and is owned by the configured Privacy Cash program. This finding is scoped to the program and derivation used by this integration, not every possible protocol deployment.
- The public relayer configuration has no HUSHM fee or minimum-withdrawal entry. Configuration alone is not an exhaustive listing API, but it provides no evidence that HUSHM withdrawals are supported.
- Additional compatibility blocker: SDK deposit instructions explicitly use the legacy SPL Token program. Withdrawal uses `getMint` and associated-account derivation with the legacy defaults. HUSHM uses Token-2022. Merely inserting the mint into the frontend or SDK array would not make the transfer path compatible.

## Required before implementation

Obtain protocol-side confirmation of Token-2022 support for this exact mint, pool initialization procedure/authority, compatible SDK version, mint-bound relayer/indexer support, withdrawal fee/minimum configuration, proving assets and complete deposit/withdraw/recovery compatibility. Any protocol changes need their own review and testing before assets are enabled.

A custom pool would be a separate protocol project with contracts, indexer, relayer, recovery work and security review. It is not part of the existing website change. Swapping HUSHM into SOL/USDC is a different product route and does not create a private HUSHM balance.

## Questions prepared for Privacy Cash (not sent)

We maintain Hushmark, a Solana frontend integrating Privacy Cash SDK 1.2.2. We would like to assess support for HUSHM:

- Mint: F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump
- Token program: Token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
- Decimals: 6; onchain extensions: metadataPointer and tokenMetadata

Does your current deployed Solana protocol support this Token-2022 mint type? If so, what is the process for enabling its pool, SDK token registry, indexer and relayer? Please provide the supported program/pool addresses, SDK version, required configuration, fees/minimums and any token-admission requirements. Our current SDK path uses legacy token-program defaults, so we need explicit confirmation of the supported Token-2022 path before enabling deposits.

## Repeat and inspect

- `node scripts/check-hushm-support.mjs`: read-only mint, mainnet, pool, public config and npm version checks; writes `qa/hushm-support-check.json`.
- `node scripts/probe-hushm-sdk.mjs`: offline rejection checks for the installed SDK; network calls are prohibited by the probe.
- Raw current evidence: `qa/hushm-support-check.json`.
- Installed SDK: `node_modules/privacycash/dist/utils/constants.js`, `depositSPL.js`, `withdrawSPL.js`, `getUtxosSPL.js`.
- Official SPL support: https://privacycash.mintlify.app/sdk/spl-tokens
- Official fee configuration: https://api3.privacycash.org/config
- Official SDK repository: https://github.com/Privacy-Cash/privacy-cash-sdk

This is a timestamped feasibility check, not an announcement that HUSHM private transfers are available.
