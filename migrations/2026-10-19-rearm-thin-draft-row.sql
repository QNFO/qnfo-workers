-- REARM-THIN-DRAFT-1 (2026-10-19, charter pillar: research; agent_issues 100051 RESEARCH-TERMINAL db5dc635, root cause RESEARCH-REVISE-LOOP-1 99913).
-- research_queue row db5dc635-d7d5-471a-aae7-fd2e5bba318d (proposal 1366, "Non-Archimedean Statistical Foundations for a Fully Connected
-- Reality") is the one row of the RESEARCH-TERMINAL family that no repair path returns to the pipeline. Measured 2026-10-19 15:20Z on
-- cloud_ops_events: its recovers 1-3 failed on gate-length (draft 14,950 -> 16,162 chars against the 20,000 floor, verify "mismatch=true
-- gates=gate-length" at 04:32Z), the third recover re-ran ground, and that writer reply was a degenerate loop ("Te Te Te ...", ends mid-text,
-- no section) which stageReconcile refused ("invalid paper contract: missing: Introduction ... Conclusion") at 05:50Z, parking the row.
-- FLOOR-REARM-1 (qnfo-research-exec 0.24.0, frozen list bak_20261019_research_parked) never took it because its last error text names the
-- reconcile refusal, not gate-length; REARM-RECONCILE-TAIL-1 left it out on purpose ("a thin draft"), reasoning that a re-run would write the same
-- thin draft. The thin draft was one writer reply, not the row's history: the same row wrote 15-16k drafts on its earlier recovers, and
-- the live worker (0.26.0) now extends a short draft to the floor (COMPLETE-TO-FLOOR-1) and reconciles a cut one (RECONCILE-TAIL-OK-1).
-- This re-arms the row once at ground (terminal_rearms 0 -> 1, the pipeline's own lever; a row that parks again is not re-armed a second time),
-- with the prior state kept in bak_20261019_thin_draft_rearm.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_thin_draft_rearm
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), attempt = (SELECT b.attempt FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id), claimed_at = (SELECT b.claimed_at FROM bak_20261019_thin_draft_rearm b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261019_thin_draft_rearm) AND terminal_rearms = 1
-- spof-review: no new single point of failure; one row, once, through the existing claim and recover path.

CREATE TABLE IF NOT EXISTS bak_20261019_thin_draft_rearm AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE id = 'db5dc635-d7d5-471a-aae7-fd2e5bba318d'
  AND status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND instr(COALESCE(error, ''), 'reconcile: invalid paper contract') > 0;

UPDATE research_queue
SET status = 'queued', stage = NULL, claimed_at = NULL, attempt = 0, recover_count = 0, terminal_rearms = terminal_rearms + 1, context = NULL,
    error = substr('REARMED 2026-10-19 (REARM-THIN-DRAFT-1: the thin draft was one degenerate writer reply; 0.26.0 extends and reconciles drafts; prior state in bak_20261019_thin_draft_rearm). Was: ' || COALESCE(error, ''), 1, 300)
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND id IN (SELECT id FROM bak_20261019_thin_draft_rearm);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6', 'a row parked on one degenerate writer reply, after recovers that failed on a floor the worker now repairs, deserves the one re-arm its siblings got',
 'REARM-THIN-DRAFT-1: re-arm research_queue db5dc635 once at ground (migrations/2026-10-19-rearm-thin-draft-row.sql)',
 'cloud_ops_events 2026-10-19 04:32Z verify gate-length at recover 3, 05:50Z reconcile refusal of a "Te Te Te" draft; no entry in bak_20261019_research_parked (error text names the reconcile refusal); 10 of 34 frozen rows re-armed by FLOOR-REARM-1 at 14:02Z and 15:01Z, floor-extend gained 8k-13k chars on four of them',
 'applied through the canonical path on merge', 'one research_queue row; one writer run at ground and the stages after it',
 'the Rollback line restores the row from bak_20261019_thin_draft_rearm', 'the pipeline returns a row its own earlier code parked',
 'research_queue.status of db5dc635 = published within 12 h', 'none',
 'the migration against node:sqlite fixtures (migrations/rearm-thin-draft-row.test.mjs)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REARM-THIN-DRAFT-1:') = 1);
