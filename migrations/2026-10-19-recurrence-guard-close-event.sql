-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_recurrence_guard_tick
-- Rollback: DROP TRIGGER IF EXISTS recurrence_guard_tick; CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick WHEN (strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%') AND COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' BEGIN INSERT INTO recurrence_guard_actions (issue_id, class, fails, last_observed, prior_status, prior_close_evidence) SELECT x.issue_id, x.class, x.fails, x.last_observed, x.status, x.close_evidence FROM ( SELECT c.issue_id, c.class, a.status, c.max_attempts, t.close_evidence, (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%' AND v.verified_at > MAX(datetime(a.updated_at / 1000, 'unixepoch'), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails, (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer' AND a.updated_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 ) x WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3)) AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%'; UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-SQL-1, qnfo-audit recurrence_guard_tick): ' || COALESCE((SELECT 'contract ' || g.class || ' failed ' || g.fails || 'x after the closure and its last pass (last observed ' || COALESCE(g.last_observed, '?') || '). Prior close_evidence: ' || substr(COALESCE(g.prior_close_evidence, '(none)'), 1, 300) FROM recurrence_guard_actions g WHERE g.issue_id = agent_issues.id ORDER BY g.id DESC LIMIT 1), 'a contract failed after the closure') WHERE status IN ('closed', 'resolved') AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0) AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title))); UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL WHERE issue_id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0) AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open'); UPDATE remediation_contracts SET status = 'active' WHERE status = 'holding' AND class IN (SELECT class FROM recurrence_guard_actions WHERE applied = 0); INSERT INTO queue_sla_actions (stuck_type, n, note) SELECT 'closure-relapse', COUNT(*), group_concat(issue_id, ',') FROM recurrence_guard_actions WHERE applied = 0 HAVING COUNT(*) > 0; UPDATE recurrence_guard_actions SET applied = 1 WHERE applied = 0; END; UPDATE remediation_contracts SET verify_probe = 'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name IN (''remediation_reopen_on_relapse_d1'', ''v_closure_relapses'') AND instr(sql, ''issue_lifecycle'') > 0 AND instr(sql, ''dispositioned'') > 0) AS TEXT) AS observed' WHERE class = 'fm-relapse-window-sql-twin-anchor'
-- spof-review: adds no single point of failure; the sweep keeps its live text except the start of the failure window, which falls back to the old start when an issue has no lifecycle close row. The D1 trigger remediation_reopen_on_relapse_d1 and the worker (qnfo-fleet-control rtReopenOnRelapse) are the alternate paths, and both already start at the close event.
--
-- RECURRENCE-GUARD-CLOSE-EVENT-1 (VERIFICATION-PATH-3, 2026-10-19, pillar autonomy, doctrine sections 6 and 16; agent_issues 100224). The fourth and last SQL copy of the relapse window.
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19, SELECT only)
--   VERIFICATION-PATH-2 (migrations/2026-10-19-relapse-window-close-event.sql) moved the D1 trigger remediation_reopen_on_relapse_d1, the view v_closure_relapses and the detector
--   fm-closure-relapse-unreopened to the issue_lifecycle close event, as the worker has been since qnfo-fleet-control 0.38.0. The hourly sweep recurrence_guard_tick (AFTER INSERT ON
--   fleet_tick, 3284 characters) still counted failures since datetime(a.updated_at / 1000, 'unixepoch'). updated_at moves on every annotation and stays put when a writer closes
--   without bumping it, so the sweep could reopen a fresh fix on failures that preceded its closure (the shape of issue 2380 in the VERIFICATION-PATH-2 header) and judge late a
--   closure touched after it closed. Two windows for one closure.
--
-- WHAT THIS CHANGES
--   recurrence_guard_tick   the one start expression in the failure count becomes COALESCE(<the newest issue_lifecycle row of event dispositioned or closed that landed on closed or
--                           resolved, ts cut to 19 characters with T replaced by a space>, <the old expression>); every other character of the live text is unchanged
--                           (migrations/recurrence-guard-close-event.test.mjs compares). The added subquery is a read inside the INSERT .. SELECT, so the trigger's write list (recurrence_guard_actions,
--                           agent_issues, issue_triage, remediation_contracts, queue_sla_actions) and hence the trigger depth from a fleet_tick INSERT are unchanged.
--   fm-relapse-window-sql-twin-anchor  its regression guard reads three objects instead of two (guarded UPDATE: only while it still expects 2).
--   issue-100224            rescheduled so the next tick reads sqlite_master (its probe is already the definition of done).
--
-- RISK: fleet_tick is the cron heartbeat. A refused CREATE leaves the tick running without the sweep (a missing trigger does not abort the INSERT); the runner's
--   D1-TRIGGER-DEPTH-RESTORE-1 snapshot puts the old text back if the depth canary refuses it. The sweep's own UPDATE of agent_issues keeps its open-twin guard.
--
-- Verify after apply:
--   SELECT COUNT(*) FROM sqlite_master WHERE name = 'recurrence_guard_tick' AND instr(sql, 'issue_lifecycle') > 0;   -- 1
--   SELECT length(sql) FROM sqlite_master WHERE name = 'recurrence_guard_tick';   -- 3480

