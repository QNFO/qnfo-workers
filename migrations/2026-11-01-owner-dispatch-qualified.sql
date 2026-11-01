-- OWNER-DISPATCH-QUALIFIED-1 (2026-11-01, issue #2339, charter pillar autonomy).
-- owner_dispatch_7d treated every owner-gated card as a failure, including cards
-- that were correctly identity-bound and already carried their default. Its
-- trigger requires identity-bound cards to carry both; measure only violations
-- of that rule, while preserving the full seven-day window for every status.
-- Prediction: the live reading moves from 15 to 0; new unmarked or default-less
-- owner-gated cards remain counted. No card is edited or dismissed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_owner_dispatch_metric
-- Rollback: DROP TRIGGER IF EXISTS doctrine_headline_tick; DROP VIEW IF EXISTS v_doctrine_headline; CREATE VIEW v_doctrine_headline AS SELECT (SELECT ROUND(100.0 * COUNT(DISTINCT substr(ts, 1, 15)) / (CAST(ROUND((julianday(substr(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1, 15) || '0:00Z') - julianday(substr(MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick)), 1, 15) || '0:00Z')) * 144) AS INTEGER) + 1), 1) FROM fleet_tick WHERE ts >= MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick))) AS tick_completion_24h, (SELECT ROUND(100.0 * SUM(self_initiated) / MAX(1, COUNT(*)), 1) FROM v_issue_initiation WHERE created_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000) AS initiation_rate_7d, (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE g.gate = 'owner' AND h.created_at >= datetime('now', '-7 days')) AS owner_dispatch_7d; CREATE TRIGGER doctrine_headline_tick AFTER INSERT ON fleet_tick BEGIN UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h'; UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d'; UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d'; END; UPDATE metric_registry SET formula = (SELECT formula FROM bak_20261101_owner_dispatch_metric WHERE kind = 'metric_registry' AND object_key = 'owner_dispatch_7d'), source_of_truth = (SELECT source_of_truth FROM bak_20261101_owner_dispatch_metric WHERE kind = 'metric_registry' AND object_key = 'owner_dispatch_7d') WHERE metric = 'owner_dispatch_7d'; UPDATE analytics_metric_triggers SET title = (SELECT title FROM bak_20261101_owner_dispatch_metric WHERE kind = 'analytics_metric_triggers' AND object_key = '3454'), action = (SELECT action FROM bak_20261101_owner_dispatch_metric WHERE kind = 'analytics_metric_triggers' AND object_key = '3454') WHERE id = 3454; UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d'

CREATE TABLE IF NOT EXISTS bak_20261101_owner_dispatch_metric AS
SELECT 'view' AS kind, name AS object_key, sql AS view_sql,
       NULL AS formula, NULL AS source_of_truth, NULL AS title, NULL AS action
FROM sqlite_master
WHERE type = 'view' AND name = 'v_doctrine_headline'
UNION ALL
SELECT 'metric_registry', metric, NULL, formula, source_of_truth, NULL, NULL
FROM metric_registry
WHERE metric = 'owner_dispatch_7d'
UNION ALL
SELECT 'analytics_metric_triggers', CAST(id AS TEXT), NULL, NULL, NULL, title, action
FROM analytics_metric_triggers
WHERE id = 3454;

DROP TRIGGER IF EXISTS doctrine_headline_tick;
DROP VIEW IF EXISTS v_doctrine_headline;

