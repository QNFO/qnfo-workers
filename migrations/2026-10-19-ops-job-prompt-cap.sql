-- OPS-JOB-PROMPT-CAP-1 (2026-10-19, charter pillar cost; agent_issues 2068, OPS-CONTEXT-COMPACT-3): doctrine bookkeeping for qnfo-ops 2.52.0.
-- The worker change: the async job loop (OpsExecWorkflow) counts the upstream's own usage.prompt_tokens and, when the tokens used so far plus the last
-- round's prompt reach OPS_JOB_PROMPT_CAP (700000), makes the next round the final one (no tools, BUDGET_EXHAUSTED_DIRECTIVE): the job answers from the
-- evidence it gathered and ends succeeded, where the dollar cap (JOB_BUDGET_EXCEEDED, 0.75 USD) fails the job. The same release sends a leaner tool list
-- (jobToolsPayload: same names and same parameters objects, background sentences of the descriptions dropped) on the job loop only.
-- Why: 2.50.5 (OPS-CONTEXT-COMPACT-2) bounded what one round carries but not the sum. Read 2026-10-19 from ops_ai_log: source job has 40 rows ever, three since
-- 2026-10-12 (677,324; 119,355; 1,593,580 prompt tokens, the last job-27a22cfb02c6a5 under 2.39.2) and none since the 2.50.5 deploy at 13:23:03Z, so the
-- closing probe of issue 2068 (contract issue-2068: three job rows since that deploy, max under 800000, ok share not lower) cannot pass or fail on traffic
-- alone. The audit of 2026-10-19 measured the fixed prefix of a round (system prompt plus 69 tool schemas) at about 9.5k tokens, so 41 rounds are about 390k, and
-- its replay of the 2.50.5 loop on the job-27a22cfb02c6a5 shape lands at 0.78M to 0.86M. The cap makes the 800k line a property of the code: the worst case is the cap plus one tool-less final round.
-- control_registry (doctrine section on holds, caps and gates): the cap is a keep. It is not on a critical path (a job that never reaches it behaves as before),
-- its alternate is the path that already existed, the 40-turn wrap-up and the dollar cap, and it never fails a job: it turns a would-be overrun into an answer.
-- Tested alternate (repair after review): a control row with an alternate_path, no alternate_tested_at, no ALTERNATE-NOT-EXERCISABLE marker and no control_alternate_probes row is
-- what the detector fm-control-alternate-undrilled counts (v_control_alternate_untested.controls_untested_without_probe, read 1 on 2026-10-19 22:3xZ, SELECT only; the
-- 'alternate-untested' rows of v_path_coverage_violations), so this file gives the control its probe in the same change, in the shape of
-- migrations/2026-10-19-ensure-live-path-controls.sql. The alternate leaves a trace in D1, so a read can observe it and the drill stamps alternate_tested_at on a pass (this file never does).
-- The probe asks two things of the 40-turn wrap-up, the final round the new ceiling reuses: a cloud_ops_events row kind ops_tool_budget_bail, text job-workflow, at iteration 40 of 40,
-- and a job-workflow ops_ai_log row with ok = 1 within 2 minutes after it, which is the job ending with an answer. Read 2026-10-19 (SELECT only): two such pairs, 2026-10-06T07:53:58Z (job
-- job-c7bea3a927f135, answered 2.3 seconds later) and 2026-10-17T18:01:49Z (job-27a22cfb02c6a5, answered 8.1 seconds later), and the probe SQL returns expected ok, observed ok against
-- qnfo-audit. The event is rare, so its look-back is not a rolling window (a window of 120 minutes would fail on absence, which is not evidence either way); retention_prune_tick does not
-- prune this kind. The dollar cap half of the alternate left its own trace, ops_ai_log 2026-10-06T07:58:14Z ending JOB_ERROR: JOB_BUDGET_EXCEEDED, and is not probed here.
-- decision_log is append-only (trigger decision_log_no_delete), so the Rollback below removes the probe row and the control row only and leaves the decision row: the decision was
-- taken and stays on the record, with its revert path in the row. The predicted_outcome has no 'within' clause on purpose: the closing check is the existing
-- contract issue-2068, and decision_predictions_parse only reads a 'metric <op> <value> within N h' form.
-- Failure mode, detector and capability (repair after review): the root cause here is not the one failure_modes already holds as ops-agent-history-resend (2.50.5: what one round
-- carries). It is the sum: rounds that are each inside their own bound still resend a fixed prefix of about 9.5k tokens (system prompt and 69 tool schemas) on each of up to 41 rounds,
-- which is 0.78M to 0.86M on the job-27a22cfb02c6a5 shape. The existing code-read detector fm-ops-agent-history-resend checks only truncateToContext(msgs, OPS_ROUND_INPUT_BUDGET_TOKENS + 4096,
-- { hard: true }), so it cannot see the ceiling, and the runtime probe (contract issue-2068) is gated by traffic (last_verdict deferred, 373 attempts, 3 job rows since 2026-10-12, none since the
-- release), so nothing on main would watch the ceiling until three real jobs arrive. This file therefore adds (a) the failure_modes row ops-job-prompt-sum, (b) the code-read contract
-- fm-ops-job-prompt-sum, which reads qnfo-ops/worker.js on main for the line that ends the tools of a round at the ceiling (const withTools = turn < maxTurns && !_promptCapHit;, one
-- occurrence): a different signal from the runtime probe, which stays the measure of the outcome, and (c) the capability_ledger row ops-job-ends-at-prompt-ceiling (DOCTRINE-1 revision 2: a decision
-- the worker now takes on its own, the reason for the minor bump). The sibling migration 2026-10-19-ops-context-compact-2.sql shipped the same pair of rows for 2.50.5.
-- Idempotent: each INSERT is guarded by NOT EXISTS or is INSERT OR IGNORE on the row key (control, class, fm_key, capability), so a replay changes nothing. No DELETE or DROP in the body. No ops_config value or table schema changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM capability_ledger WHERE capability = 'ops-job-ends-at-prompt-ceiling'; DELETE FROM remediation_contracts WHERE class = 'fm-ops-job-prompt-sum'; DELETE FROM failure_modes WHERE fm_key = 'ops-job-prompt-sum'; DELETE FROM control_alternate_probes WHERE control = 'ops-job-prompt-cap'; DELETE FROM control_registry WHERE control = 'ops-job-prompt-cap'

INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
SELECT 'ops-job-prompt-cap', 'qnfo-ops/worker.js job loop (OpsExecWorkflow.run): OPS_JOB_PROMPT_CAP and opsJobPromptCapReached, env OPS_JOB_PROMPT_CAP', 'cap',
 'an async ops job that resends its transcript and about 9.5k tokens of system prompt and tool schemas on each of up to 41 rounds and so sends more than 800000 prompt tokens (1,593,580 on 2026-10-17 under 2.39.2; a replay of 2.50.5 on the same shape reads 0.78M to 0.86M)',
 0, 'keep', 'applied',
 'maxTurns = 40 wrap-up (BUDGET_EXHAUSTED_DIRECTIVE final round) and the per-job dollar cap JOB_BUDGET_EXCEEDED (0.75 USD) still bound a job; the ceiling is one more path to the same final round, and OPS_JOB_PROMPT_CAP raises it without a code change',
 NULL,
 'issue 2068 (OPS-CONTEXT-COMPACT-3), qnfo-ops 2.52.0. Source-level proof in qnfo-ops/context-compact.test.mjs: the real OpsExecWorkflow.run against a stubbed upstream that reports 25000 prompt tokens a round makes 28 upstream calls, the 28th without tools, logs 700000 prompt tokens, ends succeeded and records ops_tool_budget_bail with reason prompt-cap. Closing probe: contract issue-2068. Detector on main: code-read contract fm-ops-job-prompt-sum (failure_modes row ops-job-prompt-sum). Tested alternate: control_alternate_probes row ops-job-prompt-cap (the 40-turn wrap-up has fired in production and ended a job with an answer: ops_tool_budget_bail job-workflow at iteration 40 of 40 on 2026-10-06 and 2026-10-17, each followed within 2 minutes by an ok job-workflow ops_ai_log row); the chaos drill runs it and stamps alternate_tested_at on a pass.',
 2068
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'ops-job-prompt-cap');

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.kind = ''ops_tool_budget_bail'' AND e.text = ''job-workflow'' AND instr(e.meta, ''"iter":40,"maxIters":40'') > 0) THEN ''no ops_tool_budget_bail event of the job-workflow loop at iteration 40 of 40 is on record, so the 40-turn wrap-up has not been seen to fire'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events e JOIN ops_ai_log l ON l.source = ''job'' AND l.strategy = ''job-workflow'' AND l.ok = 1 AND julianday(l.ts) - julianday(e.ts) BETWEEN 0 AND 2.0 / 1440 WHERE e.kind = ''ops_tool_budget_bail'' AND e.text = ''job-workflow'' AND instr(e.meta, ''"iter":40,"maxIters":40'') > 0) THEN ''no job-workflow job ended with an answer within 2 minutes of a 40-turn wrap-up'' ELSE ''ok'' END AS observed',
  '2 minutes between a 40-turn wrap-up event and the ok job-workflow row that ends the job (the two live pairs are 2.3 and 8.1 seconds apart); no rolling window on the event itself: the wrap-up is rare (two job-workflow events, 2026-10-06T07:53:58Z and 2026-10-17T18:01:49Z, both at iteration 40 of 40) and a window of 120 minutes would fail on absence, so the probe asks that the alternate has fired and carried a job to an answer, and the drill stamps alternate_tested_at only on that pass; retention_prune_tick does not prune kind ops_tool_budget_bail',
  1
