-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_relapse_window_objects
-- Rollback: DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1; CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications WHEN NEW.pass = 0 AND COALESCE(NEW.observed, '') <> '' AND (lower(trim(NEW.observed)) NOT LIKE 'pending%' OR (NEW.observed GLOB '*[0-9]*' AND (NEW.observed LIKE '%ceiling%' OR lower(NEW.observed) LIKE '%target%' OR lower(NEW.observed) LIKE '%threshold%' OR lower(NEW.observed) LIKE '%limit%' OR lower(NEW.observed) LIKE '%fewer than%' OR lower(NEW.observed) LIKE '%more than%' OR NEW.observed LIKE '% <= %' OR NEW.observed LIKE '% >= %' OR NEW.observed LIKE '% < %' OR NEW.observed LIKE '% > %'))) AND EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.class = NEW.class AND c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved')) AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot')) AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN agent_issues o ON o.status = 'open' AND o.id <> a.id AND lower(trim(o.title)) = lower(trim(a.title)) WHERE c.class = NEW.class) AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = NEW.class AND v.pass = 0 AND COALESCE(v.observed, '') <> '' AND (lower(trim(v.observed)) NOT LIKE 'pending%' OR (v.observed GLOB '*[0-9]*' AND (v.observed LIKE '%ceiling%' OR lower(v.observed) LIKE '%target%' OR lower(v.observed) LIKE '%threshold%' OR lower(v.observed) LIKE '%limit%' OR lower(v.observed) LIKE '%fewer than%' OR lower(v.observed) LIKE '%more than%' OR v.observed LIKE '% <= %' OR v.observed LIKE '% >= %' OR v.observed LIKE '% < %' OR v.observed LIKE '% > %'))) AND v.verified_at > MAX( (SELECT datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch') FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.class = NEW.class), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = NEW.class AND p.pass = 1), '1970-01-01'))) >= MAX(1, COALESCE((SELECT max_attempts FROM remediation_contracts WHERE class = NEW.class), 3)) BEGIN UPDATE agent_issues SET status = 'open', description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (REMEDIATION-REOPEN-2, D1 trigger): contract ' || NEW.class || ' failed max_attempts times after the closure (expected ' || substr(COALESCE(NEW.expected, ''), 1, 60) || ', observed ' || substr(NEW.observed, 1, 60) || '). Prior close_evidence: ' || substr(COALESCE((SELECT t.close_evidence FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class), '(none)'), 1, 300), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class) AND status IN ('closed', 'resolved'); UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL WHERE issue_id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class); UPDATE remediation_contracts SET status = 'active' WHERE class = NEW.class AND status = 'holding'; END; DROP VIEW IF EXISTS v_closure_relapses; CREATE VIEW v_closure_relapses AS SELECT x.issue_id, x.class, x.status, x.closed_ms, x.close_evidence, x.fails, x.last_observed, x.max_attempts, (SELECT MIN(o.id) FROM agent_issues o WHERE o.status = 'open' AND o.id <> x.issue_id AND lower(trim(o.title)) = lower(trim(x.title))) AS twin_issue_id FROM ( SELECT c.issue_id, c.class, a.status, a.title, c.max_attempts, t.close_evidence, a.updated_at AS closed_ms, (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%' AND v.verified_at > MAX(datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch'), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails, (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer' AND CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END < CAST(strftime('%s', 'now') AS INTEGER) - 7200 AND lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) <> 'superseded' AND lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) <> 'moot' ) x WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3)) AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%'; UPDATE remediation_contracts SET verify_probe = (SELECT b.sql FROM bak_20261019_relapse_window_objects b WHERE b.type = 'contract-probe' AND b.name = 'fm-closure-relapse-unreopened') WHERE class = 'fm-closure-relapse-unreopened'; UPDATE control_registry SET evidence = (SELECT b.sql FROM bak_20261019_relapse_window_objects b WHERE b.type = 'control-evidence' AND b.name = 'relapse-reopen-window'), reviewed_at = '2026-10-19T15:17:31Z' WHERE control = 'relapse-reopen-window'; DELETE FROM remediation_contracts WHERE class = 'fm-relapse-window-sql-twin-anchor'; DELETE FROM failure_modes WHERE fm_key = 'relapse-window-sql-twin-anchor'; UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'VERIFICATION-PATH-3:%' AND status = 'open'
-- spof-review: adds no single point of failure; the trigger and the view keep their live text except the start of the failure window, which falls back to the old start when an issue has no lifecycle close row; the worker (qnfo-fleet-control rtReopenOnRelapse), the hourly sweep recurrence_guard_tick and the standing detectors fm-relapse-window-close-anchor and fm-relapse-window-sql-twin-anchor are the alternate paths.
--
-- RELAPSE-WINDOW-CLOSE-EVENT-1 (VERIFICATION-PATH-2, 2026-10-19, pillar autonomy, doctrine sections 6 and 16; agent_issues 100193). Companion to qnfo-fleet-control 0.38.0
-- (migrations/2026-10-19-contract-deferred-since.sql), which moved the worker's relapse window from agent_issues.updated_at to the issue_lifecycle close event.
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 15:30Z to 15:45Z, SELECT only)
--   * updated_at moves on every annotation of a row and on writers that never set it, so it is not the moment of the closure. The worker stopped using it. The two SQL copies of the rule
--     still did: the D1 trigger remediation_reopen_on_relapse_d1 (AFTER INSERT ON remediation_verifications, 3507 characters) and the view v_closure_relapses (1708 characters) both counted
--     failures since datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch'), and so did the standing detector
--     fm-closure-relapse-unreopened (its probe reads the same expression). Three SQL copies of one rule (a fourth is the hourly sweep named below) and a window that differs from the worker's.
--   * It is live, not latent. Issue 2380 was closed at 2026-10-19T15:28:29Z (issue_lifecycle event dispositioned, to_status closed) and its updated_at is still 2026-10-17 14:58:26 (the writer that
--     closed it did not bump it). Its contract issue-2380 had 50 failing verification rows since that updated_at and none after the close: at 15:31Z v_closure_relapses listed it with fails = 50 and
--     the old trigger would have reopened it at the next failing row of class issue-2380, a fix judged by failures from before it was made (the contract read its first pass at 15:36:09Z, so the
--     live view lists nothing now). Counted from the close event the failures were 0.
--   * Population: 190 closed or resolved issues carry an active or holding contract; 0 have no lifecycle close row, 0 have a close event earlier than updated_at, 143 are equal to the second and 47
--     are later (a writer closed without bumping updated_at). So today the change can only move a start later, which can only withdraw a reopen the old window would have made on failures that
--     preceded the closure; it adds none. An issue touched after its close (0 of the 190 today; 10 of 1139 closed issues with a lifecycle row over their whole history) is the case the worker already
--     handles and the one this file gives the SQL copies.
--   * The new texts were also run as plain SELECTs on live qnfo-audit at 15:42Z (read only): the new view body returns 0 rows (the live view 0), the new detector probe reads 0 against its expected 0,
--     and the window start of class issue-2380 reads 2026-10-19 15:28:29 (the old start 2026-10-17 14:58:26).
--
-- WHAT THIS CHANGES (each start expression becomes COALESCE(<close event>, <the old expression>); nothing else in either text moves)
--   remediation_reopen_on_relapse_d1  the one start expression in the failure count of its WHEN clause. The BEGIN..END body, the other conditions and the trigger header are byte-identical to the
--                                     live text (the suite replays the live text and compares). The added subquery sits in the WHEN count and writes nothing, so the trigger's write graph and its
--                                     depth are unchanged: remediation_verifications INSERT chain 5 (7 if a self-updating trigger counts once more) levels before and after (offline model in the suite; limit 10).
--   v_closure_relapses               the one start expression in x.fails. Columns, the closed_ms column (still the issue's last touch), the two-hour quiet guard and the twin column are unchanged.
--   fm-closure-relapse-unreopened    its probe starts the window the same way (guarded UPDATE: only a probe that does not mention issue_lifecycle yet), so the detector counts what the trigger acts on.
--   The close event is the newest issue_lifecycle row of event dispositioned or closed whose to_status is closed or resolved, ts cut to 19 characters with T replaced by a space (the worker's
--   rtCloseEventSince reads the same row; it also accepts a NULL to_status, and none of the 2025 close rows has one). An issue with no such row keeps the old start. The worker's revert switch
--   ops_config rt_close_event_anchor = off is not mirrored in SQL: the revert here is this file's Rollback line.
--
-- NOT IN THIS FILE: the hourly sweep recurrence_guard_tick (AFTER INSERT ON fleet_tick) is a fourth SQL copy of the window (datetime(a.updated_at / 1000, 'unixepoch')). fleet_tick is the cron heartbeat,
--   so a recreate there is its own change with its own depth proof; it is filed as VERIFICATION-PATH-3 below with a probe. Until then a closure the sweep misses is reopened by the trigger.
--
-- BACKUP AND ROLLBACK: bak_20261019_relapse_window_objects holds the exact live text of both objects (type trigger and view), the old probe of fm-closure-relapse-unreopened (type contract-probe) and the old evidence of the
--   control row (type control-evidence), created ahead of every DROP and kept by IF NOT EXISTS on a re-apply. The Rollback line above restores both objects from the same text with line breaks
--   collapsed to single spaces (a header line cannot carry a newline); the backup table keeps the exact bytes. decision_log is append-only, so the decision row below stays.
--
-- Rows touched in live qnfo-audit: no existing verification, issue or contract verdict row changes. Schema objects replaced: 2. One probe replaced (fm-closure-relapse-unreopened), one control row's evidence
-- extended (relapse-reopen-window), one contract rescheduled (issue-100193), and registry rows added: one failure mode, one detector contract, one decision, one issue (VERIFICATION-PATH-3) with its probe.
--
-- Verify after apply:
--   SELECT COUNT(*) FROM sqlite_master WHERE name IN ('remediation_reopen_on_relapse_d1', 'v_closure_relapses') AND instr(sql, 'issue_lifecycle') > 0;   -- 2
--   SELECT COUNT(*) FROM v_closure_relapses;   -- 0 (it listed issue 2380 at 15:31Z, 0 rows at 15:43Z)
--   SELECT length(sql) FROM sqlite_master WHERE name = 'remediation_reopen_on_relapse_d1';   -- 3703

-- 1. Backup (ahead of every DROP; IF NOT EXISTS keeps the first copy when the file is applied again)
CREATE TABLE IF NOT EXISTS bak_20261019_relapse_window_objects AS
  SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master
  WHERE (type = 'trigger' AND name = 'remediation_reopen_on_relapse_d1') OR (type = 'view' AND name = 'v_closure_relapses')
  UNION ALL
  SELECT 'contract-probe', class, 'remediation_contracts', verify_probe, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'
  UNION ALL
  SELECT 'control-evidence', control, 'control_registry', evidence, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM control_registry WHERE control = 'relapse-reopen-window';

-- 2. The trigger: live text with the one start expression replaced (the depth canary of the migration runner restores the old text if D1 refuses it)
DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1;

CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 0 AND COALESCE(NEW.observed, '') <> '' AND (lower(trim(NEW.observed)) NOT LIKE 'pending%' OR (NEW.observed GLOB '*[0-9]*' AND (NEW.observed LIKE '%ceiling%' OR lower(NEW.observed) LIKE '%target%' OR lower(NEW.observed) LIKE '%threshold%' OR lower(NEW.observed) LIKE '%limit%' OR lower(NEW.observed) LIKE '%fewer than%' OR lower(NEW.observed) LIKE '%more than%' OR NEW.observed LIKE '% <= %' OR NEW.observed LIKE '% >= %' OR NEW.observed LIKE '% < %' OR NEW.observed LIKE '% > %')))
  AND EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
              WHERE c.class = NEW.class AND c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class
                  AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN agent_issues o ON o.status = 'open' AND o.id <> a.id
                    AND lower(trim(o.title)) = lower(trim(a.title)) WHERE c.class = NEW.class)
  AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = NEW.class AND v.pass = 0 AND COALESCE(v.observed, '') <> ''
         AND (lower(trim(v.observed)) NOT LIKE 'pending%' OR (v.observed GLOB '*[0-9]*' AND (v.observed LIKE '%ceiling%' OR lower(v.observed) LIKE '%target%' OR lower(v.observed) LIKE '%threshold%' OR lower(v.observed) LIKE '%limit%' OR lower(v.observed) LIKE '%fewer than%' OR lower(v.observed) LIKE '%more than%' OR v.observed LIKE '% <= %' OR v.observed LIKE '% >= %' OR v.observed LIKE '% < %' OR v.observed LIKE '% > %')))
         AND v.verified_at > MAX(
           (SELECT COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch'))
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

-- 3. The view: live text with the one start expression replaced
DROP VIEW IF EXISTS v_closure_relapses;

CREATE VIEW v_closure_relapses AS
SELECT x.issue_id, x.class, x.status, x.closed_ms, x.close_evidence, x.fails, x.last_observed, x.max_attempts,
  (SELECT MIN(o.id) FROM agent_issues o WHERE o.status = 'open' AND o.id <> x.issue_id AND lower(trim(o.title)) = lower(trim(x.title))) AS twin_issue_id
FROM (
  SELECT c.issue_id, c.class, a.status, a.title, c.max_attempts, t.close_evidence, a.updated_at AS closed_ms,
    (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0
       AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%'
       AND v.verified_at > MAX(COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch')),
             COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails,
    (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed
  FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id
  WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer'
    AND CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END < CAST(strftime('%s', 'now') AS INTEGER) - 7200
    AND lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) <> 'superseded' AND lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) <> 'moot'
) x
WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3))
  AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%';

-- 4. The standing detector reads the window the trigger acts on (guarded: a second apply changes nothing)
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN (''active'', ''holding'') AND a.status IN (''closed'', ''resolved'') AND NOT (lower(substr(COALESCE(t.close_evidence, ''''), 1, 10)) = ''superseded'' OR lower(substr(COALESCE(t.close_evidence, ''''), 1, 4)) = ''moot'') AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '''') <> '''' AND lower(trim(v.observed)) NOT LIKE ''pending%'' AND v.verified_at > MAX(COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), ''T'', '' '') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN (''dispositioned'', ''closed'') AND l.to_status IN (''closed'', ''resolved'')), datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, ''unixepoch'')), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), ''1970-01-01''))) >= MAX(1, COALESCE(c.max_attempts, 3))) AS TEXT) AS observed'
 WHERE class = 'fm-closure-relapse-unreopened' AND instr(verify_probe, 'issue_lifecycle') = 0;

-- 5. Failure mode, its detector (a regression guard: an edited older migration or a hand patch that recreates either object from the old text), the control row and the 100193 contract
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('relapse-window-sql-twin-anchor',
  'the SQL copies of the relapse window start at agent_issues.updated_at while the worker starts at the close event, so one closure is judged by two windows',
  'rtReopenOnRelapse moved to the issue_lifecycle close event in qnfo-fleet-control 0.38.0 and the D1 trigger remediation_reopen_on_relapse_d1, the view v_closure_relapses and the probe of fm-closure-relapse-unreopened kept counting failures since updated_at, which annotations and writers that never set it move; issue 2380 was closed 2026-10-19T15:28:29Z with an updated_at two days older and 50 failures from before the close; two older migrations (2026-10-12-25-recurrence-guard-twin.sql, 2026-10-17-measured-pending-triggers.sql) drop and recreate the trigger and recreate it from the old text if edited and applied again',
  'VERIFICATION-PATH-2 (migrations/2026-10-19-relapse-window-close-event.sql): the trigger, the view and the detector probe start the window at the newest issue_lifecycle close row and fall back to updated_at; fm-relapse-window-sql-twin-anchor reads sqlite_master so a recreate from the old text is found within the hour; the sweep recurrence_guard_tick is VERIFICATION-PATH-3',
  'both remediation_reopen_on_relapse_d1 and v_closure_relapses mention issue_lifecycle and dispositioned in sqlite_master',
  'fm-relapse-window-sql-twin-anchor', '2026-10-19', 100193,
  'a migration or a hand patch recreates remediation_reopen_on_relapse_d1 or v_closure_relapses from the text that starts the window at updated_at',
  'sqlite_master text of either object without issue_lifecycle; a closed issue listed by v_closure_relapses with failures that all precede its close event',
  'a fix judged by failures from before it was made is reopened, or a closure touched after its close is judged late; fm-closure-relapse-unreopened and the closure-relapse reading of the worker disagree');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-relapse-window-sql-twin-anchor', NULL, 'VERIFICATION-PATH-2', 'failure-mode detector',
  'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name IN (''remediation_reopen_on_relapse_d1'', ''v_closure_relapses'') AND instr(sql, ''issue_lifecycle'') > 0 AND instr(sql, ''dispositioned'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

UPDATE control_registry SET evidence = replace(evidence, 'The SQL twin keeps the old start until VERIFICATION-PATH-2.', 'VERIFICATION-PATH-2 2026-10-19 (agent_issues 100193, migrations/2026-10-19-relapse-window-close-event.sql): the SQL twins (the D1 trigger remediation_reopen_on_relapse_d1, the view v_closure_relapses and the probe of fm-closure-relapse-unreopened) now start the window at the same close event with the same updated_at fallback; recurrence_guard_tick keeps the old start until VERIFICATION-PATH-3.'),
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE control = 'relapse-reopen-window' AND instr(evidence, 'The SQL twin keeps the old start until VERIFICATION-PATH-2.') > 0;

-- the contract of issue 100193 keeps its probe (both objects mention issue_lifecycle in sqlite_master); it is only rescheduled so the next tick reads the new state
UPDATE remediation_contracts SET next_due_at = datetime('now')
 WHERE class = 'issue-100193' AND module = 'verification-path' AND status = 'active' AND COALESCE(last_verdict, '') <> 'pass';

-- 6. The fourth copy of the window (the hourly sweep), filed with its probe. Single-row VALUES insert: agent_issues refuses the INSERT .. SELECT shape at compile time.
INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'VERIFICATION-PATH-3: recurrence_guard_tick still starts its relapse window at agent_issues.updated_at',
 'Charter pillar: autonomy. VERIFICATION-PATH-2 (migrations/2026-10-19-relapse-window-close-event.sql, agent_issues 100193) moved the D1 trigger remediation_reopen_on_relapse_d1, the view v_closure_relapses and the probe of fm-closure-relapse-unreopened to the issue_lifecycle close event, as the worker has been since qnfo-fleet-control 0.38.0. A fourth SQL copy of the window is the hourly sweep recurrence_guard_tick (AFTER INSERT ON fleet_tick in qnfo-audit): the SELECT that fills recurrence_guard_actions counts failures since datetime(a.updated_at / 1000, ''unixepoch'') and the sweep reopens the closed issues it names. It was left out of VERIFICATION-PATH-2 on purpose: fleet_tick is the cron heartbeat, a recreate that is refused or aborts stops the tick (the incident of 2026-10-12 in migrations/2026-10-12-25-recurrence-guard-twin.sql), and the sweep does not decide a window that the trigger decides: a closure the sweep skips because its start is too early is reopened by the trigger at the next failing verification of its class.' || char(10) ||
 'Edit (one migration with APPLY-BY ci, DB qnfo-audit, a Rollback line and a BACKUP table holding the current trigger text): in the failure count of recurrence_guard_tick replace datetime(a.updated_at / 1000, ''unixepoch'') with COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), ''T'', '' '') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN (''dispositioned'', ''closed'') AND l.to_status IN (''closed'', ''resolved'')), datetime(a.updated_at / 1000, ''unixepoch'')) and keep every other character of the text. Run the trigger-depth model of migrations/relapse-window-close-event.test.mjs with fleet_tick INSERT as the root first; the D1-TRIGGER-DEPTH-RESTORE-1 canary restores the old trigger if the replacement is refused.' || char(10) ||
 'Definition of done: recurrence_guard_tick mentions issue_lifecycle in sqlite_master. The d1-query contract on this issue reads that.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name = ''recurrence_guard_tick'' AND instr(sql, ''issue_lifecycle'') > 0) AS TEXT) AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = NULL, module = 'verification-path',
  precondition = 'the hourly sweep recurrence_guard_tick still starts its relapse window at agent_issues.updated_at',
  action = 'one migration puts the issue_lifecycle close event at the start of the window in recurrence_guard_tick, with its own trigger-depth proof from fleet_tick',
  escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-3:%' AND status = 'open')
   AND COALESCE(module, '') <> 'verification-path'
   AND EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-3:%' AND status = 'open');

-- 7. The decision (append-only)
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a relapse is a failure after the closure, so every copy of the rule starts its window at the closure event and not at the last time anything touched the row; the worker already does',
  'VERIFICATION-PATH-2: remediation_reopen_on_relapse_d1, v_closure_relapses and the probe of fm-closure-relapse-unreopened start the failure window at the newest issue_lifecycle row of event dispositioned or closed that landed on closed or resolved, with agent_issues.updated_at as the fallback; the trigger body and every other condition are byte-identical; recurrence_guard_tick (a fourth copy) is filed as VERIFICATION-PATH-3 and left alone',
  'qnfo-audit 2026-10-19: 190 closed or resolved issues carry an active or holding contract, 0 without a lifecycle close row, 0 whose close event precedes updated_at, 47 whose close event follows it; issue 2380 closed 15:28:29Z with updated_at 2026-10-17 14:58:26 and 50 failing rows all before the close, listed by v_closure_relapses at 15:31Z (its contract read pass at 15:36Z) and exposed to the old trigger, 0 failures counted from the close event; new view body 0 rows and new detector probe 0 on live at 15:42Z; trigger-depth model: remediation_verifications INSERT chain 5 (7 if a self-updating trigger counts once more) before and after',
  'migration merged',
  'two schema objects replaced in place (trigger body unchanged), one detector probe, one control row evidence, one contract rescheduled; no issue, verdict or verification row changes; no live row changes membership of v_closure_relapses (0 rows now and 0 with the new text)',
  'the Rollback header restores both objects (line breaks collapsed) and the detector probe from bak_20261019_relapse_window_objects, which holds the exact old text',
  'the SQL relapse rule judges a closure by when it closed, as the worker does',
  'failure_modes_recurring <= 12 within 6 h',
  'none',
  'offline node:sqlite suite migrations/relapse-window-close-event.test.mjs (52 live triggers and the live DDL replayed, the live trigger text compared character for character); qnfo-audit sqlite_master, issue_lifecycle, remediation_verifications, v_closure_relapses (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-2:') = 1);
