-- TOOL-ISSUE-SELFCLOSE-1 (2026-10-26, charter pillar autonomy; owner 2026-10-26: "identify and remediate root causes of repeated
-- errors/issues/failures systemwide"). Measured live at 06:55Z: 369 open agent_issues, 133 of them with no live verification path.
-- Their birth contract (the closure-observing template) was superseded by CLOSE-PROBE-CIRCULAR-1, which leaves the replacement to "a
-- doer that knows the defect", and for the tool-failure families no doer exists: 21 open TOOL-FAILURE / SELF-AUDIT-TOOLERR /
-- "[self-heal] tool" issues, one per single ops_ai_tool error event (a 60 s container timeout, one web_fetch 404), aged 39-77 h on
-- average, and qnfo-fleet-control REOPEN-LIVE-PATH-3 files a PROBE-NEEDED-1 duplicate for each one (38 open). This file gives every
-- such issue the probe that measures its defect: the tool's error share over the last 24 h of ops_ai_tool events, ok at or under
-- 15 % (or no calls). A tool that recovered closes its issue on the next remediation tick; one still failing (web_fetch 20/57,
-- github_issue_get 3/4 at 06:55Z) stays open with the live count as its observed value. The trigger applies the same probe whenever
-- the sweep supersedes a tool issue's birth contract, so new ones never wait for a doer.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_tool_issue_contracts
-- Rollback: DROP TRIGGER IF EXISTS tool_issue_probe_on_supersede; UPDATE remediation_contracts SET status = b.status, verify_probe = b.verify_probe, last_verdict = b.last_verdict FROM bak_20261026_tool_issue_contracts b WHERE remediation_contracts.class = b.class; DROP VIEW IF EXISTS v_tool_issue_probe;
-- spof-review: no new cron, binding or credential; one view, one trigger, one probe per issue.
CREATE TABLE IF NOT EXISTS bak_20261026_tool_issue_contracts AS SELECT * FROM remediation_contracts WHERE 0;
DROP VIEW IF EXISTS v_tool_issue_probe;
CREATE VIEW v_tool_issue_probe AS
SELECT t.id AS issue_id, t.tool,
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE(SUM(status = ''error''), 0) <= 0.15 * COUNT(*) THEN ''ok'' ELSE ''errors '' || SUM(status = ''error'') || ''/'' || COUNT(*) || '' in 24h'' END AS observed FROM cloud_ops_events WHERE kind = ''ops_ai_tool'' AND text = '''
    || replace(t.tool, '''', '''''') || ''' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')' AS probe
FROM (
  SELECT id, CASE
    WHEN title LIKE 'TOOL-FAILURE: % [%' THEN trim(substr(title, 15, instr(title, ' [') - 15))
    WHEN title LIKE 'SELF-AUDIT-TOOLERR: %' THEN trim(substr(title, 21))
    WHEN title LIKE '[self-heal] tool % %' THEN trim(substr(substr(title, 18), 1, instr(substr(title, 18), ' ') - 1))
  END AS tool
  FROM agent_issues
  WHERE title LIKE 'TOOL-FAILURE: %' OR title LIKE 'SELF-AUDIT-TOOLERR: %' OR title LIKE '[self-heal] tool %'
) t
WHERE t.tool IS NOT NULL AND t.tool != '';
INSERT INTO bak_20261026_tool_issue_contracts
SELECT rc.* FROM remediation_contracts rc JOIN v_tool_issue_probe v ON rc.class = 'issue-' || v.issue_id
JOIN agent_issues a ON a.id = v.issue_id
WHERE a.status = 'open' AND rc.status IN ('superseded', 'probe-review-refused', 'needs-machine-probe')
  AND NOT EXISTS (SELECT 1 FROM bak_20261026_tool_issue_contracts b WHERE b.class = rc.class);
UPDATE remediation_contracts SET
  verify_probe = (SELECT v.probe FROM v_tool_issue_probe v WHERE 'issue-' || v.issue_id = remediation_contracts.class),
  verify_transport = 'd1-query', status = 'active', last_verdict = 'TOOL-ISSUE-SELFCLOSE-1: probe measures the tool error share',
  attempts = 0, next_due_at = NULL, precondition = 'TOOL-ISSUE-SELFCLOSE-1'
WHERE class IN (SELECT class FROM bak_20261026_tool_issue_contracts);
DROP TRIGGER IF EXISTS tool_issue_probe_on_supersede;
CREATE TRIGGER tool_issue_probe_on_supersede AFTER UPDATE OF status ON remediation_contracts
WHEN NEW.status = 'superseded' AND NEW.class LIKE 'issue-%'
  AND EXISTS (SELECT 1 FROM v_tool_issue_probe v WHERE 'issue-' || v.issue_id = NEW.class)
BEGIN
  UPDATE remediation_contracts SET
    verify_probe = (SELECT v.probe FROM v_tool_issue_probe v WHERE 'issue-' || v.issue_id = NEW.class),
    verify_transport = 'd1-query', status = 'active', last_verdict = 'TOOL-ISSUE-SELFCLOSE-1: probe measures the tool error share',
    attempts = 0, next_due_at = NULL, precondition = 'TOOL-ISSUE-SELFCLOSE-1'
  WHERE class = NEW.class;
END;
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'tool-issue-no-probe', 'a tool-failure issue has no live probe, so it never closes and a PROBE-NEEDED-1 duplicate is filed for it',
  'the birth contract observes the issue status (circular) and CLOSE-PROBE-CIRCULAR-1 supersedes it, leaving the replacement to a doer that does not exist for single tool errors',
  'v_tool_issue_probe gives each tool issue a probe on the tool''s 24 h error share; trigger tool_issue_probe_on_supersede applies it whenever the birth contract is superseded',
  'fm-tool-issue-no-probe', 'fm-tool-issue-no-probe', '2026-10-26', NULL,
  'an open tool issue whose issue contract is not active', 'TOOL-FAILURE issues open for days with PROBE-NEEDED-1 twins', 'issue backlog and issue_drain_ratio_24h'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'tool-issue-no-probe');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-tool-issue-no-probe', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_tool_issue_probe v JOIN agent_issues a ON a.id = v.issue_id WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = ''issue-'' || v.issue_id AND c.status IN (''active'', ''monitoring'', ''holding''))) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'TOOL-ISSUE-SELFCLOSE-1', 'failure-mode detector', 'qnfo-fleet-control'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-tool-issue-no-probe');
