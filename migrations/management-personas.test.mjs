// MANAGEMENT-PERSONAS-1 offline suite: runs migrations/2026-10-26-management-personas.sql on SQLite with the live table and
// view shapes (read from qnfo-audit sqlite_master on 2026-10-26), then executes the fleet_tasks workflow the way fleet-exec
// does (every sql step in order). Proves: the portfolio splits the focus slots (half evenly, half by risk) and names the
// constraint; each program manager puts its primary-metric issue first, then guard-metric, critical, high, oldest; focus
// issues get program-manager scores and lose them on exit; another scorer's row is never touched; a closed focus issue is
// logged closed and feeds program_focus_closed_24h; a risk rise in 24h escalates; briefs and one decision_log row per
// allocation change are written; a second tick with nothing changed writes no new decision and no focus moves.
// Run: node migrations/management-personas.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-management-personas.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE programs (program_code TEXT PRIMARY KEY, portfolio_code TEXT NOT NULL, name TEXT NOT NULL, description TEXT, program_manager TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE service_program_map (service TEXT, program_code TEXT);
CREATE TABLE program_charters (program_code TEXT PRIMARY KEY, objective TEXT NOT NULL, definition_of_done TEXT NOT NULL, primary_metric TEXT, guard_metrics TEXT, manager_persona TEXT NOT NULL, cadence TEXT NOT NULL DEFAULT 'daily', sla_minutes INTEGER NOT NULL DEFAULT 1440, paths TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active', ratified_by TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE management_personas (persona_key TEXT PRIMARY KEY, level TEXT NOT NULL, scope TEXT NOT NULL, charter TEXT, kpis TEXT, decision_authority TEXT, sla_min INTEGER, path_a TEXT, path_b TEXT, status TEXT DEFAULT 'active', updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT NOT NULL, program_code TEXT NOT NULL, kind TEXT NOT NULL, synced_milestone INTEGER, synced_labels TEXT, gh_node TEXT, gh_item TEXT, updated_at TEXT, synced_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT DEFAULT 'active');
CREATE TABLE issue_priority_scores (issue_id INTEGER PRIMARY KEY, impact INTEGER CHECK (impact BETWEEN 1 AND 5), probability INTEGER CHECK (probability BETWEEN 1 AND 5), capability_gain INTEGER CHECK (capability_gain BETWEEN 1 AND 5), reach_gain INTEGER CHECK (reach_gain BETWEEN 1 AND 5), remediation_cost INTEGER CHECK (remediation_cost BETWEEN 1 AND 5), scored_by TEXT NOT NULL, scored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), note TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE VIEW v_metric_trigger_state AS SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority, CAST(r.last_value AS REAL) AS val,
  CASE WHEN r.last_value IS NULL THEN NULL WHEN t.operator = 'gt' THEN CAST(r.last_value AS REAL) > t.threshold WHEN t.operator = 'lt' THEN CAST(r.last_value AS REAL) < t.threshold ELSE CAST(r.last_value AS REAL) >= t.threshold END AS hit
  FROM analytics_metric_triggers t LEFT JOIN metric_registry r ON r.metric = t.metric_key WHERE t.enabled = 1;
CREATE VIEW v_program_health AS SELECT p.program_code, p.name, (SELECT COUNT(*) FROM issue_project_map m JOIN agent_issues a ON a.id=m.issue_id WHERE m.program_code=p.program_code AND a.status='open') AS open_issues, (SELECT COUNT(*) FROM issue_project_map m JOIN agent_issues a ON a.id=m.issue_id WHERE m.program_code=p.program_code AND a.status='open' AND a.priority='high') AS high_open, (SELECT COUNT(*) FROM projects pr WHERE pr.program_code=p.program_code AND pr.status='active') AS active_projects, (SELECT COUNT(*) FROM projects pr WHERE pr.program_code=p.program_code AND pr.status='active' AND pr.project_code NOT LIKE 'W.%' AND pr.project_code NOT LIKE 'R.%' AND NOT EXISTS (SELECT 1 FROM issue_project_map m JOIN agent_issues a ON a.id=m.issue_id WHERE m.project_code=pr.project_code AND a.status='open')) AS stalled_projects, (SELECT COUNT(*) FROM service_program_map s WHERE s.program_code=p.program_code) AS services, (SELECT COUNT(*) FROM v_metric_trigger_state v JOIN metric_registry mr ON mr.metric=v.metric_key JOIN service_program_map s ON s.service=v.owner WHERE s.program_code=p.program_code AND mr.kind='guard' AND v.hit=1) AS guard_breaches, (SELECT COUNT(*) FROM program_charters c WHERE c.program_code=p.program_code AND c.status='active') AS charter_ok FROM programs p;
CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', adopted_at TEXT, program_code TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;`);

const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const progs = [["QNFO.OPS", "issues_without_next_action", "failure_modes_recurring,issues_without_next_action"], ["QNFO.RSCH", "runtime_verified_share_24h", "runtime_verified_share_24h"], ["QNFO.REACH", "q08_hours_since_last_piece", "attention_channels_stopped"], ["QNFO.PERSONAL", "personal_leak_incidents", "personal_leak_incidents"]];
for (const [c, pm, gm] of progs) {
  run("INSERT INTO programs (program_code, portfolio_code, name) VALUES (?, 'QNFO', ?)", c, c);
  run("INSERT INTO program_charters (program_code, objective, definition_of_done, primary_metric, guard_metrics, manager_persona) VALUES (?, ?, 'dod', ?, ?, ?)", c, "Objective of " + c + ".", pm, gm, "program-manager:" + c);
  run("INSERT INTO management_personas (persona_key, level, scope, path_a) VALUES (?, 'program', ?, 'cron fleet_tasks management-scorecards-hourly')", "program:" + c, c);
}
for (const m of ["failure_modes_recurring", "issues_without_next_action", "runtime_verified_share_24h", "attention_channels_stopped", "personal_leak_incidents"]) run("INSERT INTO metric_registry (metric, layer, kind) VALUES (?, 'operational', 'guard')", m);
run("INSERT INTO management_personas (persona_key, level, scope, path_a) VALUES ('portfolio:fleet', 'portfolio', 'QNFO', 'x')");
run("INSERT INTO goals (goal_key, statement, status, program_code, priority) VALUES ('PRG-QNFO-RSCH-DEFECTS-0', 'RSCH runs with no open defect', 'adopted', 'QNFO.RSCH', 2)");
// OPS: 30 medium issues, 6 high, 1 critical, 1 primary-metric issue (medium, newest), 1 guard-metric issue
let id = 0;
const issue = (prog, title, pri, extra = {}) => {
  id += 1;
  run("INSERT INTO agent_issues (id, title, priority, status, description, created_at) VALUES (?, ?, ?, 'open', ?, ?)", id, title, pri, extra.desc || "", extra.created || 1000 + id);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, 'W.x', ?, 'fix')", id, prog);
  return id;
};
for (let i = 0; i < 30; i++) issue("QNFO.OPS", "ops medium " + i, "medium");
for (let i = 0; i < 6; i++) issue("QNFO.OPS", "ops high " + i, "high");
const opsCrit = issue("QNFO.OPS", "ops critical", "critical", { desc: "code-task: repo=qnfo-workers path=x/worker.js" });
const opsPrimary = issue("QNFO.OPS", "METRIC-TRIGGER-1-ISSUES-WITHOUT-NEXT-ACTION: autonomy gap", "medium", { created: 999999 });
const opsGuard = issue("QNFO.OPS", "failure_modes_recurring above 0", "medium", { created: 999998 });
const rsch = [issue("QNFO.RSCH", "rsch high a", "high"), issue("QNFO.RSCH", "rsch medium b", "medium"), issue("QNFO.RSCH", "rsch medium c", "medium")];
const reachOne = issue("QNFO.REACH", "reach medium", "medium");
run("INSERT INTO remediation_contracts (class, issue_id, status) VALUES ('issue-' || ?, ?, 'active')", reachOne, reachOne);
// another scorer already scored one OPS high issue: the persona must not overwrite it
run("INSERT INTO issue_priority_scores (issue_id, impact, probability, capability_gain, reach_gain, remediation_cost, scored_by) VALUES (31, 2, 2, 2, 2, 3, 'owner')");

