# Deploy Hushmark

This archive includes the deployable static website in `dist/` and its source code.

## Static hosting

Upload the **contents of `dist/`** as the site root. Keep all files and folders together, including `privacy-circuit/`, `vendor/`, `wallet/`, and `docs/`. The site uses root-relative URLs, so deploy it at a domain root rather than a subpath.

If your host builds from source, use Node.js 24+ and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Set the publish/output directory to `dist`. For local inspection: `pnpm start`, then open `http://127.0.0.1:4173/`.

The wallet needs browser access to a compatible Phantom or Solflare software wallet, Solana mainnet RPC, and Privacy Cash services. Public RPC/relayer availability is not guaranteed. A funded end-to-end transfer through Hushmark has not yet been verified; read `VERIFICATION.md` before presenting the wallet as production-validated. Deploy over HTTPS for wallet access.
