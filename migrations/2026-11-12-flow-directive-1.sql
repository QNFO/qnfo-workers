-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE notes = 'FLOW-DIRECTIVE-1 2026-11-12'; DELETE FROM metric_breach_cause WHERE metric_key IN ('flow_open_loops', 'flow_unmapped_clocks', 'flow_undeclared_workers', 'brand_site_pageviews_7d'); DELETE FROM metric_registry WHERE metric IN ('flow_open_loops', 'flow_unmapped_clocks', 'flow_undeclared_workers', 'brand_site_pageviews_7d'); DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_11_12_FLOW_DIRECTIVE_1', 'flow_directive_policy'); DROP TABLE IF EXISTS flow_adaptations; DROP TABLE IF EXISTS flow_registry;
-- spof-review: two tables written by personal-companion's hourly FR.flowsTick (it also creates them, so a late migration delays nothing), four
-- metrics and their triggers, two ops_config rows. Measurement plus one knob path: a missed adaptation writes ops_config flow_knob:<knob> = off,
-- which the producer reads before it uses that knob (qnfo-jobsearch reads flow_knob:jobs.outcome_weights). No new cron, binding, host or credential.
-- CAUSE-MAPPED: the four metrics map to the existing cause key `structure` in this same file.
--
-- FLOW-DIRECTIVE-1 (Rowan, 2026-11-12): "How is this information flowing in? And what are we doing with it flowing out? And that applies to any
-- workflow, any. So that needs to be like a standing directive." Every workflow declares typed inflows, outflows and bindings in
-- _shared/flow-registry.js and a feedback path by which its outcomes return as signals. Measured on 2026-11-12 before this change: 9 job
-- applications and 0 outcomes ever recorded (employer mail to the application address reached qnfo-email, never qnfo-jobsearch), and the
-- personal site had no engagement measurement.

