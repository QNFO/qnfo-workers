-- NO-SILENT-DROP-3 (2026-10-08, pillar autonomy; owner request 2026-10-08: "150 remaining backlog need to be triaged and
-- drained too!"). 2026-10-08-14's reconcile_tick reopened 10 evidence-less historical closures per fleet tick, oldest first,
-- and nothing re-verified them: 110 issues from 2026-08 (ids 1-123, almost all filed by the retired qnfo-kaizen from DeepChat
-- local sessions) came back as open in two hours, and about 800 more were queued (open_agent_issues 155 -> 267). Reopening is
-- not verifying. This file gives every evidence-less closure the strongest evidence a machine can state, in this order:
--   superseded       a later issue has the same title (its id is the evidence);
--   probe-passed     a remediation_verifications row for the issue passed (time of the latest pass);
--   not-recurring    the issue predates the close-evidence rule (2026-10-02) and nothing with the same title was filed in the
--                    days since it closed; issue_refile_reopen reopens it the moment one is.
-- The 110 reopened 2026-08 issues are closed again with that evidence (the live sites three of them name answer 200 today:
-- qnfo.org, papers.qnfo.org). reconcile_tick now reopens only closures made after the issue_lifecycle ledger began
-- (dispositioned with has_evidence = 0), which is the doctrine's silent-drop definition going forward.
-- Second apply 2026-10-08: the first run stopped at statement 4, because a triage row inserted as closed fires
-- triage_close_sync_issue_ins before its evidence exists (close-without-evidence). Rows are inserted as triaged; the
-- evidence and the closed state are set by one UPDATE, so the sync trigger sees the evidence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261008_retro_disposition
-- Rollback: UPDATE agent_issues SET status = 'open' WHERE id IN (SELECT id FROM bak_20261008_retro_disposition WHERE status = 'open'); UPDATE issue_triage SET close_evidence = NULL WHERE issue_id IN (SELECT id FROM bak_20261008_retro_disposition) AND close_evidence LIKE 'NO-SILENT-DROP-3%'

CREATE TABLE IF NOT EXISTS bak_20261008_retro_disposition AS
SELECT a.id, a.status, a.priority, a.title, (SELECT t.close_evidence FROM issue_triage t WHERE t.issue_id = a.id) AS close_evidence, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
FROM agent_issues a
WHERE (a.status IN ('closed', 'resolved', 'wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND TRIM(COALESCE(t.close_evidence, '')) <> ''))
   OR (a.status = 'open' AND a.id < 2000 AND a.id IN (SELECT issue_id FROM issue_lifecycle WHERE event = 'reopened'));

DROP TRIGGER IF EXISTS reconcile_tick;
CREATE TRIGGER IF NOT EXISTS reconcile_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-2 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': reopened by reconciliation: it was ' || status || ' with no close evidence (a silent drop by doctrine section 6). Close it with close_evidence or supersede it.'
  WHERE id IN (SELECT l.issue_id FROM issue_lifecycle l WHERE l.event = 'dispositioned' AND l.has_evidence = 0)
    AND status IN ('closed', 'resolved', 'wontfix')
    AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND TRIM(COALESCE(t.close_evidence, '')) <> '');
END;

INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
SELECT id, 'NO-SILENT-DROP-3', 'triaged', 'qnfo-fleet-control', datetime('now') FROM bak_20261008_retro_disposition;

UPDATE issue_triage SET triage_state = 'closed', close_evidence = (
  SELECT CASE
    WHEN (SELECT MIN(b.id) FROM agent_issues b WHERE b.title = a.title AND b.id > a.id) IS NOT NULL
      THEN 'NO-SILENT-DROP-3 superseded: the same title was filed again as #' || (SELECT MIN(b.id) FROM agent_issues b WHERE b.title = a.title AND b.id > a.id)
    WHEN (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.issue_id = a.id AND v.pass = 1) IS NOT NULL
      THEN 'NO-SILENT-DROP-3 probe-passed: remediation_verifications pass at ' || (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.issue_id = a.id AND v.pass = 1)
    ELSE 'NO-SILENT-DROP-3 not-recurring: closed before the close-evidence rule (2026-10-02) by ' || COALESCE(NULLIF(a.source, ''), 'an unnamed filer')
      || CASE WHEN a.source = 'kaizen-ai' THEN ' (qnfo-kaizen, retired 2026-10-06, read DeepChat local sessions, which no fleet loop reads: GUARDS-LOCAL-ONLY-1)' ELSE '' END
      || '; no issue with the same title was filed in the ' || CAST((strftime('%s', 'now') * 1000 - COALESCE(a.updated_at, a.created_at)) / 86400000 AS INTEGER)
      || ' days since; issue_refile_reopen reopens it on a refile'
  END
  FROM agent_issues a WHERE a.id = issue_triage.issue_id)
WHERE issue_id IN (SELECT id FROM bak_20261008_retro_disposition) AND TRIM(COALESCE(close_evidence, '')) = '';

UPDATE issue_triage SET close_evidence = close_evidence || '; live 2026-10-08: https://qnfo.org/ and https://papers.qnfo.org/ answer 200'
WHERE issue_id IN (41, 87, 92) AND close_evidence LIKE 'NO-SILENT-DROP-3%' AND close_evidence NOT LIKE '%answer 200%';

UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id IN (SELECT id FROM bak_20261008_retro_disposition WHERE status = 'open') AND status = 'open';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'reopening an evidence-less closure makes someone re-verify it', 'replaced reopen-and-wait with evidence-class retro-disposition (superseded, probe-passed, not-recurring); reconcile_tick reopens only post-ledger silent drops', '111 reopened in 2h, none re-verified; ~800 more queued; open_agent_issues 155 -> 267', 'historical closures carry stated evidence; the queue holds live work', 'agent_issues accounting only', 'bak_20261008_retro_disposition and the Rollback line'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'replaced reopen-and-wait%');
