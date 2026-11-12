-- PRODUCT-PERSONAS-1 (2026-11-12, charter pillar autonomy; agent_issues 1001690, GitHub #7389; owner 2026-11-04: "I need to hire virtual agents").
-- One product-owner persona per live product surface (papers, reading, me, fleet dashboard, ask) and a social media coordinator that owns the outreach cadence.
-- Data-driven: persona_registry rows + one view (v_persona_readings) + three deterministic steps appended to fleet_tasks management-personas. No agent request, no model call (cost flat).
-- Each persona has: a loop (the hourly steps), a registered metric persona_<slug>_gap_pct (0 = on target, else percent short of its target), a trigger and a doer (named in the trigger action).
-- Lane: product owners read only fleet metrics; the social coordinator measures the cadence and sends nothing, so outreach consent, suppression and caps stay with qnfo-social.
-- Stop: UPDATE persona_registry SET enabled = 0 WHERE persona_key = '<key>'.
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261112_pp1_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; DROP VIEW v_persona_readings;
-- APPLY-BY: ci
-- REAPPLY-OK: tables and inserts are IF NOT EXISTS / OR IGNORE; the workflow update only matches while the step is absent
-- DB: qnfo-audit
-- BACKUP: bak_20261112_pp1_workflow

CREATE TABLE IF NOT EXISTS bak_20261112_pp1_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

CREATE TABLE IF NOT EXISTS persona_registry (
  persona_key TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  scope TEXT NOT NULL,
  program_code TEXT NOT NULL,
  src_metric TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('ge', 'le')),
  target REAL NOT NULL,
  gap_metric TEXT NOT NULL,
  doer TEXT NOT NULL,
  aim TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS persona_ticks (
  tick TEXT NOT NULL,
  persona_key TEXT NOT NULL,
  value REAL,
  target REAL NOT NULL,
  gap_pct REAL,
  verdict TEXT NOT NULL,
  PRIMARY KEY (tick, persona_key)
);

INSERT OR IGNORE INTO persona_registry (persona_key, role, scope, program_code, src_metric, op, target, gap_metric, doer, aim) VALUES
 ('product-owner:papers', 'product-owner', 'papers', 'QNFO.RSCH', 'publications_30d', 'ge', 2, 'persona_papers_gap_pct', 'qnfo-paper-reviser', 'papers.qnfo.org keeps publishing: papers published in 30 days'),
 ('product-owner:reading', 'product-owner', 'reading', 'QNFO.RSCH', 'engaged_reader_sessions_7d', 'ge', 12, 'persona_reading_gap_pct', 'qnfo-gateway', 'the reading room is read: engaged reader sessions from outside the fleet in 7 days'),
 ('product-owner:me', 'product-owner', 'me', 'QNFO.PERSONAL', 'companion_pieces_published_7d', 'ge', 6, 'persona_me_gap_pct', 'personal-companion', 'me.q08.org has something new for the owner every day: companion pieces in 7 days'),
 ('product-owner:fleet-dashboard', 'product-owner', 'fleet-dashboard', 'QNFO.OPS', 'metrics_unmeasured', 'le', 0, 'persona_dashboard_gap_pct', 'qnfo-fleet-dashboard', 'fleet.qnfo.org shows no blind spots: metrics with no measurement'),
 ('product-owner:ask', 'product-owner', 'ask', 'QNFO.RSCH', 'ask_answers_7d', 'ge', 70, 'persona_ask_gap_pct', 'qnfo-ai-search', 'Ask is used: answers served in 7 days'),
 ('social-media-coordinator', 'channel-coordinator', 'outreach', 'QNFO.REACH', 'social_posts_7d', 'ge', 40, 'persona_social_gap_pct', 'qnfo-social', 'owns the outreach cadence inside the channel caps, consent and suppression rules: posts in 7 days');

DROP VIEW IF EXISTS v_persona_readings;
CREATE VIEW v_persona_readings AS
SELECT p.persona_key, p.role, p.scope, p.program_code, p.src_metric, p.op, p.target, p.gap_metric, p.doer, p.aim,
       CAST(m.last_value AS REAL) AS value,
       CASE WHEN m.last_value IS NULL OR m.last_value = '' THEN NULL
            WHEN p.op = 'ge' THEN MAX(0, ROUND(100.0 * (p.target - CAST(m.last_value AS REAL)) / p.target, 1))
            ELSE MAX(0, ROUND(100.0 * (CAST(m.last_value AS REAL) - p.target) / MAX(p.target, 1), 1)) END AS gap_pct
FROM persona_registry p LEFT JOIN metric_registry m ON m.metric = p.src_metric
WHERE p.enabled = 1;

UPDATE fleet_tasks
SET definition = json_insert(json_insert(json_insert(definition,
      '$.steps[#]', json('{"type":"sql","name":"pp-ticks","db":"AUDIT","sql":"INSERT OR REPLACE INTO persona_ticks (tick, persona_key, value, target, gap_pct, verdict) SELECT strftime(''%Y-%m-%dT%H:00Z'', ''now''), persona_key, value, target, gap_pct, CASE WHEN gap_pct IS NULL THEN ''UNMEASURED'' WHEN gap_pct = 0 THEN ''GREEN'' WHEN gap_pct <= 50 THEN ''AMBER'' ELSE ''RED'' END FROM v_persona_readings"}')),
      '$.steps[#]', json('{"type":"sql","name":"pp-metrics","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT gap_pct FROM v_persona_readings r WHERE r.gap_metric = metric_registry.metric) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (SELECT gap_metric FROM persona_registry) AND (SELECT gap_pct FROM v_persona_readings r WHERE r.gap_metric = metric_registry.metric) IS NOT NULL"}')),
      '$.steps[#]', json('{"type":"sql","name":"pp-briefs","db":"AUDIT","sql":"INSERT OR REPLACE INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) SELECT t.tick, t.persona_key, r.role, r.scope, t.verdict, CASE t.verdict WHEN ''GREEN'' THEN ''hold'' WHEN ''UNMEASURED'' THEN ''measure'' ELSE ''close the gap'' END, r.aim || ''. '' || r.src_metric || '' is '' || COALESCE(t.value, ''unmeasured'') || '' against a target of '' || CASE r.op WHEN ''ge'' THEN ''at least '' ELSE ''at most '' END || t.target || ''. Doer: '' || r.doer || ''. Program: '' || r.program_code || ''.'' FROM persona_ticks t JOIN v_persona_readings r ON r.persona_key = t.persona_key WHERE t.tick = strftime(''%Y-%m-%dT%H:00Z'', ''now'')"}')),
    version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas' AND instr(definition, '"pp-ticks"') = 0;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state) VALUES
 ('persona_papers_gap_pct', 'operational', 'target', 'percent short of the papers product owner target: publications_30d >= 2 (0 = on target)', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'product-owner:papers', 'agent:management-personas', 'hourly', 'PENDING'),
 ('persona_reading_gap_pct', 'operational', 'target', 'percent short of engaged_reader_sessions_7d >= 12 (0 = on target)', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'product-owner:reading', 'agent:management-personas', 'hourly', 'PENDING'),
 ('persona_me_gap_pct', 'operational', 'target', 'percent short of companion_pieces_published_7d >= 6 (0 = on target)', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'product-owner:me', 'agent:management-personas', 'hourly', 'PENDING'),
 ('persona_dashboard_gap_pct', 'operational', 'target', 'percent above metrics_unmeasured <= 0, per unmeasured metric (0 = on target)', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'product-owner:fleet-dashboard', 'agent:management-personas', 'hourly', 'PENDING'),
 ('persona_ask_gap_pct', 'operational', 'target', 'percent short of ask_answers_7d >= 70 (0 = on target)', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'product-owner:ask', 'agent:management-personas', 'hourly', 'PENDING'),
 ('persona_social_gap_pct', 'operational', 'target', 'percent short of social_posts_7d >= 40 (0 = on target); the coordinator measures the cadence, qnfo-social sends within the caps', 'qnfo-audit.v_persona_readings, hourly step pp-metrics', '0 (a breach is a gap above 50)', 'social-media-coordinator', 'agent:management-personas', 'hourly', 'PENDING');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT gap_metric, persona_key || ': ' || aim || ' is more than half short of target', 'registry', 'gt', 50, 5,
  'Pillar autonomy. Persona ' || persona_key || ' (program ' || program_code || ') reads ' || src_metric || '. Doer: ' || doer || '. Find why the number is short and change that worker so it moves; the persona re-measures hourly (persona_ticks).',
  persona_key, 'agent_issues', 24, 1, 'PRODUCT-PERSONAS-1: trigger for persona gap metric'
FROM persona_registry;

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note)
SELECT gap_metric, 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-12: a product persona gap is the product missing its own target; the root cause lies in the doer worker named in the trigger, not in the persona.' FROM persona_registry;

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('product-owner-and-social-coordinator-personas', 'migrations/2026-11-12-product-personas.sql',
  'management-personas hourly workflow; metric_registry source metrics', 'six personas tick hourly into persona_ticks and persona_briefs with no model call', '2026-11-12',
  'v_persona_readings and the pp-ticks, pp-metrics, pp-briefs steps');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'portfolio-manager (PRODUCT-PERSONAS-1)', 'products and the outreach cadence need named owners with their own metric, loop and doer; the five program managers cannot differentiate products',
  'added five product-owner personas and a social media coordinator as persona_registry rows ticked by three deterministic steps', 'agent_issues 1001690 (owner, 2026-11-04)',
  'applied', 'persona tables and three steps of management-personas; no model call, no send', 'Rollback line of migrations/2026-11-12-product-personas.sql',
  'named per-product and per-channel owners with metrics and triggers', 'six persona_ticks rows per hour; manager_agent_requests_24h unchanged', 'node:sqlite replay in migrations/2026-11-12-product-personas.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'portfolio-manager (PRODUCT-PERSONAS-1)');
