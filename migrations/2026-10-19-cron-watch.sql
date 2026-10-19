-- CRON-WATCH-1 (2026-10-19, pillar autonomy). Owner directive 2026-10-19, verbatim: "AUDIT/TRIAGE AND RESOLVE/REMEDIATE
-- HIGHEST-PRIORTITY OPEN FLEET LOOP ISSUES. ACCELERATE ALL SCHEDULED CRON EXECUTION. ALL CRON TICKS SHALL BE MEASURED IN 5-MINUTE
-- INTERVALS, AND NO CRON SHALL EXECUTE LESS THAN ONCE EVERY HOUR. ALL CRON FAILURES/ERRORS SHALL BE TRIAGED AND REMEDIATED
-- AUTOMATICALLY BY THE FLEET."
--
-- WHAT WAS MISSING (qnfo-audit read 2026-10-19 ~10:20Z)
--   Cron failures had several partial watchers and no single loop: v_cron_health shows overdue fleet_crons rows but files nothing;
--   fleet_runs failures (25 on 2026-10-18) produced no issue; a Cloudflare cron that throws leaves no row anywhere (fleet_heartbeat
--   keeps only the latest row per worker, so a failing streak is invisible); a worker that stops firing is noticed only by the
--   daily census. Nothing retried a failed run, nothing counted consecutive failures, nothing handed a repeat failure to the code
--   loop, and no metric measured cron ticks in 5-minute intervals (tick_completion_24h uses 10-minute fleet_tick slots).
--
-- WHAT THIS ADDS (no worker deploy for the loop itself; it runs on fleet-exec, */5)
--   cron_outcomes          heartbeat failure streaks: each ok=0 heartbeat and the first ok=1 after it (triggers on fleet_heartbeat)
--   cron_fault_seen        first/last sighting per fault, so a fault must persist across two runs before it is filed
--   cron_watch_actions     append-only ledger of every issue filed, escalated or retried by this loop
--   v_cron_schedule        every live Cloudflare cron (worker_schedules refreshed within 180 minutes) and every enabled fleet_crons
--                          row with its repeat interval (gap_min) and whether it breaks the rule (slower than hourly, off the grid)
--   v_cron_activity        per Cloudflare worker: the last sign it ran (CRON-GRID-1 cron_fire_log rows, fleet_heartbeat, fleet_runs
--                          for fleet-exec, evolve_runs for qnfo-evolve)
--   v_cron_faults          one row per fault: schedule, worker-error, heartbeat-not-ok, worker-silent (no activity for 2 intervals
--                          plus 5 minutes), task-failed (fleet_runs), task-overdue (v_cron_health), with consecutive failures
--   v_cron_fault_due       faults seen for 9 minutes (schedule faults 90 minutes, the worker_schedules refresh cadence)
--   fleet_tasks cron-watch (fleet_crons cron-watch-5m, */5), steps in order:
--     seen-*      record and clear sightings
--     file        one open agent_issues row per due fault, titled 'CRON-FAULT-1: <fault_key>' (a closed duplicate within 24 h
--                 is reopened by issue_refile_reopen), with evidence, the retry policy and the definition of done
--     probe       the issue's birth contract becomes a d1-query probe on v_cron_faults; the existing contract runners
--                 (qnfo-fleet-control remediationContractsTick, scripts/remediation_consumer.py) close the issue when it passes
--     escalate    at 3 consecutive failures: priority high and, for a worker, a code-task line the code loop picks up
--     retry       a failed fleet task with fewer than 3 failures in a row gets next_fire = now (the worker side retries
--                 itself: CRON-GRID-1 in each worker.js)
--     metrics     cron_faults_open, cron_faults_unticketed, crons_unobserved, tick_completion_5m_24h
--     ledger      one cloud_ops_events row per run
--   trigger cron_watch_exec_silent_tick: fleet-exec is the loop's own runner, so the code orchestrator's fleet_tick files
--                 'CRON-FAULT-1: worker-silent:fleet-exec' when fleet_runs is quiet for 15 minutes (the second path)
--
-- SAFETY
--   Nothing is deleted. Every write is idempotent (NOT EXISTS / OR IGNORE / predicate on current state). An issue closes only
--   on the probe's recorded pass. Stop without a deploy: UPDATE fleet_crons SET enabled = 0 WHERE name = 'cron-watch-5m';
--   ops_config cron_grid_exempt lists workers whose owner override allows sub-5-minute crons.
--
-- Verify after apply:
--   SELECT status, COUNT(*) FROM fleet_runs WHERE task_id = 'cron-watch' GROUP BY 1;     -- ok every 5 minutes
--   SELECT kind, COUNT(*) FROM v_cron_faults GROUP BY 1;  SELECT * FROM cron_watch_actions ORDER BY id DESC LIMIT 20;
--   SELECT metric, last_value, last_refreshed FROM metric_registry WHERE metric LIKE 'cron_%' OR metric = 'tick_completion_5m_24h';
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'cron-watch-5m'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'cron-watch'; DROP TRIGGER IF EXISTS cron_watch_exec_silent_tick; DROP TRIGGER IF EXISTS cron_outcomes_hb_ins; DROP TRIGGER IF EXISTS cron_outcomes_hb_upd; UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key IN ('cron_faults_unticketed', 'crons_unobserved', 'tick_completion_5m_24h')

