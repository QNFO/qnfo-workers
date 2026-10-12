-- TICK-DRIVER-ROSTER-1 (2026-10-12, pillar autonomy and core; agent_issues 2232 TICK-SEQUENCE-LEDGER-1, 2233 BACKLOG-DRIVER-1,
-- 2234 EXECUTOR-ROSTER-1; doctrine revision 5 sections 1, 3, 4 and 24). Three builders revision 5 filed, built in D1 with no
-- new cron, worker change or model call:
--   tick_runs      one row per (hour slot, step) for the eleven steps of section 1. The hourly tick derives each step from
--                  the ledger the loop that does it already writes, over the trailing 65 minutes: reconcile (fleet_tick rows;
--                  reconcile_tick runs on each), pull (code-task.intake events and queue_pulls), dispatch (research done
--                  events, job runs, code_tasks touched), verify (remediation_verifications), compare (the calibration
--                  scorer of 2026-10-12-22 writes this row; ok 0 until it runs), log (decision_log and issue_lifecycle),
--                  report (digest and changelog events), probe (fm- detector verdicts), refresh (metric_registry rows
--                  refreshed), advance (a merged code task, an ok deploy, a goals change or an evolve tick), emit (this
--                  write). A step with no evidence is written with ok 0, so the gap shows. Evidence from ledgers a loop
--                  cannot write without doing the work is a stronger record than a loop reporting on itself.
--                  tick_sequence_completion_24h = hour slots with all eleven steps ok / hour slots due in 24 h.
--   driver         issue_priority_scores holds overrides of the five factors (1-5); v_issue_queue_v2 computes the section 3
--                  function on every read: impact x probability x (capability_gain + reach_gain) x (1 / remediation_cost)
--                  x trust x (1 + direction), with defaults from priority, the last probe verdict, category and the kind of
--                  doer. trust is trust_ledger code-loop:merge for an issue the code loop takes (0.5 otherwise: the kernel
--                  baseline); direction is the newest inferred_direction confidence for the issue's category. Order:
--                  critical first (PRIORITY-QUEUE-1 still holds), then items older than one tick, then score, then id.
--                  queue_pulls records each pull: a code task created for "[issue #N]" and a work claim on an issue, by
--                  AFTER INSERT triggers on code_tasks and work_claims (neither table had a trigger; each insert writes one
--                  ledger row). driver_drain_24h = distinct issues pulled in 24 h / issues eligible (open now or pulled).
--                  v_issue_queue is unchanged; a puller moves to v2 by its own change.
--   roster         v_executor_roster: one row per (capability, executor) from service_registry (live workers and their
--                  capability lists) with health from worker_live_audit (http 200 probed within 24 h), the model routes
--                  from ai_calibration_results (probe model, pass share at least 0.8 over 24 h), and capability_ledger rows
--                  as kind mechanism (health unknown, not counted). roster_members_degraded = executors with healthy 0
--                  (target 0). roster_capabilities_single_executor = named capabilities with exactly one healthy executor
--                  (a section 15 SPOF; target 0). Measured on the live rows on 2026-10-12 with this view's query: 188
--                  roster rows, 38 executors, 159 named capabilities, 150 of them with one healthy executor (a worker
--                  capability is held by one worker) and no degraded member. The trigger floor is the value measured at
--                  apply, so a new single-executor capability files, and the floor is lowered as second paths land.
-- Two follow-ups that need worker code are filed by this file at apply, each with its code-task, code-anchor and code-probe
-- lines: BACKLOG-DRIVER-PULLER-1 (the code loop intake reads v_issue_queue_v2) and WATCHMAKER-TICK-LEDGER-1 (the hourly D1
-- tick in WATCHMAKER_OPS, proven by tick_runs).
-- Refresh: trigger tick_driver_roster_tick on the fleet tick in the first ten minutes of each hour and at apply.
-- No compound SELECT has more than four terms (D1-COMPOUND-LIMIT-1). The trigger writes this file's tables and metric_registry.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS tick_driver_roster_tick; DROP TRIGGER IF EXISTS queue_pulls_code_task_ai; DROP TRIGGER IF EXISTS queue_pulls_work_claim_ai; DROP VIEW IF EXISTS v_issue_queue_v2; DROP VIEW IF EXISTS v_executor_roster; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'TICK-DRIVER-ROSTER-1%'; DELETE FROM metric_registry WHERE source_of_truth LIKE '%TICK-DRIVER-ROSTER-1%' (tick_runs, queue_pulls and issue_priority_scores hold evidence and stay)

