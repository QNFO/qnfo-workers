-- DOCTRINE-HEADLINE-1b (2026-10-09, pillar autonomy; fix to 2026-10-09-doctrine-rev5-headline.sql, PR 847). Measured 10:00:21Z:
-- tick_completion_24h read 100.9, an impossible share. The numerator counted the current, unfinished ten-minute slot while the
-- denominator floored the elapsed time and left it out. The denominator is now the exact number of slot labels spanned, from
-- the slot of the window start to the slot of now inclusive (substr(ts, 1, 15) || '0:00Z' is a slot's start), so a reading
-- is at most 100. Read-only check at 10:03Z with the new formula: 108 of 109 slots, 99.1 (one heartbeat missed since
-- fleet_tick began). initiation_rate_7d and owner_dispatch_7d are unchanged.
-- The view is replaced, so its current readings are kept first in bak_20261009_doctrine_headline (the rows the checker's
-- BACKUP line names). Idempotent: CREATE TABLE IF NOT EXISTS ... AS, DROP ... IF EXISTS, CREATE ... IF NOT EXISTS, UPDATE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261009_doctrine_headline
-- Rollback: DROP TRIGGER IF EXISTS doctrine_headline_tick; DROP VIEW IF EXISTS v_doctrine_headline; then re-apply migrations/2026-10-09-doctrine-rev5-headline.sql (its CREATE statements restore the 847 view and trigger; its metric rows and triggers are kept by INSERT OR IGNORE and NOT EXISTS).

CREATE TABLE IF NOT EXISTS bak_20261009_doctrine_headline AS
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS ts, tick_completion_24h, initiation_rate_7d, owner_dispatch_7d FROM v_doctrine_headline;

DROP TRIGGER IF EXISTS doctrine_headline_tick;
DROP VIEW IF EXISTS v_doctrine_headline;

CREATE VIEW IF NOT EXISTS v_doctrine_headline AS
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
     WHERE g.gate = 'owner' AND h.created_at >= datetime('now', '-7 days')) AS owner_dispatch_7d;

CREATE TRIGGER IF NOT EXISTS doctrine_headline_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
  UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d';
END;

UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
