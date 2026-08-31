# qnfo-ai deployment (bundle-as-truth, decided 2026-08-31)

DEPLOYABLE ARTIFACT: `deployed-current.worker.js` — the live esbuild BUNDLE. It is
the source of truth for what runs. Deploy via the GitHub Actions workflow
(`deploy-worker.yml`, Cloudflare API PUT with keep_bindings) or the API directly.

`worker.js` = CLEAN SOURCE (reconstructed 2026-08-11, v4.3.0-era) — DOCUMENTATION ONLY,
STALE as of 2026-08-31 (missing ~1.2 versions of model additions + recent fixes:
persona removal, isCurrentEvents auto-web-search, browserMarkdown, intent-harvest,
/v1/threads read-back, first-user thread keying). Do NOT deploy it; do NOT edit it
as if it were live.

Workflow: edit the live worker (bundle) -> deploy -> push the new bundle to
`deployed-current.worker.js` (keep versioned snapshots like deployed-5.5.3-patched.worker.js).
