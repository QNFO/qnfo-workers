# research-daily-brief

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Daily research email digest
> Canonical source: this directory (QNFO/qnfo-workers)
> Version marker: `research-daily-brief/fabric-20260910` (bundle `VERSION` constant; registry row says `1.0.0`)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Version marker — do not "tidy" into a semver

The bundle carries `var VERSION = "research-daily-brief/fabric-20260910"` — deliberately a **deployed
build tag, not a semver**. `num()` parses a build tag to `[0]`, so canonical and deployed compare
EQUAL and this line cannot trigger a redeploy. A semver such as `1.0.0` parses to `[1,0,0]`, marks
the canonical "ahead", and fires a heal PUT of this file over production. A qnfo-ops session made
exactly that "tidy" on `qnfo-gateway` on 2026-09-13 and had to revert it
(`ops-workspace/quniverse/CORRECTION-semver-normalization-ADDENDUM-2026-09-13.md`). Leave it.

## Status 2026-09-13: DEGRADED — the digest failed and produced no row anywhere

This worker **does not have a measurable outcome on its last run**, and it is the one of the four
stale-canon siblings where that is a real defect rather than a metric artefact:

- `[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z` was sent to `alerts@qnfo.org` twice —
  outbound email id 709 (`status: sent`, 06:07:39Z) and bounce id 708 (06:07:38Z).
- `subscriber_digest_runs` holds **0 rows**, so the digest produced no record of its own output.
- No `cloud_ops_events` row exists for the failure, and no open ticket was filed at the time — the
  only trace was the two emails. Tracked as issue **719**; the detection-to-execution gap it
  documents is the same class as issues 736/737.
- `fleet_worker_census` verdict: **DEGRADED** (`FAILED 2026-09-13T06:07:35Z per issue 719 - no
  cloud_ops_events record`).

Do not read the absence of a ticket as absence of a failure: this worker alerts by email and does
not write an event row, so its failures are invisible to every D1-based instrument.

## Deferred siblings (stale-canon)

`scanerr:research-daily-brief = stale-canon` is still set (last written 2026-09-12 11:02:43Z), even
though `self_heal_actions` logs `kind=stale-canon, status=healed, action="canonical resync
research-daily-brief/fabric-20260910 verified"` **hourly** (ids 1259, 1298, 1337, 1376, 1414 across
2026-09-13 10:02Z → 14:05Z). The heal's `verified_at` is
`qnfo-workers/main/research-daily-brief/deployed-current.worker.js` — a GitHub path, i.e. **the
source it copied from, not the R2 canonical it claims to have written** — and `fleet_drift_report`
still reads `canonical_version = ""` for this worker. `healed` is therefore not evidence that drift
detection is restored. The missing actuator is the R2 canonical write, which is not bound to the
qnfo-ops endpoint. Do not clear the `scanerr` key to make the count read zero.
