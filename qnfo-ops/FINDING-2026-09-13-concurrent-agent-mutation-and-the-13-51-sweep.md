# FINDING — concurrent agent mutation, the 13:51 job sweep, and three self-corrections

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Evidence window: 2026-09-13T13:45Z → 13:57Z. All figures live `ops_d1_query` / `email_stats` /
`cloud_ops_events` returns from this session.

---

## 1. A bulk reconciliation swept 35 job rows in 15.9 seconds

`ops_jobs`, `updated_at` within 13:51:19.770Z – 13:51:35.662Z:

| measure | value |
|---|---|
| rows touched | **35** |
| window | **15.892 s** |
| oldest `created_at` in the swept set | 2026-09-13T06:29:04.814Z |
| newest `created_at` in the swept set | 2026-09-13T13:49:27.825Z |

Distribution before → after:

| status | 13:49Z | 13:57Z | delta |
|---|---:|---:|---:|
| succeeded | 48 | **89** | **+41** |
| continuing | 42 | **11** | **−31** |
| running | 5 | 4 | −1 |
| failed | 8 | 8 | 0 |

Ordering was reverse-chronological by `created_at`: the oldest row (06:29) received the latest
`updated_at` (13:51:35.662Z), the newest (13:49) the earliest (13:51:27.607Z), at ~0.3 s spacing.
That is a batch iteration, not 35 independent events.

## 2. It is NOT the recommended D17 fix

`ops_jobs` schema re-read at 13:5xZ, unchanged:

```sql
CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued', model TEXT,
strategy TEXT, payload TEXT, response TEXT, tool_log TEXT, error TEXT, created_at TEXT,
updated_at TEXT)
```

No `terminal_at` column. `patches/2026-09-13-D18-duplicate-job-execution.md` §4 recommends
"write `response`, the terminal status, and a new `terminal_at` column **in one statement**" plus a
reaper. **The sweep is not that.** The terminal write path is unchanged; something else bulk-assigned
`succeeded`.

**Mechanism unidentified.** No tool in the qnfo-ops toolset writes `ops_jobs`, and `ops_d1_query` is
SELECT-only. Candidates, not distinguished: (a) a worker-side reconciliation on the ops endpoint's own
cron; (b) another session holding direct D1 credentials. `fleet_crons` could not be queried —
`SELECT ... FROM fleet_crons` returns `D1_ERROR: no such column: schedule`, so that table's schema
differs from the documented shape and the cron hypothesis is untested.

## 3. Another session was remediating in the same 60 seconds

`cloud_ops_events`, 13:50:06 – 13:50:33Z, verbatim kinds:

| ts | kind | action |
|---|---|---|
| 13:50:06.302Z | ops_ai_tool | `github_file_write` — JOBS.md (this session) |
| 13:50:06.967Z | ops_ai_tool | `workspace_write` — `ADDENDUM-how-to-verify-job-success-corrections.md` |
| 13:50:07.026Z | ops_ai_tool | `workspace_write` — "REMEDIATION EXECUTED — fleet alert channel un-muted" |
| 13:50:08.603Z | ops_ai_tool | `workspace_write` — "AMENDMENT 6 — the drain's recheck path is invisible in D1" |
| 13:50:31 – 13:50:33Z | ops_ai_tool | **17 × `email_mark` → status `processed`** (ids 164, 276, 693, 24, 452, 437, 687, 668, 657, 279, 219, 220, 225, 300, 504, 700, 690) |

The `email_mark` burst precedes the job sweep by ~46 s. Whether the same session caused the sweep is
**not determined** — but the fleet's production state is being mutated by at least two agents
concurrently, with no coordination and no lock.

## 4. The alert remediation is real — verified independently

The other session's claim ("151 of 176 alerts-classified messages were status spam = 85.8%") checks
out, and its effect is complete:

