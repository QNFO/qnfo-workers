-- MTTR-CYCLE-ACCOUNTING-1 (2026-11-01, pillar autonomy; issue 99935).
-- The doctrine MTTR currently counts from an issue's first created_at even when it was closed and later reopened.
-- In the 2026-11-01 live read, this counted issue 1921 as 660.2 hours although its latest open-to-close cycle took 13 hours.
-- Measure the active cycle, expose mean/max by title family and issue_triage.owner, and route the metric to its active loop.
-- Live read: mttr_h_7d=52.2-52.5 h; cycle-aware replay=37.6 h over 898 closes; slowest grouped family METRIC-TRIGGER /
-- breach-doctor=154 h over 8 closes, handled by qnfo-fleet-control. The metric remains above its <=2 h target.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_mttr_cycle_accounting
-- Rollback: DROP TRIGGER IF EXISTS doctrine_rev5_tick; DROP VIEW IF EXISTS v_issue_mttr_by_family_owner_7d; UPDATE metric_registry SET formula=(SELECT formula FROM bak_20261101_mttr_cycle_accounting WHERE row_type='metric'),owner=(SELECT owner FROM bak_20261101_mttr_cycle_accounting WHERE row_type='metric'),disposition_actor=(SELECT disposition_actor FROM bak_20261101_mttr_cycle_accounting WHERE row_type='metric') WHERE metric='mttr_h_7d'; UPDATE analytics_metric_triggers SET owner=(SELECT owner FROM bak_20261101_mttr_cycle_accounting WHERE row_type='trigger'),action=(SELECT action FROM bak_20261101_mttr_cycle_accounting WHERE row_type='trigger') WHERE id=3464 AND metric_key='mttr_h_7d'; CREATE TRIGGER doctrine_rev5_tick AFTER INSERT ON fleet_tick WHEN strftime('%M','now')<'10' BEGIN UPDATE metric_registry SET last_refreshed=strftime('%Y-%m-%dT%H:%M:%SZ','now'),state='MEASURED',last_value=CAST((SELECT COALESCE(ROUND(AVG((updated_at-created_at)/3600000.0),1),0) FROM agent_issues WHERE status IN ('closed','resolved') AND typeof(updated_at)='integer' AND typeof(created_at)='integer' AND updated_at>=CAST(strftime('%s','now','-7 days') AS INTEGER)*1000 AND updated_at>=created_at) AS TEXT) WHERE metric='mttr_h_7d'; END;

CREATE TABLE IF NOT EXISTS bak_20261101_mttr_cycle_accounting AS
SELECT 'metric' AS row_type, metric AS key, NULL AS trigger_id, formula, owner, disposition_actor, NULL AS action
FROM metric_registry WHERE metric='mttr_h_7d'
UNION ALL
SELECT 'trigger', metric_key, id, NULL, owner, NULL, action
FROM analytics_metric_triggers WHERE id=3464 AND metric_key='mttr_h_7d';

CREATE VIEW IF NOT EXISTS v_issue_mttr_by_family_owner_7d AS
WITH closed AS (
  SELECT
    CASE WHEN a.title LIKE 'METRIC-TRIGGER-%' THEN 'METRIC-TRIGGER'
         ELSE substr(a.title, 1, MIN(CASE WHEN instr(a.title, ' ') > 0 THEN instr(a.title, ' ') ELSE 999 END,
                                     CASE WHEN instr(a.title, ':') > 0 THEN instr(a.title, ':') ELSE 999 END) - 1)
    END AS family,
    COALESCE(t.owner, '(unassigned)') AS owner,
    (julianday(a.updated_at / 1000.0, 'unixepoch') - COALESCE(
      (SELECT julianday(l.ts) FROM issue_lifecycle l
       WHERE l.issue_id = a.id AND l.event IN ('opened', 'reopened') AND l.to_status = 'open'
         AND julianday(l.ts) <= julianday(a.updated_at / 1000.0, 'unixepoch')
       ORDER BY julianday(l.ts) DESC, l.id DESC LIMIT 1),
      julianday(a.created_at / 1000.0, 'unixepoch')
    )) * 24.0 AS open_to_close_h
  FROM agent_issues a
  LEFT JOIN issue_triage t ON t.issue_id = a.id
  WHERE a.status IN ('closed', 'resolved')
    AND typeof(a.updated_at) = 'integer'
    AND typeof(a.created_at) = 'integer'
    AND a.updated_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000
    AND a.updated_at >= a.created_at
)
SELECT family, owner, COUNT(*) AS closes_7d,
  ROUND(AVG(open_to_close_h), 1) AS avg_open_to_close_h,
  ROUND(MAX(open_to_close_h), 1) AS max_open_to_close_h
