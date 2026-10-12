-- CALIBRATION-SCORER-1 (2026-10-12, pillar autonomy; agent_issues 2251, with 2227 prediction_logged_share_7d and 2226
-- autonomy_rate_7d; doctrine revision 4 section 22, kernel compare_prediction). decision_log has carried predicted_outcome
-- since 2026-10-09 and decision_outcomes has no row: read 2026-10-12, 20 of 38 decisions of 7 days hold a prediction and
-- none is scored, so prediction_miss_rate_7d reads 0.0 by absence. decision_log is append-only (its BEFORE UPDATE trigger
-- aborts), so outcome_matched cannot be set there; outcomes go to decision_outcomes, which v_decision_calibration reads.
--   decision_predictions  one row per checkable claim of a decision: a metric_registry metric, an operator, a value (two for
--                         between), and the time it falls due. Written two ways:
--                         parsed  trigger decision_predictions_parse reads a new decision whose predicted_outcome starts in
--                                 the form "<metric> <op> <number> within <N> h|days" (op one of < <= > >= =), or
--                                 "issue <id> closed within <N> h|days";
--                         seeded  this file transcribes the numeric claims of seven existing free-text predictions
--                                 (decisions 18, 22, 31, 34, 36, 37, 38), each with the metric and bound its text states.
--                                 The deadline is the one the text gives (two hours, two ticks, 14 days); where the text
--                                 names a run or a refresh instead of a time it is read as 2 h (22, 36), 6 h (18) or
--                                 24 h (37, "settles"). Predictions about things that are not a metric_registry metric
--                                 are left to the session that wrote them, as the issue says.
--   scorer                calibration_scorer_tick, hourly on the fleet tick: a prediction past due is scored against the
--                         metric_history value of its due day (the daily snapshot), or metric_registry.last_value when
--                         that day has no snapshot; an issue prediction against agent_issues.status. When every prediction
--                         of a decision is scored, one decision_outcomes row is written by actor calibration-scorer with
--                         matched = 1 only if all matched. A prediction whose metric has no value stays unscored and is
--                         counted by predictions_unscored_over_sla (2026-10-12-23 adds the v_stuck_summary column).
--   tick step             the scorer writes the compare step of tick_runs for its hour slot (TICK-SEQUENCE-LEDGER-1).
--   loop decisions        queue_sla_actions rows are autonomous decisions of the 10-minute tick (park, reject, skip) that
--                         never reached decision_log; trigger decision_log_queue_sla_ai logs each with a prediction in the
--                         parsed form (the stuck metric does not rise within the hour), so the loop's own decisions enter
--                         autonomy_rate_7d and are scored like any other.
-- 2227: every decision since 2026-10-11 carries a prediction (8 of 8); the 18 without one are from 2026-10-08 and 2026-10-09
-- and leave the 7-day window by 2026-10-16. 2226: autonomy_rate_7d is decisions / (decisions + owner cards); loops took
-- decisions without logging them, which the queue_sla trigger starts to correct.
-- Expected at first run, from metric_history: decisions 18 and 22 match; 31, 34, 36 and 37 miss; 38 is due 2026-10-25.
-- prediction_miss_rate_7d then reads about 0.67 and files its breach: the number is real, which is what 2251 asks.
-- No compound SELECT has more than four terms. The triggers write this file's table, decision_outcomes, decision_log, tick_runs and metric_registry.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS calibration_scorer_tick; DROP TRIGGER IF EXISTS decision_predictions_parse; DROP TRIGGER IF EXISTS decision_log_queue_sla_ai; DELETE FROM analytics_metric_triggers WHERE metric_key = 'predictions_unscored_over_sla'; DELETE FROM metric_registry WHERE metric = 'predictions_unscored_over_sla' (decision_predictions and the decision_outcomes rows are evidence and stay)

CREATE TABLE IF NOT EXISTS decision_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('metric', 'issue')),
  subject TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('<', '<=', '>', '>=', '=', 'between', 'closed')),
  value REAL,
  value2 REAL,
  due_at TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('parsed', 'seeded')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  scored_at TEXT,
  observed TEXT,
  matched INTEGER,
  UNIQUE (decision_id, subject, op)
);

CREATE INDEX IF NOT EXISTS idx_decision_predictions_due ON decision_predictions (scored_at, due_at);

