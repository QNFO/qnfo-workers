# REV5 — Integration monitor is dead; register identified; surfaces that are clean

Date: 2026-09-13. Closes three gaps in the main audit: it never identified *which*
register the "26 overdue" alert refers to, never audited the integration monitor,
and never separated surfaces that are genuinely healthy from ones I did not check.

---

## 1. The integration monitor stopped 2 days ago

```sql
SELECT MAX(ts) latest, MIN(ts) earliest, COUNT(*) n FROM integration_state;
```

| latest | earliest | n |
|---|---|---|
| **2026-09-11T14:17:37.615Z** | 2026-09-10T11:42:38.151Z | 32 |

`integration_state` holds the full integration-chain report — 11 chains
(`fleet-pulse`, `errata`, `ideas`, `intents`, `version-drain`, `outreach`,
`issues`, `alerts`, `email`, `research`, `revisions`), each with producer →
consumer, medium, status, count and staleness, plus a coverage block, a signal
`decay` block, and an aggregate `score`.

It ran for 27 hours (09-10 11:42 → 09-11 14:17), then **stopped**. It has not
written in ~48 hours. **The subsystem that reports whether the fleet's
integration chains are healthy is itself down.**

For contrast, two neighbouring signals are fresh:

| table | rows | latest |
|---|---|---|
| `fleet_probe_log` | 21,067 | 2026-09-13T14:01:34.632Z |
| `self_heal_actions` | 1,410 | 2026-09-13T14:01:38.170Z |

So probes and self-heal are live; integration reporting is not.

**Consequence:** `fleet_issue_log` still emits
`Integration chain Telemetry (trace -> worker_logs)`,
`Integration chain Research execution (queue -> papers)`, and
`Integration chain Research intake (radar -> ideas -> triage)` — each
**×91–93 occurrences**, last seen 2026-09-13T14:01:35Z. If those rows are derived
from `integration_state`, they are firing on **2-day-old data**. I could not
confirm the derivation, so I state the staleness, not the consequence.

---

## 2. A live schema error inside the report itself

The report's own `decay` block, verbatim, on every one of the 32 rows:

```json
{"signal":"deployment_history","age_h":null,
 "error":"D1_ERROR: no such column: ts at offset 11: SQLITE_"}
```

`deployment_history` cannot be aged because the query selects a column that does
not exist. The same class as the `fleet_deploys` incompleteness noted in the main
audit §11: **the freshness of the deploy record is unmeasurable, and the monitor
records that failure as a null rather than an error.**

Also in the same block: `self_heal_actions` read `age_h` 121–125 on 09-10/09-11,
i.e. ~5 days stale at the time — it is now fresh (§1 table). So that signal
recovered on its own.

---

## 3. Coverage numbers from the last good report

From the final rows (2026-09-11):

```json
{"coverage":{"fleet_size":79,"probed":82,"invocated":5,
             "traced":58,"probe_gap":0,"trace_gap":21}}
```

- **`invocated: 5`** — only 5 of 79 workers show an invocation signal. Either
  invocation telemetry is almost entirely absent, or "invocated" means something
  narrower than it reads. **I cannot distinguish these from here**; flagging it as
  a coverage hole, not as 74 broken workers.
- **`trace_gap: 21`** — 21 workers emit no trace events; corroborated by the
  report's own opportunity line *"Logpush trace coverage: 58/79 workers emit
  trace events"*.
- `probe_gap: 0`, `probed: 82` — probing is the one healthy coverage axis.
- Aggregate: `{"total":93,"chains":100,"coverage":92,"freshness":77}`.

This is consistent with the main audit's §8 observation that tool-failure
telemetry clusters in agent-session hours: **invocation and trace coverage are
thin, so the fleet is measured mostly by probes.**

---

## 4. The register is `task_dod_register` — confirmed

The main audit §2 recorded `regOpen=99 regOverdue=26` without naming the table,
and the alert email reads *"QNFO register guard: 26 overdue / 0 no-executor"*.
Both resolve to **`task_dod_register`**:

```sql
SELECT status, COUNT(*) FROM task_dod_register GROUP BY status;
```

| status | c |
|---|---|
| done | 100 |
| **open** | **99** |
| cancelled | 19 |
| in-progress | 1 |

```sql
SELECT COUNT(*) FROM task_dod_register
 WHERE status='open' AND due IS NOT NULL AND due < '2026-09-13';
```
→ **26**

**99 open and 26 overdue, matching the alert exactly.** Note the alert's
`0 no-executor` qualifier: the 26 overdue rows **do** carry owners. The defect is
not unassigned work — it is **assigned work that nothing executes**. One row is
due today (id 5, owner `agent`, `due 2026-09-13`).

The other two registers are small and not the source: `gtd_register` has 7 rows
(3 not-done, 1 overdue at `line_date 2026-09-10`); `calibration_register` has 10
rows, all `PENDING` with check dates 2028–2035, i.e. none overdue.

---

## 5. Surfaces I checked that are genuinely clean

Recording these matters as much as the defects — a prior finding warned that
"no executor" and "no canonical" get conflated across two rosters.

| surface | state |
|---|---|
| `errata_queue` | **2 rows, both terminal** (`published`, `implemented`). No pending errata. |
| `dead_links` | **0 rows** |
| `calibration_register` | 10 rows, all future-dated; nothing overdue |
| `fleet_probe_log` | fresh (21,067 rows, 14:01:34Z) |
| `self_heal_actions` | fresh (1,410 rows, 14:01:38Z) |
| `integration_state` chains, last good read | all 11 reported `healthy`, `score.total` 93 |

The `errata` chain is worth noting: on 2026-09-10 it reported
*"oldest pending item 310.4h old (under count ceiling but stale)"* — a 13-day-old
pending item that sat **under** the count ceiling and so was not flagged as a
count breach. It resolved by 11:56 that day (`n:0`). The lesson generalises to
the 26 overdue register rows: **count-based ceilings do not catch age.**

---

## 6. Limits

- **I cannot confirm that the `Integration chain ...` issue rows derive from
  `integration_state`.** I state only that the table stopped 2 days ago while
  those issues keep firing.
- **`invocated: 5` is unexplained.** It may be a narrow metric rather than a
  coverage failure. I flag it; I do not conclude 74 workers are dead.
- **The last good `integration_state` read is from 2026-09-11**, so §3's coverage
  numbers describe the fleet 2 days ago, not now.
- **I did not determine why the monitor stopped** — no cron table was queried for
  it, and the worker that writes it is not identified.
- **`task_dod_register`'s 219 rows were not read individually.** The 99/26 figures
  are aggregate; the content of the 26 overdue rows is not audited here.
