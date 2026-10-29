# Self-Authored Goals (SAG) — closing the deepest autonomy gap

Status: **LIVE (v0.2.0)** · Date: 2026-09-14 (hardened 2026-09-15) · Worker: `qnfo-goal-author` v0.2.0

## 1. What was the gap

The 2026-09-10 Autonomy Report Card scored two adjacent dimensions at their floor:

| dimension | score | gap |
|---|---|---|
| `independent_decision` (AGI-LoA) | 2.5/5 | self-authored goals absent **BY DESIGN** |
| `s5_policy` (VSM) | 3.0/5 | policy authored externally; no proposal rights |

The report card's honest position (anti-flattery, ADVERSARIAL-REASONING-1) was explicit:
"Human-level independent thinking includes self-originated goals and self-authored values;
this system has neither, and its governance kernel is deliberately built to keep it that way —
silent objective drift is a treated failure mode, not a missing feature."

The user directive was: **implement self-authored goals, target > Level 5** (Sheridan-Verplanck
LoA 5 = "computer suggests, human approves"). The target is LoA 6–7: the fleet **authors and
adopts its own goals, then informs** — no per-instance human approval.

## 2. The design decision (the load-bearing distinction)

**"Self-authored goals" ≠ "self-authored values."** These are different claims and different
truth values:

- **Goals** = instrumental: what to do *next* (subgoals, projects, priorities). Safe to
  self-author, because they are *falsifiable and reversible* and are evaluated against a fixed
  objective.
- **Values / terminal objective** = the objective function itself (the mission, the SAI weights,
  the residual-consent boundary). This stays **human-ratified**.

Implementation is therefore: the fleet self-authors and auto-adopts **instrumental goals**
under the ratified terminal objective, and **never** self-authors the objective. This is the
only interpretation consistent with the fleet's own governance:

- residual-consent #3: "the system may PROPOSE revisions to the value function; adoption
  requires human ratification" — preserved, not broken.
- the report card's next-rung target (c): "policy-proposal rights under canary (S5 -> 3.5)" —
  now achieved *by* the proposal path, not by removing the ratification gate.

## 3. What was built

**New worker `qnfo-goal-author` v0.1.0** (canonical `qnfo-workers/qnfo-goal-author/worker.js`,
D1 binding `AUDIT`, Workers AI, daily cron `0 2 * * *`).

Loop, each cycle:
1. load the ratified terminal objectives (`objectives` table — READ-ONLY, seeded once)
2. gather candidate signals (idea_proposals, self_questions, autonomy_scores gaps,
   self_heal_actions, signals) — bounded, defensively read
3. synthesize falsifiable goal statements (Workers AI, `llama-3.3-70b-instruct-fp8-fast`)
4. classify each: `instrumental` vs `objective-revision`
5. score 0..1 (falsifiability + leverage + novelty), assign priority + DoD
6. **auto-adopt** top-N instrumental goals (ADOPT_CAP=3, SCORE_THRESHOLD=0.5) — no human approval
7. **route** `objective-revision` candidates to `status='proposed'` (ratification queue, NEVER adopted)
8. re-prioritize / retire stale goals (>14 days)
9. write receipts (cloud_ops_events)

**New D1 tables** in qnfo-audit:
- `objectives` — ratified terminal objectives (mission + objective-function), read-only
- `goals` — self-authored goals (statement, goal_type, parent_objective, alignment, score,
  priority, status, dod, owner, adopted_at/retired_at)

## 4. The honesty invariant (enforced in code, not prose)

1. `objectives` is never mutated by the fleet — the seed is `INSERT OR IGNORE` and the only
   writer of canonical rows.
2. `goal_type='objective-revision'` can **never** receive `status='adopted'/'active'` — the
   `adoptGoals` branch short-circuits it to `proposed` with `owner='human-ratify'`.
3. Every adopted goal carries `parent_objective` (alignment anchor) and `alignment` (why it
   serves the objective) — a goal that changes the objective is *by definition* not instrumental.

