-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_fleet_graph
-- Rollback: DROP VIEW IF EXISTS v_cadence_overdue; then run the `sql` of bak_20261019_fleet_graph WHERE kind = 'view' (the view as it was); DELETE FROM cadence_sla WHERE surface = 'fleet-graph'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'fleet_graph_findings_warn'; DELETE FROM metric_registry WHERE metric = 'fleet_graph_findings_warn'; DELETE FROM capability_ledger WHERE capability = 'fleet-graph'; DELETE FROM spof_registry WHERE component = 'fleet-graph build'
-- spof-review: the graph build has two paths that share no trigger: fleet-graph.yml on every push to main (GitHub) and qnfo-cloud-ops FLEET-GRAPH-CADENCE-1, whose 10-minute Cloudflare tick sends repository_dispatch fleet-graph-tick when main has been quiet 60 minutes; the readers (qnfo-memory-mcp) fall back to reading code when fg_state says the graph is stale, and the snapshot in R2 qnfo-backups/fleet-graph/ survives a lost D1
--
-- FLEET-GRAPH-1 (2026-10-19, charter pillar autonomy; also core and cost). Owner request 2026-10-15/19: research and integrate a
-- Graphify-like capability (github.com/Graphify-Labs/graphify) across the fleet to improve efficiency and autonomous code and
-- systems administration, with no proprietary component, no added cost and no vendor lock-in.
-- What shipped in the same pull request:
--   scripts/fleet_graph.mjs        builds the fleet code + live Cloudflare topology graph into qnfo-graph fg_node / fg_edge /
--                                  fg_finding / fg_state (diff writes), a node-link JSON snapshot to R2 qnfo-backups/fleet-graph/,
--                                  and writes fleet_heartbeat('fleet-graph') and metric fleet_graph_findings_warn here;
--   .github/workflows/fleet-graph.yml   runs it on every push to main that changes code (dry run on pull requests);
--   qnfo-cloud-ops 1.32.0          FLEET-GRAPH-CADENCE-1, the second path while main is quiet;
--   qnfo-memory-mcp 2.1.0          MCP tools fleet_graph_* and open read-only GET /fleet-graph/* (find, node, impact, path,
--                                  worker, resource, findings, freshness).
-- This file:
--   cadence_sla 'fleet-graph'      interval 60 minutes, SLA 120 (SLA-120M-7): v_cadence_overdue reads the newest ok heartbeat, so a
--                                  stalled graph is counted by cadence_overdue_over_120m and sla_breaches_over_120m like every producer;
--   metric fleet_graph_findings_warn (runner-written each build) with its trigger: the lever reads the findings and fixes them;
--   capability_ledger 'fleet-graph', spof_registry 'fleet-graph build' (two paths), decision_log (the design decision).

CREATE TABLE IF NOT EXISTS bak_20261019_fleet_graph AS
  SELECT 'view' AS kind, name AS k, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_cadence_overdue';

INSERT OR IGNORE INTO cadence_sla (surface, producer, interval_min, sla_min, schedule, last_output) VALUES
 ('fleet-graph', 'scripts/fleet_graph.mjs (fleet-graph.yml; qnfo-cloud-ops FLEET-GRAPH-CADENCE-1)', 60, 120,
  'every push to main that changes code, and a repository_dispatch from qnfo-cloud-ops when main has been quiet 60 minutes',
  'fleet_heartbeat worker fleet-graph (ok = 1)');

DROP VIEW IF EXISTS v_cadence_overdue;

CREATE VIEW v_cadence_overdue AS
SELECT vco_d.surface, vco_d.producer, strftime('%Y-%m-%dT%H:%M:%SZ', vco_d.lj) AS last_at,
  CAST((julianday('now') - vco_d.lj) * 1440 AS INTEGER) AS age_min, vco_d.interval_min,
  strftime('%Y-%m-%dT%H:%M:%SZ', vco_d.dj) AS due_at,
  CASE WHEN vco_d.dj IS NULL THEN NULL WHEN julianday('now') > vco_d.dj THEN CAST((julianday('now') - vco_d.dj) * 1440 AS INTEGER) ELSE 0 END AS overdue_min,
  vco_d.sla_min,
  CASE WHEN vco_d.dj IS NOT NULL AND (julianday('now') - vco_d.dj) * 1440 > vco_d.sla_min THEN 1 ELSE 0 END AS over_sla
FROM (
  SELECT vco_s.*,
    CASE WHEN vco_s.lj IS NULL THEN NULL
      WHEN vco_s.surface = 'reading.q08.org' THEN julianday(date(vco_s.lj)) + (CASE
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 4 THEN 4 WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 8 THEN 8
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 12 THEN 12 WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 16 THEN 16
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 20 THEN 20 ELSE 28 END) / 24.0
      ELSE vco_s.lj + vco_s.interval_min / 1440.0 END AS dj
  FROM (
    SELECT vco_c.surface, vco_c.producer, vco_c.interval_min, vco_c.sla_min, CASE vco_c.surface
      WHEN 'reading.q08.org' THEN (SELECT julianday(last_refreshed) - CAST(last_value AS REAL) / 24 FROM metric_registry WHERE metric = 'companion_hours_since_last_piece' AND last_value GLOB '[0-9]*')
      WHEN 'q08.org' THEN (SELECT julianday(last_refreshed) - CAST(last_value AS REAL) / 24 FROM metric_registry WHERE metric = 'q08_hours_since_last_piece' AND last_value GLOB '[0-9]*')
      WHEN 'papers.qnfo.org' THEN (SELECT julianday(MAX(published_at)) FROM research_queue WHERE published_at IS NOT NULL)
      WHEN 'ideas.qnfo.org' THEN (SELECT julianday(MAX(created_at)) FROM idea_proposals)
      WHEN 'social' THEN (SELECT julianday(MAX(published_at)) FROM social_media_posts WHERE status = 'published')
      WHEN 'cf-changelog' THEN (SELECT julianday(MAX(ts)) FROM cf_changelog_runs WHERE status IN ('ok', 'partial'))
      WHEN 'continuity-snapshot' THEN (SELECT julianday(MAX(ts)) FROM continuity_snapshots WHERE ok = 1)
      WHEN 'fleet-graph' THEN (SELECT julianday(MAX(ts)) FROM fleet_heartbeat WHERE worker = 'fleet-graph' AND ok = 1)
      END AS lj
    FROM cadence_sla vco_c
  ) vco_s
) vco_d;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('fleet_graph_findings_warn', 'fleet', 'guard',
 'count of warn-severity rows in qnfo-graph.fg_finding after the latest FLEET-GRAPH-1 build: env.X read with no binding, var or secret behind it; a binding wrangler.toml declares that the deployed script lacks; crons that differ between wrangler.toml and the account; a deployed script with no tracked source; a worker directory that is not deployed; SQL (EXTRACTED) against a table the bound database does not have; a trigger cycle',
 'qnfo-graph.fg_finding (scripts/fleet_graph.mjs, fleet-graph.yml); GET https://qnfo-memory-mcp.q08.workers.dev/fleet-graph/findings?severity=warn',
 'measured by the first build', '0', 'qnfo-memory-mcp', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach', 'hourly', '> 0', '> 25', 'NEW', 'runner');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('fleet_graph_findings_warn', 'FLEET-GRAPH-FINDINGS-1: the fleet graph reports warn-level drift or dead references', 'metric_registry', 'gt', 0, 5,
 'Pillar autonomy (FLEET-GRAPH-1). Read GET https://qnfo-memory-mcp.q08.workers.dev/fleet-graph/findings?severity=warn (or SELECT kind, subject, detail FROM fg_finding WHERE severity = ''warn'' on qnfo-graph) and fix each at its cause: env-undeclared -> add the binding, var or secret, or remove the dead read in worker.js; binding-declared-not-live -> redeploy the worker through the canonical path (it installs declared bindings), or remove the declaration; cron-drift -> redeploy through the canonical path (it applies wrangler.toml crons) or correct wrangler.toml; untracked-worker -> add its source directory to the repository or retire it (OWNER-STANDING-GRANT-1, dependency check first: GET /fleet-graph/impact?id=worker:<name>); undeployed-dir -> deploy it by workflow_dispatch workers=<name> or mark the directory RETIRED; sql-table-missing -> fix the query or add the table by migration; trigger-depth with a cycle -> break the cycle by migration. Before each change run GET /fleet-graph/impact on the node to see what depends on it. Definition of done: fleet_graph_findings_warn back to 0 in metric_registry after the next build (a push to main, or within 60 minutes).',
 'qnfo-fleet-control', 'agent_issues', 2, 1, 'FLEET-GRAPH-1 (migrations/2026-10-19-fleet-graph.sql)');

INSERT OR REPLACE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('fleet-graph',
 'FLEET-GRAPH-1 (2026-10-19): scripts/fleet_graph.mjs, .github/workflows/fleet-graph.yml, qnfo-memory-mcp 2.1.0, qnfo-cloud-ops 1.32.0 FLEET-GRAPH-CADENCE-1; open-source parsers acorn (MIT), acorn-walk (MIT), smol-toml (BSD-3), pinned',
 'repository CLOUDFLARE_API_TOKEN (D1 read/write on qnfo-graph and qnfo-audit, Workers scripts read, R2 write qnfo-backups); qnfo-cloud-ops GH_TOKEN for repository_dispatch',
 'new: graded by fleet_heartbeat(fleet-graph) ok and cadence_sla fleet-graph',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'Every agent and loop can ask, in one call, what depends on a worker, function, binding, D1 table, trigger, cron or route (GET /fleet-graph/impact), who reads or writes a table (/fleet-graph/resource), what a worker is bound to and declared vs live (/fleet-graph/worker), and which drift exists (/fleet-graph/findings). Built from 31 worker.js files (acorn AST), wrangler.toml, migrations, workflows and the live account; the offline build of 2026-10-19 gave 5,421 nodes and 22,467 edges in 3.4 s. Portable: node-link JSON in R2, the same schema in SQLite via --sqlite-out.');

INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('fleet-graph build', 'fleet-graph.yml on push to main (GitHub Actions, repository CLOUDFLARE_API_TOKEN)',
 'qnfo-cloud-ops FLEET-GRAPH-CADENCE-1: the 10-minute Cloudflare tick sends repository_dispatch fleet-graph-tick when fleet-graph.yml has not run on main for 60 minutes; readers see fg_state age and fall back to reading code; R2 snapshot fleet-graph/latest.json.gz survives a lost D1',
 NULL, 'FLEET-GRAPH-1 (migrations/2026-10-19-fleet-graph.sql); both paths run the same script, so a defect in scripts/fleet_graph.mjs stops both: the selftest runs first in every build and on every pull request', NULL);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session_01DVYv1hQCz18BeeZPMcPduz (claude, FLEET-GRAPH-1)',
 'A Graphify-style code graph pays off for this fleet only where no existing tool reaches: cross-worker topology (bindings, D1 tables and triggers, crons, routes, queues, secrets by name) joined to the call graph. Graphify itself (Apache-2.0/MIT) parses code well but models none of that, ships 257 releases in six months, and its token-savings figures are self-reported against reading every file.',
 'Built the graph with pinned open-source parsers in CI (no Graphify runtime, no LLM, no paid service), stored it in the existing qnfo-graph D1 with diff writes, served it from the existing qnfo-memory-mcp (no new worker, no new cron: net-zero rule), second path from the existing qnfo-cloud-ops tick.',
 'Offline build on the repository 2026-10-19: 31 workers, 3,805 functions/handlers, 5,789 SQL statements, 367 migrations, 49 workflows; 5,421 nodes and 22,467 edges in 3.4 s. Impact of d1t:qnfo-audit.agent_issues at depth 1: 74 functions across 19 workers.',
 'shipped', 'qnfo-graph D1 (new fg_* tables only; nodes/edges untouched); qnfo-memory-mcp new routes and tools (existing tools unchanged); qnfo-cloud-ops one new tick step; qnfo-audit cadence view, one metric and its trigger',
 'revert the pull request; DROP TABLE fg_node, fg_edge, fg_finding, fg_state on qnfo-graph; this file''s Rollback line for qnfo-audit',
 'blast-radius and drift queries over the whole fleet in one call (find, node, impact, path, worker, resource, findings, freshness)',
 'fleet_graph_findings_warn is measured within 60 minutes of the merge, and fg_state code and live rows are status ok within 60 minutes',
 'existing qnfo-graph KG (nodes/edges: content graph, no code); Graphify CLI (code only, no Cloudflare topology); code-review-graph and codebase-memory-mcp (MIT, code only); GitNexus excluded (PolyForm Noncommercial)');
