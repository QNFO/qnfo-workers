-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control IN ('publish-floor-reinstatement', 'publish-floor-new-paper', 'research-dead-daily-cap-5', 'research-proposal-low-value-park', 'pub-gate-revise-routing'); UPDATE control_registry SET disposition_state = 'planned' WHERE control = 'pub-gate-withdraw'; UPDATE guard_registry SET invariant = 'Transition into published requires at least 20000 chars; an already-published row cannot drop below 8000 chars or below half its prior length', claim = 'Transition into published requires at least 20000 chars; an already-published row cannot drop below 8000 chars or below half its prior length' WHERE guard = 'trg_papers_pub_floor_upd3'; UPDATE agent_issues SET status = 'closed' WHERE title IN ('RESEARCH-DEAD-DAILY-CAP-1: remove the dead 5-a-day publication cap in qnfo-research-exec publishStage', 'PROPOSAL-PARK-TO-ORDER-1: research proposals parked as wontfix for score < 0.8 become ordered, not dropped')
-- PUBLICATION-GATE-AUDIT-1 (2026-10-26, pillar research and reach). Owner 2026-10-26 06:35 and 06:49: no gates, hold-backs or "safety
-- checks" the owner did not ask for; audit and remediate the publication quality checks and gates; never withdraw the owner's papers.
-- Every check on the path to papers.qnfo.org, what it held back (read 2026-10-26 07:00Z from living-paper and qnfo-audit), and its
-- disposition. Checks that stop false claims stay (the owner asked for CLAIM-INTEGRITY-1 on 2026-10-19 after published papers described
-- experiments that never ran; fabricated citations are the same class).
--   pub-gate-withdraw (qnfo-cloud-ops jobQualityScore): withdrew 364 published papers 2026-10-25 17:00-20:00Z, 69 owner. REMOVED in
--     qnfo-cloud-ops 1.36.0 (PR 4298, merged 06:45Z); 1.36.1 restores each paper on its own so one refusal cannot sink the run.
--   publish-floor-reinstatement (living-paper trg_papers_pub_floor_upd3): refused 11 of the 162 restores (8k-20k chars) and the owner
--     paper restores of agent_issues 100274. DEMOTED by migrations/2026-10-26-publish-floor-reinstate.sql (living-paper).
--   pub-gate-revise-routing: a paper that fails the post-publication score stays live with release_gate_pass 0 and goes to the revision
--     loop first. KEEP: it withholds nothing.
--   publish-floor-new-paper (qnfo-research-exec PUBLISH_FLOOR_CHARS and living-paper trg_papers_pub_floor_ins2): a new pipeline paper needs
--     20,000 chars; COMPLETE-TO-FLOOR-1 extends a short draft instead of dropping it. KEEP: applies to new pipeline output only, never to
--     a published or owner paper.
--   claim-integrity-gate, research-citation-unverified-hold: KEEP (false-claim checks; the owner asked for the first).
--   research-dead-daily-cap-5 (qnfo-research-exec publishStage, REVISE-NOOP-WAIVE-1): a 5-a-day cap misread from issue 1000029, in code
--     that is no longer called. REMOVE: issue below with a code-probe (the file is claimed by another session right now).
--   research-proposal-low-value-park (PARKED-LOW-VALUE-1): 585 research proposals set wontfix for score < 0.8. REPLACE with ordering by
--     score under the COST-SUSTAIN-1 budget: issue below.
--   The publish_quotas daily quota (60) is a cadence cap, not a quality gate, and does not bind (5 published a day under the research
--     budget, which only the owner can raise).
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('publish-floor-reinstatement', 'living-paper trg_papers_pub_floor_upd3 (MIN-PAPER-LENGTH-4)', 'guard', 'stub or halved papers served as published', 1, 'demote', 'applied',
  'quarantined or retracted pipeline papers return at 8,000 chars or more; owner papers (qnfo-2025-*) are never refused for length or type; a published paper is refused only when a write cuts it below 8,000 chars or to half',
  '2026-10-26T07:10:00Z', 'living-paper 2026-10-26 07:00Z: 162 papers quarantined with reason quality:%, 11 of them 8k-20k chars, refused by the old rule (retracted with a passing gate only); owner restores of agent_issues 100274 refused (backups 8.3k-19k). migrations/publish-floor-reinstate.test.mjs, 11 cases.', NULL),
 ('pub-gate-revise-routing', 'qnfo-cloud-ops jobQualityScore pubGateVerdict (pub-gate-v4-no-withdraw)', 'gate', 'weak published papers left unimproved', 0, 'keep', 'applied',
  'the paper stays published; release_gate_pass 0 and the reason route it to the revision loop first (REVISION-LOOP-1)', '2026-10-26T07:10:00Z',
  'qnfo-cloud-ops 1.36.0 (PR 4298): no paper is withdrawn; publication_gate_audit records each verdict change.', NULL),
 ('publish-floor-new-paper', 'qnfo-research-exec publishStageV2 PUBLISH_FLOOR_CHARS; living-paper trg_papers_pub_floor_ins2', 'gate', 'fragments and posters published as papers', 1, 'keep', 'applied',
  'COMPLETE-TO-FLOOR-1 extends a draft under the floor with grounded sections instead of dropping it; remediation rows use MIN_PAPER_CHARS', '2026-10-26T07:10:00Z',
  'Applies to new pipeline papers only. research_queue 2026-10-26: no row held or errored by the floor; the publish rate (5/day) is set by the COST-SUSTAIN-1 research budget, not this check.', NULL),
 ('research-dead-daily-cap-5', 'qnfo-research-exec publishStage (REVISE-NOOP-WAIVE-1), not called since publishStageV2', 'cap', 'nothing: misread from issue 1000029, which reported a 5/day outcome', 0, 'remove', 'planned',
  'publishStageV2 is the live path and has no such cap', '2026-10-26T07:10:00Z', 'grep of qnfo-research-exec/worker.js on main 5a2ae80: publishStage is defined and never called; the cap text sits at its line 946.', NULL),
 ('research-proposal-low-value-park', 'qnfo-research-exec proposal intake (PARKED-LOW-VALUE-1)', 'filter', 'spending the research budget on weak proposals', 0, 'replace', 'planned',
  'order proposals by score under the daily research budget instead of closing them as wontfix', '2026-10-26T07:10:00Z', 'research_queue 2026-10-26 07:00Z: 585 rows status wontfix with PARKED-LOW-VALUE-1 (score < 0.8).', NULL);
