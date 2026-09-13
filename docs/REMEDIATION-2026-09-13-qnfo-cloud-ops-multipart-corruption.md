# REMEDIATION — qnfo-cloud-ops deploy loop: canonical artifact is a raw MIME body

Filed 2026-09-13T07:25Z by qnfo-ops (audit endpoint). Status: **diagnosed, fix blocked** —
requires an R2 write this endpoint does not have.

## Symptom

`fleet_deploys` — qnfo-cloud-ops retried **25 times, 25 failures**, hourly, identical every time:

```
worker:      qnfo-cloud-ops
source_path: r2:qnfo-canonical/qnfo-cloud-ops.js
from_sha:    1.14.1
to_sha:      1.14.1-gtd-guard
ok:          0
HTTP 400 code 10021
Uncaught SyntaxError: Invalid or unexpected token
  at worker.js:1:2
```

## Root cause

`qnfo-cloud-ops/deployed-current.worker.js` (121,107 B,
sha `8a141efa6658cf3604a64074b738094b12d94a7e`) does **not** start with JavaScript. It
starts with an unconsumed multipart/form-data wrapper:

```
--75c3e06c5bc8c3b1f57419c665412e3fe5a6e889c944c94ff9de81b2036d
Content-Disposition: form-data; name="worker.js"

var __defProp = Object.defineProperty;
...
```

The upload API parses the artifact as JS. Column 2 of line 1 is the **second `-` of the MIME
boundary** — hence `SyntaxError at worker.js:1:2`. The genuine payload begins on line 4.

This is a **strippable prefix**, not a truncation or a logic bug. Everything up to and
including the blank line after `Content-Disposition` is transport debris.

## Fix

Replace the object body of `r2:qnfo-canonical/qnfo-cloud-ops.js` with clean JS. Two clean
copies already exist in Git, both declaring the exact pending target version
`VERSION = "1.14.1-gtd-guard"`:

| source | size | sha |
|---|---|---|
| `QNFO/qnfo-ops/cloud/scheduler/worker.js` (declared canonical) | 112,705 B | `1851450db2fbc3c4b0e1fb55f725f70d9bbe404a` |
| `QNFO/qnfo-workers/qnfo-cloud-ops/worker.js` | 129,467 B | `ca488a2c697f8c6cc84c87a95d62f2cd13b86077` |

Either is a valid payload. Do **not** re-run the upload that produced the wrapped file — that
is what re-corrupts the object. Note `worker.js` (129 KB) and `deployed-current.worker.js`
(121 KB) differ by ~8 KB; confirm which is authoritative before promoting.

## Blast radius

Checked the other canonical-ahead mirrors named by the 07:05Z drift scan. **All clean:**

- `qnfo-archive/deployed-current.worker.js` — clean
- `qnfo-ddocs-indexer/…` — clean
- `qnfo-email/…` — clean
- `qnfo-lifecycle/…` — clean
- `qnfo-paper-indexer/…` — clean
- `qnfo-qwav/…` — clean
- `qnfo-social/…` — clean
- `qnfo-fleet-advisor/…` — clean

So the MIME corruption is **isolated to qnfo-cloud-ops**. `qnfo-agent-orchestrator` has no
`deployed-current.worker.js` at all (path not found) yet the drift scan reports it
canonical-ahead at `v1.0.0` — separate gap.

## Not the same bug: personal-companion

`personal-companion` also fails 20/24, but differently and with a **clean** artifact
(62,666 B, sha `c06edffb…`, `var VERSION = "1.0.0"`):

```
HTTP 400 code 10021
Workflow GenerationFlow must be exported or a script_name must be specified
```

A binding/export mismatch: the upload declares a Workflow binding the script never exports.
Separately, the transition is `v1.1.0 → 1.0.0` — a **downgrade**, so the "canonical" target
is older than what is live. Fixing the export alone would roll the worker backwards.

## Why this ticket is not self-healing

Both failures are **source defects**. The heal loop's own ledger (`self_heal_actions`)
records `drift: healed 9, failed 44, deferred 179` — the 44 failures are essentially these
two workers retried hourly. No amount of retrying repairs a malformed artifact; the
canonical object must be rewritten. That requires write access to the `qnfo-canonical` R2
bucket, which the qnfo-ops audit endpoint does not have (bound buckets: releases | audit |
backups | skills).

## Related, same session

- `research-scan` (daily 08:00) last ran **2026-09-10T08:00:45Z** — 3 runs missed (~71 h).
- `radar` (venue, daily ~07:28) last ran **2026-09-10T07:28:35Z** (~72 h).
  Both stopped on the morning of 09-10, matching the fleet-wide `fabric-20260910` versions.
- The 09-13 `job-silence` alerts for `gmail-triage` (0.2 h) and `briefing` (0.7 h) are
  **false positives** — both had run within the hour. `outreach` (70.2 h) is ambiguous:
  its `/health` reports `activation_at: 2026-09-15`.
