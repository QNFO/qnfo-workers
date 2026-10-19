-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-migration-headerless-silent-skip'; DELETE FROM failure_modes WHERE fm_key = 'migration-headerless-silent-skip'; DELETE FROM control_registry WHERE control IN ('migration-header-guard', 'migration-headerless-allowlist'); DELETE FROM agent_issues WHERE title LIKE 'MIGRATION-HEADERLESS-AUDIT-1:%' AND source = 'session';
-- spof-review: adds no path; the guard has its alternates recorded in control_registry below (a second sweep exists in the remediation consumer)
--
-- MIGRATION-HEADER-GUARD-1 (2026-10-19, pillar autonomy; QNFO/qnfo-workers#2489 is its first victim).
-- WHY: scripts/apply_migrations.py plan() returned "skip" for a file without "-- APPLY-BY: ci", so deploy-gate --check,
-- apply-migrations.yml and the MIGRATION-UNAPPLIED sweep all passed a migration that nothing would ever apply. Measured 2026-10-19:
-- migrations/2026-10-18-subscribers-utm-attribution.sql (two ALTER TABLE ... ADD COLUMN) sat headerless on main while qnfo-subscribers
-- shipped code that reads those columns; subscribers has no utm_source/utm_campaign and migration_runs has no row for the file.
-- 93 files on main carry executable SQL with no header (95 headerless in all; 2 hold no SQL).
-- WHAT: --check now refuses a headerless file with ALTER/CREATE/INSERT/UPDATE/DELETE/DROP/REPLACE unless it declares
-- "-- APPLY-BY: manual (<reason>)" or "-- APPLY-BY: none (<reason>)"; the 93 existing files are grandfathered in
-- migrations/headerless-allowlist.txt (shrink-only, expires 2026-11-19). This file registers the gate and the allowlist in
-- control_registry (DOCTRINE-1), records the failure mode with a detector, and files the audit that empties the list.
-- Audit table: docs/closeouts/2026-10-19-headerless-migrations.md. No worker, cron or trigger is added; every insert is idempotent.

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('migration-header-guard', 'scripts/apply_migrations.py headerless_verdict, run by deploy-gate (MIGRATION-RUNNER-1 step) on every added or changed migrations/*.sql', 'gate',
  'a migration with executable SQL and no APPLY-BY declaration passing every check and never being applied (2026-10-18-subscribers-utm-attribution.sql)',
  0, 'keep', 'applied',
  'the remediation consumer migration sweep (MIGRATION-UNAPPLIED-1, metric migrations_unapplied) covers opted-in files only; detector contract fm-migration-headerless-silent-skip proves the gate is still in the code; apply_migrations_test.py exercises refuse, declared and grandfathered cases offline',
  NULL,
  'scripts/apply_migrations_test.py (MIGRATION-HEADER-GUARD-1 block): a new headerless ALTER/CREATE/INSERT/UPDATE/DELETE/DROP file fails --check; manual or none with a reason, a SELECT-only file and a listed file pass. A refusal costs one header line, never a deploy, and --apply is unchanged.',
  NULL),
 ('migration-headerless-allowlist', 'migrations/headerless-allowlist.txt, read by scripts/apply_migrations.py load_allowlist', 'filter',
  'the 93 pre-existing headerless migrations failing unrelated pull requests when the headerless rule landed',
  0, 'demote', 'planned',
  'none needed: a file on the list is simply not checked; the list is generated from the rule, shrink-only (apply_migrations_test.py fails when a listed file has gained a header), and carries "# EXPIRES: 2026-11-19" after which --check warns on stderr',
  NULL,
  'Reason and expiry recorded 2026-10-19: grandfather clause only. Each file leaves the list once audited and given APPLY-BY: ci or manual (<reason>) (MIGRATION-HEADERLESS-AUDIT-1; table in docs/closeouts/2026-10-19-headerless-migrations.md: 46 of 93 have every object live, 1 is unapplied, 2 are partial, 2 target living-paper).',
  NULL);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('migration-headerless-silent-skip',
  'a migration file without an APPLY-BY declaration is skipped by the runner, the PR gate and the unapplied sweep, so its schema change never reaches D1 while code that depends on it ships',
  'apply_migrations.py plan() returned skip for any file without "-- APPLY-BY: ci", and --check printed it as skipped with exit 0; the unapplied sweep reads only opted-in files',
  'MIGRATION-HEADER-GUARD-1 (scripts/apply_migrations.py headerless_verdict): --check fails a headerless file with executable SQL unless it declares APPLY-BY manual or none with a reason; existing files grandfathered in migrations/headerless-allowlist.txt and audited by MIGRATION-HEADERLESS-AUDIT-1',
  'scripts/apply_migrations.py on main contains MIGRATION-HEADER-GUARD-1 (the gate is in the code)',
  'fm-migration-headerless-silent-skip', '2026-10-19', NULL,
  'a migration is added without an APPLY-BY header and the file holds ALTER, CREATE, INSERT, UPDATE, DELETE or DROP',
  '2026-10-18 qnfo-subscribers 1.3.3 read subscribers.utm_campaign and utm_source on its Sunday cron: "no such column: utm_campaign"; 93 files on main hold executable SQL with no header',
  'every schema or data change shipped as a headerless migration, in qnfo-audit or any other database');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-migration-headerless-silent-skip', NULL, 'MIGRATION-HEADER-GUARD-1', 'failure-mode detector',
  '{"paths": ["scripts/apply_migrations.py"], "contains": "MIGRATION-HEADER-GUARD-1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'MIGRATION-HEADERLESS-AUDIT-1: 93 headerless migrations are grandfathered; decide each (apply, declare manual, or retire) and empty the allowlist',
 'Charter pillar: autonomy (MIGRATION-HEADER-GUARD-1, QNFO/qnfo-workers#2489). migrations/headerless-allowlist.txt grandfathers 93 migration files that carry executable SQL and no APPLY-BY header; docs/closeouts/2026-10-19-headerless-migrations.md lists, per file, the objects it creates and whether they exist in qnfo-audit (measured 2026-10-19: 46 files have every object live, 40 only write rows, 1 is unapplied, 2 are partial, 2 target living-paper).' || char(10) ||
 'Doer: the code loop for a file the table marks safe (only CREATE IF NOT EXISTS or ADD COLUMN): add APPLY-BY: ci, DB and Rollback so the runner records it, or APPLY-BY: manual (<reason>) when it is already live; a file that targets living-paper (2026-10-18-paper-tags.sql, 2026-10-18-paper-audience-categories.sql) cannot use APPLY-BY: ci because DATABASES in scripts/apply_migrations.py holds only qnfo-audit, so it declares manual with the living-paper evidence or the runner gains that database through a recorded change. 2026-10-18-artifacts-canonical-sync.sql is partial in qnfo-audit (three indexes absent). 2026-10-18-subscribers-utm-attribution.sql belongs to the qnfo-subscribers fix. Each file leaves the allowlist in the same pull request that gives it a header.' || char(10) ||
 'Definition of done: migrations/headerless-allowlist.txt lists no file name. The allowlist expires 2026-11-19; a lapsed list warns on every --check.' || char(10) ||
 'code-probe: {"paths": ["migrations/headerless-allowlist.txt"], "absent": ".sql"}',
 'session', 'autonomy', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'MIGRATION-HEADERLESS-AUDIT-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a migration with executable SQL and no APPLY-BY header is a defect, not a hand-applied file: 93 such files exist, so the rule needs a grandfather list',
  'MIGRATION-HEADER-GUARD-1: apply_migrations.py --check refuses a new headerless file with executable SQL; the 93 existing files are listed in migrations/headerless-allowlist.txt (shrink-only, expires 2026-11-19) and audited',
  'migrations/ on main 2026-10-19: 95 files without APPLY-BY, 93 with ALTER/CREATE/INSERT/UPDATE/DELETE/DROP; subscribers lacks utm_source and utm_campaign; migration_runs has no row for 2026-10-18-subscribers-utm-attribution.sql',
  'merged with this migration', 'the deploy-gate migration check for migrations/*.sql; --apply and every opted-in file are unchanged', 'git revert of the pull request; the Rollback header removes the registry rows',
  'a migration that nothing applies can no longer pass review in silence',
  'from the merge on, no pull request adds a headerless migration with executable SQL; the allowlist only shrinks; fm-migration-headerless-silent-skip reads pass',
  'none', 'scripts/apply_migrations_test.py (offline), python3 scripts/apply_migrations.py --check over every .sql file in migrations/'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'MIGRATION-HEADER-GUARD-1:') = 1);