FROM closed
WHERE family <> ''
GROUP BY family, owner;

UPDATE metric_registry SET
  formula = 'mean hours from the latest opened/reopened event to close (updated_at) of agent_issues with status closed or resolved whose close falls in the last 7 days; falls back to created_at when lifecycle history is absent (doctrine rev 5 section 24 MTTR)',
  owner = 'qnfo-fleet-control'
WHERE metric = 'mttr_h_7d';

DROP TRIGGER IF EXISTS doctrine_rev5_tick;
CREATE TRIGGER doctrine_rev5_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(ROUND(AVG((julianday(a.updated_at / 1000.0, 'unixepoch') - COALESCE(
          (SELECT julianday(l.ts) FROM issue_lifecycle l
           WHERE l.issue_id = a.id AND l.event IN ('opened', 'reopened') AND l.to_status = 'open'
             AND julianday(l.ts) <= julianday(a.updated_at / 1000.0, 'unixepoch')
           ORDER BY julianday(l.ts) DESC, l.id DESC LIMIT 1),
          julianday(a.created_at / 1000.0, 'unixepoch')
      )) * 24.0), 1), 0)
      FROM agent_issues a
      WHERE a.status IN ('closed', 'resolved')
        AND typeof(a.updated_at) = 'integer' AND typeof(a.created_at) = 'integer'
        AND a.updated_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000
        AND a.updated_at >= a.created_at
  ) AS TEXT)
  WHERE metric = 'mttr_h_7d';
END;

UPDATE analytics_metric_triggers SET
  owner = 'qnfo-fleet-control',
  action = 'Pillar autonomy (doctrine rev 5 sections 3 and 24). Use v_issue_mttr_by_family_owner_7d to group recent closes by title family and issue_triage.owner, then work the family with the largest avg_open_to_close_h through its owning loop; give recoverable issues a closing probe so the hourly remediation tick closes them on recovery. Do not close issues to lower this metric (guard issue_wontfix_share_7d). Done = mttr_h_7d <= 2 at two refreshes.',
  notes = CASE WHEN COALESCE(notes, '') LIKE '%MTTR-CYCLE-ACCOUNTING-1%'
    THEN notes ELSE COALESCE(notes, '') || ' | MTTR-CYCLE-ACCOUNTING-1: latest open/reopen cycle; family-owner diagnostic; active owner qnfo-fleet-control' END
WHERE id = 3464 AND metric_key = 'mttr_h_7d';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'migration:2026-11-01-mttr-cycle-accounting',
  'A reopened issue starts a new resolution cycle; elapsed time while it was closed must not inflate MTTR.',
  'MTTR-CYCLE-ACCOUNTING-1: measure from the latest open/reopen event, expose family-owner closure diagnostics, and route metric 3464 to qnfo-fleet-control.',
  'Read-only qnfo-audit 2026-11-01: mttr_h_7d=52.2-52.5 h; cycle-aware replay=37.6 h over 898 closes. The current slowest grouped family was METRIC-TRIGGER / breach-doctor at 154 h over 8 closes. Issue 1921 measured 660.2 h from creation but 13 h from its latest reopen to close.',
  'the metric measures time spent in the active open cycle, while the family view identifies the current slow owner without closing any issue',
  'metric_registry formula/owner, doctrine_rev5_tick, one read-only diagnostic view, analytics_metric_triggers row 3464, decision_log',
  'the Rollback header restores the old metric formula, owner, trigger and trigger action; the new view is dropped',
  'reopened issues no longer count time spent closed; the qnfo-fleet-control issue loop can identify and act on its slowest family',
  'mttr_h_7d falls from 52.5 h to approximately 37.6 h at the next refresh; it remains above the <=2 h target until real closure cycles improve',
  'none directly',
  'read-only D1 family/owner query; node:sqlite migration replay for reopen, fallback, grouping, trigger refresh and rollback'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'MTTR-CYCLE-ACCOUNTING-1:%');
