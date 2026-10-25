-- PUB-STRUCTURE-GATE-1 (2026-10-25, charter pillar research). The public finite-group paper has Appendix C before
-- Section 6, duplicate Section 7, and generation-instruction residue. The publisher's completeness and final gates only
-- check heading presence; the aggregate publication score checks length/references/literature/table signals. The
-- qnfo-cloud-ops second-line sweep now has deterministic structural/residue quarantine, while the source-side prepublish
-- fix remains assigned to the current qnfo-research-exec file owner. These two issues keep source prevention and live
-- paper quarantine distinct and evidence-closed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: retain the issue lifecycle, append-only decision, control/SPOF/failure-mode evidence, and probes; revert deployed code through the canonical PR path.';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-STRUCTURE-ORDER-1: enforce ordered unique sections before research publication',
  'Charter pillar: research. Root cause: paperCompleteness() and finalGates() check required heading presence without validating heading order, duplicates, numbering, or appendix placement; a malformed paper therefore passed prepublication checks.' || char(10) ||
  'Doer: qnfo-code-orchestrator after the live qnfo-research-exec/worker.js claim clears. Implement the structural check at the prepublication gate, preserve truncation repair behavior, and route invalid bodies away from publishV2. Cover skipped/duplicate numbering, appendix-before-main-section, semantic section order, and generation-instruction residue with regressions.' || char(10) ||
  'Definition of done: malformed bodies cannot reach publication; the targeted paper-completeness and final-gate suites pass; the canonical deploy is verified.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function paperCompleteness(md) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "PAPER-STRUCTURE-ORDER-1"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PUB-STRUCTURE-ORDER-1: enforce ordered unique sections before research publication'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper',
  'Charter pillar: research. The public paper https://papers.qnfo.org/papers/can-finite-group-topological-quantum-field-theories-generate-continuous-standard has Appendix C before Section 6, duplicate Section 7, and prompt residue. Keep it out of the published corpus until the structure gate quarantines it or a corrected version passes review.' || char(10) ||
  'Doer: qnfo-cloud-ops publication_gate_mode=enforce and PUB-STRUCTURE-GATE-1. Its current daily sweep is a second-line backstop, not a substitute for the source-side prepublication fix.' || char(10) ||
  'Definition of done: living-paper.papers for this slug has status quarantined with a quality:structure, quality:prompt-residue, or quality:internal-artifact reason; verify through the issue contract before closing.',
  'qnfo-cloud-ops', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper'
    AND status = 'open'
);

UPDATE remediation_contracts
SET precondition = 'PUB-STRUCTURE-GATE-1: the affected public paper is the finite-group paper named in agent_issues',
    action = 'qnfo-cloud-ops daily quality-score sweep in enforce mode quarantines the paper on a deterministic structural, prompt-residue, or internal-artifact failure',
    verify_probe = 'SELECT ''quarantined'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM papers WHERE slug = ''can-finite-group-topological-quantum-field-theories-generate-continuous-standard'' AND status = ''quarantined'' AND (release_gate_reason LIKE ''quality:structure%'' OR release_gate_reason LIKE ''quality:prompt-residue%'' OR release_gate_reason LIKE ''quality:internal-artifact%'')) THEN ''quarantined'' ELSE ''pending: malformed paper has not been quarantined by the publication gate'' END AS observed',
    verify_transport = 'd1-query@living-paper',
    max_attempts = 1000,
    expected_cadence_h = 1,
    status = 'active',
    attempts = 0,
    last_verdict = NULL,
    next_due_at = datetime('now'),
    module = 'publication-structure-gate'
WHERE class = 'issue-' || (
  SELECT id FROM agent_issues
  WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper'
    AND status = 'open'
  ORDER BY id DESC LIMIT 1
);

