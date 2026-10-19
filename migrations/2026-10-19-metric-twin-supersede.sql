-- METRIC-TWIN-SUPERSEDE-1 (2026-10-19, pillar autonomy; owner directives OWNER-NO-LOOSE-ENDS-1 and "never silently drop an issue", CLAUDE.md section 6).
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 14:50-15:20Z, SELECT only)
-- 33 METRIC-TRIGGER triggers each carry TWO live tickets: an older one parked as status 'monitoring' and a newer-or-older one 'open', same
-- title, same trigger id (33 pairs, 66 rows; the 33 are every monitoring issue in agent_issues; none is claimed by a session, all are category
-- reliability, all 33 contracts read status monitoring, 29 triage rows read triaged and four read closed with a stale closure text). They were
-- made by one event: at 2026-10-18 12:19:49Z a batch moved 33 open tickets to 'monitoring' (issue_lifecycle 'reopened' open -> monitoring), and
-- the filer (qnfo-fleet-control evaluateMetricTriggers) then saw no 'open' row for those triggers and filed a new open ticket, at 12:21Z to
-- 14:13Z. Two tickets for one breach means two owners, two contracts and an open-issue count that includes duplicates (issue 2957 is a
-- regression of that count), and the older ticket holds a contract that no loop closes.
--
-- WHAT THIS CHANGES (33 monitoring rows at the time of reading; the statements read the live state, they name no ids)
--   A twin is an issue with status 'monitoring' and a title METRIC-TRIGGER-<n>-... for which another issue with status 'open' carries the
--   same trigger id <n> (compared whole: 37 is not 371). For every twin, in one bounded set (at most 200 per statement):
--   1. its rows are saved first (agent_issues status, updated_at, close_channel, its issue_triage state, evidence and reopened_count, its
--      contract class, status and verdict) in bak_20261019_metric_twin_rows, one row per issue, the first backup kept on a re-run;
--   2. its issue_triage row is closed with close_evidence "superseded by <open ticket id> (<its title>, open): ..." (the live supersede
--      convention: the evidence starts with the successor's id; the D1 trigger triage_superseded_contracts_upd reads it);
--   3. its contract (status monitoring, which that trigger does not touch) is set to status superseded, last_verdict superseded:closure-
--      superseded, as every other superseded closure does;
--   4. its issue is closed (status closed, close_channel migration:METRIC-TWIN-SUPERSEDE-1), which writes the issue_lifecycle row
--      'dispositioned' with has_evidence 1 (v_issue_accounting counts it as closed with disposition; nothing is deleted, nothing is wontfix).
--   The open ticket is kept untouched: it keeps its description, its claim (linked_session), its contract and its triage row.
--   Idempotent: a second apply finds no monitoring twin and writes nothing; the statements also tolerate a twin that another file closed first.
--   Not double-handled: migrations/2026-10-19-issue-triage-state-normalise.sql leaves a monitoring row alone while an open ticket of the same
--   trigger exists (the same expression as below), and migrations/2026-10-19-remedy-efficacy-per-trigger.sql no longer closes 2665. Each of the
--   three files can run first and the end state is the same (offline suite migrations/metric-twin-supersede.test.mjs runs both orders).
--
-- PREVENTION (what exists, what this adds, what it deliberately does not add)
--   * The filer already dedupes against 'monitoring' and 'closed' tickets, not only 'open' ones: METRIC-TRIGGER-TWIN-1 (qnfo-fleet-control
--     0.33.16, live in 0.37.0) looks up status open, monitoring or closed by the whole title, prefers open, then monitoring, then closed, and
--     REOPENS the parked twin instead of inserting. Measured: the newest open ticket of the 33 pairs was filed at 2026-10-18 14:13:55Z, before
--     that deploy, and no pair has been made since. So the premise "the filer only dedupes against open" no longer holds on main.
--   * A D1 BEFORE INSERT trigger that attaches a new ticket to a parked twin by trigger id (to cover a changed title or a second writer) is NOT
--     added: agent_issues carries 24 triggers and AGENT-ISSUES-TRIGGER-DEPTH-1/-2 (migrations/2026-10-17-consolidate-agent-issues-ts-triggers.sql,
--     2026-10-18-close-binds-to-probe.sql) record that adding one to that graph is the change that produced "triggers nested too deep" and
--     stopped every write that touches issue_triage and remediation_verifications. A partial unique index on the trigger id is not added
--     either: a reopen of a second row would abort inside whichever trigger or loop ran it (the 2026-10-18 fleet_tick outage had that shape).
--   * What is added is a detector (an fm- contract, hourly, d1-query): fm-metric-ticket-twin-split reads the number of triggers with more than one
--     open or monitoring ticket and must be 0, so a recurrence by a changed title or another writer is found within the hour with the
--     trigger id, and this file's statements are the reviewed remedy to run for it.
--
-- RESIDUAL RISK (stated, not hidden): breach-ticket-reopen reopens the newest non-open ticket of a breaching trigger that has no open one, and
-- the filer's TWIN-1 reopen picks among closed tickets of one title without an order. For four triggers (371, 1238, 3060, 4989) the twin that
-- this file closes has a higher id than the open ticket, so after the open ticket closes on recovery either path may reopen the superseded
-- twin. It is then an open ticket whose triage row still reads closed ("superseded by <id>"), which fm-refile-reopen-leaves-triage-closed
-- (TRIAGE-STATE-NORMALISE-1) reports within the hour; the breach keeps a ticket either way, so v_breaches_without_ticket stays 0.
--
-- Revert: restore status, close_channel and the triage and contract fields from bak_20261019_metric_twin_rows (the Rollback line does it).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_metric_twin_rows
-- Rollback: UPDATE issue_triage SET triage_state = (SELECT b.triage_state FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = issue_triage.issue_id), close_evidence = (SELECT b.triage_close_evidence FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = issue_triage.issue_id), reopened_count = (SELECT b.triage_reopened_count FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = issue_triage.issue_id), triaged_at = (SELECT b.triage_triaged_at FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261019_metric_twin_rows); UPDATE agent_issues SET status = (SELECT b.agent_status FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = agent_issues.id), close_channel = (SELECT b.agent_close_channel FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = agent_issues.id), updated_at = (SELECT b.agent_updated_at FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = agent_issues.id) WHERE id IN (SELECT issue_id FROM bak_20261019_metric_twin_rows) AND status = 'closed' AND close_channel = 'migration:METRIC-TWIN-SUPERSEDE-1 superseded'; UPDATE remediation_contracts SET status = (SELECT b.contract_status FROM bak_20261019_metric_twin_rows b WHERE b.contract_class = remediation_contracts.class), last_verdict = (SELECT b.contract_last_verdict FROM bak_20261019_metric_twin_rows b WHERE b.contract_class = remediation_contracts.class), last_attempt_at = (SELECT b.contract_last_attempt_at FROM bak_20261019_metric_twin_rows b WHERE b.contract_class = remediation_contracts.class) WHERE class IN (SELECT contract_class FROM bak_20261019_metric_twin_rows WHERE contract_class IS NOT NULL) AND status = 'superseded' AND last_verdict LIKE 'superseded:closure-superseded%'; DELETE FROM remediation_contracts WHERE class = 'fm-metric-ticket-twin-split'; DELETE FROM failure_modes WHERE fm_key = 'metric-ticket-twin-split'
--
-- Verify after apply:
--   SELECT COUNT(*) FROM agent_issues WHERE status = 'monitoring' AND title LIKE 'METRIC-TRIGGER-%';                                      -- 0
--   SELECT COUNT(*) FROM bak_20261019_metric_twin_rows;                                                                                    -- 33 at the first apply
--   SELECT COUNT(*) FROM v_breaches_without_ticket;                                                                                        -- unchanged by this file

-- 1. Backup (one row per twin; the first row kept on a re-run)
CREATE TABLE IF NOT EXISTS bak_20261019_metric_twin_rows (
  issue_id INTEGER PRIMARY KEY, successor_id INTEGER NOT NULL, agent_status TEXT, agent_updated_at INTEGER, agent_close_channel TEXT,
  triage_state TEXT, triage_close_evidence TEXT, triage_reopened_count INTEGER, triage_triaged_at TEXT,
  contract_class TEXT, contract_status TEXT, contract_last_verdict TEXT, contract_last_attempt_at TEXT,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));