CREATE TABLE IF NOT EXISTS tick_runs (
  tick_id TEXT NOT NULL,
  step TEXT NOT NULL,
  ok INTEGER NOT NULL,
  evidence TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tick_id, step)
);

CREATE INDEX IF NOT EXISTS idx_tick_runs_ts ON tick_runs (ts);

CREATE INDEX IF NOT EXISTS idx_remediation_verifications_ts ON remediation_verifications (verified_at);

CREATE TABLE IF NOT EXISTS issue_priority_scores (
  issue_id INTEGER PRIMARY KEY,
  impact INTEGER CHECK (impact BETWEEN 1 AND 5),
  probability INTEGER CHECK (probability BETWEEN 1 AND 5),
  capability_gain INTEGER CHECK (capability_gain BETWEEN 1 AND 5),
  reach_gain INTEGER CHECK (reach_gain BETWEEN 1 AND 5),
  remediation_cost INTEGER CHECK (remediation_cost BETWEEN 1 AND 5),
  scored_by TEXT NOT NULL,
  scored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS queue_pulls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  puller TEXT NOT NULL,
  issue_id INTEGER NOT NULL,
  via TEXT NOT NULL,
  ref TEXT,
  UNIQUE (via, ref)
);

CREATE INDEX IF NOT EXISTS idx_queue_pulls_ts ON queue_pulls (ts);

CREATE VIEW IF NOT EXISTS v_issue_queue_v2 AS
SELECT ROW_NUMBER() OVER (ORDER BY (q.prank = 0) DESC, q.aged DESC, q.score DESC, q.id) AS pos, q.*
FROM (
  SELECT f.*, ROUND(f.impact * f.probability * (f.capability_gain + f.reach_gain) * (1.0 / f.remediation_cost) * f.trust * (1 + f.direction), 3) AS score
  FROM (
    SELECT a.id,
      CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank,
      a.priority, a.title, a.category, a.source, t.owner, t.triage_state,
      CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 1 ELSE 0 END AS has_code_task,
      CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active') THEN 1 ELSE 0 END AS has_contract,
      a.linked_session, a.created_at, a.updated_at,
      CASE WHEN a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000 THEN 1 ELSE 0 END AS aged,
      COALESCE(s.impact, CASE a.priority WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 3 END) AS impact,
      COALESCE(s.probability, CASE (SELECT c.last_verdict FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') ORDER BY c.last_attempt_at DESC LIMIT 1)
                                WHEN 'fail' THEN 5 WHEN 'pass' THEN 2 ELSE 3 END) AS probability,
      COALESCE(s.capability_gain, CASE WHEN lower(COALESCE(a.category, '')) IN ('autonomy', 'automation', 'core', 'pipeline', 'reliability', 'remediation', 'continuous-improvement') THEN 4 ELSE 2 END) AS capability_gain,
      COALESCE(s.reach_gain, CASE WHEN lower(COALESCE(a.category, '')) IN ('reach', 'research', 'quality', 'content-integrity') THEN 4 ELSE 1 END) AS reach_gain,
      COALESCE(s.remediation_cost, CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 2 WHEN instr(COALESCE(a.description, ''), 'session-task:') > 0 THEN 4 ELSE 3 END) AS remediation_cost,
      CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0
           THEN COALESCE((SELECT l.trust_score FROM trust_ledger l WHERE l.surface = 'code-loop' AND l.action_class = 'merge'), 0.5) ELSE 0.5 END AS trust,
      COALESCE((SELECT d.confidence FROM inferred_direction d WHERE d.direction = 'category:' || COALESCE(a.category, 'uncategorised')
                  AND d.day >= date('now', '-7 days') ORDER BY d.day DESC LIMIT 1), 0) AS direction
    FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id LEFT JOIN issue_priority_scores s ON s.issue_id = a.id
    WHERE a.status = 'open'
  ) f
) q;

CREATE TRIGGER IF NOT EXISTS queue_pulls_code_task_ai AFTER INSERT ON code_tasks
WHEN instr(COALESCE(NEW.goal, ''), '[issue #') = 1 AND CAST(substr(NEW.goal, 9) AS INTEGER) > 0
BEGIN
  INSERT OR IGNORE INTO queue_pulls (puller, issue_id, via, ref)
  VALUES ('qnfo-code-orchestrator', CAST(substr(NEW.goal, 9) AS INTEGER), 'code_task', NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS queue_pulls_work_claim_ai AFTER INSERT ON work_claims
WHEN NEW.issue_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO queue_pulls (puller, issue_id, via, ref)
  VALUES (COALESCE(NEW.holder, 'unknown'), NEW.issue_id, 'work_claim', CAST(NEW.id AS TEXT));
END;

INSERT OR IGNORE INTO queue_pulls (ts, puller, issue_id, via, ref)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', replace(substr(created_at, 1, 19), 'T', ' ')), 'qnfo-code-orchestrator', CAST(substr(goal, 9) AS INTEGER), 'code_task', id
FROM code_tasks WHERE instr(COALESCE(goal, ''), '[issue #') = 1 AND CAST(substr(goal, 9) AS INTEGER) > 0
  AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours');

INSERT OR IGNORE INTO queue_pulls (ts, puller, issue_id, via, ref)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', replace(substr(claimed_at, 1, 19), 'T', ' ')), COALESCE(holder, 'unknown'), issue_id, 'work_claim', CAST(id AS TEXT)
FROM work_claims WHERE issue_id IS NOT NULL AND claimed_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours');

CREATE VIEW IF NOT EXISTS v_executor_roster AS
SELECT j.value AS capability, s.service AS executor, 'worker' AS kind,
       CASE WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END AS healthy,
       'worker_live_audit http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never') AS evidence
  FROM service_registry s
  JOIN json_each(CASE WHEN json_valid(COALESCE(s.capabilities, '')) AND substr(trim(s.capabilities), 1, 1) = '[' THEN s.capabilities ELSE '[]' END) j
  LEFT JOIN worker_live_audit w ON w.worker = s.service
  WHERE s.state = 'live'
UNION ALL
SELECT 'worker:' || s.service, s.service, 'worker',
       CASE WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END,
       'no capability list in service_registry; worker_live_audit http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never')
  FROM service_registry s LEFT JOIN worker_live_audit w ON w.worker = s.service
  WHERE s.state = 'live' AND json_array_length(CASE WHEN json_valid(COALESCE(s.capabilities, '')) AND substr(trim(s.capabilities), 1, 1) = '[' THEN s.capabilities ELSE '[]' END) = 0
