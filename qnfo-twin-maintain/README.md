# qnfo-twin-maintain

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Twin memory maintenance (agent_memories)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version marker: `qnfo-twin-maintain/fabric-20260910` (bundle `VERSION` constant; registry row says `1.0.1`)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Version marker — do not "tidy" into a semver

The bundle carries `var VERSION = "qnfo-twin-maintain/fabric-20260910"` — deliberately a **deployed
build tag, not a semver**. `num()` parses a build tag to `[0]`, so canonical and deployed compare
EQUAL and this line cannot trigger a redeploy. A semver such as `1.0.0` parses to `[1,0,0]`, marks
the canonical "ahead", and fires a heal PUT of this file over production. A qnfo-ops session made
exactly that "tidy" on `qnfo-gateway` on 2026-09-13 and had to revert it
(`ops-workspace/quniverse/CORRECTION-semver-normalization-ADDENDUM-2026-09-13.md`). Leave it.

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
`qnfo-workers/main/qnfo-twin-maintain/deployed-current.worker.js` — a GitHub path, i.e. **the source
it copied from, not the R2 canonical it claims to have written** — and `fleet_drift_report` still
reads `canonical_version = ""` for this worker. `healed` is therefore not evidence that drift
detection is restored. The missing actuator is the R2 canonical write, which is not bound to the
qnfo-ops endpoint. Do not clear the `scanerr` key to make the count read zero.
