404: SUPERSEDED 2026-09-13 — DO NOT DEPLOY. See SUPERSEDED-2026-09-13.md in this directory.

This path is a resolver-visible canonical candidate for a worker named `qnfo-fleet-deploy`:
  candidate (a) qnfo-workers/main/<w>/deployed-current.worker.js
  candidate (c) qnfo-workers/main/<w>/worker.js
The live control plane is `qnfo-fleet-control` (route qnfo-fleet-control.q08.workers.dev, /health
self-reports worker="qnfo-fleet-deploy", version 0.4.11). A worker at the name
`qnfo-fleet-deploy` does NOT exist: https://qnfo-fleet-deploy.q08.workers.dev/health -> HTTP 404.

This file was replaced by a `404:` tombstone on 2026-09-13 because the deploy resolver honours the
`404:` prefix and will skip this candidate, whereas a stub or stale-but-valid body WOULD be uploaded
and would replace the live worker.

Why the tombstone: this was the PRE-GUARD v0.4.10/v0.4.11 deployer (VERSION 0.4.11, NO_SELF =
["qnfo-fleet-deploy"]). Its `newer()` comparator and its `canonical()` candidate order are the
pre-fix versions — the ones that misparse `v`-prefixed and build-tag versions and can compute a
downgrade. If it were deployed it would read the SAME `qnfo-audit.fleet_deploy_state` row
(live: enabled=1, auto_heal=1) and resume healing the fleet with the unguarded comparator. That is
the exact defect the guard exists to prevent.

ARCHIVE — content is NOT lost, it is byte-identical at both resolver paths:
  prior blob sha  ed539ec3254633ed265aa344bbbcffd6cc5fdc9d
  prior size      24,761 B
  retrieve via    github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-deploy/worker.js ref=ed539ec3

If the `qnfo-fleet-deploy` name is ever deliberately recreated, remove this tombstone FIRST and
point the canonical at a guarded bundle; do not recreate the name from the pre-merge source.
