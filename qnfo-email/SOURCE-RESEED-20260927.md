# SOURCE-RESEED 2026-09-27 — qnfo-email

**Finding.** LIVE `qnfo-email` served `/health` version **2.1.0** (`command_control:"limited"`,
`raw_archive:true`, `mime_guard:true`) while repo-main `worker.js` was **2.0.8**. NO commit in
`qnfo-workers` history ever contained 2.1.0 (`git log --all -S '2.1.0' -- qnfo-email/worker.js` is
empty), so the 2.1.0 source was deployed from a local copy that was never committed.

**Why that is dangerous.** `qnfo-workers` main is the deploy source (REPO-IS-DEPLOY-SOURCE-1). Any
repo-sourced redeploy of `qnfo-email` would have silently **regressed** live from 2.1.0 to 2.0.8,
dropping the raw-archive + MIME-guard behaviour.

**Remediation.** The deployed bundle was captured from the CF API
(`GET /accounts/{acct}/workers/scripts/qnfo-email/content/v2`) and written to BOTH
`deployed-current.worker.js` (its stated purpose) and `worker.js` (re-seeded), so the repo now
reproduces the live program. The previous 2.0.8 source remains in git history
(`git show 8b5a82a:qnfo-email/worker.js`).

**Residual.** The re-seeded bundle is wrangler-minified (11 458 B vs the 43 504 B readable source);
readability of the 2.1.0 delta is degraded until it is un-minified or re-implemented upstream.
