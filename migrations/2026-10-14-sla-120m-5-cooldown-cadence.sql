-- SLA-120M-5 (2026-10-14, pillar autonomy), follow-up to SLA-120M-1 and -2 (PRs 1247, 1248). Owner directive, verbatim: "All SLAs
-- systemwide across the fleet shall be measured in 10-minute intervals/resolution, never hours or days. No SLA shall ever exceed 120
-- minutes and action shall commence immediately >120 minutes to audit and remediate all such failure modes and their root causes."
-- Audit 2026-10-14 04:25Z found two response clocks the earlier files left in hours and days:
--   (1) analytics_metric_triggers.cooldown_hours: 167 of 173 triggers wait 3 to 24 hours (148 at 24) before evaluateMetricTriggers
--       files a breach again. After a close on recovery, a relapse sat un-actioned for up to a day. The cap triggers from CYCLE-TIME-1
--       (migrations/2026-10-04-metric-trigger-cooldown-cap.sql) held the column at 24; they now hold it at 2 (120 minutes). The open
--       issue dedupe in evaluateMetricTriggers still stops a second issue for the same breach, so this files no duplicates.
--   (2) remediation_contracts.expected_cadence_h: four active contracts were probed every 6 to 168 hours (EVID-GATE-A2-PUBLISHV2 6,
--       plane-living-paper-fresh 6, attention-loop-1 24, issue-1901 168). Active contracts now run every 2 hours or more often, and a
--       guard trigger keeps them there. Contracts with status holding are the post-closure soak (REMEDIATION-HOLD-1). They verify a
--       closed fix and are not an SLA, so this file leaves them unchanged.
-- Both readers floor at 1 hour (qnfo-fleet-control evaluateMetricTriggers and runRemediationTick, scripts/remediation_consumer.py). 2
-- hours is the coarsest value the columns can hold within the 120-minute limit. Metric sla_definitions_over_120m now also counts a
-- trigger cooldown above 2 h and an active contract cadence above 2 h. Its refresh trigger is recreated with the two extra terms.
-- spof-review: data, two replaced cap triggers, two new guard triggers and one recreated refresh trigger; no cron, worker or credential.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m_5
-- Rollback: UPDATE analytics_metric_triggers SET cooldown_hours = (SELECT b.v FROM bak_20261014_sla_120m_5 b WHERE b.kind = 'trigger' AND b.k = CAST(analytics_metric_triggers.id AS TEXT)) WHERE CAST(id AS TEXT) IN (SELECT k FROM bak_20261014_sla_120m_5 WHERE kind = 'trigger'); UPDATE remediation_contracts SET expected_cadence_h = (SELECT b.v FROM bak_20261014_sla_120m_5 b WHERE b.kind = 'contract' AND b.k = remediation_contracts.class) WHERE class IN (SELECT k FROM bak_20261014_sla_120m_5 WHERE kind = 'contract'); DROP TRIGGER IF EXISTS sla_120_guard_contract_ins; DROP TRIGGER IF EXISTS sla_120_guard_contract_upd; -- then recreate trg_metric_trigger_cooldown_cap_ins/_upd and sla_definitions_120_tick from bak_20261014_sla_120m_5 (kind sql)

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m_5 AS
  SELECT 'trigger' AS kind, CAST(id AS TEXT) AS k, cooldown_hours AS v, NULL AS sql FROM analytics_metric_triggers WHERE cooldown_hours > 2
  UNION ALL SELECT 'contract', class, expected_cadence_h, NULL FROM remediation_contracts WHERE status = 'active' AND expected_cadence_h > 2
  UNION ALL SELECT 'sql', name, NULL, sql FROM sqlite_master WHERE type = 'trigger'
    AND name IN ('trg_metric_trigger_cooldown_cap_ins', 'trg_metric_trigger_cooldown_cap_upd', 'sla_definitions_120_tick');

-- (1) metric trigger cooldowns: at most 2 hours, kept there at the database
UPDATE analytics_metric_triggers SET cooldown_hours = 2 WHERE cooldown_hours > 2 OR cooldown_hours IS NULL;

DROP TRIGGER IF EXISTS trg_metric_trigger_cooldown_cap_ins;
CREATE TRIGGER trg_metric_trigger_cooldown_cap_ins AFTER INSERT ON analytics_metric_triggers
FOR EACH ROW WHEN NEW.cooldown_hours > 2 OR NEW.cooldown_hours IS NULL
BEGIN
  UPDATE analytics_metric_triggers SET cooldown_hours = 2 WHERE id = NEW.id;
END;
DROP TRIGGER IF EXISTS trg_metric_trigger_cooldown_cap_upd;
CREATE TRIGGER trg_metric_trigger_cooldown_cap_upd AFTER UPDATE OF cooldown_hours ON analytics_metric_triggers
FOR EACH ROW WHEN NEW.cooldown_hours > 2 OR NEW.cooldown_hours IS NULL
BEGIN
  UPDATE analytics_metric_triggers SET cooldown_hours = 2 WHERE id = NEW.id;
END;

-- (2) active probe cadences: at most 2 hours; holding (post-closure soak) is left as it is
UPDATE remediation_contracts SET expected_cadence_h = 2, next_due_at = datetime('now')
WHERE status = 'active' AND expected_cadence_h > 2;

CREATE TRIGGER IF NOT EXISTS sla_120_guard_contract_ins AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class;
END;
CREATE TRIGGER IF NOT EXISTS sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class;
END;