CREATE INDEX IF NOT EXISTS idx_cron_fire_log_name_ms ON cron_fire_log (cron_name, fired_epoch_ms);
CREATE INDEX IF NOT EXISTS idx_cron_fire_log_source_ms ON cron_fire_log (source, fired_epoch_ms);
CREATE INDEX IF NOT EXISTS idx_fleet_runs_task_status ON fleet_runs (task_id, status, id);

CREATE TABLE IF NOT EXISTS cron_outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, version TEXT, ts TEXT, ok INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_cron_outcomes_worker ON cron_outcomes (worker, id);
-- Each run snapshots v_cron_faults here once (the '#run' row stamps the run), so the later steps read a table, not the view.
CREATE TABLE IF NOT EXISTS cron_fault_seen (fault_key TEXT PRIMARY KEY, kind TEXT, worker TEXT, worker_dir TEXT, detail TEXT, consecutive_fails INTEGER,
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, cleared_at TEXT);
CREATE TABLE IF NOT EXISTS cron_watch_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  action TEXT NOT NULL, fault_key TEXT, issue_id INTEGER, note TEXT);

-- A streak needs history, and fleet_heartbeat keeps one row per worker: record each failed heartbeat and the first good one after it.
CREATE TRIGGER IF NOT EXISTS cron_outcomes_hb_ins AFTER INSERT ON fleet_heartbeat
WHEN NEW.ok = 0 OR COALESCE((SELECT o.ok FROM cron_outcomes o WHERE o.worker = NEW.worker ORDER BY o.id DESC LIMIT 1), 1) = 0
BEGIN
  INSERT INTO cron_outcomes (worker, version, ts, ok) VALUES (NEW.worker, NEW.version, NEW.ts, NEW.ok);
END;
CREATE TRIGGER IF NOT EXISTS cron_outcomes_hb_upd AFTER UPDATE OF ts, ok ON fleet_heartbeat
WHEN NEW.ok = 0 OR COALESCE((SELECT o.ok FROM cron_outcomes o WHERE o.worker = NEW.worker ORDER BY o.id DESC LIMIT 1), 1) = 0
BEGIN
  INSERT INTO cron_outcomes (worker, version, ts, ok) VALUES (NEW.worker, NEW.version, NEW.ts, NEW.ok);
END;

INSERT OR IGNORE INTO ops_config (key, value) VALUES ('cron_grid_exempt', 'qnfo-code-orchestrator');

-- Every live cron with its repeat interval. Fields are split on single spaces (every cron in the fleet is written that way).
CREATE VIEW IF NOT EXISTS v_cron_schedule AS
WITH RECURSIVE src AS (
  SELECT w.name AS worker, 'cf' AS kind, trim(j.value) AS expr
    FROM worker_schedules w, json_each(CASE WHEN json_valid(w.crons_json) THEN w.crons_json ELSE '[]' END) j
   WHERE w.refreshed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes')
  UNION ALL
  SELECT 'fleet-exec:' || c.name, 'fleet_crons', trim(c.cron_expr) FROM fleet_crons c WHERE c.enabled = 1
),
f1 AS (SELECT worker, kind, expr, substr(expr || ' ', 1, instr(expr || ' ', ' ') - 1) AS m, substr(expr || ' ', instr(expr || ' ', ' ') + 1) AS r FROM src),
f2 AS (SELECT worker, kind, expr, m, substr(r, 1, instr(r, ' ') - 1) AS h, substr(r, instr(r, ' ') + 1) AS r FROM f1),
f3 AS (SELECT worker, kind, expr, m, h, substr(r, 1, instr(r, ' ') - 1) AS dom, substr(r, instr(r, ' ') + 1) AS r FROM f2),
f4 AS (SELECT worker, kind, expr, m, h, dom, substr(r, 1, instr(r, ' ') - 1) AS mon, substr(r, instr(r, ' ') + 1) AS r FROM f3),
f5 AS (SELECT worker, kind, expr, m, h, dom, mon, substr(r, 1, instr(r, ' ') - 1) AS dow FROM f4),
parts (worker, expr, part, rest) AS (
  SELECT worker, expr, NULL, m || ',' FROM f5
  UNION ALL
  SELECT worker, expr, substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1) FROM parts WHERE rest <> ''
),
grid AS (
  SELECT worker, expr, MAX(CASE
      WHEN part IS NULL THEN 0
      WHEN part = '*' THEN 1
      WHEN part LIKE '*/%' THEN (CAST(substr(part, 3) AS INTEGER) % 5 <> 0)
      ELSE (CAST(part AS INTEGER) % 5 <> 0) END) AS off
  FROM parts GROUP BY worker, expr
),
g AS (
  SELECT f5.worker, f5.kind, f5.expr,
    CASE
      WHEN dom = '*' AND mon = '*' AND dow = '*' THEN CASE
        WHEN h = '*' THEN CASE
          WHEN m = '*' THEN 1
          WHEN m LIKE '*/%' THEN MAX(1, CAST(substr(m, 3) AS INTEGER))
          WHEN instr(m, ',') > 0 THEN 60 / (length(m) - length(replace(m, ',', '')) + 1)
          ELSE 60 END
        WHEN h LIKE '*/%' THEN 60 * MAX(1, CAST(substr(h, 3) AS INTEGER))
        WHEN instr(h, ',') > 0 THEN 1440 / (length(h) - length(replace(h, ',', '')) + 1)
        ELSE 1440 END
      WHEN dom = '*' AND mon = '*' THEN 10080
      ELSE 44640 END AS gap_min,
    COALESCE(grid.off, 0) AS off
  FROM f5 LEFT JOIN grid ON grid.worker = f5.worker AND grid.expr = f5.expr
)
SELECT worker, kind, expr, gap_min,
  CASE WHEN off = 1 AND instr(',' || COALESCE((SELECT value FROM ops_config WHERE key = 'cron_grid_exempt'), '') || ',', ',' || worker || ',') = 0 THEN 1 ELSE 0 END AS off_grid,
  CASE WHEN gap_min > 60 THEN 1 ELSE 0 END AS too_slow
