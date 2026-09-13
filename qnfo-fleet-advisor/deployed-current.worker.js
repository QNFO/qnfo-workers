404: SUPERSEDED 2026-09-13 — DO NOT DEPLOY. See SUPERSEDED-2026-09-13.md in this directory.

Resolver-visible canonical candidate for a worker named `qnfo-fleet-advisor`:
  candidate (a) qnfo-workers/main/<w>/deployed-current.worker.js   <- this file
  candidate (c) qnfo-workers/main/<w>/worker.js                    <- absent in this directory

MERGE WAVE A (2026-09-11) folded qnfo-fleet-advisor + qnfo-fleet-calibrator + qnfo-fleet-deploy into
ONE worker: `qnfo-fleet-control` (route qnfo-fleet-control.q08.workers.dev), which dispatches by path
(`/advisor/*`, `/cal/*`, else deploy control plane).

The name is unclaimed and unscanned: https://qnfo-fleet-advisor.q08.workers.dev/health -> HTTP 404;
no `service_registry` row (55 rows, verified 2026-09-13); not in the current 55-worker drift scan;
last `fleet_deploys` row for this name is 2026-09-09 19:39:57 (n=3, oks=1).

Tombstone rationale: the deploy resolver honours the `404:` prefix and skips this candidate, so a
future re-enumeration of the name cannot silently upload this pre-merge advisor (cron `*/20 * * * *`,
ensemble advice via llama-3.3-70b + gpt-oss-120b adversarial review, PROBE_WORKERS sweep) alongside
the merged worker — i.e. two actuators reading the same audit tables, uncoordinated.

ARCHIVE (content preserved, byte-for-byte, in git):
  prior blob sha  7d765675fc97b0772d8e69d161b442095f39a0ae
  prior size      19,074 B
  retrieve via    github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-advisor/deployed-current.worker.js ref=7d765675

If the `qnfo-fleet-advisor` name is ever deliberately recreated, restore from the ref above, review it,
and remove this tombstone — do not recreate the name from a pre-merge body.
