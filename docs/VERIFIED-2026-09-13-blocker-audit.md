# QUniverse blocker list — claim-by-claim verification

Author: qnfo-ops (ops-exec). Date: 2026-09-13. Window: live, 13:44–13:50Z.
Every figure below is a live query result from qnfo-audit D1. Nothing is carried over
from a prior session without re-measurement.

## Verdict table

| # | Claim | Verdict | Measured |
|---|---|---|---|
| 1 | 53 of 74 deploys failed | **CONFIRMED** | fleet_deploys: ok=0 → 53, ok=1 → 21. Total 74. 71.6% |
| 2 | Concentrated in two live loops | **CONFIRMED** | personal-companion 26 fail; qnfo-cloud-ops 25 fail = 51/53 |
| 3 | "Poisoned R2 cache" (both) | **HALF WRONG** | Two *different* causes. See §1 |
| 4 | Publishing fails silently, 40 ok:false | **PARTLY WRONG** | 40 v2-drain events, all status=ok, but only **30** carry ok:false |
| 5 | Decision plane: 170 detected / 445 deferred / 10 executed | **CONFIRMED VERBATIM** | self_heal_actions. See §2 |
| 6 | Memory plane empty, 90.6% canary | **BOTH WRONG** | Not empty (stale); canary is 100%/7d. See §3 |
| 7 | Register has 26 overdue rows, no executor | **WRONG** | 10 rows, all PENDING, all future-dated. 0 overdue. See §4 |
| 8 | repo ≠ production on four workers | **UNVERIFIED** | Not measured this pass |

## §1 The two deploy loops have different root causes

The `fleet_deploys.note` column carries the real Cloudflare error. Both are HTTP 400
code 10021, but they are **not** the same failure:

**personal-companion** — 25 consecutive failures, hourly, 2026-09-12T12:01:14Z → 2026-09-13T13:01:23Z:
```
HTTP 400 {"success":false,"errors":[{"code":10021,
  "message":"Workflow GenerationFlow must be exported or a script_name must be specified"}]}
```
This is a **Workers Workflow binding/export defect**. It has nothing to do with R2.
Immediately prior, the same worker was successfully *downgraded*:
```
redeployed v1.1.0 -> 1.0.0   (2x, 09-12 10:30Z, 11:01Z)
redeployed v1.0.0 -> 1.0.0   (2x, 09-12 08:01Z, 09:08Z)
```
The Workflow error begins one hour after the last successful downgrade. The v1.0.0
artifact is missing the `GenerationFlow` export (or its `workflows` binding).

**qnfo-cloud-ops** — 25 failures, hourly, last 2026-09-13T07:02:38Z:
```
HTTP 400 {"success":false,"errors":[{"code":10021,
  "message":"Uncaught SyntaxError: Invalid or unexpected token\n  at worker.js:1:2"}]}
```
This one **is** a bad source artifact. Verified divergence:
- GitHub `qnfo-cloud-ops/worker.js` — 129,457 B, sha `59dd468d`, valid JS.
  Line 1 is `import { connect } from "cloudflare:sockets";`
- The deploy fails at **1:2** on a file whose repo copy is valid at 1:2.

⇒ The deployed source is not the repo source. `fleet_deploys.source_path` for both
workers is `r2:qnfo-canonical/<worker>.js` for **all** rows, ok and fail alike.
A syntax error at 1:2 in otherwise-valid JS is the classic signature of a leading
BOM (`EF BB BF`) or a stray token prepended to the object body.

## §2 Decision plane — confirmed, but the diagnosis "unwired" is wrong

`self_heal_actions` status distribution:

| status | n | last_ts |
|---|---|---|
| healed | 528 | 2026-09-13 13:03:44 |
| **deferred** | **445** | 2026-09-13 13:03:23 |
| **detected** | **170** | 2026-09-13 13:03:32 |
| resolved | 130 | 2026-09-13 13:03:31 |
| failed | 50 | 2026-09-13 13:01:23 |
| dispatched | 35 | 2026-09-13T04:01:30Z |
| **executed** | **10** | 2026-09-12T12:46:41Z |
| no-action | 4 | 2026-09-12T12:46:45Z |

The 170/445/10 triple is exact. But the plane is **not unwired** — it healed 528.

The real shape: **deferred is 100% two classes**, both still active:
- `health-ver` — 221 deferred, last 2026-09-13 13:03:23
- `drift` — 221 deferred, last 2026-09-13 13:03:23
- `errata-rearm` — 3 deferred, last 2026-09-05

And **execution happened exactly once**: all 10 `executed` rows fall inside a single
75-minute window (2026-09-12T11:31:22Z → 12:46:41Z). Nothing has executed in the
~26 hours since. So the correct statement is: *health-ver and drift are deferred
indefinitely, and the executor has fired once and then stopped.*

## §3 Memory plane — populated but stale; the canary figure has no source