UNION ALL
SELECT 'ai-model-inference', r.target, 'model',
       CASE WHEN 1.0 * SUM(r.status = 'pass') / COUNT(*) >= 0.8 THEN 1 ELSE 0 END,
       'ai_calibration_results probe model: ' || SUM(r.status = 'pass') || ' pass of ' || COUNT(*) || ' in 24 h'
  FROM ai_calibration_results r
  WHERE r.probe = 'model' AND r.ts > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
  GROUP BY r.target
UNION ALL
SELECT c.capability, c.provenance, 'mechanism', NULL,
       'capability_ledger: ' || COALESCE(c.reliability, '?') || '; last exercised ' || COALESCE(c.last_exercised_at, 'not recorded')
  FROM capability_ledger c;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('tick_sequence_completion_24h', 'operational', 'target', 'hour slots of the last 24 h whose eleven section 1 steps are all ok in tick_runs / hour slots due (24, or the hours since the first tick_runs row if younger)', 'qnfo-audit.tick_runs (TICK-DRIVER-ROSTER-1, migrations/2026-10-12-21-tick-driver-roster.sql)', 'first slot at apply (2026-10-12)', '1.0', 'qnfo-fleet-control', 'trigger lt 0.9', '1h', '< 1', '< 0.5', NULL, NULL, 'MEASURED', 'computed'),
 ('driver_drain_24h', 'operational', 'target', 'distinct issues pulled in 24 h (queue_pulls: a code task created for the issue, or a work claim on it) / issues eligible (open now, or pulled in 24 h)', 'qnfo-audit.queue_pulls, agent_issues (TICK-DRIVER-ROSTER-1)', 'about 0.10 on 2026-10-12 (5 issues with code tasks and 16 with claims in 24 h; 191 open)', '>= 0.5, rising', 'qnfo-fleet-control', 'trigger lt 0.05', '1h', '< 0.25', '< 0.05', NULL, NULL, 'MEASURED', 'computed'),
 ('roster_members_degraded', 'operational', 'target', 'distinct executors in v_executor_roster with healthy = 0: a live worker whose worker_live_audit probe is not http 200 within 24 h, or a model route passing under 80% of its probes in 24 h', 'qnfo-audit.v_executor_roster (TICK-DRIVER-ROSTER-1)', '0 on 2026-10-12 (38 executors: every live worker http 200, every model route passing at least 80%)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('roster_capabilities_single_executor', 'operational', 'target', 'capabilities in v_executor_roster (kinds worker and model) with exactly one healthy executor: a doctrine section 15 single point of failure', 'qnfo-audit.v_executor_roster (TICK-DRIVER-ROSTER-1)', '150 of 159 named capabilities on 2026-10-12 (a worker capability is held by one worker)', '0; trigger floor is the first measured value', 'qnfo-fleet-control', 'trigger gt baseline', '1h', NULL, NULL, NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS tick_driver_roster_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'reconcile', n > 0, n || ' fleet_tick rows in 65 min (reconcile_tick runs on each)'
    FROM (SELECT COUNT(*) AS n FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes'));
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'pull', a + b > 0, a || ' code-task.intake events, ' || b || ' queue_pulls rows in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-code-orchestrator' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes') AND kind LIKE 'code-task.intake%') AS a,
                 (SELECT COUNT(*) FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'dispatch', a + b + c > 0, a || ' executor done events, ' || b || ' job runs, ' || c || ' code tasks touched in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'done' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'job-run' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b,
                 (SELECT COUNT(*) FROM code_tasks WHERE updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS c);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'verify', n > 0, n || ' remediation_verifications rows in 65 min'
    FROM (SELECT COUNT(*) AS n FROM remediation_verifications WHERE verified_at > datetime('now', '-65 minutes'));
  INSERT OR IGNORE INTO tick_runs (tick_id, step, ok, evidence)
    VALUES (strftime('%Y-%m-%dT%H', 'now'), 'compare', 0, 'no calibration scorer row for this slot (CALIBRATION-SCORER-1 writes it)');
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'log', a + b > 0, a || ' decision_log rows, ' || b || ' issue_lifecycle rows in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM decision_log WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM issue_lifecycle WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'report', a + b > 0, a || ' fleet-observability-digest, ' || b || ' changelog-tick events in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'fleet-observability-digest' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'changelog-tick' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'probe', n > 0, n || ' fm- detector verdicts in 65 min'
    FROM (SELECT COUNT(*) AS n FROM remediation_verifications WHERE verified_at > datetime('now', '-65 minutes') AND class >= 'fm-' AND class < 'fm.');
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'refresh', n > 0, n || ' metric_registry rows refreshed in 65 min'
    FROM (SELECT COUNT(*) AS n FROM metric_registry WHERE replace(substr(COALESCE(last_refreshed, ''), 1, 19), 'T', ' ') > datetime('now', '-65 minutes'));
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'advance', a + b + c + d > 0, a || ' code tasks merged, ' || b || ' ok deploys, ' || c || ' goals changed, ' || d || ' evolve ticks in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM code_tasks WHERE merged_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM fleet_deploys WHERE ok = 1 AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b,
                 (SELECT COUNT(*) FROM goals WHERE replace(substr(COALESCE(updated_at, ''), 1, 19), 'T', ' ') > datetime('now', '-65 minutes')) AS c,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'evolve-tick' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS d);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    VALUES (strftime('%Y-%m-%dT%H', 'now'), 'emit', 1, 'tick_runs written from fleet_tick ' || NEW.id || ' (' || NEW.source || ')');

  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * (SELECT COUNT(*) FROM (SELECT tick_id FROM tick_runs WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
                                              GROUP BY tick_id HAVING COUNT(*) = 11 AND SUM(ok) = 11))
             / MIN(24, MAX(1, CAST((julianday('now') - julianday((SELECT MIN(ts) FROM tick_runs))) * 24 AS INTEGER) + 1)), 3)) AS TEXT)
  WHERE metric = 'tick_sequence_completion_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * (SELECT COUNT(DISTINCT issue_id) FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
             / MAX(1, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open'
                         OR id IN (SELECT issue_id FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')))), 3)) AS TEXT)
  WHERE metric = 'driver_drain_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(DISTINCT executor) FROM v_executor_roster WHERE healthy = 0) AS TEXT)
  WHERE metric = 'roster_members_degraded';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM (SELECT capability FROM v_executor_roster WHERE kind IN ('worker', 'model') AND capability NOT LIKE 'worker:%'
                                              GROUP BY capability HAVING SUM(healthy = 1) = 1)) AS TEXT)
  WHERE metric = 'roster_capabilities_single_executor';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', v.op, v.th, 3, v.a, 'qnfo-fleet-control', 'agent_issues', 24, 1, 'TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql)'
