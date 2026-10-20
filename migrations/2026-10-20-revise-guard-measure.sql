-- REVISE-GUARD-MEASURE-1 (2026-10-20, charter pillar: research; agent_issues 99913 RESEARCH-REVISE-LOOP-1, 2671, 100287; AI cost issues 99924, 100011, 100222, 100225, 100226).
-- The reference-floor clause of REVISE-SHRINK-GUARD-1 (qnfo-research-exec 0.21.0, RESEARCH-FLOOR-1) refuses a revise patch that takes a paper's cited references under the floor (8). A paper that sits at
-- the floor can never lose a citation, yet a HARD finding about an unsupported claim is resolved by deleting the claim and its cite, and the LENGTH RETRY note ("do not delete citations") is not followed.
-- Read from qnfo-audit 2026-10-20 09:20Z (cloud_ops_events job qnfo-research-exec, last 24 hours): revise-patch 1627, revise-shrink-refused 384, revise-noop 263; about 70 percent of the noops since 00:00Z
-- carry "drops the cited references N -> M under the floor of 8"; the char-floor and cut-limit clauses never fired on 2026-10-19 or 2026-10-20. Of 79 rows refused in 24 h, 34 were published after
-- 33 recoveries (a whole draft discarded and re-grounded each time) and 33 are parked (wontfix) after 63 recoveries. Workers AI neurons (cf-ops-actions ai-neurons, 09:30Z): 4.89 M in 24 h against 14.84 M in 7 days,
-- 73 percent of the day on @cf/openai/gpt-oss-120b (5,965 requests), the revise first model; ai_spend_ledger rose from 0.58 USD on 2026-10-16 to 11.86 USD on 2026-10-19.
-- This file switches the guard to its existing "measure" mode (ops_config research_revise_shrink_guard = measure: a refused patch is logged as revise-shrink-refused and applied), the lever the worker documents
-- for exactly this ("research_revise_shrink_guard = measure logs a refusal and applies the patch"). The paper then goes on to review and verify, finalGates reports gate-refcount if the count is short, and the
-- floor extension (one grounded section per round that cites the bibliography entries not yet cited, FLOOR_EXTEND_MAX_ROUNDS) restores the count. A code change (agent_issues 100329 REVISE-REFS-EXTEND-1) makes the
-- apply-and-extend route direct and leaves the char-floor and cut-limit clauses as refusals; this file stops the waste now, without a deploy, and the lever is removed when that change is live.
-- Adds the failure mode revise-refs-refusal-waste with a d1-query detector (revise-noop events that name the reference clause in the last 60 minutes, expected 0), registers the guard in control_registry
-- (disposition demote: the reference clause) with a tested alternate (the floor extension must not be switched off), and one decision row. decision_log is append-only, so the Rollback leaves it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'research_revise_shrink_guard' AND value = 'measure'; DELETE FROM control_alternate_probes WHERE control = 'research-revise-refs-floor'; DELETE FROM control_registry WHERE control = 'research-revise-refs-floor' AND issue_id = 99913; DELETE FROM remediation_contracts WHERE class = 'fm-revise-refs-refusal-waste' AND module = 'failure-mode'; DELETE FROM failure_modes WHERE fm_key = 'revise-refs-refusal-waste' AND issue_id = 99913;

-- 1. The lever. The key is absent today (the worker reads an absent key as the guard on); an existing different value is overwritten, the note says why and how to revert.
INSERT INTO ops_config (key, value, note)
VALUES ('research_revise_shrink_guard', 'measure',
  'REVISE-GUARD-MEASURE-1 (2026-10-20): the reference-floor clause refused about 180 revise patches a day (79 rows in 24 h, 33 parked); measure logs the refusal and applies the patch, the floor extension restores the reference count. Revert: remove this row (the guard is on when the key is absent) once REVISE-REFS-EXTEND-1 (agent_issues 100329) is live.')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = datetime('now')
WHERE ops_config.value IS NOT 'measure';

-- 2. The failure mode and its detector (a measurement: the refusal text in the revise-noop events of the last 60 minutes).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('revise-refs-refusal-waste',
  'a guard that refuses a revise patch for dropping a citation under the reference floor sends the row to the recover path (a whole draft discarded and re-grounded) instead of repairing the count',
  'REVISE-SHRINK-GUARD-1 (RESEARCH-FLOOR-1, qnfo-research-exec 0.21.0) treats the reference floor as a limit on every patch. A paper at the floor cannot lose a citation, and the HARD findings that ask for an unsupported claim to go are resolved by deleting it with its cite. All three model tries fail, revise-noop fires (263 rows in 24 h, about 70 percent of them this clause), the row is re-grounded up to three times and then parked: 34 published only after 33 recoveries and 33 parked after 63 recoveries in 24 h, with gpt-oss-120b the day''s largest neuron spender',
  'REVISE-GUARD-MEASURE-1: ops_config research_revise_shrink_guard = measure applies the refused patch and logs it; the floor extension restores the reference count. REVISE-REFS-EXTEND-1 (agent_issues 100329) routes a refs-only refusal to the extension in code, after which the lever is removed. The detector below reads the revise-noop events for the clause and must read 0',
  'the d1-query contract fm-revise-refs-refusal-waste counts revise-noop events of the last 60 minutes that name "drops the cited references" (expected 0)',
  'fm-revise-refs-refusal-waste', '2026-10-20', 99913,
  'a revise patch removes a citation from a paper that holds exactly the reference floor and the guard is on',
  'cloud_ops_events kind revise-noop carries "shrink refused: drops the cited references N -> M under the floor of 8" many times an hour; the same row is refused again minutes later after its recovery',
  'research-exec model spend (a re-grounded draft is tens of model calls) and publication tempo; no data loss');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-revise-refs-refusal-waste', NULL, 'REVISE-GUARD-MEASURE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''revise-noop'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'') AND instr(text, ''drops the cited references'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. The control the lever changes (DOCTRINE-1: control_registry before a guard is kept or demoted). The reference clause is demoted to a measurement; the char-floor and cut-limit clauses stay refusals in
