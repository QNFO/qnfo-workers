-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE paper_learnings SET fleet_status = (SELECT b.fleet_status FROM bak_20261020_paper_learnings b WHERE b.id = paper_learnings.id), status_note = (SELECT b.status_note FROM bak_20261020_paper_learnings b WHERE b.id = paper_learnings.id), updated_at = (SELECT b.updated_at FROM bak_20261020_paper_learnings b WHERE b.id = paper_learnings.id) WHERE id IN (SELECT id FROM bak_20261020_paper_learnings); DROP TABLE IF EXISTS paper_learning_mechanisms; DELETE FROM remediation_contracts WHERE class = 'fm-verify-zero-claims-quantitative'; DELETE FROM failure_modes WHERE fm_key = 'verify-zero-claims-quantitative'; DELETE FROM ops_config WHERE key = 'paper_learn_triage'
-- BACKUP: bak_20261020_paper_learnings
-- PAPER-LEARN-TRIAGE-1 (2026-10-20, charter pillar: autonomy; owner directive 2026-10-20 "The system shall always clear all open issues server-side automatically within 24 hours"; agent_issues 100234, 100249, 100252, 100257, 100261).
-- Read 2026-10-20 06:xxZ: PAPER-LEARN-1 (qnfo-lifecycle 1.12.0) files one issue per paper with a strong direct learning and stops at PL_ISSUE_OPEN_MAX = 5 open ones; the five open
-- issues had no doer (source qnfo-lifecycle is untrusted for the code planner) and their closing probe waits for every direct learning of the paper to be applied or rejected, which nothing did:
-- 169 direct learnings were proposed, 18 of them on these five issues, so every later paper was blocked by the cap. 11 of the 18 were about one thing: the pipeline's own CLAIM-INTEGRITY-1
-- correction notice, which the reader took for a claim of the paper (CLAIM-INTEGRITY-1 is live: ops_config claim_integrity_mode = enforce, 79 claim-integrity events in 24 h; the notice itself
-- is no longer written since PROPORTIONATE-NOTICE-1, qnfo-research-exec 0.28.0, and the four owner papers read at 1.0.1 / 1.1.1 were restored to their owner text on 2026-10-19).
-- qnfo-lifecycle 1.14.0 adds the hourly triage (PAPER-LEARN-TRIAGE-1) and strips pipeline notices before reading. This file adds what the triage reads and settles the 18 learnings now:
--   * paper_learning_mechanisms: the catalogue of live fleet mechanisms, each with the terms that make a learning match it, the citation and an evidence probe (one SELECT on qnfo-audit that reads ok
--     while the mechanism works). A learning is settled already-in-place only when a mechanism matches AND its probe reads ok at that moment; the note carries the citation.
--   * the 18 learnings, one disposition each, read in full by a session on 2026-10-20 against the repository and qnfo-audit:
--       already-in-place  14, 45, 46, 62, 93, 131 (CLAIM-INTEGRITY-1), 94 (the reviewer / verify ensemble), 96 (BUDGET-SOFT-ROUTE-1 and the CF-MODEL-EVAL-1 A/B record),
--                         133 (every issue is born with a closing contract, ORPHAN-GUARD-BIRTH-1), 137 (trust is computed from verified outcomes);
--       applied           15 (qnfo-research-exec 0.29.0 VERIFY-ZERO-CLAIMS-1 logs the zero-claim extraction; the detector below files an issue when it is frequent);
--       rejected          16, 17, 47, 48, 134 (the paper's own convention or an analogy, no fleet defect shown; a gate or a required field for every paper needs its own measurement),
--                         132 (the paper is the owner's text, restored; the claim check covers pipeline papers only), 136 (conflicts with PRIORITY-QUEUE-1, the owner's priority order).
--   * fm-verify-zero-claims-quantitative: failure mode and detector for learning 15 (ANTIFRAGILE-1): five or more such events in 24 h file an issue.
-- The 169 - 18 other proposed direct learnings are left to the hourly triage. Revert one row: UPDATE paper_learnings SET fleet_status = 'proposed', status_note = NULL WHERE id = <id>.
CREATE TABLE IF NOT EXISTS bak_20261020_paper_learnings AS SELECT * FROM paper_learnings WHERE id IN (14, 15, 16, 17, 45, 46, 47, 48, 62, 93, 94, 96, 131, 132, 133, 134, 136, 137);

CREATE TABLE IF NOT EXISTS paper_learning_mechanisms (mech_key TEXT PRIMARY KEY, title TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '', citation TEXT NOT NULL, evidence_probe TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));

