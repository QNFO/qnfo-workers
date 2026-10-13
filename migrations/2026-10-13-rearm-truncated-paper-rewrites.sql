-- REARM-TRUNCATED-REWRITES-1 (2026-10-13, pillar research; agent_issues 2493, 2495, 2498; owner directive 2026-10-12 "papers must never
-- be published cut off"). Three COMPLETENESS-SWEEP-1 remediation rewrites parked as PARKED-POISON-1 after 2 revise cycles, so three
-- truncated papers stay published on papers.qnfo.org:
--   rem-29e4da31  adelic-consistency-conditions-...     missing Discussion and Conclusion, ends mid-text (14 HARD findings)
--   rem-39bef61e  a-taxonomy-of-exchange-statistics-... missing Conclusion (1 HARD finding)
--   rem-d6366ccb  a-cost-model-benchmark-for-mixed-...  missing Conclusion, cites a missing section 7 (6 HARD findings)
-- This re-arms each once (terminal_rearms = 0 only), the pipeline's own lever (RESEARCH-EXEC-0-13), with the prior state kept in
-- bak_20261013_truncated_rearm. A re-armed row that parks again is not re-armed a second time, and its issue then names the published
-- paper for withdrawal.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_truncated_rearm
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), attempt = (SELECT b.attempt FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261013_truncated_rearm b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261013_truncated_rearm)

CREATE TABLE IF NOT EXISTS bak_20261013_truncated_rearm AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE id IN ('rem-29e4da31-6641-46b5-84d0-5c9d7e7617e1', 'rem-39bef61e-f6ce-410c-93ac-4a46d82e97d9', 'rem-d6366ccb-0c13-4d4f-ad0e-bd07189c603a')
  AND status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0;

UPDATE research_queue
SET status = 'queued', stage = NULL, claimed_at = NULL, attempt = 0, recover_count = 0, terminal_rearms = terminal_rearms + 1, context = NULL,
    error = substr('REARMED 2026-10-13 (REARM-TRUNCATED-REWRITES-1: the published paper is still truncated; prior state in bak_20261013_truncated_rearm). Was: ' || COALESCE(error, ''), 1, 300)
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND id IN (SELECT id FROM bak_20261013_truncated_rearm);
