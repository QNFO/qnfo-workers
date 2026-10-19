-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261019_breach_anchors b WHERE b.id = analytics_metric_triggers.id), notes = (SELECT b.notes FROM bak_20261019_breach_anchors b WHERE b.id = analytics_metric_triggers.id) WHERE id IN (SELECT id FROM bak_20261019_breach_anchors); DELETE FROM remediation_contracts WHERE class = 'fm-breach-anchor-stale'; DELETE FROM failure_modes WHERE fm_key = 'breach-anchor-stale'; DELETE FROM capability_ledger WHERE capability = 'metric-lever-anchor-guard'
-- BREACH-CODE-ANCHORS-1 (2026-10-19, pillar autonomy, agent_issues 99926, trigger 379 breach_code_task_pct; ACT-BRIDGE-1 in CLAUDE.md).
-- The metric reads 7.7 against a floor of 10: of 51 to 54 breaching triggers only 4 (409, 537, 1238, 3687) end in a code-task line the
-- code loop can build from. Two faults, both data:
--   1. Trigger 1238 (idea_topic_concentration_30d) names the anchor "async function triageProposals(env) {", which occurs 0 times in
--      idea-hub/worker.js on main: the function is now triageProposals(env, deadline) (1 occurrence). The metric still counts the line
--      while the code loop cannot place the edit. The anchor is corrected. Failure mode breach-anchor-stale. Two checks, and neither
--      claims more than it does: the detector fm-breach-anchor-stale is a D1 probe, which cannot read a worker file, so it watches the
--      1238 anchor only (0 unless it is the corrected text); the structural guard migrations/code-anchor-once.test.mjs reads every
--      code-task / code-anchor pair that a migration from this file on writes to analytics_metric_triggers and fails CI unless the pair
--      occurs exactly once in its path on the checkout, a later migration that repoints (or retires) it taking its place. That suite
--      names the workers it reads as ../<dir>/worker.js, so SUITE-DEPENDENTS-1 runs it on a PR that changes one of them: the PR that
--      moves an anchored line is the one that fails and carries the repoint. Anchors of earlier migrations (409, 3687, 537 ...) are
--      reported as NOTEs only; the repository cannot tell which of them the live trigger still carries.
--   2. Too few breaches name their lever. Candidates were measured on 2026-10-19 between 11:40 and 12:10 UTC against live D1 and main,
--      and a candidate whose lever did not hold was left out:
--        left out  5394 as an idea-hub change: the research admission cap is not the lever. research_queue holds 189 queued + 267 deferred
--                  rows (cap 120) and 3 rows entered after 2026-10-17; admission is already closed. The pool is the stock.
--        left out  538 and 537: the Q08-YIELD-1 handoff patch (agent_issues 99929, 99930, docs/handoff/patches/q08-yield-1.patch) owns them.
--        left out  8558 (100.1 against 100, within noise), 9 (one timed-out mobile request), 9374 (qnfo-model-eval already wraps its cron in
--                  CRON-GRID-1 on main, 1.5.0, and awaits its first fire), 4986 (two metrics unmeasured by design below 10 samples), 8559
--                  (one issue-state row that needs a hand fix in D1 or GitHub), 5915 (same root cause as 5394).
--        added     9193 ai_model_error_rate_max_1d -> q08-signal-engine/worker.js factCheckExtra: @cf/qwen/qwen3.8-27b is the metric max
--                  model, 89 of 114 calls errored in 24 h (63 of 78 on 10-18, 15 of 20 on 10-17), its only caller is q08-signal-engine, and
--                  factCheckExtra has no branch for it (its comment: models without a measured switch get none).
--        added     5394 research_deferred_pool -> qnfo-fleet-control/worker.js POOL-BOUND-1: all 267 deferred rows are idea_proposals.name
--                  owner-corpus (contact owner), which the pool query ranks as class 1 (name LIKE owner%) and the bound parks class 2 only,
--                  so the pool of 267 sits above research_deferred_max 60 for good. idea-hub proposalKind already tells corpus (a model
--                  extraction from the notebook) from direct (owner-written). Parked rows keep their revert line and re-arm under 30.
--        added     5916 papers_live_failing_release_gate -> qnfo-research-exec/worker.js reviser aiText: THIN-PRIOR-WORK-1 went live today
--                  and 3 of its 4 writer calls came back with 0 chars (paper_revision_log thin-prior-work-rejected, section check too-short),
--                  its writer is deepseek-v4-flash through an aiText that sends no reasoning switch; q08 factCheckExtra records
--                  thinking:false as the measured switch for deepseek. 140 thin papers stay live.
-- Each lever sentence is placed straight after the "Pillar ..." header, inside the 300 characters triggerIssueDescription (qnfo-fleet-control
-- ACT_BRIDGE_MARK) keeps of the prose when evaluateMetricTriggers files the issue, so the doer sees the edit and not only the title; the
-- evidence paragraph follows the old text and the two marker lines end the action. The anchors sit on the line next to the edit, not on
-- the edited line, so a faithful fix leaves them in place. 5394 names qnfo-fleet-control, which the code loop reaches since
-- CODE-LOOP-CONTROL-PLANE-1 (PR 2850, PLAN_LOOP_CANARIED in qnfo-code-orchestrator).
-- The open METRIC-TRIGGER issues of these triggers (100045 for 9193, 99943 for 5394, 99949 for 5916) never carry the lever, and this file
-- does not rewrite them: evaluateMetricTriggers files a trigger action only when it inserts a new issue, dedupes against an open one and
-- reopens a closed or monitoring twin with its old description (METRIC-TRIGGER-TWIN-1), and the breaches persist, so no second filing
-- happens (ACT-BRIDGE-LEVERS-20261013 has the same limit). breach_code_task_pct counts the trigger text either way. The doer is therefore
-- given its own rows by the follow-up migration migrations/2026-10-19-breach-lever-issues.sql (one agent_issues row per lever, code-task
-- and code-anchor of the trigger, a code-probe that closes it); this file never writes agent_issues.
-- Expected at the first hourly metric refresh after the apply: 7 of N breaching, 13.7 at the 51 measured at 11:50Z and 14.6 at 48 on the
-- re-read of this repair; the floor is 10, so the margin depends on N (7 clears it while N <= 70, and at N = 51 it is 1 above
-- ceil(10 percent)). Backup: bak_20261019_breach_anchors (the four trigger rows). The issue-99926 contract is NOT
-- touched (the patch rewrote its parked probe; left out on landing: no prober reads a parked row, so the rewrite had no effect, and it replaced the
-- standard recovering probe that TRIGGER-RECOVERY-1 and VERIFICATION-OSCILLATION-1 rely on if the contract is ever re-armed). No worker code changes, so no VERSION bump.

