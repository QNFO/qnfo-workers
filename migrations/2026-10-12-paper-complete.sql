-- PAPER-COMPLETE-1 + PRACTICAL-RELEVANCE-1 (2026-10-12, pillar research; owner directive 2026-10-12: "papers shall have no
-- maximum limit"; "papers shall relate more directly to practical applications, real-world challenges and engineerable or
-- manufacturable solutions"). Every Workers AI call in qnfo-research-exec stops at 8192 output tokens, so a paper longer than
-- one call was cut where the budget ran out and renderReferences appended a clean reference list that hid the cut. Ten
-- pipeline papers published 2026-10-09..12 end mid-sentence or mid-equation and cite sections that do not exist
-- (factoring-hardness-as-a-bayesian-prior-a-decision-theoretic-model-of-post-quantu, row 2d279690). qnfo-research-exec 0.14.0
-- adds the `complete` stage (continuation over as many calls as a paper needs) and COMPLETENESS-SWEEP-1 (published papers
-- that fail the cut checks are rewritten through remediation and republished as a new version). This file records the failure
-- mode and its detector: published pipeline papers since the deploy that lack a closing section.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-paper-published-truncated'; DELETE FROM failure_modes WHERE fm_key = 'paper-published-truncated'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('paper-published-truncated', 'a research paper is published cut off mid-text',
  'each model call stops at 8192 output tokens (AI_TEXT_MAX_OUT), a full paper needs more, nothing checked that a paper reached its end, and the mechanical reference list hid the cut',
  'PAPER-COMPLETE-1 (qnfo-research-exec 0.14.0): the complete stage continues a paper until paperCompleteness passes; review, revise and verify route an incomplete paper back to it; COMPLETENESS-SWEEP-1 rewrites published cut-off papers through remediation',
  'no published pipeline paper created after the 0.14.0 deploy lacks a Discussion, Practical or Conclusion section', 'fm-paper-published-truncated', '2026-10-09', NULL,
  'a paper longer than one model call reaches publish', 'papers.qnfo.org pages ending mid-sentence, sections cited that do not exist', 'public research output: readers and citations see incomplete papers');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-paper-published-truncated', NULL, 'PAPER-COMPLETE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE status = ''published'' AND id IS NULL AND created_at >= ''2026-10-13'' AND (body_md NOT LIKE ''%Discussion%'' OR body_md NOT LIKE ''%Practical%'' OR body_md NOT LIKE ''%Conclusion%'')) AS TEXT) AS observed', 'd1-query@living-paper', 3, 'qnfo-research-exec', 24, 'active', 'failure-mode', 45000, 5, 0);
