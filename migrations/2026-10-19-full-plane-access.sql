-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM capability_ledger WHERE capability IN ('ops-github-issues-projects', 'ops-fleet-graph-docs-feeds', 'dashboard-cost-feed', 'schema-index-refresh'); DELETE FROM failure_modes WHERE fm_key = 'schema-index-stale'; DELETE FROM remediation_contracts WHERE class = 'fm-schema-index-stale'; UPDATE remediation_contracts SET status = 'superseded' WHERE class IN ('issue-100071', 'issue-100072', 'issue-100073'); UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'PLAN-TOPOLOGY-1:%' AND source = 'claude-session:full-plane-access'
-- spof-review: every new read has its second path: github_projects_list falls back from GraphQL to the qnfo-github-steward /portfolio and /roadmap routes; fleet_graph and dashboard_feed read over service bindings whose data also sits in D1 (qnfo-graph fg_* and qnfo-audit, readable by ops_d1_query); cf_docs reads a public site whose pages the existing web_fetch tool also reaches; the schema index keeps its old rows when a plane cannot be read and a session or ops_d1_query can still read sqlite_master directly
--
-- FULL-PLANE-ACCESS-1 (2026-10-19, charter pillar autonomy; also cost and core). Owner directive 2026-10-19: "THE SYSTEM NEEDS
-- TO KNOW MORE ABOUT ITS OWN ARCHITECTURE (SELF REFERENCE) ... THE SYSTEM SHALL HAVE FULL ACCESS TO ALL DASHBOARD FEEDS FOR
-- REMEDIATION AND ENHANCEMENTS/UPGRADES; AS WELL AS FULL ACCESS TO GITHUB ISSUES AND PROJECTS ...; AS WELL AS FULL ACCESS TO
-- CLOUDFLARE SUPPORT/HELP/MODEL DOCUMENTATION."
-- The qnfo-ops audit of 07:40Z had already found the three gaps (agent_issues 100071, 100072, 100073); the same pull request closes
-- them:
--   qnfo-ops 2.50.0            github_issues_list, github_issue_get, github_issue_comment, github_projects_list (Projects v2 by
--                              GraphQL, steward /portfolio + /roadmap fallback), fleet_graph (FLEET-GRAPH-1 over the MEMORY
--                              binding), dashboard_feed (any fleet.qnfo.org /api feed over CH_QNFO_FLEET_DASHBOARD), cf_docs
--                              (developers.cloudflare.com llms.txt, pages, search, Workers AI model catalog); SCHEMA-INDEX-REFRESH-1
--                              rebuilds every d1_schema_index plane older than 23 h on the half-hourly cron (100072);
--   qnfo-fleet-dashboard 1.48.0 GET /api/cost, the cost area's own feed (100071).
-- This file: capability_ledger rows, the failure mode of the stale index with its fm- detector, real closing probes on the three
-- issue contracts (they were born superseded by VACUOUS-PROBE-V3-1), the decision, and PLAN-TOPOLOGY-1, the planner half of the
-- self-reference ask: qnfo-code-orchestrator/worker.js is under another session's live claim (PLAN-UNTRUSTED-RECORD-1) at the
-- time of writing, so it is filed with its code probe and taken when the claim is released.

