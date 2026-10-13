-- PROBE-SOURCE-STABILITY-1 / AUTOCLOSE-HYSTERESIS-1 (2026-10-13, pillars autonomy and core; owner: "Audit and remediate all related failure modes and root
-- causes systemwide across the fleet. Merge and deploy all fixes immediately."). Root cause of the reopen churn on issues 2178, 2179 and 2337: their probes read
-- spof_registry, a table the resolver empties by moving a row to spof_registry_resolved, so a SPOF that was fixed made a CASE ... IS NOT NULL ... ELSE '0'
-- probe read 0 and the REMEDIATION-REOPEN-2 trigger reopened a closed issue for a reason that was not a relapse. Same family, found in the same audit:
-- seven further contracts whose probes were placeholders or measured the wrong thing (2165, 2338, 2373, 2379, 2380, 2397, 2491; the rewrites were applied to
-- D1 directly on 2026-10-13 and are captured here so a restore or re-apply keeps them). And an issue whose metric moves (2087, 2193, 2322, 2327 and
-- others) closed on a single pass and reopened an hour later.
-- 1. v_spof_registry_all = registry UNION ALL resolved (resolved = 0|1); the three SPOF contracts read it, so a moved row keeps answering.
-- 2. Probes of the other seven contracts re-applied (idempotent UPDATEs).
-- 3. AUTOCLOSE-HYSTERESIS-1: an issue that has been reopened before (issue_triage.reopened_count > 0) closes on a pass only when the previous
--    non-pending verification of the same contract also passed, so a metric that flaps cannot close and reopen an issue every hour. A first
--    closure is unchanged (one pass), so no new delay for issues that never relapsed.
-- 4. failure_modes rows probe-source-moved and autoclose-flap with their fm- detector contracts.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_autoclose_triggers
-- Rollback: DROP VIEW IF EXISTS v_spof_registry_all; DELETE FROM remediation_contracts WHERE class IN ('fm-probe-source-moved','fm-autoclose-flap'); DELETE FROM failure_modes WHERE fm_key IN ('probe-source-moved','autoclose-flap'); recreate remediation_verification_autoclose_ins and _upd from the sql column of bak_20261013_autoclose_triggers (the pre-change text), and restore the seven probes from bak_20261013_contract_probes

CREATE TABLE IF NOT EXISTS bak_20261013_autoclose_triggers AS SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('remediation_verification_autoclose_ins', 'remediation_verification_autoclose_upd');

CREATE TABLE IF NOT EXISTS bak_20261013_contract_probes AS SELECT class, issue_id, verify_probe, verify_transport, last_verdict FROM remediation_contracts WHERE issue_id IN (2178,2179,2337,2165,2338,2373,2379,2380,2397,2491);

CREATE VIEW IF NOT EXISTS v_spof_registry_all AS
SELECT component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at, 0 AS resolved FROM spof_registry
UNION ALL
SELECT component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at, 1 AS resolved FROM spof_registry_resolved;

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT alternate_tested_at FROM v_spof_registry_all WHERE component = ''qnfo-ops /ops/deploy'' ORDER BY resolved LIMIT 1) IS NOT NULL AND (SELECT last_pass FROM spof_alternate_probes WHERE component = ''qnfo-ops /ops/deploy'') = 1 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2178';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT alternate_tested_at FROM v_spof_registry_all WHERE component = ''qnfo-ai router'' ORDER BY resolved LIMIT 1) IS NOT NULL AND (SELECT last_pass FROM spof_alternate_probes WHERE component = ''qnfo-ai router'') = 1 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2179';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT alternate_tested_at FROM v_spof_registry_all WHERE component = ''qnfo-ai router'' ORDER BY resolved LIMIT 1) IS NOT NULL AND (SELECT last_pass FROM spof_alternate_probes WHERE component = ''qnfo-ai router'') = 1 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2337';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''3'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT value FROM metric_history WHERE metric = ''ask_grounded_share_7d'' ORDER BY day DESC LIMIT 3) WHERE value >= 0.7) AS TEXT) AS observed' WHERE class = 'issue-2165';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ai_calibration_truth WHERE ts >= (strftime(''%s'',''now'') - 86400) * 1000 GROUP BY item_id HAVING COUNT(DISTINCT model) >= 2) THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2338';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''10'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT tier, draft_proposed FROM email_reply_queue WHERE created_at >= ''2026-10-12 12:00:00'' ORDER BY id LIMIT 10) WHERE tier IN (''1'',''2'',''3'') AND (tier = ''1'' OR draft_proposed IS NOT NULL)) AS TEXT) AS observed' WHERE class = 'issue-2373';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN datetime(''now'') >= ''2026-10-20 00:00:00'' AND (SELECT COUNT(*) FROM code_tasks WHERE updated_at >= ''2026-10-13'' AND last_error LIKE ''%goal review%'' AND (last_error LIKE ''%undefined function%'' OR last_error LIKE ''%not defined%'' OR last_error LIKE ''%setTimeout%'')) = 0 AND (SELECT SUM(status IN (''merged'',''failed'')) FROM code_tasks WHERE updated_at >= ''2026-10-13'') >= 10 AND (SELECT SUM(status = ''merged'') * 1.0 / NULLIF(SUM(status IN (''merged'',''failed'')), 0) FROM code_tasks WHERE updated_at >= ''2026-10-13'') > 0.2545 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2379';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN datetime(''now'') >= ''2026-10-20 00:00:00'' AND (SELECT COUNT(*) FROM code_tasks WHERE updated_at >= ''2026-10-13'' AND (status = ''publish_failed'' OR last_error LIKE ''%does not apply%'' OR last_error LIKE ''%0 SEARCH%'' OR merge_note LIKE ''%does not apply%'')) = 0 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2380';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT column1 AS w, column2 AS hrs FROM (VALUES (''idea-hub'',3),(''personal-api'',26),(''personal-companion'',3),(''q08-signal-engine'',3),(''ai-health-prober'',3),(''qnfo-ai-search'',3),(''qnfo-cloud-ops'',3),(''qnfo-code-orchestrator'',3),(''qnfo-deploy-guard'',3),(''qnfo-email-orchestrator'',3),(''qnfo-fleet-control'',3),(''qnfo-fleet-dashboard'',3),(''qnfo-gateway'',26),(''qnfo-infra'',26),(''qnfo-intent-orchestrator'',26),(''qnfo-lifecycle'',3),(''qnfo-observability'',3),(''qnfo-ops'',3),(''qnfo-pdf'',3),(''qnfo-research-exec'',3),(''qnfo-social'',5),(''qnfo-subscribers'',200),(''radar-hub'',3))) c WHERE NOT EXISTS (SELECT 1 FROM fleet_heartbeat h WHERE h.worker = c.w AND h.ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'',''-'' || c.hrs || '' hours''))) AS TEXT) AS observed' WHERE class = 'issue-2397';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''queued'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-3 hours'')) AS TEXT) AS observed' WHERE class = 'issue-2491';

