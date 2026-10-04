# HANDOFF: ENSEMBLE-POLICY-1 (agent_issues 1918), written 2026-10-03

Repo QNFO/qnfo-workers. D1 qnfo-audit id 35e2e573-92f3-46ac-83c6-22f6429fc5e5. Read CLAUDE.md first (work claims, VERSION-AHEAD, no claude.ai links, REST-only gh, no GraphQL).
Rules: no new worker/cron/paid model call while fleet_budget is breached (it is); never raise caps; no secrets in commits; claim files via https://qnfo-deploy-guard.q08.workers.dev/work-lock/acquire before editing.

## Step 1. Merge (blocked for the previous session by a permission classifier, "Merge Without Review")
Order: 552 -> 557 -> 562 (stack: 557 base is claude/q08-note-1, 562 base is claude/q08-quality-1; after 552 merges, retarget 557 to main with `gh api -X PATCH repos/QNFO/qnfo-workers/pulls/557 -f base=main`, then 557, then retarget 562 and merge).
Then 553, 559, 566, 570, 571 (all base main). Use `gh api -X PUT repos/QNFO/qnfo-workers/pulls/<n>/merge -f merge_method=squash` only when all check-runs are success.
If a PR shows a failed `guard` (Version bump guard): main moved. Merge origin/main into the branch, push, rerun. Do not change VERSIONs downward.
If merge is refused again, stop and tell the owner; do not work around it.
Branches: claude/q08-note-1 (0.8.3), q08-quality-1 (0.8.4), q08-ensemble-1 (0.8.5-ensemble), q08-votes-trigger, fleet-cmd-q08 (dashboard 1.21.0), ask-judge-1 (qnfo-ai-search 2.2.2), prober-models-1 (ai-health-prober 2.3.11), errata-judge-1 (errata-hub 1.3.1).

## Step 2. Verify after canonical deploy (canonical-deploy.yml runs on merge)
1. `curl https://q08.org/health` shows version 0.8.5-ensemble.
2. `curl https://q08.org/api/ensemble` returns JSON with panel rows after the next publish attempt.
3. D1: metric q08_neurons_per_published_piece_7d <= 643 (guard; if higher, roll back the ensemble, record why).
4. D1: `SELECT * FROM ask_loop_runs WHERE kind='judge' ORDER BY id DESC LIMIT 3`: judged>0 or failed.last_error named.
5. https://fleet.qnfo.org shows 1.21.0; `style list` works from the command line on a q08.org/p/<slug> page.
6. `ai_model_health` has rows for nemotron-3-120b-a12b, gemma-4-26b-a4b-it, qwen3-30b-a3b-fp8, llama-3.3-70b-instruct-fp8-fast.
7. After an errata respond tick: `errata_judge_log` has rows; any fail made the action risk 'high'.
8. `v_metric_trigger_state` for triggers 786, 797, 806 (q08_panel_effective_votes_30d lt 1.3, q08_panel_unavailable_share_7d gt 0.25): hit must not be 1 for 7 days; if it is, follow its code-anchor.
Then close issues 1888, 1894, 1918 with the measurements in issue_triage.close_evidence (never wontfix).

## Step 3. Work not started
- Issue 1889: qnfo-ai ensemble pools have two deepseek and two zai entries. Compute pairwise agreement from its stored answers; dedupe to one model per family if agreement is high. Code task in qnfo-ai-search or qnfo-ai worker.js, with VERSION bump and mirror deployed-current.worker.js.
- Issue 1895: add a fleet-wide generator inventory (each prose writer: writer model, non-model gate, cross-family reviewer, fail-open/closed). Review qnfo-email-orchestrator and research-exec (MATH-LATEX-1, #1891) against docs/ENSEMBLE-POLICY.md.
- ASK-LOOP MIN_ARM_JUDGED=30 vs about 25 asks a week: decide with data in ask_loop_runs; do not lower a guard to pass.
- Remediation contract class issue-1918 has a prose probe; write an executable d1-query probe if the contract format allows.

## Step 4. Tell the owner (via fleet.qnfo.org queue card, not claude.ai)
q08 cap is 3/day (undo: delete ops_config row q08_max_per_day). /api/owner/prompt may accept unauthenticated task filing (unverified; check and say what a stranger could do). Owner reads inflate human reads. fleet_budget is breached (ai_spend 224.55/150 at last read).

## Step 5. Closeout
Update qnfo-audit.session_records for your own session honestly; release work claims with the right outcome (merged/closed).
