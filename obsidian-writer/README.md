# obsidian-writer

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Obsidian-vault R2 file writer (radar sink)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version marker: `obsidian-writer/fabric-20260910` (bundle `VERSION` constant; registry row says `1.0.0`)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Version marker — do not "tidy" into a semver

The bundle carries `var VERSION = "obsidian-writer/fabric-20260910"` — deliberately a **deployed
build tag, not a semver**. `num()` parses a build tag to `[0]`, so canonical and deployed compare
EQUAL and this line cannot trigger a redeploy. A semver such as `1.0.0` parses to `[1,0,0]`, marks
the canonical "ahead", and fires a heal PUT of this file over production.

This is not hypothetical: on 2026-09-13 a qnfo-ops session normalized `qnfo-gateway`'s registry
version from `3.6.1-subscribers` to `3.6.1` to drive a drift metric to zero, and had to revert it
(`ops-workspace/quniverse/CORRECTION-semver-normalization-ADDENDUM-2026-09-13.md`). The non-semver
form is a safety mechanism. Leave it.

### Comparator precision — correction to the paragraph above (added 2026-09-13)

The sentence "a build tag parses to `[0]`, so canonical and deployed compare EQUAL" describes the
**pre-patch** comparator. The corrected rule is staged in `qnfo-fleet-control/version-compare.mjs`
(5,840 B, sha `86835e1a`), rule 6: an unparseable string such as a build tag is `UNORDERABLE`, and
`deployDecision()` then returns `'blocked'` — the caller must not redeploy. Under that rule **both**
forms are safe: a build tag is UNORDERABLE, and a semver canonical compared against an unparseable
deployed tag is also UNORDERABLE. So the do-not-tidy warning is belt-and-braces rather than
load-bearing — but **only once the patched comparator is actually deployed**, which is unverified
here: the live `qnfo-fleet-control` reports 0.4.13 while the repo carries the corrected rule, and
the patch set is `workflow_dispatch`-only by design (`apply=apply`). Until that dispatch happens,
keep the build tag.

## Deferred siblings (stale-canon) — this is the note referenced by the bundle header

The bundle comment block ends with *"those three are deliberately NOT changed here; see the note
below."* That note did not exist in any artifact until now (verified 2026-09-13: this README was
413 B with no note, and `deployed-current.worker.js` had no text below the marker). This is the note.

The same defect and the same `scanerr:stale-canon` error kind apply to:

| worker | bundle VERSION | registry |
|---|---|---|
| `osf-integrity-check` | `osf-integrity-check/fabric-20260910` | 2.0.0 |
| `research-daily-brief` | `research-daily-brief/fabric-20260910` | 1.0.0 |
| `qnfo-twin-maintain` | `qnfo-twin-maintain/fabric-20260910` | 1.0.1 |

**The deferral is still open, and the self-heal's success signal is not evidence.** Verified
2026-09-13T14:4xZ:

- `self_heal_actions` logs `kind=stale-canon, status=healed, action="canonical resync
  <worker>/fabric-20260910 verified"` **hourly for all four workers** — ids 1225/1226, 1258/1259,
  1264/1265, 1297/1298, 1303/1304, 1336/1337, 1342/1343, 1375/1376, 1382/1383, 1413/1414 across
  2026-09-13 10:01Z → 14:05Z.
- The heal's `verified_at` is `qnfo-workers/main/<worker>/deployed-current.worker.js`. That string
  is **not a resolvable path**: `main/` is a pre-migration prefix the repo was flattened away from on
  2026-07-13, and `qnfo-fleet-control/PATCH-2026-09-13-canonical-extraction-and-noself.mjs` §4 records
  it as *"Verified absent from QNFO/qnfo-workers"*. So `verified_at` is a formatted label from a
  dangling template — the copy source, not the R2 destination it claims to have written.
- The canonical store is **R2**: `qnfo-fleet-control/wrangler.toml` declares
  `binding = "CANONICAL" → bucket_name = "qnfo-canonical"`. That bucket is not bound to the qnfo-ops
  endpoint, so neither the read-back nor the fix is available here.
- `fleet_drift_report` still reads `canonical_version = ""` for all four (newest row per worker
  2026-09-12 11:02). `fleet_deploy_state.scanerr:<worker>` still reads `stale-canon` for the three
  siblings, last written 2026-09-12 11:01–11:02Z. obsidian-writer's key was cleared
  2026-09-13 14:43:11Z.

**Do not clear the `scanerr` keys to make the count read zero** — the condition they record is live,
and clearing a flag is not a fix.

## Reachability

`obsidian-writer` publishes no `/health` route: `https://obsidian-writer.q08.workers.dev/health`
returns HTTP 404 and the plain workers.dev host returns HTTP 530 (no route published there).
It is request-driven (`FETCH-ONLY` in `fleet_worker_census`, `req24` null), so absence of a probe
is not absence of function — but it is the reason this worker is doubly unverifiable: no live
probe, and (until the canonical write lands) no drift check either.
