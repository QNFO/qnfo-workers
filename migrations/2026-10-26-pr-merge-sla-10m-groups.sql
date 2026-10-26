-- PR-MERGE-SLA-GROUPS-1 (2026-10-26, charter pillar autonomy; agent_issues 1000291). Owner directive 2026-10-26: every pull request merges within 10 minutes of opening.
-- WHAT WAS MEASURED (2026-10-26 08:00Z, qnfo-audit): pr_open_over_10m (migrations/2026-10-26-pr-merge-sla-10m-lane.sql) read 1 to 2 for an hour with nothing the fleet could do: #4328
--   carried an author's explicit HOLD and changed .github/workflows/, which the lane never merges (a session merges it by hand, CLAUDE.md), so the metric's issue would be filed again every
--   cooldown for a pull request that was waiting on a person on purpose, and fm-pr-open-over-10m could never pass while one was open. Review by session_01LJNL3L on #4385 raised the same.
-- WHAT THIS ADDS: pr_sla_state.waits_on ('hold' for an author's request in the title, a label, the body or a HOLD: comment; 'session' for a change to .github/ or repository settings),
--   written by qnfo-fleet-control 0.49.3 whenever the lane refuses for that reason and cleared when the reason changes; v_pr_merge_sla counts those apart (held_over_10m, session_over_10m) and
--   keeps over_10m and oldest_min for the pull requests nobody asked the fleet to leave, which is what pr_open_over_10m and fm-pr-open-over-10m grade. Nothing is hidden: the two other counts are
--   columns of the same view and of v_stuck_summary_pr_merge_sla (pr_held_over_10m, pr_session_merge_over_10m).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: pr_sla_state
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary_pr_merge_sla; DROP VIEW IF EXISTS v_pr_merge_sla; CREATE VIEW v_pr_merge_sla AS SELECT COALESCE(SUM(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes') THEN 1 ELSE 0 END), 0) AS open_n, COALESCE(SUM(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes') AND (julianday('now') - julianday(opened_at)) * 1440 > 10 THEN 1 ELSE 0 END), 0) AS over_10m, COALESCE(CAST(MAX(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes') THEN (julianday('now') - julianday(opened_at)) * 1440 END) AS INTEGER), 0) AS oldest_min, COALESCE(SUM(CASE WHEN state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') THEN 1 ELSE 0 END), 0) AS merged_24h, COALESCE(SUM(CASE WHEN state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') AND (julianday(closed_at) - julianday(opened_at)) * 1440 <= 10 THEN 1 ELSE 0 END), 0) AS merged_within_10m_24h FROM pr_sla_state; CREATE VIEW v_stuck_summary_pr_merge_sla AS SELECT s.*, h.over_10m AS pr_open_over_10m, h.oldest_min AS pr_open_oldest_min FROM v_stuck_summary s CROSS JOIN v_pr_merge_sla h; ALTER TABLE pr_sla_state DROP COLUMN waits_on;
-- Rollback note: the decision row is append-only and stays.
-- spof-review: no new cron, binding, credential or trigger; the heavy-tick refresh of pr_open_over_10m reads the same view name.

ALTER TABLE pr_sla_state ADD COLUMN waits_on TEXT;

DROP VIEW IF EXISTS v_stuck_summary_pr_merge_sla;
DROP VIEW IF EXISTS v_pr_merge_sla;

-- A row stays 'open' until the lane reads the pull request closed; one the lane has not seen for 30 minutes was closed by hand between ticks and is not counted.
CREATE VIEW v_pr_merge_sla AS
WITH o AS (
  SELECT waits_on, (julianday('now') - julianday(opened_at)) * 1440 AS age_min
  FROM pr_sla_state
  WHERE state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
)
SELECT
  (SELECT COUNT(*) FROM o) AS open_n,
  (SELECT COUNT(*) FROM o WHERE waits_on IS NULL AND age_min > 10) AS over_10m,
  COALESCE((SELECT CAST(MAX(age_min) AS INTEGER) FROM o WHERE waits_on IS NULL), 0) AS oldest_min,
  (SELECT COUNT(*) FROM pr_sla_state WHERE state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS merged_24h,
  (SELECT COUNT(*) FROM pr_sla_state WHERE state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
     AND (julianday(closed_at) - julianday(opened_at)) * 1440 <= 10) AS merged_within_10m_24h,
  (SELECT COUNT(*) FROM o WHERE waits_on = 'hold' AND age_min > 10) AS held_over_10m,
  (SELECT COUNT(*) FROM o WHERE waits_on = 'session' AND age_min > 10) AS session_over_10m;

CREATE VIEW v_stuck_summary_pr_merge_sla AS
SELECT s.*, h.over_10m AS pr_open_over_10m, h.oldest_min AS pr_open_oldest_min, h.held_over_10m AS pr_held_over_10m, h.session_over_10m AS pr_session_merge_over_10m
FROM v_stuck_summary s CROSS JOIN v_pr_merge_sla h;

UPDATE metric_registry SET formula = 'pull requests into main of qnfo-workers that GitHub created more than 10 minutes ago and that are still open, seen by the lane in the last 30 minutes, excluding those that wait on a person on purpose: waits_on hold (an explicit request in the title, a label, the body or a HOLD: comment) and waits_on session (a change to .github/ or repository settings, merged by a session). Those are held_over_10m and session_over_10m in v_pr_merge_sla.'
  WHERE metric = 'pr_open_over_10m';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_011iUExz3dr2XK5PGm4gwBjs',
  'a metric that can only be cleared by a person overriding another person grades the fleet for something it must not do; a hold and a workflow change are exceptions to the 10-minute merge that are visible and attributable, not breaches of the fleet',
  'PR-MERGE-SLA-GROUPS-1: pr_sla_state.waits_on and v_pr_merge_sla.held_over_10m / session_over_10m; pr_open_over_10m and fm-pr-open-over-10m count only the pull requests nobody asked the fleet to leave',
  '2026-10-26 08:00Z to 08:25Z: #4328 (explicit HOLD, changes .github/workflows/github-settings-actions.yml, merged by its session at 08:08:51) kept pr_open_over_10m above 0; the lane log said "workflows and repository settings are never merged automatically"; review by session_01LJNL3L on #4385',
  'migration merged with qnfo-fleet-control 0.49.3 through the canonical path',
  'the headline count no longer includes a pull request an author holds or one that needs a session; both stay counted in their own columns and in the extension view, so an owner reading the view sees them',
  'DROP the two views and recreate the 0.49.1 definitions (the Rollback header); the column waits_on is dropped by the same line',
  'pr_open_over_10m reads 0 whenever every open pull request is either merging, held on purpose or waiting for a session merge',
  NULL,
  NULL,
  'migrations/pr-merge-sla-groups.test.mjs on SQLite; qnfo-fleet-control/pr-merge-sla.test.mjs (bhWaitsOn, the mark and the clear)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-GROUPS-1:%');
