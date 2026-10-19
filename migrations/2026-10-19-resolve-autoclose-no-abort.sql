-- AUTOCLOSE-NO-ABORT-1 (2026-10-19, RESOLVE-ALL-OPEN-1, issue 99960; pillar autonomy).
--
-- WHY
-- qnfo-fleet-control logged "fleet-control:remediationTick:verification-insert ... D1_ERROR: SQLITE_CONSTRAINT" 14 times
-- (Workers Observability, CF-OBS-ISSUE-1 #99960). Measured 2026-10-19: every pass=1 row in remediation_evidence (the
-- trigger-free path-B sink, 23 rows in 24 h) is a pass=1 INSERT into remediation_verifications that aborted. The abort is
-- the autoclose trigger: remediation_verification_autoclose_ins runs UPDATE agent_issues SET status='closed' inside the
-- INSERT, and issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1) RAISEs 'close-while-contract-fails' because
-- (a) the passing class's own contract still carries last_verdict 'fail' - qnfo-fleet-control writes the verdict onto
-- the contract only AFTER the verification row is inserted - or (b) a sibling contract of the issue carries a failing
-- verdict without a failing verification row (the WHEN clause only reads sibling verification rows). The RAISE aborts
-- the whole INSERT, so the pass is never recorded in remediation_verifications, no issue closes on its first pass, and the
-- tick logs SQLITE_CONSTRAINT. Issues 99960, 99980, 99981, 99999, 100000 sat open with a passing contract this way.
--
-- WHAT
-- Both autoclose triggers keep their WHEN clause and close only when no active/holding contract of the issue (its own included) holds a
-- blocking verdict. The passing class's own stale 'fail' is not rewritten here (that would edit the contract), so in case
-- (a) the trigger now records the pass and leaves the issue open; the tick then writes 'pass' onto the contract and the
-- next passing verification closes the issue, with no abort and no SQLITE_CONSTRAINT log. issue_close_evidence_required is
-- unchanged: a close still needs evidence and still refuses while a contract fails.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_autoclose_triggers
-- Rollback: recreate both triggers from bak_20261019_autoclose_triggers.sql (DROP TRIGGER, then run each saved sql), i.e. re-run the two DROP/CREATE blocks for remediation_verification_autoclose_ins and _upd from migrations/2026-10-17-measured-pending-triggers.sql (lines 52-81)
--
-- runtime-probe (D1): SELECT COUNT(*) FROM remediation_evidence WHERE pass = 1 AND verified_at > <applied_at> -- expected 0

CREATE TABLE IF NOT EXISTS bak_20261019_autoclose_triggers AS SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger' AND name IN ('remediation_verification_autoclose_ins', 'remediation_verification_autoclose_upd');

DROP TRIGGER IF EXISTS remediation_verification_autoclose_ins;
CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND (lower(trim(v2.observed)) NOT LIKE 'pending%' OR (v2.observed GLOB '*[0-9]*' AND (v2.observed LIKE '%ceiling%' OR lower(v2.observed) LIKE '%target%' OR lower(v2.observed) LIKE '%threshold%' OR lower(v2.observed) LIKE '%limit%' OR lower(v2.observed) LIKE '%fewer than%' OR lower(v2.observed) LIKE '%more than%' OR v2.observed LIKE '% <= %' OR v2.observed LIKE '% >= %' OR v2.observed LIKE '% < %' OR v2.observed LIKE '% > %'))) ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND (lower(trim(v3.observed)) NOT LIKE 'pending%' OR (v3.observed GLOB '*[0-9]*' AND (v3.observed LIKE '%ceiling%' OR lower(v3.observed) LIKE '%target%' OR lower(v3.observed) LIKE '%threshold%' OR lower(v3.observed) LIKE '%limit%' OR lower(v3.observed) LIKE '%fewer than%' OR lower(v3.observed) LIKE '%more than%' OR v3.observed LIKE '% <= %' OR v3.observed LIKE '% >= %' OR v3.observed LIKE '% < %' OR v3.observed LIKE '% > %'))) ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host')) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'
    AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'));
END;

DROP TRIGGER IF EXISTS remediation_verification_autoclose_upd;
CREATE TRIGGER remediation_verification_autoclose_upd AFTER UPDATE OF pass ON remediation_verifications
WHEN NEW.pass = 1 AND COALESCE(OLD.pass,0) <> 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND (lower(trim(v2.observed)) NOT LIKE 'pending%' OR (v2.observed GLOB '*[0-9]*' AND (v2.observed LIKE '%ceiling%' OR lower(v2.observed) LIKE '%target%' OR lower(v2.observed) LIKE '%threshold%' OR lower(v2.observed) LIKE '%limit%' OR lower(v2.observed) LIKE '%fewer than%' OR lower(v2.observed) LIKE '%more than%' OR v2.observed LIKE '% <= %' OR v2.observed LIKE '% >= %' OR v2.observed LIKE '% < %' OR v2.observed LIKE '% > %'))) ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND (lower(trim(v3.observed)) NOT LIKE 'pending%' OR (v3.observed GLOB '*[0-9]*' AND (v3.observed LIKE '%ceiling%' OR lower(v3.observed) LIKE '%target%' OR lower(v3.observed) LIKE '%threshold%' OR lower(v3.observed) LIKE '%limit%' OR lower(v3.observed) LIKE '%fewer than%' OR lower(v3.observed) LIKE '%more than%' OR v3.observed LIKE '% <= %' OR v3.observed LIKE '% >= %' OR v3.observed LIKE '% < %' OR v3.observed LIKE '% > %'))) ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host')) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'
    AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'));
END;