FROM g;

-- The last sign each Cloudflare cron worker ran. qnfo-ai-calibration heartbeats as ai-health-prober.
CREATE VIEW IF NOT EXISTS v_cron_activity AS
WITH w AS (
  SELECT worker, MIN(gap_min) AS gap_min,
    CASE worker WHEN 'qnfo-ai-calibration' THEN 'ai-health-prober' ELSE worker END AS hb_name
  FROM v_cron_schedule WHERE kind = 'cf' GROUP BY worker
),
a AS (
  SELECT w.worker, w.gap_min, w.hb_name,
    (SELECT MAX(l.fired_epoch_ms) FROM cron_fire_log l WHERE l.source = 'worker:' || w.worker
       AND l.fired_epoch_ms > (CAST(strftime('%s', 'now') AS INTEGER) - 7 * 86400) * 1000) AS grid_ms,
    (SELECT CAST(strftime('%s', substr(h.ts, 1, 19)) AS INTEGER) * 1000 FROM fleet_heartbeat h WHERE h.worker = w.hb_name) AS hb_ms,
    (SELECT h.ok FROM fleet_heartbeat h WHERE h.worker = w.hb_name) AS hb_ok,
    CASE w.worker
      WHEN 'fleet-exec' THEN (SELECT CAST(strftime('%s', substr(MAX(r.started_at), 1, 19)) AS INTEGER) * 1000 FROM fleet_runs r
                               WHERE r.id > (SELECT MAX(id) FROM fleet_runs) - 500)
      WHEN 'qnfo-evolve' THEN (SELECT CAST(strftime('%s', substr(MAX(e.ts), 1, 19)) AS INTEGER) * 1000 FROM evolve_runs e)
    END AS own_ms
  FROM w
)
SELECT worker, gap_min, hb_name, grid_ms, hb_ms, hb_ok, own_ms,
  NULLIF(MAX(COALESCE(grid_ms, 0), COALESCE(hb_ms, 0), COALESCE(own_ms, 0)), 0) AS last_ms
FROM a;

-- D1 accepts at most 5 terms in a compound SELECT, so the worker and fleet-task faults are two views.
CREATE VIEW IF NOT EXISTS v_cron_faults_worker AS
SELECT 'schedule:' || s.worker || '|' || s.expr AS fault_key, 'schedule' AS kind, s.worker AS worker,
  CASE WHEN s.kind = 'cf' THEN s.worker END AS worker_dir,
  'cron "' || s.expr || '" of ' || s.worker || CASE WHEN s.too_slow = 1 THEN ' repeats every ' || s.gap_min || ' min, slower than hourly' ELSE '' END
    || CASE WHEN s.off_grid = 1 THEN ' fires off the 5-minute grid' ELSE '' END AS detail,
  0 AS consecutive_fails
FROM v_cron_schedule s WHERE s.too_slow = 1 OR s.off_grid = 1
UNION ALL
SELECT 'worker-error:' || l.cron_name, 'worker-error', l.task_id, l.task_id,
  'latest run of "' || l.cron_expr || '" failed at ' || l.fired_at || ': ' || substr(COALESCE(l.note, ''), 1, 300),
  (SELECT COUNT(*) FROM cron_fire_log e WHERE e.cron_name = l.cron_name AND e.outcome = 'error'
     AND e.fired_epoch_ms > COALESCE((SELECT MAX(o.fired_epoch_ms) FROM cron_fire_log o WHERE o.cron_name = l.cron_name AND o.outcome IN ('ok', 'idle')), 0))
FROM (SELECT cron_name, MAX(fired_epoch_ms) AS ms FROM cron_fire_log
       WHERE source >= 'worker:' AND source < 'worker;' AND fired_epoch_ms > (CAST(strftime('%s', 'now') AS INTEGER) - 2 * 86400) * 1000 GROUP BY cron_name) t
JOIN cron_fire_log l ON l.cron_name = t.cron_name AND l.fired_epoch_ms = t.ms AND l.source >= 'worker:' AND l.source < 'worker;'
WHERE l.outcome = 'error'
  AND l.id = (SELECT MAX(l2.id) FROM cron_fire_log l2 WHERE l2.cron_name = t.cron_name AND l2.fired_epoch_ms = t.ms)
UNION ALL
SELECT 'heartbeat-not-ok:' || a.worker, 'heartbeat-not-ok', a.worker, a.worker,
  'fleet_heartbeat ' || a.hb_name || ' reads ok=0 at ' || (SELECT h.ts FROM fleet_heartbeat h WHERE h.worker = a.hb_name),
  (SELECT COUNT(*) FROM cron_outcomes o WHERE o.worker = a.hb_name AND o.ok = 0
     AND o.id > COALESCE((SELECT MAX(o2.id) FROM cron_outcomes o2 WHERE o2.worker = a.hb_name AND o2.ok = 1), 0))
