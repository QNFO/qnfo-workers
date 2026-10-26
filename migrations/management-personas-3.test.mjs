// MANAGEMENT-PERSONAS-3 / ECOSYSTEM-LOOP-1 offline suite: applies migrations/2026-10-26-management-personas.sql, -2.sql and -3.sql
// on SQLite with the table shapes of the earlier suites plus issue_lifecycle (read from qnfo-audit on 2026-10-26), models the live
// close trigger, and runs the workflow the way fleet-exec does. Proves: a family reopened 5+ times in 7 days and active in 24 h gets
// one critical ROOT-CAUSE-1 issue mapped to its program and in focus; a family quiet for 24 h or below the threshold gets none; a
// second tick files no duplicate; quality_trend holds the fleet and per-program index; a program whose quality fell 5 points in
// 24 h is escalated; the briefs carry quality and recurrence; a root-cause issue closes with evidence once the family is quiet for
// 24 h; persona_actions = off stops filing.
// Run: node migrations/management-personas-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const sql1 = rd("./2026-10-26-management-personas.sql"), sql2 = rd("./2026-10-26-management-personas-2.sql"), sql3 = rd("./2026-10-26-management-personas-3.sql");
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(`ALTER TABLE agent_issues ADD COLUMN close_channel TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_verdict TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_attempt_at TEXT;
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status = 'closed' AND OLD.status = 'open' BEGIN
  SELECT RAISE(ABORT, 'close-without-evidence') WHERE COALESCE((SELECT close_evidence FROM issue_triage WHERE issue_id = NEW.id), '') = '';
END;`);
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const nowMs = Date.now(), old = nowMs - 3 * 86400 * 1000;
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString().replace(/\.\d+Z$/, "Z");
for (const c of ["QNFO.OPS", "QNFO.RSCH"]) {
  run("INSERT INTO programs (program_code, portfolio_code, name) VALUES (?, 'QNFO', ?)", c, c);
  run("INSERT INTO program_charters (program_code, objective, definition_of_done, primary_metric, guard_metrics, manager_persona) VALUES (?, 'aim', 'dod', 'none_metric', '', ?)", c, "program-manager:" + c);
  run("INSERT INTO management_personas (persona_key, level, scope) VALUES (?, 'program', ?)", "program:" + c, c);
}
run("INSERT INTO management_personas (persona_key, level, scope) VALUES ('portfolio:fleet', 'portfolio', 'QNFO')");
run("INSERT INTO service_program_map (service, program_code) VALUES ('svc-ops', 'QNFO.OPS'), ('svc-rsch', 'QNFO.RSCH')");
const metric = (key, val, owner) => {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed) VALUES (?, 'operational', 'target', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))", key, String(val));
  run("INSERT INTO analytics_metric_triggers (metric_key, operator, threshold, owner) VALUES (?, 'gt', 0, ?)", key, owner);
};
for (let i = 0; i < 8; i++) metric("ops_m" + i, i < 2 ? 1 : 0, "svc-ops"); // OPS: 6 of 8 on target = 75
for (let i = 0; i < 4; i++) metric("rsch_m" + i, 0, "svc-rsch"); // RSCH: 100
let id = 0;
const issue = (title, prog, extra = {}) => {
  id = Math.max(id, one("SELECT COALESCE(MAX(id), 0) AS m FROM agent_issues").m) + 1;
  run("INSERT INTO agent_issues (id, title, priority, status, source, created_at) VALUES (?, ?, ?, ?, 'session', ?)", id, title, extra.pri || "medium", extra.status || "open", extra.created || old + id);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, ?, ?, 'fix')", id, "W." + prog, prog);
  return id;
};
const life = (iid, event, msAgo) => run("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (?, ?, ?)", iid, event, iso(msAgo));
const H = 3600 * 1000;
const flappy = issue("FLAPPY-1: the probe flaps", "QNFO.RSCH");
for (let i = 0; i < 6; i++) life(flappy, "reopened", (i + 1) * 5 * H); // 6 reopens, the latest 5 h ago
const quiet = issue("QUIET-1: an old flapper", "QNFO.OPS", { status: "closed" });
for (let i = 0; i < 6; i++) life(quiet, "reopened", (30 + i) * H); // 6 reopens, none in the last 24 h
const few = issue("FEW-1: reopened twice", "QNFO.OPS");
life(few, "reopened", 2 * H); life(few, "reopened", 3 * H);
const mt = issue("METRIC-TRIGGER-77-SOME-METRIC: breach", "QNFO.OPS");
for (let i = 0; i < 5; i++) life(mt, "reopened", (i + 1) * H);
for (let i = 0; i < 12; i++) issue("ops filler " + i, "QNFO.OPS");

