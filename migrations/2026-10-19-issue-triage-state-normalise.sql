-- TRIAGE-STATE-NORMALISE-1 (2026-10-19, pillar autonomy; owner directives OWNER-NO-LOOSE-ENDS-1, 2026-10-08 "never silently drop an issue" and
-- 2026-10-19 "do any issues affect fleet's own loops? audit, resolve and remediate all such failure modes and their root causes").
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 12:10-12:30Z, SELECT only)
-- agent_issues 2957 (METRIC-REGRESSION-1: open_agent_issues, a real regression: 7-day mean 181.6 against 131.3 the week before) is
-- status open while its issue_triage row says triage_state closed with close_evidence "superseded by 1798 (...)" from 2026-10-18 17:02Z.
-- 1798 closed on 2026-10-19 06:00:56Z, the improvement loop filed the same title again at 06:01:10Z, and the D1 trigger
-- issue_refile_reopen (BEFORE INSERT on agent_issues, DOCTRINE-1) reopened the closed row: it sets agent_issues.status = 'open' and
-- appends a REOPENED note, and it never reads issue_triage. Every other reopen writer resets the triage row in the same step
-- (recurrence_guard_tick, remediation_reopen_on_relapse_d1, breach-ticket-reopen, the dashboard and backlog-exec reopen paths:
-- triage_state 'triaged', reopened_count + 1, the closure text cleared or amended). This one does not, so:
--   * the row keeps a closure claim ("superseded by 1798") that no longer holds, and an open issue reads as closed to any view that
--     joins issue_triage;
--   * its contract stayed superseded (circular-probe-deprecated), so the one open tracker of the open-issue growth had no probe;
--   * issue_close_evidence_required accepts the stale text as evidence for the next close.
-- It is not the only row: four METRIC-TRIGGER tickets parked as monitoring (2167, 2193, 2487, 2816) carry the same state (closed on
-- 10-15..10-17, reopened by a refile within 24 h of the close, which is the one reopen path that does not reset triage, and parked on
-- 10-18 12:19Z with the triage row still closed). Measured 2026-10-19 12:50Z: of 170 open and 35 monitoring issues (every one has a triage
-- row) exactly these five have a closure state; all others read triaged. The open count was 214 at 11:00Z; the defect does not depend on it.
--
-- WHAT THIS CHANGES
--   1. Backups first (bak_20261019_*): the old trigger text, the triage and agent_issues state of every row the file touches, and the
--      contract rows it changes. A re-run keeps the first backup.
--   2. One-time normalise: every open or monitoring issue whose triage_state is a closure state goes back to 'triaged', reopened_count + 1
--      (the refile reopen was never counted), close_evidence cleared (the same convention as recurrence_guard_tick; the old text is in
--      bak_20261019_triage_state_rows). Status is untouched, so no issue changes disposition and no lifecycle row is added.
--   3. Structural fix: issue_refile_reopen is recreated with its body byte-for-byte unchanged plus ONE added statement ahead of the final
--      RAISE(IGNORE): the issue_triage row of the row it just reopened is reset the way the other reopen writers reset it. The row is found
--      by the REOPENED marker the trigger's own first statement wrote in the same statement (SQLite holds 'now' constant for one
--      statement), so a reopen that agent_issues_reopen_open_twin_guard skipped touches nothing and a legitimate open twin keeps its triage.
--   4. (taken out of this file on landing, 2026-10-19) the parked monitoring twins are NOT superseded here. The four monitoring rows that
--      carry a closed triage row (2167, 2193, 2487, 2816) are four of the 33 METRIC-TRIGGER tickets parked as 'monitoring' beside an open
--      ticket of the same trigger, and migrations/2026-10-19-metric-twin-supersede.sql supersedes all 33 in one bounded, backed-up set of
--      statements. Step 2 therefore leaves a monitoring row alone while an open ticket of the same trigger exists (the twin file's own
--      premise, the same expression), so no row is handled by both files, whichever runs first: the twin file closes that row with fresh
--      evidence, this file never rewrites its triage row. A monitoring row with no open ticket of its trigger is normalised here.
--   5. The contract of 2957 (superseded since the stale closure) is re-armed with a probe that measures the real defect, the open-issue
--      trend, not the bookkeeping: it passes when the 7-day mean is within 10 % of the week before. The bookkeeping defect has its own
--      detector, fm-refile-reopen-leaves-triage-closed (zero open or monitoring issues with a closed triage row), so fixing the triage
--      row can never close the regression issue by itself.
--   6. failure_modes row and detector contract, control_registry row for the trigger (a guard on the critical issue-filing path), a
--      capability_ledger row and the decision_log row (append-only).
--
-- TRIGGER DEPTH (AGENT-ISSUES-TRIGGER-DEPTH-1, D1-TRIGGER-DEPTH-1: D1 refuses a write whose trigger programs nest more than 10 levels,
-- counted at compile time, and the agent_issues graph already sits at that limit). This file adds no trigger and replaces one in place.
-- The added statement is UPDATE issue_triage, whose triggers (triage_close_sync_issue_upd and its siblings) write agent_issues. The
-- INSERT path of agent_issues already holds exactly that shape: agent_issues_autotriage2_ins (AFTER INSERT) -> INSERT issue_triage ->
-- triage_close_sync_issue_ins -> UPDATE agent_issues. issue_refile_reopen -> UPDATE issue_triage -> triage_close_sync_issue_upd ->
-- UPDATE agent_issues is the same chain at the same level, so the deepest chain through INSERT agent_issues does not grow. In compile
-- order the trigger's first statement (UPDATE agent_issues) already compiles every agent_issues UPDATE program at level 2; the added
-- statement only adds the issue_triage UPDATE programs at level 2, and their children are those same programs, already compiled. The
-- offline suite (migrations/issue-triage-normalise.test.mjs) computes the longest chain of distinct triggers over the live trigger
-- graph read on 2026-10-19 for the old and the new body (5 and 5 for INSERT agent_issues, for every other write root alike) and
-- requires them equal. The apply runner's canary (D1-TRIGGER-DEPTH-RESTORE-1) probes UPDATE and DELETE on the tables upstream of
-- agent_issues and restores the standing definition if one is refused; its INSERT probe is advisory only, so the equality above is the
-- proof for the insert path. After the deploy, the first rows the fleet files (agent_issues ids keep advancing, no cloud_ops_events
-- text naming "nested too deep") are the live confirmation.
--
-- spof-review: no new component; the replaced trigger keeps its alternate path: agent_issues_open_dup_annotate counts a refile on an open twin, recurrence_guard_tick and breach-ticket-reopen reopen closed tickets by their own rules, and the hourly detector fm-refile-reopen-leaves-triage-closed finds any row this trigger or another writer leaves closed.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_refile_reopen_trigger
-- Rollback: DROP TRIGGER IF EXISTS issue_refile_reopen; CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000)) BEGIN UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1): the same title was filed again within 24 h of the close, by ' || COALESCE(NEW.source, '?') || '.' WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1); SELECT RAISE(IGNORE); END; UPDATE remediation_contracts SET status = b.status, last_verdict = b.last_verdict, last_attempt_at = b.last_attempt_at, verify_probe = b.verify_probe, verify_transport = b.verify_transport, precondition = b.precondition, action = b.action, module = b.module, attempts = b.attempts, next_due_at = b.next_due_at, expected_cadence_h = b.expected_cadence_h, max_attempts = b.max_attempts FROM bak_20261019_triage_state_contracts b WHERE b.class = remediation_contracts.class; UPDATE issue_triage SET triage_state = b.triage_state, close_evidence = b.close_evidence, reopened_count = b.reopened_count FROM bak_20261019_triage_state_rows b WHERE b.step = 'stale-open' AND b.issue_id = issue_triage.issue_id; UPDATE agent_issues SET status = b.agent_status, updated_at = b.agent_updated_at FROM bak_20261019_triage_state_rows b WHERE b.step = 'stale-open' AND b.issue_id = agent_issues.id AND agent_issues.status <> b.agent_status; DELETE FROM remediation_contracts WHERE class = 'fm-refile-reopen-leaves-triage-closed'; DELETE FROM failure_modes WHERE fm_key = 'refile-reopen-leaves-triage-closed'; DELETE FROM control_registry WHERE control = 'issue_refile_reopen'; DELETE FROM capability_ledger WHERE capability = 'issue-triage-follows-refile-reopen';
--
-- Verify after apply:
--   SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN ('open','monitoring') AND t.triage_state = 'closed';   -- 0
--   SELECT instr(sql, 'REOPENED ') > 0 AND instr(sql, 'UPDATE issue_triage') > 0 FROM sqlite_master WHERE name = 'issue_refile_reopen';                  -- 1
--   SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = 2957 AND t.triage_state = 'triaged';                       -- 1 (the four monitoring twins read closed until the twin file has run)
--   SELECT status, last_verdict FROM remediation_contracts WHERE class = 'issue-2957';                                                                   -- active, NULL then the 7-day-mean verdict

