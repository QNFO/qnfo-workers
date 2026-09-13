# Deploy subsystem — source-verified findings

qnfo-ops, 2026-09-13. Every claim below was **read out of the source**, not inferred
from drift rows. Where a claim is a reproduction, it is labelled as one.

## How the source was obtained

| field | value |
|---|---|
| repo | `QNFO/qnfo-workers` |
| path | `qnfo-fleet-deploy/deployed-current.worker.js` |
| ref | `db9d2fdb~1` — the commit **before** the tombstone |
| blob sha | `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d` |
| size | 24,761 B (read in full) |

**Correction to `qnfo-fleet-deploy/SUPERSEDED-2026-09-13.md`.** That document states the
archived source is "retrievable via `github_repo_read repo=QNFO/qnfo-workers
path=qnfo-fleet-deploy/worker.js ref=ed539ec3`". It is not. `ed539ec3` is a **blob** sha;
the contents API resolves a **commit**/branch ref, so that read returns
`path not found` — verified twice this session. The working ref is the tombstone commit's
parent. Both `db9d2fdb~1` and `4c815079~1` resolve to the same blob.

Consequence: the earlier bundle patch declared its anchors *unverified* and could only ever
fail closed. With the real source in hand the anchors are now verifiable, and
`PATCH-2026-09-13-deploy-subsystem-verified.mjs` carries them.

## D1 — `versionOf()` is not worker-scoped

```js
var i = code.indexOf("VERSION");   // first occurrence in the whole file
```

On a merged bundle the first `VERSION` belongs to whichever module esbuild emitted first.
Reproduced by execution:

```
versionOf('var advisorMod=…VERSION = "0.3.3"…var deployMod=…VERSION = "0.4.11"…') === "0.3.3"
```

Live match: `fleet_drift_report` id 1680 — `qnfo-fleet-control` deployed `0.3.4`,
canonical `0.3.3`, note `deployed-ahead`. The canonical is the merged bundle; the comparator
read the **advisor module's** version and concluded the control plane was ahead of itself.

This is the mechanism behind the 974 `canonical-ahead` rows across 32 workers — though see
the limit in §Limits.

## D2 — `newer()` misorders live strings, and the dangerous polarity is "upgrade"

Reproduced against the exact pairs sitting in `fleet_drift_report`:

| call | returns | classified | live row |
|---|---|---|---|
| `newer("v1.1.0","1.0.0")` | `false` | upgrade | personal-companion id 1672 |
| `newer("qnfo-qwav/fabric-20260910","2.1.0")` | `false` | upgrade | qnfo-qwav id 1685 |
| `newer("0.5.3-failclosed","0.5.3")` | `true` | downgrade | qnfo-social id 1688 |
| `newer("3.6.1-subscribers","3.6.1")` | `true` | downgrade | qnfo-gateway (fleet_status) |
| `newer("0.3.4","0.3.3")` | `true` | downgrade | qnfo-fleet-control id 1680 |

`num()` does `s.split("-")[0]`, so `"v1.1.0"` → `parseInt("v1")` → `NaN` → `0` → `[0,1,0]`,
which sorts **below** `"1.0.0"` → `[1,0,0]`.

**The polarity is the point.** `scan()` only calls `redeploy()` on the branch it classifies
as *behind*. So the rows that actually get deployed are the `false` ones — including
`qnfo-qwav`, where a fabric build (`qnfo-qwav/fabric-20260910`) is judged older than
canonical `2.1.0` and would be **overwritten**. The `true` rows (`deployed-ahead`) are the
ones `scan()` skips. The asymmetry is why 974 rows produce no action and the few `false`
rows produce all the damage.

## D3 — `direction` is computed and discarded

```js
var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
var toSha = await sha256(c.code);
// … `direction` is returned in the response object and never read again
```

No branch gates on it. `scan()` avoids downgrades only *incidentally* — its ahead-branch
`continue`s before reaching `redeploy()` — and that guard lives in the caller, so
`POST /redeploy` bypasses it entirely. Exposure: 518 `deployed-ahead` rows across 18
workers, each one authenticated `POST /redeploy` away from a revert.

## D4 — `r2Read()` lacks the tombstone rejection the GitHub path has

Within the same file:

- `canonical()` GitHub loop: `if (c && c.length > 0 && c.slice(0, 4) !== "404:")`
- `r2Read()`: no such check

So a tombstoned R2 object is returned as a deployable canonical. Live evidence:
`fleet_deploys` ids 55, 57, 59, 61, 63, 66 — `qnfo-cloud-ops`, **25 attempts / 0 ok**,
`HTTP 400 … Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2`,
`source_path r2:qnfo-canonical/qnfo-cloud-ops.js`. Also note the fallback
`if (r2) return r2;` at the end of `canonical()` — a **stale** R2 object is returned even
when every GitHub candidate 404s, so the tombstone survives the staleness window too.

## D5 — `NO_SELF` does not name the worker that runs

```js
var NO_SELF = ["qnfo-fleet-deploy"];
```

The live script is `qnfo-fleet-control` (merge wave A, 2026-09-11). `/health` on the live
route still self-reports `worker: "qnfo-fleet-deploy"`, which is why this was easy to miss.
Self-redeploy is therefore **not** refused for the worker that actually executes. This also
means the merged bundle is inside its own heal set — and its canonical (per D1) reads as
`0.3.3` against a deployed `0.3.4`.

## D6 — multipart metadata omits `script_name`

```js
fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })]…));
```

A worker that owns a Workflow binding rejects a `/content` PUT whose metadata omits
`script_name`, with CF **10021** "Workflow GenerationFlow must be exported or a script_name
must be specified". Live: `personal-companion`, once per hour, **30 attempts / 4 ok**
(ids 56, 58, 60, 62, 65, 68, 70–74). This is a *second*, independent cause of the hourly
failure — D2 explains why the attempt is made, D6 explains why it fails.

## Self-correction — the `evidence`/`detail` mismatch is NOT a row-duplication bug

I initially concluded that `registerWatch()`'s dedupe re-files every scan, because:

- `improvement()` inserts `(source,target,kind,title,detail,priority,status)` — **`evidence`
  is never written**, so it holds its schema default `''`
- the dedupe reads `SELECT COUNT(*) … WHERE evidence LIKE '%register:<id>%'` — always `0`
- the marker `[register:76]` is written into **`detail`** (confirmed on live row id 652)

**That conclusion is wrong.** `fleet_improvements` carries a partial unique index:

```sql
CREATE UNIQUE INDEX ux_fi_open ON fleet_improvements(target, kind, title)
  WHERE status IN ('proposed','approved','in_progress')