CREATE TABLE IF NOT EXISTS flow_registry (id TEXT PRIMARY KEY, scope TEXT NOT NULL, plane TEXT, owner TEXT, clock TEXT, closed INTEGER NOT NULL, gap TEXT, json TEXT NOT NULL, version TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flow_adaptations (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT NOT NULL, knob TEXT NOT NULL, new_hash TEXT NOT NULL, new_json TEXT, metric TEXT NOT NULL, op TEXT NOT NULL, baseline REAL, rollback_value TEXT NOT NULL DEFAULT 'off', created_at TEXT NOT NULL, due_at TEXT NOT NULL, settled_at TEXT, observed REAL, verdict TEXT, UNIQUE(knob, new_hash));
CREATE INDEX IF NOT EXISTS flow_adaptations_due ON flow_adaptations(settled_at, due_at);

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_12_FLOW_DIRECTIVE_1',
  'Every workflow, in every product (Ultrastable, the Qniverse, jobs, outreach, resume, personal, research), declares its inflows, outflows and bindings, and feeds its outcomes back through the signals engine so results change the next outputs. Each flow is a loop and is accounted for in code.',
  'FLOW-DIRECTIVE-1, Rowan 2026-11-12. Registry: _shared/flow-registry.js (CI: _shared/flow-registry.test.mjs). Ultrastable: instances/ultrastable/loop-registry.json, python3 -m foundation flows --check.');
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('flow_directive_policy',
  '{"require":["inflows","outflows","bindings","feedback","clock_or_reason"],"external_outflow_requires_returns":true,"adaptation":{"prediction_required":true,"settle_after_days":30,"recheck_unmeasured_days":14,"max_age_days":90,"on_miss":"rollback via ops_config flow_knob:<knob>"},"targets":{"flow_open_loops":0,"flow_unmapped_clocks":0,"flow_undeclared_workers":0}}',
  'FLOW-DIRECTIVE-1 policy values read by _shared/flow-registry.js and its test');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('flow_open_loops', 'system', 'target', 'Open loops in the flow registry: declared gaps plus any inflow without producer, outflow without consumer or flow on no feedback cycle (FLOW-DIRECTIVE-1)', 'qnfo-audit.flow_registry, written hourly by personal-companion FR.flowsTick', '4 declared gaps on 2026-11-12 (outreach clock, site engagement to content, research-run outcomes, job-market-watch)', '= 0', 'personal-companion', 'analytics_metric_triggers flow_open_loops', '1h', '> 0', '> 8', 'UNMEASURED', 'worker'),
 ('flow_unmapped_clocks', 'system', 'target', 'clock_ticks loops that belong to no declared flow (FLOW-DIRECTIVE-1 runtime check)', 'qnfo-audit.clock_ticks against _shared/flow-registry.js', '0 on 2026-11-12', '= 0', 'personal-companion', 'analytics_metric_triggers flow_unmapped_clocks', '1h', '> 0', '> 3', 'UNMEASURED', 'worker'),
 ('flow_undeclared_workers', 'system', 'target', 'Cron workers with no declared flow yet (UNDECLARED_CRON_WORKERS in _shared/flow-registry.js)', '_shared/flow-registry.js, published hourly by personal-companion', '21 of 33 cron workers on 2026-11-12', '= 0', 'personal-companion', 'analytics_metric_triggers flow_undeclared_workers', '1h', '> 0', '> 25', 'UNMEASURED', 'worker'),
 ('brand_site_pageviews_7d', 'surface', 'target', 'Bot-filtered page loads on rwnq8.github.io in 7 days (Cloudflare Web Analytics site 7d5d89c3, beacon added 2026-11-12)', 'CF GraphQL rumPageloadEventsAdaptiveGroups requestHost rwnq8.github.io bot: 0, qnfo-fleet-dashboard refreshHumanAudience hourly', 'unmeasured before 2026-11-12', 'rising', 'qnfo-fleet-dashboard', 'analytics_metric_triggers brand_site_pageviews_7d', '1h', NULL, NULL, 'UNMEASURED', 'worker');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('flow_open_loops', 'structure', 'FLOW-DIRECTIVE-1: a workflow whose outputs never return as inputs'),
 ('flow_unmapped_clocks', 'structure', 'FLOW-DIRECTIVE-1: a scheduled loop with no declared flow'),
 ('flow_undeclared_workers', 'structure', 'FLOW-DIRECTIVE-1: cron workers still to declare'),
 ('brand_site_pageviews_7d', 'structure', 'FLOW-DIRECTIVE-1: reach of the personal site');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'flow_open_loops', 'FLOW-DIRECTIVE-1: a workflow''s outputs do not come back as inputs', 'registry', 'gt', 0, 3,
  'Pillar autonomy. Read GET https://me.q08.org/api/flows (open_loops, gaps) or SELECT id, gap FROM flow_registry WHERE gap IS NOT NULL OR closed = 0. For each gap build the missing consumer or producer in the worker that owns the flow, then remove the gap from _shared/flow-registry.js in the same PR (the test proves the flow is then on a cycle). Definition of done: flow_open_loops = 0 at a refresh.',
  'personal-companion', 'agent_issues', 24, 1, 'FLOW-DIRECTIVE-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'flow_open_loops' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'flow_unmapped_clocks', 'FLOW-DIRECTIVE-1: a clocked loop has no declared flow', 'registry', 'gt', 0, 3,
  'Pillar autonomy. A loop in clock_ticks (qnfo-cloud-ops CLOCK_LOOPS) is in no flow of _shared/flow-registry.js. Add its flow (inflows, outflows, bindings, feedback, clock) and re-run node _shared/flow-registry.test.mjs. Definition of done: flow_unmapped_clocks = 0.',
  'personal-companion', 'agent_issues', 24, 1, 'FLOW-DIRECTIVE-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'flow_unmapped_clocks' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'flow_undeclared_workers', 'FLOW-DIRECTIVE-1: cron workers without a declared flow', 'registry', 'gt', 0, 5,
  'Pillar autonomy. Take one worker from UNDECLARED_CRON_WORKERS in _shared/flow-registry.js, declare its flow (what it reads, what it writes, which bindings, how its results come back) and remove it from the list; the test fails a list entry that is declared. Definition of done: flow_undeclared_workers = 0.',
  'personal-companion', 'agent_issues', 24, 1, 'FLOW-DIRECTIVE-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'flow_undeclared_workers' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'brand_site_pageviews_7d', 'FLOW-DIRECTIVE-1: no page load measured on rwnq8.github.io in 7 days', 'registry', 'lt', 1, 4,
  'Pillar reach. Zero page loads in 7 days means the Cloudflare Web Analytics beacon (site tag 7d5d89c30e124b20bdae38dec357ee4c) is missing from rwnq8.github.io pages or the read in qnfo-fleet-dashboard refreshHumanAudience failed. Check that index.html and ultrastable/index.html carry the beacon script with token d536b085550b4fcfae919f25bb3e87dd. Definition of done: brand_site_pageviews_7d >= 1.',
  'qnfo-fleet-dashboard', 'agent_issues', 24, 1, 'FLOW-DIRECTIVE-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'brand_site_pageviews_7d' AND enabled = 1);
