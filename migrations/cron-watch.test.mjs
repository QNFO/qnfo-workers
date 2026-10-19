// CRON-WATCH-1 offline suite: runs migrations/2026-10-19-cron-watch.sql on SQLite, then the cron-watch workflow steps exactly as
// fleet-exec runs them (one statement per step, read from fleet_tasks). Proves: v_cron_schedule reads intervals and grid breaks
// (daily, weekly, 6-hourly, minute lists, */N, the exempt worker); a worker error, a red heartbeat streak, a silent worker, a
// failed fleet task and an overdue fleet cron are each a fault; a fault is filed only after it persists for 9 minutes (schedule
// faults 90), once, with a d1-query probe on v_cron_faults that passes when the fault clears; three failures in a row add the
// code-task line and priority high, once; a failed task is re-fired; metrics are written; the backup tick fires only when the
// fleet tick is 12 minutes stale; the fleet_tick trigger files fleet-exec silence; re-applying the file changes nothing.
// Run: node migrations/cron-watch.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-cron-watch.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const ms = (minAgo) => Math.floor((Date.now() - minAgo * 6e4) / 1000) * 1000;
db.exec(`CREATE TABLE cron_fire_log (id INTEGER PRIMARY KEY AUTOINCREMENT, cron_name TEXT NOT NULL, task_id TEXT, cron_expr TEXT, fired_at TEXT NOT NULL DEFAULT (datetime('now')), fired_epoch_ms INTEGER NOT NULL, outcome TEXT NOT NULL DEFAULT 'unknown', source TEXT NOT NULL DEFAULT 'unknown', note TEXT);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE worker_schedules (name TEXT PRIMARY KEY, crons_json TEXT, refreshed_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, cron_name TEXT, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, result TEXT, error TEXT, cost_neurons REAL);
CREATE TABLE evolve_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE sla_registry (sla_id TEXT PRIMARY KEY, class TEXT NOT NULL, metric TEXT NOT NULL, threshold TEXT NOT NULL, window TEXT NOT NULL, owner TEXT NOT NULL, enforcement TEXT NOT NULL, breach_action TEXT NOT NULL, autofix INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('metric', 'issue')), subject TEXT NOT NULL, op TEXT NOT NULL, value REAL, value2 REAL, due_at TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('parsed', 'seeded')), created_at TEXT, scored_at TEXT, observed TEXT, matched INTEGER, UNIQUE (decision_id, subject, op));
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE VIEW v_cron_health AS SELECT name, cron_expr, enabled, last_fired, next_fire, ROUND((julianday('now') - julianday(next_fire)) * 1440, 1) AS overdue_min FROM fleet_crons WHERE enabled = 1;`);
// Fleet state before apply.
const ws = db.prepare("INSERT INTO worker_schedules VALUES (?, ?, ?)");
ws.run("good-hourly", JSON.stringify(["0 * * * *", "*/5 * * * *"]), iso(10));
ws.run("daily-one", JSON.stringify(["0 6 * * *"]), iso(10));
ws.run("weekly-one", JSON.stringify(["0 16 * * 1"]), iso(10));
ws.run("six-hourly", JSON.stringify(["17 */6 * * *"]), iso(10));
ws.run("list-off", JSON.stringify(["3,13,23,33,43,53 * * * *"]), iso(10));
ws.run("qnfo-code-orchestrator", JSON.stringify(["*/2 * * * *"]), iso(10));
ws.run("deleted-worker", JSON.stringify(["0 4 * * *"]), "2026-10-06T06:46:11.713Z");
ws.run("fleet-exec", JSON.stringify(["*/5 * * * *"]), iso(10));
ws.run("errs", JSON.stringify(["0 * * * *"]), iso(10));
ws.run("red-hb", JSON.stringify(["30 * * * *"]), iso(10));
ws.run("silent", JSON.stringify(["*/10 * * * *"]), iso(10));
ws.run("unobserved", JSON.stringify(["*/15 * * * *"]), iso(10));
ws.run("qnfo-ai-calibration", JSON.stringify(["*/30 * * * *"]), iso(10));
const hb = db.prepare("INSERT OR REPLACE INTO fleet_heartbeat VALUES (?, '1.0.0', ?, ?)");
for (const w of ["good-hourly", "daily-one", "weekly-one", "six-hourly", "list-off", "qnfo-code-orchestrator", "errs"]) hb.run(w, iso(3), 1);
hb.run("silent", iso(40), 1);
hb.run("ai-health-prober", iso(4), 1);
db.prepare("INSERT INTO fleet_runs (task_id, status, started_at) VALUES ('other', 'ok', ?)").run(iso(1));
db.exec(sql);
const one = (q, ...a) => db.prepare(q).get(...a);
const all = (q, ...a) => db.prepare(q).all(...a);
// Rows that only exist once the triggers are in place.
hb.run("red-hb", iso(30), 1); hb.run("red-hb", iso(20), 0);
ok(all("SELECT ok FROM cron_outcomes WHERE worker = 'red-hb'").length === 1, "a good heartbeat with no failure before it is not recorded; the failed one is");
db.exec("UPDATE fleet_heartbeat SET ts = '" + iso(10) + "', ok = 0 WHERE worker = 'red-hb'");
db.exec("UPDATE fleet_heartbeat SET ts = '" + iso(2) + "', ok = 0 WHERE worker = 'red-hb'");
ok(all("SELECT ok FROM cron_outcomes WHERE worker = 'red-hb'").length === 3, "an upsert by UPDATE records each failed heartbeat");
const log = db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_at, fired_epoch_ms, outcome, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
log.run("errs|0 * * * *", "errs", "0 * * * *", iso(200), ms(200), "ok", "worker:errs", "tick 3 ms");
for (const m of [150, 90, 30]) log.run("errs|0 4 * * *", "errs", "0 4 * * *", iso(m), ms(m), "error", "worker:errs", "retry: boom " + m);
log.run("errs|0 * * * *", "errs", "0 * * * *", iso(29), ms(29), "ok", "worker:errs", "tick 3 ms");
log.run("good-hourly|0 * * * *", "good-hourly", "0 * * * *", iso(20), ms(20), "ok", "worker:good-hourly", "tick");
db.exec("INSERT INTO fleet_crons (name, cron_expr, task_id, next_fire) VALUES ('flaky-hourly', '0 * * * *', 'flaky', '" + iso(-50) + "'), ('stuck', '*/5 * * * *', 'stuck-task', '" + iso(30) + "'), ('tick-probe-5m', '*/5 * * * *', 'tick-probe', '" + iso(-3) + "')");
db.prepare("INSERT INTO fleet_runs (task_id, status, started_at) VALUES ('flaky', 'ok', ?), ('flaky', 'failed', ?)").run(iso(120), iso(60));
// v_cron_schedule
const sched = Object.fromEntries(all("SELECT worker || ' ' || expr AS k, gap_min, off_grid, too_slow FROM v_cron_schedule").map((r) => [r.k, r]));
ok(sched["good-hourly 0 * * * *"].gap_min === 60 && sched["good-hourly */5 * * * *"].gap_min === 5 && !sched["good-hourly 0 * * * *"].too_slow && !sched["good-hourly */5 * * * *"].off_grid, "hourly and */5 are on the rule", sched["good-hourly */5 * * * *"]);
ok(sched["daily-one 0 6 * * *"].gap_min === 1440 && sched["daily-one 0 6 * * *"].too_slow === 1, "a daily cron is slower than hourly");
ok(sched["weekly-one 0 16 * * 1"].gap_min === 10080, "a weekly cron reads 10080 min");
ok(sched["six-hourly 17 */6 * * *"].gap_min === 360 && sched["six-hourly 17 */6 * * *"].off_grid === 1, "17 */6 is 6-hourly and off the grid");
ok(sched["list-off 3,13,23,33,43,53 * * * *"].gap_min === 10 && sched["list-off 3,13,23,33,43,53 * * * *"].off_grid === 1, "a minute list reads its spacing and its off-grid minutes");
ok(sched["qnfo-code-orchestrator */2 * * * *"].off_grid === 0, "the owner-override worker in ops_config cron_grid_exempt is not off-grid");
ok(!Object.keys(sched).some((k) => k.startsWith("deleted-worker")), "a schedule row not refreshed within 180 minutes is ignored");
ok(sched["fleet-exec:flaky-hourly 0 * * * *"] && sched["fleet-exec:flaky-hourly 0 * * * *"].gap_min === 60, "fleet_crons rows are in the schedule");
// faults
const faults = () => Object.fromEntries(all("SELECT * FROM v_cron_faults").map((r) => [r.fault_key, r]));
let f = faults();
ok(f["schedule:daily-one|0 6 * * *"] && f["schedule:six-hourly|17 */6 * * *"] && f["schedule:list-off|3,13,23,33,43,53 * * * *"] && !f["schedule:good-hourly|0 * * * *"], "schedule faults for slow and off-grid crons only", Object.keys(f));
ok(f["worker-error:errs|0 4 * * *"] && f["worker-error:errs|0 4 * * *"].consecutive_fails === 3 && f["worker-error:errs|0 4 * * *"].worker_dir === "errs", "a job whose latest run errored is a fault with 3 in a row, even after a later ok tick of another cron", f["worker-error:errs|0 4 * * *"]);
ok(!f["worker-error:errs|0 * * * *"], "the ok tick is not a fault");
ok(f["heartbeat-not-ok:red-hb"] && f["heartbeat-not-ok:red-hb"].consecutive_fails === 3, "a red heartbeat with 3 failures in a row", f["heartbeat-not-ok:red-hb"]);
ok(f["worker-silent:silent"] && f["worker-silent:silent"].consecutive_fails === 4, "a */10 worker quiet for 40 minutes is silent, 4 intervals", f["worker-silent:silent"]);
ok(!f["worker-silent:unobserved"] && one("SELECT last_ms FROM v_cron_activity WHERE worker = 'unobserved'").last_ms === null, "a worker with no record is unobserved, not silent");
ok(!f["worker-silent:qnfo-ai-calibration"], "qnfo-ai-calibration is read through its ai-health-prober heartbeat");
ok(f["task-failed:flaky"] && f["task-failed:flaky"].consecutive_fails === 1 && f["task-failed:flaky"].worker_dir === null, "a fleet task whose latest run failed", f["task-failed:flaky"]);
ok(f["task-overdue:stuck"] && !f["task-overdue:flaky-hourly"], "an enabled fleet cron 30 min past next_fire is overdue");
// run the workflow
const def = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'cron-watch'").definition);
ok(def.steps.length >= 10 && def.steps.every((s) => s.type === "sql" && s.db === "AUDIT"), "cron-watch is a fleet-exec sql workflow");
const run = () => { for (const s of def.steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e.message)); } } };
run();
ok(one("SELECT COUNT(*) AS n FROM agent_issues").n === 0, "first sighting files nothing (debounce)");
ok(one("SELECT COUNT(*) AS n FROM cron_fault_seen WHERE cleared_at IS NULL AND fault_key <> '#run'").n === Object.keys(f).length, "every fault is recorded as seen");
db.exec("UPDATE cron_fault_seen SET first_seen = '" + iso(10) + "'");
run();
const issues = () => Object.fromEntries(all("SELECT * FROM agent_issues").map((r) => [r.title.slice(14), r]));
let is = issues();
ok(is["worker-error:errs|0 4 * * *"] && is["task-failed:flaky"] && is["worker-silent:silent"] && is["task-overdue:stuck"] && is["heartbeat-not-ok:red-hb"], "faults seen for 9 minutes are filed", Object.keys(is));
ok(!is["schedule:daily-one|0 6 * * *"], "a schedule fault waits 90 minutes");
ok(Object.values(is).every((i) => i.status === "open" && i.source === "cron-watch" && /Definition of done/.test(i.description) && /Retry policy/.test(i.description)), "issues carry the retry policy and the definition of done");
const c = one("SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + is["task-failed:flaky"].id);
ok(c.module === "cron-watch-v1" && c.status === "active" && c.verify_transport === "d1-query", "the birth contract becomes an active d1-query probe", c);
const probe = (k) => one(one("SELECT verify_probe FROM remediation_contracts WHERE class = ?", "issue-" + is[k].id).verify_probe);
ok(probe("task-failed:flaky").observed === "1" && probe("task-failed:flaky").expected === "0", "the probe fails while the fault is present");
ok(/code-task: repo=qnfo-workers path=errs\/worker\.js/.test(is["worker-error:errs|0 4 * * *"].description) && is["worker-error:errs|0 4 * * *"].priority === "high", "3 worker failures in a row escalate with a code-task line and priority high");
ok(is["worker-silent:silent"].priority === "high" && /code-task: repo=qnfo-workers path=silent\/worker\.js/.test(is["worker-silent:silent"].description), "4 missed intervals escalate");
ok(is["task-failed:flaky"].priority === "medium" && !/ESCALATED/.test(is["task-failed:flaky"].description), "one task failure is not escalated");
ok(one("SELECT next_fire FROM fleet_crons WHERE name = 'flaky-hourly'").next_fire <= iso(0), "a failed fleet task is re-fired now");
ok(one("SELECT COUNT(*) AS n FROM cron_watch_actions WHERE action = 'retried'").n === 1 && one("SELECT COUNT(*) AS n FROM cron_watch_actions WHERE action = 'escalated'").n === 4, "retry and escalations (error, red heartbeat, silent, overdue) are logged", all("SELECT action, fault_key FROM cron_watch_actions"));
ok(one("SELECT COUNT(*) AS n FROM cron_watch_actions WHERE action = 'filed'").n === Object.keys(is).length, "each filing is logged once");
const metric = (m) => one("SELECT last_value FROM metric_registry WHERE metric = ?", m).last_value;
ok(metric("cron_faults_open") === String(Object.keys(f).length) && metric("cron_faults_unticketed") === "0" && metric("crons_unobserved") === "1", "metrics written", [metric("cron_faults_open"), metric("cron_faults_unticketed"), metric("crons_unobserved")]);
ok(Number(metric("tick_completion_5m_24h")) >= 0, "tick_completion_5m_24h is written");
const det = one("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-cron-fault-untriaged'").verify_probe;
ok(one(det).observed === "0", "the fm detector passes once every due fault has an issue");
// second run: no duplicates, no second escalation
run();
ok(one("SELECT COUNT(*) AS n FROM agent_issues").n === Object.keys(is).length, "a second run files nothing new");
ok((issues()["worker-error:errs|0 4 * * *"].description.match(/ESCALATED/g) || []).length === 1, "escalation is appended once");
// a fault clears: the probe passes
log.run("errs|0 4 * * *", "errs", "0 4 * * *", iso(0), ms(0), "ok", "worker:errs", "retry 5 ms");
ok(probe("worker-error:errs|0 4 * * *").observed === "0", "the probe passes once the job succeeds");
db.prepare("INSERT INTO fleet_runs (task_id, status, started_at) VALUES ('flaky', 'ok', ?)").run(iso(0));
ok(probe("task-failed:flaky").observed === "0", "the task probe passes after an ok run");
db.exec("UPDATE cron_fault_seen SET last_seen = '" + iso(5) + "'"); // runs are 5 minutes apart in production
run();
ok(one("SELECT cleared_at FROM cron_fault_seen WHERE fault_key = 'task-failed:flaky'").cleared_at !== null, "a cleared fault is marked cleared");
// three task failures: escalation without a code-task
for (let i = 0; i < 3; i++) db.prepare("INSERT INTO fleet_runs (task_id, status, started_at, error) VALUES ('flaky', 'failed', ?, 'D1_ERROR: no such column')").run(iso(0));
db.exec("UPDATE fleet_crons SET next_fire = '" + iso(-50) + "' WHERE name = 'flaky-hourly'");
db.exec("UPDATE agent_issues SET status = 'closed', updated_at = 0 WHERE title = 'CRON-FAULT-1: task-failed:flaky'");
run(); db.exec("UPDATE cron_fault_seen SET first_seen = '" + iso(10) + "' WHERE fault_key = 'task-failed:flaky'"); run();
const reopened = all("SELECT * FROM agent_issues WHERE title = 'CRON-FAULT-1: task-failed:flaky' AND status = 'open'");
ok(reopened.length === 1 && reopened[0].priority === "high" && /fix it by migration/.test(reopened[0].description) && !/code-task:/.test(reopened[0].description), "3 task failures in a row: a new issue at high priority, no code-task", reopened);
ok(one("SELECT next_fire FROM fleet_crons WHERE name = 'flaky-hourly'").next_fire > iso(0), "at 3 failures in a row the task is no longer re-fired");
// schedule faults after 90 minutes
db.exec("UPDATE cron_fault_seen SET first_seen = '" + iso(95) + "' WHERE kind = 'schedule'");
run();
is = issues();
ok(is["schedule:daily-one|0 6 * * *"] && is["schedule:list-off|3,13,23,33,43,53 * * * *"] && !/code-task:/.test(is["schedule:daily-one|0 6 * * *"].description), "schedule faults are filed after 90 minutes, not escalated");
// backup fleet tick
const tdef = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'fleet-tick-backup'").definition);
db.exec("INSERT INTO fleet_tick (ts, source) VALUES ('" + iso(5) + "', 'cron:qnfo-code-orchestrator')");
db.prepare(tdef.steps[0].sql).all();
ok(one("SELECT COUNT(*) AS n FROM fleet_tick WHERE source = 'cron:fleet-exec'").n === 0, "no backup tick while the orchestrator ticked 5 minutes ago");
db.exec("UPDATE fleet_tick SET ts = '" + iso(13) + "'");
db.prepare(tdef.steps[0].sql).all();
ok(one("SELECT COUNT(*) AS n FROM fleet_tick WHERE source = 'cron:fleet-exec'").n === 1, "a backup tick when the last tick is 13 minutes old");
db.prepare(tdef.steps[0].sql).all();
ok(one("SELECT COUNT(*) AS n FROM fleet_tick WHERE source = 'cron:fleet-exec'").n === 1, "only one backup tick");
// fleet-exec silent: the fleet_tick trigger files it
db.exec("UPDATE fleet_runs SET started_at = '" + iso(30) + "'");
db.exec("INSERT INTO fleet_tick (source) VALUES ('cron:qnfo-code-orchestrator')");
const fx = all("SELECT * FROM agent_issues WHERE title = 'CRON-FAULT-1: worker-silent:fleet-exec'");
ok(fx.length === 1 && fx[0].priority === "critical" && /code-task: repo=qnfo-workers path=fleet-exec\/worker\.js/.test(fx[0].description), "the fleet_tick trigger files fleet-exec silence", fx);
const fxc = one("SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + fx[0].id);
ok(fxc.module === "cron-watch-v1" && one(fxc.verify_probe).observed === "0", "its probe fails while fleet_runs is quiet");
db.exec("INSERT INTO fleet_tick (source) VALUES ('cron:qnfo-code-orchestrator')");
ok(one("SELECT COUNT(*) AS n FROM agent_issues WHERE title = 'CRON-FAULT-1: worker-silent:fleet-exec'").n === 1, "filed once");
db.prepare("INSERT INTO fleet_runs (task_id, status, started_at) VALUES ('x', 'ok', ?)").run(iso(0));
ok(one(fxc.verify_probe).observed === "1", "the probe passes when fleet-exec runs again");
// re-apply
const n0 = one("SELECT (SELECT COUNT(*) FROM metric_registry) + (SELECT COUNT(*) FROM fleet_crons) + (SELECT COUNT(*) FROM analytics_metric_triggers) AS n").n;
db.exec(sql);
ok(one("SELECT (SELECT COUNT(*) FROM metric_registry) + (SELECT COUNT(*) FROM fleet_crons) + (SELECT COUNT(*) FROM analytics_metric_triggers) AS n").n === n0, "re-applying the file adds no rows");
ok(one("SELECT COUNT(*) AS n FROM fleet_crons WHERE task_id IN ('cron-watch', 'fleet-tick-backup') AND cron_expr = '*/5 * * * *'").n === 2, "both workflows run every 5 minutes");
console.log(`cron-watch: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
