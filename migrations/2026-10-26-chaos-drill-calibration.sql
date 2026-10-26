-- CHAOS-DRILL-CALIBRATION-1 (2026-10-26, pillar autonomy and security; agent_issues 100482, 1000057, 1000214, owner question: "are there duplicate, deprecated or obsolete issues ... what about old issues?")
--
-- WHAT WAS MEASURED (qnfo-audit SELECT only, 2026-10-26 07:00-07:25Z; no ops_jobs payload text was printed, snippets were digit-masked)
--   CHAOS-DRILL-1 files CHAOS-DRILL-FAILED-1 when the alternate path of a control shows no evidence at its 6-hourly drill and closes the issue itself on the next pass. Nine of
--   them were open and all nine drills were still failing at 07:01Z. Four are calibration defects of the probe, not outages of the alternate:
--   1. ops-jobs-payload-redaction (issue 100482, critical, 111 hours old): the probe greps ops_jobs.payload for the phrases one-time code, verification code and the like. The six rows
--      that match are all origin budget-promote, status succeeded, 150 to 390 KB: repository source bundles in which a code comment (OWNER-OTP-1 notes), a CLI document and a test
--      comment mention the phrase. No digits follow it, none holds a link or a code. 67 of the 70 ops_jobs rows are such bundles (avg 210 KB), the other 3 are user-typed (about 100
--      characters, origin NULL) and are clean. The control guards user-typed text (its own note: what a user-typed link can keep), and the 2026-10-19 scrub shows the probe does catch
--      real leaks there. The phrase scan now skips origin budget-promote and still scans every other origin, and the 15-day sweep check is unchanged. A value-shaped check for the
--      bundles was tried and dropped: D1 refuses a GLOB over 50 bytes, and inspecting only the first token= of a 200 KB bundle would be false assurance.
--   2. research-floor-rearm (issue 1000057): the probe demands the backup table bak_20261019_research_parked. Backups are dropped within about three days (14 bak tables exist on 2026-10-26, the
--      oldest from 2026-10-24, none from 2026-10-19), so the probe fails by construction once the window passes, and it is the only drill probe that names a bak table. The lever check and
--      the hourly tick check stay (13 park-rearm-tick events in the last 48 hours).
--   3. evolve-wip-recovery and 4. research-quality-gate (issue 1000214, the control register): each carries an alternate and no probe, so controls_untested_without_probe reads 2. Their probes
--      observe evidence a D1 read can see: the code planner merged or published a task in 24 hours (20 merged and 1 published today), and the hourly publication gate step wrote a
--      quality_scores snapshot (346 rows today). Both read ok on the live data before this file.
--   Not touched on purpose: the other five drills (qnfo-research-exec single executor, research-revise-refs-extend, remediation reopen on relapse, idea-triaged-hold-owner-and-reentry,
--   compat-advance-review-gate) fail on real missing evidence in code other sessions have claimed, and agent-ws-reactivation-prerequisites waits on a task the code loop marked needs_human.
--
-- Effect: the drill of 13:01Z reads ok for the four and closes 100482 and 1000057 by itself, and 1000214 once both new probes exist. The edited probes are guarded so a second apply, or a probe
-- someone has since changed, is left alone. No trigger, no cron, no DELETE or DROP in the body.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE control_alternate_probes SET probe_sql = (SELECT b.probe_sql FROM bak_20261026_control_alt_probes_calib b WHERE b.control = control_alternate_probes.control), window_note = (SELECT b.window_note FROM bak_20261026_control_alt_probes_calib b WHERE b.control = control_alternate_probes.control) WHERE control IN ('ops-jobs-payload-redaction', 'research-floor-rearm') AND EXISTS (SELECT 1 FROM bak_20261026_control_alt_probes_calib b WHERE b.control = control_alternate_probes.control); DELETE FROM control_alternate_probes WHERE control IN ('evolve-wip-recovery', 'research-quality-gate') AND last_run_at IS NULL

CREATE TABLE IF NOT EXISTS bak_20261026_control_alt_probes_calib AS SELECT control, probe_sql, window_note, enabled FROM control_alternate_probes WHERE control IN ('ops-jobs-payload-redaction', 'research-floor-rearm');

