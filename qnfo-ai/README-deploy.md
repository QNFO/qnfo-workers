# qnfo-ai deployment (canonical-state, updated 2026-09-03)

Deployable artifact: `worker.js` IS the canonical source AND the deployed bundle
(no separate build step in this repo state). `deployed-current.worker.js` mirrors
it byte-for-byte after every deploy. As of v5.16.6/5.16.7 the two files are
identical (sha da5dd13f -> updated each release).

Flow:
1. Edit `worker.js` (bundle-as-truth; keep the VERSION constant + header current)
2. Deploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=edb167b78c9fb901ea5bca3ce58ccc4b wrangler deploy` (from this dir; wrangler.toml carries all bindings; secrets are preserved)
3. Verify: poll /health for the new VERSION (DEPLOY-VERIFY-VERSION-1)
4. Sync: `cp worker.js deployed-current.worker.js` and commit both

History note (2026-08-31 era): an older README said worker.js was doc-only and
deployed-current.worker.js was the live esbuild bundle deployed via GitHub Actions
API PUT. That state was reconciled 2026-09-03: deployed-current had gone stale
(5.16.4) while live was 5.16.5 (worker.js). Both files are now identical and
worker.js is canonical.