-- tick_runs is created by 2026-10-12-21; repeated here so the scorer's write can never meet a missing table.
CREATE TABLE IF NOT EXISTS tick_runs (
  tick_id TEXT NOT NULL,
  step TEXT NOT NULL,
  ok INTEGER NOT NULL,
  evidence TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tick_id, step)
);

CREATE TRIGGER IF NOT EXISTS decision_predictions_parse AFTER INSERT ON decision_log
WHEN instr(COALESCE(NEW.predicted_outcome, ''), ' within ') > 0
BEGIN
  INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
    SELECT NEW.id, 'metric', t.tok1, t.tok2, CAST(t.tok3 AS REAL),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || CAST(t.after AS INTEGER) || CASE WHEN instr(t.after, ' d') > 0 THEN ' days' ELSE ' hours' END), 'parsed'
    FROM (
      SELECT u.tok1, u.tok2,
        CASE WHEN instr(u.rest2, ' ') > 0 THEN substr(u.rest2, 1, instr(u.rest2, ' ') - 1) ELSE u.rest2 END AS tok3, u.after
      FROM (
        SELECT v.tok1,
          CASE WHEN instr(v.rest1, ' ') > 0 THEN substr(v.rest1, 1, instr(v.rest1, ' ') - 1) ELSE v.rest1 END AS tok2,
          CASE WHEN instr(v.rest1, ' ') > 0 THEN ltrim(substr(v.rest1, instr(v.rest1, ' ') + 1)) ELSE '' END AS rest2, v.after
        FROM (
          SELECT substr(w.p, 1, instr(w.p, ' ') - 1) AS tok1, ltrim(substr(w.p, instr(w.p, ' ') + 1)) AS rest1,
            ltrim(substr(w.p, instr(w.p, ' within ') + 8)) AS after
          FROM (SELECT trim(NEW.predicted_outcome) AS p) w
        ) v
      ) u
    ) t
    WHERE t.tok1 IN (SELECT metric FROM metric_registry) AND t.tok2 IN ('<', '<=', '>', '>=', '=')
      AND t.tok3 GLOB '[0-9]*' AND CAST(t.after AS INTEGER) > 0;
  INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
    SELECT NEW.id, 'issue', CAST(CAST(substr(w.p, 7) AS INTEGER) AS TEXT), 'closed', NULL,
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || CAST(w.after AS INTEGER) || CASE WHEN instr(w.after, ' d') > 0 THEN ' days' ELSE ' hours' END), 'parsed'
    FROM (SELECT trim(NEW.predicted_outcome) AS p, ltrim(substr(trim(NEW.predicted_outcome), instr(trim(NEW.predicted_outcome), ' within ') + 8)) AS after) w
    WHERE lower(substr(w.p, 1, 6)) = 'issue ' AND CAST(substr(w.p, 7) AS INTEGER) > 0
      AND instr(lower(w.p), ' closed within ') > 0 AND CAST(w.after AS INTEGER) > 0;
END;

INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, value2, due_at, origin)
SELECT s.d, 'metric', s.m, s.op, s.v, s.v2, s.due, 'seeded'
FROM (
  SELECT 18 AS d, 'continuity_snapshot_age_h' AS m, '<=' AS op, 26 AS v, NULL AS v2, '2026-10-09T15:50:38Z' AS due
  UNION ALL SELECT 22, 'mttr_h_7d', '>', 24, NULL, '2026-10-09T12:17:26Z'
  UNION ALL SELECT 31, 'failure_modes_recurring', '=', 1, NULL, '2026-10-11T10:20:09Z'
  UNION ALL SELECT 34, 'issues_unprobed_60m', '<=', 10, NULL, '2026-10-11T11:14:04Z'
) s
WHERE EXISTS (SELECT 1 FROM decision_log d WHERE d.id = s.d AND TRIM(COALESCE(d.predicted_outcome, '')) <> '');

INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, value2, due_at, origin)
SELECT s.d, 'metric', s.m, s.op, s.v, s.v2, s.due, 'seeded'
FROM (
  SELECT 34 AS d, 'failure_modes_recurring' AS m, '<=' AS op, 2 AS v, NULL AS v2, '2026-10-11T11:14:04Z' AS due
  UNION ALL SELECT 36, 'unverified_blocker_claims', '<', 25, NULL, '2026-10-11T11:31:17Z'
  UNION ALL SELECT 37, 'unverified_blocker_claims', 'between', 15, 30, '2026-10-12T09:37:34Z'
  UNION ALL SELECT 38, 'code_goal_success_rate_30d', '>', 0.49, NULL, '2026-10-25T15:01:06Z'
) s
WHERE EXISTS (SELECT 1 FROM decision_log d WHERE d.id = s.d AND TRIM(COALESCE(d.predicted_outcome, '')) <> '');