-- 1. Backups
CREATE TABLE IF NOT EXISTS bak_20261019_refile_reopen_trigger AS
  SELECT name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
  FROM sqlite_master WHERE type = 'trigger' AND name = 'issue_refile_reopen';

CREATE TABLE IF NOT EXISTS bak_20261019_triage_state_rows (
  step TEXT NOT NULL, issue_id INTEGER NOT NULL, agent_status TEXT, agent_updated_at INTEGER, agent_close_channel TEXT,
  rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), PRIMARY KEY (step, issue_id));

CREATE TABLE IF NOT EXISTS bak_20261019_triage_state_contracts (
  step TEXT NOT NULL, class TEXT NOT NULL, issue_id INTEGER, status TEXT, last_verdict TEXT, last_attempt_at TEXT,
  verify_probe TEXT, verify_transport TEXT, precondition TEXT, action TEXT, module TEXT, attempts INTEGER, next_due_at TEXT,
  expected_cadence_h INTEGER, max_attempts INTEGER,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), PRIMARY KEY (step, class));

-- 2. One-time normalise of every open or monitoring issue whose triage row still says closed (except a monitoring twin of an open ticket of its trigger)
INSERT OR IGNORE INTO bak_20261019_triage_state_rows (step, issue_id, agent_status, agent_updated_at, agent_close_channel, rc, triage_state, owner, sla_due_at, triaged_at, remediation, close_evidence, reopened_count)
  SELECT 'stale-open', t.issue_id, a.status, a.updated_at, a.close_channel, t.rc, t.triage_state, t.owner, t.sla_due_at, t.triaged_at, t.remediation, t.close_evidence, t.reopened_count
  FROM issue_triage t JOIN agent_issues a ON a.id = t.issue_id
  WHERE a.status IN ('open', 'monitoring')
    AND t.triage_state IN ('closed', 'closed-refuted', 'closed-by-classification', 'closed-verified-fixed', 'resolved', 'resolved-refuted', 'wontfix')
    -- a monitoring twin of an open ticket of the same trigger belongs to migrations/2026-10-19-metric-twin-supersede.sql
    AND NOT (a.status = 'monitoring' AND a.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
      AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> a.id AND o.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
                    AND substr(o.title, 16, instr(substr(o.title, 16), '-') - 1) = substr(a.title, 16, instr(substr(a.title, 16), '-') - 1)));