UPDATE control_alternate_probes SET probe_sql = 'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE COALESCE(origin, '''') <> ''budget-promote'' AND (payload LIKE ''%magic-link%'' OR payload LIKE ''%magic_link%'' OR payload LIKE ''%/login%token=%'' OR payload LIKE ''%/verify%token=%'' OR payload LIKE ''%/reset%token=%'' OR payload LIKE ''%verification code%'' OR payload LIKE ''%one-time code%'' OR payload LIKE ''%login code%'')) THEN ''a stored ops_jobs payload still holds a login link or a one-time code'' WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE status IN (''succeeded'', ''failed'', ''terminated'', ''cancelled'') AND updated_at < strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-15 days'')) THEN ''a terminal ops_jobs row is older than 15 days, so the 14-day sweep is not running'' ELSE ''ok'' END AS observed', window_note = 'state probe on the stored payloads and the 14-day sweep that bounds what a user-typed link can keep. Payloads of origin budget-promote are repository source bundles (67 of 70 rows on 2026-10-26, 150 to 390 KB) whose comments and docs mention the phrase one-time code, so they are not scanned for phrases (repository content is covered by secret scanning, not by this control)'
WHERE control = 'ops-jobs-payload-redaction' AND probe_sql LIKE '%one-time code%' AND probe_sql NOT LIKE '%budget-promote%';

UPDATE control_alternate_probes SET probe_sql = 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''park_rearm''), ''on'') NOT IN (''on'', ''off'') THEN ''ops_config park_rearm holds a value the sweep does not read, so its off lever is unreadable'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind IN (''park-rearm-tick'') AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'')) THEN ''no park-rearm-tick event in 48 h, so the hourly sweep is not running'' ELSE ''ok'' END AS observed', window_note = '48 h: the sweep logs park-rearm-tick every hour (6 in 6 hours on 2026-10-19). The backup table bak_20261019_research_parked is no longer required: backup tables are dropped within about three days (none from 2026-10-19 exists on 2026-10-26), so a probe that demands one fails by construction'
WHERE control = 'research-floor-rearm' AND probe_sql LIKE '%bak_20261019_research_parked%';

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('evolve-wip-recovery', 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM code_tasks WHERE status IN (''merged'', ''published'') AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''the code planner merged or published no task in 24 hours, so the planner that stands in for evolve-wip-recovery is not draining'' ELSE ''ok'' END AS observed', '24 h: the code planner drains tasks on its own (20 tasks merged and 1 published in the 24 hours to 2026-10-26 07:00Z)', 1),
 ('research-quality-gate', 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM quality_scores WHERE ts >= date(''now'', ''-1 day'')) THEN ''the hourly publication gate sweep wrote no quality_scores snapshot since yesterday, so nothing re-checks a paper after publication'' ELSE ''ok'' END AS observed', '1 day: the hourly publication gate step of qnfo-cloud-ops writes one quality_scores snapshot per paper per UTC day (346 rows on 2026-10-26), so a snapshot from today or yesterday means the sweep that re-checks a paper after publication is running', 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a drill probe that can only fail (a phrase that source code contains, a backup table that retention drops, a control with no probe at all) measures the probe and not the control, and a ticket it files can never close',
  'CHAOS-DRILL-CALIBRATION-1: ops-jobs-payload-redaction scans only payloads that are not repository source bundles, research-floor-rearm no longer demands an expiring backup table, evolve-wip-recovery and research-quality-gate get probes on the evidence their alternates leave',
  'ops_jobs: 70 rows, 67 origin budget-promote (avg 210 KB), 6 phrase matches all in succeeded budget-promote bundles, digit-masked snippets show comments and docs only, the 3 user-typed rows clean. 14 bak tables on 2026-10-26, none older than 2026-10-24. code_tasks 20 merged and 1 published in 24 h. quality_scores 346 rows for 2026-10-26. The four new probes read ok on live qnfo-audit before this file. Offline suite migrations/chaos-drill-calibration.test.mjs replays them',
  'migration merged, the 13:01Z drill re-runs the probes',
  'four rows of control_alternate_probes (two edited with a saved copy, two added) and one backup table of two rows, read by the 6-hourly drill only',
  'the Rollback header restores the two edited probes from bak_20261026_control_alt_probes_calib and deletes the two added rows that have not run (decision_log stays: append-only)',
  'a drill that fails stays failing only on real missing evidence',
  'the 13:01Z drill reads ok for the four and issues 100482 and 1000057 close themselves, 1000214 closes once its register check reads 0',
  'none',
  'd1:qnfo-audit control_alternate_probes, spof_alternate_probes, control_registry, v_control_alternate_status, ops_jobs (counts and digit-masked snippets only), ops_config, cloud_ops_events, code_tasks, quality_scores, sqlite_master (SELECT only), qnfo-cloud-ops/worker.js header, offline node:sqlite suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-1:') = 1);
