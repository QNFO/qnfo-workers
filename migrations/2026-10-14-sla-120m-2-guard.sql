-- SLA-120M-2 (2026-10-14, pillar autonomy), the follow-up to SLA-120M-1 (PR 1247, migrations/2026-10-14-sla-120m.sql). Owner directive,
-- verbatim: "All SLAs systemwide across the fleet shall be measured in 10-minute intervals/resolution, never hours or days. No SLA shall
-- ever exceed 120 minutes and action shall commence immediately >120 minutes to audit and remediate all such failure modes and their
-- root causes."
-- SLA-120M-1 capped queue_sla, the stuck views and sla_registry. Four gaps remained (review on PR 1247):
--   (1) content_stages (CONTENT-PIPELINE-1) held SLAs up to 1440 minutes (triage, queued, distribute, correct 1440; revise 720;
--       research, draft, review 360) and its breaches were not in v_sla_over_120m.
--   (2) Nothing kept a later queue_sla or content_stages row at most 120 minutes on the 10-minute grid. Guard triggers now normalise
--       such a value (rounded up to 10, capped at 120) and log it in queue_sla_actions; they never refuse the write.
--   (3) SLA-120M-1 set queue_sla.cycle_min to 10 for every row, so a producer that still runs daily (outreach jobOutreach, once a
--       weekday) reads as a 10-minute producer. producer_cycle_min keeps the measured cadence from bak_20261014_sla_120m; a row whose
--       producer_cycle_min exceeds its sla_min can never meet the SLA, and metric sla_definitions_over_120m counts it as a root cause.
--   (4) v_sla_over_120m now adds content items past their stage SLA and the count of queued code tasks older than 120 minutes (it
--       counted only whether the oldest one was).
-- Metric sla_definitions_over_120m (guard, target 0): SLA definitions above 120 minutes or off the 10-minute grid, plus queues whose
-- producer runs less often than its SLA. Refreshed every fleet tick; its trigger files the audit on the next 10-minute evaluation
-- (qnfo-fleet-control 0.30.0 SLA-TICK-10M-1).
-- spof-review: measurement and normalisation only; the guards write only the row being written and one queue_sla_actions row; the refresh
-- rides fleet_tick, which two producers write (cron:qnfo-code-orchestrator, cron:qnfo-fleet-dashboard).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m_2
-- Rollback: DROP TRIGGER IF EXISTS sla_120_guard_queue_ins; DROP TRIGGER IF EXISTS sla_120_guard_queue_upd; DROP TRIGGER IF EXISTS sla_120_guard_stage_ins; DROP TRIGGER IF EXISTS sla_120_guard_stage_upd; DROP TRIGGER IF EXISTS sla_definitions_120_tick; UPDATE content_stages SET sla_min = (SELECT b.b FROM bak_20261014_sla_120m_2 b WHERE b.kind = 'content_stages' AND b.k = content_stages.stage); UPDATE sla_registry SET window = (SELECT b.text FROM bak_20261014_sla_120m_2 b WHERE b.kind = 'sla_registry' AND b.k = sla_registry.sla_id); DROP VIEW IF EXISTS v_sla_over_120m; -- then recreate it from bak_20261014_sla_120m_2 (kind view); DELETE FROM analytics_metric_triggers WHERE metric_key = 'sla_definitions_over_120m'; DELETE FROM metric_registry WHERE metric = 'sla_definitions_over_120m';

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m_2 AS
  SELECT 'content_stages' AS kind, stage AS k, NULL AS a, sla_min AS b, NULL AS text FROM content_stages
  UNION ALL SELECT 'view', name, NULL, NULL, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_sla_over_120m'
  UNION ALL SELECT 'sla_registry', sla_id, NULL, NULL, window FROM sla_registry;

-- (1) content stages
UPDATE content_stages SET sla_min = MIN(120, ((sla_min + 9) / 10) * 10)
WHERE sla_min IS NOT NULL AND (sla_min > 120 OR sla_min % 10 <> 0);

