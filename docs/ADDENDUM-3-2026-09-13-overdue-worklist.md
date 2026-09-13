# QUniverse blockers — ADDENDUM 3: the 26 overdue register rows, and the guard trend

Author: qnfo-ops (ops-exec). 2026-09-13. Live D1.
Completes ADDENDUM 2 §A. Resolves the `due7` discrepancy.

## A. `due7` discrepancy RESOLVED — boundary inclusivity, not a defect

| query | result |
|---|---|
| `due >= date('now') AND due < date('now','+7 day')` (my original) | 47 |
| `due >= date('now') AND due <= date('now','+7 day')` (scanner's) | **51** |

The 4-row delta is exactly the `2026-09-20` bucket (n=4), which an exclusive upper bound
excludes and an inclusive one includes. The scanner uses `<=`. No defect; my comparison
was wrong. The scanner's `regDue7=51` is correct.

Open-task due distribution from today (2026-09-13):
```
09-13: 17   09-14: 3   09-15: 12   09-16: 6   09-17: 5   09-18: 4
09-20: 4    09-22: 3   ...through 10-30 (1 each)
```

## B. The 26 overdue rows — 100% agent-owned

`owner='agent'` for **all 26**. Due dates: 8 rows at 2026-09-11 (2 days late),
18 rows at 2026-09-12 (1 day late). None user-owned.

| id | due | title |
|---|---|---|
| 46 | 09-11 | Cloud migration P2: Workflows publish pipeline (Zenodo deposit -> R2 mirror) |
| 87 | 09-11 | qnfo-proof P2: proof-verification Workflow (ensemble prover/verifier loop) |
| 143 | 09-11 | qnfo-outreach classify daily-cap as throttle |
| 147 | 09-11 | errata-publish source into repo (canonical) |
| 148 | 09-11 | errata publishAction flips errata_queue terminal |
| 160 | 09-11 | Verify first quality-score cron fire overwrites bootstrap |
| 188 | 09-11 | Approve social queue drafts after vetting (SOCIAL-CHECKER-FAILOPEN) |
| 23 | 09-12 | Outreach signal-scoring/identity gate implementation |
| 47 | 09-12 | Research pipeline + publication + dissemination item |
| 57 | 09-12 | Lamport rollout: 40 skills + 11 CMD templates |
| 67 | 09-12 | INVESTIGATE r2-audit slow path (p95=12122ms) |
| 76 | 09-12 | Schedule dashboard snapshot refresh |
| 77 | 09-12 | Wire /api/actions fired decisions into execution queues |
| 81 | 09-12 | Authors column org-label class (~500 rows) |
| 82 | 09-12 | Sitemap lastmod keyed to created_at |
| 118 | 09-12 | Fix qnfo-kaizen weekly-report disposition loop |
| 136 | 09-12 | Add max_tokens:2048 to qnfo-gateway handleAskAI |
| 184 | 09-12 | Verify job-market-watch/personal-api/qnfo-observability err24 roll-off |
| 185 | 09-12 | Reconcile qnfo-ai /v1/models roster vs Workers AI catalog |
| 187 | 09-12 | Verify qnfo-ai content-shape 5006 flatten fix live |
| 189 | 09-12 | qnfo-pipeline-ops alert dedup (ALERT-STORM: 4 dup/60min) |
| 198 | 09-12 | Ensemble research pipeline systemic failure: source_id 40 |
| 200 | 09-12 | LoA calibration: live card shows Sheridan-Verplanck LoA 8 |
| 202 | 09-12 | Sweep fleet SQL time-window comparisons for ISO-Z vs space-format |
| 206 | 09-12 | Envelope provenance adoption: 2/80 workers emit envelopes |
| 210 | 09-12 | Backup lock hardening: dead-PID reclaim + partial-run awareness |

Note several of these are the SAME defects I independently confirmed today:
- id 202 — "Sweep fleet SQL time-window comparisons for ISO-Z vs space-format mismatch"
  is exactly the type-mixing I hit repeatedly on `fleet_deploys.ts`, `agent_issues.updated_at`.
- id 187 — the content-shape 400 class (12,516 gateway failures on qwen2.5-coder-32b).
- id 189 — the ALERT-STORM dedup, same class as the gw-fail emitter.
- id 185 — the model roster drift.
- id 198 — the ensemble research failure (TERMINAL 45/51).

So the register already contains the correct worklist. It is not missing the work; it
lacks the executor.

## C. The guard detects and alerts — it does not execute

`cloud_ops_events kind='gtd-overdue-guard'`, daily at ~03:10Z:

| ts | status | overdue | scheduled_no_executor | agent_uncited |
|---|---|---|---|---|
| 2026-09-10T03:11:09Z | alerted | 5 | 0 | 76 |
| 2026-09-11T03:10:26Z | **clean** | **0** | 0 | 96 |
| 2026-09-12T03:10:47Z | alerted | 7 | 0 | 86 |
| 2026-09-13T03:10:43Z | alerted | **26** | 0 | 67 |

**Trend: 0 → 7 → 26 in three days.** Growth is ~3.7x/day, and 17 more fall due today
(09-13), so tomorrow's guard will likely report ~43.

`scheduled_no_executor=0` is the tell: the guard's own metric says zero *scheduled*
items lack an executor. The 26 overdue are `owner='agent'`, so they are nominally the
agent loop's responsibility — and the agent loop is not draining them. The guard
therefore reports `overdue=26` while simultaneously reporting `no_executor=0`.
That is the contradiction: the guard is satisfied that an executor exists, and the
rows are nonetheless 1–2 days overdue.

## D. Source distribution of the 26

| source_table | n |
|---|---|
| system_prompt | 8 |
| kaizen_candidates | 3 |
| infra-audit-2026-09-05 | 2 |
| intents | 2 |
| agent_issues | 1 |
| analytics_action_loop_2026-09-05 | 1 |
| analytics_setup_2026-09-05 | 1 |
| audit-note | 1 |
| audit_sessions | 1 |
| closeout-2026-09-10 | 1 |
| cloud_ops_events | 1 |
| fleet_model_audit_2026-09-08 | 1 |
| handoffs | 1 |
| kaizen-loop | 1 |
| wbs_state | 1 |

Fifteen distinct sources feed one register. `system_prompt` (8) is the largest single
contributor — tasks filed from prompt text, with no owning process behind them.

## E. Bottom line on the register

"26 overdue rows and no executor" is **correct**, with three refinements:
1. The count is 26 as of the 03:10Z guard run; it is growing 0 → 7 → 26.
2. All 26 are `owner='agent'`; the guard's `scheduled_no_executor` metric is 0, so the
   guard does not consider them executor-less — it just alerts.
3. The register is not short of work. It already lists the defects I confirmed
   independently (202, 187, 189, 185, 198). The missing piece is the drain.

## Limits

- I did not verify whether any external drain reads `task_dod_register`. I verified that
  the guard alerts and that the rows remain open across three consecutive days.
- `agent_uncited` (67) counts agent rows lacking an evidence pointer. I have not audited
  whether that metric is computed correctly.
- The guard runs once daily, so between runs the overdue count is unobservable from D1;
  the 26 is a 03:10Z snapshot, not a live count.
