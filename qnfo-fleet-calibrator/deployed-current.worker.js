404: SUPERSEDED 2026-09-13 — DO NOT DEPLOY. See SUPERSEDED-2026-09-13.md in this directory.

Resolver-visible canonical candidate for a worker named `qnfo-fleet-calibrator`:
  candidate (a) qnfo-workers/main/<w>/deployed-current.worker.js   <- this file
  candidate (c) qnfo-workers/main/<w>/worker.js                    <- also tombstoned

MERGE WAVE A (2026-09-11) folded qnfo-fleet-calibrator into `qnfo-fleet-control`
(route qnfo-fleet-control.q08.workers.dev), dispatched by path `/cal/*`.

The name is unclaimed and unscanned: https://qnfo-fleet-calibrator.q08.workers.dev/health -> HTTP 404;
no `service_registry` row (55 rows, verified 2026-09-13); zero `fleet_deploys` rows ever for this name.

Tombstone rationale: the resolver honours the `404:` prefix and skips this candidate. This body was an
autonomous fleet calibration/stress controller with self-correcting autonomous adjustments and a
`RUN_SECRET`-gated `/run` endpoint. Resurrecting it would put a second, uncoordinated actuator against
the same `qnfo-audit` tables the merged worker already writes.

ARCHIVE (content preserved, byte-for-byte, in git):
  prior blob sha  913392b6c7e39d3b3b969265bb4dbaae0b9d0925
  prior size      34,766 B
  retrieve via    github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-calibrator/deployed-current.worker.js ref=913392b6

If the `qnfo-fleet-calibrator` name is ever deliberately recreated, restore from the ref above, review
it, and remove this tombstone — do not recreate the name from a pre-merge body.
