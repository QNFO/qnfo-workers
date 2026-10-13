-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_v_stuck_summary
-- Rollback: UPDATE research_queue SET status = 'queued', error = NULL WHERE status = 'deferred'; DROP VIEW IF EXISTS v_stuck_summary; -- then recreate it from bak_20261013_v_stuck_summary.sql; DELETE FROM metric_registry WHERE metric = 'research_deferred_pool'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'research_deferred_pool'; UPDATE queue_sla SET auto_fix = 'none automatic yet: the second executor path is RESEARCH-THROUGHPUT-1 (#2175); the stuck metric carries the breach', definition = 'status queued for more than 180 min (the executor cannot drain the queue)' WHERE stuck_type = 'research-queued-age'
-- RESEARCH-BACKPRESSURE-1 + STUCK-VIEW-SLA-PARITY-1 (2026-10-13, agent_issues 2193 METRIC-TRIGGER-3059-STUCK-ITEMS-OVER-SLA,
-- pillars research and autonomy). stuck_items_over_sla read 96 at 05:30 UTC: research_queued_180m 78 plus outreach_waiting 16.
-- (1) research: idea-hub admits 24-38 accepted proposals a day straight into research_queue while qnfo-research-exec publishes
--     22-31 a day; the queue stood at 85 queued, so every row waited about 3.5 days and the 180-minute SLA could never hold.
--     qnfo-fleet-control 0.24.0 (same pull request) keeps at most research_ready_cap rows queued (default 3, about three hours
--     of throughput), chosen by priority, and holds the rest as status deferred, released in the same order as slots free.
--     research_ready stamps when a row last became ready; research_queued_180m now measures the wait for an executor from
--     that moment. The pool is not hidden: metric research_deferred_pool counts it and its trigger fires when intake outruns
--     throughput.
-- (2) outreach: OUTREACH-SLA-CYCLE-1 (2026-10-12) set queue_sla outreach-needs-email to 4380 minutes (73 h, one weekday run
--     across a weekend) because jobOutreach runs once a weekday, but v_stuck_summary.outreach_waiting still counted rows older
--     than 180 minutes, so every candidate inside its SLA read as stuck. The view now uses the queue_sla definition: older than
--     73 h, or after 3 failed lookups.
-- Every other column of the view is unchanged.
CREATE TABLE IF NOT EXISTS research_ready (id TEXT PRIMARY KEY, ready_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bak_20261013_v_stuck_summary AS SELECT name, sql FROM sqlite_master WHERE name = 'v_stuck_summary';
DROP VIEW IF EXISTS v_stuck_summary;
CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued'
     AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-180 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND (datetime(created_at) < datetime('now', '-4380 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-180 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes')) AS research_held_over_sla,
  (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap,
  (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
     WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL
       AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift;

UPDATE queue_sla SET definition = 'status queued for more than 180 min since the row last became ready (research_ready.ready_at; created_at when unstamped): the executor did not take a ready row within about three hours of throughput',
  auto_fix = 'RESEARCH-BACKPRESSURE-1 (qnfo-fleet-control 0.24.0, 20-minute tick): at most research_ready_cap rows (default 3) stay queued, by priority (remediation, owner-authored, score, age); the rest wait as status deferred and are released as slots free; revert: ops_config research_backpressure = off releases the pool'
WHERE stuck_type = 'research-queued-age';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('research_deferred_pool', 'operational', 'leading',
  'research_queue rows in status deferred: accepted research waiting for an executor slot behind the bounded ready queue (RESEARCH-BACKPRESSURE-1). It grows when idea-hub admits more than qnfo-research-exec publishes.',
  'qnfo-audit.research_queue; written by qnfo-fleet-control researchBackpressureTick every 20 minutes', 'about 82 at the first tick on 2026-10-13 (the backlog that was queued)', '<= 60', 'qnfo-fleet-control', 'idea-hub', '20m', '> 60', '> 120', NULL, NULL, 'REGISTERED', 'computed');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'research_deferred_pool', 'Research intake outruns throughput: the deferred pool is above 120', 'registry', 'gt', 120, 3,
  'Pillar research (RESEARCH-BACKPRESSURE-1). The pool grows only when idea-hub accepts more proposals a day than qnfo-research-exec publishes (compare SELECT substr(created_at,1,10) d, COUNT(*) FROM research_queue GROUP BY d with SELECT substr(published_at,1,10) d, COUNT(*) FROM research_queue WHERE published_at IS NOT NULL GROUP BY d). Levers in order: (1) raise the idea-hub acceptance bar for generated proposals (owner-authored ideas stay exempt); (2) raise qnfo-research-exec RESEARCH_PARALLEL_MAX when the AI spend metrics are inside target; (3) cut stages that end in revise-noop or review-unresolved loops. DoD: research_deferred_pool <= 120 and falling for 3 days.',
  'idea-hub', 'agent_issues', 24, 1, 'RESEARCH-BACKPRESSURE-1 (migrations/2026-10-13-02-research-backpressure.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'research_deferred_pool');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('unbounded-ready-queue', 'a work queue admits faster than its executor drains, so every item ages past its SLA',
  'idea-hub enqueued every accepted proposal into research_queue (24-38 a day) while the executor published 22-31 a day; at 85 queued the claim order became first-in-first-out and every row waited about 3.5 days',
  'RESEARCH-BACKPRESSURE-1: a bounded ready queue (research_ready_cap) chosen by priority, a visible deferred pool released as slots free, and an SLA measured from readiness',
  'fm-unbounded-ready-queue: no more than research_ready_cap + 1 rows queued', 'fm-unbounded-ready-queue', '2026-10-13',
  'research_queued_180m 78, stuck_items_over_sla 96', 'every accepted idea waits days; the best-scored ideas wait as long as the worst');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-unbounded-ready-queue', NULL, 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''queued'') <= COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''research_ready_cap''), 3) + 1 OR COALESCE((SELECT value FROM ops_config WHERE key = ''research_backpressure''), ''on'') = ''off'' THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 1, 'active', 'RESEARCH-BACKPRESSURE-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('stuck-view-sla-drift', 'a stuck-item view counts a queue against a different SLA than its queue_sla row',
  'OUTREACH-SLA-CYCLE-1 changed queue_sla outreach-needs-email to 4380 minutes; v_stuck_summary.outreach_waiting kept 180 minutes, so 16 candidates inside their SLA read as stuck',
  'STUCK-VIEW-SLA-PARITY-1: the view uses the queue_sla definition (73 h or 3 failed lookups)',
  'fm-stuck-view-sla-drift: the view text names 4380 minutes for outreach while queue_sla says 4380', 'fm-stuck-view-sla-drift', '2026-10-13',
  'outreach_waiting 16 with every row inside its SLA', 'a breach metric that no fix can move');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-stuck-view-sla-drift', NULL, 'SELECT ''1'' AS expected, CASE WHEN (SELECT sla_min FROM queue_sla WHERE stuck_type = ''outreach-needs-email'') = 4380 AND (SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary'') LIKE ''%-4380 minutes%'' THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 1, 'active', 'STUCK-VIEW-SLA-PARITY-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a ready queue longer than about three hours of throughput only ages its items; backpressure by priority beats first-in-first-out (ANTIFRAGILE-1: a rate, not a hold)',
   'RESEARCH-BACKPRESSURE-1 + STUCK-VIEW-SLA-PARITY-1: bounded research ready queue (cap 3) with a visible deferred pool released by priority, SLA measured from readiness, research_deferred_pool metric and trigger; outreach_waiting uses its documented 73 h SLA',
   'research_queue 2026-10-13 05:40 UTC: 85 queued, 4 researching; published per day 22-31 (10-09..10-12) against admitted 24-38; v_stuck_summary research_queued_180m 78, outreach_waiting 16 while queue_sla outreach SLA is 4380 min',
   'merged with qnfo-fleet-control 0.24.0 through the canonical path', 'research_queue statuses (queued <-> deferred), the stuck view', 'ops_config research_backpressure = off, then the Rollback line of this file',
   'the research executor always picks the best ready idea; the stuck metric measures executor latency; the backlog is a named, measured pool',
   'within 40 minutes of the deploy research_queued_180m reads 0 and outreach_waiting reads the true count of rows past 73 h; stuck_items_over_sla falls from 96 to under 10', 'none', 'd1:qnfo-audit research_queue, queue_sla, outreach_queue');