UPDATE control_registry SET disposition_state = 'applied', evidence = evidence || ' | applied: qnfo-cloud-ops 1.36.0 (PR 4298, merged 2026-10-26 06:45Z) withdraws nothing; 1.36.1 restores each paper in its own batch (PUBLICATION-GATE-AUDIT-1).', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE control = 'pub-gate-withdraw';
UPDATE guard_registry SET invariant = 'A new pipeline paper needs 20000 chars and a paper type; a quarantined or retracted pipeline paper returns at 8000 chars or more; owner papers (qnfo-2025-*) are never refused for length or type; a published paper cannot be cut below 8000 chars or to half its length (MIN-PAPER-LENGTH-4)', claim = 'A new pipeline paper needs 20000 chars and a paper type; a quarantined or retracted pipeline paper returns at 8000 chars or more; owner papers (qnfo-2025-*) are never refused for length or type; a published paper cannot be cut below 8000 chars or to half its length (MIN-PAPER-LENGTH-4)', negative_test = 'Move a 15000-char draft pipeline row to published; expect PUBLISH-FLOOR-BLOCKED (migrations/publish-floor-reinstate.test.mjs)', remediation_hint = 'Extend the paper (COMPLETE-TO-FLOOR-1); never shrink a published paper' WHERE guard = 'trg_papers_pub_floor_upd3';
INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'RESEARCH-DEAD-DAILY-CAP-1: remove the dead 5-a-day publication cap in qnfo-research-exec publishStage',
 'PUBLICATION-GATE-AUDIT-1 (owner 2026-10-26: no gates the owner did not ask for). publishStage in qnfo-research-exec/worker.js is never called (publishStageV2 is the live path) but still holds a hard 5-a-day publication cap (REVISE-NOOP-WAIVE-1) misread from issue 1000029, which only reported a 5/day outcome. Remove the cap block (or the whole dead function) so it cannot come back with a refactor. Pillar research. Doer: the code loop.
code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: REVISE-NOOP-WAIVE-1: daily publication cap of 5 reached
code-probe: {"paths": ["qnfo-research-exec/worker.js"], "absent": "daily publication cap of 5 reached"}',
 'session:publication-gate-audit', 'remediation', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'RESEARCH-DEAD-DAILY-CAP-1: remove the dead 5-a-day publication cap in qnfo-research-exec publishStage' AND status = 'open');
INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'PROPOSAL-PARK-TO-ORDER-1: research proposals parked as wontfix for score < 0.8 become ordered, not dropped',
 'PUBLICATION-GATE-AUDIT-1 (owner 2026-10-26: no hold-backs the owner did not ask for). research_queue holds 585 rows status wontfix with PARKED-LOW-VALUE-1 (proposal score < 0.8). The research budget (COST-SUSTAIN-1, 360k neurons a day) already limits how many run; a score threshold that closes proposals drops them instead of ordering them. Replace the park with ordering by score (highest first) and return the parked rows to queued with their score kept, so the budget decides how far down the list the pipeline reaches. Pillar research. Doer: qnfo-research-exec (code loop).
Closing probe (d1-query): SELECT COUNT(*) AS n FROM research_queue WHERE status = ''wontfix'' AND error LIKE ''PARKED-LOW-VALUE-1%'' expected 0',
 'session:publication-gate-audit', 'remediation', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PROPOSAL-PARK-TO-ORDER-1: research proposals parked as wontfix for score < 0.8 become ordered, not dropped' AND status = 'open');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_015zw8XkdEJoyrkHZAb2LzhZ', 'The owner did not ask for a length floor that blocks restoring papers the fleet itself withdrew, nor for any gate that withdraws the owner''s papers; false-claim checks stay.',
  'PUBLICATION-GATE-AUDIT-1: audited every publication check; demoted the living-paper reinstatement floor (owner papers exempt, reinstatement at 8,000 chars), made the gate restore per paper (qnfo-cloud-ops 1.36.1), gave the CI migration runner a living-paper path, filed the dead-cap and proposal-park issues.',
  'living-paper 2026-10-26 07:00Z: 371 quarantined (97 owner), 162 by the quality gate, 11 of those under 20,000 chars; publication_gate_audit: 364 demotes 2026-10-25 17-20Z by pub-gate-v2-structure.',
  'pending', 'papers.qnfo.org listing and sitemap; living-paper papers status', 'Rollback lines of migrations/2026-10-26-publish-floor-reinstate.sql and this file; revert the PR for qnfo-cloud-ops',
  'The CI migration runner can change living-paper guards (MIGRATION-LIVING-PAPER-1).', 'quarantined papers with release_gate_reason quality:% = 0 within 120 min of the deploy', 'about 160 papers back on papers.qnfo.org and in the sitemap',
  'living-paper UPDATE through the worker (refused by the trigger before this change), the CI migration path (qnfo-audit only before this change), session D1 access (used only to read)');
