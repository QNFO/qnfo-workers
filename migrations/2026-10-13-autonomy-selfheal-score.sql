-- AUTONOMY-SELFHEAL-SCORE-1 (2026-10-13, pillar autonomy). Owner directive, verbatim: "Implement additional metrics to increase total
-- system autonomy and self-heal scores. ... Target open issues for definition-of-done success criteria: 0; with all fleet systems
-- green/passing." Each metric below measures one reason an issue does not close on its own, found while draining issues today:
--   open_issues_without_doer_24h  open issues older than 24 h that nothing acts on: no code-task line, no unfinished code task, no live
--                                 work claim. 73 of 117 on 2026-10-13 22:35Z (37 of them METRIC-* issues whose trigger names no code
--                                 task). Target 0, trigger gt 10. Lever: ACT-BRIDGE-1 code-task lines, or the owning loop's fix.
--   contracts_unexecutable_open   open issues whose closing probe cannot decide: verdict vacuous, not machine-executable, probe-error or
--                                 same-account host, or the self-referential "is this issue closed" probe. 0 now (2507, 2508, 2514, 2521
--                                 were rewritten by hand today). Target 0, trigger gt 0.
--   remediation_tick_age_min      minutes since qnfo-fleet-control's remediation tick last wrote a verification. It was silent 19:41Z to
--                                 22:21Z (the cron fall-through, fm-hourly-fanout-double) and nothing measured it. Target <= 20, trigger
--                                 gt 30. 10 now.
--   server_side_close_share_7d    of issues closed in 7 days, the share closed without a session (close_channel not session*, claude*,
--                                 issue-triage*, issue_triage.owner not session*, claude*). 0.959 of 557 now. Target >= 0.95, trigger
--                                 lt 0.9.
--   autonomy_selfheal_score       headline 0-100: the mean of autonomy_rate_7d, server_side_close_share_7d,
--                                 issue_auto_close_2h_share_24h, min(1, issue_drain_ratio_24h / 1.5), tick freshness (1 at <= 20 min,
--                                 falling to 0 at 120), probe executability (1 - unexecutable/10) and doer coverage (1 - without
--                                 doer / open). Target >= 90. Exempt from its own trigger: each component files its own lever.
-- Refresh: trigger autonomy_selfheal_tick on fleet_tick, at most once per 10-minute slot of the hour's first slot (minute 00-09), so
-- the doer scan (about 140k rows read) runs about twice an hour, not every tick. Scalar subqueries only (D1-COMPOUND-LIMIT-1); the
-- components are written before the score that reads them. Writes only metric_registry.
-- spof-review: a measurement on the two fleet_tick producers (cron:qnfo-code-orchestrator, cron:qnfo-fleet-dashboard);
-- metric_staleness_breach_rec records a stale refresh.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS autonomy_selfheal_tick; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('open_issues_without_doer_24h', 'contracts_unexecutable_open', 'remediation_tick_age_min', 'server_side_close_share_7d'); DELETE FROM metric_registry WHERE metric IN ('open_issues_without_doer_24h', 'contracts_unexecutable_open', 'remediation_tick_age_min', 'server_side_close_share_7d', 'autonomy_selfheal_score')

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('open_issues_without_doer_24h', 'operational', 'target',
  'open agent_issues older than 24 h with no code-task: line, no code_tasks row for [issue #id] outside failed/closed/superseded/needs_human, and no live unreleased work_claims row on the issue',
  'qnfo-audit.agent_issues, code_tasks, work_claims (AUTONOMY-SELFHEAL-SCORE-1)', '73 of 117 open on 2026-10-13 22:35Z',
  '0 (owner directive 2026-10-13: open issues 0; an issue with no doer never closes on its own)', 'qnfo-fleet-control', 'trigger gt 10', 'hourly', '> 5', '> 30', NULL, NULL, 'MEASURED', 'computed'),
 ('contracts_unexecutable_open', 'operational', 'target',
  'open issues with an active or holding contract whose last_verdict is vacuous-probe-result, probe-not-machine-executable, probe-error or probe-same-account-host, or whose probe only asks whether the issue itself is closed',
  'qnfo-audit.remediation_contracts, agent_issues (AUTONOMY-SELFHEAL-SCORE-1)', '0 on 2026-10-13 22:35Z (after 2507, 2508, 2514, 2521 were rewritten)',
  '0 (every open issue has a probe that can close it)', 'qnfo-fleet-control', 'trigger gt 0', 'hourly', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('remediation_tick_age_min', 'operational', 'target',
  'minutes since the newest remediation_verifications row whose verifier is qnfo-fleet-control/remediation-tick*',
  'qnfo-audit.remediation_verifications (AUTONOMY-SELFHEAL-SCORE-1)', '10 on 2026-10-13 22:35Z; 160 at 22:21Z before 0.26.3',
  '<= 20 (the tick runs every 10 minutes)', 'qnfo-fleet-control', 'trigger gt 30', 'hourly', '> 20', '> 60', NULL, NULL, 'MEASURED', 'computed'),
 ('server_side_close_share_7d', 'operational', 'target',
  'issues closed or resolved in 7 days (updated_at) whose close_channel is not session*, claude*, issue-triage* and whose issue_triage.owner is not session*, claude* / those issues',
  'qnfo-audit.agent_issues, issue_triage (AUTONOMY-SELFHEAL-SCORE-1)', '0.959 of 557 on 2026-10-13 22:35Z',
  '>= 0.95 (the fleet closes its own issues; a session close is the exception)', 'qnfo-fleet-control', 'trigger lt 0.9', 'hourly', '< 0.95', '< 0.8', NULL, NULL, 'MEASURED', 'computed'),
 ('autonomy_selfheal_score', 'operational', 'target',
  '100 x mean of autonomy_rate_7d, server_side_close_share_7d, issue_auto_close_2h_share_24h, min(1, issue_drain_ratio_24h/1.5), tick freshness max(0, min(1, (120 - remediation_tick_age_min)/100)), max(0, 1 - contracts_unexecutable_open/10), 1 - open_issues_without_doer_24h/open issues',
  'qnfo-audit.metric_registry (AUTONOMY-SELFHEAL-SCORE-1)', 'first refresh after apply',
  '>= 90 (owner directive 2026-10-13: raise total system autonomy and self-heal)', 'qnfo-fleet-control',
  'exempt from its own trigger: each component files its own lever', 'hourly', '< 90', '< 70', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS autonomy_selfheal_tick AFTER INSERT ON fleet_tick
WHEN CAST(strftime('%M', 'now') AS INTEGER) < 10 OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL
                          AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(DISTINCT a.id) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id AND c.status IN ('active', 'holding')
      WHERE a.status = 'open' AND (COALESCE(c.last_verdict, '') IN ('vacuous-probe-result', 'probe-not-machine-executable', 'probe-error', 'probe-same-account-host')
            OR instr(c.verify_probe, 'THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ') > 0)) AS TEXT)
  WHERE metric = 'contracts_unexecutable_open';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(CAST(ROUND((julianday('now') - julianday(MAX(verified_at))) * 1440) AS INTEGER), 9999) FROM remediation_verifications
      WHERE verifier LIKE 'qnfo-fleet-control/remediation-tick%') AS TEXT)
  WHERE metric = 'remediation_tick_age_min';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN COALESCE(a.close_channel, '') NOT LIKE 'session%' AND COALESCE(a.close_channel, '') NOT LIKE 'claude%'
                                   AND COALESCE(a.close_channel, '') NOT LIKE 'issue-triage%'
                                   AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id
                                                   AND (COALESCE(t.owner, '') LIKE 'session%' OR COALESCE(t.owner, '') LIKE 'claude%'))
                              THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 3)
      FROM agent_issues a WHERE a.status IN ('closed', 'resolved') AND a.updated_at > (CAST(strftime('%s', 'now') AS INTEGER) - 604800) * 1000) AS TEXT)
  WHERE metric = 'server_side_close_share_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(ROUND(100.0 * (
        MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'autonomy_rate_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'server_side_close_share_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_auto_close_2h_share_24h'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_drain_ratio_24h'), 0) / 1.5))
      + MIN(1.0, MAX(0.0, (120.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'remediation_tick_age_min'), 120)) / 100.0))
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'contracts_unexecutable_open'), 10) / 10.0)
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'open_issues_without_doer_24h'), 0)
                       / MAX(1.0, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open')))
    ) / 7.0, 1) AS TEXT)
  WHERE metric = 'autonomy_selfheal_score';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'open_issues_without_doer_24h', 'Self-heal gap: open issues older than a day that nothing acts on', 'registry', 'gt', 10, 2,
  'Pillar autonomy (owner directive 2026-10-13: open issues 0). Read them: SELECT a.id, a.priority, a.source, substr(a.title, 1, 80) FROM agent_issues a WHERE a.status = ''open'' AND a.created_at <= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000 AND instr(COALESCE(a.description, ''''), ''code-task:'') = 0 ORDER BY a.created_at. Levers in order: (1) a METRIC-TRIGGER issue: write its fix into analytics_metric_triggers.action with the code-task: and code-anchor: lines (ACT-BRIDGE-1) so the next breach carries a doer, and add the same lines to the open issue; (2) a defect in one file: add code-task: repo=qnfo-workers path=<file> and code-anchor: to the issue; (3) a control-plane file the code loop does not plan: name the session or loop that holds it and take the work claim; (4) a roadmap item or report: move it to goals or objective_space and supersede the issue with the successor id (never wontfix, INTEGRITY-GUARDS-1). Done: open_issues_without_doer_24h <= 10 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'AUTONOMY-SELFHEAL-SCORE-1 (migrations/2026-10-13-autonomy-selfheal-score.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'open_issues_without_doer_24h');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'contracts_unexecutable_open', 'Self-heal gap: open issues whose closing probe cannot decide', 'registry', 'gt', 0, 2,
  'Pillar autonomy. Read them: SELECT a.id, c.class, c.verify_transport, c.last_verdict, substr(c.verify_probe, 1, 160) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id WHERE a.status = ''open'' AND c.status IN (''active'', ''holding'') AND (c.last_verdict IN (''vacuous-probe-result'', ''probe-not-machine-executable'', ''probe-error'', ''probe-same-account-host'') OR instr(c.verify_probe, ''THEN ''''closed'''' ELSE NULL END FROM agent_issues WHERE id = '') > 0). Lever: UPDATE the issue-<id> contract to a probe on the definition of done: d1-query on the table the fix changes, code-read {paths, contains|absent} for a code state, external-https {url, check, expected} for a host outside the fleet (raw.githubusercontent.com, api.github.com), runner-https for a fleet host. Never a probe that already passes while the defect exists. Done: contracts_unexecutable_open = 0 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'AUTONOMY-SELFHEAL-SCORE-1 (migrations/2026-10-13-autonomy-selfheal-score.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'contracts_unexecutable_open');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'remediation_tick_age_min', 'Self-heal outage: the 10-minute remediation tick stopped writing verifications', 'registry', 'gt', 30, 1,
  'Pillar autonomy. The qnfo-fleet-control fast slot stopped (2026-10-13 19:41Z-22:21Z: a cron string the dispatcher did not know fell through to the hourly fan-out, fm-hourly-fanout-double). Check in order: (1) GET https://qnfo-fleet-control.q08.workers.dev/health for the live VERSION; (2) the worker cron triggers against wrangler.toml crons and the dispatch list at the top of scheduled() (CRON-DISPATCH-ELIMINATION-1); (3) remediation tick console lines (remediation tick (10m)) in Workers Logs for a budget or D1 error; (4) the second path: scripts/remediation_consumer.py runs every contract when qnfo-cloud-ops dispatches it (PROBE-CADENCE-1). Done: remediation_tick_age_min <= 20 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'AUTONOMY-SELFHEAL-SCORE-1 (migrations/2026-10-13-autonomy-selfheal-score.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'remediation_tick_age_min');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'server_side_close_share_7d', 'Autonomy gap: sessions close more than 10% of issues', 'registry', 'lt', 0.9, 3,
  'Pillar autonomy (NO-CLAUDE-RUNTIME-DEPENDENCY-1: a session builds the fleet, it is never part of it). Read the session closes: SELECT a.id, a.close_channel, t.owner, substr(a.title, 1, 80) FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN (''closed'', ''resolved'') AND a.updated_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 604800) * 1000 AND (a.close_channel LIKE ''session%'' OR t.owner LIKE ''session%''). Group by family: a family a session closes by hand needs a probe that closes it (contracts_unexecutable_open) or a loop that fixes it; give it one. Done: server_side_close_share_7d >= 0.9 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'AUTONOMY-SELFHEAL-SCORE-1 (migrations/2026-10-13-autonomy-selfheal-score.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'server_side_close_share_7d');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01DsmWp2NBtaAp37WP6rUpEP', 'an issue closes on its own only when something acts on it, its probe can decide, and the tick that runs the probe is alive; each is now measured',
  'AUTONOMY-SELFHEAL-SCORE-1: open_issues_without_doer_24h, contracts_unexecutable_open, remediation_tick_age_min, server_side_close_share_7d with triggers; autonomy_selfheal_score headline',
  '2026-10-13 22:35Z: 73 of 117 open issues older than 24 h without a doer; 0 unexecutable probes; tick age 10 min (160 at 22:21Z); server-side close share 0.959 of 557',
  'migration merged', 'metric_registry and analytics_metric_triggers rows; one fleet_tick trigger that writes only metric_registry', 'the Rollback header',
  'a stalled remediation tick, a probe that cannot decide and an issue nobody acts on each file their own lever within the hour',
  'autonomy_selfheal_score holds a value within one tick of apply', 'none', 'agent_issues, code_tasks, work_claims, remediation_contracts, remediation_verifications, issue_triage'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'AUTONOMY-SELFHEAL-SCORE-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:autonomy-selfheal-score');