**Not empty.** Live counts:
- `handoffs` (D1): **805 rows**
- `chat` (D1): 561 rows; `session_records`: 10 rows
- Vectorize `notes` — returns matches, e.g. `note:b4aea310d87668a0` (0.747)
- Vectorize `tasks` — returns matches, e.g. `T001` "D1 Database: qnfo-audit schema"
- Vectorize `handoffs` — returns matches, incl. `test-ndjson-1` (a test artifact)

**But stale:**
- `notes` index: every match carries `indexed_at: 2026-08-07` → **37 days old**
- `tasks` index: newest match `updated: 2026-07-02` → 73 days old
- `handoffs` index: newest substantive entries are 2026-06-29 / 2026-07-02, plus a test row

Correct statement: *the memory plane is populated but not re-indexed since early August.*

**Canary — the 90.6% figure is unsourced and contradicted:**
- `chat_canary` last 7 days: **197 total, 197 ok, 0 fail (100%)**
- Lifetime: 283 ok / 8 fail = **97.25%**
- All 8 failures are on a single day, 2026-09-02 (19:05–19:07Z)
- Search for the literal string `90.6` across `cloud_ops_events`: **0 rows**

I cannot reproduce 90.6% from any table I can reach. Treat it as retracted.

## §4 Register — zero overdue rows

`calibration_register`: **10 rows total**, all `status='PENDING'`, `check_date`
ranging **2027-12-31 → 2035-12-31**. Every check date is in the future.
Overdue count: **0**.

The "26 overdue" figure is most likely contamination from personal-companion's
26 deploy failures. The register does have no visible executor, but it has nothing
overdue for one to act on.

## §5 Corrected v2-drain numbers (publish path)

`cloud_ops_events WHERE kind='v2-drain'`: 40 events, **all** `status='ok'`.
Payload lives in the **`text`** column, not `meta` (searching `meta` returns 0 — this
is why a naive check appears to clear it).

Error classes, full breakdown:

| payload | n | window |
|---|---|---|
| `{"ok":false,"stage":"v2","error":"NL is not defined"}` | **19** | 2026-09-11T12:41 → 2026-09-13T05:21 |
| `newversion failed: 400 A vali...` | 7 | 2026-09-03T17:11 → 2026-09-04T02:01 |
| `newversion failed: 504` | 2 | 2026-09-13T07:45 → 09:55 |
| `D1_ERROR: Wrong number of parameter bindings` | 1 | 2026-09-03T14:11 |
| `quality gate: lit_review=0 AND refs=2<5` | 1 | 2026-09-11T09:10 |
| **`{"ok":true,...doi...}` (genuine success)** | **10** | 2026-09-03 → 09-06 |

So: **30 of 40 are silent failures**, not 40/40. The dominant live bug is
`NL is not defined` — a ReferenceError in the v2 publish path, firing every ~2h10m.
The quality-gate row is the gate working as designed, not a defect.

## §6 Fleet drift observed this session

- Fleet total is now **55 deployed** (was reported as 71 earlier this session)
- Healthy: **12 of 55**
- `qnfo-ai` now reports **5.25.1** (was 5.21.2; a prior note flagged drift to 5.21.3)
- `ops_issues_list` **now works** — returns 12 open rows. The tool defect is fixed.
- 12 open issues, of which 7 are `[gw-fail]` high-priority (ids 678–684)

## Actionable fix list (each now has an exact target)

1. **personal-companion** — restore the `GenerationFlow` Workflow export in v1.0.0, or
   set `script_name` in its `workflows` binding. Not an R2 problem. Stops an hourly 400.
2. **qnfo-cloud-ops** — replace the corrupt `qnfo-canonical/qnfo-cloud-ops.js` R2 object;
   inspect its first 3 bytes for a BOM. Repo source is valid. Stops an hourly 400.
3. **qnfo-research-exec v2** — define or import `NL` in the v2 publish path. 19 failures.
4. **self_heal_actions** — unblock `health-ver` and `drift` (221 each). Find why they
   defer; the executor last fired 2026-09-12T12:46Z.
5. **Memory re-index** — notes index 37 days stale, tasks 73 days stale.

## Limits of this verification

- `fleet_deploys.ts` is TEXT and type-inconsistent across rows (some ISO with `T`/`Z`,
  some `YYYY-MM-DD HH:MM:SS`). String-range filters are therefore approximate.
- `updated_at` in `agent_issues` is likewise type-mixed (integer epoch vs text).
- I could not read the R2 `qnfo-canonical` objects directly — the bucket is not bound
  to this endpoint. The BOM hypothesis is inference from the 1:2 column offset, not
  a byte inspection.
- Claim 8 (repo ≠ production on four workers) was not measured this pass.
- `decisions` has **no status column**, so the 170/445/10 figures could not have come
  from it; they come from `self_heal_actions`. A prior note attributing them to a
  "decision plane" table is loosely worded.
