-- PUBLICATION-GATE-AUDIT-1 (2026-10-26, charter pillar reach). Owner directive 2026-10-26, verbatim: "AUDIT AND REMEDIATE PUBLICATION QUALITY CHECKS AND GATES. IDENTIFY AND
-- REMEDIATE ROOT CAUSES OF REPEATED ERRORS/ISSUES/FAILURES SYSTEMWIDE ACROSS THE FLEET AND DEPLOY ALL CHANGES". Records the failure modes, decisions and capability of the q08
-- publication audit (q08-signal-engine 0.36.0); the code is in that worker and its suites.
-- Evidence (q08-signal D1, engine_runs, 14 days to 2026-10-26): 20 ok of 537 finished runs (3.7%), 517 gate failures, about 48 attempts and 0.5 published pieces a day, the daily neuron
-- pace reached on 8 to 17 runs a day since 2026-10-21. By the writer of the final draft: nemotron 14 ok of 137 (10.2%), gpt-oss 5 of 287 (1.7%), kimi 1 of 113 (0.9%). 176 of the 7-day
-- failures were "accuracy: figure not in the source": 38 listed ledger numbers as figures and tags as names; seven of 18 fact-check failures read on 2026-10-24..26 were not claims.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'q08_retraction_rate_30d'; DELETE FROM output_quality_measures WHERE metric = 'q08_retraction_rate_30d';
-- Rollback note: the failure_modes, decision_log and capability_ledger rows are append-only evidence and stay; revert the behaviour with the revert path in the decision_log row (ops_config q08_compose_order) or the pull request.

