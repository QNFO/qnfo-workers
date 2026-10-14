-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m
-- Rollback: restore queue_sla.cycle_min/sla_min/definition and sla_registry.window/threshold from bak_20261014_sla_120m (kind 'queue_sla' / 'sla_registry'); recreate v_stuck_summary and v_stuck_summary_kernel from its kind 'view' rows; DROP VIEW v_sla_over_120m; DELETE the sla_breaches_over_120m rows from metric_registry and analytics_metric_triggers
--
-- SLA-120M-1 (charter pillar autonomy). Owner directive 2026-10-14, verbatim: "All SLAs systemwide across the fleet shall be
-- measured in 10-minute intervals/resolution, never hours or days. No SLA shall ever exceed 120 minutes and action shall commence
-- immediately >120 minutes to audit and remediate all such failure modes and their root causes."
-- Inventory before this file (read 2026-10-14 04:05Z): nine queue_sla SLAs above 120 minutes (outreach-needs-email 4380,
-- issue-over-a-day 1440, doctrine-proposal-waiting 1440, research-held 360, code-task-stalled 180, issue-unremediated 180,
-- research-queued-age 180, zenodo-exit-pending 180, closure-relapse 180); measuring cycles of 15, 60 and 1440 minutes; sla_registry
-- windows of 6 h, 24 h, 7 d and 30 d; and breach actions (evaluateMetricTriggers, slaEscalate) on the hourly tick only.
-- This file: every queue SLA is at most 120 minutes on a 10-minute cycle; the stuck-item views apply the same caps (the D1 trigger
-- queue_sla_tick_10m already refreshes stuck_items_over_sla from v_stuck_summary every 10 minutes, so no trigger changes);
-- v_sla_over_120m counts everything past 120 minutes in one row; metric sla_breaches_over_120m (refreshed every 10 minutes by
-- qnfo-fleet-control 0.30.0 SLA-TICK-10M-1, which also moves the breach actions to the 10-minute tick) and its trigger start the
-- audit and remediation at the first 10-minute tick past 120 minutes. Column names of v_stuck_summary are kept (its readers and the
-- trigger sum them by name); their thresholds are now at most 120 minutes, as queue_sla.definition states.
-- Aggregation windows of rates (issue_drain_ratio_24h, a 30-day success rate) are not SLAs and are unchanged.
-- spof-review: no trigger, cron or credential is added; the 10-minute refresh has a second reader in stuck_items_over_sla (D1 trigger queue_sla_tick_10m)

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m AS
  SELECT 'queue_sla' AS kind, stuck_type AS k, cycle_min AS a, sla_min AS b, definition AS text FROM queue_sla
  UNION ALL SELECT 'sla_registry', sla_id, NULL, NULL, window || ' | ' || threshold FROM sla_registry
  UNION ALL SELECT 'view', name, NULL, NULL, sql FROM sqlite_master WHERE type = 'view' AND name IN ('v_stuck_summary', 'v_stuck_summary_kernel');

UPDATE queue_sla SET
  definition = definition || ' [SLA-120M-1 2026-10-14: SLA ' || sla_min || ' -> 120 min, measured every 10 min; owner directive: no SLA exceeds 120 minutes]',
  sla_min = 120
WHERE sla_min > 120;
UPDATE queue_sla SET cycle_min = 10 WHERE cycle_min > 10;

UPDATE sla_registry SET window = '120m', threshold = replace(threshold, 'per 24h', 'per 120m')
WHERE window IN ('6h', '24h', '7d', '30d');