-- The decisions the two earlier files of this change logged before the parser existed, in the parsed form they were written in.
INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT d.id, 'metric', 'metrics_on_probation_overdue', '=', 0, strftime('%Y-%m-%dT%H:%M:%SZ', d.ts, '+2 hours'), 'parsed'
FROM decision_log d WHERE d.action LIKE 'KERNEL-REGISTRIES-1:%' AND d.predicted_outcome = 'metrics_on_probation_overdue = 0 within 2 h';

INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT d.id, 'metric', 'tick_sequence_completion_24h', '>=', 0.5, strftime('%Y-%m-%dT%H:%M:%SZ', d.ts, '+26 hours'), 'parsed'
FROM decision_log d WHERE d.action LIKE 'TICK-DRIVER-ROSTER-1:%' AND d.predicted_outcome = 'tick_sequence_completion_24h >= 0.5 within 26 h';

CREATE TRIGGER IF NOT EXISTS decision_log_queue_sla_ai AFTER INSERT ON queue_sla_actions
WHEN NEW.n > 0
BEGIN
  INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
  VALUES ('queue-sla-tick', 'an item past its SLA is fixed by the tick, not left for a person (QUEUE-SLA-1)',
    'queue_sla auto-fix ' || NEW.stuck_type || ' on ' || NEW.n || ' item(s)', 'queue_sla_actions #' || NEW.id || ': ' || COALESCE(NEW.note, ''),
    COALESCE((SELECT auto_fix FROM queue_sla WHERE stuck_type = NEW.stuck_type), 'the fix recorded in queue_sla'),
    NEW.n || ' row(s) of ' || COALESCE((SELECT queue FROM queue_sla WHERE stuck_type = NEW.stuck_type), 'the queue'),
    'the revert text each fixed row carries (its prior status); ops_config queue_sla_autofix = off stops the fixes', NULL,
    'stuck_items_over_sla <= ' || COALESCE((SELECT CAST(CAST(last_value AS INTEGER) AS TEXT) FROM metric_registry WHERE metric = 'stuck_items_over_sla'), '0') || ' within 1 h',
    NULL, 'D1 fleet tick');
