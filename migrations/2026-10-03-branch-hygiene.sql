-- BRANCH-HYGIENE-1 (2026-10-03, pillar: autonomy). Idempotent.
--
-- The problem. QNFO/qnfo-workers had 215 branches besides main on 2026-10-03: 166 merged (an ancestor of main, or the exact
-- head of a merged pull request), 16 open pull requests, 25 closed unmerged pull requests, 7 pushed branches that never got a
-- pull request, 1 whose tip moved after its merge. delete_branch_on_merge was false and only the code-loop runner deleted its
-- own branches, so every other merge left its branch behind and abandoned work sat in the same list as live work.
--
-- The fix is in qnfo-fleet-control 0.4.110 (branchHygieneTick, hourly): merged branches are deleted; an unmerged branch with no
-- open pull request and no code task in flight is saved as refs/archive/<branch> first, then deleted; GitHub's delete-head-
-- branch-on-merge setting is turned on. Every action is a branch_hygiene_log row (GET /branch-hygiene).
--
-- This migration registers the metric the tick writes and its trigger. repo_branches_open counts branches besides main after
-- the tick. Steady state is the open pull requests plus branches inside their grace period (a dozen or two); the trigger fires
-- above 40, which means the sweeper is failing or is switched off.
--
-- Rollback: DELETE the metric_registry row and the analytics_metric_triggers row (notes = 'BRANCH-HYGIENE-1 2026-10-03');
-- ops_config branch_hygiene_enabled = 'off' stops the tick without a deploy.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('repo_branches_open', 'system', 'lagging', 'count of branches besides main in QNFO/qnfo-workers after the hourly BRANCH-HYGIENE-1 tick (open pull requests + branches inside their grace period); n/a before the first tick', 'qnfo-audit.branch_hygiene_log; GET https://qnfo-fleet-control.q08.workers.dev/branch-hygiene', '215 (2026-10-03: 166 merged, 16 open PRs, 33 abandoned)', '<= 40', 'qnfo-fleet-control', 'its own trigger: read branch_hygiene_log for errors, fix the cause in branchHygieneTick', 'hourly', '> 40', '> 80', 'MEASURED', 'computed');

WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
 ('repo_branches_open', 'Branch hygiene: more than 40 branches besides main in qnfo-workers', 'registry', 'gt', 40, 5, 'Pillar autonomy. The hourly branch sweeper is failing or switched off. Run: SELECT ts, branch, action, why, ok FROM branch_hygiene_log ORDER BY id DESC LIMIT 40, and GET https://qnfo-fleet-control.q08.workers.dev/branch-hygiene (enabled, dry_run, last_tick). Check ops_config branch_hygiene_enabled / branch_hygiene_dry_run, and the errors in the last tick (a token that may not delete refs, the 40-action cap with a larger backlog). Fix the cause in qnfo-fleet-control/worker.js branchHygieneTick; never delete a branch by hand without its refs/archive/<branch> copy.', 'qnfo-fleet-control', 24))
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: repo_branches_open is back at or below 40 in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'BRANCH-HYGIENE-1 2026-10-03'
FROM v WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
