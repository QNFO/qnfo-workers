-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: no rollback needed; the previous probe text compared applied_at as a string and read 0 while the guard held
--
-- FM-PROBE-ISO-COMPARE-1 (2026-10-13). The fm-issue-dup-abort detector written by 2026-10-13-issue-dup-annotate.sql compared
-- migration_runs.applied_at ('2026-10-12T08:00:43Z') with datetime('now', '-24 hours') ('2026-10-12 20:15:00') as text. 'T'
-- sorts after ' ', so any failure from the same calendar day counted as recent, and the detector read 0 (fail) right after
-- the guard went live (2 string matches, 0 by datetime(), read 2026-10-13 20:16Z). Both sides now go through datetime().

UPDATE remediation_contracts SET verify_probe =
 'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_open_dup_annotate'') * (1 - MIN(1, (SELECT COUNT(*) FROM migration_runs WHERE status = ''error'' AND instr(COALESCE(error, ''''), ''idx_agent_issues_open_title'') > 0 AND datetime(applied_at) >= datetime(''now'', ''-24 hours'')))) AS TEXT) AS observed',
 next_due_at = datetime('now')
WHERE class = 'fm-issue-dup-abort';

-- The same text comparison in the other active probes, by a scan of every d1-query probe that compares a raw column with
-- datetime(): only ops_ai_log.ts and alerts.created_at hold ISO text ('2026-10-13T20:09:36.773Z'); the rest store
-- 'YYYY-MM-DD HH:MM:SS' and compare correctly (remediation_verifications, worker_live_audit, cmd_log, ipatent-db submissions,
-- q08-signal engine_runs, living-paper papers). fm-ratio-over-failure-only-table counted an alert from up to a day earlier
-- as one from the last 3 hours, so it could report self-ratio alerts as still firing.
UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'ts >= datetime(''now'', ''-7 days'')', 'datetime(ts) >= datetime(''now'', ''-7 days'')')
WHERE class = 'issue-2068';

UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'created_at >= datetime(''now'',''-3 hours'')', 'datetime(created_at) >= datetime(''now'',''-3 hours'')'),
 next_due_at = datetime('now')
WHERE class = 'fm-ratio-over-failure-only-table';

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('iso-text-compare',
 'a probe compares an ISO timestamp column with datetime() as text and counts rows from earlier the same day as recent',
 'datetime() returns ''YYYY-MM-DD HH:MM:SS'' while several tables store ''YYYY-MM-DDTHH:MM:SSZ''; ''T'' sorts after a space, so the text comparison is wrong for any row on the same calendar day',
 'wrap the column in datetime() (datetime(ts) >= datetime(''now'', ''-N hours'')); FM-PROBE-ISO-COMPARE-1 fixed fm-issue-dup-abort, issue-2068 and fm-ratio-over-failure-only-table',
 'no active probe compares migration_runs.applied_at, ops_ai_log.ts or alerts.created_at with datetime() as raw text',
 'fm-iso-text-compare', '2026-10-13', NULL,
 'a probe or view written against an ISO-stamped table with a datetime() window',
 'fm-issue-dup-abort read 0 with the guard live (2 same-day matches that datetime() does not match)',
 'every detector and metric that windows an ISO-stamped table');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-iso-text-compare', NULL, 'FM-PROBE-ISO-COMPARE-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND class <> ''fm-iso-text-compare'' AND ((instr(verify_probe, ''migration_runs'') > 0 AND instr(verify_probe, '' applied_at >= datetime('') > 0) OR (instr(verify_probe, ''ops_ai_log'') > 0 AND instr(verify_probe, '' ts >= datetime('') > 0) OR (instr(verify_probe, ''alerts'') > 0 AND instr(verify_probe, '' created_at >= datetime('') > 0))) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA', 'an ISO timestamp column is compared through datetime(), never as text',
 'FM-PROBE-ISO-COMPARE-1: fm-issue-dup-abort compares datetime(applied_at)',
 'live read 2026-10-13 20:16Z: the string comparison matched 2 failures from 2026-10-12 08:00Z, datetime() matched 0; the probe read 0 with the guard live',
 'applied by apply-migrations', 'one detector probe', 'see the Rollback header', 'the issue-dup-abort detector reports the guard correctly',
 'fm-issue-dup-abort = 1 within 2 h', 'none', 'live D1 read, offline replay with ISO timestamps');
