-- INTEGRITY-GUARDS-1 (2026-10-02, pillar: autonomy). Applied live by the session that wrote it; idempotent.
--
-- The problem. METRIC-CLOSED-LOOP-1 grades the fleet on target metrics such as open_agent_issues, and every one of
-- them can improve without the fleet getting better: an issue closed as wontfix lowers the open count exactly as a
-- fixed one does, and a self-heal row marked resolved counts whether or not its probe passes. A loop that optimises
-- a number it can also relabel will, sooner or later, relabel.
--
-- What was measured (qnfo-audit, 2026-10-02 06:55Z):
--   - agent_issues: 64 of 658 issues that reached a terminal status in 7 days were wontfix (9.7%); 333 of 1615 over
--     30 days (20.6%); 418 of 1724 over all time, 233 of them from one producer (kaizen-ai, last 2026-09-06).
--   - remediation_verifications: 158 of 496 rows in 7 days pass (31.9%), but rows repeat per subject. Of 154 subjects
--     (issue_id, else class) 99 pass on their latest probe (64.3%). The per-subject figure is the honest one.
--
-- The fix: two guard metrics, each with a trigger. Both are inside their threshold today, so neither files an issue
-- now; they fire when a target metric starts being bought with relabelling or with unverified fixes.
--   - issue_wontfix_share_7d (target <= 15, trigger > 25) guards open_agent_issues.
--   - remediation_latest_pass_pct_7d (target >= 80, trigger < 50) guards self-heal and issue closure.
-- A gain in a target metric while a guard metric worsens is a regression, not an improvement.
--
-- Not added, and why: a parse-reject rate for evolve_candidates (93 of 116 rejected-parse, but the last row is
-- 2026-09-25 and the code loop that replaced it is already graded by code_task_success_rate_30d).
--
-- Rollback: DELETE the two metric_registry rows and the two analytics_metric_triggers rows (notes =
-- 'INTEGRITY-GUARDS-1 2026-10-02'), and restore fleet_tasks 'metric-refresh' from
-- infra_state.id = 'backup-metric-refresh-20261002-integrity-guards'.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('issue_wontfix_share_7d', 'system', 'guard', '100 * count(agent_issues WHERE status = wontfix) / count(agent_issues in a terminal status: closed, resolved, wontfix, duplicate), over rows last updated in 7 days; n/a with none. Guards open_agent_issues: a backlog that shrinks by relabelling is not fixed', 'qnfo-audit.agent_issues', '9.7 (64 of 658, 2026-10-02; 20.6 over 30 days)', '<= 15', 'qnfo-kaizen', 'its own trigger: wontfix needs a written reason in issue_triage; fix the producer that files unfixable issues', 'hourly', '> 15', '> 25', 'MEASURED', 'computed'),
 ('remediation_latest_pass_pct_7d', 'system', 'guard', '100 * subjects whose latest remediation_verifications row passed / subjects verified in 7 days (subject = issue_id, else class); n/a with none. Guards self_heal and issue closure: a fix counts only when its newest independent probe passes', 'qnfo-audit.remediation_verifications', '64.3 (99 of 154 subjects, 2026-10-02; 31.9 per raw row)', '>= 80', 'qnfo-fleet-control', 'its own trigger: reopen or re-fix the subjects whose latest probe fails', 'hourly', '< 60', '< 50', 'MEASURED', 'computed');

-- One step on fleet_tasks 'metric-refresh' (hourly, fleet-exec) computes both. json_object keeps the SQL unescaped.
UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json_object('type', 'sql', 'db', 'AUDIT', 'sql',
  'UPDATE metric_registry SET last_value = CASE metric WHEN ''issue_wontfix_share_7d'' THEN COALESCE(CAST((SELECT ROUND(100.0 * SUM(status = ''wontfix'') / COUNT(*), 1) FROM agent_issues WHERE status IN (''closed'', ''resolved'', ''wontfix'', ''duplicate'') AND updated_at >= (strftime(''%s'', ''now'') - 7 * 86400) * 1000) AS TEXT), ''n/a'') ELSE COALESCE(CAST((SELECT ROUND(100.0 * SUM(r.pass) / COUNT(*), 1) FROM (SELECT MAX(id) AS mid FROM remediation_verifications WHERE replace(substr(verified_at, 1, 19), ''T'', '' '') >= datetime(''now'', ''-7 days'') GROUP BY COALESCE(CAST(issue_id AS TEXT), class)) g JOIN remediation_verifications r ON r.id = g.mid) AS TEXT), ''n/a'') END, last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (''issue_wontfix_share_7d'', ''remediation_latest_pass_pct_7d'')')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'issue_wontfix_share_7d') = 0;

WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
 ('issue_wontfix_share_7d', 'Integrity gap: more than 25% of issues closed in 7 days were closed as wontfix', 'registry', 'gt', 25, 7, 'Pillar autonomy. The backlog is shrinking by relabelling, not by fixing. Run: SELECT source, COUNT(*) FROM agent_issues WHERE status = ''wontfix'' AND updated_at >= (strftime(''%s'',''now'') - 7*86400)*1000 GROUP BY 1 ORDER BY 2 DESC. For the top source, either fix the producer so it stops filing issues nothing can act on, or reopen the issues that have a real defect behind them. A wontfix closure needs a written reason in issue_triage.close_evidence.', 'qnfo-kaizen', 168),
 ('remediation_latest_pass_pct_7d', 'Integrity gap: under half of remediated subjects pass their latest verification', 'registry', 'lt', 50, 8, 'Pillar autonomy. Fixes are being recorded that their own probes do not confirm. Run: SELECT r.issue_id, r.class, r.expected, r.observed FROM remediation_verifications r JOIN (SELECT MAX(id) mid FROM remediation_verifications WHERE replace(substr(verified_at,1,19),''T'','' '') >= datetime(''now'',''-7 days'') GROUP BY COALESCE(CAST(issue_id AS TEXT), class)) g ON g.mid = r.id WHERE r.pass = 0. Reopen each issue that is closed while its latest probe fails, and re-fix or correct the probe with evidence; never delete a failing verification row.', 'qnfo-fleet-control', 72))
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'INTEGRITY-GUARDS-1 2026-10-02'
FROM v WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
