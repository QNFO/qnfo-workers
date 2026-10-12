-- RECURRENCE-GUARD-TWIN-1 (2026-10-12, pillar autonomy; agent_issues 2364 and 2365 MIGRATION-APPLY-FAILED-1, 1297
-- CLOSE-PREDICATE-NON-MONOTONE-1). Correction of the recurrence guard of SLA-MECHANISMS-1 (PR 965).
-- What happened, measured on 2026-10-12:
--   The guard reopened every closed issue whose contract kept failing. Three of the four it found (1794, 1855, 2081) are
--   METRIC-TRIGGER issues that were filed again later and have an open twin with the same title (2118, 2284, 2256). The
--   unique index idx_agent_issues_open_title_ci (lower(trim(title)) WHERE status = 'open') refuses a second open row, the
--   UPDATE aborted, and with it the statement that fired the trigger: the last statement of 2026-10-12-23 and of -24 at
--   08:04Z (migration_runs error, statements 16 of 17 and 9 of 10 applied) and the 09:00Z cron heartbeat
--   (cloud_ops_events fleet-cron-tick-error 09:00:45Z; fleet_tick has no row between 08:50:31Z and 09:10:31Z). Another
--   session patched the live trigger at 09:10Z to skip a row whose title is already open (TICK-REOPEN-DUP-GUARD-1). Since
--   then the tick succeeds, but the three issues stay closed with failing contracts, so each hourly tick wrote the same three
--   recurrence_guard_actions rows again (ids 1-3 at 09:10Z, 4-6 at 10:00Z), one queue_sla_actions row and one decision_log
--   row, and nothing reached the open twins.
--   The same UPDATE sits in remediation_reopen_on_relapse_d1 (REMEDIATION-REOPEN-2, 2026-10-12-remediation-reopen-d1.sql,
--   applied 06:36Z), which fires on every failing remediation_verifications insert: for a closed issue with an open twin the
--   insert itself is refused. Contract issue-1794 reads last_verdict probe-error at 07:41Z with no verification row since.
-- The rule now, in both triggers: a closed issue that has an open issue with the same normalised title is never reopened.
--   recurrence_guard_tick (hourly) handles the twin case once per closure: one row in recurrence_twin_notes (primary key
--   closed issue, class, closure time), one dated relapse line appended to the open twin's description, and the closed
--   issue's contract set to superseded (the twin carries its own contract and probe; an hourly failing probe on the closed
--   copy measured nothing new). A closed issue without a twin is reopened as before, and no action row is written for an
--   issue and class that already has one after its latest closure.
--   remediation_reopen_on_relapse_d1 is recreated with its text unchanged except for the twin condition in WHEN, so the
--   verification row is stored and the hourly guard does the rest.
-- The duplicate ledger rows 1-6 stay (a ledger is not edited); the rule above stops new ones.
-- The trigger texts replaced here are kept in bak_20261012_reopen_triggers; the first recurrence_guard_tick texts are in
-- bak_20261012_sla_views (2026-10-12-23 stores and removes whatever version it finds).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_reopen_triggers
-- Rollback: DROP TRIGGER IF EXISTS recurrence_guard_tick; DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1; then run the CREATE TRIGGER text of remediation_reopen_on_relapse_d1 stored in bak_20261012_reopen_triggers (the stored text has no twin condition: add it, or the unique-index failure returns); UPDATE remediation_contracts SET status = 'active' WHERE last_verdict = 'superseded:open-twin'; DELETE FROM failure_modes WHERE fm_key = 'reopen-hits-open-twin'; DELETE FROM remediation_contracts WHERE class = 'fm-reopen-hits-open-twin' (recurrence_twin_notes is a ledger and stays; the lines appended to open issues stay)

CREATE TABLE IF NOT EXISTS bak_20261012_reopen_triggers AS
SELECT name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master
WHERE type IN ('trigger', 'index') AND name IN ('recurrence_guard_tick', 'remediation_reopen_on_relapse_d1', 'idx_agent_issues_open_title_ci');

CREATE TABLE IF NOT EXISTS recurrence_guard_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  issue_id INTEGER NOT NULL,
  class TEXT NOT NULL,
  fails INTEGER NOT NULL,
  last_observed TEXT,
  prior_status TEXT,
  prior_close_evidence TEXT,
  applied INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recurrence_twin_notes (
  closed_issue_id INTEGER NOT NULL,
  class TEXT NOT NULL,
  closed_ms INTEGER NOT NULL,
  twin_issue_id INTEGER NOT NULL,
  fails INTEGER NOT NULL,
  last_observed TEXT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  noted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (closed_issue_id, class, closed_ms)
);

CREATE VIEW IF NOT EXISTS v_closure_relapses AS
SELECT x.issue_id, x.class, x.status, x.closed_ms, x.close_evidence, x.fails, x.last_observed, x.max_attempts,
  (SELECT MIN(o.id) FROM agent_issues o WHERE o.status = 'open' AND o.id <> x.issue_id AND lower(trim(o.title)) = lower(trim(x.title))) AS twin_issue_id