```

`improvement()` uses `INSERT OR IGNORE`, so the unique index silently absorbs the duplicate
insert regardless of the broken SELECT. That is why there are **25** register rows rather
than one per scan per overdue row. The real, narrower consequence is that
`out.escalated++` is incremented even when the insert was ignored, so `regEscalated` in the
scan note is an unreliable count. Still a defect; a much smaller one than I first stated.

## Limits

- **D1 is proven for `qnfo-fleet-control` specifically.** I read one bundle. The claim that
  D1 *explains* all 974 `canonical-ahead` rows is not established — those rows include
  fabric-tagged deployments where D2 is the operative defect, and I did not read the
  canonical object for each of the 32 workers.
- **D2 and D3 are reproductions plus source reading**, not observations. I proved the
  comparator's return values on the live strings and read the absent guard. I did not watch
  a `PUT /workers/scripts/.../content` fire and revert a worker.
- **The R2 canonical contents are still uninspected.** `qnfo-canonical` is not bound to the
  ops tool set, so D4's "the R2 object is a tombstone" is inferred from the SyntaxError text
  and the tombstone-instrument precedent, not read directly.
- **`scanned=` is unstable** (52/55/75/77/78/79/80 across scan notes). The scan set is the CF
  API's `per_page=100` list, and it is not explained why the same account yields different
  counts hour to hour. That instability is unexamined and may be a seventh defect.

## What is still required to make any of this live

1. **Config (primary):** `UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')
   WHERE key IN ('auto_heal','enabled');` — live values are `1`/`1` (set 2026-09-08
   16:25:49), while the README documents both as fail-closed `0` and warns against enabling
   `auto_heal` before canonicals are synced ahead. With 1,492 drift rows across 50 workers,
   that precondition is not met.
2. **Deploy:** run the patch, then `wrangler deploy` from `qnfo-fleet-control/`. This
   endpoint has no deploy route and cannot perform it; after D5 the worker will refuse to
   redeploy itself, by design.
3. **Canonicals:** the 18 `deployed-ahead` workers need their canonical artifacts brought
   forward, or the D3 guard will (correctly) start refusing their deploys.
