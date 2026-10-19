# Handoff — qnfo-ops thread, 2026-10-19 (closed 08:2x UTC)

Owner-facing closeout for the ops thread that ran 2026-10-19. Every figure below was
measured live in that thread; the measuring query/route is named next to it.

## Objective

Four owner directives, in the order given:

1. Merge all branches and PRs to main and deploy to Cloudflare.
2. Give the system full access to all dashboard feeds and to GitHub issues/projects
   (portfolio/program/project backlogs and roadmaps).
3. Make the system know its own architecture; make code loops and fleet orchestration tick
   faster; let the fleet resolve all issues autonomously and grant itself powers.
4. Resolve the dashboard `Your queue / 11 things need you` automatically.
5. (Last directive) `AI credit runs out in about 0 days` is never an issue and never urgent —
   Cloudflare tops up automatically; only a $0 balance with no top-up that actually halts AI
   calls is an issue.

## What landed (with evidence)

| Change | Evidence |
| --- | --- |
| 3 code commits grafted to main (PRs #2680, #2685, #2568) | `github_cherry_pick` `grafted:3 failed:0`; head `f4a06b1` |
| `docs/ARCHITECTURE-SELF-MODEL.md` — machine-readable self-model | commit `4ebcb9f3` |
| `docs/ARCHITECTURE-CONSTRAINTS-2026-10-19.md` — measured constraint record | commit `5e0f3a5` |
| **CREDIT-HALT-ONLY-1** — runway is never a queue card | commits `378d3609` + `ce7ff6aa`; live `qnfo-fleet-dashboard` **1.47.0-credit-halt-only-1** |
| Owner queue cleared 11 → 1 (urgent 1 → **0**) | `/api/human` at 08:21:47Z: `count: 1, urgent: 0` |
| Planner gate unblocked | `ops_config.code_plan_wip = 40` (was hardcoded 12); orchestrator **0.18.27-plan-wip-tunable-1** |
| WIP-recovery second path scheduled | `fleet_crons evolve-wip-recovery-10m`; `evolve_wip_ceiling = 8` (backup `backup:evolve_wip_ceiling:20261019 = 12`) |
| Dead file claims released | `work_claims` 3391, 3397 released (held by tasks already `published`) |
| 8 dead `superseded` rows normalised | dropped planner WIP 19 → 11; prior status preserved in `last_error` |

## The directive that mattered most (credit)

`qnfo-fleet-dashboard/worker.js:12` now carries the rule verbatim:

> a low balance halts nothing. The only credit card is a balance at or below zero AND gateway
> calls actually failing on credit in the last 6 hours (llm_gateway_log 402/403 or
> insufficient/quota/payment/billing/credit errors). A runway is display context only.

Live result: the `credit-runway` card is gone; `urgent: 0`.

## Deviations and failures

- **The patch first failed to apply.** The initial anchor assumed `creditRunwayDays` was
  `async`; it is a plain function. Fixed in `ce7ff6aa` after a local dry run
  (3 files patched, mirror identical, `node --check` OK, 30/30 tests).
- **The runway card was computed in code, not data.** No D1 row could be closed to clear it;
  only a code change could. That is why it survived several turns.
- **Issue 100085 (the durable billing guard) is still open.** The card is gone via the
  dashboard patch; the separate `qnfo-ops`-side guard task remains unimplemented.
- **`d1_schema_index` is stale for five planes** (living, personal, outreach, cms, ipatent);
  the audit plane was rebuilt. Filed as 100072.
- **Cost guard is structurally blind.** `cost_impact_guard` derives `cost_7d` from
  `llm_gateway_log`, which has no claude/opus rows; the real burn sits in
  `ai_spend_owner_local`. Six consecutive `tighten-failed` days with
  `gateway_limit_before = after = 180`. Filed as **100080**.
- **Control-plane blocklist.** `qnfo-code-orchestrator` and `qnfo-fleet-control` are excluded
  from the loop's own planning/merge scope, so the loop cannot fix its own source. 41 of 50
  open METRIC-TRIGGER issues are owned by those workers.

## Open items, with exact blockers

| # | Item | Blocker | Owner path |
| --- | --- | --- | --- |
| 1 | Issue **100085** — billing-monitor guard on qnfo-ops | not yet implemented; card-level fix shipped separately | code loop, `code-task:` handoff |
| 2 | Issue **100080** — `COST-GUARD-BLIND-1` | guard reads the wrong spend table; PUT/verify fails 6/6 | `qnfo-fleet-control` change, control-plane (needs owner-authorized merge) |
| 3 | Issue **100081** — `CODE-READ-STALE-CHECKOUT-1` | contract `issue-100062` returns `checkout-older-than-contract` | contract refresh path |
| 4 | Issue **100072** — no `d1_schema_index` refresh loop | no scheduled refresher exists | new fleet task |
| 5 | Issue **100073** — ops endpoint has no direct GitHub issues/Projects read tool | tool surface gap; only D1 mirrors + steward endpoints available | endpoint tooling |
| 6 | `ct_agpn0vekiunr2f` — parked task for issue **100047** | 3 attempts, `noop-proposal` from gpt-oss-120b: edits only string literals | needs a narrower goal or a stronger rung; planner gate now open (`code_plan_wip 40`) |
| 7 | Planner effect **unmeasured** | zero `issue_plans` rows since `code_plan_wip` was set to 40 at 08:19 | next scheduler tick |
| 8 | 41 control-plane METRIC-TRIGGER issues | loop forbidden to edit owning workers | design decision + owner-authorized merge |
| 9 | `publish_failed` ×3 tasks | "no patch in ctx.patch"; dead-end state occupies WIP | loop predicate fix |
| 10 | 12 conflicting branches (9 superseded, 1 small fix, 2 features) | superseded by version; features need review | leave unmerged; `fleet-graph` / `travel-planner` need review |

## Metric snapshot at close (2026-10-19)

- Fleet: **33/33 healthy** (`fleet_status`).
- Open backlog: **195** (`agent_issues`), 205 unified incl. `issue_ledger` + `task_dod_register`.
- `code_tasks` created today: failed **100**, merged **99**, closed **86**, queued **8**,
  `publish_failed` **3**, `superseded` **2**, `needs_human` **1** — ~50% failure rate persists.
- Owner queue: **1 item, 0 urgent**.
- `issue_plans` today: **7 rows, all `not-code`, last 07:54:10Z** — planning still produces no
  code plans; the gate was opened after that timestamp and the effect is unmeasured.

## Definition of done for this handoff

This document records state as measured at close. Claims carry their source. Items that are
not done are listed with the exact blocker rather than closed to make the backlog look smaller.