FROM v_cron_activity a
WHERE a.hb_ok = 0 AND (a.grid_ms IS NULL OR a.grid_ms < (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000)
UNION ALL
SELECT 'worker-silent:' || a.worker, 'worker-silent', a.worker, CASE WHEN a.worker <> 'fleet-exec' THEN a.worker END,
  'no run recorded since ' || strftime('%Y-%m-%dT%H:%M:%SZ', a.last_ms / 1000, 'unixepoch') || ' while its fastest cron repeats every ' || a.gap_min || ' min',
  CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.last_ms) / 60000) / a.gap_min AS INTEGER)
FROM v_cron_activity a
WHERE a.last_ms IS NOT NULL AND CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.last_ms > (2 * a.gap_min + 5) * 60000;

CREATE VIEW IF NOT EXISTS v_cron_faults_task AS
SELECT 'task-failed:' || f.task_id AS fault_key, 'task-failed' AS kind, 'fleet-exec:' || f.task_id AS worker, NULL AS worker_dir,
  'latest run failed at ' || COALESCE(f.started_at, '?') || ': ' || substr(COALESCE(f.error, ''), 1, 300) AS detail,
  (SELECT COUNT(*) FROM fleet_runs x WHERE x.task_id = f.task_id AND x.status = 'failed'
     AND x.id > COALESCE((SELECT MAX(y.id) FROM fleet_runs y WHERE y.task_id = f.task_id AND y.status = 'ok'), 0)) AS consecutive_fails
FROM (SELECT task_id, MAX(id) AS id FROM fleet_runs WHERE id > (SELECT MAX(id) FROM fleet_runs) - 5000 GROUP BY task_id) r
JOIN fleet_runs f ON f.id = r.id
WHERE f.status = 'failed' AND f.started_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
UNION ALL
SELECT 'task-overdue:' || c.name, 'task-overdue', 'fleet-exec:' || c.name, NULL,
  'next_fire ' || c.next_fire || ' is ' || c.overdue_min || ' min overdue', CAST(c.overdue_min / 5 AS INTEGER)
FROM v_cron_health c WHERE c.overdue_min > 10;

CREATE VIEW IF NOT EXISTS v_cron_faults AS
SELECT * FROM v_cron_faults_worker
UNION ALL
SELECT * FROM v_cron_faults_task;

-- The faults the last cron-watch run saw, and those of them old enough to file. A schedule fault that already has its open
-- CRON-HOURLY-FLOOR-1:<worker> conversion issue (scripts/cron-tempo-allowlist.txt) is not filed a second time.
CREATE VIEW IF NOT EXISTS v_cron_fault_now AS
SELECT fault_key, kind, worker, worker_dir, detail, consecutive_fails, first_seen, last_seen FROM cron_fault_seen
WHERE cleared_at IS NULL AND fault_key <> '#run';
CREATE VIEW IF NOT EXISTS v_cron_fault_due AS
SELECT * FROM v_cron_fault_now
WHERE first_seen <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', CASE WHEN kind = 'schedule' THEN '-90 minutes' ELSE '-9 minutes' END)
  AND NOT (kind = 'schedule' AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = 'open' AND a.title LIKE 'CRON-HOURLY-FLOOR-1:' || v_cron_fault_now.worker || ':%'));

-- The loop's runner is fleet-exec; when fleet-exec stops, the code orchestrator's fleet_tick is the second path that says so.
CREATE TRIGGER IF NOT EXISTS cron_watch_exec_silent_tick AFTER INSERT ON fleet_tick
WHEN NEW.source <> 'cron:fleet-exec'
  AND COALESCE((SELECT MAX(r.started_at) FROM fleet_runs r WHERE r.id > (SELECT MAX(id) FROM fleet_runs) - 200), '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-15 minutes')
  AND NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'CRON-FAULT-1: worker-silent:fleet-exec' AND status = 'open')
