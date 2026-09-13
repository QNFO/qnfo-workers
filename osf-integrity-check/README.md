# osf-integrity-check

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: OSF registration integrity check
> Canonical source: this directory (QNFO/qnfo-workers)
> Version marker: `osf-integrity-check/fabric-20260910` (bundle `VERSION` constant; registry row `2.0.0`; the worker's own payload hardcodes `worker_version: "2.0.0"`)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Version marker — do not "tidy" into a semver

The bundle carries `var VERSION = "osf-integrity-check/fabric-20260910"` — deliberately a **deployed
build tag, not a semver**. A qnfo-ops session made the opposite "tidy" on `qnfo-gateway` on
2026-09-13 (normalized `3.6.1-subscribers` → `3.6.1` to drive a drift metric to zero) and had to
revert it: `ops-workspace/quniverse/CORRECTION-semver-normalization-ADDENDUM-2026-09-13.md`. Leave it.

**Comparator precision (corrected 2026-09-13):** the pre-patch comparator parsed a build tag to
`[0]`, so canonical and deployed compared EQUAL. The corrected rule is staged in
`qnfo-fleet-control/version-compare.mjs` (sha `86835e1a`), rule 6 — an unparseable string is
`UNORDERABLE` and `deployDecision()` returns `'blocked'`. Both forms are therefore safe under the
patched rule; the warning is belt-and-braces until that patch is actually deployed (the live
`qnfo-fleet-control` reports 0.4.13 against a repo carrying the corrected rule, and the patch set is
`workflow_dispatch`-only).

## This worker is demonstrably productive — do not prune it on a request-count metric

Measured 2026-09-13: `osf_check_log` held **57 rows**, newest `2026-09-13T14:44:10.634Z`, with runs
at 14:06:16, 14:27:07, 14:30:40, 14:33:23, 14:36:12 and 14:44:10 — i.e. it fires every few minutes,
each run `status:"ok"` with all three registrations (D3 `xt5vj`, D4 `xver8`, D5 `6h83v`) returning
HTTP 200 from `api.osf.io`. `fleet_worker_census` verdict: PRODUCTIVE.

It nevertheless appears in the "8 workers failing the multiple-times-per-day test" list in issue 736
on a `req24 = 1` reading. **That reading is the metric, not the work.** The same census table holds
a `req24 = 1` row for `qnfo-impact` with the opposite verdict (`DAILY-ONLY`), so the same measured
value yields two contradictory verdicts in one table — the census's req24 column is not a
productivity measure for scheduled workers.

## Deferred siblings (stale-canon)

`scanerr:osf-integrity-check = stale-canon` is still set (last written 2026-09-12 11:01:07Z), even
though `self_heal_actions` logs `kind=stale-canon, status=healed, action="canonical resync
osf-integrity-check/fabric-20260910 verified"` **hourly** (ids 1226, 1265, 1304, 1343, 1383 across
2026-09-13 10:01Z → 14:01Z). The heal's `verified_at` is
`qnfo-workers/main/osf-integrity-check/deployed-current.worker.js` — a **dangling pre-migration path
template** (`main/` was flattened away on 2026-07-13; see
`qnfo-fleet-control/PATCH-2026-09-13-canonical-extraction-and-noself.mjs` §4), i.e. the copy source,
not the R2 destination. The canonical store is R2: `qnfo-fleet-control/wrangler.toml` declares
`binding = "CANONICAL" → bucket_name = "qnfo-canonical"`, which is **not bound to the qnfo-ops
endpoint**. `fleet_drift_report` still reads `canonical_version = ""` for this worker. `healed` is
therefore not evidence that drift detection is restored. Do not clear the `scanerr` key to make the
count read zero.
