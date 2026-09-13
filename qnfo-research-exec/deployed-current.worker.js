404: SUPERSEDED 2026-09-13 — DO NOT DEPLOY. This file is a resolver tombstone, not a mirror.

WHY THIS IS A TOMBSTONE
  This path is the FIRST canonical candidate the fleet deploy scanner tries for the worker
  `qnfo-research-exec`:

    (a) qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js   <- this file
    (b) qnfo-ops/main/cloud/qnfo-research-exec/deployed-current.worker.js
    (c) qnfo-workers/main/qnfo-research-exec/worker.js
    (d) qnfo-ops/main/cloud/qnfo-research-exec/worker.js

  The scanner stops at the first candidate that fetches successfully. While this file held a
  valid 0.5.17 bundle, candidate (c) — the canonical source, "0.8.1-quality-gate-fix", 80,916 B —
  was never read, so every fix committed to worker.js was invisible to the deployer.

EVIDENCE (read-only, 2026-09-13, qnfo-ops)
  this blob            sha 55e0e56f1d7aa0581a669e09c151da8a57a4d1b3, 46,180 B
  this file's VERSION   "0.5.17-research-restored"   (MODELS include @cf/zai-org/glm-5.2)
  live /health          {"ok":true,"worker":"qnfo-research-exec","version":"0.8.1"}
  fleet_drift_report    hourly, ids 1610..1706 (2026-09-13 09:02:25 .. 14:04:41):
                          deployed_version    0.8.1
                          canonical_version   0.5.17-research-restored
                          source_path         qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js
                          note                deployed-ahead
  fleet_deploys         zero rows for qnfo-research-exec, ever

SAFETY OF THIS CHANGE
  With this tombstone in place the scanner reads worker.js: canonical "0.8.1-quality-gate-fix"
  vs deployed "0.8.1". The cores are equal and the suffixes differ, which is UNORDERABLE
  (qnfo-fleet-control/version-compare.mjs rule 5) -> no action. Under the older parseInt-based
  comparator the cores are also equal -> no action. Either way this tombstone cannot cause a
  downgrade or an unintended upload. Only a CORE bump (0.8.2-*) makes the scanner act, which is
  exactly what qnfo-research-exec/apply-research-exec-fix.mjs performs.

RESIDUAL RISK (stated, not hidden)
  If a resolver revision does not honour the "404:" prefix, the body yields no VERSION marker,
  so version extraction fails and the candidate is skipped or the upload is rejected as invalid
  JavaScript. Worst case is hourly failed-attempt noise, never a production replacement.

RESTORE (only after the patch is applied, so the mirror is never ahead of or behind the bundle
the scanner would otherwise read)
  git log --follow -- qnfo-research-exec/deployed-current.worker.js     # blob 55e0e56f
  wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js
