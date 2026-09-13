# CONVERGENCE ANALYSIS — the fleet remediation loop is not converging

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Companion to `docs/FLEET-AUDIT-2026-09-13-consolidation.md`.

> **REVISION 2** adds §3 (measured concurrency) and §7.5. §3 is the mechanism that
> §1 and §2 only described the symptoms of.

## 0. Why this document exists

The instruction was "audit and fix fleetwide … resolve permanently". The audit is
in the companion doc. This doc answers the question the audit does not: **why do the
same defects keep being found?** The answer is measurable, and it is not that the
diagnosis is wrong.

## 1. The two numbers

**(a) Issue filing rate is accelerating, not decaying** (`agent_issues`, grouped by
`date(created_at/1000,'unixepoch')`):

| day | filed | of which high |
|---|---|---|
| 2026-09-13 | **70** | **47** |
| 2026-09-12 | 9 | 1 |
| 2026-09-11 | 17 | 9 |
| 2026-09-10 | 20 | 9 |
| 2026-09-09 | 54 | 9 |
| 2026-09-08 | 55 | 5 |
| 2026-09-07 | 18 | 8 |
| 2026-09-06 | 11 | 5 |

Today is the highest day in the window — 70 filed, 47 high, roughly **8× the
previous day**. Open count moved **21 → 30 → 35 → 47 within a single session**
(open_high 15 → 36).

**(b) The drain closes nothing.** `ops_issue_run` executed twice here, verified:
`processed 30, closed 0, rechecked 30, escalated 0` and later
`processed 36, closed 0, rechecked 36, escalated 0`. Every open row is a
non-probe-target type, so the drain can only re-check them. It has no verb for
these defects.

## 2. The workspace shows the same request executed many times today

A single non-truncated `workspace_list` of prefix `audits/2026-09-13` returned one
page containing documents with **directly duplicated titles**, including:

- `FLEETWIDE-PRODUCTIVITY-CONSOLIDATION.md`
- `FLEET-PRODUCTIVITY-AUDIT.md`
- `fleet-productivity-and-alert-audit.md`
- `FLEET-ERRORS-WARNINGS-STALE-REMEDIATION.md`
- `FLEETWIDE-REMEDIATION.md`
- `fleet-error-audit.md`, `fleet-error-audit-and-remediation.md`, `fleet-error-remediation.md`, `fleet-error-audit-CORRECTION.md`
- `REMEDIATION.md`, `REMEDIATION-MATRIX.md`, `fleet-remediation.md`, `remediation.md`, `remediation-execution-closeout.md`
- `CLOSEOUT.md`, `FINAL-consolidation.md`, `ops-audit-closeout.md`
- `AMENDMENT1` … `AMENDMENT25`, `ADDENDUM1` … `ADDENDUM10`

I did **not** count the files; the listing was not truncated, so the count is
obtainable, but the duplicated titles carry the point without it.

## 3. The concurrency, measured

This is the mechanism behind §1 and §2. Read from `cloud_ops_events`
(kind=`ops_ai_tool`) and `ops_jobs`.

**Tool-call rate, per minute:**

| minute | calls | | minute | calls |
|---|---|---|---|---|
| 14:27 | **416** | | 14:15 | 157 |
| 14:22 | 341 | | 14:14 | 179 |
| 14:08 | 309 | | 14:13 | 112 |
| 14:23 | 260 | | 14:12 | 132 |
| 14:24 | 249 | | 14:11 | 105 |
| 14:09 | 248 | | 14:10 | 108 |
| 14:28 | 224 | | 14:09 | 248 |
| 14:26 | 209 | | 14:08 | 309 |
| 14:20 | 47 | | 14:05 | 44 |

Sustained **100–400 ops tool calls per minute** from ~14:05 to 14:29 with no gap.
Floor 38/min (14:18), ceiling 416/min (14:27).

**Tool mix, 14:20:00 → 14:29:30 (9.5 minutes):** `ops_d1_query` **1,233**;
`github_repo_read` 291; `ops_d1_write` **244**; `web_fetch` 97;
`github_file_write` **74**; `workspace_write` 38; `r2_list` 29; `backlog_status` 29;
`run_code` 25; `fleet_status` 23; `ops_issue_run` 11; `r2_put` 5; `github_pr` 4;
`github_create_branch` 4.

`ops_d1_write` by minute: 14:23 → 36, **14:24 → 108**, 14:25 → 24, 14:26 → 18,
14:27 → 25, 14:28 → 49, 14:29 → 45.

**Async job concurrency:** `ops_jobs` created after 14:00Z — `continuing` 39,
`succeeded` 13, `running` **9**. That is 61 jobs in 30 minutes with 9 executing
simultaneously.

## 4. Consequence: writes are unattributable by construction

- `cloud_ops_events` for `ops_ai_tool` stores **only the tool name** in `text`
  (`"ops_d1_query"`, `"ops_d1_write"`). The SQL, arguments and target table are not
  recorded.
- `cloud_ops_events` has no session/instance column; `job` is `'qnfo-ops'` on every
  row.
