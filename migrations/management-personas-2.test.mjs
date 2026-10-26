// MANAGEMENT-PERSONAS-2 offline suite: applies migrations/2026-10-26-management-personas.sql and -2.sql on SQLite with the
// table shapes of the MANAGEMENT-PERSONAS-1 suite (plus issue_triage, close_channel and the contract verdict columns read from
// qnfo-audit on 2026-10-26), models the live close triggers (issue_close_evidence_required, close-while-contract-fails), then
// runs the workflow the way fleet-exec does. Proves: the allocation plan reads the program_risk_now snapshot; a focus issue
// is promoted to high and restored when it leaves focus; a recovered METRIC-TRIGGER issue closes with the reading as evidence;
// an older twin is superseded after its contracts; a stale fleet-filed critical is demoted while owner-filed and code-task
// criticals keep critical; every decision is a persona_actions row; ops_config persona_actions = off stops the decisions.
// Run: node migrations/management-personas-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql1 = readFileSync(new URL("./2026-10-26-management-personas.sql", import.meta.url), "utf8");
const sql2 = readFileSync(new URL("./2026-10-26-management-personas-2.sql", import.meta.url), "utf8");
const suite1 = readFileSync(new URL("./management-personas.test.mjs", import.meta.url), "utf8");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(`ALTER TABLE agent_issues ADD COLUMN close_channel TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_verdict TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_attempt_at TEXT;
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status = 'closed' AND OLD.status = 'open' BEGIN
  SELECT RAISE(ABORT, 'close-without-evidence') WHERE COALESCE((SELECT close_evidence FROM issue_triage WHERE issue_id = NEW.id), '') = '';
  SELECT RAISE(ABORT, 'close-while-contract-fails') WHERE EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'probe-error'));
END;`);
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const nowMs = Date.now();
const old = nowMs - 3 * 86400 * 1000;
run("INSERT INTO programs (program_code, portfolio_code, name) VALUES ('QNFO.OPS', 'QNFO', 'ops')");
run("INSERT INTO program_charters (program_code, objective, definition_of_done, primary_metric, guard_metrics, manager_persona) VALUES ('QNFO.OPS', 'Run the fleet.', 'dod', 'issues_without_next_action', '', 'program-manager:QNFO.OPS')");
run("INSERT INTO management_personas (persona_key, level, scope) VALUES ('program:QNFO.OPS', 'program', 'QNFO.OPS'), ('portfolio:fleet', 'portfolio', 'QNFO')");
let id = 0;
const issue = (title, pri, extra = {}) => {
  id += 1;
  run("INSERT INTO agent_issues (id, title, priority, status, description, source, created_at) VALUES (?, ?, ?, 'open', ?, ?, ?)", id, title, pri, extra.desc || "", extra.source || "session", extra.created || old + id);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, 'W.x', 'QNFO.OPS', 'fix')", id);
  return id;
};
const metric = (key, val, op, thr) => {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed) VALUES (?, 'operational', 'target', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))", key, String(val));
  return Number(run("INSERT INTO analytics_metric_triggers (metric_key, operator, threshold) VALUES (?, ?, ?)", key, op, thr).lastInsertRowid);
};
const tRec = metric("recovered_metric", 0, "gt", 0);
const tBad = metric("breaching_metric", 9, "gt", 0);
const tFail = metric("recovered_but_failing", 0, "gt", 0);
const recovered = issue(`METRIC-TRIGGER-${tRec}-RECOVERED-METRIC: x`, "medium");
const breaching = issue(`METRIC-TRIGGER-${tBad}-BREACHING-METRIC: x`, "medium");
const twinOld = issue(`METRIC-TRIGGER-${tBad}-BREACHING-METRIC: older text`, "medium");
const failing = issue(`METRIC-TRIGGER-${tFail}-RECOVERED-BUT-FAILING: x`, "medium");
run("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-' || ?, ?, 'active', 'fail')", failing, failing);
run("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-' || ?, ?, 'active', 'fail')", twinOld, twinOld);
const fresh = issue(`METRIC-TRIGGER-${tRec}-RECOVERED-METRIC: filed just now`, "medium", { created: nowMs });
const fleetCrit = issue("fleet loop critical", "critical", { source: "qnfo-fleet-control" });
const ownerCrit = issue("owner critical", "critical", { source: "owner-chat" });
const codeCrit = issue("fleet critical with doer", "critical", { source: "portfolio-autopilot", desc: "code-task: repo=qnfo-workers path=x/worker.js" });
const youngCrit = issue("fresh fleet critical", "critical", { source: "qnfo-fleet-control", created: nowMs });
for (let i = 0; i < 40; i++) issue("ops low " + i, "low");
run("INSERT INTO ops_config (key, value) VALUES ('persona_focus_slots', '6')");
// the twin pair is newest-first by id: breaching (2) is older than twinOld (3), so make twinOld the older one
db.exec(`UPDATE agent_issues SET id = 1000 WHERE id = ${breaching}; UPDATE issue_project_map SET issue_id = 1000 WHERE issue_id = ${breaching};`);

