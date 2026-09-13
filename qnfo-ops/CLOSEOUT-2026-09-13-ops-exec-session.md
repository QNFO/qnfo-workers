# CLOSEOUT — 2026-09-13 ops-exec session: state, corrections, and what is verified

Date: 2026-09-13T14:18Z · Author: qnfo-ops / ops-exec
Server time at write: **2026-09-13 14:15:47Z** (from `datetime('now')`)

## 1. Fleet state change made during this session

`fleet_deploy_state.auto_heal` = **`"0"`**, `updated_at` **2026-09-13 14:15:02** — set **45 seconds**
before the timestamp above, and the most recently written key in that table.

The documented deploy mechanism (`docs/REDTEAM-EXEC-2026-09-13-remediation-executed.md`) requires
`auto_heal = "1"` for the hourly scan to PUT any canonical ahead of the deployed VERSION. At `0`,
**the autonomous deploy path is off**. Consistent with `fleet_deploys` showing no activity after
14:04:01.

**Actor unknown.** It coincides with a concurrent agent session (see §4). The fleet records no actor
for this key. This should be confirmed before any deploy work is planned.

## 2. Correction: `regOverdue=26` is CORRECT — my counter-query was wrong

I first measured `status='open' AND due < datetime('now')` = **43** and read this as the scanner
understating (26 vs 43). **That was my error, twice:**

1. My query's first column was `COUNT(*)` **with no `FROM`/`WHERE` clause**, so SQLite evaluated it
   against the implicit single row and returned `1` — a meaningless number I briefly treated as
   data.
2. `due < datetime('now')` counts items due **today** as overdue, because as strings
   `'2026-09-13' < '2026-09-13 14:15:47'` is true.

The scanner uses the strict date boundary. Reconciled from the due histogram:

| due | open rows |
|---|---:|
| 2026-09-11 | 7 |
| 2026-09-12 | 19 |
| **sum** | **26** |

**26 matches `regOverdue=26` exactly.** The scanner is right; my 43 included 17 items due *today*
(2026-09-13), which are not yet overdue.

Register state, verified: **99 open · 78 done · 19 cancelled · 1 in-progress = 219 rows.**
Open rows: 26 strictly overdue, 17 due today, 56 due later. All overdue rows have
`owner='agent'`. Some carry SLA notes (`SLA-accelerated 2026-09-06 (FLEET-SLA 14d cap)`).

## 3. What IS verified this session (versus claimed)

**Verified by direct measurement:**

- Tool execution is healthy: **7,131 calls/24 h at 91.17% success**; every sampled `ok=0` chat row
  has **all** tool calls `ok:true`; `telemetry_analyze` reports **`persistent: []`** (zero persistent
  failures). Three independent sources.
- The read cap is **32,768 chars and `maxChars` cannot lift it** — a `maxChars: 100000` request on a
  33,551-byte file returned 32,768 with the tool's own truncation marker. No offset parameter.
- `wrangler.toml` has **no `[vars]` section**, so `OPS_TOOL_RESULT_CAP (32768)` is not config-driven.
  **The cap protects the file that defines the cap** — raising it requires editing `qnfo-ops/worker.js`
  (182,623 B), which the cap prevents reading.
- The gw-fail sweep is capped at **150 rows/sweep** (`per_page=50 x limit=3`); all 8 buckets show
  `min_c == max_c` across 46-47 sweeps and **sum to exactly 150**. `SUM(count)` is meaningless.
- The heal path **works**: `healed=2/1/1` at 07:05/08:02/09:02, matching three successful
  `fleet_deploys` PUTs. (Corrects my earlier "healed=0 in all 16 scans".)
- The 496 stalled proposals were **relabeled, not triaged**: `auto-hold (re-entry open-question;
  research halted)` = 496 rows, all `triaged_at` NULL, created in the 09-12T09:50 burst;
  `HOLD` = 47 rows, none NULL. 543 - 47 = 496.
- Three heal-failure causes, verbatim: `No such module "fleet.js"` (qnfo-observability),
  `Workflow GenerationFlow must be exported` (personal-companion, hourly), `Uncaught SyntaxError`
  (qnfo-cloud-ops).
- `qnfo-fleet-control` canonical `0.3.3` vs deployed `0.3.4`, where `0.3.3` is the **fleet-advisor's**
  version — the merged-bundle version-extraction defect, observed live.

**Committed (all reversible, blob SHAs recorded):**

| commit | artifact |
|---|---|
| `d4a742e5` | **FIX** — `obsidian-writer/deployed-current.worker.js` + VERSION marker |
| `fa6c0881` | finding — intake cleared by relabel, not triage |
| `9bba5982` | finding — stranded fixes + heal-failure causes |
| `1e18b493` | finding — cap not configurable, tools proven healthy |
| `23eaf711` | finding — gw-fail sweep saturation at 150 |
| `e0287484` | finding — why-not-executing + deploy gap |
| `2e7321c8` | SQL — `ops_jobs` terminal/chain/idempotency migration |

**NOT verified — do not treat as done:**

- **The `obsidian-writer` fix's effect is unmeasured.** Safety is proven by two independent routes
  (build tag -> `num()` `[0]` -> equality; and `auto_heal=0` disabling all PUTs). Benefit is not:
  if the scanner classifies any build-tag version as `version-format`, this **relabels**
  `stale-canon` -> `version-format` and gains nothing.
  **Verification surface:** `fleet_deploy_state.scanerr:obsidian-writer` (still `stale-canon`,
  `updated_at` 2026-09-12 11:01:04 — not rewritten by the 13:03 or 14:05 scans) and the
  `staleCanon` counter in the next `worker='SCAN'` row.
  Last scan **14:05:46** (`staleCanon=4, clean=33, healed=1`); next **~15:05** — ~50 min after this
  write, beyond this session's reach.

## 4. Concurrency hazard (active)

A second agent session is writing the same repo **now**: my first commit attempt returned
`GitHub 409: is at 298d2d32... but expected 0185920c...`, the documented D19 race. It also appears
to have set `auto_heal=0`. Two sessions' findings interleave in `qnfo-ops/` with **no ordering
guarantee**, and the fleet records no actor for `fleet_deploy_state` writes.

## 5. Limits

- Everything here is one D1 snapshot under concurrent writers; each count is stale on arrival.
- The `version-format`-excludes-healing rule is **inferred** from `ahead=9, healed=1` plus the
  clean-semver correlation. `qnfo-fleet-control`'s source (75,875 B) is over the read cap.
- `auto_heal=0`'s actor is unknown; I did not set it and cannot attribute it.
- I have no independent source for the scanner's `deployed_version` readings.
- This session produced 7 commits and 1 fix, and **zero deployed changes** — every remaining
  remediation needs a verb this endpoint does not hold: D1 write, R2 write to `qnfo-canonical/*`,
  `wrangler deploy`, or a read range past 32,768 chars.
