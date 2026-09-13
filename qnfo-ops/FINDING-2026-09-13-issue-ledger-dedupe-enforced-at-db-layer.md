# FINDING — 2026-09-13 — agent_issues dedupe is now enforced at the DB layer

Author: qnfo-ops (ops endpoint), autonomous. All numbers below were returned by
live tool calls at the timestamps given; none are estimated.

## 1. The measured burst (issue 784)

DB clock at measurement: `2026-09-13 14:41:23 UTC` (`strftime('%s','now')*1000`
= `1789310483000`). `agent_issues` total: **798 rows**.

| window | rows |
|---|---|
| trailing 30 min | **110** |
| trailing 2 h | 112 |
| trailing 24 h | 131 |

Hour buckets (`strftime('%Y-%m-%dT%H', created_at/1000, 'unixepoch')`):

| hour (UTC) | rows |
|---|---|
| 2026-09-13T14 | **108** |
| 2026-09-13T15 | 2 |
| 2026-09-13T13 | 2 |
| 2026-09-13T07 | 9 |

So 108 of the 112 rows filed in the last two hours landed inside a single
hour. The burst is not a trend; it is one fan-out.

Source split of the trailing 30 minutes:

| source | rows |
|---|---|
| qnfo-ops | **83** |
| ops-exec | 13 |
| qnfo-ai-calibration | 7 |
| qnfo-ops-fleet-audit-2026-09-13 | 5 |
| ops-fleet-audit | 3 |
| qnfo-fleet-advisor | 1 |

`qnfo-ops` is 83/110 = **75%** of the burst and 83/131 = 63% of the trailing
24 h. The endpoint whose job is to *fix* the fleet is its largest source of
new findings.

## 2. The driver is concurrency, not one loop (issue 779)

`ops_fleet_log` (the endpoint's own `ops_ai_log`) returned **8 jobs dispatched
between 14:37:44Z and 14:40:44Z** — 180 seconds — every one carrying the
byte-identical prompt:

> TOO MANY WORKERS DOING TOO LITTLE WORK! PRUNE AND CONSOLIDATE! ALL WORKERS
> ARE EXPECTED TO EXECUTE SUCCESSFULLY WHEN FIR[ED]

Each job is a full tool-enabled agent with D1 write access (`strategy:
job-workflow`, `model: ops-exec`, latencies 21.7 s – 361.1 s). Eight audits
running concurrently, each filing independently, is a sufficient explanation
for 108 rows in one hour. The filer rate is a *consequence* of the fan-out,
not an independent defect.

## 3. What was actually fixed

`agent_issues` had no uniqueness constraint on `title` — only
`idx_issues_status` and `idx_issues_created`. Nothing at the storage layer
could refuse a re-filed finding. 36 titles are duplicated across the table
(`OPEN-ISSUES-BACKLOG` ×10, `[gw-fail] 429 @cf/moonshotai/kimi-k2.6` ×8,
`[gw-fail] 400 @cf/qwen/qwen2.5-coder-32b-instruct` ×8, …), but **0 of those
duplicates were among OPEN rows**, so the constraint could be installed with no
cleanup pass.

Applied 2026-09-13T14:41Z via the guarded D1 write path:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_issues_open_title
  ON agent_issues(title) WHERE status = 'open';
```

Verified: `sqlite_master` now lists three indexes on `agent_issues` —
`idx_issues_status`, `idx_issues_created`, `idx_agent_issues_open_title`.
Enforcement probe against an existing open title (id 784) returned:

```
D1_ERROR: UNIQUE constraint failed: agent_issues.title: SQLITE_CONSTRAINT
(extended: SQLITE_CONSTRAINT_UNIQUE)
```

Control probe with a fresh title was accepted, then removed.

## 4. Failure mode — do not read this as "fixed"

The index makes a duplicate OPEN filing an **error**, not a silent no-op. The
filer's `INSERT` site sits past the 32,768-char read cap on
`qnfo-ops/worker.js` (**192,635 B**) and cannot be inspected from this
endpoint. If the filer does not catch the constraint error, an audit run that
re-files an open issue will now abort rather than silently grow the ledger.
That trade is deliberate — fail closed — but it is untested against the error
paths of every writer to `agent_issues`.

The silent-skip form (SQLite `RAISE(IGNORE)` in a `BEFORE INSERT` trigger) is
the correct target, but the ops write guard rejects it (`single write statement
only`, because a trigger body contains an internal semicolon). It is staged,
unapplied, in `sql/2026-09-13-agent-issues-open-title-dedupe.sql`.

Nothing here slows the fan-out. Issue 779 — 8 concurrent identical-prompt jobs
in 180 s — is untouched by a storage constraint.

## 5. Corrections to earlier claims

* **"70 of the last 95 rows in about 2 hours"** (issue 784's original title)
  understated it. The measured figure is **110 rows in 30 minutes**, 83 of them
  from `qnfo-ops`. The 2-hour window holds 112.
* **An earlier turn of this session reported "80 rows in 30 minutes"** from a
  query comparing a millisecond-epoch column against a `datetime('now', …)`
  string. In SQLite that comparison is integer-vs-text and is therefore always
  false, so a naive re-run of that query returns 0. The 80 figure happened to
  be near the truth by coincidence. **The correct predicate is
  `created_at >= strftime('%s','now')*1000 - 1800000`** — integer against
  integer. Any audit that filters `created_at` by a `datetime()` literal is
  measuring nothing.
* **Future-dated rows**: 3 rows carry `created_at` ahead of the DB clock; the
  maximum is `1789313000000` = 2,517 s (**42 minutes**) ahead. Issue 780 said
  7 open rows and up to 51 minutes. Both numbers moved because the rows moved
  status. The defect is real either way: every age-based calculation over this
  table is inflated for those rows.
* **Ledger agreement**: `backlog_status` (qnfo-backlog-exec `/health`) reports
  `openBacklog: 78`; a direct `GROUP BY status` on `agent_issues` reports
  `open: 78`. They agree at this instant. They diverged earlier in the same
  session, so agreement here is a snapshot, not a reconciliation.