db.exec(sql1);
db.exec(sql2);
ok(true, "both migrations apply");
db.exec(sql2.slice(0, sql2.lastIndexOf("\nINSERT INTO decision_log")));
ok(true, "a re-apply of -2 (minus the append-only decision row) applies");
const steps = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
ok(steps[0].name === "risk-clear" && steps[1].name === "risk-snapshot", "the risk snapshot runs first", steps.slice(0, 2).map((s) => s.name));
const tick = () => { for (const s of steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };
tick();
ok(one("SELECT COUNT(*) AS n FROM program_risk_now").n === 1, "program_risk_now holds the snapshot");
ok(one("SELECT COUNT(*) AS n FROM portfolio_allocations").n === 1, "the allocation reads the snapshot");
const st = (i) => one("SELECT status, priority FROM agent_issues WHERE id = ?", i);
const acts = (k) => q("SELECT issue_id FROM persona_actions WHERE kind = ?", k).map((r) => r.issue_id);
ok(st(recovered).status === "closed", "a recovered metric issue closes", st(recovered));
ok(/recovered_metric reads 0/.test(one("SELECT close_evidence FROM issue_triage WHERE issue_id = ?", recovered).close_evidence), "with the reading as close evidence");
ok(acts("close").includes(recovered), "and a persona_actions close row");
ok(st(1000).status === "open", "a breaching metric issue stays open");
ok(st(failing).status === "open", "a recovered metric whose contract fails stays open");
ok(st(fresh).status === "open", "a metric issue younger than 120 minutes stays open");
ok(st(twinOld).status === "closed" && acts("supersede").includes(twinOld), "the older twin is superseded", st(twinOld));
ok(/^superseded by #1000/.test(one("SELECT close_evidence FROM issue_triage WHERE issue_id = ?", twinOld).close_evidence), "naming its successor");
ok(one("SELECT status FROM remediation_contracts WHERE issue_id = ?", twinOld).status === "superseded", "its failing contract is superseded first");
ok(st(fleetCrit).priority === "high" && acts("demote").includes(fleetCrit), "a stale fleet-filed critical is demoted", st(fleetCrit));
ok(st(ownerCrit).priority === "critical", "an owner-filed critical keeps critical");
ok(st(codeCrit).priority === "critical", "a critical with a code-task line keeps critical");
ok(st(youngCrit).priority === "critical", "a critical younger than 24 h keeps critical");
const focus = q("SELECT issue_id FROM program_focus").map((r) => r.issue_id);
const promoted = acts("promote");
ok(promoted.length > 0 && promoted.every((i) => focus.includes(i) && st(i).priority === "high"), "focus issues at medium/low are promoted to high", promoted);
ok(one("SELECT COUNT(*) AS n FROM agent_issues WHERE status = 'open' AND priority = 'low' AND id IN (SELECT issue_id FROM program_focus)").n === 0, "no focus issue is left at low");
const brief = one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary;
ok(/decision/i.test(brief), "the portfolio brief reports the decisions", brief);
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE '%persona_actions%' OR actor LIKE 'management-personas%'").n >= 1, "the hour's decisions are in decision_log");
ok(Number(one("SELECT last_value FROM metric_registry WHERE metric = 'persona_actions_24h'").last_value) === q("SELECT * FROM persona_actions").length, "persona_actions_24h counts them");

// the next tick refills the slots the closes freed; the one after it, with nothing changed, takes no new decision
tick();
const n1 = one("SELECT COUNT(*) AS n FROM persona_actions").n; const before1 = q("SELECT id FROM persona_actions").map(r=>r.id);
tick();
ok(one("SELECT COUNT(*) AS n FROM persona_actions").n === n1, "an unchanged tick takes no new decision", q("SELECT kind, issue_id, evidence FROM persona_actions WHERE id > ?", Math.max(...before1)));

// a promoted issue leaves focus (the program's slots shrink): its priority is restored
const p0 = promoted[promoted.length - 1];
const before = one("SELECT from_value FROM persona_actions WHERE kind = 'promote' AND issue_id = ?", p0).from_value;
run("UPDATE ops_config SET value = '1' WHERE key = 'persona_focus_slots'");
tick();
ok(!q("SELECT issue_id FROM program_focus").map((r) => r.issue_id).includes(p0), "the issue left focus");
ok(st(p0).priority === before, "its priority is restored", [st(p0), before]);
ok(one("SELECT reverted_at FROM persona_actions WHERE kind = 'promote' AND issue_id = ?", p0).reverted_at, "the promote row is marked reverted");

// the switch: persona_actions = off stops the decisions
run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off')");
const c2 = issue("another fleet critical", "critical", { source: "qnfo-fleet-control" });
run("UPDATE ops_config SET value = '6' WHERE key = 'persona_focus_slots'");
const n2 = one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind <> 'restore'").n;
tick();
ok(st(c2).priority === "critical", "with persona_actions off nothing is demoted");
ok(one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind <> 'restore'").n === n2, "and nothing is promoted or closed");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
