-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE version_queue SET status = (SELECT b.status FROM bak_20261028_cfa2_vq b WHERE b.id = version_queue.id) WHERE id IN (SELECT id FROM bak_20261028_cfa2_vq); UPDATE paper_revision_log SET status = (SELECT b.status FROM bak_20261028_cfa2_prl b WHERE b.id = paper_revision_log.id), error = (SELECT b.error FROM bak_20261028_cfa2_prl b WHERE b.id = paper_revision_log.id) WHERE id IN (SELECT id FROM bak_20261028_cfa2_prl); UPDATE issue_triage SET triage_state = 'triaged', close_evidence = NULL WHERE owner = 'cluster-f-a' AND issue_id IN (1000546, 1000631); UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id IN (1000546, 1000631) AND close_channel = 'session:cluster-f-a'
-- BACKUP: bak_20261028_cfa2_vq
--
-- CLUSTER-F-A part 2 (2026-10-28, charter pillar autonomy; agent_issues 1000630 and 100166 through the dashboard error list, 1000546, 1000631).
--
--  version_queue 257 (topological-extension-hypothesis 1.0.0 -> 2.0.0) sat in status 'error' since 2026-10-28T04:31:16Z and was the second error-level issue of the dashboard state ("Queue version_queue: error=1"), which kept the
--    loop-heartbeats journey red (FLEET-JOURNEY-FAILED-1 loop-heartbeats, 1000630) once the research chain stopped reading stuck. The v2-drain event of that minute names the cause: the living-paper trigger
--    trg_papers_pub_floor_upd3 refused the update (PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-4: a published paper cannot be cut to half its length); the revision is 37,858 chars and the live paper 93,103. The guard is right, a retry can never pass,
--    and nothing re-arms an 'error' version row (FAILED-REARM-1 covers research_queue). The row is terminal like a gate-blocked row after its attempts (terminalizeGateBlocked): version_queue 'wontfix', the revision log row
--    'needs-substantive-revision' with the reason, a gov_gate_log RESOLVE row. The code change that does this for the next such row is qnfo-research-exec (VERSION-FLOOR-TERMINAL-1).
--  1000546: the code task ct_im1000340 (BP26-SOCIAL-AUTOMATION-1) failed whole-sentences.test.mjs three times. The edit it was asked for, reserving the automation marker's length in the per-channel limits, is already in qnfo-social
--    (MARKER_MAX_CHARS and withAutomationMarker at the Bluesky, Mastodon and Buffer service paths, qnfo-social 0.20.0 to 0.21.1), as the DELTA-NOTE of session-cluster-e-a on the parent 1000340 records: "no code change is owed on this parent".
--  1000631: the task it reports (ct_im1000625, the /sla-gap endpoint of agent_issues 1000619) is replaced by the session pull request 5165 (qnfo-lifecycle 1.16.0); the route answers 200 and 1000619 closed on its runtime-probe contract.
CREATE TABLE IF NOT EXISTS bak_20261028_cfa2_vq AS SELECT id, status FROM version_queue WHERE id = 257;
CREATE TABLE IF NOT EXISTS bak_20261028_cfa2_prl AS SELECT id, status, error FROM paper_revision_log WHERE id = 1453;

UPDATE paper_revision_log SET status = 'needs-substantive-revision',
  error = 'PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-4: the 2.0.0 revision (37858 chars) is under half of the published paper (93103 chars); terminal, a substantive revision that keeps the paper is needed (CLUSTER-F-A 2026-10-28, version_queue 257)',
  updated_at = datetime('now')
WHERE id = 1453 AND slug = 'topological-extension-hypothesis' AND status = 'queued' AND EXISTS (SELECT 1 FROM version_queue WHERE id = 257 AND status = 'error');
INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code)
SELECT datetime('now'), 'floor-gate', 'RESOLVE', 'terminal-wontfix slug=topological-extension-hypothesis version_queue 257: PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-4, the revision is under half of the published paper', 'MIN-PAPER-LENGTH-4', 'session-cluster-f-a', 'P1'
WHERE EXISTS (SELECT 1 FROM version_queue WHERE id = 257 AND status = 'error' AND slug = 'topological-extension-hypothesis');
UPDATE version_queue SET status = 'wontfix', updated_at = datetime('now') WHERE id = 257 AND slug = 'topological-extension-hypothesis' AND status = 'error';

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'cluster-f-a', 'closed', 'cluster-f-a', datetime('now'),
  'CLUSTER-F-A 2026-10-28: code task ct_im1000340 (BP26-SOCIAL-AUTOMATION-1, qnfo-social/worker.js) failed whole-sentences.test.mjs on 3 attempts because the edit it was asked for is not owed any more. The REM-ORCH item (reserve the marker length in the per-channel limits) is in qnfo-social on main: MARKER_MAX_CHARS with withAutomationMarker(svcText, MARKER_MAX_CHARS[svc] || 280) in bufferCreate, and the same helper at the Bluesky and Mastodon paths (qnfo-social 0.20.0 to 0.21.1); the DELTA-NOTE of session-cluster-e-a on agent_issues 1000340 records that no code change is owed on that parent and what remains is the account-side label (identity-bound card bp26-social-bot-labels, resolved with the in-text marker as default). The task is replaced by code already on main, which its definition of done allows.'
FROM agent_issues a
WHERE a.id = 1000546 AND a.status = 'open'
  AND EXISTS (SELECT 1 FROM agent_issues p WHERE p.id = 1000340 AND instr(p.description, 'DELTA-NOTE (session-cluster-e-a') > 0)
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'cluster-f-a', 'closed', 'cluster-f-a', datetime('now'),
  'CLUSTER-F-A 2026-10-28: the refused task (ct_im1000625, the /sla-gap endpoint requested by agent_issues 1000619) named the FOLDED member qnfo-backlog-exec/worker.js and was refused by the goal review both times. The endpoint was built as a session pull request (5165) in both files that must stay identical: qnfo-lifecycle 1.16.0 serves GET /backlog/sla-gap (member route /sla-gap) and answered 200 with counts and first20_no_doer at 2026-10-28T20:00Z; agent_issues 1000619 closed on its runtime-probe contract (auto:verified-remediation-trigger).'
FROM agent_issues a
WHERE a.id = 1000631 AND a.status = 'open'
  AND EXISTS (SELECT 1 FROM agent_issues p WHERE p.id = 1000619 AND p.status = 'closed')
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;
UPDATE agent_issues SET close_channel = 'session:cluster-f-a' WHERE id IN (1000546, 1000631) AND status = 'closed' AND close_channel LIKE 'auto:triage-sync:cluster-f-a%';
