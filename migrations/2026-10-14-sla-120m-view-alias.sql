-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_view_alias
-- Rollback: recreate v_sla_over_120m from migrations/2026-10-14-sla-120m.sql (its total reads wrong; prefer leaving this file applied)
--
-- SLA-120M-VIEW-ALIAS-1 (follow-up to SLA-120M-1, PR 1247; charter pillar autonomy). v_sla_over_120m joined v_stuck_summary AS s and
-- a derived table AS i, but v_stuck_summary's own subqueries use the aliases s (research_review_seen s) and i (agent_issues i).
-- When SQLite flattens the views into one query, those inner subqueries resolved s and i to the outer tables, so total_over_120m
-- read 454 while its columns summed to 117 (read 2026-10-14 04:12Z: 104 open issues over 120 minutes, 12 outreach rows waiting, 1
-- code task queued for 840 minutes). The same sum with aliases no inner query uses reads 117. Every alias here is unique (vsla_*).
-- spof-review: one view is replaced; no trigger, cron or credential

CREATE TABLE IF NOT EXISTS bak_20261014_sla_view_alias AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_sla_over_120m';

DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT vsla_s.*, vsla_k.*, vsla_x.issues_open_over_120m, vsla_x.oldest_open_issue_min,
  vsla_x.issues_open_over_120m + vsla_s.research_review_error + vsla_s.research_head_stalled + vsla_s.research_queued_180m
    + vsla_s.intents_pending + vsla_s.outreach_waiting + vsla_s.code_tasks_stalled + vsla_s.issues_without_doer_3h
    + vsla_s.zenodo_exit_pending_stalled + vsla_s.research_held_over_sla + vsla_s.triage_gap + vsla_s.contracts_cadence_drift
    + (CASE WHEN vsla_s.code_tasks_queued_oldest_min > 120 THEN 1 ELSE 0 END)
    + vsla_k.predictions_unscored_over_sla + vsla_k.doctrine_proposals_waiting AS total_over_120m
FROM v_stuck_summary vsla_s, v_stuck_summary_kernel vsla_k,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) vsla_x;

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('view-alias-capture',
 'a view that joins another view under an alias the inner view also uses computes an expression over the wrong rows',
 'SQLite flattens nested views into one query; a correlated subquery in the inner view then resolves its alias to the outer table',
 'aliases unique across the nested views (vsla_*); the fm-view-alias-capture detector compares the total with the sum of its own columns',
 'v_sla_over_120m.total_over_120m equals the sum of the columns it adds',
 'fm-view-alias-capture', '2026-10-14', NULL,
 'an outer alias such as s, i, a, c or q that an inner view also uses',
 'total_over_120m read 454 while its columns summed to 117',
 'every view built on v_stuck_summary or another view with correlated subqueries');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-view-alias-capture', NULL, 'SLA-120M-VIEW-ALIAS-1', 'failure-mode detector',
 'SELECT ''1'' AS expected, CASE WHEN total_over_120m = issues_open_over_120m + research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h + zenodo_exit_pending_stalled + research_held_over_sla + triage_gap + contracts_cadence_drift + (CASE WHEN code_tasks_queued_oldest_min > 120 THEN 1 ELSE 0 END) + predictions_unscored_over_sla + doctrine_proposals_waiting THEN ''1'' ELSE ''0'' END AS observed FROM v_sla_over_120m',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);