INSERT OR REPLACE INTO paper_learning_mechanisms (mech_key, title, terms, citation, evidence_probe) VALUES
  ('claim-integrity', 'CLAIM-INTEGRITY-1: past-tense empirical claims (experiments, measurements, reviews, registrations) are held, rewritten as proposals or retracted',
   'claim-integrity|claim integrity|none took place|past-tense empirical|overstated empirical',
   'CLAIM-INTEGRITY-1 (qnfo-research-exec 0.22.0 claimGate and claimIntegritySweep, migrations/2026-10-19-claim-integrity.sql): the writer, reviewer and revise prompts forbid describing empirical work as done, a deterministic scan plus a two-model extraction holds a paper that carries such a claim, and the sweep rewrites confirmed statements as proposals; ops_config claim_integrity_mode and the claim-integrity events measure it',
   'SELECT CASE WHEN (SELECT value FROM ops_config WHERE key = ''claim_integrity_mode'') IN (''enforce'', ''measure'') AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''claim-integrity'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 days'')) THEN ''ok'' ELSE ''absent'' END AS observed'),
  ('ensemble-review', 'ENSEMBLE-POLICY-1: an independent reviewer and a second model family check every pipeline paper; unresolved findings loop through revise',
   'model-ensemble|ensemble cross-check|ensemble already',
   'ENSEMBLE-POLICY-1 (docs/ENSEMBLE-POLICY.md): the pipeline review stage, the revise loop and the verify recomputation are run by disjoint model families with a deterministic gate; review-unresolved and revise-patch events record each cycle',
   'SELECT CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''revise-patch'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 days'')) AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''review-unresolved'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 days'')) THEN ''ok'' ELSE ''absent'' END AS observed'),
  ('trust-computed', 'Computed trust: v_trust_ledger widens only fleet loop scopes, from verified outcomes, never from a loop''s own confidence',
   'self-reported confidence|externally verifiable outcome',
   'v_trust_ledger (docs/DOCTRINE-KERNEL.md computed trust; CLAUDE.md DOCTRINE-1 readings m-t): trust is computed from verified outcomes and widens only fleet loop scopes through the canonical path',
   'SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_trust_ledger'') THEN ''ok'' ELSE ''absent'' END AS observed'),
  ('budget-steering-eval', 'BUDGET-SOFT-ROUTE-1 steers to cheaper models at a cap; CF-MODEL-EVAL-1 benchmarks a candidate against the control model before it carries traffic',
   'ai-spend steering|spend steering',
   'BUDGET-SOFT-ROUTE-1 (ops_config budget_cap_free_fallback) steers model choice at a breached cap and never stops work; qnfo-model-eval (CF-MODEL-EVAL-1) benchmarks cheaper models against the production control model on a fixed battery and keeps the result in cf_model_eval_runs and model_ab_runs, with automatic revert on a quality drop',
   'SELECT CASE WHEN EXISTS (SELECT 1 FROM ops_config WHERE key = ''budget_cap_free_fallback'' AND value = ''enforced'') AND EXISTS (SELECT 1 FROM cf_model_eval_runs) THEN ''ok'' ELSE ''absent'' END AS observed'),
  ('priority-queue', 'PRIORITY-QUEUE-1: the issue queue drains by priority, then oldest first (owner directive 2026-10-03)',
   '',
   'PRIORITY-QUEUE-1 (owner directive 2026-10-03, CLAUDE.md): qnfo-audit.v_issue_queue orders every open issue critical, high, medium, low, then oldest first; loops order by that and never by another key',
   'SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_issue_queue'') THEN ''ok'' ELSE ''absent'' END AS observed'),
  ('issue-contract-at-birth', 'ORPHAN-GUARD-BIRTH-1: every issue is born with a closing remediation contract (a probe that measures the defect)',
   'falsifiability condition|disconfirmation condition up front',
   'ORPHAN-GUARD-BIRTH-1 (migrations/2026-10-06-orphan-birth-contracts.sql) writes the issue-<id> contract when an issue is filed, OWNER-NO-LOOSE-ENDS-1 requires a closing probe on every open item, and close_evidence is required to close; no open issue is without a contract',
   'SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id)) THEN ''ok'' ELSE ''absent'' END AS observed');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
  ('paper_learn_triage', 'on', 'PAPER-LEARN-TRIAGE-1 (qnfo-lifecycle 1.14.0): on settles proposed direct paper learnings hourly against paper_learning_mechanisms (in place, rejected by two model families, or apply); off stops it');

