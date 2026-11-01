-- ISSUE-BIRTH-DOER-PROBE-1 (#5447, agent_issues 1000814; charter pillar autonomy, program QNFO.OPS).
-- Live read 2026-11-01: 388 open issues; issue_drain_ratio_24h 0.881, issues_unprobed_60m 194,
-- issue_wontfix_share_7d 0, remediation_latest_pass_pct_7d 78.6. Monitoring a filing loop's
-- promise to close is not a defect check. Queue the existing probe agent at birth and repair
-- these placeholders regardless of their status; keep specialized probes and validators.
-- No new issue trigger, cron, credential, direct close, or change to the agent's batch cap.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_issue_birth_workflows
-- Rollback: UPDATE fleet_tasks SET definition = b.definition, version = fleet_tasks.version + 1 FROM bak_20261101_issue_birth_workflows b WHERE fleet_tasks.id = b.id; DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins; CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END; UPDATE issue_triage SET owner = b.owner, rc = b.rc FROM bak_20261101_issue_birth_owners b WHERE issue_triage.issue_id = b.issue_id AND issue_triage.rc = 'ISSUE-BIRTH-DOER-PROBE-1'; UPDATE remediation_contracts SET verify_probe = b.verify_probe, precondition = b.precondition, module = b.module FROM bak_20261101_issue_backlog_contract b WHERE remediation_contracts.class = b.class; DROP VIEW IF EXISTS v_issue_probe_intake; DROP VIEW IF EXISTS v_issue_birth_owner

CREATE TABLE IF NOT EXISTS bak_20261101_issue_birth_workflows AS
SELECT id, definition, version FROM fleet_tasks WHERE id IN ('issue-probe-agent', 'issue-meta-fold');
CREATE TABLE IF NOT EXISTS bak_20261101_issue_birth_owners AS
SELECT issue_id, owner, rc FROM issue_triage WHERE rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops';
CREATE TABLE IF NOT EXISTS bak_20261101_issue_backlog_contract AS
SELECT * FROM remediation_contracts WHERE class = 'issue-1000814';

CREATE VIEW IF NOT EXISTS v_issue_birth_owner AS
SELECT a.id AS issue_id, COALESCE(
  (SELECT t.owner FROM analytics_metric_triggers t JOIN service_registry s ON s.service = t.owner
   WHERE a.title LIKE 'METRIC-TRIGGER-%' AND t.id = CAST(substr(a.title, 16) AS INTEGER)),
  (SELECT s.service FROM service_registry s
   WHERE instr(COALESCE(a.description, ''), 'code-task: repo=qnfo-workers path=' || s.service || '/') > 0),
  (SELECT s.service FROM issue_source_hosts m JOIN service_registry s ON s.service = m.host AND s.state = 'live'
   WHERE m.source = a.source),
  (SELECT s.service FROM service_registry s WHERE s.state = 'live'
   AND (a.source = s.service OR instr(a.source, s.service || ':') = 1 OR instr(a.source, s.service || '-') = 1)
   ORDER BY length(s.service) DESC, s.service LIMIT 1),
  'qnfo-fleet-control') AS owner
FROM agent_issues a;

-- Only missing, retired, or known closure-observing templates need synthesis. In particular,
-- monitoring metric templates remain valid; status alone neither proves nor disproves a probe.
CREATE VIEW IF NOT EXISTS v_issue_probe_intake AS
SELECT a.id AS issue_id, a.priority,
  'Issue #' || a.id || ' in the QNFO fleet needs a defect check.' || char(10) ||
  'Title: ' || a.title || char(10) || 'Description: ' || substr(COALESCE(a.description, ''), 1, 2500) || char(10) ||
  'Write one read-only SQL check on qnfo-audit. Use fleet_sql to read the relevant tables and run the check before answering. ' ||
  'One SELECT or WITH statement, no semicolon, one row with text columns expected and observed. ' ||
  'They must differ while the defect exists and match only when it is gone. Measure the defect itself, never this issue, its triage, contract, or verification status. ' ||
  'Answer only JSON: {"verdict":"probe","probe":"SELECT ...","observed_now":"result of your check","why":"one sentence"}. ' ||
  'If qnfo-audit cannot measure the defect, answer {"verdict":"none","why":"one sentence"}.' AS prompt
FROM agent_issues a LEFT JOIN remediation_contracts c ON c.class = 'issue-' || a.id
WHERE a.status = 'open'
  AND (COALESCE(c.status, 'none') NOT IN ('active', 'monitoring', 'holding')
       OR (c.module IN ('birth', 'probe-template-v3-generic', 'probe-template-v2-loop',
                        'probe-template-v2c-loop', 'probe-template-v2d-loop')
           AND (c.verify_probe = 'needs-machine-probe' OR instr(lower(c.verify_probe), 'agent_issues') > 0)
           OR c.action LIKE 'VACUOUS-PROBE%')
          AND c.precondition <> 'ISSUE-PROBE-AGENT-1')
  AND a.title NOT LIKE 'PROBE-NEEDED-1%' AND a.title NOT LIKE 'ROOT-CAUSE-1%'
  AND a.title NOT LIKE 'TOOL-FAILURE:%' AND a.title NOT LIKE 'SELF-AUDIT-TOOLERR:%'
  AND a.title NOT LIKE '[self-heal] tool %';

-- Edit steps by name, not array offset; retain the installed rejection and apply validators.
UPDATE fleet_tasks
SET definition = json_set(definition,
  '$.steps[' || (SELECT key FROM json_each(definition, '$.steps')
                WHERE json_extract(value, '$.name') = 'probe-request') || '].sql',
  'INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT ''issue-probe-agent'', ''run'', v.prompt, ''probe-issue-'' || v.issue_id, v.priority FROM v_issue_probe_intake v WHERE COALESCE((SELECT value FROM ops_config WHERE key = ''issue_probe_agent''), ''on'') <> ''off'' AND NOT EXISTS (SELECT 1 FROM issue_probe_requests q WHERE q.issue_id = v.issue_id AND q.requested_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AND NOT EXISTS (SELECT 1 FROM cf_agent_requests r WHERE r.requester = ''issue-probe-agent'' AND r.instance = ''probe-issue-'' || v.issue_id AND r.status IN (''queued'', ''running'')) ORDER BY CASE v.priority WHEN ''critical'' THEN 0 WHEN ''high'' THEN 1 WHEN ''medium'' THEN 2 WHEN ''low'' THEN 3 ELSE 4 END, v.issue_id LIMIT CAST(COALESCE((SELECT value FROM ops_config WHERE key = ''issue_probe_agent_per_hour''), ''12'') AS INTEGER)'),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'issue-probe-agent' AND instr(definition, 'FROM v_issue_probe_intake v') = 0;

-- An agent answer may arrive after a specialized probe was installed. Never overwrite it.
UPDATE fleet_tasks
SET definition = json_set(definition,
  '$.steps[' || (SELECT key FROM json_each(definition, '$.steps')
                WHERE json_extract(value, '$.name') = 'probe-apply') || '].sql',
  json_extract(definition, '$.steps[' || (SELECT key FROM json_each(definition, '$.steps')
                WHERE json_extract(value, '$.name') = 'probe-apply') || '].sql') ||
  ' AND issue_id IN (SELECT issue_id FROM v_issue_probe_intake)'),
  version = version + 1
WHERE id = 'issue-probe-agent' AND instr(definition, 'AND issue_id IN (SELECT issue_id FROM v_issue_probe_intake)') = 0;

DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins;
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open'
BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id, 'ISSUE-BIRTH-DOER-PROBE-1', 'triaged', owner, datetime('now')
  FROM v_issue_birth_owner WHERE issue_id = NEW.id;
  UPDATE issue_triage SET owner = (SELECT owner FROM v_issue_birth_owner WHERE issue_id = NEW.id),
    rc = 'ISSUE-BIRTH-DOER-PROBE-1'
  WHERE issue_id = NEW.id AND rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops';
  INSERT OR IGNORE INTO remediation_contracts
    (class, issue_id, precondition, action, verify_probe, verify_transport,
     max_attempts, escalate_to, expected_cadence_h, status, module)
  SELECT 'issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)',
    'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1,
    'needs-machine-probe', 'birth'
  WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE issue_id = NEW.id);
  INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority)
  SELECT 'issue-probe-agent', 'run', prompt, 'probe-issue-' || issue_id, priority
  FROM v_issue_probe_intake WHERE issue_id = NEW.id
    AND COALESCE((SELECT value FROM ops_config WHERE key = 'issue_probe_agent'), 'on') <> 'off'
    AND NOT EXISTS (SELECT 1 FROM cf_agent_requests
                    WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id);
  INSERT OR IGNORE INTO issue_probe_requests (issue_id, request_id, requested_at)
  SELECT NEW.id, id, created_at FROM cf_agent_requests
  WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id
  ORDER BY id DESC LIMIT 1;