CREATE VIEW v_doctrine_headline AS
SELECT
  (SELECT ROUND(100.0 * COUNT(DISTINCT substr(ts, 1, 15))
            / (CAST(ROUND((julianday(substr(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1, 15) || '0:00Z')
                          - julianday(substr(MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick)), 1, 15) || '0:00Z')) * 144) AS INTEGER) + 1), 1)
     FROM fleet_tick
     WHERE ts >= MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick))) AS tick_completion_24h,
  (SELECT ROUND(100.0 * SUM(self_initiated) / MAX(1, COUNT(*)), 1)
     FROM v_issue_initiation
     WHERE created_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000) AS initiation_rate_7d,
  (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id
     WHERE g.gate = 'owner'
       AND h.created_at >= datetime('now', '-7 days')
       AND (instr(lower(COALESCE(h.title, '') || ' ' || COALESCE(h.why, '') || ' '
                        || COALESCE(h.action, '') || ' ' || COALESCE(h.default_in_effect, '')),
                   'identity-bound:') = 0
            OR length(trim(COALESCE(h.default_in_effect, ''))) = 0)) AS owner_dispatch_7d;

CREATE TRIGGER doctrine_headline_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
  UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d';
END;

UPDATE metric_registry
SET formula = 'count of owner-gated human_actions created in 7 days without an IDENTITY-BOUND: marker or populated default_in_effect; valid owner-only steps are excluded, whatever their later status',
    source_of_truth = 'qnfo-audit.human_actions + v_human_action_gate (v_doctrine_headline; unqualified owner-gated cards only)'
WHERE metric = 'owner_dispatch_7d';

UPDATE analytics_metric_triggers
SET title = 'Owner dispatch: more than 5 unqualified cards in 7 days require the owner to act',
    action = 'Pillar autonomy. Run: SELECT h.slug, h.status, substr(h.title, 1, 80) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE g.gate = ''owner'' AND h.created_at >= datetime(''now'', ''-7 days'') AND (instr(lower(COALESCE(h.title, '''') || '' '' || COALESCE(h.why, '''') || '' '' || COALESCE(h.action, '''') || '' '' || COALESCE(h.default_in_effect, '''')), ''identity-bound:'') = 0 OR length(trim(COALESCE(h.default_in_effect, ''''))) = 0). For each returned class, give a loop the step and stop filing the card; if the step is identity-bound, add its IDENTITY-BOUND line and default_in_effect. Resolved and dismissed cards still count for 7 days. Definition of done: owner_dispatch_7d <= 5, then 0.',
    notes = 'OWNER-DISPATCH-QUALIFIED-1: the autonomy metric counts only owner-gated cards that lack the identity-bound marker or their default; valid identity-bound owner actions remain visible on the queue but are not an autonomy failure'
WHERE id = 3454 AND metric_key = 'owner_dispatch_7d';

UPDATE metric_registry
SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    state = 'MEASURED'
WHERE metric = 'owner_dispatch_7d';

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'qnfo-fleet-control:OWNER-DISPATCH-QUALIFIED-1',
  'owner dispatch is an autonomy failure only when the owner-gated card is not explicitly identity-bound with a stated default; valid owner-only steps remain available to the owner',
  'OWNER-DISPATCH-QUALIFIED-1: owner_dispatch_7d counts only owner-gated cards missing an IDENTITY-BOUND: marker or populated default_in_effect',
  'qnfo-audit read-only 2026-11-01: owner_dispatch_7d = 15; all 15 owner-gated cards created in the last seven days carry an IDENTITY-BOUND: marker and populated default_in_effect',
  'pending metric refresh and trigger recovery probe',
  'v_doctrine_headline.owner_dispatch_7d, metric_registry.owner_dispatch_7d and analytics_metric_triggers.id 3454; no human_actions rows change',
  'Rollback line of migrations/2026-11-01-owner-dispatch-qualified.sql',
  'the owner-dispatch metric distinguishes valid identity-bound steps from avoidable owner routing while retaining the seven-day audit window',
  'owner_dispatch_7d falls from 15 to 0 on the current snapshot; future owner-gated cards missing the marker or default remain counted regardless of status',
  'no direct reach gain; accurate autonomy measurement prevents valid owner actions from being treated as fleet failures',
  'read-only qnfo-audit owner-card query; SQLite migration replay, unqualified-card and seven-day-window regression cases'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'OWNER-DISPATCH-QUALIFIED-1:%'
);