-- The q08 retraction rate (Q08-RETRACTION-METRIC-1, agent_issues 1000280): q08-signal-engine 0.36.0 writes it every 2 h. 65 of the 82 essays published in the 30 days to 2026-10-26 carry a
-- q08_retractions row (0.793). It is an outcome measure of the output-quality ledger (the table and views were applied by migrations/2026-10-26-output-quality-ledger.sql); it has no trigger of
-- its own because output_quality_outcomes_worse carries it, and the 30-day window clears on its own as the retracted weeks age out (METRIC-CLOSED-LOOP-1 exemption named here).
INSERT OR IGNORE INTO output_quality_measures (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat) VALUES
  ('q08_retraction_rate_30d', 'essays', 'outcome', -1, 0.2, 0.05, 'the accuracy audit of published essays: a piece whose claims the source does not support is retracted (q08_retractions)', 'lags the audit by days; under 10 pieces in the window it is unknown; pieces published before the in-line fact-check roll out of the window on their own');
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
  ('q08_retraction_rate_30d', 'surface', 'lagging',
   'of the q08 essays published in the last 30 days, the share that carry a q08_retractions row; unknown (not written) under 10 pieces',
   'q08-signal published_pieces + q08_retractions (q08-signal-engine 0.36.0 writeOwnMetrics, every 2 h)', '0.793 (65 of 82, 2026-10-26)', '<= 0.1', 'q08-signal-engine', 'exempt: carried by output_quality_outcomes_worse (OUTPUT-QUALITY-LEDGER-1)', '2h', '> 0.1', NULL, 'UNMEASURED', 'worker-written');

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'reviewer-output-shape-drift', 'a gate that classifies an LLM reviewer''s free text with regexes fails good drafts on each new reply shape',
  'Q08-FACT-OBJECT-ITEM-1, FACT-SHAPE-1 and -2, FACT-INFERENCE-1 and -2, PARAPHRASE-1 and -2 each patched one shape; seven of 18 fact-check failures on 2026-10-24..26 were an object printed as a string (kimi), an empty claim or the word "reason" (gpt-oss), or a claim the reviewer itself called supported',
  'Q08-REVIEWER-HYGIENE-1 (q08-signal-engine 0.36.0): unwrap, set aside, acquit before classifying; the next step is a closed schema the reviewer must fill, which needs live reviewer trials and is not shipped',
  'q08_gate_pass_rate_7d and the accuracy share of engine_runs (the q08_gate_pass_rate_7d metric trigger)', NULL, '2026-10-26', NULL,
  'a fact-check failure whose listed items are JSON text, empty or marked supported', 'engine_runs.error "accuracy: unsupported claim: {""fact"":..." or "unsupported claim: reason"', 'every q08 essay that reaches the LLM fact-check'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'reviewer-output-shape-drift');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'ledger-tag-form-leak', 'a citation tag a model prints in a bracket form the stripper does not know turns ledger numbers into figures and tags into names',
  'stripLedgerTags removed only [S3] shapes; gpt-oss printed (S39, S40, S41) and lenticular groups; the check read "40," as a figure and "S28 S29" as a name, and the prune located nothing because no sentence holds a bare number',
  'Q08-LEDGER-TAG-FORMS-2: every bracket form, lists, dagger references and [ledger S3] are removed before any check; Q08-PRECHECK-CONTEXT-1 stores 24 characters around each flagged item so the next new form is read, not guessed',
  'engine_runs.error with "name not in the source: S" or a figure ending in a comma; the pre-check stage row context', NULL, '2026-10-26', NULL,
  'a pre-check failure listing "S<number>" names or ascending two-digit figures', '38 accuracy failures in 14 days, all gpt-oss or kimi', 'the writers that print tags'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'ledger-tag-form-leak');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'writer-order-by-proxy', 'a model order chosen on an upstream proxy (the writer-gate pass rate) puts the writer with the lowest end-to-end yield first',
  'Q08-WRITER-YIELD-1 (2026-10-25) read 66.1% (gpt-oss), 60.2% (kimi) and 21.2% (nemotron) writer-gate passes; the same 14 days published 1.7%, 0.9% and 10.2% of those writers'' runs',
  'Q08-WRITER-ORDER-2: nemotron, gpt-oss, kimi; ops_config q08_compose_order overrides without a deploy; the output-quality ledger classifies pass rates as proxies',
  'engine_runs ok share by writer (q08.org/api/runs); q08_gate_pass_rate_7d', NULL, '2026-10-26', NULL,
  'a tuning decision cites a gate pass rate instead of a published share', 'ok runs per day fall while writer-gate passes rise', 'q08 publication yield and neuron spend'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'writer-order-by-proxy');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01Xyj48EUqS7c6yyvNT5Bdi7', 'the share of runs that publish, by the writer of the final draft, predicts a writer''s yield better than its writer-gate pass rate; the comparison is confounded because gpt-oss writes when another writer failed the writer gate',
  'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 puts nemotron first, then gpt-oss, then kimi, with and without a breached spend cap, and adds ops_config q08_compose_order as an override',
  'engine_runs 14 days: nemotron 14 ok of 137, gpt-oss 5 of 287, kimi 1 of 113; since the 2026-10-25 gpt-oss-first order 0 ok of 27; gates and ceilings unchanged',
  'applied', 'q08 essay yield and neuron spend; no gate is touched',
  'INSERT OR REPLACE INTO ops_config (key, value) VALUES (''q08_compose_order'', ''@cf/openai/gpt-oss-120b,@cf/moonshotai/kimi-k2.6,@cf/nvidia/nemotron-3-120b-a12b'') restores the 2026-10-25 order without a deploy, or revert the pull request',
  'the writer order is tunable without a deploy', 'q08_gate_pass_rate_7d >= 0.05 within 192 h', 'engine_runs by writer and era; 31 offline suites; no live A/B'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 puts nemotron') > 0);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01Xyj48EUqS7c6yyvNT5Bdi7', 'a reviewer item with no claim, a JSON-wrapped claim or its own "so supported" is not a claim the draft makes; dropping it cannot lower rigor because names, figures, years, the lede check, the panel, the two-family fact-check and the prune are unchanged and an empty fail still fails closed',
  'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 reads reviewer output before classifying it (Q08-REVIEWER-HYGIENE-1) and strips ledger tags in every bracket form (Q08-LEDGER-TAG-FORMS-2)',
  '7 of 18 recent fact-check failures were not claims; 38 accuracy failures were ledger numbers read as figures; reviewer-hygiene.test.mjs (93 checks) covers acquittals, non-acquittals and fail-closed cases',
  'applied', 'q08 fact-check outcomes; a draft with a real unsupported claim still fails',
  'revert the pull request; the behaviour is in q08-signal-engine/worker.js only', 'reviewer output and citation tags are normalised before any gate reads them', 'q08_gate_pass_rate_7d >= 0.05 within 192 h', 'real engine_runs error strings as fixtures; 31 offline suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 reads reviewer output') > 0);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'q08 reviewer-output hygiene, ledger tags in every bracket form, pre-check context and a writer order that can be changed without a deploy',
  'q08-signal-engine 0.36.0, PUBLICATION-GATE-AUDIT-1',
  'q08-signal-engine deployed through the canonical path; ops_config q08_compose_order optional',
  'q08-signal-engine/reviewer-hygiene.test.mjs (93 checks), budget-route.test.mjs (13) and the other 29 suites pass; live effect not yet measured',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'SELECT metric, last_value FROM metric_registry WHERE metric IN (''q08_gate_pass_rate_7d'', ''q08_retraction_rate_30d'')'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability LIKE 'q08 reviewer-output hygiene%');
