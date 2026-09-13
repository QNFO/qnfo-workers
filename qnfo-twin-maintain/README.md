# qnfo-twin-maintain

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Twin memory maintenance (agent_memories)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version marker: `qnfo-twin-maintain/fabric-20260910` (bundle `VERSION` constant; registry row says `1.0.1`)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Version marker — do not "tidy" into a semver

The bundle carries `var VERSION = "qnfo-twin-maintain/fabric-20260910"` — deliberately a **deployed
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

## Status 2026-09-13: the store it maintains is EMPTY

This worker's declared output is `agent_memories` in the personal-life D1 database. Measured
2026-09-13: `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM agent_memories` returned
**n = 0** — no rows, no oldest, no newest. The worker scans, decays, dedupes and prunes that table;
with the table empty, every branch is a no-op and the worker cannot produce a measurable outcome
regardless of whether it fires correctly.

`fleet_worker_census` verdict: **DAILY-ONLY**, reason *"hourly cron but its own dispatcher flagged
0 invocations - iss-9d0ff956"*. Both halves matter: the run cadence is disputed **and** the target
store is empty. Consolidation candidates should weigh this worker against the empty-store fact, not
against its invocation count alone — a fixed scheduler would still yield zero outcome.

Reachability: no `/health` route. `https://qnfo-twin-maintain.q08.workers.dev/health` returns HTTP
404; the plain workers.dev host returns HTTP 530 (no route published there). This is the second of
the two workers with no live probe (the other is `obsidian-writer`).

## Deferred siblings (stale-canon)

`scanerr:qnfo-twin-maintain = stale-canon` is still set (last written 2026-09-12 11:02:37Z), even
though `self_heal_actions` logs `kind=stale-canon, status=healed, action="canonical resync
qnfo-twin-maintain/fabric-20260910 verified"` **hourly** (ids 1258, 1297, 1336, 1375, 1413 across
2026-09-13 10:02Z → 14:05Z). The heal's `verified_at` is
`qnfo-workers/main/qnfo-twin-maintain/deployed-current.worker.js` — a **dangling pre-migration path
template** (`main/` was flattened away on 2026-07-13; see
`qnfo-fleet-control/PATCH-2026-09-13-canonical-extraction-and-noself.mjs` §4), i.e. the copy source,
not the R2 destination. The canonical store is R2: `qnfo-fleet-control/wrangler.toml` declares
`binding = "CANONICAL" → bucket_name = "qnfo-canonical"`, which is **not bound to the qnfo-ops
endpoint**. `fleet_drift_report` still reads `canonical_version = ""` for this worker. `healed` is
therefore not evidence that drift detection is restored. Do not clear the `scanerr` key to make the
count read zero.