INSERT OR IGNORE INTO bak_20261019_metric_twin_rows (issue_id, successor_id, agent_status, agent_updated_at, agent_close_channel, triage_state, triage_close_evidence, triage_reopened_count, triage_triaged_at, contract_class, contract_status, contract_last_verdict, contract_last_attempt_at)
SELECT m.id,
  (SELECT MIN(o.id) FROM agent_issues o WHERE o.status = 'open' AND o.id <> m.id AND o.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
     AND substr(o.title, 16, instr(substr(o.title, 16), '-') - 1) = substr(m.title, 16, instr(substr(m.title, 16), '-') - 1)),
  m.status, m.updated_at, m.close_channel, t.triage_state, t.close_evidence, t.reopened_count, t.triaged_at, c.class, c.status, c.last_verdict, c.last_attempt_at
FROM agent_issues m
LEFT JOIN issue_triage t ON t.issue_id = m.id
LEFT JOIN remediation_contracts c ON c.class = 'issue-' || m.id
WHERE m.status = 'monitoring' AND m.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
  AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> m.id AND o.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
                AND substr(o.title, 16, instr(substr(o.title, 16), '-') - 1) = substr(m.title, 16, instr(substr(m.title, 16), '-') - 1))
ORDER BY m.id LIMIT 200;

