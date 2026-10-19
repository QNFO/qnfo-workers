-- PROBE-LINE-SWEEP-1 (2026-10-19, pillar autonomy; owner 2026-10-19: "audit, resolve and remediate all failure modes and their root
-- causes"). An issue that names its closing probe on a line of its own (runtime-probe: {...} or code-probe: {...}, CLAUDE.md "Where
-- probes run") got that probe as its issue-<id> contract from two AFTER INSERT triggers on agent_issues
-- (agent_issues_runtime_probe_ins, agent_issues_code_probe_ins; migrations/2026-10-11-probe-birth-v2.sql). The 2026-10-18 trigger-depth
-- remediation dropped both (they are in bak_20261018_triggers and absent from sqlite_master; their UPDATE twins are still live), so since
-- then a new issue's probe line is ignored: ORPHAN-GUARD-BIRTH-1 writes a needs-machine-probe contract, contract_probe_templates_v3_generic
-- supersedes it as closure-observing, and the issue has no probe at all. It can never close on evidence and counts in
-- issues_unprobed_60m. Read 2026-10-19 06:50Z: 100039 (runtime-probe), 100040, 100041 and 100056 (code-probe) are open with only that
-- vacuous contract. The detector fm-probe-line-unparsed read 0 throughout, because it counted only status needs-machine-probe and the
-- template now leaves the row superseded.
-- The insert triggers are not re-created: trigger nesting is what D1 refused on 2026-10-18. A 10-minute fleet-exec workflow does the
-- same parse outside any trigger chain:
--   v_probe_line_pending  open issues with a probe line whose issue-<id> contract is missing, needs-machine-probe, or the vacuous
--                         closure-observing template (a probe set on purpose is never touched); transport NULL = the line does not parse
--   probe-line-sweep      ledger event, insert the missing contracts, arm the vacuous ones (runner-https or code-read, active, due now)
--   fm-probe-line-unparsed now counts v_probe_line_pending rows older than 20 minutes, parseable or not
-- The file runs the sweep once at apply. Stop without a deploy: UPDATE fleet_crons SET enabled = 0 WHERE name = 'probe-line-sweep-10m'.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'probe-line-sweep-10m'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'probe-line-sweep'; UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_probe_line_sweep b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_probe_line_sweep b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261019_probe_line_sweep b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_probe_line_sweep b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_probe_line_sweep); DELETE FROM failure_modes WHERE fm_key = 'probe-line-birth-dropped'

CREATE VIEW IF NOT EXISTS v_probe_line_pending AS
WITH p AS (
  SELECT a.id, a.created_at,
    CASE WHEN instr(a.description, 'runtime-probe: {') > 0 THEN substr(substr(a.description, instr(a.description, 'runtime-probe: {') + 15), 1, instr(substr(a.description, instr(a.description, 'runtime-probe: {') + 15), '}')) END AS rp,
    CASE WHEN instr(a.description, 'code-probe: {') > 0 THEN substr(substr(a.description, instr(a.description, 'code-probe: {') + 12), 1, instr(substr(a.description, instr(a.description, 'code-probe: {') + 12), '}')) END AS cp
  FROM agent_issues a
  WHERE a.status = 'open' AND (instr(a.description, 'runtime-probe: {') > 0 OR instr(a.description, 'code-probe: {') > 0)
), v AS (
  SELECT id, created_at, rp, cp,
    CASE
      WHEN rp IS NOT NULL AND json_valid(rp) THEN CASE WHEN json_extract(rp, '$.url') LIKE 'https://%'
        AND (json_type(rp, '$.contains') = 'text' OR json_type(rp, '$.absent') = 'text' OR json_type(rp, '$.status') = 'integer' OR json_type(rp, '$.min_version') = 'text')
        THEN 'runner-https' END
    END AS rt,
    CASE
      WHEN cp IS NOT NULL AND json_valid(cp) THEN CASE WHEN json_type(cp, '$.paths') = 'array' AND (json_type(cp, '$.contains') = 'text' OR json_type(cp, '$.absent') = 'text')
        THEN 'code-read' END
    END AS ct
  FROM p
)
SELECT 'issue-' || v.id AS class, v.id AS issue_id, v.created_at,
  COALESCE(v.rt, v.ct) AS transport,
  CASE WHEN v.rt IS NOT NULL THEN v.rp WHEN v.ct IS NOT NULL THEN v.cp END AS probe,
  CASE WHEN c.class IS NULL THEN 'missing' ELSE c.status END AS contract_state
FROM v LEFT JOIN remediation_contracts c ON c.class = 'issue-' || v.id
WHERE c.class IS NULL OR (c.status IN ('superseded', 'needs-machine-probe') AND (c.verify_probe = 'needs-machine-probe' OR (substr(c.verify_probe, 1, 29) = 'SELECT ''closed'' AS expected, ' AND instr(c.verify_probe, 'THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ') > 0)));

