// DEFERRAL-HONEST-1 offline suite: replays migrations/2026-10-20-deferral-honest-verdicts.sql on SQLite (node:sqlite).
// Proves: the probes of issue-2111, issue-2446 and issue-2068 are verdicts (a measured value above target never starts with 'pending'), read the
// defect and never the status of the issue; the deferral start is cleared so the escalation issues read 'cleared'; EVID-GATE-A2-PUBLISHV2 is parked
// by a recorded decision; issue 2346 closes into the goal WORKERS-STANDARDS-ADVISORY-0 (contract first, so the close-while-contract-fails guard does
// not refuse it); a second apply changes nothing; the Rollback line restores every row from the backups.
// Run: node migrations/deferral-honest-verdicts.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-deferral-honest-verdicts.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, action TEXT NOT NULL DEFAULT '', verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, last_attempt_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT, next_due_at TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, remediation TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE, statement TEXT, goal_type TEXT, parent_objective TEXT, alignment TEXT, source TEXT, priority INTEGER, status TEXT, dod TEXT, owner TEXT, adopted_at TEXT, retired_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, last_error TEXT, ctx TEXT, updated_at TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
  CREATE TABLE ops_ai_log (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, ts TEXT, prompt_tokens INTEGER, ok INTEGER);
  CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_name TEXT, version_id TEXT, deployed_at TEXT, status TEXT);
  CREATE TABLE workers_bp_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, fail_count INTEGER, advisory_count INTEGER);
  CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') BEGIN
    SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
    SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error'));
  END;
  CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT,'append-only'); END;
  CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT,'append-only'); END;`);
const OLD = "SELECT 'ok' AS expected, 'pending: old probe' AS observed";
const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, status, last_verdict, attempts, deferred_since, next_due_at) VALUES (?, ?, ?, ?, 'd1-query', ?, ?, 7, '2026-10-12 17:42:24', '2026-10-20 05:00:00')");
ins.run("issue-2111", 2111, "old action 2111", OLD, "active", "deferred");
ins.run("issue-2446", 2446, "old action 2446", OLD, "active", "deferred");
ins.run("issue-2068", 2068, "old action 2068", OLD, "active", "deferred");
ins.run("issue-2346", 2346, "old action 2346", OLD, "active", "fail");
ins.run("EVID-GATE-A2-PUBLISHV2", null, "old action evid", OLD, "active", "deferred");
ins.run("issue-3", 3, "keep", "keep", "active", "deferred");
db.exec("INSERT INTO agent_issues VALUES (2346, 'umbrella', 'open', 0), (2111, 's', 'open', 0), (3, 'other', 'open', 0)");
db.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence, remediation) VALUES (2346, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', 'n', NULL, 'keep this remediation note')");
const get = (c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const probe = (c) => db.prepare(get(c).verify_probe).get();
// the escalation issue's closing probe, as the tick files it: still deferring while active with a deferral start and a deferred verdict
const stillDefers = (c) => !!db.prepare("SELECT 1 FROM remediation_contracts c WHERE c.class = ? AND c.status = 'active' AND c.deferred_since IS NOT NULL AND c.last_verdict LIKE 'deferred%'").get(c);
ok(stillDefers("issue-2111") && stillDefers("issue-2446") && stillDefers("issue-2068") && stillDefers("EVID-GATE-A2-PUBLISHV2"), "before: the four contracts defer");

db.exec(sql);

// ---- the three probes
for (const c of ["issue-2111", "issue-2446", "issue-2068"]) {
  const r = get(c);
  ok(r.status === "active" && r.last_verdict === null && r.deferred_since === null && r.verify_transport === "d1-query" && /DEFERRAL-HONEST-1/.test(r.action), c + ": restated, active, verdict and deferral start cleared", r);
  ok(!/agent_issues/.test(r.verify_probe), c + ": the probe never reads the status of an issue");
  ok(!stillDefers(c), c + ": the escalation probe reads cleared");
}
// 2111: tasks that END on the miss since the deploy
const task = db.prepare("INSERT INTO code_tasks VALUES (?, ?, ?, ?, ?)");
const MISS = "model m: edit 1: SEARCH text occurs 0 times in the shown content (it must be copied verbatim)";
for (let i = 0; i < 5; i++) task.run("old" + i, "failed", MISS, "", iso(24 * 30));
task.run("rec1", "merged", "", "ctx " + MISS, iso(2));
task.run("other", "failed", "suites fail", "", iso(1));
ok(probe("issue-2111").observed === "ok", "2111: five old failures and an unrelated failure do not count", probe("issue-2111"));
for (let i = 0; i < 3; i++) task.run("new" + i, "failed", MISS, "", iso(3 + i));
ok(probe("issue-2111").observed === "ok", "2111: three failed tasks since the deploy is at the target", probe("issue-2111"));
task.run("new3", "needs_human", MISS, "", iso(1));
let p = probe("issue-2111");
ok(p.expected === "ok" && /^SEARCH-miss tasks that ended failed/.test(p.observed) && / 4 /.test(p.observed) && /1 other tasks/.test(p.observed) && !/^pending/i.test(p.observed), "2111: four failed tasks read a verdict (not pending) and name the recovered one", p);
// 2446
db.exec("INSERT INTO metric_registry VALUES ('unmanaged_direct_spend_share', '0.5058')");
p = probe("issue-2446");
ok(p.expected === "ok" && /^above target: unmanaged_direct_spend_share reads 0\.5058/.test(p.observed) && !/^pending/i.test(p.observed), "2446: 0.5058 reads above target, a verdict", p);
db.exec("UPDATE metric_registry SET last_value = '0.4999'");
ok(probe("issue-2446").observed === "ok", "2446: at or under 0.5 reads ok", probe("issue-2446"));
db.exec("UPDATE metric_registry SET last_value = NULL");
ok(/^above target: .* reads \?/.test(probe("issue-2446").observed), "2446: an unreadable metric is not ok", probe("issue-2446"));
// 2068
ok(/^pending: qnfo-ops context-compact-2 is not deployed/.test(probe("issue-2068").observed), "2068: before the release is deployed it waits (a real wait)", probe("issue-2068"));
db.exec("INSERT INTO deployment_history (resource_name, version_id, deployed_at, status) VALUES ('qnfo-ops', '2.50.5-context-compact-2', '2026-10-19T13:23:03.256Z', 'success'), ('qnfo-ops', '2.39.2-context-compact', '2026-10-07T08:16:49.016Z', 'success')");
ok(probe("issue-2068").observed === "ok", "2068: deployed and no job row since reads ok", probe("issue-2068"));
db.exec("INSERT INTO ops_ai_log (source, ts, prompt_tokens, ok) VALUES ('job', '2026-10-17T18:01:57Z', 1593580, 1), ('public', '2026-10-20T04:56:24Z', 14233, 1)");
ok(probe("issue-2068").observed === "ok", "2068: a pre-release job over the ceiling and a public row do not count", probe("issue-2068"));
db.exec("INSERT INTO ops_ai_log (source, ts, prompt_tokens, ok) VALUES ('job', '2026-10-20T01:00:00Z', 250000, 1)");
ok(probe("issue-2068").observed === "ok", "2068: one small job since the release reads ok without waiting for three", probe("issue-2068"));
db.exec("INSERT INTO ops_ai_log (source, ts, prompt_tokens, ok) VALUES ('job', '2026-10-20T02:00:00Z', 900000, 1)");
p = probe("issue-2068");
ok(/^job prompt tokens above the ceiling: max 900000/.test(p.observed), "2068: a job at 900000 prompt tokens since the release fails", p);
db.exec("DELETE FROM ops_ai_log WHERE prompt_tokens = 900000");
db.exec("INSERT INTO ops_ai_log (source, ts, prompt_tokens, ok) VALUES ('job', '2026-10-12T00:00:00Z', 1000, 1), ('job', '2026-10-13T00:00:00Z', 1000, 1), ('job', '2026-10-20T03:00:00Z', 1000, 0), ('job', '2026-10-20T03:30:00Z', 1000, 0)");
p = probe("issue-2068");
ok(/^job ok share .* is below the 7 days before the release/.test(p.observed), "2068: with 3 or more job rows since the release an ok share below the week before fails", p);

// ---- parked gate
let e = get("EVID-GATE-A2-PUBLISHV2");
ok(e.status === "superseded" && /^superseded:publish-v2-metadata-obsolete/.test(e.last_verdict) && e.deferred_since === null && /^DEFERRAL-HONEST-1: parked by a recorded decision\. old action evid$/.test(e.action), "EVID-GATE-A2-PUBLISHV2 is parked with its reason", e);
ok(!stillDefers("EVID-GATE-A2-PUBLISHV2"), "EVID-GATE-A2-PUBLISHV2: its escalation probe reads cleared");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'DEFERRAL-HONEST-1:') = 1 AND instr(action, 'EVID-GATE-A2-PUBLISHV2') > 0").get().n === 1, "a decision_log row names EVID-GATE-A2-PUBLISHV2");

// ---- 2346 into the goal
const g = db.prepare("SELECT * FROM goals WHERE goal_key = 'WORKERS-STANDARDS-ADVISORY-0'").get();
ok(g && g.status === "adopted" && g.source === "agent_issues 2346 (DEFERRAL-HONEST-1, ISSUE-SLA-2H-1)" && /^Done when this query reads ok or 1: SELECT/.test(g.dod), "the goal is adopted and carries the probe as its DoD", g);
const tr = db.prepare("SELECT * FROM issue_triage WHERE issue_id = 2346").get();
ok(tr.triage_state === "closed" && tr.rc === "DEFERRAL-HONEST-1" && new RegExp("^superseded by goal WORKERS-STANDARDS-ADVISORY-0 \\(goals\\.id " + g.id + "\\)").test(tr.close_evidence) && tr.remediation === "keep this remediation note", "the triage row names the goal and keeps its remediation note", tr);
ok(db.prepare("SELECT status FROM agent_issues WHERE id = 2346").get().status === "closed", "issue 2346 closed (the contract was superseded first, so the close guard did not refuse it)");
ok(get("issue-2346").status === "superseded" && !stillDefers("issue-2346"), "the contract of 2346 is superseded");
ok(db.prepare("SELECT status FROM agent_issues WHERE id = 2111").get().status === "open", "issue 2111 stays open until its own probe passes twice");
// the goal's DoD probe
const dodSql = /^Done when this query reads ok or 1: (.*)$/s.exec(g.dod)[1];
const dod = () => db.prepare(dodSql).get();
ok(/^pending: no workers best-practice audit run/.test(dod().observed), "goal DoD: no audit run reads a real wait", dod());
db.exec("INSERT INTO workers_bp_runs (run_at, fail_count, advisory_count) VALUES ('" + iso(1) + "', 0, 42)");
ok(/^above target: the newest workers best-practice audit reads 0 fail and 42 advisory findings at /.test(dod().observed) && !/^pending/i.test(dod().observed), "goal DoD: 42 findings read above target, a verdict", dod());
db.exec("INSERT INTO workers_bp_runs (run_at, fail_count, advisory_count) VALUES ('" + iso(0) + "', 0, 0)");
ok(dod().observed === "ok", "goal DoD: 0 findings read ok", dod());

// ---- untouched rows, idempotence
ok(get("issue-3").verify_probe === "keep" && get("issue-3").last_verdict === "deferred" && get("issue-3").deferred_since !== null, "an unrelated deferred contract is untouched");
const before = JSON.stringify(db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all());
db.exec(sql);
ok(JSON.stringify(db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all()) === before, "a second apply changes no contract");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM goals").get().n === 1, "a second apply keeps one decision_log row and one goal");

// ---- rollback
db.exec(rollback);
for (const c of ["issue-2111", "issue-2446", "issue-2068", "issue-2346", "EVID-GATE-A2-PUBLISHV2"]) {
  const r = get(c);
  ok(r.verify_probe === OLD && r.action === "old action" + (c === "EVID-GATE-A2-PUBLISHV2" ? " evid" : " " + c.slice(6)) && r.status === "active" && r.deferred_since === "2026-10-12 17:42:24" && r.next_due_at === "2026-10-20 05:00:00", "rollback restores " + c, r);
}
ok(get("issue-2346").last_verdict === "fail" && get("issue-2111").last_verdict === "deferred", "rollback restores the verdicts");
ok(db.prepare("SELECT status FROM agent_issues WHERE id = 2346").get().status === "open" && db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id = 2346").get().close_evidence === null && db.prepare("SELECT status FROM goals WHERE goal_key = 'WORKERS-STANDARDS-ADVISORY-0'").get().status === "retired", "rollback reopens 2346, restores its triage row and retires the goal");
console.log("deferral-honest-verdicts: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
