-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-q08-ledger-whitespace-groups'; DELETE FROM failure_modes WHERE fm_key = 'q08-ledger-whitespace-groups';
-- Q08-LEDGER-WHITESPACE-GROUPS-1 (q08-signal-engine 0.34.4, pillar research): a copied [S2 S3] source-ledger citation was read as an unsupported name and refused by the deterministic grounding gate.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('q08-ledger-whitespace-groups',
  'q08 rejects grounded drafts because a whitespace-separated source-ledger citation is mistaken for a real-world name',
  'stripLedgerTags accepted comma, semicolon and range separators but not whitespace between explicit S-number references, leaving citations such as [S2 S3] for groundingProblems to flag',
  'q08-signal-engine 0.34.4 Q08-LEDGER-WHITESPACE-GROUPS-1 recognizes whitespace-separated and mixed source-ledger groups before the unchanged grounding, fact-check and reader-quality gates',
  'remediation_contracts fm-q08-ledger-whitespace-groups (d1-query@q08-signal)',
  'fm-q08-ledger-whitespace-groups', '2026-10-25', NULL,
  'a copied source-ledger citation contains adjacent S-number references separated by whitespace',
  'engine_runs ends gate_failed with a name-not-in-source error whose text contains adjacent S-number citation labels',
  'q08.org publishing yield and model spend on drafts refused for citation formatting rather than unsupported claims');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-q08-ledger-whitespace-groups', NULL,
  'q08-signal-engine 0.34.4 or later is deployed',
  'stripLedgerTags removes whitespace-separated source-ledger groups before grounding; if the detector fires after deployment, inspect the reported source and extend the parser with a regression case without relaxing any factual gate',
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM engine_runs WHERE status = ''gate_failed'' AND ran_at >= datetime(''now'', ''-24 hours'') AND error LIKE ''%name not in the source: S% S%''',
  'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_2bcec293-1261-4597-908c-374edb8804dd:q08-ledger-whitespace',
  'explicit S-number sequences separated by whitespace are still source-ledger citations, so stripping those bracketed references must not discard prose or weaken any factual or reader-quality check',
  'Q08-LEDGER-WHITESPACE-GROUPS-1: q08-signal-engine 0.34.4 strips [S2 S3] and mixed groups such as [S1, S2 S3] before gates; adds regression coverage for multi-label groups, citation-like years and end-to-end lede grounding; registers the failure mode and hourly detector',
  'Live q08.org/api/runs showed run 931 refused with name-not-in-source findings for grouped labels including S2 S3; live q08.org/api/metrics at 2026-10-25T13:52Z reported a 7-day gate pass rate of 0.016, four published pieces and 339110.005 neurons per published piece. Those are baselines, not claims that this fix alone restores either metric.',
  'pending',
  'q08-signal-engine normalization, grounding and publish gates on q08.org; no gate threshold, reviewer, model order or spend cap changes',
  'revert the q08-signal-engine worker change through the canonical path and roll back the detector and failure-mode rows using this migration Rollback line; decision_log remains append-only',
  'none; this is a false-rejection fix and adds no new capability',
  'q08_gate_pass_rate_7d > 0.016 within 168 h',
  'A grounded draft using whitespace-grouped ledger citations can reach the existing factual and reader-quality checks rather than failing on the citation labels.',
  'offline q08-signal-engine/fact-ledger.test.mjs; live baseline q08.org/api/metrics and run 931 (read-only); post-deploy detector fm-q08-ledger-whitespace-groups on q08-signal D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'Q08-LEDGER-WHITESPACE-GROUPS-1:') = 1);
