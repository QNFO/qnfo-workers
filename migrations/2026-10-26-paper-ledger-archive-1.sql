-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the failure-mode row, its detector contract and the decision record are append-only registers; set remediation_contracts.status = superseded for fm-paper-ledger-bodies-unbounded to stop the detector.';
-- PAPER-LEDGER-ARCHIVE-1 (2026-10-26, charter pillar research). qnfo-cloud-ops 1.38.0 copies the oldest stored paper-ledger bodies to the RELEASES R2 bucket once paper_change_bodies exceeds 300 MB,
-- verifies each object by SHA-256 read-back and deletes the stored body in one atomic batch with its archive proof. This registers the failure mode that step prevents, a detector that reads the
-- table size from living-paper every hour, and the decision. The detector allows 30 MB over the limit (about twenty-eight hours of growth at the measured 1.1 MB an hour) before it fails.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'paper-ledger-bodies-unbounded',
  'The stored prior bodies of the paper ledger grow without bound inside living-paper',
  'paper_change_bodies keeps the full prior body of every revision (about 50 KB each, 865 rows in the first 40 hours, about 1.1 MB an hour). A trigger lets a body leave only after paper_change_body_archive holds an off-database copy of the same size, but nothing wrote those copies, so the table could only grow.',
  'qnfo-cloud-ops 1.38.0: the hourly quality sweep archives the oldest bodies to the RELEASES bucket beyond 300 MB, read-back verified, one atomic batch with the proof; paperLedgerBody() restores a body from either place. paper-ledger-archive.test.mjs (28 checks) covers the archive, the restore, multi-byte text, a failing read-back, a failing put and a missing bucket.',
  'fm-paper-ledger-bodies-unbounded d1-query@living-paper: stored bodies at most 330 MB',
  'fm-paper-ledger-bodies-unbounded',
  '2026-10-26',
  NULL,
  'paper revisions keep arriving and no step moves the old stored bodies out of the database',
  'living-paper grows by 1.1 MB an hour from the ledger alone; the database size limit and slower queries follow',
  'every read and write of the living-paper database, the papers site and the research pipeline'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-paper-ledger-bodies-unbounded',
  NULL,
  'qnfo-cloud-ops 1.38.0 or later is deployed with the RELEASES binding',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE(SUM(length(CAST(body_md AS BLOB))), 0) <= 345718784 THEN ''ok'' ELSE ''paper_change_bodies holds '' || COALESCE(SUM(length(CAST(body_md AS BLOB))), 0) || '' bytes: the archive step is not keeping it under 300 MB'' END AS observed FROM paper_change_bodies',
  'd1-query@living-paper',
  1000,
  'qnfo-ops',
  1,
  'active',
  'failure-mode'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'The ledger is the permanent record of every paper revision, so a stored body may only move, never vanish; moving the oldest ones to the bucket the PDF worker already uses keeps the database small at no change to what an auditor can read.',
  'PAPER-LEDGER-ARCHIVE-1: qnfo-cloud-ops 1.38.0 archives the oldest paper_change_bodies rows to the RELEASES R2 bucket (key paper-ledger/<seq>.md) beyond 300 MB, SHA-256 read-back verified, in one atomic batch with the paper_change_body_archive proof, and paperLedgerBody() reads either place; new RELEASES binding.',
  'Measured 2026-10-26: about 44 MB held in 881 bodies, growing about 1.1 MB an hour, so the limit would be reached in about 10 days. The step is a no-op until then. paper-ledger-archive.test.mjs (28 checks, the real ledger migration in SQLite, a fake bucket) covers archive, restore with fingerprint, multi-byte text, a mismatching read-back, a failing put and a missing bucket; the delete trigger and the append-only proof are exercised directly.',
  'deployed with 1.38.0; no body archived yet because the table is under the limit',
  'one R2 write, one read and one two-statement batch per archived body (at most 40 an hour); the stored bodies and the ledger rows are never touched while the table is under the limit',
  'revert the 1.38.0 merge (qnfo-cloud-ops returns to 1.37.0); archived bodies stay readable in the bucket through their proofs',
  'paper revision bodies stored off-database with a verified fingerprint',
  'paper_change_bodies stored bytes <= 345718784 within 720 h',
  'the living-paper database stays small while every revision of every paper stays recoverable',
  'SQLite with the real ledger migration and triggers (28 cases), a fake R2 bucket'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPER-LEDGER-ARCHIVE-1: qnfo-cloud-ops 1.38.0 archives') = 1);
