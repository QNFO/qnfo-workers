-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE paper_learnings SET fleet_status = (SELECT b.fleet_status FROM bak_20261026_paper_learnings_hoh b WHERE b.id = paper_learnings.id), status_note = (SELECT b.status_note FROM bak_20261026_paper_learnings_hoh b WHERE b.id = paper_learnings.id), updated_at = (SELECT b.updated_at FROM bak_20261026_paper_learnings_hoh b WHERE b.id = paper_learnings.id) WHERE id IN (SELECT id FROM bak_20261026_paper_learnings_hoh); DELETE FROM paper_learning_mechanisms WHERE mech_key = 'root-cause-recurrence'; decision_log is append-only and keeps its row.
-- BACKUP: bak_20261026_paper_learnings_hoh
-- PAPER-LEARN-HEAD-OVER-HANDS-1 (2026-10-26, charter pillar: autonomy; agent_issues 1000487, PAPER-LEARN-1 "Head Over Hands" 1.0.1).
-- Read 2026-10-26: the six direct learnings (5457-5462) each carry one model's "apply" note from the hourly PL-TRIAGE-1 pass (a single model saying gap does not settle a row, so they
-- would stay proposed for ever and the issue would never close). A session read each against the repository and qnfo-audit, as the issue text instructs (a learning is a lead, not a fact):
--   already-in-place  5457 and 5461 (ensemble-review), 5458 (forward-outcome-scoring, issue-contract-at-birth), 5459 (root-cause-recurrence, new), 5462 (trust-computed);
--   routed            5460 -> agent_issues 1000459 TRIGGER-FLAP-1 (the repeat-reopen class, with its lever, owner and closing probe).
-- Probes read ok on 2026-10-26: ensemble-review (revise-patch and review-unresolved events in 3 days), forward-outcome-scoring (prediction_logged_share_7d 0.971 refreshed within 3 hours,
-- prediction_miss_rate_7d 0.0, outcome_matched rows), issue-contract-at-birth (no open issue without a contract), trust-computed (view v_trust_ledger), root-cause-recurrence (open ROOT-CAUSE-1
-- issue 1000301). No learning was applied: none named a change that was both sound and absent. The two analogy-only learnings (5463, 5464) stay with the hourly triage.
-- Revert one row: UPDATE paper_learnings SET fleet_status = 'proposed', status_note = NULL WHERE id = <id>.
CREATE TABLE IF NOT EXISTS bak_20261026_paper_learnings_hoh AS SELECT * FROM paper_learnings WHERE id IN (5457, 5458, 5459, 5460, 5461, 5462);

INSERT OR REPLACE INTO paper_learning_mechanisms (mech_key, title, terms, citation, evidence_probe) VALUES
  ('root-cause-recurrence', 'ROOT-CAUSE-1: a family of issues that keeps reopening gets one issue about the producer, and a closure that relapses is reopened and graded', '',
   'MANAGEMENT-PERSONAS-3 (ECOSYSTEM-LOOP-1) files a ROOT-CAUSE-1 issue for a family reopened repeatedly (1000301: 62 reopens across 80 CF-OBS-ISSUE-1 issues in 7 days), REMEDIATION-REOPEN-2 reopens a closure that relapses, fix_hold_rate_30d grades each closure against later metric days, and CORE-PROMPT-1 rule 6 replaces a remedy that did not move its metric in 7 days',
   'SELECT CASE WHEN EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE ''ROOT-CAUSE-1: %'' AND status = ''open'') THEN ''ok'' ELSE ''absent'' END AS observed');

UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session-old-issues-6d-2038, 2026-10-26): ensemble-review - what the learning protects is fixed before a check runs: the reviewer prompts and the deterministic gate (control research-review-hard-gate) are code, not negotiated between models, and every cycle records its verdict either way (review-unresolved and revise-patch events, probe ok 2026-10-26). Two models agreeing criteria with each other would add no independence: ENSEMBLE-POLICY-1 measures a 9-judge, 7-family panel at about 2.2 votes.'
WHERE id = 5457 AND fleet_status = 'proposed' AND applicability = 'direct';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session-old-issues-6d-2038, 2026-10-26): forward-outcome-scoring - the risky prediction is required before the result: decision_log.predicted_outcome is written with the decision and outcome_matched when the result is known, graded by prediction_logged_share_7d (0.971) and prediction_miss_rate_7d (0.0); issue-contract-at-birth gives every issue a closing probe that can fail (no open issue lacks one, probe ok 2026-10-26). A scope widening is computed from verified outcomes (trust-computed), not argued.'
WHERE id = 5458 AND fleet_status = 'proposed' AND applicability = 'direct';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session-old-issues-6d-2038, 2026-10-26): root-cause-recurrence - the fleet counts the patches that do not hold: MANAGEMENT-PERSONAS-3 files a ROOT-CAUSE-1 issue for a family reopened repeatedly (1000301: 62 reopens across 80 CF-OBS-ISSUE-1 issues in 7 days; 10 such issues filed), REMEDIATION-REOPEN-2 reopens a closure that relapses, fix_hold_rate_30d grades each closure, and CORE-PROMPT-1 rule 6 replaces a remedy that did not move its metric (probe ok 2026-10-26).'
WHERE id = 5459 AND fleet_status = 'proposed' AND applicability = 'direct';
UPDATE paper_learnings SET fleet_status = 'routed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 routed (session-old-issues-6d-2038, 2026-10-26): routed to issue 1000459 (TRIGGER-FLAP-1): the repeat-offender class is measured there (167 reopens on 44 METRIC-TRIGGER tickets in 7 days, 135 close-then-reopen pairs) with a lever, the owning loop (qnfo-fleet-control) and a closing probe (pairs 70 or fewer). Family-level recurrence is already escalated by ROOT-CAUSE-1 and the issue age ladder raises a long-open issue one priority level per 24 h. This learning is closed against that issue.'
WHERE id = 5460 AND fleet_status = 'proposed' AND applicability = 'direct';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session-old-issues-6d-2038, 2026-10-26): ensemble-review - a revision is not judged by its author: ENSEMBLE-POLICY-1 runs the review stage, the revise loop and the verify recomputation on disjoint model families with a deterministic gate (review-unresolved and revise-patch events, probe ok 2026-10-26), and CORE-PROMPT-1 rule 7 requires a prompt, code or config change to be verified by a probe the changing agent did not write.'
WHERE id = 5461 AND fleet_status = 'proposed' AND applicability = 'direct';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session-old-issues-6d-2038, 2026-10-26): trust-computed - v_trust_ledger (probe ok 2026-10-26) computes trust from recorded, verified outcomes and widens only fleet loop scopes through the canonical path, never from a loop''s own confidence (DOCTRINE-1 readings m-t); a session leaves the control-plane PR it authored to the stale-PR lane to merge (CONTROL-PLANE-SELF-MERGE-1) and work claims keep two sessions off one file.'
WHERE id = 5462 AND fleet_status = 'proposed' AND applicability = 'direct';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a learning is a lead, not a fact: each of the six direct learnings of Head Over Hands is settled only after it is read against the repository and the fleet data',
  'PAPER-LEARN-HEAD-OVER-HANDS-1: settled paper_learnings 5457 to 5462 (five already-in-place against named mechanisms with probes that read ok, one routed to 1000459) and added the catalogue mechanism root-cause-recurrence; no learning applied because none named a change that was both sound and absent',
  'paper_learnings rows 5457 to 5462 carried one-model apply notes from the PL-TRIAGE-1 hourly pass (2026-10-26T19:05Z); probes: ensemble-review ok, forward-outcome-scoring ok (prediction_logged_share_7d 0.971), issue-contract-at-birth ok, trust-computed ok, ROOT-CAUSE-1 open issue 1000301 (10 filed); TRIGGER-FLAP-1 1000459 carries the reopen class',
  'merged with this migration',
  'paper_learnings.fleet_status and status_note of six rows, one new catalogue row; no worker code',
  'the Rollback header restores the six rows from bak_20261026_paper_learnings_hoh and removes the mechanism',
  'the PAPER-LEARN-1 issue of Head Over Hands closes with a settled learning each instead of waiting for a doer',
  'the closing probe of issue 1000487 (no direct proposed learning of head-over-hands 1.0.1) reads 0 at the next hourly run',
  'none', 'migrations/paper-learn-head-over-hands.test.mjs replays this file on a fixture of the live shapes; the mechanism probes were run against qnfo-audit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPER-LEARN-HEAD-OVER-HANDS-1:') = 1);