-- the definitions guard metric counts both
DROP TRIGGER IF EXISTS sla_definitions_120_tick;
CREATE TRIGGER sla_definitions_120_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM queue_sla WHERE sla_min > 120 OR sla_min % 10 <> 0 OR COALESCE(producer_cycle_min, cycle_min) > sla_min)
      + (SELECT COUNT(*) FROM content_stages WHERE sla_min IS NOT NULL AND (sla_min > 120 OR sla_min % 10 <> 0))
      + (SELECT COUNT(*) FROM sla_registry WHERE NOT (window GLOB '[0-9]*m' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0))
      + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND (cooldown_hours > 2 OR cooldown_hours IS NULL))
      + (SELECT COUNT(*) FROM remediation_contracts WHERE status = 'active' AND expected_cadence_h > 2) AS TEXT)
  WHERE metric = 'sla_definitions_over_120m';
END;

UPDATE metric_registry SET formula = formula || '; plus enabled analytics_metric_triggers with cooldown_hours above 2 and active remediation_contracts with expected_cadence_h above 2 (SLA-120M-5)'
WHERE metric = 'sla_definitions_over_120m' AND instr(formula, 'SLA-120M-5') = 0;

UPDATE analytics_metric_triggers SET action = action || ' SLA-120M-5: SELECT id, metric_key, cooldown_hours FROM analytics_metric_triggers WHERE enabled = 1 AND (cooldown_hours > 2 OR cooldown_hours IS NULL); SELECT class, expected_cadence_h FROM remediation_contracts WHERE status = ''active'' AND expected_cadence_h > 2. The guard triggers normalise both to 2. A row that still reads above 2 means a guard trigger was dropped: restore it from migrations/2026-10-14-sla-120m-5-cooldown-cadence.sql.'
WHERE metric_key = 'sla_definitions_over_120m' AND instr(action, 'SLA-120M-5') = 0;

UPDATE guard_registry SET invariant = 'AFTER INSERT: cooldown_hours above 2 (or NULL) is set to 2 (SLA-120M-5; CYCLE-TIME-1 capped at 24)',
  negative_test = 'Insert analytics_metric_triggers cooldown_hours = 168; expect 2 (1 stays 1)', remediation_hint = 'Choose a cooldown of at most 2h (120 minutes)'
WHERE guard = 'trg_metric_trigger_cooldown_cap_ins';
UPDATE guard_registry SET invariant = 'AFTER UPDATE OF cooldown_hours: a value above 2 (or NULL) is set to 2 (SLA-120M-5; CYCLE-TIME-1 capped at 24)',
  negative_test = 'Set analytics_metric_triggers cooldown_hours = 336; expect 2 (1 stays 1)', remediation_hint = 'Choose a cooldown of at most 2h (120 minutes)'
WHERE guard = 'trg_metric_trigger_cooldown_cap_upd';
INSERT OR IGNORE INTO guard_registry (guard, object_type, target_table, invariant, negative_test, remediation_hint, verified_at, status, db) VALUES
('sla_120_guard_contract_ins', 'trigger', 'remediation_contracts', 'AFTER INSERT: an active contract with expected_cadence_h above 2 is set to 2 (SLA-120M-5)',
 'Insert an active remediation_contracts row with expected_cadence_h = 24; expect 2 (a holding row keeps 24)', 'Probe an active contract at least every 2 hours', NULL, 'unverified', 'qnfo-audit'),
('sla_120_guard_contract_upd', 'trigger', 'remediation_contracts', 'AFTER UPDATE OF expected_cadence_h, status: an active contract above 2 h is set to 2 (SLA-120M-5)',
 'Set an active contract expected_cadence_h = 168, or re-activate a holding row at 24; expect 2', 'Probe an active contract at least every 2 hours', NULL, 'unverified', 'qnfo-audit');

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('response-clock-over-120m',
 'a breach or an active probe waits longer than 120 minutes for its next action because a cooldown or cadence column is in hours',
 'CYCLE-TIME-1 capped metric trigger cooldowns at 24 h and contracts carried cadences of 6 to 168 h; SLA-120M-1 and -2 capped item SLAs only',
 'SLA-120M-5: cooldowns and active cadences at most 2 h, kept by the cap and guard triggers, counted in sla_definitions_over_120m',
 'no enabled metric trigger with cooldown_hours above 2 and no active contract with expected_cadence_h above 2',
 'fm-response-clock-over-120m', '2026-10-14', NULL,
 'a trigger or contract inserted with an hours or days value after a guard trigger is dropped',
 '148 metric triggers on a 24 h cooldown; issue-1901 probed every 168 h',
 'every metric breach after a recovery, every active probe');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-response-clock-over-120m', NULL, 'SLA-120M-5', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND (cooldown_hours > 2 OR cooldown_hours IS NULL)) + (SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND expected_cadence_h > 2) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015EF12jWvz4tFNB2zAHcdYC', 'the time between a breach and the next action on it is an SLA too; the open-issue dedupe, not a long cooldown, stops duplicate issues',
  'SLA-120M-5: metric trigger cooldowns capped at 2 h (cap triggers 24 -> 2), active contract cadences capped at 2 h with guard triggers, both counted in sla_definitions_over_120m, fm-response-clock-over-120m detector',
  'read 2026-10-14 04:25Z: 148 triggers at 24 h, 9 at 12 h, 6 at 6 h, 2 at 3 h; active contracts at 6, 6, 24 and 168 h',
  'migration merged', 'cooldown and cadence columns only; issue filing still dedupes against the open issue of the same title', 'the Rollback header',
  'a metric that breaches again after a recovery is filed within 120 minutes, and no active probe waits more than 2 hours',
  'fm-response-clock-over-120m observes 0 on its first run; sla_definitions_over_120m does not rise within 20 min of apply', 'none',
  'analytics_metric_triggers, remediation_contracts, metric_registry, fleet_tick trigger, qnfo-fleet-control and remediation_consumer.py readers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-5:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:sla-120m-5');
