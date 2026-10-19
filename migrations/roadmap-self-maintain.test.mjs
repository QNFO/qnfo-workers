// ROADMAP-SELF-MAINTAIN-1 offline suite: runs migrations/2026-10-19-roadmap-self-maintain.sql on SQLite with the live table
// shapes (read from qnfo-audit sqlite_master on 2026-10-19), then executes the fleet_tasks workflow the way fleet-exec does
// (every sql step in order). Proves: goals get their program (personal owners, research statements, skill-sync, the rest to
// OPS; objective revisions untouched); every program gets one objective goal; each machine-checkable goal gets one goal-<key>
// contract (d1-query or code-read) and its probe follows a DoD edit; a pass completes the goal and verifies its GL- row; two
// failures reopen both; NEXT-/PROJ-/FM- rows close on their own evidence; the four metrics are written; the program objective
// DoD runs as a probe; a second tick and a re-apply change nothing.
// Run: node migrations/roadmap-self-maintain.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-roadmap-self-maintain.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE portfolios (portfolio_code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, owner TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE programs (program_code TEXT PRIMARY KEY, portfolio_code TEXT NOT NULL REFERENCES portfolios(portfolio_code), name TEXT NOT NULL, description TEXT, program_manager TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL REFERENCES programs(program_code), name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', github_repo TEXT, pages_project TEXT, r2_prefix TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, source TEXT, owner_service TEXT, gh_milestone INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', parent_objective TEXT, alignment TEXT, source TEXT, score REAL, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', dod TEXT, owner TEXT, adopted_at TEXT, completed_at TEXT, retired_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), program_code TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE sla_registry (sla_id TEXT PRIMARY KEY, class TEXT NOT NULL, metric TEXT NOT NULL, threshold TEXT NOT NULL, window TEXT NOT NULL, owner TEXT NOT NULL, enforcement TEXT NOT NULL, breach_action TEXT NOT NULL, autofix INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT NOT NULL, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, artifact_type TEXT NOT NULL, artifact_ref TEXT, status TEXT NOT NULL, evidence TEXT, verified_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE roadmap_gh_links (roadmap_id INTEGER PRIMARY KEY, gh_number INTEGER NOT NULL UNIQUE, gh_state TEXT, d1_status TEXT, project_code TEXT, gh_node TEXT, gh_item TEXT, synced_at TEXT);
CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT NOT NULL, program_code TEXT NOT NULL, kind TEXT NOT NULL, synced_milestone INTEGER, synced_labels TEXT, gh_node TEXT, gh_item TEXT, updated_at TEXT, synced_at TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE VIEW v_failure_mode_status AS SELECT f.fm_key, f.failure_mode, f.probe_class, (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) AS last_probed, CASE WHEN f.probe_class IS NULL THEN 'ci-guarded' WHEN (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) IS NULL OR (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = f.probe_class) < datetime('now', '-60 minutes') THEN 'unprobed' WHEN (SELECT v.pass FROM remediation_verifications v WHERE v.class = f.probe_class ORDER BY v.id DESC LIMIT 1) = 1 THEN 'absent' ELSE 'recurring' END AS status FROM failure_modes f;
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);`);

const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
run("INSERT INTO portfolios (portfolio_code, name) VALUES ('QNFO', 'QNFO')");
for (const [c, n] of [["QNFO.OPS", "Operations & Governance"], ["QNFO.RSCH", "Research & Publications"], ["QNFO.INFRA", "Cloudflare Infrastructure"], ["QNFO.REACH", "Reach & Distribution"], ["QNFO.PERSONAL", "Personal Twin"]]) {
  run("INSERT INTO programs (program_code, portfolio_code, name) VALUES (?, 'QNFO', ?)", c, n);
}
run("INSERT INTO projects (project_code, program_code, name, status) VALUES ('W.alpha', 'QNFO.OPS', 'alpha', 'active'), ('W.beta', 'QNFO.REACH', 'beta', 'archived'), ('W.gamma', 'QNFO.OPS', 'gamma', 'active')");
run("INSERT INTO agent_issues (id, title, priority, status) VALUES (1, 'alpha defect', 'high', 'open'), (2, 'reach defect', 'medium', 'open')");
run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (1, 'W.alpha', 'QNFO.OPS', 'fix'), (2, 'W.beta', 'QNFO.REACH', 'fix')");
run("INSERT INTO ops_config (key, value) VALUES ('tp1', 'no')");
const TP_DOD = "Done when this query reads ok or 1: SELECT 'ok' AS expected, CASE WHEN (SELECT value FROM ops_config WHERE key = 'tp1') = 'yes' THEN 'ok' ELSE 'pending: tp1 ' || (SELECT value FROM ops_config WHERE key = 'tp1') END AS observed;";
const goals = [
  ["TP-1", "TP-1: the code loop becomes the builder", "instrumental", "adopted", TP_DOD, "qnfo-fleet-control", "QNFO.OPS"],
  ["gbraid", "Derive a projective representation of the braid group", "instrumental", "adopted", "A published paper", "qnfo-goal-author", "QNFO.OPS"],
  ["gautonomy", "By next quarter the autonomy score rises by 10%", "instrumental", "adopted", "Measured by audits", "qnfo-goal-author", "QNFO.OPS"],
  ["TWIN-NATIVE", "TWIN-NATIVE: twin tool use through native function calling", "instrumental", "adopted", 'Done when this query reads its expected value: {"paths": ["personal-api/worker.js"], "absent": "toolAppendix"}', "personal-api", null],
  ["skill-sync-route", "Implement a real qnfo-skill-sync repo-to-R2 sync route", "instrumental", "adopted", "in_sync true", "fleet", null],
  ["deploy-agent", "Deploy IntentOrchestratorAgent DO", "instrumental", "adopted", "bound and green", "fleet", null],
  ["loop-gap", "The fleet loop detects but does not remediate; a redeploy of qnfo-ops reverts", "instrumental", "adopted", "executed > 0", "fleet-control", null],
  ["vrev-x", "Add a constraint", "objective-revision", "adopted", "human ratification", "human-ratify", null],
];
for (const g of goals) run("INSERT INTO goals (goal_key, statement, goal_type, status, dod, owner, program_code) VALUES (?, ?, ?, ?, ?, ?, ?)", ...g);
run("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen) VALUES ('fm-x', 'x breaks', 'r', 'm', 'd', 'fm-x', '2026-10-01'), ('fm-y', 'y breaks', 'r', 'm', 'd', 'fm-y', '2026-10-01')");
run("INSERT INTO remediation_verifications (class, transport, expected, observed, pass) VALUES ('fm-x', 'd1-query', '1', '1', 1), ('fm-y', 'd1-query', '1', '0', 0)");
const rm = [["GL-TP-1", "goals", "TP-1", "autonomy", "TP-1", "open"], ["NEXT-W.alpha", "portfolio-self-manage", "Next deliverable for alpha", "project", "W.alpha", "planned"],
  ["NEXT-W.gamma", "portfolio-self-manage", "Next deliverable for gamma", "project", "W.gamma", "planned"], ["PROJ-W.beta", "projects", "beta", "project", "W.beta", "open"],
  ["FM-fm-x", "failure_modes", "x breaks", "gate", "fm-x", "open"], ["FM-fm-y", "failure_modes", "y breaks", "gate", "fm-y", "open"],
  ["AI-1", "agent_issues", "alpha defect", "core", "1", "open"], ["MB-orphan", "cf-model-eval", "model row", "model", "m", "open"]];
for (const r of rm) run("INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status) VALUES (?, ?, ?, ?, ?, ?)", ...r);

db.exec(sql);
const task = one("SELECT type, definition, enabled FROM fleet_tasks WHERE id = 'roadmap-self-maintain'");
ok(task && task.type === "workflow" && task.enabled === 1, "the workflow task exists and is enabled", task);
const steps = JSON.parse(task.definition).steps;
ok(steps.every((s) => s.type === "sql" && s.db === "AUDIT" && s.sql), "every step is a sql step on AUDIT (fleet-exec runs nothing else)");
ok(one("SELECT cron_expr FROM fleet_crons WHERE name = 'roadmap-self-maintain-hourly' AND enabled = 1")?.cron_expr === "30 * * * *", "hourly cron at :30");
const tick = () => { for (const s of steps) { try { db.exec(s.sql); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };
const goal = (k) => one("SELECT * FROM goals WHERE goal_key = ?", k);
const rmap = (i) => one("SELECT status, evidence FROM roadmap_implementation WHERE item = ?", i);
const metric = (m) => one("SELECT last_value FROM metric_registry WHERE metric = ?", m)?.last_value;

// tick 1: placement, objectives, contracts, roadmap closure
tick();
ok(goal("gbraid").program_code === "QNFO.RSCH", "a research statement by the goal author moves to QNFO.RSCH", goal("gbraid").program_code);
ok(goal("gautonomy").program_code === "QNFO.OPS", "a non-research goal-author goal stays in QNFO.OPS");
ok(goal("TWIN-NATIVE").program_code === "QNFO.PERSONAL", "a personal-twin owner goes to QNFO.PERSONAL");
ok(goal("skill-sync-route").program_code === "QNFO.INFRA" && goal("deploy-agent").program_code === "QNFO.INFRA", "skill-sync and Deploy goals go to QNFO.INFRA");
ok(goal("loop-gap").program_code === "QNFO.OPS", "a goal that mentions a redeploy mid-sentence goes to QNFO.OPS", goal("loop-gap").program_code);
ok(goal("vrev-x").program_code === null && goal("vrev-x").status === "adopted", "objective revisions are left to owner ratification");
ok(one("SELECT COUNT(*) AS n FROM goal_lifecycle WHERE action = 'program-assigned'").n === 5, "each placement is logged once", q("SELECT goal_key FROM goal_lifecycle WHERE action = 'program-assigned'"));
const prg = q("SELECT goal_key, program_code, status, dod FROM goals WHERE source = 'ROADMAP-SELF-MAINTAIN-1' ORDER BY goal_key");
ok(prg.length === 5 && prg.every((g) => g.status === "adopted"), "one adopted objective per program", prg.map((g) => g.goal_key));
const reach = prg.find((g) => g.program_code === "QNFO.REACH");
ok(reach && reach.goal_key === "PRG-QNFO-REACH-DEFECTS-0", "program objective key", reach && reach.goal_key);
const probeOf = (k) => one("SELECT verify_probe, verify_transport, issue_id, status, module FROM remediation_contracts WHERE class = ?", "goal-" + k);
const rp = probeOf("PRG-QNFO-REACH-DEFECTS-0");
const rr = one(rp.verify_probe);
ok(rr.expected === "ok" && rr.observed === "open defects in QNFO.REACH: 1", "the program objective DoD runs as a probe and names the open count", rr);
const tp = probeOf("TP-1");
ok(tp && tp.verify_transport === "d1-query" && tp.issue_id === null && tp.status === "active" && tp.module === "goal-dod-v1", "a d1-query goal gets one issue-less active contract", tp);
ok(tp.verify_probe.startsWith("SELECT 'ok' AS expected") && !tp.verify_probe.includes(";"), "the probe is the DoD's SELECT without its semicolon", tp.verify_probe);
ok(one(tp.verify_probe).observed === "pending: tp1 no", "the d1-query probe runs");
const tw = probeOf("TWIN-NATIVE");
ok(tw && tw.verify_transport === "code-read" && JSON.parse(tw.verify_probe).absent === "toolAppendix", "a code-read goal gets a code-read contract", tw);
ok(!probeOf("gbraid") && !probeOf("vrev-x"), "prose DoDs and objective revisions get no contract");
ok(one("SELECT COUNT(*) AS n FROM remediation_contracts WHERE module = 'goal-dod-v1'").n === 7, "7 goal contracts (2 checkable goals + 5 program objectives)");
ok(rmap("NEXT-W.alpha").status === "verified" && rmap("NEXT-W.alpha").evidence.includes("work is mapped"), "NEXT- verifies once work is mapped", rmap("NEXT-W.alpha"));
ok(rmap("NEXT-W.gamma").status === "planned", "NEXT- stays planned while nothing is mapped");
ok(rmap("PROJ-W.beta").status === "verified" && rmap("PROJ-W.beta").evidence.includes("archived"), "PROJ- verifies on an archived project", rmap("PROJ-W.beta"));
ok(rmap("FM-fm-x").status === "verified" && rmap("FM-fm-y").status === "open", "FM- verifies only when its detector reads absent", [rmap("FM-fm-x"), rmap("FM-fm-y")]);
ok(rmap("GL-TP-1").status === "open", "GL- stays open while the goal is adopted");
ok(metric("goals_without_machine_dod") === "5", "goals_without_machine_dod counts adopted goals with prose DoDs", metric("goals_without_machine_dod"));
ok(metric("goals_unevaluated") === "0", "a contract younger than 120 minutes is not yet unevaluated", metric("goals_unevaluated"));
ok(metric("roadmap_open_unplaced") === "1", "the cf-model-eval row with no project is the one unplaced item", metric("roadmap_open_unplaced"));
const hz = Object.fromEntries(q("SELECT item, horizon, program_code FROM v_roadmap").map((r) => [r.item, r]));
ok(hz["AI-1"].horizon === "now" && hz["AI-1"].program_code === "QNFO.OPS", "a high-priority issue row is 'now' in its issue's program", hz["AI-1"]);
ok(hz["GL-TP-1"].horizon === "next" && hz["GL-TP-1"].program_code === "QNFO.OPS", "a checkable goal row is 'next' in the goal's program", hz["GL-TP-1"]);
ok(hz["FM-fm-y"].program_code === "QNFO.OPS" && hz["NEXT-W.alpha"].horizon === "done", "issue-less FM rows default to OPS, closed rows are done");
ok(q("SELECT * FROM v_portfolio_tree").length === 5, "v_portfolio_tree has one row per program");
ok(one("SELECT objective_status FROM v_portfolio_tree WHERE program_code = 'QNFO.REACH'").objective_status === "adopted", "the tree shows each program's objective");
ok(one("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'roadmap-self-maintain'").n === 1, "one ledger row per run");

// an old contract with no verdict counts as unevaluated
run("UPDATE remediation_contracts SET ts = datetime('now', '-3 hours') WHERE class = 'goal-TP-1'");
tick();
ok(metric("goals_unevaluated") === "1", "an adopted goal whose old contract has no verdict counts", metric("goals_unevaluated"));

// tick: idempotence (nothing new logged, no duplicate goals or contracts)
const lc0 = one("SELECT COUNT(*) AS n FROM goal_lifecycle").n;
tick();
ok(one("SELECT COUNT(*) AS n FROM goal_lifecycle").n === lc0, "a quiet tick logs nothing");
ok(one("SELECT COUNT(*) AS n FROM goals WHERE source = 'ROADMAP-SELF-MAINTAIN-1'").n === 5, "objectives are seeded once");

// the DoD is edited: the contract follows
run("UPDATE goals SET dod = replace(dod, '''yes''', '''done''') WHERE goal_key = 'TP-1'");
tick();
ok(probeOf("TP-1").verify_probe.includes("'done'"), "the contract probe follows a DoD edit");
run("UPDATE goals SET dod = ? WHERE goal_key = 'TP-1'", TP_DOD);
tick();

// a pass completes the goal and verifies its roadmap row
run("UPDATE ops_config SET value = 'yes' WHERE key = 'tp1'");
const v1 = one(probeOf("TP-1").verify_probe);
run("INSERT INTO remediation_evidence (class, transport, expected, observed, pass) VALUES ('goal-TP-1', 'd1-query', ?, ?, 1)", v1.expected, v1.observed);
tick();
ok(goal("TP-1").status === "completed" && goal("TP-1").completed_at, "a recorded pass completes the goal", goal("TP-1"));
ok(rmap("GL-TP-1").status === "verified" && rmap("GL-TP-1").evidence.includes("completed"), "its GL- row verifies", rmap("GL-TP-1"));
ok(metric("goals_completed_7d") === "1" && metric("goals_unevaluated") === "0", "goals_completed_7d counts it", metric("goals_completed_7d"));
ok(probeOf("TP-1").status === "active", "a completed goal stays probed so a regression is seen");

// one failure does not reopen, two do
run("UPDATE ops_config SET value = 'no' WHERE key = 'tp1'");
run("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at) VALUES ('goal-TP-1', 'd1-query', 'ok', 'pending: tp1 no', 0, datetime('now', '+1 minute'))");
tick();
ok(goal("TP-1").status === "completed", "one failed verdict does not reopen");
run("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at) VALUES ('goal-TP-1', 'd1-query', 'ok', 'pending: tp1 no', 0, datetime('now', '+2 minutes'))");
tick();
ok(goal("TP-1").status === "adopted" && goal("TP-1").completed_at === null, "two failed verdicts since the pass reopen the goal", goal("TP-1"));
ok(rmap("GL-TP-1").status === "open", "and reopen its GL- row", rmap("GL-TP-1"));
ok(one("SELECT COUNT(*) AS n FROM goal_lifecycle WHERE goal_key = 'TP-1' AND action = 'dod-regressed'").n === 1, "the reopen is logged once");

// a goal completed by someone else is never reopened by this loop
run("UPDATE goals SET status = 'completed' WHERE goal_key = 'TWIN-NATIVE'");
run("INSERT INTO remediation_verifications (class, transport, expected, observed, pass) VALUES ('goal-TWIN-NATIVE', 'code-read', 'ok', 'absent text present', 0), ('goal-TWIN-NATIVE', 'code-read', 'ok', 'absent text present', 0)");
tick();
ok(goal("TWIN-NATIVE").status === "completed", "only goals this loop completed are reopened");

// a parked contract is re-activated; a retired goal's contract is retired
run("UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:sweep' WHERE class = 'goal-TP-1'");
run("UPDATE goals SET status = 'retired' WHERE goal_key = 'TWIN-NATIVE'");
tick();
ok(probeOf("TP-1").status === "active", "a goal contract parked by another sweep is re-activated");
ok(probeOf("TWIN-NATIVE").status === "superseded", "a retired goal's contract is retired", probeOf("TWIN-NATIVE"));

// re-apply: nothing duplicates, nothing fails
db.exec(sql);
ok(one("SELECT COUNT(*) AS n FROM metric_registry WHERE metric IN ('goals_unevaluated','goals_without_machine_dod','roadmap_open_unplaced','goals_completed_7d')").n === 4, "four metrics");
ok(one("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key IN ('goals_unevaluated','roadmap_open_unplaced')").n === 2, "two triggers, once");
ok(one("SELECT COUNT(*) AS n FROM bak_20261019_goals_rsm").n === goals.length, "the backup holds the goals as they were before the first apply");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
