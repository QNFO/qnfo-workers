-- NO-SILENT-DROP-1 + SPOF-AUDIT-1 + FAILURE-MODE-PROBES-1 (2026-10-08, pillar autonomy). Owner directive 2026-10-08,
-- verbatim: "The system shall never silently drop issues. The system shall never engineer potential single points of failure
-- and shall audit and remediate all single points of failure. The system shall constantly, continuously, and consistently
-- probe and test it's own failure modes and root causes and shall remediate all."
--
-- Silent-drop audit (session_01CWLpf5v1NjC9GXbM6rnH4k): every D1 guard that aborts or ignores a write to agent_issues or
-- alerts, and every worker dedupe that looks an issue up by title without a status filter.
--   agent_issues_enum_guard_ins/_upd   ABORT an issue (or a status change) with an unmapped status or priority; the
--                                      filing worker's try/catch then drops it. REPLACED: accept, then normalise.
--   agent_issues_evidence_must_exist_ins ABORT an issue whose source cites a missing cloud_ops_events id. REPLACED: accept
--                                      and annotate.
--   issue_refile_guard                 replaced by issue_refile_reopen in 2026-10-08-12-doctrine.sql.
--   alerts_dedup                       IGNORE a repeated alert within 60 minutes with no trace. REPLACED: count the repeat
--                                      on the existing alert (alerts.repeats).
--   qnfo-observability evReview        escalated only when no issue of that title existed in ANY status, so a closed issue
--                                      swallowed every recurrence; fixed in qnfo-observability 1.4.3 (same PR).
-- SPOF audit: the first heartbeat design was one producer (a false alternate, corrected in 2026-10-08-10-queue-sla.sql with
-- fleet_tick). Fleet-level single points of failure are added to spof_registry below, each with its issue.
-- Failure-mode probes: failure_modes registers every failure mode found on 2026-10-08 with a machine detector; the detector
-- is a remediation_contracts row (class fm-<key>) that qnfo-fleet-control's remediation tick evaluates hourly, so a
-- recurrence is caught without a session. v_failure_mode_status and metric failure_modes_recurring (target 0) grade them.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261008_failure_mode_triggers
-- (bak_20261008_failure_mode_triggers is created by this file ahead of its first DROP: a copy of every trigger's SQL from sqlite_master, so each
-- dropped guard can be recreated from D1 itself. Re-applied 2026-10-08: the first run named control_registry, which the
-- runner requires to exist before the file starts, and refused the file with no statement run.)
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_normalise_tick; DROP TRIGGER IF EXISTS agent_issues_evidence_annotate_ai; DROP TRIGGER IF EXISTS alerts_dedup_count; DROP TRIGGER IF EXISTS failure_modes_tick; DROP VIEW IF EXISTS v_failure_mode_status; CREATE TRIGGER agent_issues_enum_guard_ins BEFORE INSERT ON agent_issues WHEN (NEW.status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = NEW.status)) OR (NEW.priority IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = NEW.priority)) BEGIN SELECT RAISE(ABORT,'unmapped-enum-value'); END; CREATE TRIGGER agent_issues_enum_guard_upd BEFORE UPDATE OF status, priority ON agent_issues WHEN (NEW.status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = NEW.status)) OR (NEW.priority IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = NEW.priority)) BEGIN SELECT RAISE(ABORT,'unmapped-enum-value'); END; CREATE TRIGGER agent_issues_evidence_must_exist_ins BEFORE INSERT ON agent_issues WHEN NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source,'cloud_ops_events:','')) BEGIN SELECT RAISE(ABORT, 'EVIDENCE-REFERENTIAL-INTEGRITY-1: agent_issues.source cites a cloud_ops_events id that does not exist'); END; CREATE TRIGGER alerts_dedup BEFORE INSERT ON alerts WHEN EXISTS (SELECT 1 FROM alerts WHERE source = NEW.source AND message = NEW.message AND created_at > datetime('now','-60 minutes')) BEGIN SELECT RAISE(IGNORE); END; DELETE FROM remediation_contracts WHERE class LIKE 'fm-%'; DELETE FROM metric_registry WHERE metric = 'failure_modes_recurring'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'failure_modes_recurring'; -- failure_modes, alerts.repeats and the registry rows stay.

