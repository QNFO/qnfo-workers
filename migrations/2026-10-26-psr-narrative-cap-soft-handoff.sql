-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = substr(description, 1, instr(description, char(10) || 'Handoff (2026-10-26, a built and tested diff') - 1) WHERE title LIKE 'PSR-NARRATIVE-CAP-SOFT-1:%' AND instr(description, char(10) || 'Handoff (2026-10-26, a built and tested diff') > 0
--
-- PSR-NARRATIVE-CAP-SOFT-1 handoff (2026-10-26, charter pillar: cost). agent_issues 1000409 (GitHub 4578) asks that the weekly program-strategic review writes its narrative at a breached
-- ai_spend cap on the cheapest capable model, as BUDGET-SOFT-ROUTE-1 requires (owner directive 2026-10-06). The change is built and tested (qnfo-fleet-dashboard 1.70.3: psrNarrativeTier replaces
-- psrNarrativeAllowed, the `if (narrativeAllowed) {` gate is gone, qnfo-fleet-dashboard/psr-narrative-cap-soft.test.mjs holds 38 assertions, ten mutants are each caught, all 51 dashboard suites
-- pass). qnfo-fleet-dashboard/worker.js, its mirror and cmd-decide.test.mjs are under another session's live work claim (session_014xChUSsqufDhZ9HxSQEsPd, ONE-TAP-DECISIONS-1, until about
-- 2026-10-26T15:05Z), so the diff is kept in docs/psr-narrative-cap-soft/ and this file points issue 1000409 at it, so the work cannot be lost if the session that built it ends first.
-- It changes one row's description (an appended paragraph) and records the decision. No DELETE or DROP runs here, so it names no BACKUP table.

UPDATE agent_issues
SET description = description || char(10) || 'Handoff (2026-10-26, a built and tested diff exists, it waits on a work claim): docs/psr-narrative-cap-soft/worker.js.patch and docs/psr-narrative-cap-soft/psr-narrative-cap-soft.test.mjs.patch (apply with patch -p0 from the repository root; it applies to main with the dashboard at 1.70.2). It is qnfo-fleet-dashboard 1.70.3: psrNarrativeTier ("normal", or "lean" with a cap breached or the budget unreadable) replaces psrNarrativeAllowed; psrReview always asks for the narrative and passes freeOnly to psrNarrative at the lean tier; the result carries narrative_tier and narrative_count; the new suite fails against the old worker and each of ten mutants. After applying: copy worker.js over deployed-current.worker.js, bump VERSION above the last line on main (another session''s 1.71.0 may merge first), run qnfo-fleet-dashboard/psr-narrative-cap-soft.test.mjs and every qnfo-fleet-dashboard/*.test.mjs, then delete docs/psr-narrative-cap-soft/. Work claim: qnfo-fleet-dashboard/worker.js and its mirror are held by session_014xChUSsqufDhZ9HxSQEsPd until about 2026-10-26T15:05Z; take them over when it lapses with this undone, or review that session''s change instead of writing a second one. The closing code-probe above is unchanged.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = (SELECT id FROM agent_issues WHERE title LIKE 'PSR-NARRATIVE-CAP-SOFT-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1)
  AND description NOT LIKE '%docs/psr-narrative-cap-soft%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'a tested change that cannot be applied because another session holds the file is better kept in the repository with a doer and a closing probe than held only in a session scratch directory that ends with the session',
  'PSR-NARRATIVE-CAP-SOFT-1 handoff: docs/psr-narrative-cap-soft/ keeps the qnfo-fleet-dashboard 1.70.3 diff and its suite; this file appends the pointer and the claim to take over to agent_issues 1000409',
  'read 2026-10-26T14:05Z: GET /work-locks lists qnfo-fleet-dashboard/worker.js and its mirror under session_014xChUSsqufDhZ9HxSQEsPd until about 15:05Z; the diff applies to main (patch -p0 dry run) and reproduces the tested worker.js byte for byte; 38 suite assertions pass and ten mutants fail',
  'applied through the canonical path on merge: the migration runner applies this file; no worker is deployed by this change',
  'one description paragraph on one agent_issues row and one decision row in qnfo-audit; patch files under docs/. No worker.js change, no secret, no binding',
  'run the Rollback line of this file and delete docs/psr-narrative-cap-soft/',
  'the weekly review narrative is applied by whichever session or loop takes the dashboard claim first, from a tested diff',
  'issue 1000409 closes when its code-probe passes on main (the `if (narrativeAllowed) {` text absent from qnfo-fleet-dashboard/worker.js)',
  'the weekly portfolio review reports its narrative again at a breached spend cap; no change for any outside audience',
  'GET /work-locks, patch -p0 --dry-run against main, node qnfo-fleet-dashboard/psr-narrative-cap-soft.test.mjs, d1:qnfo-audit agent_issues (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PSR-NARRATIVE-CAP-SOFT-1 handoff:') = 1);