UPDATE control_registry
SET location = 'qnfo-research-exec paperCompleteness()/finalGates(); qnfo-cloud-ops PUB-GATE-LOOP-1',
    disposition = 'replace',
    disposition_state = 'planned',
    alternate_path = 'qnfo-cloud-ops structural sweep quarantines after publication but cannot prevent the public interval; the source-side ordered/unique prepublication validator is assigned to PUB-STRUCTURE-ORDER-1',
    alternate_tested_at = NULL,
    evidence = 'PUB-STRUCTURE-GATE-1: the live paper has an appendix before later numbered sections, duplicate section 7, and prompt residue. qnfo-research-exec completeness/final gates checked heading presence only. New Cloud Ops deterministic structural/residue regressions pass locally; no live quarantine or preventive alternate is claimed.',
    issue_id = (
      SELECT id FROM agent_issues
      WHERE title = 'PUB-STRUCTURE-ORDER-1: enforce ordered unique sections before research publication'
        AND status = 'open'
      ORDER BY id DESC LIMIT 1
    ),
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'research-quality-gate';

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES (
  'research publication structural validation',
  'research_queue -> qnfo-research-exec finalGates() -> publishV2',
  'qnfo-cloud-ops PUB-GATE-LOOP-1 quarantines after publication; it is not a preventive alternate',
  NULL,
  'PUB-STRUCTURE-GATE-1: source validator checks required headings for presence but not order, numbering, duplicates, appendix placement, or prompt residue. The Cloud Ops second line is being added, but the public paper remains unverified until the living-paper probe passes.',
  (SELECT id FROM agent_issues WHERE title = 'PUB-STRUCTURE-ORDER-1: enforce ordered unique sections before research publication' AND status = 'open' ORDER BY id DESC LIMIT 1)
);

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES (
  'publication-structure-sweep-quarantines',
  'The Cloud Ops publication sweep deterministically quarantines malformed section structure, prompt residue, and internal draft artifacts in enforce mode.',
  0.7,
  'qnfo-cloud-ops publication-gate.test.mjs exercises each deterministic demotion; live behavior remains unverified until the paper-specific living-paper probe passes.',
  'belief-publication-structure-sweep-quarantines',
  'PUB-STRUCTURE-GATE-1'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'belief-publication-structure-sweep-quarantines',
  NULL,
  'PUB-STRUCTURE-GATE-1 code and regression suite are present',
  'belief probe',
  '{"paths": ["qnfo-cloud-ops/worker.js"], "contains": "function pubGateSectionStructure(md)"}',
  'code-read',
  1000,
  'qnfo-cloud-ops',
  1,
  'active',
  'belief'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'publication-structure-bypass',
  'Malformed research papers pass publication and appear in the public corpus',
  'The source completeness and final gates test for required heading presence only; the aggregate gate scored length, references, literature, and table/code markers without structural, numbering, appendix-placement, or prompt-residue checks.',
  'PUB-STRUCTURE-GATE-1 adds deterministic Cloud Ops quarantine as a second line and routes a prepublication ordered/unique structural validator to qnfo-research-exec after its live claim clears.',
  'fm-publication-structure-bypass code probe verifies the source-side prepublication validator marker; PUB-STRUCTURE-PAPER-1 verifies the observed live paper quarantine.',
  'fm-publication-structure-bypass',
  '2026-10-25',
  (SELECT id FROM agent_issues WHERE title = 'PUB-STRUCTURE-ORDER-1: enforce ordered unique sections before research publication' AND status = 'open' ORDER BY id DESC LIMIT 1),
  'a generated paper reaches finalGates() with missing, duplicate, out-of-order, or misplaced appendix headings or with generation-instruction residue',
  'appendix precedes later numbered sections, section numbers repeat or skip, or internal generation text is visible on papers.qnfo.org',
  'every pipeline-authored paper before and after publication'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-publication-structure-bypass',
  NULL,
  'PUB-STRUCTURE-ORDER-1 is implemented in the source publisher',
  'failure-mode detector',
  '{"paths": ["qnfo-research-exec/worker.js"], "contains": "PAPER-STRUCTURE-ORDER-1"}',
  'code-read',
  1000,
  'qnfo-code-orchestrator',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES (
  'post-publication structural paper quarantine',
  'qnfo-cloud-ops 1.34.0, PUB-STRUCTURE-GATE-1',
  'publication_gate_mode=enforce; daily quality-score sweep; living-paper release_gate_* fields',
  '28 publication-gate regression cases pass locally; live exercise pending canonical deployment and the paper-specific D1 probe',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL,
  'qnfo-cloud-ops/publication-gate.test.mjs; issue PUB-STRUCTURE-PAPER-1 closes only when the named living-paper row is quarantined with a structural/residue reason'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session e9172d29-c87c-4d97-b65e-2b6016897cc9',
  'The malformed public paper is caused by presence-only source checks and a coarse aggregate score; a deterministic post-publication backstop can quarantine it while the source owner implements prevention.',
  'Add ordered/unique section, appendix-placement, prompt-residue, and internal-artifact checks to the Cloud Ops publication sweep; preserve the source-side fix and paper quarantine as separate evidence-closed issues.',
  'Public paper page showed Appendix C before Section 6, duplicate Section 7, and generation instructions. New local publication-gate regressions pass. The research publisher is held by a live claim; QNFO Memory MCP returned an authentication requirement, so no paper-record data was accessed.',
  'pending canonical deployment and live paper quarantine probe',
  'qnfo-cloud-ops daily publication sweep and qnfo-research-exec prepublication gate; public research corpus',
  'Revert the Cloud Ops worker through the canonical PR path; the issue, audit history, and append-only decision record remain.',
  'post-publication structural paper quarantine',
  'After deployment, the daily sweep quarantines the named malformed paper; after the source issue closes, malformed headings cannot reach publishV2.',
  'Future readers no longer see the known malformed paper after the sweep and new pipeline papers are blocked before publication once the source fix lands.',
  'public papers.qnfo.org page; qnfo-cloud-ops/publication-gate.test.mjs; qnfo-research-exec completeness and final-gate regression suites; no live D1 paper read because QNFO Memory MCP authentication is unavailable'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'Add ordered/unique section, appendix-placement, prompt-residue, and internal-artifact checks to the Cloud Ops publication sweep; preserve the source-side fix and paper quarantine as separate evidence-closed issues.'
);
