-- TRACKER-DRAIN-1 (pillar autonomy; agent_issues 2940 follow-up; qnfo-github-steward 0.5.0). Companion to the steward change.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_v_tracker_drift
-- Rollback: DROP VIEW v_tracker_drift; CREATE VIEW v_tracker_drift AS SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id WHERE a.status = 'open' AND l.issue_id IS NULL AND a.created_at < (strftime('%s','now') - 1200) * 1000 UNION ALL SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?') FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id WHERE (a.status = 'open') <> (COALESCE(l.gh_state, '') = 'open') UNION ALL SELECT 'code-task-pr', t.task_id, t.drift FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> ''; UPDATE code_task_pr_links SET head_ref = NULL, task_ref = NULL; UPDATE gh_issue_links SET gh_close_reason = NULL; DELETE FROM remediation_contracts WHERE class IN ('fm-tracker-state-lag', 'fm-dispatch-resolved-gh-open', 'fm-monitoring-closed-completed', 'fm-pr-attempt-unlinked'); DELETE FROM failure_modes WHERE fm_key IN ('tracker-state-lag', 'dispatch-resolved-gh-open', 'monitoring-closed-completed', 'pr-attempt-unlinked'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'tracker_drift_oldest_min'; DELETE FROM metric_registry WHERE metric = 'tracker_drift_oldest_min'; DELETE FROM control_registry WHERE control = 'tracker-mass-flip-guard';
-- Rollback note: the previous 3-column view above is the 2026-10-18-tracker-sync.sql definition (kind, ref, detail); the three added columns are nullable, unread without the 0.5.0 steward, and SQLite cannot drop them. bak_20261019_v_tracker_drift holds the view this file replaces.
--
-- Measured 2026-10-19 05:50Z to 06:15Z, before this change:
--   * no age: v_tracker_drift counted rows but nothing said how long the oldest had waited. gh_issue_links.synced_at is rewritten every
--     tick, so it is not an age; the D1 change time is agent_issues.updated_at. Rows waited up to 85 min behind newer ones because the
--     steward's join was unordered. Now ordered oldest first, and the age is a metric (tracker_drift_oldest_min, target <= 30).
--   * the count is NOT graced or filtered: a burst of D1 closes shows as drift at once (a grace window would be a detector-suppressing
--     filter). The mass-flip guard in the steward is the one control that changes (tracker-mass-flip-guard, below).
--   * 42 resolved worker-observability fleet_issue_dispatch rows kept an open [fleet] issue on GitHub (ISSUE-SYNC-FORWARD-1 closes them).
--   * 42 monitoring agent_issues (parked twins of a newer open row) were closed on GitHub as completed with "(none recorded)"
--     evidence; the steward now closes them not_planned naming the twin and records it in gh_issue_links.gh_close_reason.
--   * 6 superseded attempt PRs (780, 1042, 1067, 1070, 1413, 1414) read pr-without-task: they left the 2-page recent window before the
--     0.4.8 stem match ran. code_task_pr_links now records head_ref and task_ref so the ledger says which task an attempt belonged to.
--
-- The view keeps its three columns and adds age_min (minutes the row has been wrong). 'issue-state' uses the same status set as the
-- steward's TS_STATUS_OPEN (only 'open' is open on GitHub; qnfo-github-steward/tracker-sync.test.mjs asserts the two lists agree).

ALTER TABLE gh_issue_links ADD COLUMN gh_close_reason TEXT;
ALTER TABLE code_task_pr_links ADD COLUMN head_ref TEXT;
ALTER TABLE code_task_pr_links ADD COLUMN task_ref TEXT;

CREATE TABLE IF NOT EXISTS bak_20261019_v_tracker_drift AS SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_tracker_drift';

DROP VIEW IF EXISTS v_tracker_drift;

