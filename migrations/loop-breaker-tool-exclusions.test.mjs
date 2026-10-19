// LOOP-BREAKER-TOOL-EXCLUSIONS-1 offline suite: runs 2026-10-19-loop-breaker-tool-exclusions.sql on SQLite against the live
// v_loop_breaker_signatures definition (read from the migration's own Rollback header). Proves: before the apply the loop breaker lists the
// ops_d1_query "no such column" and container_workspace_exec "command exited" recurrences (issues 100128 and 100127); after it, ops_ai_tool
// rows that tool_error_exclusions classifies are not listed, a genuine ops_ai_tool failure still is, a non-tool event that merely contains an
// exclusion word still is, the code-task branch is unchanged, a re-apply is a no-op, the backup holds the old definition, the detector
// reads 1, and the Rollback header restores the old view.
// Run: node migrations/loop-breaker-tool-exclusions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("./2026-10-19-loop-breaker-tool-exclusions.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const rb = (/^-- Rollback: (.*)$/m.exec(mig) || [])[1] || "";
const oldView = (/(CREATE VIEW v_loop_breaker_signatures AS .*?HAVING COUNT\(\*\) >= 3); DELETE FROM remediation_contracts/.exec(rb) || [])[1] || "";
ok(oldView.startsWith("CREATE VIEW v_loop_breaker_signatures") && !oldView.includes("tool_error_exclusions"), "the Rollback header carries the old view definition", oldView.slice(0, 80));
const sqlBody = mig.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const stmts = sqlBody.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const newView = stmts.find((s) => /^CREATE VIEW v_loop_breaker_signatures/.test(s));
ok(!!newView && newView.includes("tool_error_exclusions") && newView.includes("kind = 'ops_ai_tool'"), "the migration creates the view with the exclusion on ops_ai_tool rows");

const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE tool_error_exclusions (pattern TEXT PRIMARY KEY, err_class TEXT, rationale TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, path TEXT, status TEXT, updated_at TEXT, last_error TEXT, merge_note TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, evidence TEXT, issue_id INTEGER);`);
  db.exec("INSERT INTO tool_error_exclusions VALUES ('no such column', 'agent-schema-guess', 'x'), ('command exited', 'agent-input-error', 'y'), ('HTTP 5', 'infra-artifact', 'z')");
  db.exec(oldView);
  const ins = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 minutes'), ?, ?, ?, ?, 'error')");
  let n = 0;
  const add = (kind, text, err, job, times) => { for (let i = 0; i < times; i++) ins.run("e" + (++n), kind, text, JSON.stringify({ error: err + " " + i }), job); };
  add("ops_ai_tool", "ops_d1_query", "D1_ERROR: no such column: ts at offset", "qnfo-ops", 4);
  add("ops_ai_tool", "container_workspace_exec", "command exited 1: bash: line 1: cd: /workspace/qw: No such file or directory", "qnfo-ops", 4);
  add("ops_ai_tool", "git_op", "binding unavailable: GITHUB_TOKEN missing", "qnfo-ops", 4);
  add("fleet-cron", "fleet cron fetch", "HTTP 503 from upstream", "qnfo-fleet-control", 4);
  const ct = db.prepare("INSERT INTO code_tasks (id, path, status, updated_at, last_error) VALUES (?, 'qnfo-x/worker.js', 'failed', strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'suite failed')");
  for (let i = 0; i < 3; i++) ct.run("c" + i);
  return db;
};
const listed = (db) => db.prepare("SELECT src, producer, sig FROM v_loop_breaker_signatures ORDER BY src, producer, sig").all();
const has = (rows, re) => rows.some((r) => re.test(r.sig + " " + r.producer));

{ const db = mk(); const r = listed(db);
  ok(has(r, /no such column/) && has(r, /command exited/) && has(r, /binding unavailable/) && has(r, /HTTP/) && has(r, /qnfo-x/), "before: the loop breaker lists every recurrence, caller mistakes included (the 100127 and 100128 shape)", r); }
{ const db = mk(); for (const s of stmts) db.exec(s);
  const r = listed(db);
  ok(!has(r, /no such column/) && !has(r, /command exited/), "after: the classified ops_ai_tool rows are not listed", r);
  ok(has(r, /binding unavailable/), "after: a genuine ops_ai_tool failure is still listed", r);
  ok(r.some((x) => x.producer === "qnfo-fleet-control" && /HTTP/.test(x.sig)), "after: a non-tool event that contains an exclusion word is still listed", r);
  ok(r.some((x) => x.src === "code-task"), "after: the code-task branch is unchanged", r);
  for (const s of stmts) db.exec(s);
  ok(JSON.stringify(listed(db)) === JSON.stringify(r), "a re-apply changes nothing");
  const bak = db.prepare("SELECT sql FROM bak_20261019_loop_breaker_view").all();
  ok(bak.length === 1 && bak[0].sql === oldView, "the backup table holds the old definition");
  ok(db.prepare("SELECT observed FROM (SELECT CAST((SELECT COUNT(*) FROM sqlite_master WHERE name = 'v_loop_breaker_signatures' AND instr(sql, 'tool_error_exclusions') > 0) AS TEXT) AS observed)").get().observed === "1", "the detector reads 1");
  const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-loop-breaker-counts-excluded-tool-errors'").get();
  ok(!!probe && db.prepare(probe.verify_probe).get().observed === "1" && db.prepare(probe.verify_probe).get().expected === "1", "the stored detector probe runs and passes", probe);
  ok(db.prepare("SELECT COUNT(*) n FROM control_registry WHERE control = 'loop_breaker_tool_exclusions'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'loop-breaker-counts-excluded-tool-errors'").get().n === 1, "the control and failure-mode rows exist once");
  // Rollback restores the old view
  db.exec("DROP VIEW IF EXISTS v_loop_breaker_signatures"); db.exec(oldView);
  ok(has(listed(db), /no such column/), "the Rollback definition lists the caller mistakes again");
}
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