INSERT OR REPLACE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES
 ('ops-github-issues-projects', 'FULL-PLANE-ACCESS-1, qnfo-ops 2.50.0 (agent_issues 100073)', 'qnfo-ops GITHUB_TOKEN (issues read/write, project read for GraphQL); CH_QNFO_GITHUB_STEWARD service binding for the fallback',
  'new: graded by the issue-100073 contract and ops tool telemetry (ops_ai_log)', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'The ops agent lists and reads GitHub issues with comments, comments on them, and reads every Projects v2 board with item field values (Status, Program, dates), so every portfolio, program and project backlog and roadmap mirrored by qnfo-github-steward is readable in one call; a token refused by GraphQL falls back to the steward''s /portfolio and /roadmap.'),
 ('ops-fleet-graph-docs-feeds', 'FULL-PLANE-ACCESS-1, qnfo-ops 2.50.0', 'MEMORY (qnfo-memory-mcp) and CH_QNFO_FLEET_DASHBOARD service bindings; outbound HTTPS to developers.cloudflare.com',
  'new: graded by ops tool telemetry', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'Self-reference for the remediation agent: fleet_graph answers find, node, impact, path, worker, resource, findings and freshness over the FLEET-GRAPH-1 graph; dashboard_feed reads any fleet.qnfo.org /api feed through the binding (the workers.dev and custom-domain reads from inside the account answer 1042/522); cf_docs reads Cloudflare documentation, support pages and the Workers AI model catalog as Markdown (llms.txt index, keyword search, page, models).'),
 ('dashboard-cost-feed', 'DASHBOARD-COST-FEED-1, qnfo-fleet-dashboard 1.48.0 (agent_issues 100071)', 'qnfo-audit v_cost_run_rate, cost_daily, ai_call_counters, fleet_budget',
  'new: graded by the issue-100071 runner-https contract', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'GET https://fleet.qnfo.org/api/cost: 30-day run-rate by source, 14 days of daily spend, Workers AI calls, errors, tokens, neurons and estimated USD by model and worker over 7 days, every spend budget with headroom; listed in GET /api under area cost.'),
 ('schema-index-refresh', 'SCHEMA-INDEX-REFRESH-1, qnfo-ops 2.50.0 (agent_issues 100072)', 'qnfo-ops D1 bindings to all eight planes (DB_MAP)',
  'new: graded by fm-schema-index-stale', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'd1_schema_index, the column map agents read before writing SQL, is rebuilt from sqlite_master JOIN pragma_table_info for every plane older than 23 h by the qnfo-ops half-hourly cron; ledger cloud_ops_events kind schema-index-refresh.');

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('schema-index-stale', 'd1_schema_index carries column lists weeks old, so agents write SQL against columns that do not exist or miss new ones',
 'Nothing rebuilt the index: no fleet_cron, fleet_task or worker step wrote it after 2026-09-30; it changed only when a session wrote it by hand',
 'qnfo-ops 2.50.0 SCHEMA-INDEX-REFRESH-1 rebuilds each plane older than 23 h on its half-hourly cron (one batch per plane, old rows kept on a read failure)',
 'fm-schema-index-stale: every one of the eight planes has a row refreshed within 1,560 minutes (daily cadence plus the 120-minute SLA)',
 'fm-schema-index-stale', '2026-10-19', 100072,
 'a plane''s MAX(refreshed_at) older than 1,560 minutes', 'agent_issues listed with 12 of 14 columns, living-paper 18 of 49 (2026-10-19 07:40Z)',
 'every agent or loop that reads d1_schema_index before writing SQL (qnfo-ops SCHEMA-FIRST guidance, sessions)');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-schema-index-stale', 100072, 'qnfo-ops 2.50.0 deployed',
 'qnfo-ops SCHEMA-INDEX-REFRESH-1 rebuilds stale planes every half hour; on failure read cloud_ops_events kind schema-index-refresh (meta.failed names the plane and the error)',
 'SELECT ''8'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT db, MAX(refreshed_at) AS m FROM d1_schema_index GROUP BY db) WHERE m >= strftime(''%Y-%m-%d %H:%M:%S'', ''now'', ''-1560 minutes'') AND db IN (''audit'', ''living'', ''graph'', ''portfolio'', ''outreach'', ''cms'', ''ipatent'', ''personal'')) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-ops', 1, 'active', 'failure-mode', datetime('now'));

-- Real closing probes for the three issues (each fails today and passes only once the change is live).
UPDATE remediation_contracts SET
  precondition = 'qnfo-fleet-dashboard 1.48.0 deployed (FULL-PLANE-ACCESS-1)',
  action = 'GET /api/cost answers 200 with schema fleet-cost/v1 (DASHBOARD-COST-FEED-1)',
  verify_probe = '{"url": "https://fleet.qnfo.org/api/cost", "status": 200, "contains": "fleet-cost/v1", "max_ms": 15000}',
  verify_transport = 'runner-https', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), module = 'full-plane-access'
WHERE class = 'issue-100071';
UPDATE remediation_contracts SET
  precondition = 'qnfo-ops 2.50.0 deployed (SCHEMA-INDEX-REFRESH-1)',
  action = 'the qnfo-ops cron has rebuilt every plane: all eight d1_schema_index planes refreshed within 1,560 minutes and a schema-index-refresh ledger row exists',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM (SELECT db, MAX(refreshed_at) AS m FROM d1_schema_index GROUP BY db) WHERE m >= strftime(''%Y-%m-%d %H:%M:%S'', ''now'', ''-1560 minutes'') AND db IN (''audit'', ''living'', ''graph'', ''portfolio'', ''outreach'', ''cms'', ''ipatent'', ''personal'')) = 8 AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''schema-index-refresh'' AND status = ''ok'') THEN ''ok'' ELSE NULL END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), module = 'full-plane-access'
