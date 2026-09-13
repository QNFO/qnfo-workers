404: SUPERSEDED 2026-09-13 — DO NOT DEPLOY. See SUPERSEDED-2026-09-13.md in this directory.

Second resolver-visible canonical candidate for a worker named `qnfo-fleet-calibrator`:
  candidate (a) qnfo-workers/main/<w>/deployed-current.worker.js   <- also tombstoned
  candidate (c) qnfo-workers/main/<w>/worker.js                    <- this file

Both candidates had to be tombstoned: neutralizing only (a) would leave (c) as the winning body, so the
resolver would still find and upload this pre-merge calibration controller.

MERGE WAVE A (2026-09-11) folded qnfo-fleet-calibrator into `qnfo-fleet-control`
(route qnfo-fleet-control.q08.workers.dev), dispatched by path `/cal/*`. The name is unclaimed:
https://qnfo-fleet-calibrator.q08.workers.dev/health -> HTTP 404; no `service_registry` row; zero
`fleet_deploys` rows ever.

ARCHIVE (content preserved, byte-for-byte, in git):
  prior blob sha  fde783fa7b0543af7106a44b3523e1c26309d341
  prior size      35,770 B
  retrieve via    github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-calibrator/worker.js ref=fde783fa

Note: 35,770 B is above the 32,768-char read cap available to qnfo-ops, so this file cannot be read in
full from the ops endpoint. The git blob is the archive of record.

If the `qnfo-fleet-calibrator` name is ever deliberately recreated, restore from the ref above, review
it, and remove both tombstones — do not recreate the name from a pre-merge body.