-- 1. Backup (ahead of the DROP; IF NOT EXISTS keeps the first copy when the file is applied again)
CREATE TABLE IF NOT EXISTS bak_20261019_recurrence_guard_tick AS
  SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger' AND name = 'recurrence_guard_tick';

-- 2. The sweep: live text with the one start expression replaced
DROP TRIGGER IF EXISTS recurrence_guard_tick;

CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick
WHEN (strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%')
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
BEGIN
  INSERT INTO recurrence_guard_actions (issue_id, class, fails, last_observed, prior_status, prior_close_evidence)
    SELECT x.issue_id, x.class, x.fails, x.last_observed, x.status, x.close_evidence
    FROM (
      SELECT c.issue_id, c.class, a.status, c.max_attempts, t.close_evidence,
        (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0
           AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%'
           AND v.verified_at > MAX(COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), datetime(a.updated_at / 1000, 'unixepoch')),
                 COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails,
        (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed
      FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id
      WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer'
        AND a.updated_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
    ) x
    WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3))
      AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%';
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-SQL-1, qnfo-audit recurrence_guard_tick): '
        || COALESCE((SELECT 'contract ' || g.class || ' failed ' || g.fails || 'x after the closure and its last pass (last observed ' || COALESCE(g.last_observed, '?') || '). Prior close_evidence: ' || substr(COALESCE(g.prior_close_evidence, '(none)'), 1, 300)
                       FROM recurrence_guard_actions g WHERE g.issue_id = agent_issues.id ORDER BY g.id DESC LIMIT 1), 'a contract failed after the closure')
  WHERE status IN ('closed', 'resolved')
    AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title)));
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
  UPDATE remediation_contracts SET status = 'active'
  WHERE status = 'holding' AND class IN (SELECT class FROM recurrence_guard_actions WHERE applied = 0);
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'closure-relapse', COUNT(*), group_concat(issue_id, ',') FROM recurrence_guard_actions
    WHERE applied = 0 HAVING COUNT(*) > 0;
  UPDATE recurrence_guard_actions SET applied = 1 WHERE applied = 0;
END;

-- 3. The regression guard covers the sweep too (guarded: a second apply changes nothing)
UPDATE remediation_contracts SET verify_probe = 'SELECT ''3'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name IN (''remediation_reopen_on_relapse_d1'', ''v_closure_relapses'', ''recurrence_guard_tick'') AND instr(sql, ''issue_lifecycle'') > 0 AND instr(sql, ''dispositioned'') > 0) AS TEXT) AS observed'
 WHERE class = 'fm-relapse-window-sql-twin-anchor' AND instr(verify_probe, 'recurrence_guard_tick') = 0;

UPDATE failure_modes SET remediation = remediation || ' VERIFICATION-PATH-3 (migrations/2026-10-19-recurrence-guard-close-event.sql, agent_issues 100224): the hourly sweep recurrence_guard_tick starts the window the same way, and the detector reads all three objects.'
 WHERE fm_key = 'relapse-window-sql-twin-anchor' AND instr(remediation, 'VERIFICATION-PATH-3') = 0;

-- 4. The contract of issue 100224 keeps its probe; it is rescheduled so the next tick reads the new state
UPDATE remediation_contracts SET next_due_at = datetime('now')
 WHERE class = 'issue-100224' AND COALESCE(last_verdict, '') <> 'pass';

-- 5. The decision (append-only)
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01EFM65CoycWBmyc1XeocwDL',
  'a relapse is a failure after the closure, so the hourly sweep starts its window at the closure event as the D1 trigger, the view and the worker already do',
  'VERIFICATION-PATH-3: recurrence_guard_tick counts failures since the newest issue_lifecycle close row, with agent_issues.updated_at as the fallback; fm-relapse-window-sql-twin-anchor reads the sweep too',
  'qnfo-audit 2026-10-19: recurrence_guard_tick (3284 characters) was the one SQL copy of the window still starting at datetime(a.updated_at / 1000, ''unixepoch''); VERIFICATION-PATH-2 moved the other three',
  'migration merged',
  'one trigger replaced in place (write list unchanged), one detector probe, one failure-mode note, one contract rescheduled; no issue, verdict or verification row changes',
  'the Rollback header restores the old trigger (line breaks collapsed) and the detector probe; bak_20261019_recurrence_guard_tick holds the exact old text',
  'every SQL copy of the relapse rule judges a closure by when it closed',
  'failure_modes_recurring <= 12 within 6 h',
  'none',
  'offline node:sqlite suite migrations/recurrence-guard-close-event.test.mjs (live DDL and triggers replayed, live sweep text compared character for character); qnfo-audit sqlite_master (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-3:') = 1);
