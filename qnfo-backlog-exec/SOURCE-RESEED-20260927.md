# SOURCE-RESEED 2026-09-27 — qnfo-backlog-exec

**Finding.** LIVE `qnfo-backlog-exec` served version **1.5.0** while repo-main `worker.js` was
**1.4.0**; no commit contains the 1.5.0 source. Same class as `qnfo-email/SOURCE-RESEED-20260927.md`
(REPO-IS-DEPLOY-SOURCE-1 regression risk on the next repo-sourced deploy).

**Remediation.** Deployed bundle captured from the CF API and re-seeded into both
`worker.js` and `deployed-current.worker.js`. Previous 1.4.0 source remains in git history.