END;

UPDATE issue_triage SET owner = (SELECT owner FROM v_issue_birth_owner WHERE issue_id = issue_triage.issue_id),
  rc = 'ISSUE-BIRTH-DOER-PROBE-1'
WHERE rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops'
  AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

-- Prepend a ledger-only rule; the existing workflow settles contracts and closes with evidence.
UPDATE fleet_tasks
SET definition = json_set(definition, '$.steps', json((
  SELECT json_group_array(json(step)) FROM (
    SELECT -1 AS ord, json_object('type', 'sql', 'db', 'AUDIT', 'sql',
      'INSERT INTO issue_fold_ledger (issue_id, rule, successor_id, evidence, agent_status, agent_updated_at, agent_close_channel, triage_state, triage_close_evidence, triage_reopened_count, triage_triaged_at, contract_class, contract_status, contract_last_verdict, contract_last_attempt_at) SELECT m.id, ''probe-needed-target-check-applied'', p.issue_id, ''moot: issue '' || p.issue_id || '' has a defect check applied by issue-probe-agent request '' || p.request_id || '' at '' || p.applied_at || ''; the requested probe exists, while the target remains independently verified.'', m.status, m.updated_at, m.close_channel, t.triage_state, t.close_evidence, t.reopened_count, t.triaged_at, c.class, c.status, c.last_verdict, c.last_attempt_at FROM agent_issues m JOIN issue_triage t ON t.issue_id = m.id LEFT JOIN remediation_contracts c ON c.class = ''issue-'' || m.id JOIN issue_probe_requests p ON p.issue_id = CAST(substr(m.title, 23) AS INTEGER) JOIN remediation_contracts target ON target.class = ''issue-'' || p.issue_id AND target.verify_probe = p.probe AND target.precondition = ''ISSUE-PROBE-AGENT-1'' WHERE m.status = ''open'' AND m.title GLOB ''PROBE-NEEDED-1: issue-[0-9]*'' AND p.applied_at IS NOT NULL AND target.status IN (''active'', ''monitoring'', ''holding'') AND NOT EXISTS (SELECT 1 FROM issue_fold_ledger f WHERE f.issue_id = m.id AND f.applied = 0) ORDER BY m.id LIMIT 200') AS step
    UNION ALL SELECT CAST(key AS INTEGER), value FROM json_each(fleet_tasks.definition, '$.steps')
    ORDER BY ord
  )
))), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'issue-meta-fold' AND instr(definition, 'probe-needed-target-check-applied') = 0;

