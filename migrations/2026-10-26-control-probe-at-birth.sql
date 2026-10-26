-- CONTROL-PROBE-AT-BIRTH-1 (2026-10-26, pillar autonomy; agent_issues 1000214, follows migrations/2026-10-26-control-alternate-probes4.sql)
--
-- WHY THIS FILE EXISTS
--   CHAOS-DRILL-FAILED-1 control:control-alternate-probes (issue 1000214) was filed and reopened because 18 controls were registered on 2026-10-26 by several sessions with an alternate_path and no
--   control_alternate_probes row: v_control_alternate_untested.controls_untested_without_probe read 18 (the 13:01Z drill said "a control with an alternate has no probe and no tested date").
--   CONTROL-ALT-PROBES-4 gives those 18 their probes. Read 2026-10-26 18:50Z, v_control_alternate_status: no-probe 103 (18 untested without a probe, 85 stamped by hand), drilled 46,
--   probe-failing 3, not-exercisable 7, removed 6. The detector fm-control-alternate-undrilled files within the hour and the next control registered without a probe reopens the same issue, so the
--   cause is at the registration: nothing asks the author of a control for its probe. The structural fix is a check on the migration that registers it, in scripts/apply_migrations.py, which is a
--   shared file and a code change, so it is filed here for the code loop (ACT-BRIDGE-1: a code-task line, a code-anchor that occurs once, a code-probe that closes the issue when the marker is on main).
--   Data only: one issue and one decision row. The 103 controls already registered are not touched (a merged file is never re-linted).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE title LIKE 'CONTROL-PROBE-AT-BIRTH-1:%' AND source = 'session' AND status = 'open'
-- Rollback note: the delete leaves a copy in agent_issues_tombstone (no silent drop), a closed or worked issue is closed with evidence instead, and decision_log stays (append-only).

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'CONTROL-PROBE-AT-BIRTH-1: a migration that registers a control with an alternate carries the probe of that control, or the check refuses it',
  'Charter pillar: autonomy. CHAOS-DRILL-FAILED-1 control:control-alternate-probes (issue 1000214) was filed and reopened because 18 controls were registered on 2026-10-26 by several sessions with an alternate_path and no control_alternate_probes row (v_control_alternate_untested.controls_untested_without_probe read 18, and migrations/2026-10-26-control-alternate-probes4.sql gave them probes). Read 2026-10-26 18:50Z: v_control_alternate_status no-probe 103 (18 untested without a probe, 85 stamped by hand), drilled 46, probe-failing 3, not-exercisable 7, removed 6. The detector fm-control-alternate-undrilled files within the hour, and the next control registered without a probe reopens the issue, so the cause is at the registration: nothing asks the author for the probe. Change in scripts/apply_migrations.py plan(), next to the CHECK-ENUM-LINT-1 loop: a changed migration whose statements insert into control_registry (INSERT, INSERT OR IGNORE or INSERT OR REPLACE INTO control_registry) must also insert into control_alternate_probes in the same file, or carry the text ALTERNATE-NOT-EXERCISABLE in the evidence of the control, or declare a header line CONTROL-PROBE: none followed by a reason in parentheses. Otherwise --check fails with a message that names the columns of control_alternate_probes (control, probe_sql, window_note, enabled) and the shape of the probe (SELECT ''ok'' AS expected, CASE ... END AS observed, read-only, falsifiable) and points at migrations/2026-10-26-control-alternate-probes4.sql as the example. Only a file that changes in the pull request is checked, so the 103 controls already registered are untouched. Add cases to scripts/apply_migrations_test.py: a control insert with a probe passes, without one fails, with the reason text passes, with the header opt-out passes, an edit of an existing control row passes. DOCTRINE-1: the check is a gate, so record it in control_registry in the same change (kind gate, disposition keep, the header opt-out as its alternate, this issue as its evidence) with its own probe row. Definition of done: the marker CONTROL-PROBE-AT-BIRTH-1 is on main in scripts/apply_migrations.py.' || char(10) ||
  'code-task: repo=qnfo-workers path=scripts/apply_migrations.py' || char(10) ||
  'code-anchor: problems.append("CHECK constraint would refuse " + bad + " (CHECK-ENUM-LINT-1)")' || char(10) ||
  'code-probe: {"paths": ["scripts/apply_migrations.py"], "contains": "CONTROL-PROBE-AT-BIRTH-1"}',
  'session', 'autonomy', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'CONTROL-PROBE-AT-BIRTH-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a3-drills',
  'an issue that reopens each time a new control is registered without a probe is closed for good only by a check at the registration, and a change to a shared CI script is the code loop work, so this session files it with a code-task and a closing probe instead of editing the script in a data-only task',
  'CONTROL-PROBE-AT-BIRTH-1: files the issue that adds the registration check to scripts/apply_migrations.py (a changed migration that inserts into control_registry also inserts into control_alternate_probes, or records ALTERNATE-NOT-EXERCISABLE, or declares a header opt-out), with a code-task line, a code-anchor that occurs once in the file and a code-probe on the marker',
  'live qnfo-audit 2026-10-26 18:50Z: v_control_alternate_status no-probe 103 (18 untested without a probe, 85 stamped by hand), drilled 46, probe-failing 3, not-exercisable 7, removed 6; all 18 controls of issue 1000214 were registered on 2026-10-26; the anchor problems.append("CHECK constraint would refuse " + bad + " (CHECK-ENUM-LINT-1)") occurs once in scripts/apply_migrations.py on main; the offline suite migrations/control-probe-at-birth.test.mjs replays the file',
  'migration merged, the issue enters the code loop queue through its code-task line',
  'one agent_issues row and one decision_log row, no worker, script, trigger, cron or register change',
  'the Rollback header removes the open issue (a tombstone copy stays) and decision_log stays (append-only)',
  'a control registered without a probe is refused at the pull request that registers it, so the issue 1000214 stops reopening',
  'the code loop opens the pull request for scripts/apply_migrations.py, the marker CONTROL-PROBE-AT-BIRTH-1 reaches main, the code-probe closes the issue, and no new control reaches the register without a probe or a recorded reason',
  'none',
  'd1:qnfo-audit v_control_alternate_status, control_registry (SELECT only), scripts/apply_migrations.py (anchor read), scripts/apply_migrations_test.py, offline node:sqlite suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONTROL-PROBE-AT-BIRTH-1:') = 1);
