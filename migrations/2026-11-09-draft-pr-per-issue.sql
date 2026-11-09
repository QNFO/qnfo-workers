-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'issues_without_draft_pr'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'issues_without_draft_pr'; DELETE FROM metric_breach_cause WHERE metric = 'issues_without_draft_pr'; DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_09_DRAFT_PR_PER_ISSUE_1';
-- DRAFT-PR-PER-ISSUE-1 (owner directive 2026-11-09): every open fleet-issue gets a draft PR; qnfo-github-steward 0.18.0 creates them (4 per tick).
-- spof-review: no new cron, binding, host or credential; the steward tick it rides already exists.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('issues_without_draft_pr', 'operational', 'lagging', 'open fleet-issue GitHub issues that no open PR names, after each steward tracker tick', 'qnfo-github-steward tsDraftPrs', '675 on 2026-11-09 (0 open PRs)', '0', 'qnfo-github-steward', 'analytics_metric_triggers issues_without_draft_pr -> agent_issues', '10m', '> 40', '> 300', 'PENDING', 'computed');

INSERT OR IGNORE INTO metric_breach_cause (metric, cause)
VALUES ('issues_without_draft_pr', 'issue-backlog');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('issues_without_draft_pr', 'Open issues without a draft PR', 'registry', 'gt', 40, 2,
 'Pillar autonomy (DRAFT-PR-PER-ISSUE-1). qnfo-github-steward tsDraftPrs creates 4 draft PRs per 10-minute tick, at most 40 steward drafts open. If the metric does not fall, read GET /report errors scoped tracker-draft-prs: a refused branch, commit or pull create means the token lacks contents/pull_requests write, which is an IDENTITY-BOUND token grant; the cap of 40 open steward drafts means the drafts need to be coded and merged first. code-task: repo=qnfo-workers path=qnfo-github-steward/worker.js
code-anchor: async function tsDraftPrs(env, out) {',
 'qnfo-github-steward', 'agent_issues', 2, 1, 'DRAFT-PR-PER-ISSUE-1');

INSERT OR REPLACE INTO ops_config (key, value)
VALUES ('OWNER_DIRECTIVE_2026_11_09_DRAFT_PR_PER_ISSUE_1', 'Verbatim: THE SYSTEM SHALL ALWAYS CREATE A DRAFT PR FOR ALL OPEN ISSUES CREATED. THE SYSTEM SHALL AUTOMATICALLY COORDINATE CANONICAL D1 ISSUES WITH GITHUB ISSUES AND DRAFT PRS, AND SHALL CODE, MERGE, AND CLOSE ISSUE FIXES WITHIN 24 HOURS OF OPENING. Implemented by qnfo-github-steward tsDraftPrs; ops_config draft_pr_per_issue = off stops it.');
