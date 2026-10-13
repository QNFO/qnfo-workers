-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE internal_errata SET status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 'render-scale-invariant-physics-math-1' AND status = 'open'
-- RENDER-DEFECT-SOURCES-1 (2026-10-13, pillar reach, metric paper_render_defect_pages 2 against a target of 0, relapse issue 2158).
-- The 06:00 UTC render sweep flagged two papers, one defect each. Both were replayed offline with renderDefectCount from
-- qnfo-gateway/worker.js on main (3.18.3) against their living-paper body_md at 07:55 UTC:
--   ultrametric-intelligence: 0 defects under the current renderer (3.18.1 fixed its render defect after the 06:00 sweep), so it
--     clears at the next sweep (2026-10-14 06:00 UTC).
--   scale-invariant-physics (747 KB body): no raw bold, heading, table rule or odd dollar; 151 pseudo-math tokens outside math
--     delimiters, e.g. "= -int {|k|=Lambda} delta^2S_Lambda/delta phi_k delta phi {-k}", "h_ij(dx^i + dt)(dx^j dt)",
--     "G^0_0 = 0 and G^0_i = 0", "r^(-(d-2))". The formulas are written as plain text in the source, some with a lost
--     subscript marker ("phi {-k}"), so no renderer change can fix them without guessing; the source has to be corrected.
-- The fleet's own path for a defect in its published output is an internal erratum (errata-hub ERRATA-INTERNAL-SWEEP-1 queues it
-- as internal-open, errata-respond drafts the correction, errata-publish ships it as a new version of the same record). The
-- erratum below goes that way; issue 2158 records the diagnosis so the relapse is not worked a second time.
INSERT INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, falsification, evidence, remediation, status, owner, updated_at)
SELECT 'render-scale-invariant-physics-math-1', 'paper', 'scale-invariant-physics', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'qnfo-gateway RENDER-HEALTH-1 (render sweep)', 'medium',
  'The published text of scale-invariant-physics writes about 151 mathematical expressions as plain text outside math delimiters, so readers see raw notation instead of typeset formulas, and some expressions lost a subscript marker (for example "delta phi {-k}" where "delta phi_{-k}" is meant). Examples: the Wilsonian flow "= -int {|k|=Lambda} delta^2S_Lambda/delta phi_k delta phi {-k}", the ADM metric "ds^2 = + h_ij(dx^i + dt)(dx^j dt)" with the lapse and shift terms missing, and "G^0_0 = 0 and G^0_i = 0".',
  'The finding is false if the page at https://papers.qnfo.org/papers/scale-invariant-physics shows these expressions typeset, i.e. the RENDER-HEALTH-1 sweep scores the page with fewer than 3 pseudo-math tokens outside math (papers.render_defects = 0).',
  '{"source":"qnfo-gateway renderDefectCount replayed on main 3.18.3 at 2026-10-13T07:55Z","pseudo_math_tokens":151,"other_tests":"bold 0, heading 0, table rule 0, odd dollar 0","metric":"paper_render_defect_pages 2 (06:02Z sweep)"}',
  'Publish a corrected version in which every formula is wrapped in $...$ (inline) or $$...$$ (display), the lost subscript markers are restored, and the ADM line states the lapse N and shift N^i terms the derivation uses; claims and numbers stay unchanged.',
  'open', 'errata-hub', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM internal_errata WHERE id = 'render-scale-invariant-physics-math-1');
UPDATE agent_issues SET
  description = description || char(10) || char(10) || 'RENDER-DEFECT-SOURCES-1 (2026-10-13, session_01Kddqwk5gQT5qSSHVKjT2EA): the two pages behind paper_render_defect_pages 2 were replayed with the current renderer. ultrametric-intelligence reads 0 now and clears at the 2026-10-14 06:00 sweep. scale-invariant-physics holds 151 plain-text formulas in its source (no renderer fix applies); it is filed as internal erratum render-scale-invariant-physics-math-1 for the errata pipeline (owner errata-hub). The metric returns to 0 when the corrected version is published and swept.',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 2158 AND status = 'open' AND instr(description, 'RENDER-DEFECT-SOURCES-1') = 0;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a defect in a paper''s own text is corrected through the errata pipeline, not by teaching the renderer to guess formulas',
  'RENDER-DEFECT-SOURCES-1: internal erratum render-scale-invariant-physics-math-1 (owner errata-hub) for 151 plain-text formulas; issue 2158 records that ultrametric-intelligence clears at the next sweep',
  'renderDefectCount replay on main 3.18.3 at 07:55 UTC: ultrametric-intelligence 0, scale-invariant-physics resid 151 with bold, heading, rule and odd-dollar tests at 0',
  'merged through the canonical path', 'one internal_errata row and one issue note', 'the Rollback line of this file',
  'source defects in papers reach a doer', 'paper_render_defect_pages reads 1 after the 2026-10-14 06:00 sweep; errata_queue holds an internal-open row for the erratum within an hour of the merge', 'readers of scale-invariant-physics see typeset formulas once the corrected version ships',
  'd1:living-paper papers.body_md, internal_errata, errata_queue; code:qnfo-gateway renderDefectCount, errata-hub sweepInternalErrata');
