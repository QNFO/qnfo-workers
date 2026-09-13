# ADDENDUM to FINDING-2026-09-13-concurrent-agent-mutation-and-the-13-51-sweep

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Narrows §2 of the parent finding ("mechanism unidentified"). All figures live `ops_d1_query`.

---

## 1. The sweep did NOT go through the ops endpoint — positive evidence

`cloud_ops_events`, `ts` between 13:51:10Z and 13:51:45Z — **14 entries, all `kind='ops_ai_tool'`,
all `job='qnfo-ops'`**, spanning 13:51:21.145Z → 13:51:30.980Z:

| ts | tool | status |
|---|---|---|
| 13:51:21.145Z | `ops_d1_query` | ok |
| 13:51:21.313Z | `web_fetch` | ok |
| 13:51:21.424Z | `github_repo_read` | ok |
| 13:51:23.595Z | `ops_d1_query` | error |
| 13:51:23.596Z | `web_fetch` | error |
| 13:51:23.886Z | `github_repo_read` | ok |
| 13:51:25.752Z | `ops_d1_query` | ok |
| 13:51:25.806Z | `r2_list` | ok |
| 13:51:25.809Z | `r2_list` | ok |
| 13:51:28.548Z | `ops_d1_query` | ok |
| 13:51:28.548Z | `ops_d1_query` | error |
| 13:51:29.204Z | `web_fetch` | ok |
| 13:51:30.914Z | `web_fetch` | ok |
| 13:51:30.980Z | `ops_d1_query` | ok |

**Every entry is a read tool.** No `email_mark`, no `github_file_write`, no `workspace_write`, no
mutation of any kind.

This matters because ops-tool writes **are** logged in this table — the same table records the other
session's `email_mark` calls at 13:50:31–13:50:33Z as `ops_ai_tool`. So the absence of a write tool is
**positive evidence**, not a gap in coverage: the sweep did not originate from an ops-endpoint tool
call.

The sweep window (13:51:19.770Z → 13:51:35.662Z) **brackets** the logged activity — it begins 1.375 s
before the first logged event and ends 4.682 s after the last. Consistent with a separate process
running concurrently with a session that was only reading.

## 2. No registered cron fired in the window

`fleet_crons` (schema: `id, name, cron_expr, task_id, enabled, timezone, last_fired, next_fire,
updated_at`) — **6 rows total, 5 enabled**:

| name | cron_expr | enabled | last_fired |
|---|---|---|---|
| demo-heartbeat-minutely | `*/15 * * * *` | 1 | 2026-09-13T13:45:57.834Z |
| systems-watch-hourly-cron | `9 * * * *` | 1 | 2026-09-13T13:09:57.834Z |
| venue-radar-scan | `45 6 * * *` | 1 | 2026-09-13T06:45:38.424Z |
| report-card-weekly-cron | `30 6 * * 1` | 1 | 2026-09-10T12:32:57.858Z |
| bench-arc-weekly | `0 8 * * 1` | 1 | 2026-09-10T12:29:57.860Z |
| demo-venue-radar-daily | `45 6 * * *` | **0** | `null` |

Newest `last_fired` across the whole table is **13:45:57.834Z** — six minutes before the sweep.
Nothing fired at 13:51.

**Caveat that limits this:** `fleet_crons` holds **6 crons for a fleet with ~92 worker directories**.
It is a partial registry, and a worker-side cron would not necessarily appear here at all. So "no cron
fired" is weak evidence against a cron, and no evidence at all against a worker-internal scheduler.

## 3. Corrected: the earlier query failed on a wrong column name

The parent finding recorded `fleet_crons` as unqueryable: `D1_ERROR: no such column: schedule`. That
was **my error** — the column is `cron_expr`. The table is queryable; the hypothesis was simply never
tested. Correcting it does not rescue the cron hypothesis (§2), but the "could not be queried"
characterisation was wrong.

Similarly, `analytics_action_log` has no `ts` column (`D1_ERROR: no such column: ts`), so that store
could not be checked for the window either. That one is a genuine schema mismatch, not a guess error.

## 4. Where the writer can still be

Ruled out:
- an ops-endpoint tool call (§1, positive evidence);
- a cron registered in `fleet_crons` (§2, weak).

Still open:
- **a worker-side routine not registered in `fleet_crons`** — e.g. inside the ops endpoint's own
  `WorkflowEntrypoint` (the worker imports `WorkflowEntrypoint` from `cloudflare:workers` and defines
  `MAX_CHAIN_DEPTH = 6`), which could reconcile chain ancestors on termination. This is the
  best-fitting hypothesis: it would produce a reverse-chronological walk at ~0.3 s spacing, which is
  exactly the observed ordering. **Untested.**
- **a direct-D1 writer** holding Cloudflare API credentials, bypassing the ops endpoint entirely.

## 5. The hazard is now sharper, not softer

The parent finding's §6 said agent-caused state change is invisible except via `cloud_ops_events`.
This addendum strengthens it: ops-tool writes *are* recorded there, so the trail is capable of
distinguishing them — and it recorded **none** during a 15.9 s window in which 35 rows changed
status. **State mutation by a non-ops writer leaves no trace in the audit trail**, and no drift,
reconciliation or health path consulted this session reads that trail.

Concretely: `fleet_drift_report`, the `agent_issues` probes and the drain all observe state without
knowing whether a worker or an agent produced it.

## 6. Limits

- **The writer remains unidentified.** §4 lists hypotheses, not findings.
- **`fleet_crons` is partial** (6 rows, ~92 worker dirs), so §2's negative is weak.
- **`analytics_action_log` could not be queried** (no `ts` column), so one candidate store is
  unchecked. Its real time column is unknown to me.
- **No session/actor column exists in `cloud_ops_events`** — `job` is `'qnfo-ops'` for every row — so
  I cannot attribute the 14 read events to a session, and cannot prove none of them was mine.
- **I did not observe the sweep.** It remains inferred from `updated_at` clustering plus the
  distribution delta.