END;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('predictions_unscored_over_sla', 'operational', 'target', 'decision_predictions rows more than 120 minutes past due_at with no score (the metric they name has no value, or the scorer did not run)', 'qnfo-audit.decision_predictions (CALIBRATION-SCORER-1, migrations/2026-10-12-22-calibration-scorer.sql)', '0 expected after the first run (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 10', NULL, NULL, 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'predictions_unscored_over_sla', 'Calibration: a prediction is past due and unscored', 'registry', 'gt', 0, 3,
  'Pillar autonomy (doctrine revision 4 section 22, QUEUE-SLA-1). Read SELECT p.id, p.decision_id, p.kind, p.subject, p.op, p.value, p.due_at, (SELECT last_value FROM metric_registry r WHERE r.metric = p.subject) AS now_value FROM decision_predictions p WHERE p.scored_at IS NULL AND p.due_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes''). A row whose metric has no value names a metric with no working refresher (fix the refresher; metrics_on_probation_overdue lists it too). If every row has a value, calibration_scorer_tick did not run: read tick_runs step compare for the last slots. Done: predictions_unscored_over_sla = 0.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'CALIBRATION-SCORER-1 (migrations/2026-10-12-22-calibration-scorer.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'predictions_unscored_over_sla');

CREATE TRIGGER IF NOT EXISTS calibration_scorer_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE decision_predictions SET observed = COALESCE(
      (SELECT CAST(h.value AS TEXT) FROM metric_history h WHERE h.metric = decision_predictions.subject AND h.day = substr(decision_predictions.due_at, 1, 10) AND h.value IS NOT NULL),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN rtrim(trim(r.last_value), '% ') END
         FROM metric_registry r WHERE r.metric = decision_predictions.subject))
  WHERE kind = 'metric' AND scored_at IS NULL AND due_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
  UPDATE decision_predictions SET scored_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    matched = CASE op WHEN '<' THEN CAST(observed AS REAL) < value WHEN '<=' THEN CAST(observed AS REAL) <= value
                      WHEN '>' THEN CAST(observed AS REAL) > value WHEN '>=' THEN CAST(observed AS REAL) >= value
                      WHEN '=' THEN CAST(observed AS REAL) = value
                      WHEN 'between' THEN CAST(observed AS REAL) >= value AND CAST(observed AS REAL) <= value2 END
  WHERE kind = 'metric' AND scored_at IS NULL AND observed IS NOT NULL AND due_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
  UPDATE decision_predictions SET scored_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    observed = (SELECT 'status ' || a.status FROM agent_issues a WHERE a.id = CAST(decision_predictions.subject AS INTEGER)),
    matched = (SELECT a.status IN ('closed', 'resolved') FROM agent_issues a WHERE a.id = CAST(decision_predictions.subject AS INTEGER))
  WHERE kind = 'issue' AND scored_at IS NULL AND due_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = CAST(decision_predictions.subject AS INTEGER));

  INSERT INTO decision_outcomes (decision_id, observed_outcome, matched, evidence, actor)
    SELECT p.decision_id,
      group_concat(p.subject || ' ' || p.op || ' ' || COALESCE(p.value, '') || CASE WHEN p.value2 IS NOT NULL THEN ' and ' || p.value2 ELSE '' END || ': observed ' || p.observed || CASE p.matched WHEN 1 THEN ' (match)' ELSE ' (miss)' END, '; '),
      MIN(p.matched),
      COUNT(*) || ' prediction(s) scored at due time from metric_history (daily snapshot of the due day) or metric_registry.last_value; decision_predictions ids ' || group_concat(p.id, ','),
      'calibration-scorer'
    FROM decision_predictions p
    WHERE NOT EXISTS (SELECT 1 FROM decision_outcomes o WHERE o.decision_id = p.decision_id AND o.actor = 'calibration-scorer')
    GROUP BY p.decision_id
    HAVING SUM(p.scored_at IS NULL OR p.matched IS NULL) = 0;

  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'compare', 1,
      'calibration scorer ran: ' || (SELECT COUNT(*) FROM decision_predictions WHERE scored_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes')) || ' scored now, '
        || (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL) || ' pending, ' || (SELECT COUNT(*) FROM decision_outcomes WHERE actor = 'calibration-scorer') || ' outcomes written in all';

  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS TEXT)
  WHERE metric = 'predictions_unscored_over_sla';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(1.0 - 1.0 * SUM(matched) / COUNT(*), 3) END
      FROM v_decision_calibration WHERE matched IS NOT NULL AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'prediction_miss_rate_7d';
END;

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('score logged predictions against measured outcomes', 'CALIBRATION-SCORER-1 (migrations/2026-10-12-22-calibration-scorer.sql)', 'decision_log predicted_outcome in the parsed form; metric_history; fleet_tick heartbeat', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'decision_predictions, decision_outcomes actor calibration-scorer, metric prediction_miss_rate_7d');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'a prediction that names a metric, a bound and a deadline can be scored by a D1 trigger; decision_log stays append-only, so the verdict lives in decision_outcomes',
  'CALIBRATION-SCORER-1: decision_predictions with a parser on decision_log inserts and seven transcribed predictions, an hourly scorer that writes decision_outcomes, queue_sla auto-fixes logged as decisions with a scorable prediction, metric predictions_unscored_over_sla',
  'read 2026-10-12: decision_outcomes 0 rows; 20 of 38 decisions of 7 days carry a prediction; metric_history holds the due-day values (unverified_blocker_claims 35 on 2026-10-11 and 2026-10-12, issues_unprobed_60m 24, failure_modes_recurring 3, continuity_snapshot_age_h 13.2 and mttr_h_7d 445.5 on 2026-10-09)',
  'prediction_miss_rate_7d is computed from scored predictions', 'one table, three triggers, one metric; one decision_outcomes row per scored decision',
  'the Rollback line', 'the fleet scores its own predictions on the hourly tick and logs the tick''s queue fixes as decisions',
  'predictions_unscored_over_sla = 0 within 2 h', NULL, 'D1 tables, fleet_tick trigger, SQLite test against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'CALIBRATION-SCORER-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:calibration-scorer');
