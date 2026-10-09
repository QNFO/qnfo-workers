-- AUDIT-FRESHNESS-1 (2026-10-09, pillar autonomy). Owner request 2026-10-09: "Schedule regular audits and remediate as needed to
-- ensure continuous, automatic, autonomous system operation". Audits already exist (self-audit-systemwide every 6 h, queue SLA
-- tick, remediation contracts, metric tick). Nothing checked that the audits themselves keep running: self-audit-systemwide
-- covers sub-daily crons only, so a daily or weekly audit cron (or the 10-minute tick, the metric refresh, the probe loop) could
-- stop silently. This file adds that second line, all on Cloudflare, no session or claude.ai schedule:
-- (1) v_audit_freshness: one row per audit signal with its last run, allowed age in minutes and stale flag.
-- (2) metric audits_stale (target 0), refreshed every 10 minutes by a second AFTER INSERT trigger on fleet_tick, with a
--     metric trigger whose action names the lever and closing probe.
-- (3) issue_id_gap_ledger: evidence for the historic agent_issues id gaps; v_issue_accounting subtracts only RECORDED gaps, so a
--     new gap (id 2209 at authoring) still counts as unrecorded and keeps issues_unaccounted > 0 until someone explains it.
-- Measured at authoring: 41 gaps; 40 are old (ids 370-373, 808, 1232-1557 range) with no tombstone and no issue_lifecycle row.
-- Their cause is NOT known (the ledger/tombstone arrived after them); they are recorded as historic-cause-unknown, not explained.
-- APPLY-BY: ci
-- BACKUP: bak_20261009_v_issue_accounting
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS audit_freshness_tick_10m; DROP TRIGGER IF EXISTS audit_freshness_from_cron_log; DROP VIEW IF EXISTS v_audit_freshness; DELETE FROM metric_registry WHERE metric = 'audits_stale'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'audits_stale'; DROP TABLE IF EXISTS issue_id_gap_ledger; -- then restore v_issue_accounting from migrations/2026-10-08 (previous text kept in bak_20261009_v_issue_accounting.sql)

CREATE TABLE IF NOT EXISTS issue_id_gap_ledger (
  id INTEGER PRIMARY KEY,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  verdict TEXT NOT NULL,
  evidence TEXT NOT NULL
);

INSERT OR IGNORE INTO issue_id_gap_ledger (id, verdict, evidence)
SELECT v.id, 'historic-cause-unknown',
  'AUDIT-FRESHNESS-1 2026-10-09: id absent from agent_issues, no agent_issues_tombstone row, below the id range covered by issue_lifecycle; deleted before no-silent-drop existed or rolled-back insert. Cause not recoverable from D1.'
FROM (SELECT 370 AS id UNION ALL SELECT 371 UNION ALL SELECT 372 UNION ALL SELECT 373 UNION ALL SELECT 808 UNION ALL SELECT 1232 UNION ALL SELECT 1233 UNION ALL SELECT 1235 UNION ALL SELECT 1237
  UNION ALL SELECT 1253 UNION ALL SELECT 1254 UNION ALL SELECT 1255 UNION ALL SELECT 1300 UNION ALL SELECT 1398 UNION ALL SELECT 1409
  UNION ALL SELECT 1425 UNION ALL SELECT 1426 UNION ALL SELECT 1427 UNION ALL SELECT 1428 UNION ALL SELECT 1429 UNION ALL SELECT 1430 UNION ALL SELECT 1431 UNION ALL SELECT 1432 UNION ALL SELECT 1433 UNION ALL SELECT 1434 UNION ALL SELECT 1435
  UNION ALL SELECT 1439 UNION ALL SELECT 1440 UNION ALL SELECT 1441 UNION ALL SELECT 1453 UNION ALL SELECT 1464
  UNION ALL SELECT 1549 UNION ALL SELECT 1550 UNION ALL SELECT 1551 UNION ALL SELECT 1552 UNION ALL SELECT 1553 UNION ALL SELECT 1554 UNION ALL SELECT 1555 UNION ALL SELECT 1556 UNION ALL SELECT 1557) v
WHERE v.id NOT IN (SELECT id FROM agent_issues) AND v.id NOT IN (SELECT id FROM agent_issues_tombstone);

