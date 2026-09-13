# SUPERSEDED — this directory is not what runs

Recorded by qnfo-ops 2026-09-13. Verified against live fleet state, not inferred.

## The topology change

MERGE WAVE A (2026-09-11) folded **qnfo-fleet-calibrator** (with qnfo-fleet-advisor and
qnfo-fleet-deploy) into ONE worker: `qnfo-fleet-control` (route `qnfo-fleet-control.q08.workers.dev`),
dispatching by path — `/cal/*` is the calibration subsystem inside that bundle.

| probe (2026-09-13) | result |
|---|---|
| `https://qnfo-fleet-calibrator.q08.workers.dev/health` | **HTTP 404** — the name is unclaimed |
| `service_registry` | 55 rows; no `qnfo-fleet-calibrator` row |
| drift scan id 1689 (13:03:53Z) | `scanned=55` == registry row count → this name is not enumerated |
| `fleet_deploys` | **zero rows ever** for this name |
| `fleet_drift_report` | no rows for this name |

`wrangler.toml` here still declares `name = "qnfo-fleet-calibrator"`, `main = "worker.js"`, and
documents a `RUN_SECRET`-gated `/run` endpoint plus a runbook. That is a live-looking, token-gated
control surface on a name nobody owns.

## ACTION TAKEN — both resolver-visible candidates tombstoned

| path | prior blob sha | prior size | commit |
|---|---|---|---|
| `qnfo-fleet-calibrator/deployed-current.worker.js` | `913392b6c7e39d3b3b969265bb4dbaae0b9d0925` | 34,766 B | `be9ca707` |
| `qnfo-fleet-calibrator/worker.js` | `fde783fa7b0543af7106a44b3523e1c26309d341` | 35,770 B | `782dfc6a` |

**Both** candidates had to be tombstoned: the resolver tries `deployed-current.worker.js` first, then
falls through to `worker.js`. Neutralizing only one leaves the other as the winning body.

Content preserved byte-for-byte in git; retrieve with
`github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-calibrator/worker.js ref=fde783fa`.

Why a `404:` tombstone: the resolver honours the `404:` prefix and skips the candidate, whereas a stub
carrying a valid VERSION would be uploaded and would replace a live worker.

## READ-CAP NOTE

Both archived bodies exceed the 32,768-char read cap available to qnfo-ops (34,766 B and 35,770 B), so
neither could be read in full from the ops endpoint before tombstoning. The git blob is the archive of
record. This is the same envelope limit that blocks validating the live control-plane patch.

## STILL OPEN

1. `wrangler.toml` still names this worker; a `wrangler deploy` here would upload the tombstone text
   and fail loudly at the API (not silently resurrect). Do not "fix" that by restoring the source.
2. The **live** `qnfo-fleet-control` bundle remains unguarded against version-comparator downgrades
   (75,875 B > read cap; patch staged, not validated).