INSERT OR IGNORE INTO bak_20261019_triage_state_contracts (step, class, issue_id, status, last_verdict, last_attempt_at, verify_probe, verify_transport, precondition, action, module, attempts, next_due_at, expected_cadence_h, max_attempts)
  SELECT 'rearm', c.class, c.issue_id, c.status, c.last_verdict, c.last_attempt_at, c.verify_probe, c.verify_transport, c.precondition, c.action, c.module, c.attempts, c.next_due_at, c.expected_cadence_h, c.max_attempts
  FROM remediation_contracts c
  WHERE c.class = 'issue-2957' AND c.status = 'superseded' AND c.last_verdict = 'superseded:closure-superseded'
    AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2957 AND status = 'open');

UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
WHERE triage_state IN ('closed', 'closed-refuted', 'closed-by-classification', 'closed-verified-fixed', 'resolved', 'resolved-refuted', 'wontfix')
  AND issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status IN ('open', 'monitoring')
    -- a monitoring twin of an open ticket of the same trigger belongs to migrations/2026-10-19-metric-twin-supersede.sql
    AND NOT (a.status = 'monitoring' AND a.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
      AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> a.id AND o.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
                    AND substr(o.title, 16, instr(substr(o.title, 16), '-') - 1) = substr(a.title, 16, instr(substr(a.title, 16), '-') - 1))));