-- sla_registry windows SLA-120M-1 left as text (15m, immediate, per drain, per call, per close) go on the 10-minute grid
UPDATE sla_registry SET window = CASE
    WHEN window = 'immediate' OR window LIKE 'per %' THEN '10m'
    WHEN window GLOB '[0-9]*m' AND CAST(window AS INTEGER) > 0 THEN MIN(120, ((CAST(window AS INTEGER) + 9) / 10) * 10) || 'm'
    ELSE '120m' END
WHERE NOT (window GLOB '[0-9]*m' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0);

-- (3) the producer's real cadence
ALTER TABLE queue_sla ADD COLUMN producer_cycle_min INTEGER;
UPDATE queue_sla SET producer_cycle_min = COALESCE(
    (SELECT b.a FROM bak_20261014_sla_120m b WHERE b.kind = 'queue_sla' AND b.k = queue_sla.stuck_type), cycle_min)
WHERE producer_cycle_min IS NULL;

-- (2) guards: normalise, never refuse
CREATE TRIGGER IF NOT EXISTS sla_120_guard_queue_ins AFTER INSERT ON queue_sla
WHEN NEW.sla_min IS NOT NULL AND (NEW.sla_min > 120 OR NEW.sla_min % 10 <> 0)
BEGIN
  UPDATE queue_sla SET sla_min = MIN(120, ((NEW.sla_min + 9) / 10) * 10) WHERE stuck_type = NEW.stuck_type;
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES (NEW.stuck_type, 0, 'SLA-120M-2: sla_min ' || NEW.sla_min || ' normalised to ' || MIN(120, ((NEW.sla_min + 9) / 10) * 10) || ' (10-minute grid, at most 120)');
END;
CREATE TRIGGER IF NOT EXISTS sla_120_guard_queue_upd AFTER UPDATE OF sla_min ON queue_sla
WHEN NEW.sla_min IS NOT NULL AND (NEW.sla_min > 120 OR NEW.sla_min % 10 <> 0)
BEGIN
  UPDATE queue_sla SET sla_min = MIN(120, ((NEW.sla_min + 9) / 10) * 10) WHERE stuck_type = NEW.stuck_type;
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES (NEW.stuck_type, 0, 'SLA-120M-2: sla_min ' || NEW.sla_min || ' normalised to ' || MIN(120, ((NEW.sla_min + 9) / 10) * 10) || ' (10-minute grid, at most 120)');
END;
CREATE TRIGGER IF NOT EXISTS sla_120_guard_stage_ins AFTER INSERT ON content_stages
WHEN NEW.sla_min IS NOT NULL AND (NEW.sla_min > 120 OR NEW.sla_min % 10 <> 0)
BEGIN
  UPDATE content_stages SET sla_min = MIN(120, ((NEW.sla_min + 9) / 10) * 10) WHERE stage = NEW.stage;
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES ('content-stage:' || NEW.stage, 0, 'SLA-120M-2: sla_min ' || NEW.sla_min || ' normalised to ' || MIN(120, ((NEW.sla_min + 9) / 10) * 10));
END;
CREATE TRIGGER IF NOT EXISTS sla_120_guard_stage_upd AFTER UPDATE OF sla_min ON content_stages
WHEN NEW.sla_min IS NOT NULL AND (NEW.sla_min > 120 OR NEW.sla_min % 10 <> 0)
BEGIN
  UPDATE content_stages SET sla_min = MIN(120, ((NEW.sla_min + 9) / 10) * 10) WHERE stage = NEW.stage;
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES ('content-stage:' || NEW.stage, 0, 'SLA-120M-2: sla_min ' || NEW.sla_min || ' normalised to ' || MIN(120, ((NEW.sla_min + 9) / 10) * 10));
END;

-- (4) content items and every queued code task past 120 minutes join the breach total
DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT s.*, k.*, i.issues_open_over_120m, i.oldest_open_issue_min, c.content_items_over_sla, q.code_tasks_queued_over_120m,
  i.issues_open_over_120m + s.research_review_error + s.research_head_stalled + s.research_queued_180m + s.intents_pending
    + s.outreach_waiting + s.code_tasks_stalled + s.issues_without_doer_3h + s.zenodo_exit_pending_stalled + s.research_held_over_sla
    + s.triage_gap + s.contracts_cadence_drift + q.code_tasks_queued_over_120m
    + k.predictions_unscored_over_sla + k.doctrine_proposals_waiting + c.content_items_over_sla AS total_over_120m