```
SELECT classification, status, COUNT(*) n FROM emails GROUP BY classification, status
  alerts     processed   151
  alerts     archived     25
  alerts     spam          0     <-- was 151
  personal   spam         33
  general    spam         12
```

| measure | earlier this session | now |
|---|---:|---:|
| `alerts` rows in spam | **151** of 176 | **0** of 176 |
| total spam | 258 | **45** |
| `email_stats.byStatus.spam` | 258 | **45** |

`email_stats` agrees: total 682, spam 45, processed 226, archived 110, sent 289, replied 12.

**Credit where due:** this is a genuine production fix to the defect reported earlier this session
("alerts go one way into the void"). The other session also labelled it correctly — *"151 rows
remediated and verified. Recurrence cause NOT fixed."* That is accurate: the data is repaired, the
`alerts@` sending path is not.

## 5. Three self-corrections

1. **I claimed the alert × status cross-tab was not computable from these tools.** It is — a plain
   `GROUP BY classification, status` via `ops_d1_query` produces it. My earlier statement
   ("email_stats gives classification counts but no alert×status cross-tab, so the exact fraction of
   the 176 alerts stored as spam is not computable") was wrong, and the query is trivial.
2. **My published trend claim is falsified.** `status/JOBS.md` and `status/jobs.json` state:
   *"The count grew 26 → 32 → 39 → 42 during 2026-09-13, while succeeded grew only 47 → 48: D17
   accumulates faster than jobs terminate."* That was derived from a **4-minute window**. Within
   ~2 minutes of publication the trend reversed: `continuing` fell 42 → 11. A 4-minute delta was
   insufficient to support a monotonic trend claim.
3. **My published snapshot was wrong within 2 minutes.** The `jobs.json` I committed at 13:50:06Z
   asserted `succeeded 48 / continuing 42`. The sweep at 13:51:19Z moved those to `89 / 11`. The file
   carries its own warning ("stale within minutes") — this is that warning demonstrated on its own
   author.

## 6. The hazard this creates

**`succeeded` no longer distinguishes "the work completed" from "a sweep decided it was done."**
35 rows created as far back as 06:29 were marked terminal by a timer ~7.4 h after creation. They did
carry responses (91–11,805 chars), so the reconciliation is defensible — but a poller reading
`succeeded` cannot tell the difference, and the schema has no `terminal_at` to expose it.

**Agent-caused state change is indistinguishable from fleet behaviour** except through
`cloud_ops_events`. No drift, reconciliation or health logic consulted in this session reads that
table. So when `fleet_drift_report` or an `agent_issues` probe observes a state change, it cannot tell
whether a worker did it or an agent did it — which is exactly the ambiguity that produced the
"no probe target" drain failures documented earlier.

**Recommended:** (a) record the actor in `cloud_ops_events` for every mutation and have the
reconciliation paths read it; (b) ship `terminal_at` so sweep-assigned terminals are distinguishable
from real ones; (c) serialise writes to `status/JOBS.md` and `status/jobs.json`, which two sessions
were racing within the same minute.

## 7. Limits

- **The 35-row sweep's mechanism is unidentified.** I have the window, the ordering and the delta; I
  do not have the writer. Candidate (a) vs (b) in §2 is unresolved.
- **I did not observe the sweep happen.** It is inferred from `updated_at` clustering plus the
  distribution delta. A single row could in principle have been touched twice.
- **Whether the swept rows *should* be `succeeded` is unverified.** I did not read their `response`
  bodies to check for `INCOMPLETE:` trailers. Some may be terminal-but-unfinished.
- **Causation between the `email_mark` burst and the sweep is not established** — only temporal
  adjacency (~46 s).
- **The other session's "151 rows remediated" figure matches my independent count**, which is
  corroboration, not proof that every marked row was correctly classified. Marking an alert
  `processed` is a status change, not a delivery fix; if those messages were genuinely undeliverable,
  the repair hides that.
- `fleet_crons` schema mismatch (`no such column: schedule`) means the cron hypothesis is untested,
  not refuted.