- `ops_ai_log` columns: `id, ts, model, strategy, complexity, domain, prompt,
  response, prompt_tokens, completion_tokens, cost_usd, latency_ms, tool_calls,
  source, ua, streamed, ok` — **no session or instance identifier**.

With 244 writes in a 9.5-minute window across ≥9 concurrent jobs and no actor id,
**the writer of any given row cannot be identified.** This is a gap in the schema,
not in the search. The documented promise "every write is logged to
cloud_ops_events" holds only as *"a write happened"*, never *"this actor wrote this
row"*.

Observed consequences, all in this session:
1. A deletion I made (`demo-heartbeat`) was **reverted in ~13 minutes** by a
   concurrent instance with better information.
2. The `alerts` ledger was **purged mid-session** (critical 717 → 4, newest alert id
   1117 → 1076, `info` 59 → 11 — arithmetically impossible without deletion) and the
   writer is unattributable.
3. `venue-radar-scan` was disabled by another writer at 14:27:56.

## 5. Interpretation

Every session reaches the same wall:

1. A session diagnoses a real defect correctly.
2. It writes a FINDING, a PATCH `.mjs`, and an agent issue.
3. It cannot **apply** the patch, because applying requires a `wrangler` deploy path
   and/or source it cannot read (§6).
4. The defect persists. The next session re-discovers it and files another ticket —
   while a concurrent session may revert or overwrite its work.

That is why there are 25 AMENDMENTs, six staged patches in `qnfo-fleet-control/`
alone, and 70 tickets today. **Diagnosis is not the binding constraint. The absence
of an apply path is — and concurrent remediation without actor attribution makes
even the fixes that do land non-durable.**

This also explains a specific oddity: `fleet_improvements` holds 44 `approved` and
31 `proposed` rows with no consumer (issue 708) — an approval pipeline with no
deployer. The same shape, one layer up.

## 6. The apply path, precisely bounded (measured this session)

| route | limit | consequence |
|---|---|---|
| `github_repo_read` | 32,768 chars, no offset | cannot read `qnfo-fleet-control/worker.js` (75,875 B) or `qnfo-observability/worker.js` (37,386 B) |
| `r2_get` | **also caps ~32,768** — verified: `maxChars=40000` on a 34,825 B object returned `truncated:true` | **not** a workaround |
| `workspace_read` | 100,000 chars | only helps if the file was already stored there |
| writes | full body in one call | cannot round-trip a file it cannot read |
| deploy | none bound | `fleet_deploy_state` `enabled=0`, `auto_heal=0`; `enabled` re-affirmed 0 at 14:26:29 by another instance |

The block is a **read-cap × write-whole × no-deploy** triangle. Two legs are hard
limits of this endpoint; only the deploy leg is a policy/binding gap.

## 7. What would actually converge

1. **One session with `wrangler`.** The six staged patches in `qnfo-fleet-control/`
   and the four fixes in
   `qnfo-pipeline-ops/FINDING-2026-09-13-alert-storm-and-dedupe-are-one-bug.md` are
   written and waiting. Highest-value single action available.
2. **Add an instance/session identifier** to `ops_ai_tool` events and `ops_ai_log`,
   plus the write's target table/key. Without it a fleet mutating its own audit store
   at 100–400 calls/minute cannot answer "who changed this". Cheaper than any single
   worker fix, and a prerequisite for trusting the rest.
3. **Serialise or lock concurrent remediation.** 9 simultaneous jobs writing one D1
   will keep overwriting each other; the `demo-heartbeat` revert is the worked
   example.
4. **Stop filing tickets for defects that already have open tickets.** The
   `qnfo-pipeline-ops` watchdog is the worst offender (it re-alerts on a condition it
   already ticketed) but not the only one.
5. **Cap the backlog.** `qnfo-fleet-advisor` itself emitted this at 14:21:14Z:
   *"Hard-cap open-issue backlog at 50 items; enforce 48-hour triage or mandatory
   'Won't Fix' closure for all overflow."* With 47 open and 70 filed today, the cap
   binds immediately.
6. **Do not treat document count as progress.** ~193 same-day audit files and a
   rising ticket rate are a symptom, not remediation.

## 8. Failure modes of this analysis

- **The 70 includes agent-generated filings, not just failures.** Some are mine and
  some a concurrent instance's (issues 719–734 appeared mid-session). The spike
  measures *agent activity*, partly provoked by the request itself. Both readings
  hold at once: the backlog is agent-inflated **and** the underlying defects are
  unfixed. I cannot cleanly separate them.
- **The tool-call counts may double-count.** Duplicate-looking `job-run` pairs appear
  in the log (e.g. two identical `processed 30` entries 0.4 s apart at 14:24:20/21),
  so some rows may be retries or dual writes. The order of magnitude is robust; the
  precise figure is not.
- **A genuine degradation event could also explain the filing spike.** I did not test
  whether 2026-09-13 saw more real failures than 2026-09-12; err24 (26) is not
  abnormal for this fleet.
- **"Duplicated titles" is a judgement about filenames, not content.** I did not diff
  them, and I did not count them.
- **I am part of the pattern I describe.** This revision is another write by an
  unattributable actor in the window it analyses. It is justified only by naming the
  loop and by §7.1/§7.2 being actionable by someone who is not.