FROM (
  SELECT c.issue_id, c.class, a.status, a.title, c.max_attempts, t.close_evidence, a.updated_at AS closed_ms,
    (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0
       AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%'
       AND v.verified_at > MAX(datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch'),
             COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails,
    (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed
  FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id
  WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer'
    AND CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END < CAST(strftime('%s', 'now') AS INTEGER) - 7200
    AND lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) <> 'superseded' AND lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) <> 'moot'
) x
WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3))
  AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%';

DROP TRIGGER IF EXISTS recurrence_guard_tick;

CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick
WHEN (strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%')
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
BEGIN
  INSERT OR IGNORE INTO recurrence_twin_notes (closed_issue_id, class, closed_ms, twin_issue_id, fails, last_observed)
    SELECT r.issue_id, r.class, r.closed_ms, r.twin_issue_id, r.fails, r.last_observed FROM v_closure_relapses r
    WHERE r.twin_issue_id IS NOT NULL;
  UPDATE agent_issues SET description = COALESCE(description, '') || COALESCE((
      SELECT group_concat(char(10) || 'RELAPSE ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-TWIN-1, qnfo-audit recurrence_guard_tick): closed issue #' || n.closed_issue_id
        || ' has the same title and its contract ' || n.class || ' failed ' || n.fails || 'x after its closure (last observed ' || COALESCE(n.last_observed, '?')
        || '). It stays closed because this issue is open; its contract is set to superseded and this issue carries the defect.', '')
      FROM recurrence_twin_notes n WHERE n.noted = 0 AND n.twin_issue_id = agent_issues.id), '')
  WHERE status = 'open' AND id IN (SELECT twin_issue_id FROM recurrence_twin_notes WHERE noted = 0);
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:open-twin', last_attempt_at = datetime('now')
  WHERE status IN ('active', 'holding') AND class IN (SELECT class FROM recurrence_twin_notes WHERE noted = 0);
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'closure-relapse', COUNT(*), 'noted on the open twin, closed copy left closed: ' || group_concat(closed_issue_id || '>' || twin_issue_id, ',')
    FROM recurrence_twin_notes WHERE noted = 0 HAVING COUNT(*) > 0;
  UPDATE recurrence_twin_notes SET noted = 1 WHERE noted = 0;

  INSERT INTO recurrence_guard_actions (issue_id, class, fails, last_observed, prior_status, prior_close_evidence)
    SELECT r.issue_id, r.class, r.fails, r.last_observed, r.status, r.close_evidence FROM v_closure_relapses r
    WHERE r.twin_issue_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM recurrence_guard_actions g WHERE g.issue_id = r.issue_id AND g.class = r.class
                        AND g.ts > strftime('%Y-%m-%dT%H:%M:%SZ', CASE WHEN r.closed_ms > 100000000000 THEN r.closed_ms / 1000 ELSE r.closed_ms END, 'unixepoch'));
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-SQL-1, qnfo-audit recurrence_guard_tick): '
        || COALESCE((SELECT 'contract ' || g.class || ' failed ' || g.fails || 'x after the closure and its last pass (last observed ' || COALESCE(g.last_observed, '?') || '). Prior close_evidence: ' || substr(COALESCE(g.prior_close_evidence, '(none)'), 1, 300)
                       FROM recurrence_guard_actions g WHERE g.issue_id = agent_issues.id AND g.applied = 0 ORDER BY g.id DESC LIMIT 1), 'a contract failed after the closure')
  WHERE status IN ('closed', 'resolved')
    AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title)));
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
  UPDATE remediation_contracts SET status = 'active'
  WHERE status = 'holding' AND class IN (SELECT g.class FROM recurrence_guard_actions g JOIN agent_issues a ON a.id = g.issue_id WHERE g.applied = 0 AND a.status = 'open');
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'closure-relapse', COUNT(*), 'reopened: ' || group_concat(g.issue_id, ',') FROM recurrence_guard_actions g JOIN agent_issues a ON a.id = g.issue_id
    WHERE g.applied = 0 AND a.status = 'open' HAVING COUNT(*) > 0;
  UPDATE recurrence_guard_actions SET applied = 1 WHERE applied = 0;
END;

DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1;

CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 0 AND COALESCE(NEW.observed, '') <> '' AND lower(trim(NEW.observed)) NOT LIKE 'pending%'
  AND EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
              WHERE c.class = NEW.class AND c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class
                  AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN agent_issues o ON o.status = 'open' AND o.id <> a.id
                    AND lower(trim(o.title)) = lower(trim(a.title)) WHERE c.class = NEW.class)
  AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = NEW.class AND v.pass = 0 AND COALESCE(v.observed, '') <> ''
         AND lower(trim(v.observed)) NOT LIKE 'pending%'
         AND v.verified_at > MAX(
           (SELECT datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch')
              FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.class = NEW.class),
           COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = NEW.class AND p.pass = 1), '1970-01-01')))
      >= MAX(1, COALESCE((SELECT max_attempts FROM remediation_contracts WHERE class = NEW.class), 3))
