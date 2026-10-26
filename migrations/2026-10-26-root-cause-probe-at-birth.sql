-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, close_channel = 'rollback:ROOT-CAUSE-PROBE-AT-BIRTH-1' WHERE title = 'ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin' AND status = 'open'
-- ROOT-CAUSE-PROBE-AT-BIRTH-1 (2026-10-26, charter pillar autonomy; follows ISSUE-HYGIENE-1 to -6 and the issue-family throughput rule ISSUE-THROUGHPUT-1).
-- WHAT WAS FOUND (read 2026-10-26 from live qnfo-audit, read-only): the management-personas workflow (fleet_tasks id management-personas, step rc-file) files a 'ROOT-CAUSE-1: <family> keeps
--   recurring' ticket when a family was reopened. 10 such tickets were open, all filed in the last 24 hours, and each was born with the generic superseded contract
--   (VACUOUS-PROBE-V3-1, module probe-template-v3-generic), so each bred a PROBE-NEEDED-1 twin: 16 PROBE-NEEDED-1 tickets were open. The workflow already knows when a ticket is done (step
--   rc-close closes it when v_root_cause_quiet lists it, with evidence), but the contract never says so, so the probe-needed filer sees an open issue that stands without a probe.
-- WHAT THIS FILE DOES: files one issue with a doer (the management-personas workflow) and a closing probe that is true when no open ROOT-CAUSE-1 ticket stands on a superseded contract.
--   The file does not change the workflow (a stored definition owned by that loop) and closes none of the tickets. The rollback closes the issue (an issue is never deleted).
-- spof-review: none added. No DELETE or DROP runs in this file, so it names no BACKUP table.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin',
  'Charter pillar: autonomy. Read 2026-10-26: the management-personas workflow (step rc-file) filed 10 ROOT-CAUSE-1 tickets in 24 hours; each was born with the generic superseded contract, so each bred a PROBE-NEEDED-1 ticket (16 open). The workflow closes a ticket itself when the family stops recurring (step rc-close, view v_root_cause_quiet, with evidence), but the ticket''s contract does not say so.' || char(10) ||
  'Doer: the management-personas workflow (fleet_tasks id management-personas, owned by its loop). Add a step after rc-file that sets the contract of each new ROOT-CAUSE-1 ticket (class issue-<id>, status superseded, action starting VACUOUS-PROBE-V3-1) to a d1-query probe on its own closing condition: expected 1, observed the count of v_root_cause_quiet rows for that issue id, status active. The new step is guarded by the superseded status and the vacuous action text, so a contract another doer wrote is left alone. Add the step by a migration with a backup of the definition and a Rollback, as the sweep migrations do, and record the decision.' || char(10) ||
  'Definition of done: no open ROOT-CAUSE-1 ticket stands on a superseded contract (the probe below reads 0), and the PROBE-NEEDED-1 twins of closed or probed tickets close through the issue-meta-fold rule.' || char(10) ||
  'Probe: SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN remediation_contracts c ON c.class = ''issue-'' || a.id WHERE a.status = ''open'' AND a.title LIKE ''ROOT-CAUSE-1:%'' AND c.status = ''superseded'') AS TEXT) AS observed (reads 10 on 2026-10-26).',
  'session', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin' AND status = 'open');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
SELECT 'issue-' || a.id, a.id, 'ROOT-CAUSE-PROBE-AT-BIRTH-1', 'probe', 'SELECT 1 AS expected, 1 AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'superseded', 'root-cause-probe-at-birth-1', datetime('now')
FROM agent_issues a WHERE a.title = 'ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin' AND a.status = 'open';

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN remediation_contracts c ON c.class = ''issue-'' || a.id WHERE a.status = ''open'' AND a.title LIKE ''ROOT-CAUSE-1:%'' AND c.status = ''superseded'') AS TEXT) AS observed',
    verify_transport = 'd1-query',
    action = 'MEASURES the closing condition: no open ROOT-CAUSE-1 ticket stands on a superseded (vacuous) contract. ROOT-CAUSE-PROBE-AT-BIRTH-1.',
    status = 'active', last_verdict = NULL, attempts = 0, module = 'root-cause-probe-at-birth-1', next_due_at = datetime('now')
WHERE class = (SELECT 'issue-' || id FROM agent_issues WHERE title = 'ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin' AND status = 'open' ORDER BY id DESC LIMIT 1)
  AND status = 'superseded';