-- Already in place: the mechanism exists and its probe reads ok (checked 2026-10-20 against qnfo-audit).
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): claim-integrity - CLAIM-INTEGRITY-1, qnfo-research-exec 0.22.0 claimGate and claimIntegritySweep; read 2026-10-20: ops_config claim_integrity_mode = enforce, 79 claim-integrity events in 24 h; the pipeline no longer writes the correction notice this learning was read from (PROPORTIONATE-NOTICE-1, 0.28.0)'
WHERE id IN (14, 45, 46, 62, 93, 131) AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): ensemble-review - ENSEMBLE-POLICY-1; read 2026-10-20: revise-patch and review-unresolved events in the last 7 days (4565 and 454), the independent reviewer and the second-family verify run on every pipeline paper; the learning lever itself says the fleet ensemble already does this'
WHERE id = 94 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): budget-steering-eval - BUDGET-SOFT-ROUTE-1 steers to cheaper models at a cap and qnfo-model-eval (CF-MODEL-EVAL-1) benchmarks them against the control model; read 2026-10-20: ops_config budget_cap_free_fallback = enforced, 17 cf_model_eval_runs and 5 model_ab_runs rows'
WHERE id = 96 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): issue-contract-at-birth - ORPHAN-GUARD-BIRTH-1 writes a closing contract for every new issue and OWNER-NO-LOOSE-ENDS-1 requires a probe; read 2026-10-20: 143 open issues, 0 without a remediation contract'
WHERE id = 133 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'already-in-place', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 in place (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): trust-computed - v_trust_ledger computes trust from verified outcomes and widens only fleet loop scopes through the canonical path (DOCTRINE-KERNEL, CLAUDE.md readings m-t); a loop self-reported confidence is not an input'
WHERE id = 137 AND fleet_status = 'proposed';

-- Applied: qnfo-research-exec 0.29.0 VERIFY-ZERO-CLAIMS-1 and the detector below.
UPDATE paper_learnings SET fleet_status = 'applied', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 applied (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20): qnfo-research-exec 0.29.0 VERIFY-ZERO-CLAIMS-1 logs a verify-zero-claims event when extraction finds no claim in a paper with 6 or more numeric equalities (extraction yield); detector fm-verify-zero-claims-quantitative (migrations/2026-10-20-paper-learn-triage.sql) files an issue at 5 or more such events in 24 h'
WHERE id = 15 AND fleet_status = 'proposed';