-- code only when the lever is off, so the whole guard is listed as one demoted control until REVISE-REFS-EXTEND-1 lands. Not on the critical path.
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('research-revise-refs-floor',
  'qnfo-research-exec stageRevise _applyGuarded / reviseShrinkRefusal (REVISE-SHRINK-GUARD-1); ops_config research_revise_shrink_guard',
  'guard',
  'a revise patch that takes a paper under the publish floor, cuts more than a fifth of it, or drops its cited references under the floor, so a paper regresses past the release gate',
  0, 'demote', 'applied',
  'the release gate itself: finalGates reports gate-length and gate-refcount at verify, and the floor extension (stageComplete floor-extend, ops_config research_floor_extend) adds grounded sections that cite the bibliography entries not yet cited, so a paper that dips under the floor is repaired before publish; release condition: REVISE-REFS-EXTEND-1 (agent_issues 100329) routes a refs-only refusal to the extension in code, then the lever is removed',
  'REVISE-GUARD-MEASURE-1 (2026-10-20): the reference clause refused about 180 patches a day and parked 33 rows in 24 h (63 recoveries burned); the char-floor and cut-limit clauses did not fire on 2026-10-19 or 2026-10-20. Tested alternate: control_alternate_probes row research-revise-refs-floor (the floor extension must not be switched off); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  99913);

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''research_floor_extend''), ''on'') = ''off'' THEN ''the floor extension is switched off, so a revise that dips under the reference floor is not repaired'' ELSE ''ok'' END AS observed',
  '60 minutes: the probe is a state check on one ops_config key and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'research-revise-refs-floor';

-- 4. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a limit that no model can satisfy for a paper at the floor refuses the edits that resolve its HARD findings, and a floor extension already exists to restore the count, so the limit is waste and the repair belongs to the extension',
  'REVISE-GUARD-MEASURE-1: ops_config research_revise_shrink_guard = measure (a refused revise patch is logged and applied), failure mode revise-refs-refusal-waste with its d1-query detector, control research-revise-refs-floor registered as demoted with a tested alternate, until REVISE-REFS-EXTEND-1 (agent_issues 100329) makes the route direct in code',
  'qnfo-audit 2026-10-20 09:20Z: revise-patch 1627, revise-shrink-refused 384, revise-noop 263 in 24 h, about 70 percent the reference clause (8 to 7, 8 to 6, 9 to 7, 8 to 3, 10 to 1); 79 refused rows: 34 published after 33 recoveries, 33 parked after 63 recoveries; no char-floor or cut-limit refusal on 2026-10-19 or 2026-10-20; Workers AI 4.89 M neurons in 24 h of 14.84 M in 7 days, gpt-oss-120b 3.58 M (5,965 requests); published per day 71 and 58 on 2026-10-19 and 2026-10-20',
  'applied through the canonical path on merge: the worker reads the key on its next revise (floorFlag, no deploy), so refused patches are applied from the next stage tick; the detector is probed at the next remediation tick',
  'one ops_config row, one failure mode, one detector contract, one control and alternate probe row; the revise stage of qnfo-research-exec applies a patch it used to refuse (the paper goes on to review and verify, whose gates are unchanged); no worker, secret or schedule change; the gates at verify and publish still hold the reference and length floors',
  'remove the ops_config row (the guard is on when the key is absent), or run the migration Rollback header: it removes the ops_config value, the alternate probe, the control, the detector contract and the failure mode (decision_log is append-only and keeps this row)',
  'a revise patch that resolves a HARD finding by dropping a citation is applied and the floor extension restores the count, instead of a draft being discarded and re-grounded',
  'the share of revise-noop events naming the reference clause falls from about 70 percent to 0 within an hour; revise-noop falls from about 16 to under 6 an hour; rows parked after a revise refusal fall; fm-revise-refs-refusal-waste reads 0; the published count per day does not fall; Workers AI neurons per day fall from 4.9 M',
  'none',
  'the worker source (floorFlag reads ops_config research_revise_shrink_guard and compares the value to measure), the live revise-noop and revise-shrink-refused events, research_queue statuses of the refused rows, cf-ops-actions ai-neurons for 24 h and 7 d, migrations/revise-guard-measure.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REVISE-GUARD-MEASURE-1:') = 1);
