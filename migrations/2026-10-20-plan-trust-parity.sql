-- PLAN-TRUST-PARITY-1 and PLAN-RELAPSE-BRIEF-1 (2026-10-20, charter pillar autonomy; agent_issues 100303, owner task op-mvg9vjkbaedc).
-- Owner task, verbatim: "Extend the planner so it accepts issues from every source the merge runner already trusts (reuse the merge runner's
-- trusted-source list rather than a new allowlist), and add handling for metric-relapse issues".
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = (SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261020T0630Z'), note = 'rolled back from PLAN-TRUST-PARITY-1' WHERE key = 'code_merge_trusted_sources' AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261020T0630Z'); DELETE FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261020T0630Z'; UPDATE issue_plans SET outcome = 'untrusted', detail = substr('re-armed by PLAN-TRUST-PARITY-1: ' || COALESCE(detail, ''), 1, 600) WHERE instr(COALESCE(detail, ''), 'PLAN-TRUST-PARITY-1 re-arm') > 0 AND outcome = 'untrusted'; DELETE FROM decision_log WHERE action LIKE 'PLAN-TRUST-PARITY-1:%';
-- spof-review: no new cron, binding or credential; the planner reads the ops_config row the merge runner already reads.
--
-- WHAT WAS READ (qnfo-audit, 2026-10-20 06:30Z)
--   The merge runner (qnfo-fleet-control cmTrusted) reads ops_config code_merge_trusted_sources: 18 live entries, among them session*, chat-session*,
--   owner-queue*, fi-executor, claude-chat*, chat:*, qnfo-code-orchestrator and qnfo-evolve|EVOLVE-1. The planner (qnfo-code-orchestrator) kept a
--   hardcoded subset of six, so every issue a session or an owner queue filed was recorded "untrusted" and never planned, although the merge runner
--   would merge its task: 69 of the 113 open issues older than 24 h with no doer were such rows (v_issue_age_ladder, plan_outcome untrusted).
--   qnfo-code-orchestrator 0.25.0 (same PR) reads this same row with the same grammar. This migration (1) adds the two entries the improvement loop's
--   own issues need, so a metric relapse can be planned and merged at all, and (2) re-arms the untrusted verdicts so the planner decides them again.
--
-- 1. The two relapse prefixes. Both are filed by qnfo-fleet-control (the improvement loop), whose issue text is the metric's name from
--    metric_registry, not text from outside the fleet, the same kind of origin as METRIC-TRIGGER-, REACH-IDEA- and TP-. The planner's deny list
--    (secrets, caps, deletions) and the merge runner's checks apply unchanged. Backup row first; the Rollback line restores it.
INSERT OR IGNORE INTO ops_config (key, value, note)
SELECT 'code_merge_trusted_sources--bak-20261020T0630Z', value, 'backup before PLAN-TRUST-PARITY-1 added the two metric-relapse prefixes'
FROM ops_config WHERE key = 'code_merge_trusted_sources';

UPDATE ops_config
SET value = value || ',qnfo-fleet-control|METRIC-FIX-RELAPSED-1:,qnfo-fleet-control|METRIC-REGRESSION-1:',
    note = 'PLAN-TRUST-PARITY-1 (2026-10-20, agent_issues 100303): the planner reads this same row; the two metric-relapse prefixes of the improvement loop added (backup key code_merge_trusted_sources--bak-20261020T0630Z)'
WHERE key = 'code_merge_trusted_sources'
  AND instr(value, 'METRIC-FIX-RELAPSED-1:') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261020T0630Z');

-- 2. Re-arm the verdicts the old list produced. issue_plans keeps one row per issue and re-plans a non-queued row once planned_at is older than
--    PLAN_RECHECK_DAYS; an untrusted verdict was not re-armed by ISSUE-AGE-24H-1 (re-reading untrusted text decides the same). It does now: the
--    list changed, so the verdict is stale. Up to 120 rows; the planner keeps its own daily cap and work-in-progress ceiling.
UPDATE issue_plans
SET planned_at = '2000-01-01T00:00:00Z',
    detail = substr('PLAN-TRUST-PARITY-1 re-arm (was untrusted at ' || planned_at || '): ' || COALESCE(detail, ''), 1, 600)
WHERE outcome = 'untrusted'
  AND instr(COALESCE(detail, ''), 'PLAN-TRUST-PARITY-1 re-arm') = 0
  AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id LIMIT 120);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'qnfo-workers-72',
  'the owner asked for exactly this (task op-mvg9vjkbaedc): the planner decides on the merge runner''s list, one list; an issue the merge runner would merge is an issue the planner may plan',
  'PLAN-TRUST-PARITY-1: qnfo-code-orchestrator 0.25.0 reads ops_config code_merge_trusted_sources; two metric-relapse prefixes added to it; untrusted verdicts re-armed; PLAN-RELAPSE-BRIEF-1: a relapse issue is planned from metric_registry and analytics_metric_triggers fields',
  'qnfo-audit 2026-10-20 06:30Z: 69 open issues older than 24 h with no doer carried plan_outcome untrusted; the live merge list has 18 entries, the planner had 6',
  'migration merged; qnfo-code-orchestrator 0.25.0 deployed through the canonical path',
  'the planner may now turn text from the sources already trusted by the merge runner into one-file code tasks; the deny list, the daily cap, the work-in-progress ceiling, PLAN_DENY_WORKERS (control plane) and the merge runner''s own gates are unchanged',
  'the Rollback header; ops_config code_merge_trusted_sources restores from its backup key; qnfo-code-orchestrator 0.24.2 reads its hardcoded default again',
  'one trusted-source list for planning and merging; metric relapses are planned from measured fields',
  'issues_over_24h_no_doer <= 100 within 24 h',
  0, 'unit suite plan-trust-parity.test.mjs, plan-window-trusted.test.mjs, a live read of the ops_config row and of v_issue_age_ladder'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PLAN-TRUST-PARITY-1:%');