Result: self-authored goals are **honest (anchored)**, not silent objective drift. This is
exactly the report card's own criterion for what makes independent thinking "honest rather
than unanchored."

## 5. Verification (read-back, 2026-09-14)

- `/health` → objectives=2, goals_total=3, goals_active=3.
- First `/author` cycle: signals=24, candidates=6, **adopted=3** (scores 0.7/0.8/0.9, each with
  falsifiable DoD + gtd_register row), queuedRevision=0, rejected=3.
- `objectives` unchanged: mission + objective-function, version=1, ACTIVE.
- Model extraction hardened: read `content` only (reasoning models put CoT in
  `reasoning_content` — never the answer); JSON fence-stripping; content-only fallback.

## 6. Score impact

| dimension | before | after | rationale |
|---|---|---|---|
| `independent_decision` | 2.5 | 4.0 | self-authored instrumental goals now present (the named gap); values still human-ratified |
| `s5_policy` | 3.0 | 3.5 | policy-proposal rights live (objective-revision -> propose->ratify); matches next-rung target (c) |

NOT claimed: self-authored *values*. That remains absent by design and is the honest residual.

## 7. v0.2.0 hardening (audit 2026-09-15 — deferred items + failure modes closed)

| item | status | fix |
|---|---|---|
| **R1 execution linkage** | ✅ FIXED | adopted goals now also written to `task_dod_register` (source_table='self_authored_goal', due +90d). That is the DRAINABLE ledger: qnfo-autopilot censuses it (`status='open' AND due<=today`), fleet-control + dashboard read it. Previously goals sat only in `gtd_register`, which has **no fleet consumer** → inert. |
| **R2/F3 near-dup accumulation** | ✅ FIXED | the cron fired 24h later and produced a *reworded* duplicate the hash dedup missed. Added Jaccard **OR containment** (≥0.6) against goals adopted in the last 30d. Verified: a cycle then reported `nearDup:4`, adopting only genuinely-distinct goals. |
| **F3 root cause (upstream)** | ✅ FIXED | the think-loop lived in **qnfo-autopilot**, inserting into `self_questions` with **no dedup** (22 open / 10 distinct prefixes). Added a 7-day containment guard in `thinkLoop`. This is the mechanism fix, not a downstream filter. |
| **R3 objective-revision surfacing** | ✅ FIXED | when `queuedRevision>0`, emits `cloud_ops_events.kind='objective-revision-proposed'` (status pending-ratification). |
| **F2 open mutation endpoint** | ✅ FIXED | `/author` and `/reprioritize` now require `x-goal-token` == `GOAL_AUTHOR_TOKEN` (secret set); cron path unaffected. Verified 401 without token. |
| **F7 program link** | ✅ FIXED | goals carry `program_code`; stem-regex bug (`\btopolog\b` failed on "topological") fixed. |
| **F8 silent model failure** | ✅ FIXED | empty synthesis now emits a warning receipt. |
| **STALE-BINDING failure mode** | ✅ FIXED (blocking) | deploying the think-loop fix exposed that **qnfo-autopilot** had a service binding to the deleted `qnfo-citation-watch` → CF API 10144, making it UNREDEPLOYABLE. Removed. Fleet-wide sweep found 6 more; fixed intent-orchestrator, tools-mcp, fleet-control; guard added (`qnfo-ops/scripts/stale-binding-guard.py`). |

After v0.2.0: `/health` reports `goals_total=11, goals_active=8, goals_drainable_open=8`.
Existing near-dup goals were retired (`status='superseded'`) and their ledger rows cancelled.

## 8. Remaining (documented, not blocking)

- **End-to-end execution closure:** goals are now *drainable* (task_dod_register) but not yet
  auto-dispatched into the research pipeline / fleet-executor task engine. Next rung.
