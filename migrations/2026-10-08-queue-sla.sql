-- QUEUE-SLA-1 (2026-10-08, pillar autonomy). Owner directive 2026-10-08, verbatim: "It is unacceptable for any item or
-- queue to ever be stuck for more than one run/cycle. The system shall establish rapid fixes and SLAs for automatic
-- remediation on all known issue types. No issue shall remain unprocessed/unremediated for greater than 3 hours. All SLAs
-- shall be measured in minutes and hours, never in days."
--
-- Measured 2026-10-08 13:50-14:20Z by session_01CWLpf5v1NjC9GXbM6rnH4k:
--   research_queue  one failing publish-stage row (status review, Zenodo 403) was picked first every */15 tick from
--                   2026-10-07T13:30Z and blocked 12 queued rows for 24 h (parkPoisonRow skips status review; #2170).
--   intents         2 rows pending since 2026-10-04 (untriaged noise); the chain read "healthy" because it counts, not ages.
--   outreach_queue  1 row needs-email since 2026-10-06.
--   agent_issues    94 of 136 open issues had no probe verdict in 3 h and 11 never had one: birth contracts carry
--                   expected_cadence_h 24 and qnfo-fleet-control evaluates at most 15 contracts per hourly tick.
--
-- What this file builds (all on Cloudflare; no session, no claude.ai schedule):
-- (1) queue_sla: every known queue with its cycle and SLA in MINUTES and the automatic fix; one row per stuck type.
-- (2) v_stuck_summary: one row, one column per stuck type, plus stuck_total. Ages are measured, never counts alone.
-- (3) The 10-minute fixer: an AFTER INSERT trigger on cron_fire_log for either fleet_crons 10-minute row
--     ('container-warmup-every-10min' or 'invest-decision-heartbeat-10m', two rows so one stopping is not a single point of
--     failure; every fix is idempotent, so both firing in one tick is harmless) applies each automatic fix, writes
--     one queue_sla_actions ledger row per fix that touched rows, and refreshes the two metrics below. ops_config
--     queue_sla_autofix = 'off' stops the fixes (measurement continues).
-- (4) Probe cadence: every remediation contract of an open issue is due hourly (expected_cadence_h 1), now and for every
--     contract born later (trigger); qnfo-fleet-control 0.11.5 evaluates up to 150 contracts per tick (was 15).
-- (5) Metrics stuck_items_over_sla and issues_unprobed_60m (target 0) with triggers that name the lever.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS queue_sla_tick_10m; DROP INDEX IF EXISTS idx_remediation_verifications_issue_ts; DROP TRIGGER IF EXISTS remediation_contracts_cadence_1h_ai; DROP VIEW IF EXISTS v_stuck_summary; DROP TABLE IF EXISTS queue_sla; DELETE FROM metric_registry WHERE metric IN ('stuck_items_over_sla', 'issues_unprobed_60m'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('stuck_items_over_sla', 'issues_unprobed_60m'); DELETE FROM ops_config WHERE key = 'queue_sla_autofix'; -- queue_sla_actions is the ledger and stays; rows changed by a fix carry their prior state in their error/triage text.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('queue_sla_autofix', 'on',
  'QUEUE-SLA-1 (migrations/2026-10-08-queue-sla.sql): on = the 10-minute fixer applies the queue_sla automatic fixes; off = measure only.',
  datetime('now'));

CREATE TABLE IF NOT EXISTS queue_sla (
  stuck_type TEXT PRIMARY KEY,
  queue TEXT NOT NULL,
  definition TEXT NOT NULL,
  cycle_min INTEGER NOT NULL,
  sla_min INTEGER NOT NULL,
  auto_fix TEXT NOT NULL,
  owner TEXT NOT NULL,
  summary_column TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_sla_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  stuck_type TEXT NOT NULL,
  n INTEGER NOT NULL,
  note TEXT
);

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column) VALUES
 ('research-review-error', 'research_queue', 'status review with an error, claimed more than 30 min ago (a failing publish that would be picked first every tick)', 15, 30,
  'park: status wontfix, stage parked, prior status and stage kept in error', 'qnfo-research-exec', 'research_review_error'),
 ('research-head-stalled', 'research_queue', 'rows queued or researching and no qnfo-research-exec done-ok event in 60 min', 15, 60,
  'none automatic beyond research-review-error; the metric trigger files the issue with the lever', 'qnfo-research-exec', 'research_head_stalled'),
 ('intent-untriaged', 'intents', 'status pending for more than 60 min', 10, 60,
  'reject as untriaged noise with the rationale recorded (status rejected, noise 1)', 'qnfo-intent-orchestrator', 'intents_pending'),
 ('outreach-needs-email', 'outreach_queue', 'status needs-email or needs-contact for more than 180 min', 60, 180,
  'skip: status skipped-no-email, prior status kept in error', 'qnfo-cloud-ops', 'outreach_waiting'),
 ('code-task-stalled', 'code_tasks', 'unfinished code task not updated for 180 min', 10, 180,
  'none automatic (the code loop owns retries); the metric trigger files the issue', 'qnfo-code-orchestrator', 'code_tasks_stalled'),
 ('issue-unprobed', 'agent_issues', 'open issue whose latest probe verdict is older than 60 min, or that never had one', 60, 60,
  'cadence: every contract of an open issue is due hourly; qnfo-fleet-control evaluates up to 150 per tick', 'qnfo-fleet-control', 'issues_unprobed_60m'),
 ('issue-unremediated', 'agent_issues', 'open issue older than 180 min with no doer: no code-task line, no active machine probe and no work claim', 60, 180,
  'none automatic yet; the metric trigger names the issues and the lever', 'qnfo-ops', 'issues_without_doer_3h');

-- Index first: the issue-probe column scanned 531k rows per read without it (measured at authoring).
CREATE INDEX IF NOT EXISTS idx_remediation_verifications_issue_ts ON remediation_verifications (issue_id, verified_at);

CREATE VIEW IF NOT EXISTS v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue WHERE status = 'review' AND error IS NOT NULL
     AND datetime(claimed_at) < datetime('now', '-30 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-180 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND datetime(created_at) < datetime('now', '-180 minutes')) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-180 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active' AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h;

-- stuck_total is the headline: every stuck type that has an automatic fix or a measured breach, summed.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('stuck_items_over_sla', 'operational', 'target',
  'Sum of v_stuck_summary columns except issues_unprobed_60m (its own metric): queue items past their queue_sla.sla_min plus open issues with no doer after 180 minutes (QUEUE-SLA-1).',
  'qnfo-audit.v_stuck_summary + queue_sla (migrations/2026-10-08-queue-sla.sql), refreshed every 10 minutes by trigger queue_sla_tick_10m',
  '13 on 2026-10-08 before the first fix (2 intents, 2 outreach, 9 issues without a doer)', '0', 'qnfo-fleet-control',
  'trigger gt 0 -> one METRIC-TRIGGER issue naming the stuck type and its fix', '10m', '> 0', '> 5',
  NULL, NULL, 'MEASURED', 'computed'),
 ('issues_unprobed_60m', 'operational', 'target',
  'v_stuck_summary.issues_unprobed_60m: open agent_issues with no remediation_verifications row in the last 60 minutes (QUEUE-SLA-1).',
  'qnfo-audit.v_stuck_summary (migrations/2026-10-08-queue-sla.sql), refreshed every 10 minutes by trigger queue_sla_tick_10m',
  '105 of 136 on 2026-10-08 (94 older than 3 h, 11 never)', '0', 'qnfo-fleet-control',
  'trigger gt 10 -> one METRIC-TRIGGER issue', '10m', '> 10', '> 40',
  NULL, NULL, 'MEASURED', 'computed');

-- (4) hourly probes: now, and for every contract born later.
-- Measured at authoring: 134 contracts of open issues had expected_cadence_h > 1 and 120 had next_due_at more than an hour out.
UPDATE remediation_contracts SET expected_cadence_h = 1
WHERE expected_cadence_h > 1 AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
UPDATE remediation_contracts SET next_due_at = NULL
WHERE datetime(next_due_at) > datetime('now', '+60 minutes') AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

CREATE TRIGGER IF NOT EXISTS remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts
WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;

-- (3) the 10-minute fixer.
CREATE TRIGGER IF NOT EXISTS queue_sla_tick_10m AFTER INSERT ON cron_fire_log
WHEN NEW.cron_name IN ('container-warmup-every-10min', 'invest-decision-heartbeat-10m')
BEGIN
  -- research-review-error: park the failing head row so the queue behind it runs.
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'research-review-error', COUNT(*), group_concat(substr(id, 1, 8), ',') FROM research_queue
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'review' AND error IS NOT NULL AND datetime(claimed_at) < datetime('now', '-30 minutes')
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET status = 'wontfix', stage = 'parked', claimed_at = NULL,
      error = substr('QUEUE-SLA-1 parked after 30 min (was status review, stage ' || COALESCE(stage, '?') || '; revert: status review): ' || COALESCE(error, ''), 1, 300)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'review' AND error IS NOT NULL AND datetime(claimed_at) < datetime('now', '-30 minutes');

  -- intent-untriaged: an intent nobody triaged in 60 minutes is closed as noise with the reason.
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'intent-untriaged', COUNT(*), group_concat(id, ',') FROM intents
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')
    HAVING COUNT(*) > 0;
  UPDATE intents SET status = 'rejected', noise = 1, triaged_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      triage_decision = 'sla-noise', triage_rationale = 'QUEUE-SLA-1: untriaged for more than 60 minutes; closed as noise (revert: status pending)'
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes');

  -- outreach-needs-email: a contact the radar could not complete in 180 minutes is skipped.
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'outreach-needs-email', COUNT(*), group_concat(id, ',') FROM outreach_queue
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes')
    HAVING COUNT(*) > 0;
  UPDATE outreach_queue SET error = substr('QUEUE-SLA-1 skipped after 180 min (was ' || status || '; revert: that status). ' || COALESCE(error, ''), 1, 500),
      status = 'skipped-no-email'
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes');

  -- the two metrics, every 10 minutes.
  UPDATE metric_registry SET last_value = CAST((SELECT research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'stuck_items_over_sla';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_unprobed_60m';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'stuck_items_over_sla', 'Queue SLA breach: an item is stuck past its SLA (minutes)', 'registry', 'gt', 0, 2,
  'Pillar autonomy (QUEUE-SLA-1). Read SELECT * FROM v_stuck_summary and SELECT * FROM queue_sla: each non-zero column names a stuck type, its SLA in minutes and its automatic fix. If the type has a fix and queue_sla_actions shows it ran in the last 20 minutes, the fix did not clear it: find why (a status the fix does not match, a new failure shape) and widen the fix by migration. If ops_config queue_sla_autofix is off, say why on this issue and turn it back on. A stuck type with no automatic fix (research-head-stalled, code-task-stalled) gets one now: write the fix into queue_sla and the tick trigger by migration, with its revert in the row it changes. A new queue gets a queue_sla row and a v_stuck_summary column in the same PR that creates it. Definition of done: stuck_items_over_sla = 0 at two refreshes 10 minutes apart.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'QUEUE-SLA-1 (migrations/2026-10-08-queue-sla.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'stuck_items_over_sla');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_unprobed_60m', 'Issue SLA breach: open issues not probed in the last 60 minutes', 'registry', 'gt', 10, 2,
  'Pillar autonomy (QUEUE-SLA-1). Every open issue''s closing probe runs hourly. Read SELECT a.id, c.class, c.status, c.verify_transport, c.next_due_at FROM agent_issues a LEFT JOIN remediation_contracts c ON c.issue_id = a.id WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime(''now'', ''-60 minutes'')). Causes in order: (1) contract status needs-machine-probe: write the probe (UPDATE class issue-<id>); (2) next_due_at in the future although expected_cadence_h is 1: reset next_due_at; (3) the qnfo-fleet-control remediation tick hit its per-tick limit (150): raise it; (4) a transport no executor reads: move the contract to one that runs. Definition of done: issues_unprobed_60m <= 10 at a refresh.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'QUEUE-SLA-1 (migrations/2026-10-08-queue-sla.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_unprobed_60m');
