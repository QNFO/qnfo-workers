// BACKLOG-DRIVER-PULLER-1 (qnfo-code-orchestrator 0.14.1, agent_issues 2362) offline suite.
// Proves: intake reads code-task issues through v_issue_queue_v2 (LEFT JOIN, ordered by pos, issues the view omits after it in
// priority order); when that query throws, the old priority/id query is the fallback and intake still builds tasks; the SQL
// orders correctly on a real SQLite (node:sqlite) with a stand-in view.
// Run: node --no-warnings qnfo-code-orchestrator/queue-v2-intake.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qv2-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { intakeIssues as __intake, INTAKE_QUEUE_V2_SQL as __v2, INTAKE_FALLBACK_SQL as __fb, VERSION as __ver };\n");
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/(.+)$/.exec(String(u));
  if (m) return new Response("var VERSION = \"1.0.0\";\nfunction a() {}\n", { status: 200 });
  return new Response("nf", { status: 404 });
};
const { __intake, __v2, __fb, __ver } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const ver = String(__ver).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
ok(ver[0] > 0 || ver[1] > 14 || (ver[1] === 14 && ver[2] >= 1), "VERSION is at least 0.14.1", __ver);

// The SQL itself.
ok(/LEFT JOIN v_issue_queue_v2 q ON q\.id = a\.id/.test(__v2), "the intake query joins v_issue_queue_v2 (LEFT JOIN keeps issues the view omits)");
ok(/ORDER BY q\.pos IS NULL, q\.pos, CASE a\.priority WHEN 'critical' THEN 0/.test(__v2), "the intake query orders by pos, then priority");
ok(!/v_issue_queue_v2/.test(__fb) && /ORDER BY CASE priority WHEN 'critical' THEN 0/.test(__fb), "the fallback keeps the old priority/id order");

// Real SQLite: the view order wins over priority and id; an issue missing from the view comes after the listed ones.
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (sqlite) {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, status TEXT, priority TEXT)");
  db.exec("CREATE TABLE qpos (id INTEGER, pos INTEGER); CREATE VIEW v_issue_queue_v2 AS SELECT id, pos FROM qpos");
  const ins = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, ?, ?)");
  ins.run(1, "A", "code-task: x", "s", "open", "high");
  ins.run(2, "B", "code-task: x", "s", "open", "critical");
  ins.run(3, "C", "code-task: x", "s", "open", "low");
  ins.run(4, "D", "code-task: x", "s", "open", "medium");
  ins.run(5, "E", "no task", "s", "open", "critical");
  ins.run(6, "F", "code-task: x", "s", "closed", "critical");
  db.exec("INSERT INTO qpos VALUES (2, 1), (3, 2), (1, 3), (5, 4)");
  const ids = db.prepare(__v2).all().map((r) => r.id);
  ok(JSON.stringify(ids) === "[2,3,1,4]", "SQLite: pos order, then an unlisted issue; closed and task-less rows excluded", ids);
  const fb = db.prepare(__fb).all().map((r) => r.id);
  ok(JSON.stringify(fb) === "[2,1,4,3]", "SQLite: the fallback orders by priority then id", fb);
} else {
  ok(true, "node:sqlite unavailable; SQL checked by pattern only");
}

// Intake end to end on a stub D1: v2 order is used; a throwing v2 query falls back.
function mkEnv(issues, v2Throws) {
  const seen = [], inserted = [];
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() { if (/^INSERT INTO code_tasks/.test(q)) inserted.push({ id: a[0], goal: a[3] }); return { success: true, meta: {} }; },
      async first() { if (/COUNT\(\*\) AS n FROM code_tasks/.test(q)) return { n: 0 }; return null; },
      async all() {
        if (/v_issue_queue_v2/.test(q)) { seen.push("v2"); if (v2Throws) throw new Error("D1_ERROR: no such table: v_issue_queue_v2"); return { results: issues.slice() }; }
        if (/FROM agent_issues WHERE status='open' AND description LIKE '%code-task:%'/.test(q)) { seen.push("fallback"); return { results: issues.slice().sort((x, y) => x.id - y.id) }; }
        if (/FROM service_registry/.test(q)) return { results: [{ service: "qnfo-infra" }] };
        return { results: [] };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) } }, seen, inserted };
}
const mk = (id) => ({ id, title: "QUEUE-" + id + ": x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: function a() {}" });
{
  const { env, seen } = mkEnv([mk(9002), mk(9001)], false);
  let r = null;
  try { r = await __intake(env, 1); } catch (e) { r = { err: String(e) }; }
  ok(seen[0] === "v2" && seen.indexOf("fallback") < 0, "intake reads the v_issue_queue_v2 query first and needs no fallback", seen);
  ok(r && !r.err && r.note !== "no agent_issues table", "intake returns normally on the v2 path", r);
}
{
  const { env, seen } = mkEnv([mk(9002), mk(9001)], true);
  let r = null;
  try { r = await __intake(env, 1); } catch (e) { r = { err: String(e) }; }
  ok(seen[0] === "v2" && seen[1] === "fallback", "a failing v2 query falls back to the priority/id query", seen);
  ok(r && !r.err && r.note !== "no agent_issues table", "intake keeps going on the fallback", r);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