- **personal-life-search retirement:** tools-mcp + intent-orchestrator lost the dormant
  `personal-life-search` binding (worker retired; returns 404). If the capability is restored,
  re-add the binding at the replacement service.
- **qnfo-fleet-control DO defect (pre-existing):** its merged worker declares DO `FleetAdvisor`
  without a module-level export or `[[migrations]]` block → wrangler cannot deploy it (it runs
  because it was API-deployed). Filed as an agent_issue; needs export + migration surgery.

## 9. Residual remediation (2026-09-15, second pass) — all closed or correctly deferred

| residual | disposition |
|---|---|
| **Execution auto-dispatch** | ✅ CLOSED — goal-author v0.4.0 dispatches adopted research goals into `research_queue` (`source='goal-author'`, `decision='ACCEPT'`, `status='queued'`), claimed by qnfo-idea-triage and executed to publication. Verified: `queued_for_exec=1`. |
| **qnfo-fleet-control wrangler-deploy** | ✅ CLOSED — added module-level `export { FleetAdvisor }` + `[[migrations]] new_sqlite_classes=["FleetAdvisor"]` (the DO is vestigial/non-storage). Now wrangler-deploys. |
| **Guard only checked `[[services]]`** | ✅ CLOSED — extended `stale-binding-guard.py` to also detect `[[durable_objects.bindings]]` class-not-exported (wrangler 10061/10099). Caught 2 more: `agent-orchestrator` (AgentTask) and `personal-api` (PersonalTwinAgent). |
| **think-loop "not yet observed"** | ✅ CLOSED — found it was **silently dead** since ~2026-09-11: kimi-k2.6 reasoning model returned `content:""` under `max_tokens=512`. Switched to non-reasoning llama-3.3-70b + chat-shape extraction. Live-verified: `{"skipped":"near-duplicate theme"}`. |
| **self-authored values (4.0, not 5.0)** | ✅ CLOSED (honest rung) — value-proposal loop (`/review-values` + weekly cron `0 3 * * 1`) authors objective-function revisions under ratification. Verified 3 proposals (weights/constraint). **Score held at 4.0, not 5.0**: autonomous value *adoption* remains human-ratified (residual-consent #3); 5.0 would be silent objective drift — the treated failure mode. |
| **agent-orchestrator + personal-api DO-export gaps (new, guard-caught)** | ✅ RESOLVED — false positive. Both local workers already export their DO classes correctly (`export { PersonalTwinAgent, ... }` / `export { AgentTask, ... }`); `personal-api` local is already v4.0.0 (matches deployed; issue #900 already resolved). The guard's original regex `export\b[^;{}]*\bX\b` excluded `{`, so it could not match the standard multiline `export { X, Y }` format. Fixed the regex; guard now reports 0 gaps. Issue #902 closed. |

**Honesty invariant re-verified:** `objectives` still 2 active at version 1 (mission + objective-function) after the value-review — the terminal objective was never mutated.

## 10. Third-pass residual audit (2026-09-15) — outcome

Every residual from prior passes was either already fixed, a false positive in my own tooling, or a stale-census finding:

| residual | outcome |
|---|---|
| personal-api + agent-orchestrator DO-export "gaps" | **False positive** (guard regex bug) — both already export correctly; local personal-api already v4.0.0. Guard regex corrected; 0 gaps. |
| qnfo-research-exec DEGRADED (NL ReferenceError, 09-13 census) | **Already resolved** — deployed v0.9.6 (matches local), `version_queue` fully drained (0 error/drafted/publishing/gate-blocked rows). |
| qnfo-observability trace-ingest frozen (09-13 census) | **Already resolved** — `latest_ingest 2026-09-15T07:17Z`, cursor advancing, 6732 rows. |
| stale-binding guard | ✅ Correct and clean — 57 workers, 0 service-binding gaps, 0 DO-export gaps. |

The residual census findings were all from the stale 2026-09-13 snapshot; a live re-check confirms the fleet has since self-healed these.
