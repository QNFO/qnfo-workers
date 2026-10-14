-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-companion-single-writer-family'; DELETE FROM failure_modes WHERE fm_key = 'companion-single-writer-family'; DELETE FROM decision_log WHERE instr(action, 'COMPANION-WRITER-FAMILY-20261014:') = 1; DELETE FROM decision_predictions WHERE origin = 'seeded' AND subject = 'companion_hours_since_last_piece' AND due_at = '2026-10-15T09:00:00Z'
-- WRITER-FAMILY-1 (2026-10-14, pillar personal; agent_issues 2552). personal-companion 1.25.0 (same pull request): deepseek-v4-pro writes
-- and edits first with its reasoning off; gpt-oss-120b stays the per-request fallback. A critic never reads a draft its own family wrote
-- or edited. ops_config companion_writer = gpt-oss restores the old order without a deploy. This adds the failure mode with a code-read
-- detector, the decision, and a seeded prediction for the calibration scorer.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-single-writer-family', 'every companion draft came from one fallback writer, gpt-oss-120b, and the critic rejected all of them whatever the topic, prompt or repair',
  'the DeepSeek API writer has been unfunded since 2026-10-05 (owner decision, #1986), so the Workers AI chain answered every writer call with its first model, gpt-oss-120b; the critic chain could also fall through to the writer''s own family',
  'WRITER-FAMILY-1 (personal-companion 1.25.0): deepseek-v4-pro writes first with reasoning off, gpt-oss-120b is the fallback, critics skip every family that wrote or edited the draft, and ops_config companion_writer = gpt-oss reverts',
  'personal-companion/worker.js on main leads the writer chain with deepseek-v4-pro', 'fm-companion-single-writer-family', '2026-10-14', 2552,
  'a companion run while the DeepSeek API writer is unfunded', 'companion_runs 2026-10-13 00:02 to 2026-10-14 02:11 UTC: 111 rejected drafts, every one model @cf/openai/gpt-oss-120b', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-single-writer-family', NULL, 'WRITER-FAMILY-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "var WRITER_LEAD = \"@cf/deepseek-ai/deepseek-v4-pro-0813\";"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'when one writer model fails 111 drafts in a row under four kinds of prompt and repair change, the writer is the variable left to change; a stronger model of a third family, run without reasoning, can follow the grounding rules that gpt-oss-120b did not',
  'COMPANION-WRITER-FAMILY-20261014: personal-companion 1.25.0 writes and edits with deepseek-v4-pro first (reasoning off, gpt-oss-120b fallback), critics skip the author families, ops_config companion_writer = gpt-oss reverts without a deploy',
  'companion_runs model column: 111 of 111 rejected drafts from 2026-10-13 00:02 to 2026-10-14 02:11 UTC by @cf/openai/gpt-oss-120b; ai_call_counters 2026-10-12 to 14: deepseek-v4-pro 177 neurons per 1k tokens, gpt-oss-120b 42, kimi-k2.6 114 with 28 errors in 162 calls; BANNED_MODELS excludes -flash writers',
  'merged through the canonical path', 'companion writing quality and about 2000 neurons per draft while the stall lasts', 'ops_config companion_writer = gpt-oss, or the revert of personal-companion 1.25.0',
  'the companion is no longer bound to one writer family, and no draft is judged by its own family',
  'a companion piece is published by 09:00 UTC 2026-10-15 (companion_hours_since_last_piece under 24 at that time)',
  'reading.q08.org publishes again', 'd1:personal-life companion_runs, qnfo-audit ai_call_counters; code:personal-companion CF_FALLBACK, BANNED_MODELS, callWorkersAI'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-WRITER-FAMILY-20261014:') = 1);
INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT id, 'metric', 'companion_hours_since_last_piece', '<', 24, '2026-10-15T09:00:00Z', 'seeded' FROM decision_log WHERE instr(action, 'COMPANION-WRITER-FAMILY-20261014:') = 1;
