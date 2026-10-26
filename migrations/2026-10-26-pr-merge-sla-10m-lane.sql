-- PR-MERGE-SLA-10M-1, lane half (2026-10-26, charter pillar autonomy; agent_issues 1000291). Owner directive 2026-10-26, verbatim: "MERGE ALL PRS AND MAKE SURE THEY ALWAYS
-- MERGE WITHIN 10 MINUTES OF OPENING. THE SYSTEM SHALL AUTOMATICALLY ADDRESS ANY CHECK FAILURES AND MERGE CONFLICTS TO MEET 10-MINUTE SLA AND MERGE/CLOSE AUTOMATICALLY".
-- The directive record, the issue and the decision row landed in migrations/2026-10-26-pr-merge-sla-10m.sql (#4331). This file is the measurement and the switches for
-- qnfo-fleet-control 0.49.0, which changes what the stale-PR lane does:
--   1. the lane merges a green, quiet pull request that is still a draft (the harness opens every session pull request as a draft) by marking it ready first;
--      ops_config stale_pr_merge_drafts = off restores the old refusal. A WIP or hold marker in the title, the labels or the branch still keeps a draft out.
--   2. the quiet window is 3 minutes with a floor of 1 (was 10 and 10; the code default was 20): ops_config stale_pr_merge_idle_min.
--   3. POST /gh/poke runs the lane and the code-loop runner at once, with no secret, debounced to one run a minute; .github/workflows/lane-poke.yml sends it when a
--      pull request opens or becomes ready and when a check workflow completes. ops_config gh_poke_enabled = off stops it. The 10-minute cron stays as the second path.
--   4. every pull request into main is recorded in pr_sla_state (opened_at is GitHub's created_at, the clock the 10 minutes run on) from the list the lane already
--      reads; v_pr_merge_sla grades it, metric pr_open_over_10m (target 0) files an issue on a breach, queue_sla row pr-open-over-10m (10 minutes).
-- WHAT WAS MEASURED (2026-10-26, GitHub API and qnfo-audit): the lane merged nothing for a draft ("a draft" refusal), waited 10 minutes of quiet after the last event, and
--   ran on a 10-minute cron whose faster form CRON-MANDATE-1 forbids; the signed /gh/webhook had never received a delivery (its secret and the GitHub registration are
--   owner-only steps, agent_issues 2582), so no GitHub event reached the lane. The poke carries no secret and trusts nothing it carries: it can only start a pass that the
--   next cron tick would run anyway.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS pr_merge_sla_heavy_tick; DROP VIEW IF EXISTS v_stuck_summary_pr_merge_sla; DROP VIEW IF EXISTS v_pr_merge_sla; DROP TABLE IF EXISTS pr_sla_state; DELETE FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'; DELETE FROM metric_registry WHERE metric = 'pr_open_over_10m'; DELETE FROM remediation_contracts WHERE class IN ('fm-pr-open-over-10m', 'fm-gh-poke-silent'); DELETE FROM failure_modes WHERE fm_key IN ('pr-open-over-10m', 'gh-poke-silent'); DELETE FROM ops_config WHERE key IN ('stale_pr_merge_drafts', 'gh_poke_enabled'); UPDATE ops_config SET value = '10' WHERE key = 'stale_pr_merge_idle_min'; DELETE FROM control_registry WHERE control IN ('stale-pr-draft-refusal', 'gh-poke-switch');
-- Rollback note: ops_config stale_pr_merge_drafts = off, stale_pr_merge_idle_min = 10 and gh_poke_enabled = off restore the 0.48 behaviour without a deploy; the decision row stays as evidence.
-- spof-review: the poke is a second path beside the 10-minute cron, never the only one; the refresh of pr_open_over_10m rides fleet_tick_heavy (one producer until FLEET-TICK-HEAVY-SECOND-PRODUCER-1) and
--   a missed heavy tick delays the metric, it does not stop the lane.
-- runtime-probe (D1): SELECT open_n, over_10m FROM v_pr_merge_sla -- expected a row; over_10m 0 once the lane has run with 0.49.0

CREATE TABLE IF NOT EXISTS pr_sla_state (
  pr INTEGER PRIMARY KEY,
  opened_at TEXT NOT NULL,
  head_ref TEXT,
  draft INTEGER DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open',
  last_seen TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pr_sla_state_state ON pr_sla_state (state, opened_at);

-- A row stays 'open' until the lane reads the pull request closed; one the lane has not seen for 30 minutes was closed by hand between ticks and is not counted.
CREATE VIEW IF NOT EXISTS v_pr_merge_sla AS
SELECT
  COALESCE(SUM(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes') THEN 1 ELSE 0 END), 0) AS open_n,
  COALESCE(SUM(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
                     AND (julianday('now') - julianday(opened_at)) * 1440 > 10 THEN 1 ELSE 0 END), 0) AS over_10m,
  COALESCE(CAST(MAX(CASE WHEN state = 'open' AND last_seen >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
                         THEN (julianday('now') - julianday(opened_at)) * 1440 END) AS INTEGER), 0) AS oldest_min,
  COALESCE(SUM(CASE WHEN state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') THEN 1 ELSE 0 END), 0) AS merged_24h,
  COALESCE(SUM(CASE WHEN state = 'merged' AND closed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
                     AND (julianday(closed_at) - julianday(opened_at)) * 1440 <= 10 THEN 1 ELSE 0 END), 0) AS merged_within_10m_24h
FROM pr_sla_state;

CREATE VIEW IF NOT EXISTS v_stuck_summary_pr_merge_sla AS
SELECT s.*, h.over_10m AS pr_open_over_10m, h.oldest_min AS pr_open_oldest_min
FROM v_stuck_summary s CROSS JOIN v_pr_merge_sla h;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column)
VALUES ('pr-open-over-10m', 'pr_sla_state',
  'A pull request into main of qnfo-workers still open more than 10 minutes after GitHub created it (PR-MERGE-SLA-10M-1; owner directive 2026-10-26)',
  10, 10,
  'qnfo-fleet-control branchHygieneTick (lane) and codeMergeTick merge a green, quiet pull request, a draft included (marked ready first), on the 10-minute cron and within a minute of a poke (POST /gh/poke from lane-poke.yml); .github/workflows/conflict-repair.yml merges main into a conflicted head; a red required check is the code loop''s and the author''s to fix, and the lane''s refusal names it in branch_hygiene_log. Revert: ops_config stale_pr_merge_drafts = off, stale_pr_merge_idle_min = 10.',
  'qnfo-fleet-control', 'v_stuck_summary_pr_merge_sla.pr_open_over_10m');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
  ('stale_pr_merge_drafts', 'on', 'PR-MERGE-SLA-10M-1: on = the stale-PR lane marks a green, quiet draft ready and merges it (a WIP or hold marker in the title, labels or branch keeps it out); off = a draft is refused as before (migrations/2026-10-26-pr-merge-sla-10m-lane.sql)'),
  ('gh_poke_enabled', 'on', 'PR-MERGE-SLA-10M-1: off = POST /gh/poke answers 202 and runs nothing; the 10-minute cron lane is unchanged (migrations/2026-10-26-pr-merge-sla-10m-lane.sql)');
INSERT INTO ops_config (key, value, note) VALUES
  ('stale_pr_merge_idle_min', '3', 'PR-MERGE-SLA-10M-1: minutes a pull request is quiet before the lane merges it (floor 1; was 10, code default 20). Revert: 10.')
ON CONFLICT(key) DO UPDATE SET value = '3', note = 'PR-MERGE-SLA-10M-1: minutes a pull request is quiet before the lane merges it (floor 1; was 10, code default 20). Revert: 10.'
  WHERE ops_config.value IN ('10', '20');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('pr_open_over_10m', 'operational', 'target',
  'pull requests into main of qnfo-workers that GitHub created more than 10 minutes ago and that are still open (pr_sla_state state open, seen by the lane in the last 30 minutes)',
  'qnfo-audit.pr_sla_state via v_pr_merge_sla (PR-MERGE-SLA-10M-1)', 'first refresh after apply; before 0.49.0 the lane refused every draft and waited 10 minutes of quiet',
  '0 (owner directive 2026-10-26: every pull request merges within 10 minutes of opening)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed');

-- Refreshed on fleet_tick_heavy, never on fleet_tick (FLEET-TICK-SPLIT-1): the statement runs only when the metric is 50 minutes old, so a heavy tick every 60 minutes refreshes it hourly.
CREATE TRIGGER IF NOT EXISTS pr_merge_sla_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT over_10m FROM v_pr_merge_sla) AS TEXT)
    WHERE metric = 'pr_open_over_10m' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'pr_open_over_10m', 'Pull requests open more than 10 minutes', 'registry', 'gt', 0, 1,
  'Pillar autonomy (owner directive 2026-10-26: every pull request merges within 10 minutes of opening). Read them: SELECT pr, head_ref, draft, opened_at FROM pr_sla_state WHERE state = ''open'' AND last_seen >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'') AND (julianday(''now'') - julianday(opened_at)) * 1440 > 10; then the lane''s reason for each: SELECT pr, action, why, ts FROM branch_hygiene_log WHERE pr IN (...) ORDER BY id DESC. Levers by reason: a red required check is the author''s or the code loop''s to fix (the lane names the check); a conflict is conflict-repair.yml''s (scripts/conflict_repair.py), and a conflict it will not take (not a VERSION or mirror line) is the author''s; a WIP or hold marker is deliberate, so remove the marker or close the pull request; "no event" with no poke row in cloud_ops_events kind gh-poke means lane-poke.yml did not fire. Close when over_10m = 0.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'PR-MERGE-SLA-10M-1 (migrations/2026-10-26-pr-merge-sla-10m-lane.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'pr_open_over_10m');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('pr-open-over-10m',
  'a pull request stays open past 10 minutes with nothing acting on it',
  'the stale-PR lane refused every draft (the harness opens every session pull request as a draft), waited 10 minutes of quiet and ran on a 10-minute cron; conflict repair skipped drafts and relied on GitHub mergeable_state, which stays unknown while main moves every few minutes',
  'PR-MERGE-SLA-10M-1 (qnfo-fleet-control 0.49.0): drafts are marked ready and merged when green and quiet, the quiet window is 3 minutes, a poke runs the lane within a minute of an event, and pr_sla_state grades every pull request against 10 minutes',
  'fm-pr-open-over-10m: v_pr_merge_sla.over_10m = 0',
  'fm-pr-open-over-10m', '2026-10-26', 1000291,
  'a session pull request opens as a draft, or main moves during the quiet window, or a required check goes red',
  'the 2026-10-26 sweep found open pull requests older than an hour in qnfo-workers, most of them drafts the lane would not merge',
  'every session change to the fleet; the owner directive of 2026-10-26'),
 ('gh-poke-silent',
  'the event path that merges a green pull request within a minute never fires',
  'GH-WEBHOOK-INTAKE-1 needs a signed GitHub registration and a secret only the owner can set, so no GitHub event ever reached the lane; the replacement is an unsigned poke sent by a workflow, which is one more thing that can fail quietly',
  'fm-gh-poke-silent reads cloud_ops_events kind gh-poke: pull requests opened in the last 24 hours with no poke recorded files an issue; the 10-minute cron lane merges meanwhile, so the SLA degrades to one tick, not to nothing',
  'fm-gh-poke-silent: a poke recorded in the last 24 hours whenever a pull request opened in the last 24 hours',
  'fm-gh-poke-silent', '2026-10-26', 1000291,
  'lane-poke.yml is removed, disabled or refused, or POST /gh/poke answers 5xx',
  'GH-WEBHOOK-INTAKE-1 (agent_issues 2582) never received a delivery',
  'the lane runs at the 10-minute cron instead of within a minute of an event');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-pr-open-over-10m', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT over_10m FROM v_pr_merge_sla) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'PR-MERGE-SLA-10M-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-gh-poke-silent', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN EXISTS (SELECT 1 FROM pr_sla_state WHERE opened_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''gh-poke'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN 1 ELSE 0 END) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'PR-MERGE-SLA-10M-1', 'failure-mode detector', 'qnfo-fleet-control');

-- CONTROL-REGISTRY: the lane's idle window is demoted again (10 minutes to 3, floor 1), the draft refusal is replaced by a guarded merge, and the poke is a new switch.
UPDATE control_registry SET evidence = 'PR-MERGE-SLA-10M-1: window 3 minutes, floor 1 (was 10, code default 20); qnfo-fleet-control/pr-lane-fast.test.mjs and pr-merge-sla.test.mjs (a pull request quiet 1 minute waits, one quiet past 3 minutes merges); ops_config stale_pr_merge_idle_min = 10 restores the old window',
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE control = 'stale-pr-merge-idle-window';

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('stale-pr-draft-refusal',
        'qnfo-fleet-control bhMergeDecide (ops_config stale_pr_merge_drafts)',
        'filter',
        'merging a pull request its author has not finished: a draft carrying a WIP or hold marker in its title, labels or branch, a head whose required checks are not green, or one touched in the last quiet window',
        1, 'replace', 'applied',
        'a draft with no WIP or hold marker, green required checks and a quiet head is marked ready (GraphQL markPullRequestReadyForReview, evGraphql) and decided once more by the same rules as a ready pull request; a draft that is held stays out and the refusal row names the marker; ops_config stale_pr_merge_drafts = off restores the blanket refusal',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'qnfo-fleet-control/pr-merge-sla.test.mjs: a green quiet draft is marked ready and merged, a draft titled WIP, one labelled hold, one on a wip/ branch and one with a red check are refused, the switch off refuses a draft, a failed ready call leaves the draft unmerged; 2026-10-26 the lane refused every draft it saw, "a draft", for every session pull request',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('gh-poke-switch',
        'qnfo-fleet-control ghPokeEnabled / ghPokeClaim (ops_config gh_poke_enabled; scheduler_state gh_poke debounce of 60 seconds)',
        'kill-switch',
        'a flood of unsigned POST /gh/poke requests running the lane and the code-loop runner more than once a minute',
        0, 'keep', 'applied',
        'the 10-minute cron runs the same two ticks, so a poke that is debounced, switched off or refused delays a merge by one tick and loses nothing; the debounce slot is one atomic upsert and fails closed',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'qnfo-fleet-control/pr-merge-sla.test.mjs: the first poke runs, a second inside 60 seconds is debounced, gh_poke_enabled = off runs nothing, a failing claim runs nothing, the response is 202 and carries nothing from the request except a sanitised event hint',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'every pull request into main is graded against 10 minutes from GitHub created_at (pr_sla_state, v_pr_merge_sla) and a green one is merged within a minute of the event that made it green',
  'PR-MERGE-SLA-10M-1, migrations/2026-10-26-pr-merge-sla-10m-lane.sql, qnfo-fleet-control 0.49.0, .github/workflows/lane-poke.yml',
  'branchHygieneTick reads the pull request list each tick; lane-poke.yml reaches POST /gh/poke; fleet_tick_heavy producer for the metric',
  'qnfo-fleet-control/pr-merge-sla.test.mjs covers the draft rules, the window, the poke and the age rows',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'SELECT * FROM v_pr_merge_sla; SELECT * FROM cloud_ops_events WHERE kind = ''gh-poke'' ORDER BY ts DESC LIMIT 5'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability LIKE 'every pull request into main is graded%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_011iUExz3dr2XK5PGm4gwBjs',
  'a 10-minute merge SLA needs the lane to act on the event, not on a 10-minute cron, to accept the pull requests the harness actually opens (drafts), and to be graded by the clock the owner reads (GitHub created_at); the signed webhook cannot be the event path because its secret is owner-only and has never been set',
  'PR-MERGE-SLA-10M-1 lane half: qnfo-fleet-control 0.49.0 merges a green quiet draft by marking it ready, drops the quiet window to 3 minutes, adds POST /gh/poke (unsigned, debounced, switchable) sent by lane-poke.yml, and records pr_sla_state with v_pr_merge_sla, metric pr_open_over_10m and queue_sla pr-open-over-10m',
  '2026-10-26 sweep: open pull requests older than an hour, lane refusal "a draft" for session pull requests, branch_hygiene_log merge refusals, GH-WEBHOOK-INTAKE-1 with no deliveries, CRON-MANDATE-1 forbidding a faster cron',
  'migration merged with qnfo-fleet-control 0.49.0 through the canonical path',
  'the lane may merge a draft its author left green and quiet for 3 minutes, which is the policy the directive asks for; a WIP or hold marker, a red check and the switches bound it; a forged poke can start only a pass the next cron tick runs anyway',
  'ops_config stale_pr_merge_drafts = off, stale_pr_merge_idle_min = 10, gh_poke_enabled = off, or the Rollback header',
  'a green pull request merges within a minute of its last check, and every pull request is graded against the owner''s 10 minutes',
  'pr_open_over_10m <= 0 within 6 h',
  'median open-to-merge of session pull requests under 10 minutes',
  'bhMergeDecide and the poke handler run offline in pr-merge-sla.test.mjs, pr-lane-fast.test.mjs and branch-hygiene.test.mjs; v_pr_merge_sla and the migration run on SQLite in migrations/pr-merge-sla-lane.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-10M-1 lane half:%');