-- (1) Never drop an issue for an unmapped status or priority: accept it, then normalise (open / medium) with a note.
CREATE TABLE IF NOT EXISTS bak_20261008_failure_mode_triggers AS SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger';

DROP TRIGGER IF EXISTS agent_issues_enum_guard_ins;
DROP TRIGGER IF EXISTS agent_issues_enum_guard_upd;
-- D1-TRIGGER-DEPTH-1 (second apply, 2026-10-08): the first apply created agent_issues_status_normalise_ai/_au, AFTER
-- triggers on agent_issues that UPDATE agent_issues. D1 counts trigger nesting at compile time (limit 10, WHEN ignored), and
-- they pushed every write whose chain reaches agent_issues past it ("triggers nested too deep"): cloud_ops_events and
-- metric_registry inserts failed from 15:56 to 16:00Z, when the session dropped them (SQL kept in
-- bak_20261008_incident_triggers). Normalisation now runs once per fleet tick instead, one level deep: an unmapped status or
-- priority is accepted on insert (the enum guards that refused it are dropped above) and set to open / medium with a note
-- within 10 minutes.
DROP TRIGGER IF EXISTS agent_issues_status_normalise_ai;
DROP TRIGGER IF EXISTS agent_issues_status_normalise_au;
CREATE TRIGGER IF NOT EXISTS agent_issues_normalise_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE agent_issues SET
    description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-1: unmapped status/priority "' || COALESCE(status, '') || '"/"' || COALESCE(priority, '') || '" normalised by the fleet tick instead of refused.',
    status = CASE WHEN status IS NULL OR EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = agent_issues.status) THEN status ELSE 'open' END,
    priority = CASE WHEN priority IS NULL OR EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = agent_issues.priority) THEN priority ELSE 'medium' END
  WHERE (status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = agent_issues.status))
     OR (priority IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = agent_issues.priority));
END;

DROP TRIGGER IF EXISTS agent_issues_evidence_must_exist_ins;
CREATE TRIGGER IF NOT EXISTS agent_issues_evidence_annotate_ai AFTER INSERT ON agent_issues
WHEN NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source, 'cloud_ops_events:', ''))
BEGIN
  UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-1: the cited evidence event ' || NEW.source || ' does not exist; the issue was kept and needs its evidence re-attached.'
  WHERE id = NEW.id;
END;

