# Failure-mode audit, 2026-10-28 (read-only, 55 modes)

Registry: 487 `failure_modes`; at the audit 49 recurring, 6 unprobed, 416 absent, 16 CI-guarded. Method: one read-only pass per mode (latest verification, owner issue or in-flight task, code on `origin/main`). Fixed by PR 5131 (two migrations) are marked **PR5131**.

## Root causes shared by several modes
1. **Research budget halt** (COST-SUSTAIN-1: spent 395,593 of 360,000 neurons, resumes 00:00 UTC): behind publish-rate-collapse (#1000274), metric-refresher-replaced, paper-fabricated-empirical-claim, research-exec-stalled (**PR5131**), thin-papers-unremediated, wai-rate-limit-spiral. The metric refreshers (`claimIntegritySweep`, `revisionLoopTick`) sit behind `researchBudget().ok`; refresh them outside the gate.
2. **Detectors that measure the wrong thing** (mixed time formats, counting handled cases, borrowed probe classes): see the table.
3. **Transport name as `probe_class`** (`d1-query`, `issue-probe-agent`): never a verification class, so the mode is unprobed for ever. Fixed for two (**PR5131**); decision-model-called-as-chat, neuron-attribution-gap, catalog-status-contradicts-use still need contracts with their owners (#1000708, #1000710, #1000711).
4. **Code planner idle since 14:07Z** (last `issue_plans` rows: `untrusted`, source qnfo-fleet-control not in PLAN_TRUSTED; planner trusted set differs from `ops_config.code_merge_trusted_sources`). Not diagnosed; reproduce `POST /v1/plan` (it writes).

## Real defects still needing code (no fix shipped)
| Mode | Where | Smallest fix |
|---|---|---|
| coe-null-id | `qnfo-research-exec/worker.js` ~31094 and `errata-hub/worker.js` ~21862 insert `cloud_ops_events` without `id`, `ts` as `datetime('now')` | add `id` and ISO `ts` (errata-hub copy not verified) |
| companion-stall-closes-on-one-piece | `personal-companion/worker.js`, anchor `var recovered = openRows.filter(function (o) { return prevMs > (Number(o.created_at) \|\| 0); });` | require the two pieces within STALL_MIN |
| ops-capped-reply-logged-ok | `opsReasoningAsReply` only runs for empty content; non-empty text cut at `finish_reason=length` is logged ok | mark capped non-empty replies too |
| fleet-census-blind | `scripts/fleet_journeys.py` anchor `blind = [r.get("name") for r in rows if r.get("healthy") is None]`; same at `qnfo-fleet-control/worker.js` ~10413 | skip `retired` rows |
| script-live-without-source | voice-stt, qnfo-cf-one-dashboard live, no directory | run `fleet-graph/impact` then cf-ops-actions delete-worker or add source |
| code-task-refusal-window-miss | orchestrator: kimi replies of 37-43k chars with no backticked token never trigger REFUSAL-RELOCATE-1 | retry on another model after a no-block reply |
| reopen-without-live-path | 30 migration-filed issues with no contract | give each orphan class a contract or extend REOPEN-LIVE-PATH-3 |
| unprobed-issues | issue-probe-agent resolved ~32 requests in 24 h, 177 issues unprobed over 60 min | raise per-run cap (migrations/2026-10-26-issue-probe-agent.sql) |
| wai-spend-per-paper | detector charges account-wide Workers AI spend (code loop about half) to papers; USD 2.11 per paper against 0.75 | scope to research-exec by `ai_call_counters` worker, and treat spend as a real overage |

## Detectors judged wrong, not yet fixed
binding-props-lost-on-dash-secret (`(direct)` clause), code-plan-wip-steady-state and code-plan-wip-terminal-omitted (borrowed probe), code-task-dies-at-ci (ages out 10-29 and 11-01), code-task-unplaceable-large-file (counts routed cases), cold-human-silent-drop (pins archived email 984), edge-copy-version-skew (expects the removed Zaraz loader), evolve-wip-planner-mismatch (snapshot versus live), q08-writer-yield-order (order changed on purpose by Q08-WRITER-ORDER-2), research-catchup-failed (GitHub API read from a worker), thin-papers-unremediated, verify-autocorrect-precision (cut at ` stated_sig=`), wai-rate-limit-spiral, zaraz-autoinject-worker-html (loader removed on purpose; GA tag is itself under BP26-NO-TRACKING-1), paper-fabricated-empirical-claim, prompt-sync-ignores-live-edit.

## Already owned
ask-circular-explanation (#1000627), breach-doctor-rule-demoted (#1000266), default-approve-issue-unexecuted (#1000657), golden-run-one-quantity-twice (#1000290), publish-rate-collapse (#1000274), control-alternate-reason-unread (#2826), relapse-judged-against-target-not-trigger (#1000550), issue-no-doer-24h and open-issue-no-doer (#100299, #100301), metric-close-flap, remediation-over-budget-metric-lifetime-count, internal-errata-dead-end (re-read after the next defer sweep), directive-literal-newline (data row #1000344 repaired this session; trigger `agent_issues_directive_newline_ai` did not catch it, unread).
