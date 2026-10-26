-- REM-A7-QUEUE-3 (2026-10-26, rem-a7 fork F3): one more correction to what migrations/2026-10-26-rem-a7-queue.sql wrote, and the finding behind it.
-- Found by re-reading the claim ledger after the first two files applied (migration_runs 666 and 681): cloud_ops_events kind claim holds ONE claim of an errata remediation row,
-- "claimed errata:7 ... at stage ground" on 2026-10-18T13:51:04Z, outside the trailing 8 days the first measurement used. The row ended with error "reconcile: invalid paper contract" (stageReconcile writes it when
-- paperCompleteness(draft-0) fails the paper contract) and was re-armed (recover_count 1, attempt 0, claimed_at reset to NULL), which is why claimed_at is NULL on all 233 rows and the first text said "0 claims".
--   * The successor RESEARCH-ERRATA-CLAIM-1 said no row "has ever been claimed" and that the claim ledger "holds 0 claims of an errata: row". It now says one row was claimed once and failed at reconcile, and none since.
--   * Closed card 100129 said "(0 ever claimed)". It now says claimed_at is NULL on all rows, with the one claim event.
--   * The successor probe printed "N ever claimed" from claimed_at, which a re-arm resets: the wording becomes "N with claimed_at set". The pass condition (7 or more errata corrections published in 7 days) is unchanged.
--   * Finding appended to the successor for its doer: the only errata row that entered the from-ground pipeline did not get past the draft contract, so claim fairness alone may not publish corrections; lever (3), apply the
--     erratum at stage revise, or a writer instruction that asks for the corrected paper, has to land with it. One row is a sample of one: the doer should run a single row first.
-- Text only: the title and description of the open successor, the close evidence of 100129, the failure wording of one probe. A replay changes nothing.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET close_evidence = (SELECT b.close_evidence FROM bak_20261026_rem_a7_queue_note_triage b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261026_rem_a7_queue_note_triage); UPDATE agent_issues SET title = (SELECT b.title FROM bak_20261026_rem_a7_queue_note_issue b WHERE b.id = agent_issues.id), description = (SELECT b.description FROM bak_20261026_rem_a7_queue_note_issue b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a7_queue_note_issue); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a7_queue_note_contract b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a7_queue_note_contract)

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_note_triage AS
  SELECT issue_id, close_evidence FROM issue_triage WHERE issue_id = 100129;
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_note_issue AS
  SELECT id, title, description FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open';
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_note_contract AS
  SELECT class, verify_probe FROM remediation_contracts WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open');

UPDATE agent_issues
   SET title = replace(title, 'none of the 233 errata remediation rows has ever been claimed (0 in 8 days, 0 corrections published)', 'of the 233 errata remediation rows one was ever claimed (errata:7 on 10-18, which failed at reconcile) and none was published')
 WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open' AND instr(title, 'none of the 233 errata remediation rows has ever been claimed') > 0;

UPDATE agent_issues
   SET description = replace(description, 'claimed_at is set on 0 and published_at on 0, and cloud_ops_events kind claim holds 0 claims of an errata: row.', 'published_at is set on 0 and claimed_at is NULL on all of them (a re-arm resets it); cloud_ops_events kind claim holds one claim of an errata: row, errata:7 on 2026-10-18T13:51:04Z, which ended in reconcile: invalid paper contract and was re-armed, and none since.')
 WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open' AND instr(description, 'cloud_ops_events kind claim holds 0 claims of an errata: row.') > 0;

UPDATE agent_issues
   SET description = description || char(10) || 'FINDING 2026-10-26 19:05Z (REM-A7-QUEUE-3): the one errata row that entered the from-ground pipeline, errata:7 (rem-b7300e5c-b262-445e-868a-1a52ca6c2e23, scale-invariant-physics), was claimed at stage ground on 2026-10-18T13:51:04Z and stopped at reconcile with invalid paper contract: stageReconcile writes that error when paperCompleteness(draft-0) fails the paper contract, so the writers did not return a complete paper for a correction idea. Claim fairness alone may therefore not publish corrections: lever (3), apply the erratum at stage revise, or a writer instruction that asks for the corrected paper, has to land with it. It is a sample of one row: run a single row first and read its draft-0 before widening the share.'
 WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open' AND instr(description, 'FINDING 2026-10-26 19:05Z (REM-A7-QUEUE-3)') = 0;

UPDATE issue_triage
   SET close_evidence = replace(close_evidence, '174 errata remediation rows (0 ever claimed)', '174 errata remediation rows (claimed_at is NULL on all of them; one claim event in the ledger, errata:7 on 2026-10-18T13:51Z, which stopped at reconcile: invalid paper contract)')
 WHERE issue_id = 100129 AND instr(close_evidence, '174 errata remediation rows (0 ever claimed)') > 0;

UPDATE remediation_contracts
   SET verify_probe = replace(verify_probe, ' ever claimed, ', ' with claimed_at set, ')
 WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open')
   AND instr(verify_probe, ' ever claimed, ') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f3',
  'a claim ledger and a claimed_at column answer different questions: a re-arm resets the column, the ledger keeps the event; a finding that says never claimed has to read both',
  'REM-A7-QUEUE-3: title and description of RESEARCH-ERRATA-CLAIM-1, close evidence of 100129 and the wording of the successor probe corrected (one claim of errata:7 on 2026-10-18 that failed at reconcile); finding appended for the doer',
  'qnfo-audit 2026-10-26 18:55Z: cloud_ops_events kind claim, text containing errata:, since 2026-10-18 = 1 (2026-10-18T13:51:04.592Z); research_queue errata:7 error reconcile: invalid paper contract, recover_count 1, claimed_at NULL; qnfo-research-exec/worker.js stageReconcile paperCompleteness and markError',
  'applied by migration',
  'text of one open issue, one closed issue evidence and one probe failure string; the probe pass condition is unchanged',
  'the Rollback line restores the three texts from the bak_20261026_rem_a7_queue_note_* tables',
  'the doer of RESEARCH-ERRATA-CLAIM-1 knows the one errata row that ran failed at reconcile and tests one row before widening',
  'the first errata row claimed under the new claim share is read at reconcile before the share is widened; the probe still reads 7 or more corrections published in 7 days',
  'none',
  'd1:qnfo-audit cloud_ops_events, research_queue (SELECT only); qnfo-research-exec/worker.js stageReconcile read on main; offline node:sqlite suite migrations/rem-a7-queue-note.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A7-QUEUE-3:%');
