-- BLOCKER-REDTEAM-AUTO-2 (2026-10-11, pillar autonomy). The first run of scripts/blocker_redteam_runner.py (09:32Z) counted an
-- active closing probe as a doer and recorded false-belief-removed for issues whose probe only verifies the fix, including an
-- owner-bound one (#1750, the Lightcone application). The runner now counts only a code-task line or a live work claim and
-- confirms an owner claim only by an IDENTITY-BOUND line. The rows that rule wrote are removed (kept in the backup table) so
-- the next run tests those claims again under the corrected rule.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261011_blocker_redteam_v1
-- Rollback: INSERT INTO blocker_redteam SELECT * FROM bak_20261011_blocker_redteam_v1 WHERE id NOT IN (SELECT id FROM blocker_redteam)

CREATE TABLE IF NOT EXISTS bak_20261011_blocker_redteam_v1 AS SELECT * FROM blocker_redteam WHERE actor = 'blocker-redteam-runner' AND evidence LIKE 'not blocked: active machine probe%';

DELETE FROM blocker_redteam WHERE actor = 'blocker-redteam-runner' AND evidence LIKE 'not blocked: active machine probe%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a closing probe is verification, not a doer', 'BLOCKER-REDTEAM-AUTO-2: corrected the runner doer rule and removed the rows the loose rule wrote', 'blocker_redteam 2026-10-11 09:32-09:40Z: rows citing an active machine probe as the doer, among them owner-bound #1750', 'red-team verdicts only where a doer or an identity-bound reason exists', 'blocker_redteam rows from one run', 'the Rollback line', 'none (correction)', 'unverified_blocker_claims settles between 15 and 30 with every recorded verdict backed by a doer, a token check or an IDENTITY-BOUND line', NULL, 'D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BLOCKER-REDTEAM-AUTO-2%');
