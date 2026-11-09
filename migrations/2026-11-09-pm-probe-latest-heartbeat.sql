-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, '(SELECT MAX(ts) FROM fleet_heartbeat WHERE worker = ''q08-prediction-markets'') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')', 'EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker = ''q08-prediction-markets'' AND ts < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes''))') WHERE control IN ('pm-domain-pause', 'pm-forecast-log-chain', 'pm-parameter-freeze');
-- spof-review: no new cron, trigger, host or credential; this only corrects three read-only alternate-path probes.
--
-- PM-CHARTER-1 (charter pillar personal). The review gate on PR 9151 found that the alternate-path probes written by 2026-11-09-pm-research.sql test whether ANY heartbeat row of
-- q08-prediction-markets is older than 30 minutes, which stays true once the table keeps history and would report a healthy review loop as stopped. They must test the LATEST beat.
-- That file is already applied and is not edited (MIGRATION-NO-CLOBBER-1); this later file replaces the condition in place. A worker with no heartbeat row gives a NULL maximum, the
-- comparison is not true, and the next WHEN branch (never published a heartbeat) still decides.
UPDATE control_alternate_probes
   SET probe_sql = replace(probe_sql,
     'EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker = ''q08-prediction-markets'' AND ts < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes''))',
     '(SELECT MAX(ts) FROM fleet_heartbeat WHERE worker = ''q08-prediction-markets'') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')')
 WHERE control IN ('pm-domain-pause', 'pm-forecast-log-chain', 'pm-parameter-freeze');