-- EMPTY-REPLY-NOTHINK-1 (qnfo-code-orchestrator 0.28.1, same PR): the code loop's most repeated failure gets a failure mode and a detector,
-- so a recurrence after the retry ships is seen within the hour (4 or more empty-reply failures in 6 h).
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'code-loop-empty-reply', 'a code-loop rung answers with no content, the attempt is lost and the task ends CODE-LOOP-EXHAUSTED-1',
  'kimi-k2.7-code spends its whole output budget on reasoning (26 empty replies in 36 h on 2026-10-25/26)',
  'qnfo-code-orchestrator 0.28.1 asks an empty kimi reply once more in the same call with chat_template_kwargs.thinking false (event code-task.empty-retry)',
  'fm-code-loop-empty-reply', 'fm-code-loop-empty-reply', '2026-10-26', NULL,
  '4 or more code-task.fail events reading "the reply was empty" in 6 h', 'NO-PROGRESS-CEILING-1 and FAIL-SIGNATURE-STOP-1 end tasks after empty replies', 'every code task, so every issue the code loop is the doer for'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'code-loop-empty-reply');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-code-loop-empty-reply', NULL, 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-task.fail'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-6 hours'') AND instr(text, ''the reply was empty'') > 0) >= 4 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 1, 'active', 'EMPTY-REPLY-NOTHINK-1', 'failure-mode detector', 'qnfo-code-orchestrator'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-code-loop-empty-reply');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'a tool-failure issue is resolved when the tool''s recent error share is low',
  'every tool-failure issue gets a probe on its tool''s 24 h error share, now and whenever its birth contract is superseded (TOOL-ISSUE-SELFCLOSE-1)',
  '21 open tool issues and 38 PROBE-NEEDED-1 twins with no live probe at 06:55Z', 'applied', 'remediation_contracts rows of tool issues',
  'the Rollback line of migrations/2026-10-26-tool-issue-selfclose.sql', 'tool-failure issues close on recovery without a doer',
  'open TOOL-FAILURE issues fall from 15 to about 3 within 2 h', 'live D1 read of ops_ai_tool error shares'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'TOOL-ISSUE-SELFCLOSE-1') > 0);