DROP TRIGGER IF EXISTS remediation_verification_autoclose_ins;
CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND lower(trim(v2.observed)) NOT LIKE 'pending%' ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND lower(trim(v3.observed)) NOT LIKE 'pending%' ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
END;

DROP TRIGGER IF EXISTS remediation_verification_autoclose_upd;
CREATE TRIGGER remediation_verification_autoclose_upd AFTER UPDATE OF pass ON remediation_verifications
WHEN NEW.pass = 1 AND COALESCE(OLD.pass,0) <> 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND lower(trim(v2.observed)) NOT LIKE 'pending%' ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND lower(trim(v3.observed)) NOT LIKE 'pending%' ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
END;


INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES ('probe-source-moved', 'a closed issue reopens because its probe reads a registry row that the resolver moved to a *_resolved twin', 'spof_registry rows move to spof_registry_resolved when a SPOF is fixed; a probe of the form CASE WHEN (SELECT ... FROM spof_registry WHERE ...) IS NOT NULL THEN ''1'' ELSE ''0'' reads 0 once the row has moved, and REMEDIATION-REOPEN-2 treats three such reads as a relapse (issues 2178, 2179, 2337 reopened after their fix was live)', 'migration 2026-10-13-probe-source-stability: v_spof_registry_all (registry union resolved) and the three contracts read it; a new SPOF contract reads the view', 'fm-probe-source-moved: no active d1-query contract (other than fm- and belief- detectors) reads spof_registry without v_spof_registry_all or spof_registry_resolved', 'fm-probe-source-moved', '2026-10-13', 'issue reopened with a note naming a contract that read 0 while the fix was live', 'fixed issues reopen and count as relapses; the owner queue and the closed-with-evidence count lose trust');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES ('fm-probe-source-moved', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status IN (''active'', ''holding'') AND verify_transport = ''d1-query'' AND class NOT LIKE ''fm-%'' AND class NOT LIKE ''belief-%'' AND (verify_probe LIKE ''%FROM spof_registry %'' OR verify_probe LIKE ''%FROM spof_registry)%'') AND verify_probe NOT LIKE ''%v_spof_registry_all%'' AND verify_probe NOT LIKE ''%spof_registry_resolved%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES ('autoclose-flap', 'an issue whose metric moves closes on one pass and reopens an hour later, every hour', 'the autoclose triggers closed an issue on a single passing verification, REMEDIATION-REOPEN-2 reopened it after max_attempts failures, and nothing required the pass to hold: 2087, 2193, 2322, 2327 and others cycled hourly', 'migration 2026-10-13-probe-source-stability: AUTOCLOSE-HYSTERESIS-1, an issue with reopened_count > 0 closes only when the previous non-pending verification also passed', 'fm-autoclose-flap: both autoclose triggers carry the reopened_count hysteresis clause', 'fm-autoclose-flap', '2026-10-13', 'the same issue id closes and reopens within hours, close_channel auto:verified-remediation-trigger', 'issue counts oscillate and every closure''s evidence is a single reading');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES ('fm-autoclose-flap', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name IN (''remediation_verification_autoclose_ins'', ''remediation_verification_autoclose_upd'') AND sql LIKE ''%reopened_count%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active');