-- 2. The twin's triage row names its successor (the open ticket of the same trigger with the lowest id)
UPDATE issue_triage SET triage_state = 'closed', triaged_at = datetime('now'),
  close_evidence = 'superseded by ' || (SELECT b.successor_id FROM bak_20261019_metric_twin_rows b WHERE b.issue_id = issue_triage.issue_id)
    || ' (' || (SELECT substr(o.title, 1, 100) FROM agent_issues o JOIN bak_20261019_metric_twin_rows b ON b.successor_id = o.id WHERE b.issue_id = issue_triage.issue_id)
    || ', open): the parked monitoring copy of the same trigger ticket; the open ticket carries the breach, its closing probe and its owner, so this copy adds no work. METRIC-TWIN-SUPERSEDE-1 2026-10-19.'
WHERE issue_id IN (
  SELECT m.id FROM agent_issues m
   WHERE m.status = 'monitoring' AND m.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
     AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> m.id AND o.title GLOB 'METRIC-TRIGGER-[0-9]*-*'
                   AND substr(o.title, 16, instr(substr(o.title, 16), '-') - 1) = substr(m.title, 16, instr(substr(m.title, 16), '-') - 1))
   ORDER BY m.id LIMIT 200)
  AND issue_id IN (SELECT issue_id FROM bak_20261019_metric_twin_rows);

-- 3. Its contract (status monitoring) is superseded; the live trigger on the triage row only handles active, holding and probe-pending ones
UPDATE remediation_contracts SET status = 'superseded',
  last_verdict = 'superseded:closure-superseded (METRIC-TWIN-SUPERSEDE-1: monitoring twin of the open ticket of the same trigger)',
  last_attempt_at = datetime('now')
WHERE status IN ('monitoring', 'escalated', 'active', 'holding', 'needs-machine-probe', 'probe-review-refused')
  AND class IN (SELECT b.contract_class FROM bak_20261019_metric_twin_rows b
                  JOIN issue_triage t ON t.issue_id = b.issue_id
                  JOIN agent_issues m ON m.id = b.issue_id AND m.status = 'monitoring'
                 WHERE b.contract_class IS NOT NULL AND t.triage_state = 'closed' AND instr(t.close_evidence, 'METRIC-TWIN-SUPERSEDE-1') > 0);

-- 4. The twin is closed (issue_close_evidence_required reads the evidence of step 2; issue_lifecycle_au writes 'dispositioned' with evidence)
UPDATE agent_issues SET status = 'closed', close_channel = 'migration:METRIC-TWIN-SUPERSEDE-1 superseded',
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'monitoring' AND title GLOB 'METRIC-TRIGGER-[0-9]*-*'
  AND id IN (SELECT b.issue_id FROM bak_20261019_metric_twin_rows b JOIN issue_triage t ON t.issue_id = b.issue_id
              WHERE t.triage_state = 'closed' AND substr(t.close_evidence, 1, 14) = 'superseded by ' AND instr(t.close_evidence, 'METRIC-TWIN-SUPERSEDE-1') > 0);

