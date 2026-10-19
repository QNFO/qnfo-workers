-- COMPANION-CONTROLS-REASON-1 (2026-10-19, pillar autonomy; agent_issues 2826 PATHS-UNTESTED-1 and 2880, follow-up to COMPANION-STALL-YIELD-1, PR 3116, and CONTROL-ALT-PROBES-3, PR 3118).
-- Measured 2026-10-19 20:5xZ, qnfo-audit, SELECT only: after PR 3118 v_control_alternate_untested.controls_untested_without_probe read 3, and the three controls are the ones
-- migrations/2026-10-19-companion-stall-yield.sql registered: companion-stall-close-gate, companion-prune-repeat-stop and companion-attempt-budget-stop. Each declares an alternate (the
-- previous closer, the previous prune loop, the previous attempt check: the revert of personal-companion 1.37.0), has no control_alternate_probes row and no alternate_tested_at, so
-- fm-control-alternate-undrilled kept failing on them.
-- Why no probe: what these controls do is logged as stage rows in companion_runs, which lives in the personal-life D1 and is not readable from qnfo-audit (the personal/research
-- separation). The only mirror in qnfo-audit, content_external_items for property reading.q08.org, holds whole runs (stage published 7 rows, rejected 780 rows at 2026-10-19 20:06Z), never
-- a stage row, so a read of it cannot tell whether a stop fired or the previous behaviour ran; a probe on it could pass only by absence and would stamp a declaration.
-- This file does for them what CONTROL-ALT-PROBES-3 did for model_floor_pr_check and the two research controls: ALTERNATE-NOT-EXERCISABLE with its reason in control_registry.evidence and a
-- confirmed blocker_redteam row control:<name> carrying a surfaces: line. The path views read the marker on a row that has no probe (PR 3118), and fm-control-alternate-reason-unread
-- requires the red-team row; alternate_tested_at stays NULL on purpose and nothing is stamped. What the controls do is pinned offline by personal-companion/stall-detector.test.mjs and
-- personal-companion/verify.test.mjs.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE control_registry SET evidence = replace(evidence, ' | ALTERNATE-NOT-EXERCISABLE (COMPANION-CONTROLS-REASON-1 2026-10-19): the alternate is the previous code behaviour and what the control does is logged as companion_runs stage rows in the personal-life D1, which qnfo-audit cannot read; content_external_items mirrors whole runs only, so no read can tell a stop from the previous behaviour; pinned offline by personal-companion/stall-detector.test.mjs and verify.test.mjs.', '') WHERE control IN ('companion-stall-close-gate', 'companion-prune-repeat-stop', 'companion-attempt-budget-stop'); DELETE FROM blocker_redteam WHERE actor = 'session_01QpQv19uh1padRwZ3u1r766' AND attempt LIKE 'COMPANION-CONTROLS-REASON-1 2026-10-19%' AND target IN ('control:companion-stall-close-gate', 'control:companion-prune-repeat-stop', 'control:companion-attempt-budget-stop')
-- BACKUP: blocker_redteam
-- Rollback note: a blocker_redteam row is only added by this file (a NOT EXISTS guard on its target), so the table itself is the backup of every other row; the Rollback deletes only this file's three rows.

UPDATE control_registry
SET evidence = COALESCE(evidence, '') || ' | ALTERNATE-NOT-EXERCISABLE (COMPANION-CONTROLS-REASON-1 2026-10-19): the alternate is the previous code behaviour and what the control does is logged as companion_runs stage rows in the personal-life D1, which qnfo-audit cannot read; content_external_items mirrors whole runs only, so no read can tell a stop from the previous behaviour; pinned offline by personal-companion/stall-detector.test.mjs and verify.test.mjs.'
WHERE control IN ('companion-stall-close-gate', 'companion-prune-repeat-stop', 'companion-attempt-budget-stop')
  AND COALESCE(evidence, '') NOT LIKE '%ALTERNATE-NOT-EXERCISABLE%'
  AND alternate_tested_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM control_alternate_probes p WHERE p.control = control_registry.control);

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'control:companion-stall-close-gate', 'ALTERNATE-NOT-EXERCISABLE: the alternate of companion-stall-close-gate (the previous closer, the revert of personal-companion 1.37.0) leaves no row qnfo-audit can read that tells a held issue from a closed one by the old rule',
  'COMPANION-CONTROLS-REASON-1 2026-10-19, SELECT only against qnfo-audit: content_external_items for property reading.q08.org by stage, issue_triage.close_evidence for the stall issues',
  'confirmed-with-evidence', 'content_external_items holds stage published (7 rows, newest 2026-10-19T04:04:53Z) and stage rejected (780 rows), whole runs and never a stage row. The close evidence the 1.37.0 closer writes (both after issue N, no two failed generation runs between them) appears only on a close that has not happened yet (100064 is open), so a probe on it would pass by absence or wait for the event. The rule is pinned offline by personal-companion/stall-detector.test.mjs. | surfaces: qnfo-audit content_external_items and issue_triage (SELECT only), the personal-companion companionStallDetector source, the offline suite personal-companion/stall-detector.test.mjs',
  'session_01QpQv19uh1padRwZ3u1r766'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'control:companion-stall-close-gate');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'control:companion-prune-repeat-stop', 'ALTERNATE-NOT-EXERCISABLE: the alternate of companion-prune-repeat-stop (the previous prune loop, PRUNE_ROUNDS rounds then the corrective revision and the extension) leaves no D1 trace in qnfo-audit a read-only probe can observe',
  'COMPANION-CONTROLS-REASON-1 2026-10-19, SELECT only against qnfo-audit: content_external_items for property reading.q08.org by stage',
  'confirmed-with-evidence', 'The prune rounds and the stop are companion_runs stage rows in the personal-life D1, outside qnfo-audit. content_external_items mirrors whole runs only (published 7, rejected 780), so a read cannot tell a stopped loop from a loop that ran its rounds. The stop is pinned offline by the end-to-end generate() tests in personal-companion/verify.test.mjs. | surfaces: qnfo-audit content_external_items (SELECT only), the personal-companion generate source (pruneRepeat, pruneClassOf), the offline suite personal-companion/verify.test.mjs',
  'session_01QpQv19uh1padRwZ3u1r766'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'control:companion-prune-repeat-stop');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'control:companion-attempt-budget-stop', 'ALTERNATE-NOT-EXERCISABLE: the alternate of companion-attempt-budget-stop (the previous check, an attempt starts while any budget remains within GEN_BUDGET_MS) leaves no D1 trace in qnfo-audit a read-only probe can observe',
  'COMPANION-CONTROLS-REASON-1 2026-10-19, SELECT only against qnfo-audit: content_external_items for property reading.q08.org by stage',
  'confirmed-with-evidence', 'The budget stop is logged as a companion_runs stage row in the personal-life D1, outside qnfo-audit; the run-level mirror in content_external_items carries no timing or stage. The decision is pinned offline by attemptBudgetStop tests in personal-companion/verify.test.mjs. | surfaces: qnfo-audit content_external_items (SELECT only), the personal-companion generate source (attemptBudgetStop, GEN_BUDGET_MS), the offline suite personal-companion/verify.test.mjs',
  'session_01QpQv19uh1padRwZ3u1r766'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'control:companion-attempt-budget-stop');