CREATE VIEW v_tracker_drift AS
  SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail,
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.created_at, 0) / 1000) / 60) AS age_min
    FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE a.status = 'open' AND l.issue_id IS NULL AND a.created_at < (strftime('%s','now') - 1200) * 1000
  UNION ALL
  SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?'),
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.updated_at, a.created_at, 0) / 1000) / 60)
    FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE (a.status IN ('open')) <> (COALESCE(l.gh_state, '') = 'open')
  UNION ALL
  SELECT 'code-task-pr', t.task_id, t.drift,
         CASE WHEN t.synced_at IS NULL THEN 0 ELSE MAX(0, (CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', t.synced_at) AS INTEGER)) / 60) END
    FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> '';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES
 ('tracker_drift_oldest_min', 'operational', 'lagging', 'max(age_min) over the v_tracker_drift rows of kind issue-state and issue-unmirrored (the ones the steward drains) after each steward tick: minutes the oldest D1/GitHub issue disagreement has waited (since the D1 change). code-task-pr rows are excluded: the code loop owns them and tracker_code_task_drift counts them', 'qnfo-audit.v_tracker_drift', '85 min measured 2026-10-19 05:50Z', '30', 'qnfo-github-steward', 'analytics_metric_triggers tracker_drift_oldest_min -> agent_issues', '10m', '> 30', '> 120', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('tracker_drift_oldest_min', 'Tracker drift has waited over 30 minutes: the steward is not draining D1 changes to GitHub', 'registry', 'gt', 30, 2,
 'Pillar autonomy (TRACKER-DRAIN-1, SLA-120M-1). The oldest issue row of v_tracker_drift (SELECT kind, ref, detail, age_min FROM v_tracker_drift WHERE kind IN (''issue-state'', ''issue-unmirrored'') ORDER BY age_min DESC) has waited more than 30 minutes; the SLA ceiling is 120. qnfo-github-steward fixes issue-state drift oldest D1 change first every 10 minutes inside a time/subrequest budget (GET /tracker last_run.state_sync: drift, tried, fixed, carried, oldest_min, rate_limited). Read it: rate_limited set = GitHub secondary limit (lower TS_FIX_MAX or raise the tick cadence share); carried large with rate_limited null = the budget (TS_FIX_MS, TS_FIX_CALLS) is the limiter, size it from the run duration_ms; errors naming a status = a GitHub refusal to fix at the issue. Do not add a grace window to v_tracker_drift. Done: tracker_drift_oldest_min <= 30 at two refreshes.',
 'qnfo-github-steward', 'agent_issues', 2, 1, 'TRACKER-DRAIN-1 (migrations/2026-10-19-tracker-drift-age.sql); replaces the throughput lever the tracker_drift trigger never named');

-- The mass-flip guard changes behaviour (it used to refuse over half the links, and a D1 burst past that stalled the sync for good).
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('tracker-mass-flip-guard', 'qnfo-github-steward/worker.js tsGuard (tsIssues, psRoadmap)', 'guard',
 'a GitHub label rename or API anomaly that makes every mirrored issue look closed, and a mass reopen/close flip on the public tracker',
 0, 'demote', 'applied',
 'a disagreement is explained when D1 moved across the open/closed line since the link last agreed (the link''s d1_status, refreshed every tick, differs from the current status): GitHub is simply behind, and it is always processed in budgeted slices, oldest first. A disagreement where d1_status already equals status is a GitHub-side change (label rename, hand close, API anomaly) however recent agent_issues.updated_at is; those are refused only when they are over half the links. Every close and reopen is reversible, and each carries a comment',
 NULL,
 'TRACKER-DRAIN-1 2026-10-19: the guard had never fired (max drift 62 of about 430 links) but a D1 burst past half the links would have stalled the sync permanently, since nothing a refusal leaves undone can shrink the count. A 24 h updated_at window was tried first and rejected in review: live D1 2026-10-19 had 315 of 315 non-open links and 157 of 181 open links touched within 24 h (bulk closes, age bumps), so it explained everything and the guard never fired. qnfo-github-steward/tracker-sync.test.mjs: 151 real D1 changes over half the links drain in slices; recently touched rows whose d1_status already equals status are refused with zero writes; real changes inside a refused mass are still processed.',
 NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('tracker-state-lag', 'a D1 issue state change waits more than an hour to reach GitHub', 'the steward fixed a flat 20 rows a tick in unspecified order (the newest ids last) and nothing measured how long a row had been wrong', 'qnfo-github-steward 0.5.0 drains oldest D1 change first inside a time/subrequest budget, stops on 403/429, and publishes tracker_drift_oldest_min', 'remediation_contracts fm-tracker-state-lag (d1-query, hourly)', 'fm-tracker-state-lag', '2026-10-19', 'a burst of D1 closes (RESOLVE-ALL-OPEN-1, verified-remediation) larger than one tick can fix', 'closed D1 issues stay open on GitHub; tracker_drift re-breaches after every burst', 'public issue tracker accuracy'),
 ('dispatch-resolved-gh-open', 'a resolved Cloudflare Observability group keeps an open GitHub issue', 'ISSUE-SYNC-1 mirrored the group and ISSUE-SYNC-REVERSE-1 copied a GitHub close back, but nothing closed the issue when pollObservability resolved the group', 'qnfo-github-steward ISSUE-SYNC-FORWARD-1 closes the issue (completed, with a comment) and stamps exec_state closed-by-sync; a recurrence reopens it before the reverse leg runs', 'remediation_contracts fm-dispatch-resolved-gh-open (d1-query, hourly)', 'fm-dispatch-resolved-gh-open', '2026-10-19', 'a Cloudflare issue group resolves', '42 [fleet] issues open for groups that no longer occur', 'public issue tracker accuracy'),
 ('monitoring-closed-completed', 'a monitoring agent_issues card is closed on GitHub as completed with no close evidence', 'the steward treated every status other than open as closed with state_reason completed and quoted "(none recorded)" as evidence', 'one status mapping (tsGhWant): monitoring and wontfix close not_planned, monitoring names its live twin, and no evidence comment is posted when close_evidence is empty', 'remediation_contracts fm-monitoring-closed-completed (d1-query, hourly)', 'fm-monitoring-closed-completed', '2026-10-19', 'a card is parked as monitoring beside an open twin', 'unfinished or duplicate work reads as done on the public tracker', 'public issue tracker accuracy'),
 ('pr-attempt-unlinked', 'a superseded retry attempt pull request reads pr-without-task', 'a repair round re-pushes as codeagent-<stem>-rN and overwrites code_tasks.branch, so the earlier attempts name no task; the 0.4.8 stem match only saw the 2-page recent window', 'qnfo-github-steward 0.5.0 reads a drift row with no head_ref once by number, matches the stem, and records head_ref and task_ref', 'remediation_contracts fm-pr-attempt-unlinked (d1-query, hourly)', 'fm-pr-attempt-unlinked', '2026-10-19', 'a code task retried past the 2-page PR window', 'closed attempt PRs count as tracker_code_task_drift for ever', 'tracker_code_task_drift metric');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-tracker-state-lag', NULL, 'the steward tick is current and the oldest tracker drift row has waited over an hour', 'qnfo-github-steward drains it on its next 10-minute tick', 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT updated_at FROM tracker_sync_state WHERE k = ''last_run''), '''') < strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-60 minutes'') THEN ''steward-stale'' WHEN COALESCE((SELECT MAX(age_min) FROM v_tracker_drift WHERE kind = ''issue-state''), 0) > 60 THEN ''lag'' ELSE ''ok'' END AS observed', 'd1-query', 3, 'qnfo-github-steward', 1, 'active', 'failure-mode'),
 ('fm-dispatch-resolved-gh-open', NULL, 'a resolved worker-observability dispatch row whose GitHub issue was not closed', 'qnfo-github-steward ISSUE-SYNC-FORWARD-1 closes it on its next tick', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_issue_dispatch d WHERE d.category = ''worker-observability'' AND d.state = ''resolved'' AND d.gh_number IS NOT NULL AND d.gh_number <> '''' AND COALESCE(d.exec_state, '''') NOT IN (''closed'', ''closed-by-sync'') AND json_valid(d.payload) AND CAST(COALESCE(json_extract(d.payload, ''$.lastObserved''), 0) AS INTEGER) < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 1800) * 1000) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-github-steward', 1, 'active', 'failure-mode'),
 ('fm-monitoring-closed-completed', NULL, 'a monitoring card closed on GitHub as completed (no reclass recorded, or a reclass GitHub refused and the steward memoised as kept:<status>)', 'qnfo-github-steward reclassifies it once (not_planned plus the twin comment); a kept:<status> row stays visible here until its cause is fixed', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM gh_issue_links l JOIN agent_issues a ON a.id = l.issue_id WHERE a.status = ''monitoring'' AND l.gh_state = ''closed'' AND (COALESCE(l.gh_close_reason, '''') = '''' OR l.gh_close_reason LIKE ''kept:%'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-github-steward', 1, 'active', 'failure-mode'),
 ('fm-pr-attempt-unlinked', NULL, 'a pr-without-task row whose branch stem matches a code task', 'qnfo-github-steward reads the PR once, records head_ref and task_ref, and clears the drift', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_task_pr_links c WHERE c.task_id LIKE ''pr:%'' AND c.drift = ''pr-without-task'' AND c.head_ref LIKE ''codeagent-%'' AND EXISTS (SELECT 1 FROM code_tasks t WHERE substr(t.id, 4, 12) = substr(c.head_ref, 11, 12))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-github-steward', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('github-mirror-forward-close', 'migrations/2026-10-19-tracker-drift-age.sql (TRACKER-DRAIN-1, qnfo-github-steward 0.5.0)', 'qnfo-github-steward 10-minute cron, GITHUB_TOKEN, fleet_issue_dispatch exec_state closed-by-sync',
 'measured every 10 minutes: tracker_drift, tracker_drift_oldest_min; hourly detectors fm-tracker-state-lag, fm-dispatch-resolved-gh-open, fm-monitoring-closed-completed, fm-pr-attempt-unlinked',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'a resolved Cloudflare Observability group closes its GitHub issue and a recurrence reopens it; D1 issue changes reach GitHub oldest first within a budget; superseded attempt PRs are recorded as attempts of their task');