BEGIN
  UPDATE agent_issues SET status = 'open',
    description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ||
      ' (REMEDIATION-REOPEN-2, D1 trigger): contract ' || NEW.class || ' failed max_attempts times after the closure (expected ' ||
      substr(COALESCE(NEW.expected, ''), 1, 60) || ', observed ' || substr(NEW.observed, 1, 60) || '). Prior close_evidence: ' ||
      substr(COALESCE((SELECT t.close_evidence FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class), '(none)'), 1, 300),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class) AND status IN ('closed', 'resolved');
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class);
  UPDATE remediation_contracts SET status = 'active' WHERE class = NEW.class AND status = 'holding';
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('reopen-hits-open-twin', 'a trigger reopens a closed issue whose title is already open, and the unique open-title index aborts the statement that fired it',
  'the reopen rules (recurrence_guard_tick, remediation_reopen_on_relapse_d1) set status open without reading idx_agent_issues_open_title_ci; a METRIC-TRIGGER issue that was filed again has an open twin; the fixture the rule was tested on had no unique index',
  'RECURRENCE-GUARD-TWIN-1: neither trigger reopens a closed issue with an open twin; the hourly guard notes the relapse on the twin once and sets the closed copy''s contract to superseded; the suite fixture carries the index and the twin case',
  'no closed or resolved issue with an open twin keeps an active or holding contract, and no fleet-cron-tick-error event in 3 hours', 'fm-reopen-hits-open-twin', '2026-10-12', 2364,
  'a relapsing closed issue whose title was filed again', 'MIGRATION-APPLY-FAILED-1 on a file whose last statement inserts a fleet_tick row; fleet-cron-tick-error; probe-error on the closed copy''s contract', 'one hourly heartbeat slot and every fleet_tick trigger in it; verification rows of the affected contracts');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-reopen-hits-open-twin', NULL, 'RECURRENCE-GUARD-TWIN-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.status IN (''active'', ''holding'') AND a.status IN (''closed'', ''resolved'') AND typeof(a.updated_at) = ''integer'' AND a.updated_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 10800) * 1000 AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND o.id <> a.id AND lower(trim(o.title)) = lower(trim(a.title))) AND c.last_verdict IN (''fail'', ''probe-error'')) + (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''fleet-cron-tick-error'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

UPDATE issue_triage SET remediation = 'RECURRENCE-GUARD-TWIN-1 (migrations/2026-10-12-25-recurrence-guard-twin.sql). Cause: the last statement of the file inserts a fleet_tick row, which fired recurrence_guard_tick; it set closed issues 1794, 1855 and 2081 to open while 2118, 2284 and 2256 hold the same titles open, and idx_agent_issues_open_title_ci refused it. The trigger no longer reopens a closed issue with an open twin (it notes the relapse on the twin once and sets the closed copy''s contract to superseded), 2026-10-12-23 removes the old trigger before its tick, and the file re-runs under its new sha256; the runner resolves this issue when the re-run records ok.'
WHERE issue_id IN (SELECT id FROM agent_issues WHERE title LIKE 'MIGRATION-APPLY-FAILED-1: 2026-10-12-2%' AND (title LIKE '%23-sla-mechanisms.sql%' OR title LIKE '%24-register-dispositions.sql%'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'a closed issue whose title is open again is already carried by the open issue; reopening the closed copy can only collide with the unique open-title index',
  'RECURRENCE-GUARD-TWIN-1: recurrence_guard_tick and remediation_reopen_on_relapse_d1 no longer reopen a closed issue with an open twin; the hourly guard notes the relapse on the twin once per closure and supersedes the closed copy''s contract; no duplicate action rows',
  'migration_runs error rows of 08:04Z for 2026-10-12-23 and -24; cloud_ops_events fleet-cron-tick-error 09:00:45Z; recurrence_guard_actions ids 1-6 (two identical sets); contract issue-1794 probe-error at 07:41Z with no verification row since 06:36Z',
  'the heartbeat cannot be aborted by a reopen, and a relapse on a re-filed issue reaches the open issue once', 'two triggers replaced (old text in bak_20261012_reopen_triggers and bak_20261012_sla_views), one table, one view, one detector',
  'the Rollback line', 'none (correction of a defect this session shipped in PR 965)',
  'issues_unprobed_60m <= 10 within 3 h', NULL, 'D1 triggers, SQLite suite with the unique index and the twin case'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'RECURRENCE-GUARD-TWIN-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:recurrence-guard-twin');