-- 3. The contract of 2957 measures the open-issue trend (the verdict that the stale closure had superseded)
UPDATE remediation_contracts SET status = 'active', verify_transport = 'd1-query', module = 'triage-state-normalise-1', attempts = 0,
  last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3,
  precondition = 'METRIC-REGRESSION-1 for open_agent_issues: a trend, not a bookkeeping fault (TRIAGE-STATE-NORMALISE-1 repaired the triage row that had read closed)',
  action = 'the backlog drain (qnfo-backlog-exec, the code loop) lowers the open-issue count; this probe passes when the 7-day mean is within 10 % of the week before, and the improvement loop (IL-DEFECT-ONLY-1) closes the issue on its own recovery evidence',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM metric_history WHERE metric = ''open_agent_issues'' AND day > date(''now'', ''-7 days'')) < 4 OR (SELECT COUNT(*) FROM metric_history WHERE metric = ''open_agent_issues'' AND day <= date(''now'', ''-7 days'') AND day > date(''now'', ''-14 days'')) < 4 THEN ''unmeasured'' WHEN (SELECT AVG(value) FROM metric_history WHERE metric = ''open_agent_issues'' AND day > date(''now'', ''-7 days'')) <= (SELECT AVG(value) FROM metric_history WHERE metric = ''open_agent_issues'' AND day <= date(''now'', ''-7 days'') AND day > date(''now'', ''-14 days'')) * 1.1 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'issue-2957' AND status = 'superseded' AND last_verdict = 'superseded:closure-superseded'
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2957 AND status = 'open');

-- 4. (removed on landing) the parked monitoring twins are superseded by migrations/2026-10-19-metric-twin-supersede.sql, all 33 of them.

-- 5. Failure mode and detector (the detector exists whether or not step 6 is accepted by the depth canary)
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('refile-reopen-leaves-triage-closed', 'an issue reopened by the refile trigger keeps a closed issue_triage row',
  'issue_refile_reopen (BEFORE INSERT on agent_issues) set status open and a REOPENED note and never read issue_triage, while every other reopen writer resets the triage row; the closure text of the old disposition stayed on a live issue',
  'TRIAGE-STATE-NORMALISE-1: the trigger resets the triage row of the row it reopened (triaged, closure text cleared, reopened_count + 1); the one open stale row (2957) was normalised once and the four monitoring twins with a closed triage row are closed by migrations/2026-10-19-metric-twin-supersede.sql; the detector reads any writer that leaves one',
  'no open or monitoring issue has a closed triage row', 'fm-refile-reopen-leaves-triage-closed', '2026-10-15', 2957,
  'a closed issue is filed again within 24 h of its close and is reopened by issue_refile_reopen',
  'an open issue whose issue_triage.triage_state is closed and whose close_evidence still says superseded or recovered; its contract superseded, so no probe watches it',
  'the open-issue views that join issue_triage, issue_close_evidence_required (stale text counts as evidence), and the one open tracker of a regression (2957) having no probe');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-refile-reopen-leaves-triage-closed', NULL, 'TRIAGE-STATE-NORMALISE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN (''open'', ''monitoring'') AND t.triage_state IN (''closed'', ''closed-refuted'', ''closed-by-classification'', ''closed-verified-fixed'', ''resolved'', ''resolved-refuted'', ''wontfix'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

-- 6. The structural fix: issue_refile_reopen with its body unchanged plus one statement
DROP TRIGGER IF EXISTS issue_refile_reopen;

CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1): the same title was filed again within 24 h of the close, by ' || COALESCE(NEW.source, '?') || '.'
  WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
    AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT r.id FROM agent_issues r WHERE r.title = NEW.title AND r.status = 'open'
    AND instr(COALESCE(r.description, ''), 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1)') > 0);
  SELECT RAISE(IGNORE);
