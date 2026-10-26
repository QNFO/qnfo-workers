-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-control-probe-at-birth-missing'; DELETE FROM failure_modes WHERE fm_key = 'control-probe-at-birth-missing'; DELETE FROM control_alternate_probes WHERE control = 'control-probe-at-birth'; DELETE FROM control_registry WHERE control = 'control-probe-at-birth'; decision_log is append-only and keeps its row.
-- spof-review: adds no worker, cron or trigger; it records one gate in control_registry with its alternate (the per-file header release valve, and the hourly detector fm-control-alternate-undrilled that already files the same defect after merge) and a read-only tested-alternate probe in control_alternate_probes, inserted by this file, so the gate does not read no-probe in v_control_alternate_status.
--
-- CONTROL-PROBE-AT-BIRTH-1 (2026-10-26, pillar autonomy; agent_issues 1000483, from CHAOS-DRILL-FAILED-1 control:control-alternate-probes, agent_issues 1000214)
--
-- WHY: 18 controls were registered on 2026-10-26 by several sessions, each with a written alternate_path and no control_alternate_probes row. v_control_alternate_status read them as no-probe,
-- controls_untested_without_probe read 18, the chaos drill failed and fm-control-alternate-undrilled filed 1000214 again; migrations/2026-10-26-control-alternate-probes4.sql gave them probes after the fact.
-- Read 2026-10-26 18:50Z: no-probe 103 (18 untested without a probe, 85 stamped by hand), drilled 46, probe-failing 3, not-exercisable 7, removed 6. Nothing asked the author for the probe at the registration.
--
-- WHAT CHANGED (scripts/apply_migrations.py control_probe_problems, called by plan() next to CHECK-ENUM-LINT-1; the marker CONTROL-PROBE-AT-BIRTH-1 is in the code)
--   A migration that INSERTs (INSERT, INSERT OR IGNORE, INSERT OR REPLACE) into control_registry with an alternate_path must, in the same file, INSERT a control_alternate_probes row for that control,
--   or carry ALTERNATE-NOT-EXERCISABLE in that control's evidence, or declare the header line "-- CONTROL-PROBE: none (<reason>)". The message names the probe columns (control, probe_sql,
--   window_note, enabled), the shape of the probe (SELECT 'ok' AS expected, CASE ... END AS observed, read-only, falsifiable) and the example file above.
--   Release valves and scope, measured in scripts/apply_migrations_test.py: a control inserted with no alternate_path (the view reads no-alternate) and an UPDATE of an existing row pass; the check runs
--   in --check (deploy-gate, the changed files of a pull request) and not in --apply, so a file already merged is never refused at apply time (plan birth=False); --check --history skips it for a
--   whole-tree run. Run over the 624 opted-in files already on main it would refuse 76 if they changed again, which is why only a changed file is judged; those 76 are not edited here.
--
-- DOCTRINE-1: the check is a gate, so it is registered here with disposition keep, its alternate and this issue as evidence.
--
-- Every statement is guarded so a second apply changes nothing.

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('control-probe-at-birth', 'scripts/apply_migrations.py control_probe_problems (called by plan with birth=True from --check), run by deploy-gate (MIGRATION-RUNNER-1 step) on every added or changed migrations/*.sql', 'gate',
  'a control registered with an alternate_path and no control_alternate_probes row: v_control_alternate_status reads it no-probe, the chaos drill fails and fm-control-alternate-undrilled files CHAOS-DRILL-FAILED-1 again (18 controls on 2026-10-26, agent_issues 1000214)',
  0, 'keep', 'applied',
  'A "-- CONTROL-PROBE: none (<reason>)" header line releases one file, ALTERNATE-NOT-EXERCISABLE in a control evidence releases one control (the view reads not-exercisable), and --check --history skips the check for a whole-tree run. After a merge the hourly detector fm-control-alternate-undrilled (controls_untested_without_probe, expected 0) files the same defect, as it did before this gate existed.',
  NULL,
  'Measured 2026-10-26 on origin/main: 624 opted-in migrations, 76 would be refused if changed again (they register controls with an alternate_path and no probe in the same file); migrations/2026-10-20-apply-migrations-lint.sql and migrations/2026-10-26-control-alternate-probes4.sql, which ship their probes, pass. scripts/apply_migrations_test.py (CONTROL-PROBE-AT-BIRTH-1 block, 14 checks) fails on the old script. Revert: remove the control_probe_problems call from plan(). Tested alternate: control_alternate_probes row control-probe-at-birth (state check on the contract fm-control-probe-at-birth-missing: present, active, code-read, still reading the CONTROL-PROBE-AT-BIRTH-1 marker); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  1000483);

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-control-probe-at-birth-missing'' AND status = ''active'' AND verify_transport = ''code-read'' AND instr(verify_probe, ''CONTROL-PROBE-AT-BIRTH-1'') > 0) THEN ''the detector fm-control-probe-at-birth-missing is missing, not active, not code-read or no longer reads the CONTROL-PROBE-AT-BIRTH-1 marker'' ELSE ''ok'' END AS observed',
  '60 minutes: the detector contract is read every 60 minutes (cadence 1), so a gate that left main is found within one cycle; the probe is a state check on the contract row and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'control-probe-at-birth';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('control-probe-at-birth-missing',
  'a control is registered with an alternate_path and no control_alternate_probes row, so the alternate is never drilled and the chaos drill fails',
  'migrations that register controls (INSERT INTO control_registry) were checked only for CHECK-constrained literals; nothing asked the author for the probe, so 18 controls registered in one day by several sessions read no-probe until probes4 added them after the fact (agent_issues 1000214)',
  'CONTROL-PROBE-AT-BIRTH-1 (scripts/apply_migrations.py control_probe_problems): --check refuses a control insert with an alternate_path and no probe row, no ALTERNATE-NOT-EXERCISABLE evidence and no "-- CONTROL-PROBE: none (<reason>)" header; the message names the probe columns, shape and example file',
  'scripts/apply_migrations.py on main contains CONTROL-PROBE-AT-BIRTH-1 (the gate is in the code)',
  'fm-control-probe-at-birth-missing', '2026-10-26', 1000483,
  'a pull request adds a migration that inserts a control with an alternate_path and ships no probe for it',
  'v_control_alternate_untested.controls_untested_without_probe above 0, drill_state no-probe in v_control_alternate_status, fm-control-alternate-undrilled red within the hour and CHAOS-DRILL-FAILED-1 reopened',
  'one issue reopening per batch of controls registered without a probe; no data is lost');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-control-probe-at-birth-missing', NULL, 'CONTROL-PROBE-AT-BIRTH-1', 'failure-mode detector',
  '{"paths": ["scripts/apply_migrations.py"], "contains": "CONTROL-PROBE-AT-BIRTH-1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a control registered without its probe is a defect the pull request gate can see offline, and asking at the registration is cheaper than the hourly detector reopening CHAOS-DRILL-FAILED-1 afterwards',
  'CONTROL-PROBE-AT-BIRTH-1: apply_migrations.py --check refuses a control_registry insert with an alternate_path that has no control_alternate_probes row, ALTERNATE-NOT-EXERCISABLE evidence or CONTROL-PROBE: none header; --apply and --check --history do not run it; the gate itself is registered as control control-probe-at-birth with its own probe and detector contract',
  'v_control_alternate_status 2026-10-26T18:50Z: no-probe 103 (18 untested without a probe), drilled 46, probe-failing 3, not-exercisable 7, removed 6; agent_issues 1000214 filed and reopened by 18 controls registered in one day; 76 of 624 opted-in migrations on main would be refused if changed again, 2 sibling files that ship probes pass',
  'merged with this migration',
  'the deploy-gate migration check for added or changed migrations/*.sql: a pull request that registers a control with an alternate and no probe now fails there; the --apply path and every merged file are unchanged',
  'git revert of the pull request; the Rollback header removes the registry rows and the probe; a "-- CONTROL-PROBE: none (<reason>)" header line releases one file without a deploy',
  'a control cannot reach main with an alternate that nothing drills',
  'controls_untested_without_probe stays 0 and no new CHAOS-DRILL-FAILED-1 reopening names control-alternate-probes after the merge; fm-control-alternate-undrilled reads 0 at each hourly run',
  'none', 'scripts/apply_migrations_test.py (offline; the CONTROL-PROBE-AT-BIRTH-1 block fails on the old script); plan() over every migration in the tree and the two sibling files that ship probes; the registry migration is run twice against the live table shapes in migrations/control-probe-at-birth.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONTROL-PROBE-AT-BIRTH-1:') = 1);
