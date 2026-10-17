-- MEASURED-PENDING-1 (2026-10-17, pillar autonomy; fleet-wide audit).
--
-- WHY: the probe corpus writes its FAILURE branch as 'pending: <number> ... <target>' (257 contracts, 14,885 rows in 7 days),
-- e.g. "pending: 169 open issues, ceiling 50" and "pending: 52 SEARCH-not-found failures in 7 days (target <= 3)". The three
-- remediation triggers below read every leading 'pending' as "cannot judge yet", so:
--   * remediation_reopen_on_relapse_d1 never counted a measured breach as a failure: 26 issues stayed closed while their
--     probe failed, the worst (issue-2111) with 256 failures since closure against max_attempts 3;
--   * remediation_verification_autoclose_ins/_upd saw a measured-breach sibling as "no failing verdict" and closed the
--     issue anyway: 31 issues were closed in 7 days while another contract of theirs was failing.
--
-- WHAT: a pending observation is a deferral only when it carries no measurement. A number AND a threshold word make it a
-- failure. The same rule is implemented in qnfo-fleet-control 0.34.0 (rtIsDeferral + RT_FAILURE_OBS_SQL) and in
-- scripts/remediation_consumer.py (RT_FAILURE_OBS_SQL); this file is the SQL-trigger half and must stay identical.
--
-- APPLIED LIVE 2026-10-17 via the D1 API (DROP + CREATE per trigger). This file reproduces the live definitions exactly;
-- it is safe to re-run (DROP IF EXISTS then CREATE).
--
-- ROLLBACK: replace each "(lower(trim(<a>.observed)) NOT LIKE 'pending%' OR (<a>.observed GLOB '*[0-9]*' AND (...)))" with
-- the original "lower(trim(<a>.observed)) NOT LIKE 'pending%'", i.e. the definitions in
-- migrations/2026-10-12-remediation-reopen-d1.sql and migrations/2026-10-12-autoclose-all-contracts.sql with the
-- twin guard from migrations/2026-10-12-25-recurrence-guard-twin.sql.

DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1;
CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 0 AND COALESCE(NEW.observed, '') <> '' AND (lower(trim(NEW.observed)) NOT LIKE 'pending%' OR (NEW.observed GLOB '*[0-9]*' AND (NEW.observed LIKE '%ceiling%' OR lower(NEW.observed) LIKE '%target%' OR lower(NEW.observed) LIKE '%threshold%' OR lower(NEW.observed) LIKE '%limit%' OR lower(NEW.observed) LIKE '%fewer than%' OR lower(NEW.observed) LIKE '%more than%' OR NEW.observed LIKE '% <= %' OR NEW.observed LIKE '% >= %' OR NEW.observed LIKE '% < %' OR NEW.observed LIKE '% > %')))
  AND EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
              WHERE c.class = NEW.class AND c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class
                  AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN agent_issues o ON o.status = 'open' AND o.id <> a.id
                    AND lower(trim(o.title)) = lower(trim(a.title)) WHERE c.class = NEW.class)
  AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = NEW.class AND v.pass = 0 AND COALESCE(v.observed, '') <> ''
         AND (lower(trim(v.observed)) NOT LIKE 'pending%' OR (v.observed GLOB '*[0-9]*' AND (v.observed LIKE '%ceiling%' OR lower(v.observed) LIKE '%target%' OR lower(v.observed) LIKE '%threshold%' OR lower(v.observed) LIKE '%limit%' OR lower(v.observed) LIKE '%fewer than%' OR lower(v.observed) LIKE '%more than%' OR v.observed LIKE '% <= %' OR v.observed LIKE '% >= %' OR v.observed LIKE '% < %' OR v.observed LIKE '% > %')))
         AND v.verified_at > MAX(
           (SELECT datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch')
              FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.class = NEW.class),
           COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = NEW.class AND p.pass = 1), '1970-01-01')))
      >= MAX(1, COALESCE((SELECT max_attempts FROM remediation_contracts WHERE class = NEW.class), 3))
BEGIN
  UPDATE agent_issues SET status = 'open',
    description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ||
      ' (REMEDIATION-REOPEN-2, D1 trigger): contract ' || NEW.class || ' failed max_attempts times after the closure (expected ' ||
      substr(COALESCE(NEW.expected, ''), 1, 60) || ', observed ' || substr(NEW.observed, 1, 60) || '). Prior close_evidence: ' ||
      substr(COALESCE((SELECT t.close_evidence FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class), '(none)'), 1, 300),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class) AND status IN ('closed', 'resolved');
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class);
  UPDATE remediation_contracts SET status = 'active' WHERE class = NEW.class AND status = 'holding';
END;

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
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
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
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open';
END;