END;

-- 7. Registry rows and the decision
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('issue_refile_reopen', 'qnfo-audit D1 trigger issue_refile_reopen (migrations/2026-10-08-12-doctrine.sql; TRIAGE-STATE-NORMALISE-1 in migrations/2026-10-19-issue-triage-state-normalise.sql)', 'guard',
        'a closed issue filed again within 24 h would vanish (RAISE(IGNORE)) or duplicate; the trigger reopens the closed row, notes the refile and ignores the insert',
        0, 'keep', 'applied',
        'agent_issues_open_dup_annotate counts a refile on an open twin; recurrence_guard_tick, remediation_reopen_on_relapse_d1 and breach-ticket-reopen reopen closed tickets by their own rules; fm-refile-reopen-leaves-triage-closed finds any reopen that leaves a closed triage row',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'Reviewed 2026-10-19 (TRIAGE-STATE-NORMALISE-1): the trigger is kept and now resets the issue_triage row of the issue it reopens, as every other reopen writer does. Measured 2026-10-19 12:50Z: 5 of 205 open or monitoring issues had a closed triage row, each reopened within 24 h of its close; after this file and the twin file 0.',
        2957, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('issue-triage-follows-refile-reopen', 'TRIAGE-STATE-NORMALISE-1 (migrations/2026-10-19-issue-triage-state-normalise.sql)',
        'D1 triggers issue_refile_reopen, agent_issues_reopen_open_twin_guard and the issue_triage sync triggers',
        'offline suite migrations/issue-triage-normalise.test.mjs (live trigger texts replayed); fm-refile-reopen-leaves-triage-closed hourly',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
        'A refiled issue is reopened with its triage row, so the open-issue views, the close-evidence rule and the contract flow read one state; no writer can leave an open issue with a closure claim without the detector naming it.');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'an open issue must not carry a closure claim: the triage row of a reopened issue is part of the reopen, as every other reopen writer treats it; a monitoring twin that another migration supersedes is left to that migration',
  'TRIAGE-STATE-NORMALISE-1: issue_refile_reopen resets the issue_triage row of the issue it reopens; 2957, the one open issue with a closed triage row, is normalised (the four monitoring rows 2167, 2193, 2487 and 2816 with a closed triage row are twins that migrations/2026-10-19-metric-twin-supersede.sql closes); the contract of 2957 measures the open-issue trend; failure mode refile-reopen-leaves-triage-closed with its detector',
  'd1 qnfo-audit 2026-10-19: 2957 open with triage closed ("superseded by 1798") after the reopen at 06:01:10Z by issue_refile_reopen (issue_lifecycle 3755); 170 open and 35 monitoring issues at 12:50Z (214 open at 11:00Z), exactly five with a closed triage row; every other reopen writer resets triage (recurrence_guard_tick, remediation_reopen_on_relapse_d1, breach-ticket-reopen); the four monitoring rows with a closed triage row are twins of an open ticket of the same trigger; sqlite_master and the trigger depth chain read, offline suite migrations/issue-triage-normalise.test.mjs',
  'migration merged',
  'one trigger replaced in place (body unchanged plus one statement), one issue_triage row (2957), one contract re-armed, registry rows; no issue changes status; the twins, the successors and every other row are untouched',
  'bak_20261019_refile_reopen_trigger, bak_20261019_triage_state_rows and bak_20261019_triage_state_contracts hold the old trigger text and every changed row; the Rollback header restores them (this decision row stays: decision_log is append-only)',
  'a reopened issue carries one state across agent_issues and issue_triage',
  'no open or monitoring issue has a closed triage row at any hourly probe of fm-refile-reopen-leaves-triage-closed; 2957 stays open with an active probe until the open-issue trend recovers',
  'none',
  'd1:qnfo-audit agent_issues, issue_triage, issue_lifecycle, remediation_contracts, sqlite_master (SELECT only); offline node:sqlite suite migrations/issue-triage-normalise.test.mjs replays the live trigger texts, then this file twice, then its Rollback line'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'TRIAGE-STATE-NORMALISE-1:') = 1);
