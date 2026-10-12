-- AUTOCLOSE-ALL-CONTRACTS-1 (2026-10-12, pillar autonomy; agent_issues 1297 family, failure mode closure-relapse-unreopened).
-- remediation_verification_autoclose_ins/upd closed an open issue on any passing verification, even while another live
-- contract of the same issue was failing. Issue 1683 shows the result: EVID-1683-SPEND (fleet_budget within cap) passed and
-- closed it at 09:00:28Z, issue-1683 (metric trigger 353, unified billed cost, in breach) failed and REMEDIATION-REOPEN-2
-- reopened it, and the two flip every cycle. A closure is now taken only when no other active or holding contract of the
-- issue has a latest real (non-pending) verification that failed. issue-1683's contract duplicates the probe of open critical
-- issue 2118 (METRIC-TRIGGER-353-UNIFIED-COST-USD-30D), so it is superseded and the unified-cost gap is tracked once, there.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_autoclose_triggers
-- Rollback: DROP TRIGGER IF EXISTS remediation_verification_autoclose_ins; DROP TRIGGER IF EXISTS remediation_verification_autoclose_upd; -- re-create both from bak_20261012_autoclose_triggers.sql; UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-1683' AND last_verdict LIKE 'superseded:duplicate%'

CREATE TABLE IF NOT EXISTS bak_20261012_autoclose_triggers AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master
WHERE type = 'trigger' AND name IN ('remediation_verification_autoclose_ins', 'remediation_verification_autoclose_upd');

DROP TRIGGER IF EXISTS remediation_verification_autoclose_ins;
DROP TRIGGER IF EXISTS remediation_verification_autoclose_upd;

CREATE TRIGGER IF NOT EXISTS remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND lower(trim(v2.observed)) NOT LIKE 'pending%' ORDER BY v2.id DESC LIMIT 1) = 0)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
END;

CREATE TRIGGER IF NOT EXISTS remediation_verification_autoclose_upd AFTER UPDATE OF pass ON remediation_verifications
WHEN NEW.pass = 1 AND COALESCE(OLD.pass,0) <> 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND lower(trim(v2.observed)) NOT LIKE 'pending%' ORDER BY v2.id DESC LIMIT 1) = 0)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
END;

UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:duplicate-of-issue-2118 (trigger 353 probe)', last_attempt_at = datetime('now')
WHERE class = 'issue-1683' AND status IN ('active', 'holding')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2118 AND status = 'open');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('closure-while-contract-fails', 'an issue is auto-closed by one passing contract while another of its contracts fails',
  'remediation_verification_autoclose_ins/upd checked only the verification that passed',
  'AUTOCLOSE-ALL-CONTRACTS-1: a closure requires no other live contract of the issue to be failing',
  'no closed issue has an active or holding contract whose latest real verification failed', 'fm-closure-relapse-unreopened', '2026-10-12', 1683,
  'an issue with two contracts measuring different things', 'an issue that closes and reopens every cycle', 'closures that are false half the time');

-- Code task ct_7ze4xcaazifdut (issue 2354) was refused by the merge runner's file-scope gate only (it also added a
-- verify.test.mjs case); a session reviewed it, ran the personal-companion suites on the merged tree (verify 69/69) and
-- merged PR 999 as 4781950e. The task records that outcome so code_goal_success_rate_30d counts it as shipped.
UPDATE code_tasks SET status = 'merged', merged_sha = '4781950e0164df20c95a25f5edfa7f991fb5fefb', merged_at = '2026-10-12T10:45:00Z',
  merged_by = 'session_01CWLpf5v1NjC9GXbM6rnH4k', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  merge_note = 'merged by a session after review: the runner refused only on file scope (test file added); suites green'
WHERE id = 'ct_7ze4xcaazifdut' AND status = 'failed';

-- Issue 2355 (CODE-REPAIR-PREPR-1): PR 1000 (qnfo-fleet-control 0.18.x, another session's claim) repairs a refusal that
-- arrives while the task is still a pushed branch by adding a branch_pushed path and keeps the open-PR path, so the original
-- "old line absent" probe would never pass with the defect fixed. The probe now requires the branch-stage repair to exist.
UPDATE remediation_contracts SET verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "d.action === \"refuse\" && t.status === \"branch_pushed\""}',
  verify_transport = 'code-read', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2355';