CREATE TABLE IF NOT EXISTS bak_20261019_breach_anchors AS SELECT id, metric_key, action, notes FROM analytics_metric_triggers WHERE id IN (1238, 5394, 9193, 5916);

-- 1238: the corrected anchor (the function takes a deadline since idea-hub 1.10.x, one occurrence in idea-hub/worker.js). The WHERE names the id and
-- the metric_key that migrations/2026-10-06-trigger-code-task-lines.sql wrote the pair under, so the anchor guard reads them as one trigger.
UPDATE analytics_metric_triggers SET
  action = replace(action, char(10) || 'code-anchor: async function triageProposals(env) {', char(10) || 'code-anchor: async function triageProposals(env, deadline) {'),
  notes = COALESCE(notes, '') || ' | BREACH-CODE-ANCHORS-1 2026-10-19: code-anchor repointed to triageProposals(env, deadline), the old text occurred 0 times in idea-hub/worker.js'
WHERE id = 1238 AND metric_key = 'idea_topic_concentration_30d' AND instr(action, char(10) || 'code-anchor: async function triageProposals(env) {') > 0;

-- 9193 ai_model_error_rate_max_1d: q08 factCheckExtra, qwen branch
UPDATE analytics_metric_triggers SET
  action = substr(action, 1, instr(action, ').') + 1) || ' ' ||
    'Lever: in q08-signal-engine/worker.js factCheckExtra add a qwen branch returning { chat_template_kwargs: { enable_thinking: false } }. qwen3.8-27b has no switch and failed 89 of 114 calls in 24 h.' ||
    substr(action, instr(action, ').') + 2) || char(10) ||
    'ACT-BRIDGE-FIX-20261019 evidence (2026-10-19 12:00Z, ai_call_counters, last 24 h): @cf/qwen/qwen3.8-27b 114 calls 89 errors (0.781), caller q08-signal-engine only, 26 of 36 calls today and 63 of 78 on 10-18, so it is the max model of this metric. factCheckExtra (read by the compose, title-repair, reader-panel and fact-check calls) gives nemotron enable_thinking false, kimi and deepseek thinking false and gpt-oss low effort, and its comment says models without a measured switch (glm, gemma, llama, qwen) get none: a reasoning model spends the token budget before it answers. The next model, @cf/zai-org/glm-5.3-flash at 0.516 (3207 errors in 6216 calls), is mostly qnfo-research-exec calls retried after a 3021 per-minute rate limit (research_parallel 96, 2651 backoff warnings since 10-18) and is the lever after this one. Done when ai_model_error_rate_max_1d is back under 0.5 at two refreshes.' || char(10) ||
    'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
    'code-anchor: if (m.indexOf("nemotron") >= 0) return { chat_template_kwargs: { enable_thinking: false } };',
  notes = COALESCE(notes, '') || ' | BREACH-CODE-ANCHORS-1 2026-10-19: lever, code-task and code-anchor appended (qwen thinking switch in q08 factCheckExtra)'