FROM control_registry c WHERE c.control = 'ops-job-prompt-cap';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ops-job-prompt-sum',
  'one owner job still costs 0.78M to 0.86M prompt tokens although every round is inside its own bound, because each of up to 41 rounds resends a fixed prefix of about 9.5k tokens (system prompt and 69 tool schemas) and nothing bounds the sum',
  'OPS-CONTEXT-COMPACT-2 (2.50.5) holds what one round carries to 32,000 estimated tokens, but no limit sat on the total over the rounds of a job: the fixed prefix of about 9.5k tokens, measured 2026-10-19 on mobile agent-tools rows (46 to 411 character prompts logging 9,267 to 9,608 prompt tokens), is about 390k over 41 rounds before any history, and the audit replay of the 2.50.5 loop on the job-27a22cfb02c6a5 shape lands at 0.78M to 0.86M; the runtime probe of issue 2068 needs three job rows since the release, so it cannot see the sum until real jobs arrive (3 job rows since 2026-10-12)',
  'qnfo-ops 2.52.0 OPS-JOB-PROMPT-CAP-1: the job loop (OpsExecWorkflow.run) adds the upstream usage.prompt_tokens and, when the total plus the last round prompt reaches OPS_JOB_PROMPT_CAP (700000), makes the next round the final tool-less one (BUDGET_EXHAUSTED_DIRECTIVE), so the job answers from its evidence and ends succeeded; jobToolsPayload sends the same 69 tool names and parameters objects with shorter descriptions on the job loop only (36,193 to 33,805 characters); qnfo-ops/context-compact.test.mjs runs the real loop against a stub that reports 25000 prompt tokens a round: 28 upstream calls, the 28th without tools',
  'qnfo-ops/worker.js on main ends the tools of a job round at the prompt ceiling: const withTools = turn < maxTurns && !_promptCapHit; (code-read contract fm-ops-job-prompt-sum, read by the consumer from its checkout of main; the runtime measure of the outcome stays contract issue-2068)',
  'fm-ops-job-prompt-sum', '2026-10-19', 2068,
  'an async ops job of 30 or more tool rounds on any upstream, each round carrying the system prompt and the tool list',
  'ops_ai_log source job prompt_tokens at or above 800000 for one job whose rounds are each inside the 32,000-token round bound; JOB_BUDGET_EXCEEDED on a job that was still making progress',
  'AI spend of the ops agent job loop and the jobs that end ok = 0 at the 0.75 USD per-job cap; chat, code mode and the AgenticOpsExec agent are not on this loop');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ops-job-prompt-sum', NULL, 'OPS-CONTEXT-COMPACT-3', 'failure-mode detector',
  '{"paths":["qnfo-ops/worker.js"],"contains":"const withTools = turn < maxTurns && !_promptCapHit;"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'session-probe', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('ops-job-ends-at-prompt-ceiling', 'migrations/2026-10-19-ops-job-prompt-cap.sql (OPS-JOB-PROMPT-CAP-1, qnfo-ops 2.52.0)',
  'qnfo-ops 2.52.0 deployed; no new binding, secret or table; OPS_JOB_PROMPT_CAP defaults to 700000 and an env value overrides it',
  'the async job loop ends itself from the evidence it gathered: when the prompt tokens the upstream reports reach the ceiling, the next round is the final tool-less one and the job ends succeeded, where the dollar cap fails it; it never fails a job and a job that stays under the ceiling behaves as before; code-read detector fm-ops-job-prompt-sum',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'the 800000 prompt-token line of issue 2068 is a property of the code and not of the traffic: ops_ai_log source job had 1,593,580 prompt tokens in one job on 2026-10-17 and three job rows since 2026-10-12; qnfo-ops/context-compact.test.mjs shows 28 upstream calls, the 28th without tools, at 25000 prompt tokens a round');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
 'a job that has already sent 700000 prompt tokens is better ended with an answer from the evidence it gathered than run on to 41 rounds or failed on the dollar cap, and a tool description loses nothing the model needs when only its background sentences go',
 'OPS-JOB-PROMPT-CAP-1: qnfo-ops 2.52.0 ends an async job loop at a deterministic prompt-token ceiling (OPS_JOB_PROMPT_CAP 700000, final tool-less round, job succeeded) and sends jobToolsPayload (same tool names and parameters objects, shorter descriptions) on the job loop only; migrations/2026-10-19-ops-job-prompt-cap.sql adds the control_registry row and its control_alternate_probes row (the 40-turn wrap-up has fired in production and ended a job with an answer), the failure_modes row ops-job-prompt-sum with its code-read detector fm-ops-job-prompt-sum, and the capability_ledger row ops-job-ends-at-prompt-ceiling',
 'ops_ai_log source job, read in this session: 40 rows ever, three since 2026-10-12 (677,324; 119,355; 1,593,580 prompt tokens), none since the 2.50.5 deploy at 2026-10-19T13:23:03Z and no row of any source at or above 100000 prompt tokens since then; contract issue-2068 reads deferred; the audit of 2026-10-19 found mobile agent-tools rows on deepseek-v4-flash with 46 to 411 character prompts logging 9,267 to 9,608 prompt tokens, so the fixed prefix is about 9.5k a round; tool list measured from the source: 36,193 characters (69 tools, descriptions 13,525) before and 33,805 after',
 'applied through the canonical path on merge; the ceiling runs in the deployed worker for every new async job',
 'qnfo-ops async job loop (OpsExecWorkflow) only; chat, code mode and the AgenticOpsExec agent keep toolsPayload and their own budgets; no table schema, ops_config value or other worker changes',
 'revert qnfo-ops 2.52.0 through the canonical path, or set OPS_JOB_PROMPT_CAP above 700000 to raise the ceiling; the migration Rollback header removes the capability_ledger row, the detector contract, the failure_modes row, the control_alternate_probes row and the control_registry row (decision_log is append-only and keeps this row)',
 'an async ops job ends itself from the evidence it gathered at a deterministic prompt-token ceiling, so the 800000 line is a property of the code and not of the traffic',
 'max job prompt_tokens < 800000 (contract issue-2068: at least 3 job rows since 2026-10-19T13:23:03Z, ok share not below the job rows before the compaction release)',
 'none',
 'the real OpsExecWorkflow.run, its job loop and tool execution, against a stubbed upstream and node:sqlite (qnfo-ops/context-compact.test.mjs, killed by the pre-change worker), the 69-tool payload against the full one, the migration (migrations/ops-job-prompt-cap.test.mjs), the alternate probe run read-only against qnfo-audit on 2026-10-19 (expected ok, observed ok: two wrap-up events at iteration 40 of 40, each followed within 2 minutes by an ok job-workflow row)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OPS-JOB-PROMPT-CAP-1:') = 1);
