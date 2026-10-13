-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE doctrine_proposals SET status = 'proposed', disposed_at = NULL WHERE id IN (1, 4) AND disposed_at >= '2026-10-13T09:00:00Z' (the code_tasks lease change only moved retries earlier and needs no rollback)
-- DOCTRINE-PROPOSALS-DISPOSED-20261013 + CODE-BACKOFF-SLA-1 (2026-10-13, pillar autonomy; metrics doctrine_proposals_open 2 and
-- stuck_items_over_sla 1).
-- (1) doctrine_proposals 1 and 4 waited over 24 hours although both were already in force; a proposal is adopted by PR, and the
--     PRs had landed without disposing the rows:
--       1 (false_stop report-as-question from ops_ai_log): KERNEL-REPLY-1 is in the qnfo-ops operator prompt since 2026-10-12 and
--         KERNEL-REPLY-2 (qnfo-ops 2.45.1, PR 1098, live since 2026-10-13 07:02 UTC) put the same rule in the public read-only and
--         code-only prompts that produced the flagged replies. Adopted.
--       4 (kernel 8.2.0): docs/DOCTRINE-KERNEL.md carries owner version 8.2.1 (PR 1007), and doctrine_lineage records 8.1.0 and
--         8.2.0 as drafts subsumed by kernel-8.2.1. Superseded by 8.2.1.
-- (2) code_tasks_stalled counted a task waiting out the second SELF-REPAIR-1 backoff of 6 hours, longer than the 180-minute
--     code-task-stalled SLA. qnfo-code-orchestrator 0.14.3 (same pull request) waits 1 h and then 2 h.
UPDATE doctrine_proposals SET status = 'adopted', version = 'qnfo-ops 2.45.1 KERNEL-REPLY-2',
  red_team_result = COALESCE(red_team_result, 'Red-team 2026-10-13: the rule only changes how a reply ends (the result, never an offer or a question); a refusal or a limit is still stated plainly with its reason (kernel reading q), so no honest answer is suppressed.'),
  metrics_improved = COALESCE(metrics_improved, 'false_stops_7d'), disposed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 1 AND status = 'proposed';
UPDATE doctrine_proposals SET status = 'superseded', disposed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 4 AND status = 'proposed' AND EXISTS (SELECT 1 FROM doctrine_lineage WHERE version = 'kernel-8.2.1');
-- (3) A task already parked under the old 6 h wait keeps it until it resumes; its lease is brought inside the new schedule (at most
--     2 h from now), so it no longer counts as stuck. Only the wait moves earlier; the task, its round and its attempts are unchanged.
UPDATE code_tasks SET lease_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'queued' AND lease_until IS NOT NULL AND lease_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+2 hours');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a proposal whose change already landed is disposed with the change as evidence; a retry wait never exceeds the stuck SLA it is measured against',
  'DOCTRINE-PROPOSALS-DISPOSED-20261013: proposal 1 adopted (qnfo-ops KERNEL-REPLY-1/-2), proposal 4 superseded by kernel 8.2.1; CODE-BACKOFF-SLA-1: qnfo-code-orchestrator self-repair waits 1 h then 2 h',
  'doctrine_proposals 1 and 4 proposed since 2026-10-12 08:0x; docs/DOCTRINE-KERNEL.md owner version 8.2.1; doctrine_lineage kernel-8.2.1; qnfo-ops /health 2.47.0 carries KERNEL-REPLY-2; v_stuck_summary 09:10 UTC code_tasks_stalled 1 = ct_ne8sjnxe748hiz idle since 05:50 with lease_until 11:50',
  'merged through the canonical path', 'two doctrine_proposals rows; the retry spacing of failing code tasks', 'the Rollback line of this file and a revert of qnfo-code-orchestrator 0.14.3',
  'retry waits inside the stuck SLA', 'doctrine_proposals_open reads 0 and stuck_items_over_sla reads 0 at the first ticks after the merge', 'none',
  'd1:doctrine_proposals, doctrine_lineage, v_stuck_summary, queue_sla, code_tasks; code:qnfo-code-orchestrator RETRY_BACKOFF_MS, qnfo-ops prompts');