-- (3) A repeated alert is counted, not erased.
ALTER TABLE alerts ADD COLUMN repeats INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS alerts_dedup;
CREATE TRIGGER IF NOT EXISTS alerts_dedup_count BEFORE INSERT ON alerts
WHEN EXISTS (SELECT 1 FROM alerts WHERE source = NEW.source AND message = NEW.message AND created_at > datetime('now', '-60 minutes'))
BEGIN
  UPDATE alerts SET repeats = repeats + 1
  WHERE id = (SELECT id FROM alerts WHERE source = NEW.source AND message = NEW.message AND created_at > datetime('now', '-60 minutes') ORDER BY id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('agent-issues-enum-guard', 'D1 triggers agent_issues_enum_guard_ins/_upd', 'guard', 'unmapped status or priority values', 1, 'replace', 'applied', 'accept then normalise (agent_issues_status_normalise_ai/_au)', NULL, 'RAISE(ABORT) on an issue insert became a silent drop in any worker that catches the error', NULL),
 ('agent-issues-evidence-guard', 'D1 trigger agent_issues_evidence_must_exist_ins', 'guard', 'issues citing a missing evidence event', 1, 'replace', 'applied', 'accept and annotate (agent_issues_evidence_annotate_ai)', NULL, 'RAISE(ABORT) dropped the issue together with its bad reference', NULL),
 ('alerts-dedup', 'D1 trigger alerts_dedup', 'filter', 'alert floods', 0, 'replace', 'applied', 'count repeats on the existing alert (alerts.repeats)', NULL, 'RAISE(IGNORE) erased the repeat with no trace', NULL),
 ('observability-escalation-dedupe', 'qnfo-observability evReview', 'filter', 'duplicate escalations', 1, 'replace', 'applied', 'dedupe against open issues only; a closed one is reopened by issue_refile_reopen', NULL, 'a closed issue of the same title swallowed every recurrence (fixed in 1.4.3)', NULL);

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('qnfo-audit D1', 'every loop, issue, metric and register', 'none recorded', NULL, 'one database holds the whole control plane; an outage or a bad migration stops every loop at once: AUDIT-DB-RESILIENCE-1 (verified point-in-time restore drill, read-only fallback for the dashboard)', NULL),
 ('GitHub Actions', 'CI, canonical deploy, the migration runner, the runner-https probe transport', 'Cloudflare crons carry the loops; deploys have no second runner', NULL, 'GitHub schedule triggers already fire rarely (CLAUDE.md); a GitHub outage blocks every merge and deploy: GITHUB-SECOND-RUNNER-1', NULL),
 ('fleet cron scheduler (fleet_crons)', 'every fleet_crons task and the cron log', 'fleet_tick also advances from fleet_heartbeat (six workers)', NULL, 'one producer writes fleet_crons.last_fired; tested when a heartbeat-sourced fleet_tick row is recorded', NULL),
 ('qnfo-deploy-guard work claims', 'session and code-loop coordination', 'claims fail open: the loop counts an unreachable guard and proceeds (CLAIMS-FIRST-1)', '2026-10-06', 'fail-open recorded in qnfo-code-orchestrator 0.3.21', NULL);

CREATE TABLE IF NOT EXISTS failure_modes (
  fm_key TEXT PRIMARY KEY,
  failure_mode TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  remediation TEXT NOT NULL,
  detector TEXT NOT NULL,
  probe_class TEXT,
  first_seen TEXT NOT NULL,
  issue_id INTEGER
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES
 ('head-of-line', 'one failing research row blocks the whole queue', 'parkPoisonRow skipped status review; single-flight executor', 'queue_sla 30-minute park; #2170 code fix; #2175 parallel rows', 'no review row with an error older than 30 min', 'fm-head-of-line', '2026-10-07T13:30:00Z', 2170),
 ('version-pin-tests', 'suites pinned VERSION with a range regex and failed every bump', 'tests asserted ranges, not minimums', 'versionAtLeast + version-pin-guard suite (CI)', 'ci: scripts/version-pin-guard.test.mjs', NULL, '2026-10-07', NULL),
 ('unprobed-issues', 'open issues went days without a probe verdict', 'birth contracts due every 24 h; 15 contracts per hourly tick', 'hourly cadence trigger; 150 per tick', 'issues_unprobed_60m <= 10', 'fm-unprobed-issues', '2026-10-08', NULL),
 ('silent-refile-drop', 'a relapse filed within 24 h of a close vanished', 'issue_refile_guard RAISE(IGNORE)', 'issue_refile_reopen', 'no trigger named issue_refile_guard', 'fm-silent-refile-drop', '2026-10-08', NULL),
 ('enum-abort-drop', 'an issue with an unmapped status or priority was refused and dropped', 'RAISE(ABORT) under a catching worker', 'normalise after insert', 'no trigger named agent_issues_enum_guard_ins', 'fm-enum-abort-drop', '2026-10-08', NULL),
 ('single-heartbeat', 'the 10-minute fixer depended on one scheduler', 'two cron rows from one trigger counted as two paths', 'fleet_tick from cron log or fleet_heartbeat', 'a tick in the last 20 min and a heartbeat-sourced tick in the last 24 h', 'fm-single-heartbeat', '2026-10-08', NULL),
 ('stale-hold', 'research held for a precondition that had already shipped', 'holds with no expiry and no live reason', 'hold release; control_registry; ANTIFRAGILE-1 rules', 'no research_queue row with status owner_hold', 'fm-stale-hold', '2026-10-04', NULL),
 ('owner-card-misroute', 'a fleet decision sent to the owner queue', 'loops escalated stalls and merges to the owner', 'v_human_action_gate reroute', 'no open owner card that reads fleet', 'fm-owner-card-misroute', '2026-10-08', NULL),
 ('secret-in-config', 'a plaintext credential stored in ops_config', 'capability keys written to config, never read', 'removed command_drain_key; doctrine section 6', 'no ops_config value of 32+ hex characters', 'fm-secret-in-config', '2026-10-08', NULL),
 ('observability-escalation-drop', 'a recurring high incident was never escalated again', 'dedupe against issues in any status', 'qnfo-observability 1.4.3', 'no open high/error issue_ledger incident with 3+ occurrences and no open issue', 'fm-observability-escalation-drop', '2026-10-08', NULL);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-head-of-line', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''review'' AND error IS NOT NULL AND datetime(claimed_at) < datetime(''now'', ''-30 minutes'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-unprobed-issues', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''issues_unprobed_60m''), ''999'') AS INTEGER) <= 10 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-silent-refile-drop', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''issue_refile_guard'') THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-enum-abort-drop', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name IN (''agent_issues_enum_guard_ins'', ''agent_issues_enum_guard_upd'', ''agent_issues_evidence_must_exist_ins'', ''alerts_dedup'')) THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-single-heartbeat', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-20 minutes'')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source LIKE ''heartbeat:%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-stale-hold', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''owner_hold'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-owner-card-misroute', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM v_human_action_gate WHERE status = ''open'' AND gate = ''fleet'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-secret-in-config', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM ops_config WHERE length(value) >= 32 AND value NOT GLOB ''*[^0-9a-f]*'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-observability-escalation-drop', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_ledger l WHERE l.status NOT IN (''resolved'', ''closed'', ''retracted'') AND l.occurrences >= 3 AND l.level IN (''high'', ''error'') AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = substr(l.title, 1, 180) AND a.status = ''open'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