DROP VIEW IF EXISTS v_stuck_summary;
CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued'
     AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla,
  (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap,
  (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
     WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL
       AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift,
  (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min;

DROP VIEW IF EXISTS v_stuck_summary_kernel;
CREATE VIEW v_stuck_summary_kernel AS
SELECT
  (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS predictions_unscored_over_sla,
  (SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS doctrine_proposals_waiting,
  (SELECT COUNT(*) FROM tick_runs WHERE ok = 0 AND tick_id = (SELECT MAX(tick_id) FROM tick_runs)) AS tick_steps_missed_last_slot;

DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT s.*, k.*, i.issues_open_over_120m, i.oldest_open_issue_min,
  i.issues_open_over_120m + s.research_review_error + s.research_head_stalled + s.research_queued_180m + s.intents_pending
    + s.outreach_waiting + s.code_tasks_stalled + s.issues_without_doer_3h + s.zenodo_exit_pending_stalled + s.research_held_over_sla
    + s.triage_gap + s.contracts_cadence_drift + (CASE WHEN s.code_tasks_queued_oldest_min > 120 THEN 1 ELSE 0 END)
    + k.predictions_unscored_over_sla + k.doctrine_proposals_waiting AS total_over_120m
FROM v_stuck_summary s, v_stuck_summary_kernel k,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) i;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor,
  refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
('sla_breaches_over_120m', 'operational', 'target',
 'v_sla_over_120m.total_over_120m: open issues older than 120 minutes plus every queue item, prediction and proposal past its SLA (each SLA at most 120 minutes, SLA-120M-1).',
 'qnfo-audit.v_sla_over_120m (migrations/2026-10-14-sla-120m.sql), refreshed every 10 minutes by qnfo-fleet-control SLA-TICK-10M-1',
 '105 open issues older than 120 minutes at 2026-10-14 04:05Z, before this file', '0', 'qnfo-fleet-control',
 'trigger gt 0 -> one METRIC-TRIGGER issue at the first 10-minute tick past 120 minutes, naming the oldest items and their levers',
 '*/10', '> 0', '> 20', 'UNMEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'sla_breaches_over_120m', 'SLA breach: items past 120 minutes (10-minute resolution)', 'registry', 'gt', 0, 1,
  'Pillar autonomy (SLA-120M-1, owner directive 2026-10-14: no SLA exceeds 120 minutes; action starts immediately past 120 minutes to audit and remediate every such failure mode and its root cause). Read SELECT * FROM v_sla_over_120m, then SELECT id, title, age_min FROM v_issue_age WHERE age_min > 120 ORDER BY age_min DESC LIMIT 20 and SELECT * FROM queue_sla. For each item past 120 minutes, in queue order: (1) give it a doer at once: a code-task line with a code-anchor for a one-file fix, a named loop with its lever, or a work claim; (2) find why it outlived 120 minutes (no doer, a doer that ran slower than the SLA, a probe that never ran, a cadence over 10 minutes) and record that root cause as a failure_modes row with an fm- detector; (3) fix the cadence or the lever so the class drains inside 120 minutes. Done when sla_breaches_over_120m is 0.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'SLA-120M-1: cooldown 2 h = the 120-minute SLA; evaluated every 10 minutes from qnfo-fleet-control 0.30.0'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'sla_breaches_over_120m');

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('sla-over-120m',
 'a queue item or open issue outlives 120 minutes, or an SLA is defined or measured coarser than the owner allows',
 'SLAs were set per queue in hours and days (up to 4380 minutes) and breach actions ran on the hourly tick',
 'SLA-120M-1: every SLA capped at 120 minutes on a 10-minute cycle; breach actions on the 10-minute tick; the sla_breaches_over_120m trigger files the audit at once',
 'metric sla_breaches_over_120m = 0 (v_sla_over_120m), refreshed every 10 minutes',
 NULL, '2026-10-14', NULL,
 'a doer slower than 120 minutes, no doer, or a measuring cycle over 10 minutes',
 '105 of 111 open issues older than 120 minutes at 04:05Z',
 'every queue and every open issue');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'an SLA is a deadline for an item or issue; rate windows (24 h drain ratio, 30 d success rate) are measurements, not SLAs',
 'SLA-120M-1: queue SLAs capped at 120 min on 10-min cycles, stuck views capped, sla_registry windows 120m, v_sla_over_120m, metric and trigger sla_breaches_over_120m',
 'inventory 04:05Z: nine queue SLAs over 120 minutes (max 4380), cycles up to 1440 minutes, registry windows up to 30 d, breach actions hourly',
 'applied by apply-migrations', 'queue_sla, sla_registry, two views, one new view, one metric and trigger', 'see the Rollback header',
 'every SLA is measured at 10-minute resolution and none exceeds 120 minutes',
 'sla_breaches_over_120m measured within 20 min', 'none', 'live D1 reads, offline view replay');