FROM v_stuck_summary s, v_stuck_summary_kernel k,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) i,
  (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) c,
  (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) q;

-- the definitions guard metric
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('sla_definitions_over_120m', 'operational', 'guard',
  'queue_sla rows with sla_min above 120 or off the 10-minute grid, or whose producer_cycle_min exceeds sla_min (the producer runs less often than the SLA allows); content_stages rows above 120 or off the grid; sla_registry windows other than Nm with N at most 120 on the grid',
  'qnfo-audit.queue_sla, content_stages, sla_registry (SLA-120M-2, migrations/2026-10-14-sla-120m-2-guard.sql)',
  'measured at apply (decision_log SLA-120M-2)', '0 (owner directive 2026-10-14: every SLA at most 120 minutes at 10-minute resolution)',
  'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 0', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS sla_definitions_120_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM queue_sla WHERE sla_min > 120 OR sla_min % 10 <> 0 OR COALESCE(producer_cycle_min, cycle_min) > sla_min)
      + (SELECT COUNT(*) FROM content_stages WHERE sla_min IS NOT NULL AND (sla_min > 120 OR sla_min % 10 <> 0))
      + (SELECT COUNT(*) FROM sla_registry WHERE NOT (window GLOB '[0-9]*m' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0)) AS TEXT)
  WHERE metric = 'sla_definitions_over_120m';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'sla_definitions_over_120m', 'SLA: a definition exceeds 120 minutes, leaves the 10-minute grid, or its producer runs too rarely', 'registry', 'gt', 0, 1,
  'Pillar autonomy (SLA-120M-2, owner directive 2026-10-14). Find it: SELECT stuck_type, sla_min, producer_cycle_min FROM queue_sla WHERE sla_min > 120 OR sla_min % 10 <> 0 OR COALESCE(producer_cycle_min, cycle_min) > sla_min; SELECT stage, sla_min FROM content_stages WHERE sla_min > 120 OR sla_min % 10 <> 0; SELECT sla_id, window FROM sla_registry WHERE NOT (window GLOB ''[0-9]*m'' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0). Root cause for a producer_cycle_min above sla_min: the producer (for outreach-needs-email, qnfo-cloud-ops jobOutreach, once a weekday) must run at least every sla_min minutes; move it to a cron at that cadence, then set producer_cycle_min by migration. Never raise an SLA above 120.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'SLA-120M-2 (migrations/2026-10-14-sla-120m-2-guard.sql); cooldown 2 h = the 120-minute SLA, as SLA-120M-1'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'sla_definitions_over_120m');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_018jgELQUadN7Ybo1B3j77HY', 'a limit that nothing keeps is broken by the next migration; a producer slower than its SLA is the root cause of every breach in that queue',
  'SLA-120M-2: content_stages SLAs to at most 120, guard triggers normalise queue_sla and content_stages SLAs, queue_sla.producer_cycle_min restores the measured cadence, v_sla_over_120m adds content items and every queued code task past 120 minutes, metric sla_definitions_over_120m',
  'content_stages 8 of 10 live stages above 120 (max 1440); queue_sla.cycle_min set to 10 for daily producers by SLA-120M-1; a queued code task 828 minutes old counted as 1',
  'migration merged', 'one view redefined (same columns plus three), four guard triggers, one tick trigger, one column', 'the Rollback header',
  'no SLA definition can exceed 120 minutes or leave the 10-minute grid, and a producer slower than its SLA is reported as the root cause',
  'sla_definitions_over_120m holds a value within one tick of apply; it reads at least 1 until outreach runs every 120 minutes', 'none',
  'content_stages, queue_sla, sla_registry, v_sla_over_120m, metric_registry, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-2:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:sla-120m-2');
