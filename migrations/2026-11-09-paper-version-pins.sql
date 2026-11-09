-- PAPER-PIDS-PIN-2 (issue 9790, slice 2 of #7866; pillar research). Append-only pin table for served paper versions: qnfo-gateway handlePaperVersion pins the SHA-256 of the body the
-- first time a version is served and, when a later serve of the same version hashes differently, sets X-Content-Pin-Status: drifted and appends a row to paper_version_drift.
-- Pins are never updated. The metric grades the drift (a body edited in place under a served version). Prediction: 0 now; any in-place edit shows within 7 days.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS paper_version_drift_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'paper_version_drifted_7d'; DELETE FROM metric_breach_cause WHERE metric_key = 'paper_version_drifted_7d'; DELETE FROM metric_registry WHERE metric = 'paper_version_drifted_7d'; DROP TABLE IF EXISTS paper_version_drift; DROP TABLE IF EXISTS paper_version_pins

CREATE TABLE IF NOT EXISTS paper_version_pins (
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  pinned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (slug, version)
);

CREATE TABLE IF NOT EXISTS paper_version_drift (
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  pinned_sha256 TEXT NOT NULL,
  served_sha256 TEXT NOT NULL,
  seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (slug, version, served_sha256)
);

CREATE TRIGGER IF NOT EXISTS paper_version_pins_no_update
BEFORE UPDATE ON paper_version_pins
BEGIN
  SELECT RAISE(ABORT, 'paper_version_pins is append-only');
END;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES
  ('paper_version_drifted_7d', 'operational', 'leading',
   'COUNT(*) FROM paper_version_drift WHERE seen_at in the last 7 days (paper_version_drifted)',
   'qnfo-audit.paper_version_drift (PAPER-PIDS-PIN-2)',
   '0', '0', 'qnfo-gateway',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', 'hourly', '> 0', '> 5',
   '0', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('paper_version_drifted_7d', 'A served paper version changed in place', 'registry', 'gt', 0, 5,
   'PAPER-PIDS-PIN-2: select slug, version, pinned_sha256, served_sha256, seen_at from paper_version_drift order by seen_at desc. A body was edited under a version that had already been served; revise the paper under a new version instead of editing in place, and find the writer that skipped the version bump (paper_change_ledger shows change_actor).',
   'qnfo-gateway', 'agent_issues', 2, 1,
   'PAPER-PIDS-PIN-2: the trigger is the closing probe for in-place edits of served versions.');

INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key) VALUES ('paper_version_drifted_7d', 'code-loop');

CREATE TRIGGER IF NOT EXISTS paper_version_drift_tick
AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = 'paper_version_drifted_7d'), '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT COUNT(*) FROM paper_version_drift WHERE seen_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'paper_version_drifted_7d';
END;
