# Deploy Hushmark

This archive includes the deployable static website in `dist/` and its source code.

## Static hosting

Upload the **contents of `dist/`** as the site root. Keep all files and folders together, including `privacy-circuit/`, `vendor/`, `wallet/`, and `docs/`. The site uses root-relative URLs, so deploy it at a domain root rather than a subpath.

If your host builds from source, use Node.js 24.x and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Set the publish/output directory to `dist`. For local inspection: `pnpm start`, then open `http://127.0.0.1:4173/`.

## Nixpacks with static-site mode

Use the source archive `Hushmark-Nixpacks-Deploy-v5.zip`. Extract its contents into the root of the repository connected to the hosting panel, including `nixpacks.toml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `dist/`. Keep the authored images, styles, and proof assets in `dist/`; the build does not recreate every authored asset from scratch.

For a panel with Coolify-style settings:

| Setting | Value |
| --- | --- |
| Build Pack | Nixpacks |
| Is it a static site? | Enabled |
| Base Directory | `/` (the directory with `package.json` and `nixpacks.toml`) |
| Publish Directory | `/dist` |
| Port | `80` (static Nginx server) |
| Install / Build / Start overrides | Leave empty to use the checked-in configuration |

`nixpacks.toml` selects Node 24 and invokes pnpm 11.19.0 explicitly. Installation includes build dependencies. Nixpacks runs the source build; the host's static-site mode serves its output. Do not configure `pnpm start` for static mode: `serve.mjs` is only a localhost preview server.

Clear any older command or Node-version overrides in the hosting panel, since panel/CLI configuration can override `nixpacks.toml`. Redeploy after updating the repository. If the panel requires explicit commands, use:

```sh
# Install Command
npx --yes --package=pnpm@11.19.0 pnpm install --frozen-lockfile --prod=false
# Build Command
npm run build
```

An existing Nixpacks error screenshot showed only a generic exit code, not the failing command. This configuration removes known package-manager/runtime ambiguity; it is not evidence that the original server failure is resolved. The revised build has to be confirmed in that hosting environment. No Docker/Nixpacks container build has been run on this Windows machine.

Local verification on 2026-09-24, before the test-status copy update: in a clean source copy on Windows with Node 24.19.0, installation via npm exec selecting pnpm 11.19.0 with `--frozen-lockfile --prod=false` succeeded; `npm run build` succeeded; all seven unit tests passed. That build's 26 static files matched the previous build byte-for-byte, and the lockfile did not change.

References: https://coolify.io/docs/applications/builds/nixpacks/deploy and https://nixpacks.com/docs/configuration/file.

## Cloudflare Pages direct upload

If using Cloudflare Pages itself instead of a Nixpacks hosting panel, use `Hushmark-Static-Deploy-v5.zip`. It contains the final assets with `index.html` at the archive root. Upload that ZIP in a Pages Direct Upload project; no install or build command is needed. A Git-integrated Pages project instead uses the source build and output directory `dist`.

Reference: https://developers.cloudflare.com/pages/get-started/direct-upload/.

The wallet needs browser access to a compatible Phantom or Solflare software wallet, Solana mainnet RPC, and Privacy Cash services. On 2026-09-24, the owner reported successful Hushmark testing with real SOL and USDC; see `VERIFICATION.md` for scope and coverage limits. Public RPC/relayer availability is not guaranteed. Deploy over HTTPS and check service access and wallet behavior on the new deployment.


## v4 handoff

Read `WALLET-TOOLS-HANDOFF.md`. This update has not been published by the development task. Keep the whole `dist/` folder and `templates/` in the source repository. Do not run a clean command that removes authored `dist` assets. The static ZIP is already built and has `index.html` at its root; the Nixpacks ZIP contains source plus `dist/`.

Serve over HTTPS, purge stale HTML/JavaScript/CSS caches together after deployment, and check `/wallet/`, `/docs/`, `/roadmap/`, and the existing whitepaper link. No new backend, database, API secret, or token mint is required for these four features. A host-injected analytics script is not included in the ZIP; review any analytics enabled separately in your hosting panel.

Portable v4 verification on 2026-09-26: a fresh source copy installed its 264 locked packages, built with Node 24.19.0/pnpm 11.19.0, passed all 33 unit tests and produced 29 static files identical to the working build. No Docker/Nixpacks container was run locally.

For the latest USDT extension, read `USDT-HANDOFF.md`. Deploy the v5 archive; v4 has only SOL/USDC.
