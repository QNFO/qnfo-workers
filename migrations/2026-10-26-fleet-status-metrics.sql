-- FLEET-STATUS-1 (2026-10-26, charter pillar autonomy; owner request 2026-10-26: "The fleet dashboard is kind of a disaster ... The metrics
-- are all over the place ... Is this even machine readable?"). One metric view grouped by program, read by the dashboard's new status
-- document (GET /api/status, qnfo-fleet-dashboard 1.68.0) and open to every loop.
-- Every breach was filed under its owning worker, and qnfo-fleet-control owns 58 of the 70 live at 08:35Z, so grouping by owner said
-- nothing; the dashboard's own grouping was a regex over metric names into five "areas" that match no team. v_fleet_metrics gives each
-- enabled metric one program (QNFO.RSCH, QNFO.REACH, QNFO.INFRA, QNFO.OPS, QNFO.PERSONAL: the programs the portfolio and program managers
-- already run), its value, threshold, which direction is good, whether it is in breach (the hit of v_metric_trigger_state, the same rule
-- metrics_in_breach counts, so there is one meaning of "in breach"), its value 7 days ago (metric_history) and when it was measured.
-- metric_program_map moves one metric to another program without a deploy (INSERT OR REPLACE a row with a note).
-- The operator fix ('>' read as '>=') and the root-cause view v_breach_by_cause are BREACH-ONE-MEANING-1 (PR 4444); this file does not
-- touch v_metric_trigger_state, so the two apply in either order.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_fleet_metrics; DROP TABLE IF EXISTS metric_program_map;
-- spof-review: no new cron, binding or credential; one view and one small override table.
CREATE TABLE IF NOT EXISTS metric_program_map (
  metric TEXT PRIMARY KEY,
  program_code TEXT NOT NULL,
  note TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE VIEW IF NOT EXISTS v_fleet_metrics AS
SELECT s.metric_key AS metric, s.title, s.operator, s.threshold, s.val AS value, s.hit AS breach, s.priority, s.owner,
  r.kind, r.last_refreshed AS measured_at,
  CASE
    WHEN o.program_code IS NOT NULL THEN o.program_code
    WHEN s.owner LIKE 'program-manager:%' THEN substr(s.owner, 17)
    WHEN s.metric_key GLOB 'personal*' THEN 'QNFO.PERSONAL'
    WHEN s.metric_key GLOB '*q08*' OR s.metric_key GLOB '*paper*' OR s.metric_key GLOB '*research*' OR s.metric_key GLOB '*idea*'
      OR s.metric_key GLOB '*publica*' OR s.metric_key GLOB '*publish*' OR s.metric_key GLOB '*errata*' OR s.metric_key GLOB '*golden*'
      OR s.metric_key GLOB 'content_*' THEN 'QNFO.RSCH'
    WHEN s.metric_key GLOB '*subscri*' OR s.metric_key GLOB '*pageview*' OR s.metric_key GLOB '*referr*' OR s.metric_key GLOB '*social*'
      OR s.metric_key GLOB '*outreach*' OR s.metric_key GLOB '*attention*' OR s.metric_key GLOB '*impression*' OR s.metric_key GLOB '*engage*'
      OR s.metric_key GLOB '*reply_rate*' OR s.metric_key GLOB '*distribution*' OR s.metric_key GLOB '*buffer*' OR s.metric_key GLOB '*external_impact*'
      OR s.metric_key GLOB '*reach*' OR s.metric_key GLOB '*bluesky*' OR s.metric_key GLOB '*linkedin*' OR s.metric_key GLOB '*mastodon*' THEN 'QNFO.REACH'
    WHEN s.metric_key GLOB '*cost*' OR s.metric_key GLOB '*run_rate*' OR s.metric_key GLOB '*spend*' OR s.metric_key GLOB '*_usd*'
      OR s.metric_key GLOB '*neurons*' OR s.metric_key GLOB 'worker*' OR s.metric_key GLOB '*cron*' OR s.metric_key GLOB '*deploy*'
      OR s.metric_key GLOB '*roster*' OR s.metric_key GLOB '*spof*' OR s.metric_key GLOB '*guard*' OR s.metric_key GLOB '*probe*'
      OR s.metric_key GLOB '*drift*' OR s.metric_key GLOB 'fleet_graph*' OR s.metric_key GLOB 'tick_*' OR s.metric_key GLOB 'cf_*'
      OR s.metric_key GLOB '*_bp_*' OR s.metric_key GLOB 'runtime_verified*' OR s.metric_key GLOB '*gateway*' OR s.metric_key GLOB 'ops_agent*' THEN 'QNFO.INFRA'
    ELSE 'QNFO.OPS'
  END AS program_code,
  CASE WHEN s.operator IN ('gt', 'gte', '>', '>=') THEN 'down' WHEN s.operator IN ('lt', 'lte', '<', '<=') THEN 'up' ELSE 'target' END AS good,
  (SELECT h.value FROM metric_history h WHERE h.metric = s.metric_key AND h.day <= date('now', '-7 day') ORDER BY h.day DESC LIMIT 1) AS value_7d_ago
FROM v_metric_trigger_state s
LEFT JOIN metric_registry r ON r.metric = s.metric_key
LEFT JOIN metric_program_map o ON o.metric = s.metric_key;
