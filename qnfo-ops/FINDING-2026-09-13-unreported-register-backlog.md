# FINDING — unreported register backlog (99 open / 26 overdue) and closures that contradict a live DoD

Date: 2026-09-13 (~15:00Z). Closes the "errors, warnings and alerts" audit for the register,
stale-project, dead-link and experiment surfaces.

## 1. A 99-item backlog that no surface reports

`task_dod_register`: 219 rows — cancelled 19 · done 100 · in-progress 1 · **open 99**.
All 99 carry a due date. **26 are overdue** (due 2026-09-11 ×7, 2026-09-12 ×19);
**17 more fall due today** (2026-09-13). Oldest untouched open row: `updated_at 2026-09-04`
(9 days). Only **1** item is `in-progress`.

| surface | reading |
|---|---|
| `backlog_status` | `openBacklog: 3` (agent_issues only) |
| `ops_issues_list` | 3 open |
| dashboard `register` audit | "0 open (v_waiting_on_human=0)" — filtered to `owner=user` |
| **`task_dod_register`** | **99 open, 26 overdue** |
| `fleet_drift_report` id 1708 | `regOpen=99 regOverdue=26 regDue7=51` — the only surface that sees it |

Sample overdue: Cloud migration P2 (Workflows publish pipeline), qnfo-proof P2 (prover/verifier
loop), outreach daily-cap throttle, errata-publish canonical source, errata publishAction
terminal flip, quality-score cron verification, social draft approval, outreach signal-scoring
gate, Lamport rollout (40 skills + 11 CMD templates + worker prompts).

## 2. Governance conflict

`task_dod_register` id 220 (`QNFO.OPS.007`, **open**) — DoD:

> "…#644/#651 research failures 45/51, #645/#652 MODEL-DEGRADED… **Closing requires fixing the
> condition, not relabelling.**"

At 14:11:53Z `agent_issues` 644/651 were resolved **by re-arm** (`recover_count`/`terminal_rearms`
zeroed, `srcFetched:false` untouched); the resolver's own note reads *"root=ensemble down
(re-armed)"*. The DoD forbids exactly that closure.

## 3. E5 (model-health split-brain) resolved during the session

| reading | ok | degraded | `last_probe_ts IS NULL` | rows |
|---|---|---|---|---|
| ~14:08Z | 20 | 5 | 4 | 25 |
| ~15:00Z | 20 | 0 | 0 | 20 |

The five degraded rows are gone. E5 closed. (Order vs the `MODEL-DEGRADED` closure is not
recoverable from the data.)

## 4. E7's root cause was already documented — and marked done

`task_dod_register` id 217 (`agent_issues` #635, **done**) records it: a `*.qnfo.org` wildcard
resolves every pretty-name at the proxied edge, but only routed hosts have worker routes, so
unrouted names fall through to the placeholder origin **192.0.2.1 / 100::** → **530**. Same class
as E7 (worker-health 530 / error 1016 on qnfo-ai + personal-api). **Known, closed-as-done,
condition still live.**

## 5. The alert storm is damped, not fixed

`task_dod_register` id 216 (#637) records a D1 trigger `alerts_dedup` —
`BEFORE INSERT ON alerts WHEN EXISTS identical source+message within 60min → RAISE(IGNORE)`.
A **60-minute** window leaves one identical alert per message per hour. Measured: `alerts` = 1100
rows, **802** `qnfo-pipeline-ops` critical, single patterns recurring ×121/×116/×110/×71 over
3–4 days. Damped, not fixed.

## 6. Surfaces checked and clean

`stale_projects` 0 rows · `dead_links` 0 rows · `errata_queue` 2 rows both terminal ·
`gtd_register` 7 rows (3 open: weekly-review-2026-09-10 triage, Q3 PoC rebalance due 10-30,
IOCPh notification due 09-15) · `outreach_queue` needs-contact 20 / sent 3 / skipped 18
(sends gated to 2026-09-15).

**`experiments`**: 3 rows — **2 `running` since 2026-09-02 (11 days) with no outcome recorded**,
1 `registered` (baseline 09-15), 1 `planned`. Experiments declared and never concluded.

## 7. Autonomous activity during the session

`agent_issues` 3→0 · `research_queue` 45/51 failed→queued (4th re-arm) · `version_queue` 18
error→drafted→publishing · `ai_model_health` 5 degraded→0 · `qnfo-backlog-exec` 1.2.7→1.2.8
(14:02:44) · `self_heal_actions` healed research-daily-brief + qnfo-twin-maintain (14:05).
**Nothing** was done about the trace-ingest cursor, the `NL` ReferenceError, the 99/26 register,
the 85% deploy failure rate, or the 9 deployed-ahead workers.