-- The owner task's existing probe counted contract presence, not a remedy or VALUE-DASH-1.
-- Keep it open until the same backlog figures improve AND yield, quality, evidence and budget
-- guards agree on fresh readings. Zero spend or missing observations cannot pass.
UPDATE remediation_contracts SET precondition = 'ISSUE-BIRTH-DOER-PROBE-1: backlog and value readback',
  module = 'issue-birth-doer-probe',
  verify_probe = 'WITH m AS (SELECT MAX(CASE WHEN metric = ''issues_unprobed_60m'' THEN CAST(last_value AS REAL) END) AS unprobed, MAX(CASE WHEN metric = ''issue_drain_ratio_24h'' THEN CAST(last_value AS REAL) END) AS drain, MAX(CASE WHEN metric = ''issue_wontfix_share_7d'' THEN CAST(last_value AS REAL) END) AS wontfix, MAX(CASE WHEN metric = ''remediation_latest_pass_pct_7d'' THEN CAST(last_value AS REAL) END) AS passes, MAX(CASE WHEN metric = ''output_quality_outcomes_worse'' THEN CAST(last_value AS REAL) END) AS worse, COUNT(*) AS fresh FROM metric_registry WHERE metric IN (''issues_unprobed_60m'', ''issue_drain_ratio_24h'', ''issue_wontfix_share_7d'', ''remediation_latest_pass_pct_7d'', ''output_quality_outcomes_worse'', ''cost_usd_30d'', ''publications_30d'', ''papers_with_open_high_errata_pct'') AND last_value IS NOT NULL AND trim(last_value) <> '''' AND datetime(last_refreshed) >= datetime(''now'', ''-120 minutes'')) SELECT ''ok'' AS expected, CASE WHEN m.fresh = 8 AND m.unprobed < 194 AND m.drain > 0.881 AND m.wontfix = 0 AND m.passes >= 78.6 AND m.worse = 0 AND EXISTS (SELECT 1 FROM v_value_for_money WHERE rung = ''R1 correct (no open high-severity erratum)'' AND units_30d > 0 AND usd_per_unit > 0 AND usd_per_unit < 1.540858941594465) AND EXISTS (SELECT 1 FROM fleet_budget WHERE node_class = ''cost:fleet_all_in_month'' AND current > 0 AND cap > 0 AND current <= cap AND datetime(updated_at) >= datetime(''now'', ''-120 minutes'')) THEN ''ok'' ELSE ''pending: backlog, yield, quality, evidence or monthly budget has not recovered on fresh measurements'' END AS observed FROM m'
WHERE class = 'issue-1000814' AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id)
VALUES ('issue-birth-probe-placeholder', 'An issue has ownership but no defect check',
  'The probe agent excluded active and monitoring birth placeholders and waited 120 minutes to start',
  'ISSUE-BIRTH-DOER-PROBE-1 queues probe synthesis at birth and repairs known placeholders',
  'fm-issue-birth-probe-placeholder', 'fm-issue-birth-probe-placeholder', '2026-11-01', 1000814);
INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h)
VALUES ('fm-issue-birth-probe-placeholder', 'ISSUE-BIRTH-DOER-PROBE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_issue_probe_intake v JOIN agent_issues a ON a.id = v.issue_id WHERE a.created_at < CAST(strftime(''%s'', ''now'', ''-120 minutes'') AS INTEGER) * 1000',
  'd1-query', 'qnfo-fleet-control', 1);
INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
   predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:QNFO.OPS', 'A loop-owned status placeholder is not an automatic defect check',
  'ISSUE-BIRTH-DOER-PROBE-1: route birth owners, queue probe synthesis, repair placeholders, fold fulfilled probe requests',
  '2026-11-01 read: 388 open; drain ratio 0.881; unprobed 194; wontfix share 0; latest pass pct 78.6; R1 usd/unit 1.540858941594465; quality outcomes worse 0; monthly cost 532.95 exceeds cap 300',
  'pending canonical migration and hourly workflow readback; no live improvement claimed',
  'issue birth triage, existing probe-agent and meta-fold workflows',
  'Rollback line of migrations/2026-11-01-issue-birth-doer-probe.sql',
  'every unknown issue family enters an owned automatic probe path at birth',
  'issues_unprobed_60m decreases from 194; drain ratio increases from 0.881 without worse evidence guards',
  'no new spend route; compare yield per $100, output quality, and monthly budget before closing 1000814',
  'SQLite birth, specialized-template race, rejection, recovery, meta-fold, replay and rollback tests'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ISSUE-BIRTH-DOER-PROBE-1:%');
