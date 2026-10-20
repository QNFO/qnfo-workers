-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-migration-sql-parse-error', 'fm-migration-backup-empty-schema-only', 'fm-migration-failure-unrecorded'); DELETE FROM failure_modes WHERE fm_key IN ('migration-sql-parse-error', 'migration-backup-empty-schema-only', 'migration-failure-unrecorded'); DELETE FROM control_alternate_probes WHERE control IN ('migration-parse-lint', 'migration-backup-nonempty'); DELETE FROM control_registry WHERE control IN ('migration-parse-lint', 'migration-backup-nonempty'); decision_log is append-only and keeps its row.
-- spof-review: adds no path and no trigger; each of the two controls has its alternate recorded in control_registry below (for the parse lint, D1 refusing the statement at apply time as before) and a
-- read-only tested-alternate probe in control_alternate_probes (CONTROL-ALT-PROBES-1) inserted by this file, so neither reads no-probe in v_control_alternate_status; the chaos drill runs the probes and stamps alternate_tested_at on a pass.
--
-- APPLY-MIGRATIONS-LINT-1 + BACKUP-SCHEMA-ONLY-1 (2026-10-20, pillar autonomy; workflow failure audit WORKFLOW-FAILURE-AUDIT-1, agent_issues 100295).
-- WHY: eight apply-migrations runs failed on main on 2026-10-18 and 2026-10-19 (all at the step "Apply opted-in migrations to Cloudflare D1", script exit 1,
-- explicit D1 error). Three causes were gaps in scripts/apply_migrations.py itself:
--   1. migrations/2026-10-18-portfolio-lifecycle.sql statement 2 listed unquoted text in a VALUES clause. D1 answered unrecognized token ":" at
--      offset 167 (migration_runs 288, run 39126889193) and the repair merged seven minutes later. plan() and --check never parsed the SQL: they
--      returned no problem for those bytes.
--   2. migrations/2026-10-19-repo-slug-any-depth.sql made its backup with CREATE TABLE IF NOT EXISTS ... AS SELECT ... WHERE lower(repo) LIKE 'qnfo/%';
--      no row matched any more, so the table was empty, and the DROP TRIGGER at statement 3 was refused with "BACKUP table ... is empty" (migration_runs
--      352, 355, 361). A dropped trigger deletes no row, yet the rule treated it like DELETE FROM.
--   3. record_failure filed MIGRATION-APPLY-FAILED-1 with INSERT ... SELECT ... WHERE NOT EXISTS, which D1 refuses on agent_issues while its trigger
--      chain is at the 10-level limit; the failure was printed only, so migration_runs 291, 293 and 296 left a red run and no issue.
-- WHAT: the runner prepares every statement with EXPLAIN in an in-memory SQLite and refuses a file when the parser rejects one (name-resolution errors are
-- ignored, so no schema is needed); the empty-backup refusal now applies only to a file that deletes rows (DELETE FROM, DROP TABLE); a refused issue
-- insert falls back to a duplicate lookup plus INSERT ... VALUES, and a failure that reaches neither the ledger nor the queue prints a ::error annotation.
-- MEASURED 2026-10-20 on origin/main: the lint refuses 0 of the 437 opted-in migrations (2735 statements), 1 of the 671 historical contents of
-- migrations/*.sql (the e7d8b482 version of portfolio-lifecycle, migration_runs 288) and 0 of the 447 distinct sha256 values migration_runs holds as ok
-- (2841 statements). This file registers the two changed controls (DOCTRINE-1) with a tested-alternate probe each, the three failure modes with detectors, and the decision. Every insert is
-- idempotent; no worker, cron or trigger is added.

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('migration-parse-lint', 'scripts/apply_migrations.py parse_problems (called by plan), run by deploy-gate (MIGRATION-RUNNER-1 step) on every added or changed migrations/*.sql and by apply-migrations.yml before a file runs', 'gate',
  'a migration statement SQLite cannot parse (unquoted text in VALUES, a missing comma, a misspelt keyword) passing the PR gate and failing on main after earlier statements already applied (migrations/2026-10-18-portfolio-lifecycle.sql, migration_runs 288)',
  0, 'keep', 'applied',
  'D1 itself refuses the statement at apply time, records the error row and files MIGRATION-APPLY-FAILED-1 (the path that existed before; the lint moves the same refusal to the pull request). Release valves: a "-- PARSE-LINT: off (<reason>)" header line in the file, and a skip when the runner SQLite is older than 3.39.0. Only parse-class messages count, so a table, column or function the empty in-memory database does not know never refuses a file.',
  NULL,
  'Measured 2026-10-20 on origin/main: plan() over the 437 opted-in migrations (2735 statements) and over all 671 historical contents of migrations/*.sql refuses exactly one, the e7d8b482 version of portfolio-lifecycle (migration_runs 288, unrecognized token ":"); all 447 distinct sha256 values migration_runs holds as ok (2841 statements) pass. scripts/apply_migrations_test.py (APPLY-MIGRATIONS-LINT-1 block) covers refuse, ignore and both valves. Revert: remove the parse_problems call from plan(). Tested alternate: control_alternate_probes row migration-parse-lint (state check on the contract fm-migration-sql-parse-error: present, active, code-read, still reading the APPLY-MIGRATIONS-LINT-1 marker); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  NULL),
 ('migration-backup-nonempty', 'scripts/apply_migrations.py apply_file backup_missing, run by apply-migrations.yml and the remediation consumer migration sweep', 'guard',
  'a file that deletes rows or drops a table running with no backup row to restore from',
  0, 'demote', 'applied',
  'the BACKUP header requirement (--check) and the Rollback line still apply to every DELETE and DROP, and a backup table that does not exist still stops every file; an empty backup now stops only a file that destroys rows (DELETE FROM, DROP TABLE)',
  NULL,
  'BACKUP-SCHEMA-ONLY-1 2026-10-20: migration_runs 352, 355 and 361 refused migrations/2026-10-19-repo-slug-any-depth.sql, whose only destructive statements were DROP TRIGGER IF EXISTS, because its row backup was empty (no code_tasks row matched any more). A dropped trigger, index or view loses no row. The audit counted 10 error rows of the missing-or-empty-backup class between 2026-10-08 and 2026-10-19; BACKUP-CREATES-1/2 and BACKUP-SELF-EMPTY-1 each fixed one shape. Revert: remove the row_destructive condition in backup_missing. Tested alternate: control_alternate_probes row migration-backup-nonempty (state check on the contract fm-migration-backup-empty-schema-only: present, active, code-read, still reading the BACKUP-SCHEMA-ONLY-1 marker); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  NULL);

-- The tested alternate of each control (CONTROL-ALT-PROBES-1): a read-only expected/observed state check, run by the chaos drill, so neither control reads no-probe
-- (fm-control-alternate-undrilled counts a control with an alternate, no stamp and no probe). Guarded on the control row and on the key, so a replay adds none. The
-- observed text names what is wrong when the check fails and holds none of the words a write-keyword scan looks for. alternate_tested_at stays NULL: only a passing drill stamps it.
INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-migration-sql-parse-error'' AND status = ''active'' AND verify_transport = ''code-read'' AND instr(verify_probe, ''APPLY-MIGRATIONS-LINT-1'') > 0) THEN ''the detector fm-migration-sql-parse-error is missing, not active, not code-read or no longer reads the APPLY-MIGRATIONS-LINT-1 marker'' ELSE ''ok'' END AS observed',
  '60 minutes: the detector contract is read every 60 minutes (cadence 1), so a parse lint that left main is found within one cycle; the probe is a state check on the contract row and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'migration-parse-lint';

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-migration-backup-empty-schema-only'' AND status = ''active'' AND verify_transport = ''code-read'' AND instr(verify_probe, ''BACKUP-SCHEMA-ONLY-1'') > 0) THEN ''the detector fm-migration-backup-empty-schema-only is missing, not active, not code-read or no longer reads the BACKUP-SCHEMA-ONLY-1 marker'' ELSE ''ok'' END AS observed',
  '60 minutes: the detector contract is read every 60 minutes (cadence 1), so a narrowed backup rule that left main is found within one cycle; the probe is a state check on the contract row and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'migration-backup-nonempty';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('migration-sql-parse-error',
  'a migration with a statement SQLite cannot parse passes the PR gate and fails when it applies on main',
  'scripts/apply_migrations.py plan() and --check ran header and regex lints and never parsed the SQL; migrations/2026-10-18-portfolio-lifecycle.sql statement 2 held unquoted text in a VALUES list and D1 answered unrecognized token ":" at offset 167 (migration_runs 288, apply-migrations run 39126889193) while plan() returned no problem for those bytes',
  'APPLY-MIGRATIONS-LINT-1 (scripts/apply_migrations.py parse_problems): every statement is prepared with EXPLAIN in an in-memory SQLite and a syntax error, unrecognized token, incomplete input or unterminated literal refuses the file in --check and before apply; name-resolution errors are ignored; a "-- PARSE-LINT: off (<reason>)" header line is the release valve',
  'scripts/apply_migrations.py on main contains APPLY-MIGRATIONS-LINT-1 (the parse lint is in the code)',
  'fm-migration-sql-parse-error', '2026-10-18', NULL,
  'a migration statement has a syntax error that SQLite reports before it resolves any name (unquoted text in VALUES, a missing comma, a misspelt keyword)',
  'apply-migrations run red on main at the step Apply opted-in migrations; a migration_runs error row with unrecognized token or syntax error at statement N, with the N-1 statements before it already applied',
  'one migration file per occurrence: the statements before the bad one are applied and the rest are not until a corrected file merges'),
 ('migration-backup-empty-schema-only',
  'a migration that only drops a trigger, index or view is stopped because its BACKUP table holds no row',
  'apply_file backup_missing() refused an empty backup for every DELETE and DROP, including DROP TRIGGER, which deletes no row; migrations/2026-10-19-repo-slug-any-depth.sql made its backup with CREATE TABLE IF NOT EXISTS ... AS SELECT over rows that no longer existed, so the table stayed empty and a re-run could never pass',
  'BACKUP-SCHEMA-ONLY-1 (scripts/apply_migrations.py): the empty-backup refusal applies only when the file has a DELETE FROM or DROP TABLE; a backup table that does not exist still stops every file',
  'scripts/apply_migrations.py on main contains BACKUP-SCHEMA-ONLY-1 (the narrowed rule is in the code)',
  'fm-migration-backup-empty-schema-only', '2026-10-19', NULL,
  'a file whose destructive statements are all DROP TRIGGER, DROP INDEX or DROP VIEW and whose BACKUP table is empty, typically a CREATE TABLE ... AS SELECT ... WHERE over rows that no longer exist',
  'migration_runs error "BACKUP table <name> is empty (checked before statement N)" and a red apply-migrations run (352, 355 and 361 on 2026-10-19)',
  'one migration file per occurrence, plus its replays: a deleted-and-re-added file runs again'),
 ('migration-failure-unrecorded',
  'a failed migration apply leaves a red workflow run and no MIGRATION-APPLY-FAILED-1 issue',
  'record_failure filed the issue with one INSERT ... SELECT ... WHERE NOT EXISTS, the form D1 refuses on agent_issues while its trigger chain is at the 10-level limit (triggers nested too deep); the error was printed as ledger_error and dropped, and the ledger row and the issue shared one try block',
  'APPLY-MIGRATIONS-LINT-1 (scripts/apply_migrations.py file_failure_issue): on a refusal look up the open duplicate with a SELECT and file with a single-row INSERT ... VALUES (the unique index on open titles guards a duplicate); the ledger row and the issue are written independently; when either could not be written a GitHub ::error annotation names the file',
  'scripts/apply_migrations.py on main defines file_failure_issue (the fallback is in the code)',
  'fm-migration-failure-unrecorded', '2026-10-18', NULL,
  'an apply failure while INSERT ... SELECT on agent_issues is refused (triggers nested too deep) or the migration_runs insert fails',
  'migration_runs 291, 293 and 296 (2026-10-18) hold an error row and no MIGRATION-APPLY-FAILED-1 issue exists for them; the run log holds a ledger_error line',
  'the visibility of one failed migration per occurrence (no silent drop, doctrine section 6)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-migration-sql-parse-error', NULL, 'APPLY-MIGRATIONS-LINT-1', 'failure-mode detector',
  '{"paths": ["scripts/apply_migrations.py"], "contains": "APPLY-MIGRATIONS-LINT-1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-migration-backup-empty-schema-only', NULL, 'BACKUP-SCHEMA-ONLY-1', 'failure-mode detector',
  '{"paths": ["scripts/apply_migrations.py"], "contains": "BACKUP-SCHEMA-ONLY-1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-migration-failure-unrecorded', NULL, 'APPLY-MIGRATIONS-LINT-1', 'failure-mode detector',
  '{"paths": ["scripts/apply_migrations.py"], "contains": "def file_failure_issue"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a statement SQLite cannot parse is a defect the pull request gate can see offline, an empty backup protects nothing when a file deletes no row, and a failed migration must always leave an issue',
  'APPLY-MIGRATIONS-LINT-1: apply_migrations.py plan() prepares every statement with EXPLAIN in an in-memory SQLite and refuses parse-class errors only; BACKUP-SCHEMA-ONLY-1: an empty backup stops only a file that runs DELETE FROM or DROP TABLE; record_failure falls back to a duplicate lookup plus INSERT ... VALUES and annotates a failure it could not record; the two changed controls get a control_alternate_probes row each (a state check on their detector contract), so neither reads no-probe',
  'migration_runs 288 (unrecognized token, 2026-10-18T12:20:53Z), 352, 355 and 361 (BACKUP table bak_20261019_repo_slug_any_depth is empty, 2026-10-19T07:35-07:42Z), 291, 293 and 296 (error rows with no MIGRATION-APPLY-FAILED-1 issue). The lint refuses 0 of 437 opted-in files (2735 statements) and 0 of the 447 sha256 values migration_runs holds as ok (2841 statements) on origin/main; of 671 historical contents it refuses only the one that failed as run 288. Replaying the 65ca5392 content of repo-slug-any-depth through the old runner reproduces the live error text; the new runner passes the backup check.',
  'merged with this migration',
  'the deploy-gate migration check for migrations/*.sql and the --apply path of apply-migrations.yml and the remediation consumer; a passing file is unchanged, a file with a parse error is refused earlier, a DROP TRIGGER-only file with an empty backup now applies',
  'git revert of the pull request; the Rollback header removes the registry rows and the two control probes; a "-- PARSE-LINT: off (<reason>)" header line bypasses the lint for one file without a deploy',
  'a syntax error in a migration fails the pull request instead of main, and a failed apply always files its issue',
  'migration_runs gains no error row mentioning unrecognized token, syntax error or "BACKUP table ... is empty" for a DROP-only file after the merge; every error row has a MIGRATION-APPLY-FAILED-1 issue',
  'none', 'scripts/apply_migrations_test.py (offline; the BACKUP-SCHEMA-ONLY-1 and APPLY-MIGRATIONS-LINT-1 blocks fail on the old runner); plan() over every migration in the tree, over every historical content on origin/main and over every sha256 migration_runs holds as ok; replay of the failing repo-slug file against a fake D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'APPLY-MIGRATIONS-LINT-1:') = 1);
