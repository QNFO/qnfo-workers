-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_probe_needed_b
-- Rollback: INSERT OR REPLACE INTO remediation_contracts SELECT * FROM bak_20261109_probe_needed_b;

-- PROBE-NEEDED-B-1 (2026-11-09, charter pillar autonomy). Ten PROBE-NEEDED-1 tickets (GitHub 8627 8445 8437 8384 8378 8195 8188 8187 8047 7969)
-- name issues whose contract measured nothing (born superseded, or refused by PROBE-REVIEW-1). Each contract is re-armed below with a probe that
-- measures the defect, or parked in status monitoring with a decision_log row naming the issue and its real closer. No probe reads the status of the
-- issue it covers. Verified live read-only before writing: issue-1001621 observed 5, issue-1001676 observed 2197 (both expected 0).

CREATE TABLE IF NOT EXISTS bak_20261109_probe_needed_b AS
SELECT * FROM remediation_contracts
WHERE class IN ('issue-1001621','issue-1001676','issue-1001734','issue-1001735','issue-1001815','issue-1001895','issue-1001975','issue-1002012','issue-1002091','issue-1002135');

-- 1001621 ROOT-CAUSE-1 CRON-FAULT-1: the ticket's own definition of done is a family with no reopen, no new issue and no live fault for 24 hours.
UPDATE remediation_contracts
SET verify_probe = 'SELECT 0 AS expected, (SELECT COUNT(*) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE a.title LIKE ''CRON-FAULT-1%'' AND l.event = ''reopened'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1 day'')) + (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''CRON-FAULT-1%'' AND created_at > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1 day'')) + (SELECT COUNT(*) FROM v_cron_fault_now) AS observed',
    verify_transport = 'd1-query', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: counts CRON-FAULT-1 reopens, new CRON-FAULT-1 issues and live cron faults in the last 24 hours; 0 only when the family has stopped recurring.'
WHERE class = 'issue-1001621' AND issue_id = 1001621;

-- 1001676 RETENTION-SWEEP-1: the done condition names the D1 overloaded error count in worker_logs (0 for 24 h).
UPDATE remediation_contracts
SET verify_probe = 'SELECT 0 AS expected, (SELECT COUNT(*) FROM worker_logs WHERE ingested_at > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1 day'') AND (logs_json LIKE ''%D1_ERROR%overloaded%'' OR exceptions_json LIKE ''%overloaded%'' OR logs_json LIKE ''%D1 DB is overloaded%'')) AS observed',
    verify_transport = 'd1-query', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: counts D1 overloaded errors in worker_logs over 24 hours (issue done condition: 0).'
WHERE class = 'issue-1001676' AND issue_id = 1001676;

-- 1002012 KG-NOTES-VAULT-1: the issue names notes_bridged on /kg/health as its closing measure ("above 0 closes this").
UPDATE remediation_contracts
SET verify_probe = '{"url": "https://qnfo-memory-mcp.q08.workers.dev/kg/health", "status": 200, "contains": "notes_bridged", "absent": "\"notes_bridged\":0,", "max_ms": 15000}',
    verify_transport = 'runner-https', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: passes once /kg/health reports notes_bridged above 0 (the owner uploads the vault markdown to qnfo-backups under vault/; the fleet curator does the rest).'
WHERE class = 'issue-1002012' AND issue_id = 1002012;

-- 1002091 ATLAS-HF-MIRROR-1: the issue's own runtime-probe line (the dataset page answers 200; today the Hugging Face API answers 401 for a missing dataset).
UPDATE remediation_contracts
SET verify_probe = '{"url": "https://huggingface.co/api/datasets/QNFO/ai-written-science-failures", "method": "GET", "check": "status", "expected": "200"}',
    verify_transport = 'external-https', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: the Hugging Face dataset API answers 200 only after the dataset exists (IDENTITY-BOUND: the owner mints the write token).'
WHERE class = 'issue-1002091' AND issue_id = 1002091;

-- 1001815 D1-QUERY-BUDGET-1: no wrapper exists on main (read 2026-11-09: the marker occurs only in a migration). The probe fails until the wrapper's code carries the marker.
UPDATE remediation_contracts
SET verify_probe = '{"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "D1-QUERY-BUDGET-1"}',
    verify_transport = 'code-read', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: passes when the shared D1 time and rows-read budget wrapper lands in the dashboard worker under the marker D1-QUERY-BUDGET-1 (code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js).'
WHERE class = 'issue-1001815' AND issue_id = 1001815;

-- 1001895 code-session pane: cmdCodeSessionFetch sends no x-agent-scope and no plan route is called (read 2026-11-09). Passes when the dashboard calls the plan route.
UPDATE remediation_contracts
SET verify_probe = '{"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "/plan\""}',
    verify_transport = 'code-read', status = 'active', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL,
    last_attempt_at = NULL, next_due_at = datetime('now'),
    action = 'PROBE-NEEDED-B-1: passes when the dashboard worker calls POST /code-sessions/<id>/plan (code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js).'
WHERE class = 'issue-1001895' AND issue_id = 1001895;

-- Parked by decision (the defect is only measurable by a phone-journey run, or only by an owner act on R2 that no fleet table records).
UPDATE remediation_contracts
SET status = 'monitoring', module = 'probe-needed-b', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = NULL,
    action = 'PROBE-NEEDED-B-1: parked by decision_log; the closer is named there. Not measurable from a fleet table.'
WHERE class IN ('issue-1001734','issue-1001735','issue-1001975','issue-1002135') AND issue_id IN (1001734,1001735,1001975,1002135);

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'qnfo-workers:PROBE-NEEDED-B-1',
       'issue-' || i || ' has no fleet table that records its defect; its closer is ' || c,
       'PROBE-NEEDED-B-1: parked the contract of issue-' || i || ' in status monitoring.',
       'Read 2026-11-09: contract status was probe-review-refused or superseded and its probe measured an unrelated row count.',
       'Contract monitoring; the issue stays open until its closer acts.',
       'remediation_contracts class issue-' || i || ' only.',
       'Rollback line restores the contract from bak_20261109_probe_needed_b; decision history stays append-only.',
       'The issue has a recorded closer instead of a vacuous probe.',
       'No false close from a self-confirming probe; the closer ends the issue.',
       'Four open critical issues stop reading as unowned.',
       'Read-only qnfo-audit queries; scripts/ux-journeys/file_issues.py close_gate (two passing runs) for the UX-SCREENS-1 rows.'
FROM (SELECT 1001734 AS i, 'scripts/ux-journeys/file_issues.py, which closes a UX-SCREENS-1 issue on two clean public-app runs (close_channel auto:ux-journeys)' AS c
      UNION ALL SELECT 1001735, 'scripts/ux-journeys/file_issues.py, which closes the companion UX-SCREENS-1 issue on two clean local runs'
      UNION ALL SELECT 1001975, 'scripts/ux-journeys/file_issues.py, which closes the fleet UX-SCREENS-1 issue on two clean local runs'
      UNION ALL SELECT 1002135, 'the owner, who must put the original ADR-013 and ADR-014 text into the R2 objects (IDENTITY-BOUND: the originals exist only on the owner machine)')
WHERE EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'issue-' || i AND status = 'monitoring' AND module = 'probe-needed-b')
  AND NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'qnfo-workers:PROBE-NEEDED-B-1' AND action = 'PROBE-NEEDED-B-1: parked the contract of issue-' || i || ' in status monitoring.');