WHERE id = 9193 AND instr(action, 'ACT-BRIDGE-FIX-20261019') = 0 AND substr(action, 1, 7) = 'Pillar ' AND instr(action, ').') BETWEEN 10 AND 120;

-- 5394 research_deferred_pool: POOL-BOUND-1 treats the notebook extractions as owner-authored and never parks them
UPDATE analytics_metric_triggers SET
  action = substr(action, 1, instr(action, ').') + 1) || ' ' ||
    'Lever: in qnfo-fleet-control/worker.js researchBackpressureTick (POOL-BOUND-1) make the pool query pri CASE return 2 for name owner-corpus so rows past research_deferred_max (60) are parked. All 267 deferred rows are owner-corpus, now exempt.' ||
    substr(action, instr(action, ').') + 2) || char(10) ||
    'ACT-BRIDGE-FIX-20261019 evidence (2026-10-19 12:00Z): research_queue has 267 deferred rows, every one source proposal with idea_proposals.name owner-corpus and contact owner. The pool query in the POOL-BOUND-1 block ranks name LIKE owner% as pri 1 (as RB_ORDER_SQL does) and the bound parks only pri 2 rows beyond research_deferred_max, which has no ops_config row and so stands at 60: the pool of 267 is never parked. idea-hub proposalKind separates corpus (a model extraction from the owner notebook, accepted at score 0) from direct (owner-written), and 532 corpus rows entered research_queue between 10-13 and 10-17, 3 rows of any kind since, so idea-hub RESEARCH_ADMISSION_CAP is not the lever. Change only the pri expression of the pool query: leave RB_ORDER_SQL and the ready-queue order as they are, so the best 60 stay in line and the rest are parked with the revert line POOL-BOUND-1 writes and re-armed by priority when the pool is under 30. Test: a pool of 267 owner-corpus rows parks 207 and keeps 60. Done when research_deferred_pool is at or under 120 and content_items_over_stage_sla falls with it.' || char(10) ||
    'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
    'code-anchor: var over = pool.slice(pbMax).filter(function (r) { return Number(r.pri) === 2; });',
  notes = COALESCE(notes, '') || ' | BREACH-CODE-ANCHORS-1 2026-10-19: lever, code-task and code-anchor appended (owner-corpus parkable in POOL-BOUND-1)'
WHERE id = 5394 AND instr(action, 'ACT-BRIDGE-FIX-20261019') = 0 AND substr(action, 1, 7) = 'Pillar ' AND instr(action, ').') BETWEEN 10 AND 120;