WHERE class = 'issue-100072';
UPDATE remediation_contracts SET
  precondition = 'qnfo-ops 2.50.0 deployed (FULL-PLANE-ACCESS-1)',
  action = 'qnfo-ops /health reports 2.50.0 or later, the version that carries github_issues_list, github_issue_get, github_issue_comment and github_projects_list',
  verify_probe = '{"url": "https://qnfo-ops.q08.workers.dev/health", "status": 200, "min_version": "2.50.0", "max_ms": 15000}',
  verify_transport = 'runner-https', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), module = 'full-plane-access'
WHERE class = 'issue-100073';

-- PLAN-TOPOLOGY-1: the code-loop planner half of the self-reference ask, filed with its doer and probe.
INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'PLAN-TOPOLOGY-1: the code-loop planner sees no fleet topology and refuses issues that name a table instead of a worker',
 'Pillar autonomy. Owner directive 2026-10-19 (self reference). Measured 2026-10-19 on issue_plans since 2026-10-16: 12 of 23 planner decisions were not-code "the issue names no worker the code loop may change", while their text names the tables that locate the code (remediation_verifications, fleet_tick, ai_call_counters, human_actions, code_tasks); qnfo-graph fg_edge already knows which worker writes each (rel writes, confidence EXTRACTED). Change in qnfo-code-orchestrator/worker.js (planIssues): (1) bind GRAPH_DB to qnfo-graph (a1954b92-d681-4d02-b1f6-f9a2eb4c265d) in wrangler.toml; (2) when planWorkers and planMetricOwner find no worker, map the issue''s snake_case keywords to d1t:qnfo-audit.<word>, read EXTRACTED writes edges from fn: sources in scope code, and attribute the issue to the single worker in names that writes them (record the table in the decision); (3) add a TOPOLOGY block to the planner prompt: tables the worker writes and reads, its crons, and the workers that call or bind it, at most 1,500 characters, from fg_edge; the planner answer schema is unchanged. A missing graph or a failed read leaves the planner exactly as it is today. The file was under another session''s live claim (PLAN-UNTRUSTED-RECORD-1) when this was filed; the filing session takes it when the claim is released.
session-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js
code-probe: {"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "PLAN-TOPOLOGY-1"}',
 'claude-session:full-plane-access', 'optimization', 'high', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'PLAN-TOPOLOGY-1:%' AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session_014U1wCXuQhr85SSatUbE7ns (claude, FULL-PLANE-ACCESS-1)',
 'Full access means typed, bounded tools on the paths the fleet already owns, not new credentials: qnfo-ops already holds GITHUB_TOKEN, the MEMORY and dashboard service bindings and every D1 plane, and Cloudflare documentation is public. No owner card is needed: nothing here needs a credential only the owner can mint.',
 'qnfo-ops 2.50.0: seven tools (GitHub issues, comments and Projects v2; fleet graph; dashboard feeds; Cloudflare docs) and the daily schema index rebuild; qnfo-fleet-dashboard 1.48.0: GET /api/cost; real probes on agent_issues 100071-100073; PLAN-TOPOLOGY-1 filed for the planner.',
 'agent_issues 100071/100072/100073 (qnfo-ops audit 07:40Z); issue_plans 2026-10-16..19: 12 of 23 decisions refused for naming no worker; fg_edge resolves the tables those issues name to their writers; d1_schema_index: six planes dated 2026-09-30.',
 'shipped', 'qnfo-ops tool list and cron (new tools and one new cron step; existing tools unchanged; public mode unchanged); qnfo-fleet-dashboard one new read route; qnfo-audit d1_schema_index rows rebuilt per plane',
 'revert the pull request; this file''s Rollback line',
 'remediation agent reads GitHub issues and Projects v2, the fleet graph, every dashboard feed and Cloudflare docs; cost area feed; self-maintaining schema index',
 'issue-100071 and issue-100073 runner-https probes pass within 60 minutes of the canonical deploy; fm-schema-index-stale observes 8 within 60 minutes of the deploy',
 'web_fetch to fleet.qnfo.org and workers.dev from qnfo-ops (1042/522, issue 1190); steward routes only (no issue bodies or comments); a new GitHub App scope (not needed: GITHUB_TOKEN reads issues and Projects); fleet-exec member (binds only AUDIT, cannot read the other planes)');
