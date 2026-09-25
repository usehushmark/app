# Private Activity Design

## Goal

Add an encrypted, wallet-scoped local activity journal for deposits and withdrawals initiated through Hushmark. It must improve recovery and status visibility without changing protocol transactions, requesting extra wallet signatures, or exposing private data in browser storage or the DOM while locked.

## Scope

- Add local activity modules for encrypted storage, transaction-status verification, and safe DOM rendering.
- Integrate journal records into the existing deposit and withdrawal lifecycle.
- Add a `Private activity` wallet section, a Docs section, and a Roadmap entry.
- Preserve the current HUSHM token, contract-address copy control, Whitepaper navigation, mobile layout, Docs/Roadmap shell, and current wallet copy.
- Add unit and browser coverage for encryption, account isolation, status verification, lock behavior, and responsive layout.

## Explicitly excluded

- No backend, analytics, telemetry, or server-side activity storage.
- No migration of archived deployment configuration, generated static output, or stale UI copy.
- No change to the Privacy Cash SDK recovery message, note encryption scheme, relayer payload, recipient validation, or wallet signing flow.
- No automatic transaction polling or background network requests.

## Data model and privacy boundary

Each unlocked wallet derives a separate non-extractable AES-GCM key from the existing first unlock signature using HKDF, an owner-bound salt, authenticated additional data, and an activity-specific purpose string. The activity key is separate from the Privacy Cash note-key derivation.

The browser stores one encrypted envelope in local storage per wallet owner under an owner-scoped key. It may retain at most 100 records and 200 KiB of serialized encrypted data. Records may contain only:

- record ID, activity type, asset, atomic amount, net amount, fee
- creation/update time, status, public transaction signature
- a SHA-256 digest of a withdrawal proof

It must never store recipient addresses, raw proofs, unlock signatures, private-note keys, relay errors, balances, or decrypted records in persistent plaintext.

If ciphertext is corrupt or cannot be authenticated, the interface must keep it intact, show an explicit recovery warning, and allow only an intentional user clear. It must never overwrite corrupt data silently.

## Wallet lifecycle

1. Unlock uses the current two-signature flow unchanged.
2. After successful unlock, the journal initializes from the existing first signature. Journal failure warns but does not prevent access to the wallet.
3. Before a relay submission, Hushmark records an `submission-unknown` entry so an interrupted response is recoverable.
4. After a relay response, it records the public signature and submitted status.
5. Withdrawal records include only a digest of the submitted proof.
6. Lock releases the journal key, clears private activity nodes from the DOM, and retains only encrypted local ciphertext.
7. A storage event reloads the visible journal only for the same unlocked owner.

## Status verification

- Status refresh is user initiated and requests only the saved public signature.
- Missing or pending RPC results are never treated as final.
- Deposits use normal signature status semantics.
- A finalized withdrawal must also contain the expected proof digest in a Privacy Cash program instruction before it is marked finalized.
- A mismatched or unavailable withdrawal receipt remains unverified or proof-mismatched, never finalized.

## UI and content

The wallet receives a `03 / ONLY ON THIS BROWSER` section after the existing wallet controls. It shows a toggle to hide records, an explicit clear confirmation, manual refresh actions, and a public explorer link for each saved transaction. The section must fit the existing dark UI and remain horizontal-overflow free at mobile widths.

Docs receives an `Activity` section explaining local encryption, the stored fields, manual status checks, wallet scoping, and clear behavior. The existing Docs sidebar becomes six sections. Roadmap receives an integrated private-activity item whose wording matches the implemented behavior.

## Verification

- Unit tests cover encrypted persistence, strict field validation, cross-wallet isolation, tamper protection, concurrency, retention limits, and key release.
- Status tests cover pending, failed, finalized, missing proof, and mismatched proof states.
- Browser tests confirm no activity values appear before unlock, after hide, or after lock; no extra signature is requested; ciphertext contains no plaintext records; clear remains owner-scoped; and the activity panel has no horizontal overflow at desktop and mobile widths.
- Run the existing full test suite, production build, and whitespace check before push.

## Merge strategy

Manually merge the archive's activity source into the current repository. Keep local generators, layout enhancement, HUSHM/CA integration, Whitepaper routing, and current deployment configuration authoritative. Do not copy archive `dist` files or deployment manifests.