-- 5916 papers_live_failing_release_gate: the thin-paper writer gets no reasoning switch and answers with nothing
UPDATE analytics_metric_triggers SET
  action = substr(action, 1, instr(action, ').') + 1) || ' ' ||
    'Lever: in qnfo-research-exec/worker.js reviser aiText send chat_template_kwargs { thinking: false } when the model is deepseek (the switch q08 factCheckExtra measured). The thin-paper writer returned 0 chars on 3 of 4 calls, so 140 thin papers stay live.' ||
    substr(action, instr(action, ').') + 2) || char(10) ||
    'ACT-BRIDGE-FIX-20261019 evidence (2026-10-19 12:00Z): the quality sweep reads revise=140 on 10-17, 10-18 and 10-19 (640 published, 500 pass). THIN-PRIOR-WORK-1 (qnfo-research-exec 0.21.0) runs once an hour with THIN_BATCH 2 and has logged 4 outcomes in paper_revision_log: 1 thin-prior-work-queued and 3 thin-prior-work-rejected with section check too-short (0 chars). Its writer is @cf/deepseek-ai/deepseek-v4-flash-0731 called through the reviser aiText(env, prompt, model, maxTokens), which sets no reasoning switch and returns an empty string when the reply has no content, and q08 factCheckExtra records thinking false as the measured switch for deepseek (finish length, 0 chars without it). A rejected paper waits a day (thinCandidates), so each empty reply costs the paper 24 hours. Keep the cross-family re-read, the HARD-finding fail-closed rule and the release gate check as they are. Done when papers_live_failing_release_gate is below 139 and falling.' || char(10) ||
    'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
    'code-anchor: async function aiText(env, prompt, model, maxTokens) {',
  notes = COALESCE(notes, '') || ' | BREACH-CODE-ANCHORS-1 2026-10-19: lever, code-task and code-anchor appended (deepseek thinking switch in the reviser aiText)'
WHERE id = 5916 AND instr(action, 'ACT-BRIDGE-FIX-20261019') = 0 AND substr(action, 1, 7) = 'Pillar ' AND instr(action, ').') BETWEEN 10 AND 120;

-- Issue 99926 closes through TRIGGER-RECOVERY-1 on the metric alone (breach_code_task_pct back at or above 10 for 60 minutes); its parked contract keeps the
-- standard recovering probe. The anchor half of the condition is carried by the active detector fm-breach-anchor-stale below.