BEGIN
  INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
  VALUES ('CRON-FAULT-1: worker-silent:fleet-exec',
    'Charter pillar: autonomy. CRON-WATCH-1: fleet-exec has recorded no fleet_runs row for 15 minutes, so every fleet_crons workflow (cron-watch included) is stopped. Filed by the fleet_tick trigger cron_watch_exec_silent_tick, the second path. Read: SELECT * FROM v_cron_health ORDER BY overdue_min DESC; SELECT * FROM fleet_heartbeat WHERE worker = ''fleet-exec''. Retry policy: Cloudflare fires fleet-exec every 5 minutes; the next fire is the retry.' || char(10) || 'code-task: repo=qnfo-workers path=fleet-exec/worker.js' || char(10) || 'Definition of done: fleet_runs has a row started in the last 15 minutes (the issue contract probes it).',
    'cron-watch', 'reliability', 'critical', 'open', (CAST(strftime('%s', 'now') AS INTEGER) * 1000), (CAST(strftime('%s', 'now') AS INTEGER) * 1000));
  UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN COALESCE((SELECT MAX(r.started_at) FROM fleet_runs r WHERE r.id > (SELECT MAX(id) FROM fleet_runs) - 200), '''') >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-15 minutes'') THEN ''1'' ELSE ''0'' END AS observed',
    verify_transport = 'd1-query', precondition = 'CRON-WATCH-1: fleet-exec wrote no fleet_runs row for 15 minutes', action = 'CRON-WATCH-1 second path (fleet_tick trigger)',
    module = 'cron-watch-v1', status = 'active', expected_cadence_h = 1, next_due_at = datetime('now')
  WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'CRON-FAULT-1: worker-silent:fleet-exec' AND status = 'open');
  INSERT INTO cron_watch_actions (action, fault_key, issue_id, note)
  VALUES ('filed', 'worker-silent:fleet-exec', (SELECT MAX(id) FROM agent_issues WHERE title = 'CRON-FAULT-1: worker-silent:fleet-exec' AND status = 'open'), 'second path: fleet_tick trigger');
END;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('cron_faults_open', 'operational', 'lagging',
   'cron faults present now (v_cron_faults: schedule, worker-error, heartbeat-not-ok, worker-silent, task-failed, task-overdue). Exempt from a trigger: each fault files its own CRON-FAULT-1 issue with a probe; cron_faults_unticketed guards that',
   'qnfo-audit.v_cron_faults (CRON-WATCH-1), written every 5 minutes by fleet_tasks cron-watch', '0', 'qnfo-fleet-control', 'agent:cron-watch', '5m', 'MEASURED', NULL, NULL),
  ('cron_faults_unticketed', 'operational', 'guard',
   'cron faults past their debounce (v_cron_fault_due) with no open CRON-FAULT-1 issue after the file step ran',
   'qnfo-audit.v_cron_fault_due + agent_issues (CRON-WATCH-1), written every 5 minutes by fleet_tasks cron-watch', '0', 'qnfo-fleet-control', 'agent:cron-watch', '5m', 'MEASURED', NULL, NULL),
  ('crons_unobserved', 'operational', 'guard',
   'Cloudflare workers with a live cron and no record of a run: no CRON-GRID-1 cron_fire_log row in 7 days, no fleet_heartbeat row and no run table (v_cron_activity last_ms NULL), so neither a failure nor silence can be seen',
   'qnfo-audit.v_cron_activity (CRON-WATCH-1), written every 5 minutes by fleet_tasks cron-watch', '0', 'qnfo-fleet-control', 'agent:cron-watch', '5m', 'MEASURED', NULL, NULL),
  ('tick_completion_5m_24h', 'operational', 'lagging',
   '100 * distinct five-minute slots with a fleet_crons fire (cron_fire_log source trigger:fleet_crons) / five-minute slots elapsed, over the last 24 h or since the first tick-probe-5m fire (owner directive 2026-10-19: cron ticks measured in 5-minute intervals)',
   'qnfo-audit.cron_fire_log (CRON-WATCH-1), written every 5 minutes by fleet_tasks cron-watch', '100', 'qnfo-fleet-control', 'agent:cron-watch', '5m', 'MEASURED', NULL, NULL);

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('cron_faults_unticketed', 'Cron faults are not reaching an issue, so nobody remediates them',
   'gt', 0, 2,
   'Pillar autonomy (CRON-WATCH-1). Read SELECT f.* FROM v_cron_fault_due f WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = ''CRON-FAULT-1: '' || f.fault_key AND a.status = ''open''); then SELECT status, error FROM fleet_runs WHERE task_id = ''cron-watch'' ORDER BY id DESC LIMIT 5. A failed file step names the cause in its error (an agent_issues guard trigger refusing the row is the usual one): fix the insert in a migration. Definition of done: cron_faults_unticketed reads 0.',
   'qnfo-fleet-control', 'agent_issues', 1, 1, 'CRON-WATCH-1 guard: a cron fault with no issue is a silent drop'),
  ('crons_unobserved', 'A cron worker leaves no record of its runs, so its failures cannot be seen',
   'gt', 0, 4,
   'Pillar autonomy (CRON-WATCH-1). Read SELECT * FROM v_cron_activity WHERE last_ms IS NULL. Give the worker a record: wrap its scheduled handler in the CRON-GRID-1 helper (q08-signal-engine/worker.js has the block; it writes cron_fire_log rows with outcome ok/error/idle) or write fleet_heartbeat on each run. Definition of done: crons_unobserved reads 0.',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'CRON-WATCH-1 guard: an unobserved cron can fail forever unseen'),
  ('tick_completion_5m_24h', 'Five-minute cron ticks are missing: fleet-exec skipped slots in the last 24 h',
   'lt', 95, 3,
   'Pillar core (CRON-WATCH-1). Read SELECT fired_at FROM cron_fire_log WHERE cron_name = ''tick-probe-5m'' ORDER BY id DESC LIMIT 50 and look for gaps over 5 minutes; then SELECT * FROM v_cron_faults WHERE worker LIKE ''fleet-exec%''. fleet-exec fires every 5 minutes on Cloudflare; a gap is a failed or slow invocation (fleet_runs error, CPU limit) or a dispatcher that marks a row fired without running it. Definition of done: tick_completion_5m_24h reads 95 or more.',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'CRON-WATCH-1: the owner directive measures cron ticks in 5-minute intervals');

INSERT OR IGNORE INTO sla_registry (sla_id, class, metric, threshold, window, owner, enforcement, breach_action, autofix, enabled)
VALUES ('SLA-CRON-FAULT-10M', 'cron', 'a cron fault (v_cron_faults) reaches an open CRON-FAULT-1 issue with a probe (schedule faults: 90 minutes, the worker_schedules refresh cadence)', '0', '10m',
  'qnfo-fleet-control', 'v_cron_fault_due + metric cron_faults_unticketed', 'metric trigger cron_faults_unticketed files the issue; cron-watch retries failed fleet tasks and escalates repeat failures to the code loop', 1, 1);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES ('cron-fault-untriaged', 'a cron run that fails, or a cron that stops firing, files no issue and is never retried',
  'cron failures were spread over partial watchers (v_cron_health, the daily census, fleet_heartbeat with one row per worker) and none filed, retried or escalated',
  'CRON-WATCH-1: v_cron_faults, fleet_tasks cron-watch every 5 minutes (issue, probe, retry, code-loop escalation at 3 failures), CRON-GRID-1 run records in each worker',
  'no cron fault past its debounce lacks an open CRON-FAULT-1 issue', 'fm-cron-fault-untriaged', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'v_cron_fault_due has a row with no open CRON-FAULT-1 issue', 'a cron is red or silent for longer than its interval and the issue queue does not show it',
  'every loop that runs on a cron');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-cron-fault-untriaged', NULL, 'CRON-WATCH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_cron_fault_due f WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = ''CRON-FAULT-1: '' || f.fault_key AND a.status = ''open'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

-- SPOF-REVIEW-GATE-1: the scheduled workers' triggers and the new fleet_heartbeat / fleet_tick triggers, with their second paths.
INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence)
VALUES ('cron execution of the scheduled workers (CRON-GRID-1 triggers)', 'each worker''s own Cloudflare cron trigger, hourly or faster on the 5-minute grid; a daily or weekly job runs on the first grid fire after its slot',
  'the same worker retries a failed job on its next fires (CRON-GRID-1, up to 3 in a row); CRON-WATCH-1 (fleet-exec, every 5 minutes) files a silent, failing or overdue cron with a probe and hands a third failure to the code loop',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'migrations/2026-10-19-cron-watch.sql, migrations/cron-watch.test.mjs, scripts/cron-grid.test.mjs'),
  ('CRON-WATCH-1 runner (fleet-exec)', 'fleet-exec */5 runs fleet_tasks cron-watch',
  'the fleet_tick trigger cron_watch_exec_silent_tick, fed by qnfo-code-orchestrator and the dashboard fallback producer, files fleet-exec silence after 15 minutes; the cron_outcomes triggers only append a ledger row and cannot block a heartbeat write (no RAISE)',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'migrations/2026-10-19-cron-watch.sql, migrations/cron-watch.test.mjs');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('cron-fault-self-remediation', 'migrations/2026-10-19-cron-watch.sql (CRON-WATCH-1) and the CRON-GRID-1 helper in each scheduled worker',
  'fleet-exec workflow cron, both remediation contract runners, the code loop issue intake (ISSUE-INTAKE-1)',
  'measured every 5 minutes: cron_faults_open, cron_faults_unticketed, crons_unobserved, tick_completion_5m_24h', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'every errored, silent or overdue cron becomes an issue with a closing probe, failed fleet tasks are re-fired, worker jobs retry themselves up to 3 times, and the third failure in a row hands the worker to the code loop');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session claude/cron-acceleration-e4vavc',
  'One loop on the existing fleet-exec engine, reading records every worker already writes plus the new CRON-GRID-1 rows, covers every cron failure without a new worker; the code orchestrator''s fleet_tick is an independent second path for the runner itself',
  'CRON-WATCH-1: v_cron_schedule, v_cron_activity, v_cron_faults, fleet_tasks cron-watch (*/5), the fleet-exec silence trigger on fleet_tick, four metrics with three triggers, fm-cron-fault-untriaged',
  'qnfo-audit read 2026-10-19 ~10:20Z: 25 fleet_runs failures on 2026-10-18 with no issue, fleet_heartbeat holds one row per worker, 13 workers with crons slower than hourly or off the 5-minute grid',
  'pending: first runs after apply', 'qnfo-audit agent_issues (CRON-FAULT-1 rows), remediation_contracts (their probes), fleet_crons.next_fire of failed tasks',
  'Rollback line of migrations/2026-10-19-cron-watch.sql', 'cron-fault-self-remediation', 'cron_faults_unticketed <= 0 within 1 h', 'qnfo-audit (D1 MCP read), fleet-exec workflow engine, both contract runners, code loop intake');

INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT MAX(id), 'metric', 'cron_faults_unticketed', '<=', 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+60 minutes'), 'seeded' FROM decision_log WHERE capability_gain = 'cron-fault-self-remediation' HAVING MAX(id) IS NOT NULL;

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('cron-watch', 'CRON-WATCH-1: every cron fault becomes an issue with a probe, failed fleet tasks are retried, repeat failures go to the code loop', 'workflow',
  '{"steps": [{"type": "sql", "name": "seen", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO cron_fault_seen (fault_key, kind, worker, worker_dir, detail, consecutive_fails, first_seen, last_seen, cleared_at) SELECT f.fault_key, f.kind, f.worker, f.worker_dir, f.detail, f.consecutive_fails, COALESCE((SELECT s.first_seen FROM cron_fault_seen s WHERE s.fault_key = f.fault_key AND s.cleared_at IS NULL), strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')), strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), NULL FROM v_cron_faults f UNION ALL SELECT ''#run'', ''run'', NULL, NULL, ''last cron-watch run'', 0, strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), NULL"}, {"type": "sql", "name": "seen-clear", "db": "AUDIT", "sql": "UPDATE cron_fault_seen SET cleared_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE cleared_at IS NULL AND fault_key <> ''#run'' AND last_seen < (SELECT r.last_seen FROM cron_fault_seen r WHERE r.fault_key = ''#run'')"}, {"type": "sql", "name": "file", "db": "AUDIT", "sql": "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ''CRON-FAULT-1: '' || f.fault_key, ''Charter pillar: autonomy. CRON-WATCH-1 (owner directive 2026-10-19: every cron failure is triaged and remediated by the fleet).'' || char(10) || ''Fault: '' || f.kind || '' on '' || f.worker || ''. '' || f.detail || CASE WHEN f.consecutive_fails > 0 THEN '' ('' || f.consecutive_fails || '' in a row)'' ELSE '''' END || char(10) || ''Retry policy: '' || CASE f.kind\n  WHEN ''schedule'' THEN ''none: the trigger itself breaks the rule. Move it to a cron that repeats at least hourly on a minute that is a multiple of 5 and keep a slower job on its cadence with the CRON-GRID-1 helper (q08-signal-engine/worker.js has the pattern; scripts/cron_rate_guard.py checks it in CI).''\n  WHEN ''worker-error'' THEN ''the worker retries the job on later grid ticks while its last good run is older than its period plus 30 minutes, at most 3 times in a row (CRON-GRID-1); a job marked retry false (a send to people) waits for its next slot.''\n  WHEN ''task-failed'' THEN ''cron-watch sets the cron''''s next_fire to now after each failure while fewer than 3 runs in a row failed.''\n  WHEN ''task-overdue'' THEN ''fleet-exec dispatches every due fleet_crons row on each */5 tick; an overdue row means fleet-exec is not running or skipped the row.''\n  ELSE ''the next scheduled fire is the retry (Cloudflare does not retry a cron); cron-watch re-checks every 5 minutes.'' END || char(10) || ''Escalation: at 3 consecutive failures cron-watch raises this issue to high and, for a worker, adds a code-task line for the code loop.'' || char(10) || ''Read: SELECT * FROM v_cron_faults WHERE fault_key = '''''' || replace(f.fault_key, '''''''', '''''''''''') || ''''''; '' || CASE f.kind WHEN ''worker-error'' THEN ''SELECT fired_at, cron_expr, outcome, note FROM cron_fire_log WHERE source = ''''worker:'' || f.worker || '''''' ORDER BY id DESC LIMIT 20'' WHEN ''task-failed'' THEN ''SELECT started_at, status, error FROM fleet_runs WHERE task_id = '''''' || substr(f.worker, 12) || '''''' ORDER BY id DESC LIMIT 20'' ELSE ''SELECT * FROM v_cron_activity WHERE worker = '''''' || f.worker || '''''';'' END || char(10) || ''Definition of done: the fault no longer appears in v_cron_faults. The issue contract probes exactly that and closes the issue on a pass.'', ''cron-watch'', ''reliability'', ''medium'', ''open'', (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000), (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000) FROM v_cron_fault_due f WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = ''CRON-FAULT-1: '' || f.fault_key AND a.status = ''open'')"}, {"type": "sql", "name": "file-log", "db": "AUDIT", "sql": "INSERT INTO cron_watch_actions (action, fault_key, issue_id, note) SELECT ''filed'', substr(a.title, 15), a.id, ''issue '' || a.id || '' open for '' || substr(a.title, 15) FROM agent_issues a WHERE a.title LIKE ''CRON-FAULT-1: %'' AND a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM cron_watch_actions w WHERE w.issue_id = a.id AND w.action = ''filed'' AND w.id > COALESCE((SELECT MAX(w2.id) FROM cron_watch_actions w2 WHERE w2.issue_id = a.id AND w2.action = ''closed-seen''), 0))"}, {"type": "sql", "name": "probe", "db": "AUDIT", "sql": "UPDATE remediation_contracts SET verify_probe = (SELECT ''SELECT ''''0'''' AS expected, CAST((SELECT COUNT(*) FROM v_cron_faults WHERE fault_key = '''''' || replace(substr(a.title, 15), '''''''', '''''''''''') || '''''') AS TEXT) AS observed'' FROM agent_issues a WHERE ''issue-'' || a.id = remediation_contracts.class), verify_transport = ''d1-query'', precondition = ''CRON-WATCH-1: the cron fault named in the issue title is present in v_cron_faults'', action = ''CRON-WATCH-1: retry per the issue text; escalate to the code loop at 3 consecutive failures'', module = ''cron-watch-v1'', status = ''active'', expected_cadence_h = 1, attempts = 0, next_due_at = datetime(''now'') WHERE class IN (SELECT ''issue-'' || a.id FROM agent_issues a WHERE a.title LIKE ''CRON-FAULT-1: %'' AND a.status = ''open'') AND (COALESCE(module, '''') <> ''cron-watch-v1'' OR COALESCE(status, '''') <> ''active'')"}, {"type": "sql", "name": "escalate-log", "db": "AUDIT", "sql": "INSERT INTO cron_watch_actions (action, fault_key, issue_id, note) SELECT ''escalated'', f.fault_key, a.id, f.consecutive_fails || '' consecutive failures'' || CASE WHEN f.worker_dir IS NOT NULL THEN ''; code-task for '' || f.worker_dir || ''/worker.js'' ELSE ''; priority high'' END FROM v_cron_fault_due f JOIN agent_issues a ON a.title = ''CRON-FAULT-1: '' || f.fault_key AND a.status = ''open'' WHERE f.consecutive_fails >= 3 AND instr(COALESCE(a.description, ''''), ''ESCALATED (CRON-WATCH-1)'') = 0"}, {"type": "sql", "name": "escalate", "db": "AUDIT", "sql": "UPDATE agent_issues SET priority = CASE WHEN priority = ''critical'' THEN ''critical'' ELSE ''high'' END, updated_at = (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000), description = COALESCE(description, '''') || char(10) || ''ESCALATED (CRON-WATCH-1) '' || strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') || '': '' || (SELECT f.consecutive_fails FROM v_cron_fault_due f WHERE ''CRON-FAULT-1: '' || f.fault_key = agent_issues.title) || '' consecutive failures.'' || COALESCE((SELECT char(10) || ''code-task: repo=qnfo-workers path='' || f.worker_dir || ''/worker.js'' FROM v_cron_fault_due f WHERE ''CRON-FAULT-1: '' || f.fault_key = agent_issues.title AND f.worker_dir IS NOT NULL), '' The fleet task definition lives in qnfo-audit fleet_tasks; fix it by migration.'') WHERE status = ''open'' AND title LIKE ''CRON-FAULT-1: %'' AND instr(COALESCE(description, ''''), ''ESCALATED (CRON-WATCH-1)'') = 0 AND title IN (SELECT ''CRON-FAULT-1: '' || fault_key FROM v_cron_fault_due WHERE consecutive_fails >= 3)"}, {"type": "sql", "name": "retry-log", "db": "AUDIT", "sql": "INSERT INTO cron_watch_actions (action, fault_key, note) SELECT ''retried'', f.fault_key, ''next_fire '' || c.next_fire || '' -> now after '' || f.consecutive_fails || '' failure(s)'' FROM v_cron_fault_now f JOIN fleet_crons c ON ''task-failed:'' || c.task_id = f.fault_key AND c.enabled = 1 WHERE f.consecutive_fails < 3 AND c.next_fire > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''+5 minutes'')"}, {"type": "sql", "name": "retry", "db": "AUDIT", "sql": "UPDATE fleet_crons SET next_fire = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), updated_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE enabled = 1 AND next_fire > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''+5 minutes'') AND ''task-failed:'' || task_id IN (SELECT fault_key FROM v_cron_fault_now WHERE kind = ''task-failed'' AND consecutive_fails < 3)"}, {"type": "sql", "name": "closed-log", "db": "AUDIT", "sql": "INSERT INTO cron_watch_actions (action, fault_key, issue_id, note) SELECT ''closed-seen'', substr(a.title, 15), a.id, ''issue '' || a.id || '' is '' || a.status FROM agent_issues a WHERE a.title LIKE ''CRON-FAULT-1: %'' AND a.status <> ''open'' AND EXISTS (SELECT 1 FROM cron_watch_actions w WHERE w.issue_id = a.id AND w.action = ''filed'' AND w.id > COALESCE((SELECT MAX(w2.id) FROM cron_watch_actions w2 WHERE w2.issue_id = a.id AND w2.action = ''closed-seen''), 0))"}, {"type": "sql", "name": "metric-faults-open", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_cron_fault_now) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''cron_faults_open''"}, {"type": "sql", "name": "metric-faults-unticketed", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_cron_fault_due f WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = ''CRON-FAULT-1: '' || f.fault_key AND a.status = ''open'')) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''cron_faults_unticketed''"}, {"type": "sql", "name": "metric-unobserved", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_cron_activity WHERE last_ms IS NULL) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''crons_unobserved''"}, {"type": "sql", "name": "metric-tick-5m", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = (WITH b AS (SELECT MAX((CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000) - 86400000, COALESCE((SELECT MIN(fired_epoch_ms) FROM cron_fire_log WHERE cron_name = ''tick-probe-5m''), (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000) - 86400000)) AS s, (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000) AS n) SELECT CAST(MIN(100.0, ROUND(100.0 * (SELECT COUNT(DISTINCT l.fired_epoch_ms / 300000) FROM cron_fire_log l WHERE l.source = ''trigger:fleet_crons'' AND l.fired_epoch_ms >= b.s AND l.fired_epoch_ms / 300000 < b.n / 300000) / MAX(1, b.n / 300000 - b.s / 300000), 1)) AS TEXT) FROM b), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''tick_completion_5m_24h''"}, {"type": "sql", "name": "ledger", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''cron-watch-'' || strftime(''%Y%m%d%H%M%S'', ''now''), datetime(''now''), ''cron-watch'', ''CRON-WATCH-1: faults '' || (SELECT COUNT(*) FROM v_cron_fault_now) || '' (due '' || (SELECT COUNT(*) FROM v_cron_fault_due) || '') | open issues '' || (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''CRON-FAULT-1: %'' AND status = ''open'') || '' | actions this run '' || (SELECT COUNT(*) FROM cron_watch_actions WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 minutes'')), NULL, ''fleet-exec'', ''ok''"}]}', 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('cron-watch-5m', '*/5 * * * *', 'cron-watch', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
