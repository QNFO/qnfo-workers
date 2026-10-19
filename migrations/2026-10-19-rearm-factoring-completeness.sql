-- REARM-FACTORING-COMPLETENESS-1 (2026-10-19, charter pillar: research; agent_issues 2393 PAPER-COMPLETE-1; owner directive 2026-10-12
-- "papers must never be published cut off ... and relate to practical applications").
-- Issue 2393 closes when the republished factoring paper carries its Practical Implications section. Measured 2026-10-19 15:50Z:
--   papers.qnfo.org/papers/factoring-hardness-as-a-bayesian-prior-... answers 200 and does not contain "Practical Implications"
--   (living-paper papers.version 1.0.0, updated 2026-10-12 08:16, body_md 22833 chars, instr(body_md, 'Practical Implications') = 0);
--   its COMPLETENESS-SWEEP-1 remediation row rem-9e69ce22 (created 2026-10-12T13:31Z) is wontfix/parked since PARKED-POISON-1:
--   recover_count 3, last error "review: 3 HARD findings unresolved after 6 revise cycles (H1,H2,H3)", terminal_rearms = 0.
-- The rewrite was parked before qnfo-research-exec 0.22.1 (RECONCILE-TAIL-OK-1), 0.23 to 0.26 (revision loop) and PAPER-COMPLETE-1 on
-- cut drafts; no other session or migration touches this row (git grep rem-9e69ce22 on origin/main finds nothing). This re-arms it
-- once (terminal_rearms = 0 only), the pipeline's own lever (RESEARCH-EXEC-0-13; precedents REARM-TRUNCATED-REWRITES-1 2026-10-13 and
-- REARM-RECONCILE-TAIL-1 2026-10-19), with the prior state kept in bak_20261019_rearm_factoring. A row that parks again is not
-- re-armed a second time and stays on issue 2393 with its closing probe.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_rearm_factoring
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), attempt = (SELECT b.attempt FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id), claimed_at = (SELECT b.claimed_at FROM bak_20261019_rearm_factoring b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261019_rearm_factoring)

CREATE TABLE IF NOT EXISTS bak_20261019_rearm_factoring AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE id = 'rem-9e69ce22-2d14-4d23-9468-cb130b873d86'
  AND status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND instr(COALESCE(error, ''), 'PARKED-POISON-1') > 0;

UPDATE research_queue
SET status = 'queued', stage = NULL, claimed_at = NULL, attempt = 0, recover_count = 0, terminal_rearms = terminal_rearms + 1, context = NULL,
    error = substr('REARMED 2026-10-19 (REARM-FACTORING-COMPLETENESS-1, agent_issues 2393: parked before RECONCILE-TAIL-OK-1 and the 0.23-0.26 revision loop; prior state in bak_20261019_rearm_factoring). Was: ' || COALESCE(error, ''), 1, 300)
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND id IN (SELECT id FROM bak_20261019_rearm_factoring);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a remediation rewrite parked on defects the pipeline has since corrected is re-armed once by the pipeline''s own lever, not worked by hand',
  'REARM-FACTORING-COMPLETENESS-1: rem-9e69ce22 (factoring-hardness paper, PAPER-COMPLETE-1 sweep row) re-armed once, terminal_rearms 0 -> 1, backup bak_20261019_rearm_factoring',
  'living-paper papers.body_md of the factoring paper has no Practical Implications section (instr = 0, 2026-10-19T15:50Z); research_queue rem-9e69ce22 wontfix/parked on 3 unresolved HARD findings after 6 revise cycles, terminal_rearms 0; qnfo-research-exec /health 0.26.0-revision-loop',
  'one research_queue row re-queued; the pipeline rewrites and drainV2 republishes it',
  'one paper republished as a new version of the same record; a failed rewrite parks again and is not re-armed twice',
  'the Rollback line of this file',
  'a cut-off or section-less published paper reaches a doer through the pipeline''s own re-arm',
  'research_queue rem-9e69ce22 published rows >= 1 within 24 h',
  'papers.qnfo.org gets the corrected version of one paper',
  'd1:qnfo-audit research_queue, d1:living-paper papers.body_md, https://papers.qnfo.org/papers/factoring-hardness-as-a-bayesian-prior-a-decision-theoretic-model-of-post-quantu'
WHERE EXISTS (SELECT 1 FROM bak_20261019_rearm_factoring)
  AND NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'REARM-FACTORING-COMPLETENESS-1:%');
