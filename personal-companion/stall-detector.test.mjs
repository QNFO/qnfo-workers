// personal-companion 1.13.0 COMPANION-PUBLISH-STALL-AUTO-1 suite (charter pillar: core).
// Failure mode proven: 48h with no piece and nothing outside the worker noticed. Now the hourly tick writes the metric,
// files one issue on a real stall (12h + last 2 generation runs failed), never twice, and closes it when a piece lands.
// Run: node personal-companion/stall-detector.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { companionStallDetector } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function setup() {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:");
  p.exec("CREATE TABLE companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, created_at TEXT); CREATE TABLE companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT)");
  a.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT); CREATE TABLE issue_triage (issue_id INTEGER, close_evidence TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
  a.exec("INSERT INTO metric_registry (metric) VALUES ('companion_hours_since_last_piece')");
  return { p, a, env: { PERSONAL: wrap(p), AUDIT: wrap(a) } };
}
const NOW = Date.parse("2026-10-07T08:00:00Z");
// stalled: last piece 48h ago, 2 failed runs
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-05T08:06:54.619Z')");
  T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','deepseek-reasoner','a','failed','no piece survived the gate'), ('2026-10-07T07:01Z','steward','','steward','alert','collapse'), ('2026-10-07T08:01Z','essay','deepseek-reasoner','b','failed','no piece survived the gate'), ('2026-10-07T08:01Z','essay','deepseek-reasoner','b','stage','composed 0 err: deepseek-reasoner: HTTP 402 Insufficient Balance')");
  const r = await companionStallDetector(T.env, NOW);
  ok(r.filed === true, "files on a real stall: " + JSON.stringify(r));
  const iss = T.a.prepare("SELECT * FROM agent_issues").all();
  ok(iss.length === 1 && /48h/.test(iss[0].title) && /HTTP 402/.test(iss[0].description), "issue names hours and the call error");
  ok(T.a.prepare("SELECT last_value FROM metric_registry").get().last_value === "47.9", "metric written");
  await companionStallDetector(T.env, NOW + 36e5);
  ok(T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 1, "never files twice");
  // recovery
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('new', '2026-10-07T08:30:00Z')");
  T.a.exec("INSERT INTO issue_triage (issue_id) VALUES (1)");
  const r2 = await companionStallDetector(T.env, NOW + 36e5);
  ok(r2.closed === 1, "closes on recovery");
  const row = T.a.prepare("SELECT status, close_channel FROM agent_issues").get();
  ok(row.status === "closed" && row.close_channel === "auto-recovery", "closed with auto-recovery");
  ok(/piece new/.test(T.a.prepare("SELECT close_evidence FROM issue_triage").get().close_evidence), "close evidence names the piece");
}
// not stalled: old piece but a recent run succeeded
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-06T08:00:00Z')");
  T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','x','a','failed','g'), ('2026-10-07T08:01Z','essay','x','b','ok','slug')");
  const r = await companionStallDetector(T.env, NOW);
  ok(!r.filed && T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 0, "a recent ok run is not a stall");
}
// fresh piece: no issue, metric under threshold
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('x', '2026-10-07T05:00:00Z')");
  const r = await companionStallDetector(T.env, NOW);
  ok(r.hours === 3 && r.closed === 0, "fresh piece: " + JSON.stringify(r));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