run("INSERT INTO fleet_tasks (id, name, type, definition, version) VALUES ('portfolio-autopilot', 'ap', 'workflow', ?, 4)", JSON.stringify({ steps: [{ type: "sql", name: "file-no-mapped-work-umbrella", db: "AUDIT", sql: "INSERT INTO x SELECT 1 FROM (SELECT entity FROM portfolio_gaps WHERE status='open' AND kind='no-mapped-work' ORDER BY entity LIMIT 20) WHERE 1" }] }));
db.exec("CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT); ALTER TABLE remediation_contracts ADD COLUMN precondition TEXT; ALTER TABLE remediation_contracts ADD COLUMN action TEXT; ALTER TABLE remediation_contracts ADD COLUMN verify_probe TEXT; ALTER TABLE remediation_contracts ADD COLUMN verify_transport TEXT; ALTER TABLE remediation_contracts ADD COLUMN max_attempts INTEGER; ALTER TABLE remediation_contracts ADD COLUMN escalate_to TEXT; ALTER TABLE remediation_contracts ADD COLUMN expected_cadence_h INTEGER;");
db.exec("CREATE VIEW v_output_quality_headline AS SELECT 6 AS better, 0 AS worse, 1 AS flat, 2 AS unmeasured, 'ask,papers' AS gaps, 'improving_with_gaps' AS verdict");
db.exec("CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'run', prompt TEXT, code TEXT, cron TEXT, delay_s INTEGER, instance TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, run_id TEXT, result TEXT, error TEXT, created_at TEXT, started_at TEXT, finished_at TEXT)");
db.exec(sql1); db.exec(sql2); db.exec(sql3);
const ap = one("SELECT definition, version FROM fleet_tasks WHERE id = 'portfolio-autopilot'");
ok(JSON.parse(ap.definition).steps[0].sql.includes("kind='no-mapped-work' AND entity NOT LIKE 'QNFO.INFRA.%' ORDER BY entity LIMIT 20") && ap.version === 5, "the umbrella filer uses the closing probe's condition", ap);
ok(one("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-portfolio-umbrella-flap'").n === 1 && one("SELECT issue_id FROM failure_modes WHERE fm_key = 'portfolio-umbrella-flap'").issue_id === 2993, "the failure mode and its detector are recorded");
ok(true, "the three migrations apply");
db.exec(sql3.slice(0, sql3.lastIndexOf("\nINSERT INTO decision_log")));
ok(true, "a re-apply of -3 (minus the append-only decision row) applies");
const steps = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const nm = steps.map((s) => s.name);
ok(nm.indexOf("recur-snapshot") < nm.indexOf("quality-snapshot") && nm.indexOf("quality-snapshot") < nm.indexOf("portfolio-allocate") && nm.indexOf("rc-file") < nm.indexOf("plan-snapshot"), "recurrence and quality run before the allocation and the focus plan", nm);
const tick = () => { for (const s of steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };
tick();
const rc = (fam) => one("SELECT id, priority, status FROM agent_issues WHERE title = ?", "ROOT-CAUSE-1: " + fam + " keeps recurring");
ok(rc("FLAPPY-1") && rc("FLAPPY-1").priority === "critical", "a family reopened 6 times and active today gets a critical root-cause issue", rc("FLAPPY-1"));
ok(rc("METRIC-TRIGGER-77") && rc("METRIC-TRIGGER-77").status === "open", "a metric trigger is its own family", q("SELECT family FROM issue_recurrence_now"));
ok(!rc("QUIET-1"), "a family quiet for 24 h gets none");
ok(!rc("FEW-1"), "a family below 5 reopens gets none");
ok(one("SELECT program_code FROM issue_project_map WHERE issue_id = ?", rc("FLAPPY-1").id).program_code === "QNFO.RSCH", "the root-cause issue is mapped to the family's program");
ok(one("SELECT 1 AS x FROM program_focus WHERE issue_id = ?", rc("FLAPPY-1").id), "and is in that program's focus", q("SELECT * FROM program_focus"));
ok(one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'root-cause'").n === 2, "each filing is a persona_actions row");
const qt = Object.fromEntries(q("SELECT scope, quality_index, measured, in_breach FROM quality_trend").map((r) => [r.scope, r]));
ok(qt.fleet && qt.fleet.quality_index === 83.3 && qt.fleet.measured === 12, "the fleet index is the share of measured triggers on target", qt.fleet);
ok(qt["QNFO.OPS"].quality_index === 75 && qt["QNFO.RSCH"].quality_index === 100, "each program has its own index", qt);
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'fleet_quality_index'").last_value === "83.3", "fleet_quality_index is written");
ok(Number(one("SELECT last_value FROM metric_registry WHERE metric = 'issue_reopens_7d'").last_value) === 19, "issue_reopens_7d counts the 7-day reopens");
const pb = one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary;
ok(/Outputs \(readers, reviewers and probes, per surface\): improving_with_gaps, 6 better, 0 worse, 1 flat, unmeasured: ask,papers\./.test(pb), "the portfolio brief carries the output-quality verdict", pb);
ok(/Quality: 83\.3 of 100/.test(pb) && /Most recurring: /.test(pb) && /root-cause issues 2/.test(pb), "the portfolio brief carries quality and recurrence", pb);
ok(/Quality 75(\.0)? of 100/.test(one("SELECT summary FROM persona_briefs WHERE persona_key = 'program-manager:QNFO.OPS'").summary), "a program brief carries its index");

const reqs = q("SELECT requester, instance, prompt FROM cf_agent_requests WHERE instance LIKE 'root-cause-%'");
ok(reqs.length === 2 && reqs.every((r) => /Find the root cause/.test(r.prompt)), "each root-cause issue gets one Cloudflare agent diagnosis request", reqs);
ok(one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'agent-diagnose' AND to_value = 'requested'").n === 2, "the requests are logged");
ok(q("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'program-review-%'").length === one("SELECT COUNT(*) AS n FROM portfolio_allocations WHERE verdict = 'RED' AND tick = (SELECT MAX(tick) FROM portfolio_allocations)").n, "each RED program gets one review request a day");
run("UPDATE cf_agent_requests SET status = 'done', result = 'producer: x step; probe: y; fix: z', finished_at = '2026-10-26T08:00:00Z' WHERE instance = ?", "root-cause-" + rc("FLAPPY-1").id);
tick();
ok(/Root-cause diagnosis by the Cloudflare agent .*producer: x step/.test(one("SELECT description FROM agent_issues WHERE id = ?", rc("FLAPPY-1").id).description), "the agent's answer is appended to the issue");
ok(one("SELECT to_value FROM persona_actions WHERE kind = 'agent-diagnose' AND issue_id = ?", rc("FLAPPY-1").id).to_value === "reported", "and the request is marked reported");
ok(q("SELECT * FROM cf_agent_requests").length === reqs.length + q("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'program-review-%'").length, "no request is filed twice");
ok(one("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'ROOT-CAUSE-1:%'").n === 2, "a second tick files no duplicate");
ok(one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'root-cause'").n === 2, "and logs no second filing");

// quality fell: RSCH was 100 a day ago and is now 50 -> escalate
const past = one("SELECT strftime('%Y-%m-%dT%H:00Z', 'now', '-25 hours') AS t").t;
run("INSERT INTO quality_trend (tick, scope, measured, in_breach, reopens_7d, quality_index) VALUES (?, 'QNFO.RSCH', 4, 0, 0, 100)", past);
run("UPDATE metric_registry SET last_value = '1' WHERE metric IN ('rsch_m0', 'rsch_m1')");
tick();
const ra = one("SELECT decision, reason FROM portfolio_allocations WHERE program_code = 'QNFO.RSCH' AND tick = (SELECT MAX(tick) FROM portfolio_allocations)");
ok(ra.decision === "escalate" && /quality fell from 100(\.0)? to 50(\.0)?/.test(ra.reason), "a program whose quality fell 5+ points in 24 h is escalated", ra);

// the family goes quiet for 24 h and the issue is older than 24 h: it closes with evidence
run("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?", iso(30 * H), flappy);
run("UPDATE agent_issues SET created_at = ? WHERE id = ?", nowMs - 25 * H, rc("FLAPPY-1").id);
tick();
ok(rc("FLAPPY-1").status === "closed", "a quiet family's root-cause issue closes", rc("FLAPPY-1"));
ok(/recurrence stopped: family FLAPPY-1/.test(one("SELECT close_evidence FROM issue_triage WHERE issue_id = ?", rc("FLAPPY-1").id).close_evidence), "with the recurrence reading as evidence");
ok(rc("METRIC-TRIGGER-77").status === "open", "an active family's issue stays open");

// persona_actions off: no new filing
run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off')");
const again = issue("AGAIN-1: flaps", "QNFO.OPS");
for (let i = 0; i < 6; i++) life(again, "reopened", (i + 1) * H);
tick();
ok(!rc("AGAIN-1"), "with persona_actions off nothing is filed");
ok(one("SELECT COUNT(*) AS n FROM quality_trend WHERE scope = 'fleet'").n >= 1, "measurement continues");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