-- failure mode and detector
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('breach-anchor-stale',
  'a code-anchor line on a metric trigger no longer occurs exactly once in the file its code-task line names, so the code loop cannot place the edit and the breach keeps no working doer',
  'the anchor is copied into analytics_metric_triggers.action when the lever is written and nothing re-reads it when the worker changes: trigger 1238 kept the text async function triageProposals(env) { after idea-hub changed the function to take a deadline, and evaluateMetricTriggers files the anchor unchanged',
  'BREACH-CODE-ANCHORS-1: the 1238 anchor is corrected and new anchors sit on the line next to the edit. migrations/code-anchor-once.test.mjs reads every code-task and code-anchor pair that a migration from this file on writes to analytics_metric_triggers (UPDATE keyed by id or metric_key, or INSERT) and fails CI unless it occurs exactly once in its path on the checkout, a later migration that repoints or retires it taking its place; the suite runs on any PR that changes a worker it reads (SUITE-DEPENDENTS-1). Anchors written by earlier migrations (409, 3687, 537 and others) are reported as NOTEs only',
  'fm-breach-anchor-stale is a D1 probe and cannot read a worker file: it reads trigger 1238 and returns 0 unless its code-anchor is the corrected triageProposals(env, deadline) text (1 when the row or the anchor line is gone); a later repoint of 1238 updates this probe in the same migration. Every other anchor is guarded by migrations/code-anchor-once.test.mjs in CI, not by this detector',
  'fm-breach-anchor-stale', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 99926,
  'a code-anchor line in analytics_metric_triggers.action whose text occurs 0 or 2 or more times in the file named by the code-task line above it',
  'the filed METRIC-TRIGGER issue reaches the code loop with an anchor the read step cannot find: ANCHOR-LOCATOR-1 spends a locator pick or the task parks',
  'one trigger per stale anchor, and breach_code_task_pct still counts the line, so the metric looks healthier than the doing is');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-breach-anchor-stale', NULL, 'BREACH-CODE-ANCHORS-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM analytics_metric_triggers WHERE id = 1238) = 0 THEN ''1'' WHEN instr((SELECT action FROM analytics_metric_triggers WHERE id = 1238), char(10) || ''code-anchor:'') = 0 THEN ''1'' WHEN instr((SELECT action FROM analytics_metric_triggers WHERE id = 1238), ''code-anchor: async function triageProposals(env, deadline) {'') > 0 THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('metric-lever-anchor-guard',
  'migrations/2026-10-19-breach-code-task-anchors.sql and migrations/code-anchor-once.test.mjs (BREACH-CODE-ANCHORS-1)',
  'the full suite run for migrations/ changes (SUITE-RUNNER-1), the worker sources on the checkout',
  'CI (migrations/code-anchor-once.test.mjs, run on every migrations/ or scripts/ change and, through SUITE-DEPENDENTS-1, on a PR that changes idea-hub, q08-signal-engine, qnfo-research-exec, qnfo-fleet-control or qnfo-code-orchestrator) fails when a code-task and code-anchor pair written to analytics_metric_triggers by a migration from BREACH-CODE-ANCHORS-1 on does not occur exactly once in its path, unless a later migration repoints or retires it; anchors of earlier migrations are NOTEs only; the lever sentence must sit inside the 300 characters the issue keeps',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'trigger 1238 carried an anchor with 0 occurrences for the code loop to find, and 3 breaches (9193, 5394, 5916) now name a path, an edit and an anchor that occurs once');

-- the decision (append-only), with a prediction decision_predictions_parse grades
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a breach whose lever is one code change in one worker names that lever, the path and an anchor that still occurs once, in the trigger text the code loop receives (ACT-BRIDGE-1)',
  'BREACH-CODE-ANCHORS-1: corrected the stale code-anchor of trigger 1238 and added a lever, a code-task and a code-anchor to triggers 9193, 5394 and 5916',
  'v_metric_trigger_state 2026-10-19 11:50Z: 51 breaching, 4 with a code-task line (breach_code_task_pct 7.7 to 7.8, floor 10). The 1238 anchor async function triageProposals(env) { occurs 0 times in idea-hub/worker.js on main and the (env, deadline) text occurs once. Each new anchor occurs once on main. ai_call_counters 24 h: qwen3.8-27b 89 of 114 errors. research_queue: 267 of 267 deferred rows are owner-corpus. paper_revision_log: 3 of 4 thin-paper writer calls returned 0 chars.',
  'merged through the canonical path, applied by the migration runner. Follow-up (OWNER-NO-LOOSE-ENDS-1): the open METRIC-TRIGGER issues 100045 (9193), 99943 (5394) and 99949 (5916) were filed before the lever and carry no code-task line, and evaluateMetricTriggers never rewrites an open issue or a reopened twin, so migrations/2026-10-19-breach-lever-issues.sql files one agent_issues row per lever for the code loop with a code-probe that closes it. Issue 99926 stays a monitoring-parked contract and closes through TRIGGER-RECOVERY-1; its probe is the recorded closing condition and the 1238 anchor is checked by the active detector fm-breach-anchor-stale',
  'four trigger action texts, one failure mode, one detector contract, one ledger row; no worker code and no VERSION',
  'the Rollback line of this file restores the trigger actions and notes from bak_20261019_breach_anchors',
  'three more breaches name a doer and an anchor that is checked in CI',
  'breach_code_task_pct >= 10 within 3 hours',
  'none',
  'd1:v_metric_trigger_state, analytics_metric_triggers, remediation_contracts, ai_call_counters, research_queue, paper_revision_log; code:idea-hub, q08-signal-engine, qnfo-fleet-control, qnfo-research-exec anchors'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BREACH-CODE-ANCHORS-1:%');
