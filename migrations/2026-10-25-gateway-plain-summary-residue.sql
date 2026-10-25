-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied', evidence = 'PLAIN-RESIDUE-GATE-1 reverted through the canonical PR path; read-time cache gate is no longer present.' WHERE control = 'gateway-plain-summary-residue'; UPDATE failure_modes SET probe_class = NULL, remediation = 'PLAIN-RESIDUE-GATE-1 reverted through the canonical PR path; do not rely on the withdrawn gateway residue gate.' WHERE fm_key = 'gateway-plain-summary-residue'; UPDATE remediation_contracts SET status = 'superseded', last_verdict = NULL WHERE class = 'fm-gateway-plain-summary-residue';
-- PLAIN-RESIDUE-GATE-1 (2026-10-25, charter pillar: reach). Public cached plain summaries must not expose model instructions or formatting residue.

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES
  ('gateway-plain-summary-residue',
   'qnfo-gateway plainBuild()/plainGet()/plainFill()',
   'filter',
   'prompt instructions, headings, lists, code fences, or overlong summaries reaching public paper pages',
   0,
   'keep',
   'applied',
   'Per-request plainGet() applies the same deterministic residue gate before any cached text is returned; targeted quick-read tests verify the contaminated cache stays hidden while a valid legacy cache remains available.',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
   'The affected published paper returned HTTP 200 and exposed both "Use everyday words" and "We must restate" in plain.text. PLAIN-RESIDUE-GATE-1 rejects residue before and after grounding, withholds contaminated cached text at read time, prioritizes only flagged rows within the bounded repair query, and versions future summaries without invalidating valid legacy rows. The runtime read-time gate is the tested alternate to scheduled cache repair.',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES
  ('gateway-plain-summary-residue',
   'Generated prompt instructions leak through cached public paper summaries',
   'plainBuild accepted model output without a deterministic residue/format gate, and plainGet returned contaminated cache rows while plainFill only repaired missing or body-stale summaries.',
   'Reject residue before and after grounding; refuse contaminated cache reads; prioritize only flagged caches for the bounded rebuild; preserve valid legacy revisions.',
   'Hourly runner-https probe of the exact affected paper plus targeted quick-read regression coverage.',
   'fm-gateway-plain-summary-residue',
   '2026-10-25',
   'A public plain summary contains a generator instruction marker or prohibited output formatting.',
   'The quick-read JSON or paper HTML contains "Use everyday words" or another plain-summary prompt instruction.',
   'Public plain summaries on papers.qnfo.org and qnfo.org');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES
  ('fm-gateway-plain-summary-residue',
   NULL,
   'qnfo-gateway PLAIN-RESIDUE-GATE-1 is deployed',
   'Verify that the affected public paper page contains no plain-summary prompt instruction.',
   '{"url": "https://papers.qnfo.org/papers/can-finite-group-topological-quantum-field-theories-generate-continuous-standard", "status": 200, "absent": "Use everyday words"}',
   'runner-https',
   1000,
   'qnfo-gateway',
   1,
   'active',
   'failure-mode',
   datetime('now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('prompt-residue-safe-public-plain-summaries',
   'qnfo-gateway PLAIN-RESIDUE-GATE-1',
   'qnfo-gateway deterministic plain summary gate; runner-https residue probe',
   'Model output and cached text are checked deterministically before public rendering; valid legacy cache rows are preserved.',
   '2026-10-25',
   'Local quick-read regressions cover the exact affected slug, cache withholding, bounded targeted revalidation beyond 120 newer rows, valid legacy cache compatibility, and successful replacement with a gated summary.');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_c1411b4d-751f-4d3b-afc7-f675387f0f24:plain-residue-gate-1',
  'A deterministic residue gate at generation and cache-read time can stop the observed public prompt leak without rebuilding the valid summary corpus.',
  'PLAIN-RESIDUE-GATE-1: reject prompt residue before/after grounding, hide contaminated cache rows, prioritize only flagged rows for bounded repair, and version future summaries while retaining valid legacy rows.',
  'Fresh public request returned HTTP 200 with "Use everyday words" and "We must restate" in the affected paper summary. Local regression tests verify the exact slug is withheld and repaired without invalidating valid legacy rows or rebuilding the 120-row cache window.',
  'pending live verification after canonical deployment',
  'Only generated plain-summary content is affected; paper status, body_md, and the independent D1 quarantine process remain unchanged.',
  'Revert the gateway source and mirror through a versioned canonical PR; retain the append-only control, failure-mode, capability, and decision evidence.',
  'Public plain summaries reject prompt instructions and safely revalidate contaminated cached output.',
  'The affected quick-read JSON and paper HTML no longer expose generation instructions; valid legacy cache rows remain served without corpus-wide regeneration.',
  'Readers and crawlers receive only residue-free plain summaries; the affected cached row is repaired within the existing bounded fill budget.',
  'qnfo-gateway/quick-read.test.mjs; https://qnfo.org/api/quickread/can-finite-group-topological-quantum-field-theories-generate-continuous-standard; https://papers.qnfo.org/papers/can-finite-group-topological-quantum-field-theories-generate-continuous-standard'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'PLAIN-RESIDUE-GATE-1:%'
);