CREATE VIEW IF NOT EXISTS v_failure_mode_status AS
SELECT f.fm_key, f.failure_mode, f.probe_class,
  (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) AS last_probed,
  CASE
    WHEN f.probe_class IS NULL THEN 'ci-guarded'
    WHEN (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) IS NULL
      OR (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) < datetime('now', '-60 minutes') THEN 'unprobed'
    WHEN (SELECT v.pass FROM remediation_verifications v WHERE v.class = f.probe_class ORDER BY v.id DESC LIMIT 1) = 1 THEN 'absent'
    ELSE 'recurring'
  END AS status
FROM failure_modes f;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('failure_modes_recurring', 'operational', 'guard', 'COUNT of v_failure_mode_status rows with status recurring or unprobed: a known failure mode that came back, or whose detector has not run in 60 minutes (FAILURE-MODE-PROBES-1).', 'qnfo-audit.v_failure_mode_status (migrations/2026-10-08-13-failure-modes.sql), refreshed on every fleet_tick', '9 unprobed before the first hourly run', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 3', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS failure_modes_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_failure_mode_status WHERE status IN ('recurring', 'unprobed')) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'failure_modes_recurring';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'failure_modes_recurring', 'A known failure mode recurred or its detector stopped running', 'registry', 'gt', 0, 2,
  'Pillar autonomy (FAILURE-MODE-PROBES-1). Read SELECT * FROM v_failure_mode_status WHERE status IN (''recurring'', ''unprobed''). recurring: the remediation in failure_modes did not hold; find the new root cause (the detector''s evidence is in remediation_verifications for its probe_class), fix it, and write the new root cause and remediation into the failure_modes row. unprobed: the detector contract did not run in 60 minutes; find why (status, next_due_at, the remediation tick''s per-run limit) and restore it. Every new failure mode found anywhere gets a failure_modes row and an fm-<key> detector in the PR that fixes it. Definition of done: failure_modes_recurring = 0 at a refresh.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'FAILURE-MODE-PROBES-1 (migrations/2026-10-08-13-failure-modes.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'failure_modes_recurring');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'two cron rows were two heartbeat paths', 'replaced with fleet_tick fed by the cron log or by fleet_heartbeat from six workers', 'both rows come from one trigger on fleet_crons.last_fired: one producer', 'false alternate corrected before merge', 'the D1 10-minute triggers only', 'the Rollback line of 2026-10-08-10-queue-sla.sql'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action = 'replaced with fleet_tick fed by the cron log or by fleet_heartbeat from six workers');