-- Rejected, each with its reason.
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): the claim is a misuse warning about the paper own invariance framework for human practitioners; the ledger widens fleet loop scopes from verified outcomes (v_trust_ledger), it holds no claim classes, so a per-class rule has nothing to attach to and no fleet failure is shown. Re-propose with a measured cross-scope failure after a widening event.'
WHERE id = 16 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): a readiness tier and smallest-next-test is this paper own self-labeling convention; adopting it would add a required field to the paper contract of every pipeline paper (a gate change that needs its own measurement under DOCTRINE-1), and the pipeline already states its AI involvement and limits in the Provenance section. Re-propose with a metric showing readers misjudge readiness.'
WHERE id = 17 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): inline [speculative] / [my conjecture] tags are this paper authoring convention; paper_learnings.kind already types every claim the fleet reads (derived, cited, empirical, assumption) and CLAIM-INTEGRITY-1 handles the claims that matter for trust, so a mandatory machine-readable tag on every claim of every pipeline paper adds a gate with no measured gap. Re-propose with a downstream correction rate by claim kind.'
WHERE id = 47 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): pairing each prediction with a disconfirmation condition is this paper own practice for its physics predictions; making kill criteria a publication gate for every pipeline paper (many are surveys, syntheses and methods papers with no prediction) would be a new HARD gate with no measured defect behind it. Re-propose with the share of published papers that state a prediction and no way to refute it.'
WHERE id = 48 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): the Consilience Gate (KIF-29) is a rule of the system that produced that paper, not of this fleet; an analogous cross-subsystem vocabulary gate on every loop output is an analogy without a measured failure of loops re-deriving each other output. Re-propose with such a measurement.'
WHERE id = 134 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; paper-convention): the body the learning describes is the owner text of odr-thesis-five-question-synthesis, restored on 2026-10-19 under PROPORTIONATE-NOTICE-1 (owner directive: corrections of owner papers were overly aggressive); the claim check now covers pipeline papers only and re-audits each new version of those, so a propagation check across owner papers is outside the fleet remit.'
WHERE id = 132 AND fleet_status = 'proposed';
UPDATE paper_learnings SET fleet_status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  status_note = 'PL-TRIAGE-1 rejected (session_01MQYeWxrMd4mVYPCphyaYes, 2026-10-20; conflicts with priority-queue): PRIORITY-QUEUE-1 (owner directive 2026-10-03) orders the issue queue by priority, then oldest first, and forbids another drain key; ranking issues by cost of verification would reorder it. v_issue_queue is live (143 open issues).'
WHERE id = 136 AND fleet_status = 'proposed';

-- Learning 15: the failure mode and its detector (ANTIFRAGILE-1).
INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('verify-zero-claims-quantitative', 'The verify stage extracts no claim from a paper full of numeric equalities and passes it as qualitative, so no number was recomputed',
   'the extraction model returns an empty list (recall failure, not a qualitative paper) and the qualitative branch of stageVerify states that nothing was recomputed and carries on; nothing measured how often this happens',
   'qnfo-research-exec 0.29.0 VERIFY-ZERO-CLAIMS-1: a verify pass with no extracted claim in a paper with 6 or more numeric equalities logs verify-zero-claims; this detector files an issue at 5 or more in 24 h',
   'fewer than 5 verify-zero-claims events in 24 h', 'fm-verify-zero-claims-quantitative', '2026-10-20', 100234,
   'an extraction reply of [] for a paper whose body states numbers with equals signs', 'a published quantitative paper whose Provenance section says no number was recomputed (PAPER-LEARN-1 learning 15 on the functorial-invariance paper)',
   'verification coverage of quantitative pipeline papers');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-verify-zero-claims-quantitative', NULL, 'VERIFY-ZERO-CLAIMS-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-zero-claims'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) < 5 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a paper learning is a lead; it is settled when a live fleet mechanism covers it (cited and probed), when two model families agree it is the paper own convention or an analogy, or when it is applied; nothing about it needs a person',
  'PAPER-LEARN-TRIAGE-1: qnfo-lifecycle 1.14.0 triages proposed direct learnings hourly; this file seeds the mechanism catalogue and settles the 18 learnings of the five open PAPER-LEARN-1 issues; qnfo-research-exec 0.29.0 VERIFY-ZERO-CLAIMS-1 applies learning 15',
  'qnfo-audit 2026-10-20 read-only: 169 proposed direct learnings, 18 on five open issues blocking the PL_ISSUE_OPEN_MAX = 5 cap; 11 of the 18 were the CLAIM-INTEGRITY-1 notice; claim_integrity_mode = enforce with 79 events in 24 h; 143 open issues, 0 without a contract',
  'migration merged',
  'paper_learnings.fleet_status and status_note of 18 rows (copied to bak_20261020_paper_learnings); one new table, one failure mode and detector, one ops_config key',
  'the Rollback header of migrations/2026-10-20-paper-learn-triage.sql',
  'proposed paper learnings are settled without a person, so PAPER-LEARN-1 issues close and the cap stops blocking later papers',
  'the five open PAPER-LEARN-1 issues close at the next hourly remediation tick; later papers file their issue',
  'none',
  'd1:qnfo-audit read-only, node:sqlite replay in migrations/paper-learn-triage.test.mjs, qnfo-lifecycle/paper-learn-triage.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PAPER-LEARN-TRIAGE-1:%');