FROM (
  SELECT 'tick_sequence_completion_24h' AS k, 'Tick sequence: hours in which a section 1 step left no evidence' AS t, 'lt' AS op, 0.9 AS th,
    'Pillar autonomy (doctrine revision 5 sections 1 and 24). Read SELECT step, SUM(ok = 0) AS missed, MAX(evidence) FROM tick_runs WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY step ORDER BY missed DESC. The step with misses names the loop that left no record in that hour: pull and dispatch are the code loop and the executors, verify and probe the remediation tick and the consumer, compare the calibration scorer, report the digest, refresh the metric tick, advance a merge, deploy, goal change or evolve tick. Restore that loop, or give the step a second producer. Done: tick_sequence_completion_24h >= 0.9 at two refreshes.' AS a
  UNION ALL SELECT 'driver_drain_24h', 'Backlog driver: under 5% of eligible issues were pulled in a day', 'lt', 0.05,
    'Pillar autonomy (doctrine revision 5 sections 3 and 24). Read SELECT puller, via, COUNT(DISTINCT issue_id) FROM queue_pulls WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY 1, 2 and the head of SELECT pos, id, score, has_code_task, title FROM v_issue_queue_v2 LIMIT 20. The levers: issues at the head with no code-task line get one (a code-task: and code-anchor: pair for a one-file change); the code loop''s intake reads v_issue_queue_v2 in pos order; its per-tick intake follows wip_self_tune. Done: driver_drain_24h >= 0.05 at two refreshes, rising toward 0.5.'
  UNION ALL SELECT 'roster_members_degraded', 'Executor roster: a worker or model route is degraded', 'gt', 0,
    'Pillar core (doctrine revision 5 section 4, lookup before escalating). Read SELECT capability, executor, kind, evidence FROM v_executor_roster WHERE healthy = 0. A worker: read its /health and the last fleet_deploys row and redeploy through the canonical path. A model route: the router already falls back per request; remove a route that fails for 24 h from the roster in qnfo-ai or fix its upstream id. Done: roster_members_degraded = 0 at two refreshes.'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT INTO fleet_tick (source) VALUES ('migration:tick-driver-roster');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'roster_capabilities_single_executor', 'Executor roster: a new capability has a single executor', 'registry', 'gt',
  CAST((SELECT last_value FROM metric_registry WHERE metric = 'roster_capabilities_single_executor') AS REAL), 4,
  'Pillar core (doctrine revision 5 sections 4 and 15). The threshold is the count measured when this trigger was created; the target is 0. Read SELECT capability, MAX(executor) FROM v_executor_roster WHERE kind IN (''worker'', ''model'') GROUP BY capability HAVING SUM(healthy = 1) = 1 and compare with spof_registry. A capability on a critical path gets a second executor or a spof_registry row with a tested alternate; lower this threshold by migration as second paths land. Done: the count is at or under the threshold at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'roster_capabilities_single_executor')
  AND (SELECT last_value FROM metric_registry WHERE metric = 'roster_capabilities_single_executor') IS NOT NULL;

-- Two follow-ups need worker code. Each is filed here, at apply, so it cannot be taken before the objects it reads exist,
-- with its code-task and code-anchor lines and a code-probe that closes it when the change is on main.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BACKLOG-DRIVER-PULLER-1: the code loop intake orders by priority and id, not by v_issue_queue_v2',
  'Charter pillar: autonomy (doctrine revision 5 section 3; follow-up of BACKLOG-DRIVER-1, agent_issues 2233). TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql) added v_issue_queue_v2, which orders open issues by the doctrine priority function (critical first, then items older than one tick, then score), and queue_pulls, which records each pull. qnfo-code-orchestrator still takes code-task issues with ORDER BY priority, id. Change: in the intake query that selects open issues whose description carries a code-task line, read the ids in v_issue_queue_v2 order (join agent_issues to v_issue_queue_v2 on id and ORDER BY pos), and keep the present ORDER BY as the fallback when the view cannot be read, so the intake never stops. Critical issues still lead (the view puts them first). Patch VERSION bump; mirror deployed-current.worker.js; a suite check that the intake names v_issue_queue_v2 and keeps the fallback. qnfo-code-orchestrator is a control-plane worker, so a session takes this until CODE-LOOP-CONTROL-PLANE-1 opens it to the loop.' || char(10)
  || 'code-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js' || char(10)
  || 'code-anchor: SELECT id, title, description, source FROM agent_issues WHERE status=''open'' AND description LIKE ''%code-task:%''' || char(10)
  || 'code-probe: {"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "v_issue_queue_v2"}',
  'session_01GMkRMxQsNprwDUX4J9zbji', 'autonomy', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BACKLOG-DRIVER-PULLER-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'WATCHMAKER-TICK-LEDGER-1: the hourly D1 tick ledger is not in WATCHMAKER_OPS',
  'Charter pillar: autonomy (NO-CLAUDE-RUNTIME-DEPENDENCY-1, WATCHMAKER-INDEX-1: a recurring operation is listed with the D1 query that proves it ran). The migrations of 2026-10-12 (2026-10-12-20 to -24) run hourly D1 triggers on the fleet tick; tick_runs gets eleven rows per hour slot from tick_driver_roster_tick, so its newest row proves the hourly D1 tick ran. Change: add one entry to WATCHMAKER_OPS: { key: "tick-sequence-ledger", what: "Hourly D1 tick ledger: the eleven doctrine steps per hour slot (TICK-SEQUENCE-LEDGER-1)", runner: "d1-trigger:tick_driver_roster_tick", cadence_h: 2, sql: "SELECT MAX(ts) AS last FROM tick_runs" }. Patch VERSION bump; mirror deployed-current.worker.js; extend qnfo-fleet-dashboard/watchmaker.test.mjs if it counts the entries.' || char(10)
  || 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10)
  || 'code-anchor: var WATCHMAKER_OPS = [' || char(10)
  || 'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "tick-sequence-ledger"}',
  'session_01GMkRMxQsNprwDUX4J9zbji', 'autonomy', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'WATCHMAKER-TICK-LEDGER-1:%');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('record which of the eleven tick steps left evidence each hour', 'TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql)', 'fleet_tick heartbeat and the ledgers each loop writes', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'tick_runs, metric tick_sequence_completion_24h'),
 ('order the backlog by the doctrine priority function and record pulls', 'TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql)', 'issue_priority_scores, trust_ledger, inferred_direction', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'v_issue_queue_v2, queue_pulls, metric driver_drain_24h'),
 ('look up who can execute a capability and whether it is healthy', 'TICK-DRIVER-ROSTER-1 (migrations/2026-10-12-21-tick-driver-roster.sql)', 'service_registry, worker_live_audit, ai_calibration_results', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'v_executor_roster, metrics roster_members_degraded and roster_capabilities_single_executor');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'a tick step is evidenced by the ledger its loop writes; the priority function can be computed on read from factors the record already holds; the roster is a join of three tables that exist',
  'TICK-DRIVER-ROSTER-1: tick_runs with tick_sequence_completion_24h; issue_priority_scores, v_issue_queue_v2, queue_pulls with driver_drain_24h; v_executor_roster with roster_members_degraded and roster_capabilities_single_executor',
  'read 2026-10-12: no tick_runs, queue_pulls or roster object in sqlite_master; 24 h of code_tasks hold 5 issues and work_claims 16; the roster query reads 188 rows, 38 executors, 150 of 159 capabilities with one healthy executor, none degraded',
  'sections 1, 3 and 4 of revision 5 are measured from the fleet''s own ledgers', 'three tables, two views, three triggers, four metrics; one ledger row per code task and per issue claim',
  'the Rollback line', 'the fleet records its tick sequence, orders its backlog by the doctrine function, records pulls and reads one executor roster',
  'tick_sequence_completion_24h >= 0.5 within 26 h', NULL, 'D1 tables and views, fleet_tick trigger, SQLite test against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'TICK-DRIVER-ROSTER-1:%');
