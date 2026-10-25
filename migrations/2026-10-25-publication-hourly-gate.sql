-- PUBLICATION-GATE-HOURLY-1 (2026-10-25, charter pillar research).
-- The daily post-publication backstop could leave malformed papers public beyond the 120-minute issue SLA. Run the
-- existing deterministic gate hourly, retain one score snapshot per paper per UTC day, and preserve the topic metric's
-- daily cadence independently.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_quality_scores_ts_slug; UPDATE remediation_contracts SET action = 'qnfo-cloud-ops daily quality-score sweep in enforce mode quarantines the paper on a deterministic structural, prompt-residue, or internal-artifact failure' WHERE module = 'publication-structure-gate' AND class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper' AND status = 'open' ORDER BY id DESC LIMIT 1); UPDATE control_registry SET alternate_path = 'qnfo-cloud-ops structural sweep quarantines after publication but cannot prevent the public interval; the source-side ordered/unique prepublication validator is assigned to PUB-STRUCTURE-ORDER-1', evidence = 'PUB-STRUCTURE-GATE-1: the live paper has an appendix before later numbered sections, duplicate section 7, and prompt residue. qnfo-research-exec completeness/final gates checked heading presence only. New Cloud Ops deterministic structural/residue regressions pass locally; no live quarantine or preventive alternate is claimed.', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE control = 'research-quality-gate'; UPDATE failure_modes SET remediation = 'PUB-STRUCTURE-GATE-1 adds deterministic Cloud Ops quarantine as a second line and routes a prepublication ordered/unique structural validator to qnfo-research-exec after its live claim clears.' WHERE fm_key = 'publication-structure-bypass'; UPDATE agent_issues SET description = replace(description, 'The hourly sweep is a second-line backstop, not a substitute for the source-side prepublication fix.', 'Its current daily sweep is a second-line backstop, not a substitute for the source-side prepublication fix.') WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper' AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_quality_scores_ts_slug ON quality_scores(ts, slug);

UPDATE agent_issues
SET description = replace(
  description,
  'Its current daily sweep is a second-line backstop, not a substitute for the source-side prepublication fix.',
  'The hourly sweep is a second-line backstop, not a substitute for the source-side prepublication fix.'
)
WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper'
  AND status = 'open';

UPDATE remediation_contracts
SET action = 'qnfo-cloud-ops hourly quality-score sweep in enforce mode quarantines the paper on a deterministic structural, prompt-residue, or internal-artifact failure',
    expected_cadence_h = 1,
    status = 'active',
    attempts = 0,
    last_verdict = NULL,
    next_due_at = datetime('now')
WHERE module = 'publication-structure-gate'
  AND class = 'issue-' || (
    SELECT id FROM agent_issues
    WHERE title = 'PUB-STRUCTURE-PAPER-1: quarantine the malformed finite-group paper'
      AND status = 'open'
    ORDER BY id DESC LIMIT 1
  );

UPDATE control_registry
SET alternate_path = 'qnfo-cloud-ops hourly structural sweep quarantines after publication; the source-side ordered/unique prepublication validator remains assigned to PUB-STRUCTURE-ORDER-1',
    evidence = 'PUBLICATION-GATE-HOURLY-1: the post-publication deterministic gate now runs hourly to meet the 120-minute issue SLA while quality snapshots remain daily and idea-topic-metric remains daily. The source-side prevention issue and live paper-quarantine probe remain open until independently verified.',
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'research-quality-gate';

UPDATE failure_modes
SET remediation = 'PUBLICATION-GATE-HOURLY-1 runs deterministic structural/residue quarantine hourly as the post-publication backstop; PUB-STRUCTURE-ORDER-1 remains the source-side prepublication prevention.'
WHERE fm_key = 'publication-structure-bypass';

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES (
  'hourly-publication-gate-meets-detection-sla',
  'The enforce-mode structural publication backstop runs hourly, while quality-score snapshots remain limited to one per paper per UTC day.',
  0.95,
  'PUBLICATION-GATE-HOURLY-1 schedule and same-day snapshot regression in qnfo-cloud-ops/publication-gate.test.mjs.',
  'belief-hourly-publication-gate-meets-detection-sla',
  'PUBLICATION-GATE-HOURLY-1'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'belief-hourly-publication-gate-meets-detection-sla',
  NULL,
  'PUBLICATION-GATE-HOURLY-1 is merged and the publication gate suite passes',
  'belief probe',
  '{"paths":["qnfo-cloud-ops/worker.js"],"contains":"\"quality-score\": { times: [\"00:20\", \"01:20\""}',
  'code-read',
  1000,
  'qnfo-cloud-ops',
  1,
  'active',
  'belief'
);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT
  'hourly post-publication structural paper quarantine',
  'qnfo-cloud-ops 1.35.0, PUBLICATION-GATE-HOURLY-1',
  'hourly quality-score schedule; publication_gate_mode=enforce; daily quality snapshot deduplication',
  'Publication-gate regression covers hourly cadence, daily topic-metric cadence, and one snapshot per paper per UTC day; live paper quarantine remains probe-verified separately.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL,
  'qnfo-cloud-ops/publication-gate.test.mjs and migrations/2026-10-25-publication-hourly-gate.sql'
WHERE NOT EXISTS (
  SELECT 1 FROM capability_ledger
  WHERE capability = 'hourly post-publication structural paper quarantine'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session e9172d29-c87c-4d97-b65e-2b6016897cc9',
  'A daily post-publication sweep can exceed the 120-minute issue SLA; an hourly deterministic sweep reduces the exposure window without increasing quality snapshot rows.',
  'Run qnfo-cloud-ops quality-score hourly, persist at most one quality_scores snapshot per paper per UTC day, and move idea-topic-metric to its own daily slot.',
  'The existing paper-quarantine remediation contract requires a one-hour cadence; the live schedule was daily. Regression coverage asserts hourly enforcement, daily topic-metric execution, and no duplicate same-day snapshots.',
  'pending canonical deployment and the live paper-quarantine probe',
  'qnfo-cloud-ops publication enforcement and quality snapshot history',
  'Revert the hourly slot and same-day deduplication through the canonical PR path; append-only decision and capability evidence remains.',
  'hourly post-publication structural paper quarantine',
  'Malformed published papers are evaluated for deterministic quarantine at least hourly while score history remains bounded to one row per paper per UTC day.',
  'Shortens public exposure to malformed research and preserves the daily idea-topic metric cadence.',
  'qnfo-cloud-ops/publication-gate.test.mjs; qnfo-cloud-ops/single-trigger.test.mjs; live paper-quarantine D1 probe remains unavailable until QNFO Memory MCP is authenticated.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'Run qnfo-cloud-ops quality-score hourly, persist at most one quality_scores snapshot per paper per UTC day, and move idea-topic-metric to its own daily slot.'
);