CREATE TABLE IF NOT EXISTS bak_20261009_v_issue_accounting AS SELECT name, sql FROM sqlite_master WHERE name = 'v_issue_accounting';
DROP VIEW IF EXISTS v_issue_accounting;
CREATE VIEW v_issue_accounting AS
SELECT
  MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition,
  (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded,
  MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone)
    - (SELECT COUNT(*) FROM issue_id_gap_ledger WHERE id NOT IN (SELECT id FROM agent_issues) AND id NOT IN (SELECT id FROM agent_issues_tombstone))) AS deleted_unrecorded,
  (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger;

DROP VIEW IF EXISTS v_audit_freshness;
CREATE VIEW v_audit_freshness AS
SELECT 'fleet_tick' AS audit, (SELECT MAX(ts) FROM fleet_tick) AS last_run, 30 AS max_age_min,
  CAST((julianday('now') - julianday(replace(replace((SELECT MAX(ts) FROM fleet_tick),'T',' '),'Z',''))) * 1440 AS INTEGER) AS age_min,
  'qnfo-fleet-control / cron log / worker heartbeats' AS owner
UNION ALL SELECT 'metric_tick', (SELECT MAX(last_refreshed) FROM metric_registry WHERE metric = 'metrics_in_breach'), 150,
  CAST((julianday('now') - julianday(replace(replace((SELECT MAX(last_refreshed) FROM metric_registry WHERE metric = 'metrics_in_breach'),'T',' '),'Z',''))) * 1440 AS INTEGER), 'metric-refresh fleet task'
UNION ALL SELECT 'remediation_probes', (SELECT MAX(verified_at) FROM remediation_verifications), 150,
  CAST((julianday('now') - julianday(replace(replace(substr((SELECT MAX(verified_at) FROM remediation_verifications),1,19),'T',' '),'Z',''))) * 1440 AS INTEGER), 'qnfo-fleet-control remediation tick'
UNION ALL SELECT 'cron:' || name, last_fired,
  CASE WHEN cron_expr NOT LIKE '% * * *' AND cron_expr NOT LIKE '*/%' THEN 12100 ELSE 1800 END,
  CAST((julianday('now') - julianday(replace(replace(last_fired,'T',' '),'Z',''))) * 1440 AS INTEGER), 'fleet_crons'
FROM fleet_crons
WHERE enabled = 1 AND last_fired IS NOT NULL
  AND ((cron_expr NOT LIKE '% * * *' AND cron_expr NOT LIKE '*/%') OR cron_expr GLOB '[0-9]* [0-9]* * * *');

-- stale = never ran or older than allowed (a NULL last_run is stale, not skipped)
CREATE VIEW IF NOT EXISTS v_audit_stale AS
SELECT audit, last_run, max_age_min, age_min, owner FROM v_audit_freshness WHERE last_run IS NULL OR age_min > max_age_min;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('audits_stale', 'operational', 'target',
  'Count of rows in v_audit_stale: audit signals (10-minute tick, metric refresh, remediation probes, every daily or weekly enabled fleet cron) whose last run is older than allowed or missing (AUDIT-FRESHNESS-1).',
  'qnfo-audit.v_audit_freshness (migrations/2026-10-09-04-audit-freshness.sql), refreshed every 10 minutes by trigger audit_freshness_tick_10m',
  'measured at first refresh', '0', 'qnfo-fleet-control',
  'trigger gt 0 -> one METRIC-TRIGGER issue naming the stale audit and its owner', '10m', '> 0', '> 3',
  NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS audit_freshness_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_audit_stale) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'audits_stale';
END;

-- second, independent refresher: the monitored fleet_tick must not be the only thing that recomputes its own staleness
-- (a stalled tick would freeze the metric at its last good value). cron_fire_log is a separate producer.
CREATE TRIGGER IF NOT EXISTS audit_freshness_from_cron_log AFTER INSERT ON cron_fire_log
WHEN NOT EXISTS (SELECT 1 FROM metric_registry WHERE metric = 'audits_stale' AND last_refreshed > strftime('%Y-%m-%dT%H:%M:%SZ','now','-9 minutes'))
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_audit_stale) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'audits_stale';
END;

UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_audit_stale) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
WHERE metric = 'audits_stale';

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'audits_stale', 'Audit freshness breach: an audit loop stopped running', 'registry', 'gt', 0, 2,
  'Pillar autonomy (AUDIT-FRESHNESS-1). Read SELECT * FROM v_audit_stale: each row is an audit signal past its allowed age, with its owner. Causes in order: (1) a fleet_crons row not firing: check cron_fire_log and the owning worker trigger, redeploy through the canonical path; (2) fleet_tick not advancing: both producers (cron log, worker heartbeats) are down, a platform or deploy fault, read fleet_heartbeat; (3) metric-refresh or the remediation tick erroring: read its latest error and fix in the owning worker. Never silence the metric by widening max_age_min without a recorded reason. Definition of done: audits_stale = 0 at two refreshes 10 minutes apart.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'AUDIT-FRESHNESS-1 (migrations/2026-10-09-04-audit-freshness.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'audits_stale');