-- 5. Failure mode and detector: a trigger with more than one open or monitoring ticket (a changed title, a second writer) is found within the hour
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('metric-ticket-twin-split',
  'one metric trigger carries two live tickets, an open one and a parked monitoring one (or two open ones under different titles)',
  'a batch parked 33 open METRIC-TRIGGER tickets as monitoring at 2026-10-18 12:19Z while the filer still deduped against open tickets only, so it filed a new open ticket for each breach; the filer has deduped against monitoring and closed tickets by whole title since 0.33.16 (METRIC-TRIGGER-TWIN-1), which a changed title or another writer does not reach',
  'METRIC-TWIN-SUPERSEDE-1: the 33 twins were superseded by their open ticket (backup, evidence naming the successor, contract superseded, lifecycle row); fm-metric-ticket-twin-split reads any recurrence per trigger id; no trigger or unique index is added to agent_issues (AGENT-ISSUES-TRIGGER-DEPTH-1)',
  'no trigger id has more than one open or monitoring METRIC-TRIGGER ticket', 'fm-metric-ticket-twin-split', '2026-10-18', NULL,
  'tickets of one trigger are parked as monitoring while the breach stands, or the ticket title changes, and the filer files again',
  'two tickets for one breach: two owners and two contracts, the open-issue count includes the copy, a parked contract that no loop closes',
  'the open-issue count (open_agent_issues, METRIC-REGRESSION-1 on it), remediation_contracts, v_breaches_without_ticket readers');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-metric-ticket-twin-split', NULL, 'METRIC-TWIN-SUPERSEDE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT 1 FROM agent_issues WHERE title GLOB ''METRIC-TRIGGER-[0-9]*-*'' AND status IN (''open'', ''monitoring'') GROUP BY substr(title, 16, instr(substr(title, 16), ''-'') - 1) HAVING COUNT(*) > 1)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

-- 6. The decision (append-only); the prediction is the one the rest of the sweep must not break: no breach is left without a ticket by this file
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-session-01JADz8uHqYt9eUMBTwbbBE6',
  'one breach has one ticket: a parked monitoring copy of an open METRIC-TRIGGER ticket adds no work, and superseding it by the open ticket (never wontfix, never delete) keeps every row accounted for',
  'METRIC-TWIN-SUPERSEDE-1: every monitoring METRIC-TRIGGER ticket that has an open ticket of the same trigger is superseded by it (triage evidence naming the successor, contract superseded, issue closed with its lifecycle row), backed up first; fm-metric-ticket-twin-split detects a recurrence; no agent_issues trigger or index is added',
  'd1 qnfo-audit 2026-10-19: 33 triggers with one open and one monitoring ticket of the same title (66 rows, 33 monitoring rows in all, none claimed, all reliability, contracts monitoring, 29 triage rows triaged and 4 closed); the newest open ticket of the pairs was filed 2026-10-18 14:13:55Z, before METRIC-TRIGGER-TWIN-1 reached the filer, and no pair has been made since; agent_issues has 24 triggers and AGENT-ISSUES-TRIGGER-DEPTH-1 forbids adding one; offline suite migrations/metric-twin-supersede.test.mjs',
  'migration merged',
  '33 monitoring agent_issues rows closed with evidence, their 33 issue_triage rows and 33 contracts; the 33 open tickets and every other row are untouched',
  'bak_20261019_metric_twin_rows and the Rollback header restore status, triage and contract of every twin (this decision row stays: decision_log is append-only)',
  'a metric breach is tracked by one ticket; a split is detected within the hour',
  'breaches_without_ticket <= 1 within 3 hours',
  'none',
  'd1:qnfo-audit agent_issues, issue_triage, remediation_contracts, issue_lifecycle, sqlite_master (SELECT only); offline node:sqlite suite replays the live triggers, applies this file twice, in both orders with the triage file, and its Rollback line'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'METRIC-TWIN-SUPERSEDE-1:') = 1);
