-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-hourly-fanout-double'; DELETE FROM failure_modes WHERE fm_key = 'hourly-fanout-double'
--
-- FM-HOURLY-FANOUT-DOUBLE-1 (2026-10-13, pillar autonomy). Failure mode found while draining issues 2514 and 2523:
-- qnfo-fleet-control 0.26.2 renamed its fast branch to "*/10 * * * *" while the live trigger was still "*/20 * * * *", and
-- scheduled() dispatched on exact strings, so the */20 firing at minute 0 fell through to the hourly fan-out next to the real
-- "0 * * * *" firing. Every hourly job ran twice in the same second from 20:01Z to 22:01Z: portfolio_sync_runs 297/298, 299/300,
-- 301/302 (the two portfolio syncs raced each other into HTTP 409 and filed PORTFOLIO-WRITE-FAILED-1), improvement_loop_runs
-- 288/289, and the remediation tick stopped writing verifications. Fixed by 0.26.3 (PR 1207, CRON-DISPATCH-ELIMINATION-1: any
-- cron that is not a declared slow schedule is the fast slot), live about 22:10Z.
-- Detector: two portfolio_sync_runs or two improvement_loop_runs in the same minute after 22:30Z within the last 3 hours.
-- spof-review: a detector only; it reads two run ledgers and writes nothing.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('hourly-fanout-double',
  'every hourly job of qnfo-fleet-control runs twice in the same second',
  'scheduled() matched event.cron by exact string; a live trigger string that the code no longer named (*/20 after the branch became */10) fell through to the hourly fan-out, which then ran beside the real 0 * * * * firing',
  'dispatch by elimination (0.26.3, CRON-DISPATCH-ELIMINATION-1): any cron that is not a declared slow schedule runs the fast slot; contents PUTs retry on 409/422 (0.26.4, PORTFOLIO-PUT-RETRY-1)',
  'fm-hourly-fanout-double', 'fm-hourly-fanout-double', '2026-10-13', 2516,
  'a wrangler cron renamed in code before the live trigger list changes',
  'portfolio_sync_runs and improvement_loop_runs show two rows per hour in the same second; PORTFOLIO-WRITE-FAILED-1 (HTTP 409) every hour; the fast slot never runs',
  'every hourly job (portfolio and charter commits, metric triggers, code merges) doubled; the remediation tick and the other fast-slot steps stop');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-hourly-fanout-double', NULL, 'FM-HOURLY-FANOUT-DOUBLE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT substr(ts, 1, 16) m FROM portfolio_sync_runs WHERE ts >= ''2026-10-13T22:30:00'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') GROUP BY m HAVING COUNT(*) > 1)) + (SELECT COUNT(*) FROM (SELECT substr(ts, 1, 16) m FROM improvement_loop_runs WHERE ts >= ''2026-10-13T22:30:00'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') GROUP BY m HAVING COUNT(*) > 1)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');