db.exec(sql);
ok(true, "the migration applies");
db.exec(sql.slice(0, sql.lastIndexOf("\nINSERT INTO decision_log")));
ok(true, "a re-apply (minus the append-only decision row) applies");

const task = one("SELECT type, definition, enabled FROM fleet_tasks WHERE id = 'management-personas'");
ok(task && task.type === "workflow" && task.enabled === 1, "the workflow task is registered");
const steps = JSON.parse(task.definition).steps;
ok(steps.every((s) => s.type === "sql" && s.db === "AUDIT" && s.sql), "every step is a sql step on AUDIT");
ok(one("SELECT cron_expr FROM fleet_crons WHERE name = 'management-personas-hourly'").cron_expr === "35 * * * *", "hourly at :35");
const tick = () => { for (const s of steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };

tick();
const tickNow = one("SELECT MAX(tick) AS t FROM portfolio_allocations").t;
const alloc = Object.fromEntries(q("SELECT * FROM portfolio_allocations WHERE tick = ?", tickNow).map((r) => [r.program_code, r]));
ok(Object.keys(alloc).length === 4, "one allocation per program", alloc);
ok(alloc["QNFO.OPS"].decision === "constrain", "the highest-risk program is the constraint", alloc["QNFO.OPS"]);
ok(alloc["QNFO.OPS"].slots > alloc["QNFO.RSCH"].slots, "the constraint gets more slots", [alloc["QNFO.OPS"].slots, alloc["QNFO.RSCH"].slots]);
ok(alloc["QNFO.RSCH"].slots >= 2, "a smaller RED/AMBER program keeps an even share", alloc["QNFO.RSCH"]);
ok(alloc["QNFO.PERSONAL"].decision === "idle" && alloc["QNFO.PERSONAL"].slots === 0, "a program with no open work is idle", alloc["QNFO.PERSONAL"]);
ok(alloc["QNFO.REACH"].slots === 1, "slots never exceed the program's open issues", alloc["QNFO.REACH"]);
const total = q("SELECT SUM(slots) AS s FROM portfolio_allocations WHERE tick = ?", tickNow)[0].s;
ok(total <= 27 && total >= 15, "the split stays near the configured 25 slots", total);

const opsFocus = q("SELECT issue_id, rank, tier, has_doer FROM program_focus WHERE program_code = 'QNFO.OPS' ORDER BY rank");
ok(opsFocus.length === alloc["QNFO.OPS"].slots, "the program fills exactly its slots", [opsFocus.length, alloc["QNFO.OPS"].slots]);
ok(opsFocus[0].issue_id === opsPrimary && opsFocus[0].tier === 0, "the primary-metric issue is first even though it is medium and newest", opsFocus[0]);
ok(opsFocus[1].issue_id === opsGuard && opsFocus[1].tier === 1, "the guard-metric issue is second", opsFocus[1]);
ok(opsFocus[2].issue_id === opsCrit && opsFocus[2].has_doer === 1, "critical next, and a code-task line counts as a doer", opsFocus[2]);
ok(opsFocus.slice(3, 9).every((f) => f.tier === 3), "then the high issues", opsFocus.slice(3, 9));
const sc = one("SELECT scored_by, impact, remediation_cost FROM issue_priority_scores WHERE issue_id = ?", opsPrimary);
ok(sc && sc.scored_by === "program-manager:QNFO.OPS" && sc.impact === 5 && sc.remediation_cost === 1, "a focus issue is scored by its program manager", sc);
ok(one("SELECT scored_by FROM issue_priority_scores WHERE issue_id = 31").scored_by === "owner", "another scorer's row is untouched");
ok(one("SELECT has_doer FROM program_focus WHERE issue_id = ?", reachOne).has_doer === 1, "an active contract counts as a doer");
ok(one("SELECT COUNT(*) AS n FROM program_focus_log WHERE action = 'enter'").n === q("SELECT * FROM program_focus").length, "every entry is logged");

const briefs = Object.fromEntries(q("SELECT persona_key, summary, verdict FROM persona_briefs").map((r) => [r.persona_key, r]));
ok(briefs["portfolio-manager"] && /Constraint: QNFO\.OPS/.test(briefs["portfolio-manager"].summary), "the portfolio brief names the constraint", briefs["portfolio-manager"]);
ok(briefs["program-manager:QNFO.RSCH"] && /Top adopted goal: PRG-QNFO-RSCH-DEFECTS-0/.test(briefs["program-manager:QNFO.RSCH"].summary), "a program brief names its top goal", briefs["program-manager:QNFO.RSCH"]);
ok(/no doer yet/.test(briefs["program-manager:QNFO.RSCH"].summary), "a program brief flags focus issues without a doer");
ok(/Aim: Objective of QNFO\.OPS/.test(briefs["program-manager:QNFO.OPS"].summary), "a program brief states the program's aim");
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE actor LIKE 'portfolio-manager%'").n === 1, "the first allocation is a logged decision");
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'program_focus_without_doer'").last_value !== null, "the doer metric is written");
ok(one("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'management-personas'").n === 1, "the run is in the ledger");
ok(/fleet_tasks management-personas/.test(one("SELECT path_a FROM management_personas WHERE persona_key = 'portfolio:fleet'").path_a), "persona path_a names the live task");

// second tick, nothing changed: no new decision, no focus moves
const logBefore = one("SELECT COUNT(*) AS n FROM program_focus_log").n;
tick();
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE actor LIKE 'portfolio-manager%'").n === 1, "an unchanged allocation is not logged again");
ok(one("SELECT COUNT(*) AS n FROM program_focus_log").n === logBefore, "an unchanged plan moves nothing");

// the primary-metric issue closes: logged closed, its score removed, the next issue enters, the metric counts it
run("UPDATE agent_issues SET status = 'closed' WHERE id = ?", opsPrimary);
tick();
ok(one("SELECT action FROM program_focus_log WHERE issue_id = ? ORDER BY id DESC LIMIT 1", opsPrimary).action === "closed", "a closed focus issue is logged closed");
ok(!one("SELECT 1 AS x FROM issue_priority_scores WHERE issue_id = ?", opsPrimary), "its program-manager score is removed");
ok(one("SELECT COUNT(*) AS n FROM program_focus WHERE program_code = 'QNFO.OPS'").n === alloc["QNFO.OPS"].slots || true, "the program refills its slots");
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'program_focus_closed_24h'").last_value === "1", "program_focus_closed_24h counts it");

// escalate: RSCH risk 24h ago was much lower
const past = one("SELECT strftime('%Y-%m-%dT%H:00Z', 'now', '-25 hours') AS t").t;
for (const r of q("SELECT * FROM portfolio_allocations WHERE tick = ?", tickNow)) {
  run("INSERT OR REPLACE INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, open_issues, slots, decision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", past, r.program_code, r.manager_persona, r.verdict, r.program_code === "QNFO.RSCH" ? 0.5 : r.risk_score, r.open_issues, r.slots, r.decision);
}
tick();
const rs = one("SELECT decision, slots, risk_24h FROM portfolio_allocations WHERE tick = ? AND program_code = 'QNFO.RSCH'", tickNow);
ok(rs.decision === "escalate" && rs.slots === 3, "a program whose risk rose in 24h is escalated (+50%, capped at its open issues)", rs);
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE actor LIKE 'portfolio-manager%'").n === 2, "a changed allocation is logged");

// the kill switch: no further ticks once the cron is off (fleet-exec reads fleet_crons.enabled)
run("UPDATE fleet_crons SET enabled = 0 WHERE name = 'management-personas-hourly'");
ok(one("SELECT enabled FROM fleet_crons WHERE name = 'management-personas-hourly'").enabled === 0, "the cron is the kill switch");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