CREATE TABLE IF NOT EXISTS bak_20261019_probe_line_sweep AS
  SELECT * FROM remediation_contracts WHERE class = 'fm-probe-line-unparsed' OR class IN (SELECT class FROM v_probe_line_pending);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at, attempts) SELECT class, issue_id, 'probe line in the issue (PROBE-LINE-SWEEP-1)', 'the doer fixes the defect; scripts/remediation_consumer.py runs this probe and a pass closes the issue', probe, transport, 3, 'qnfo-fleet-control', 6, 'active', 'probe-line-sweep-v1', datetime('now'), 0 FROM v_probe_line_pending WHERE transport IS NOT NULL AND contract_state = 'missing';

UPDATE remediation_contracts SET verify_probe = (SELECT p.probe FROM v_probe_line_pending p WHERE p.class = remediation_contracts.class), verify_transport = (SELECT p.transport FROM v_probe_line_pending p WHERE p.class = remediation_contracts.class), status = 'active', module = 'probe-line-sweep-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 6, max_attempts = 3, precondition = 'probe line in the issue (PROBE-LINE-SWEEP-1)', action = 'the doer fixes the defect; scripts/remediation_consumer.py runs this probe and a pass closes the issue' WHERE class IN (SELECT class FROM v_probe_line_pending WHERE transport IS NOT NULL AND contract_state <> 'missing');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_probe_line_pending WHERE created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 1200) * 1000) AS TEXT) AS observed', next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE class = 'fm-probe-line-unparsed';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-line-birth-dropped', 'an issue filed with a runtime-probe or code-probe line gets no probe contract, so it can never close on evidence', 'the 2026-10-18 trigger-depth remediation dropped agent_issues_runtime_probe_ins and agent_issues_code_probe_ins (bak_20261018_triggers); the birth template then superseded the issue''s only contract as closure-observing, and fm-probe-line-unparsed counted only needs-machine-probe rows', 'PROBE-LINE-SWEEP-1: fleet_tasks probe-line-sweep every 10 minutes arms the contract from the line outside any trigger chain; fm-probe-line-unparsed reads v_probe_line_pending', 'no open issue keeps a probe line without a live contract for more than 20 minutes', 'fm-probe-line-unparsed', '2026-10-19', NULL, 'a trigger dropped for nesting depth with no replacement path', 'issues 100039, 100040, 100041, 100056 open with only a superseded closure-observing contract', 'every issue a session or loop files with its closing probe line');

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('probe-line-sweep', 'PROBE-LINE-SWEEP-1: an open issue''s runtime-probe or code-probe line becomes its live contract (replaces the insert triggers dropped 2026-10-18)', 'workflow',
  '{"steps":[{"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''probe-line-sweep-'' || strftime(''%Y%m%d%H%M'', ''now''), datetime(''now''), ''probe-line-sweep'', ''PROBE-LINE-SWEEP-1: '' || COUNT(*) || '' open issue(s) with a probe line and no live contract; armed: '' || COALESCE(group_concat(class, '' ''), ''none'') || ''; unparseable: '' || (SELECT COUNT(*) FROM v_probe_line_pending WHERE transport IS NULL), NULL, ''probe-line-sweep'', CASE WHEN (SELECT COUNT(*) FROM v_probe_line_pending WHERE transport IS NULL) > 0 THEN ''warn'' ELSE ''ok'' END FROM v_probe_line_pending WHERE transport IS NOT NULL"},{"type":"sql","name":"insert-missing","db":"AUDIT","sql":"INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at, attempts) SELECT class, issue_id, ''probe line in the issue (PROBE-LINE-SWEEP-1)'', ''the doer fixes the defect; scripts/remediation_consumer.py runs this probe and a pass closes the issue'', probe, transport, 3, ''qnfo-fleet-control'', 6, ''active'', ''probe-line-sweep-v1'', datetime(''now''), 0 FROM v_probe_line_pending WHERE transport IS NOT NULL AND contract_state = ''missing''"},{"type":"sql","name":"arm-vacuous","db":"AUDIT","sql":"UPDATE remediation_contracts SET verify_probe = (SELECT p.probe FROM v_probe_line_pending p WHERE p.class = remediation_contracts.class), verify_transport = (SELECT p.transport FROM v_probe_line_pending p WHERE p.class = remediation_contracts.class), status = ''active'', module = ''probe-line-sweep-v1'', attempts = 0, last_verdict = NULL, next_due_at = datetime(''now''), expected_cadence_h = 6, max_attempts = 3, precondition = ''probe line in the issue (PROBE-LINE-SWEEP-1)'', action = ''the doer fixes the defect; scripts/remediation_consumer.py runs this probe and a pass closes the issue'' WHERE class IN (SELECT class FROM v_probe_line_pending WHERE transport IS NOT NULL AND contract_state <> ''missing'')"}]}', 30000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('probe-line-sweep-10m', '*/10 * * * *', 'probe-line-sweep', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
