-- REARM-RECONCILE-TAIL-1 (2026-10-19, charter pillar: research; agent_issues 100156, 100157 and the RESEARCH-TERMINAL trackers for the
-- three other rows below; owner directive 2026-10-12 "papers must never be published cut off"). Five COMPLETENESS-SWEEP-1 remediation
-- rewrites of already-published, truncated papers parked as PARKED-POISON-1 after three recovers, every one on the same refusal:
-- stageReconcile ended the row with "reconcile: invalid paper contract: missing: ..." because the writer's draft had been cut at the
-- 8192-token call limit, and it sent that draft back to ground to be written again (same cut, same refusal, three times).
--   rem-5311e867  fidelity-budgets-for-discrete-regularizations-of-gauge-theor   missing Practical, Conclusion
--   rem-90c03612  beyond-the-qubit-part-ii-a-constructive-research-programme-f   missing Discussion, Practical, Conclusion
--   rem-cb30180a  bottling-as-an-investment-decision-an-analytical-reanalysis-   missing Discussion, Practical, Conclusion; ends mid-text
--   rem-c7f5832b  compression-versus-consilience-in-recursive-model-generated-   missing Conclusion; ends mid-text
--   rem-3f9c61f3  critical-values-on-a-non-uniform-number-line-bifurcation-mar   missing Practical, Conclusion; ends mid-text
-- qnfo-research-exec 0.22.1 (RECONCILE-TAIL-OK-1) reconciles a cut draft of at least 8000 chars and leaves the finishing to the
-- complete stage (PAPER-COMPLETE-1), so these rows can now succeed. This re-arms each once (terminal_rearms = 0 only), the pipeline's
-- own lever (RESEARCH-EXEC-0-13, precedent REARM-TRUNCATED-REWRITES-1 on 2026-10-13: two of three rewrites then published), with the
-- prior state kept in bak_20261019_reconcile_tail_rearm. A row that parks again is not re-armed a second time. A re-armed row restarts
-- at ground, so its reconcile step runs well after the 0.22.1 deploy. Rows parked on a thin draft ("missing: Introduction, Background,
-- ...", db5dc635) or already re-armed once (77ddda46) are not touched.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_reconcile_tail_rearm
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), attempt = (SELECT b.attempt FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id), claimed_at = (SELECT b.claimed_at FROM bak_20261019_reconcile_tail_rearm b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261019_reconcile_tail_rearm)

CREATE TABLE IF NOT EXISTS bak_20261019_reconcile_tail_rearm AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE id IN ('rem-5311e867-c7f0-4559-a58c-bfefc49705c6', 'rem-90c03612-96cf-457b-aa5f-7a5f5fdf132f', 'rem-cb30180a-e2fd-4198-8c27-f247f0db7cce', 'rem-c7f5832b-a057-47e5-b67a-5e0d6d6259ac', 'rem-3f9c61f3-63c7-42f5-a99b-3a06d5e2d716')
  AND status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND instr(COALESCE(error, ''), 'reconcile: invalid paper contract: ') > 0;

UPDATE research_queue
SET status = 'queued', stage = NULL, claimed_at = NULL, attempt = 0, recover_count = 0, terminal_rearms = terminal_rearms + 1, context = NULL,
    error = substr('REARMED 2026-10-19 (REARM-RECONCILE-TAIL-1: qnfo-research-exec 0.22.1 reconciles a cut draft and the complete stage finishes it; prior state in bak_20261019_reconcile_tail_rearm). Was: ' || COALESCE(error, ''), 1, 300)
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND id IN (SELECT id FROM bak_20261019_reconcile_tail_rearm);
