// PLAN-TRUST-PARITY-1 + PLAN-RELAPSE-BRIEF-1 offline suite (qnfo-code-orchestrator 0.25.0, agent_issues 100303, owner task op-mvg9vjkbaedc).
// The planner kept six hardcoded trusted entries while the merge runner reads ops_config code_merge_trusted_sources (18 live entries:
// session*, chat-session*, owner-queue*, qnfo-code-orchestrator ...), so issues from those sources were recorded "untrusted" and never
// planned although their tasks would merge. The planner now reads the same row with the same grammar, and a metric-relapse issue is
// planned from the structured fields of metric_registry and analytics_metric_triggers.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/plan-trust-parity.test.mjs   (exit 0 = all passed)
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

function makeD1() {
  const db = new DatabaseSync(":memory:");
  const wrap = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a.map((v) => (v === undefined ? null : v)); return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return st;
  };
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
    CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT, kind TEXT, base_url TEXT);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, baseline TEXT, target TEXT, last_value TEXT, refresh_cadence TEXT, owner TEXT);
    CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, operator TEXT, threshold REAL, enabled INTEGER DEFAULT 1);`);
  for (const n of ["q08-signal-engine", "qnfo-social", "qnfo-ai-search"]) db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run(n);
  return { prepare: wrap, _db: db };
}
const FILES = {
  "q08-signal-engine/worker.js": "function a() {\n  if (path === \"/api/f\") {\n    return 1;\n  }\n}",
  "qnfo-social/worker.js": "function postIt() {\n  return linkedinCadence(env);\n}",
  "qnfo-ai-search/worker.js": "function askLoop() {\n  return digestRows(env);\n}",
};
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const ANCHORS = { "q08-signal-engine": '  if (path === "/api/f") {', "qnfo-social": "  return linkedinCadence(env);", "qnfo-ai-search": "  return digestRows(env);" };
const FIX = (worker) => JSON.stringify({ code_fixable: true, reason: "one guard in " + worker, anchor: ANCHORS[worker], goal: "Directly after the anchor line add a check that returns HTTP 405 for any method other than POST, and changes nothing else in the file." });
function envWith(replies) {
  const prompts = [];
  return { env: { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), AI: { run: async (model, input) => { prompts.push({ model, input }); const r = replies.shift(); return { response: typeof r === "function" ? r(input) : r }; } } }, prompts };
}
const old = Date.now() - 3600e3;
function issue(env, f) {
  const r = env.AUDIT_DB._db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?,?,?,?,?,?,?)").run(f.title, f.description || "", f.source === undefined ? "qnfo-fleet-control" : f.source, f.category || "reliability", f.priority || "high", "open", f.created_at || old);
  return Number(r.lastInsertRowid);
}
const call = async (env, p) => (await worker.fetch(new Request("https://x" + p, { method: "POST", headers: { authorization: "Bearer t0ken" } }), env)).json();
const plan = (env) => call(env, "/v1/plan");
const plans = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM issue_plans ORDER BY issue_id").all();
const tasks = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").all();

const LIVE = "qnfo-fleet-dashboard:owner-request|OWNER-TASK-,qnfo-fleet-dashboard:owner-request|OWNER-NOTE-,claude-session*,claude-code-session*,qnfo-fleet-control|METRIC-TRIGGER-,session,qnfo-fleet-control|REACH-IDEA-,qnfo-fleet-control|TP-,TRANSFORMATION-PROGRAM-1|TP-,session*,chat-session*,owner-queue*,fi-executor,autonomy-first-gate,qnfo-code-orchestrator,qnfo-fleet-advisor,claude-chat*,chat:*,qnfo-evolve|EVOLVE-1,qnfo-fleet-control|METRIC-FIX-RELAPSED-1:,qnfo-fleet-control|METRIC-REGRESSION-1:";
const setList = (env, v) => env.AUDIT_DB._db.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', ?)").run(v);

const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(/^0\.(2[5-9]|[3-9]\d)\.|^[1-9]\d*\./.test(String(h.version)), "health: 0.25.0 or later", h.version);
ok(h.capabilities.includes("plan-trust-parity") && h.capabilities.includes("plan-relapse-brief"), "health lists both capabilities", h.capabilities);

// 0. parity: the planner's fallback list is the merge runner's constant, character for character
{
  const w = fs.readFileSync(path.join(here, "worker.js"), "utf8"), f = fs.readFileSync(path.join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
  const a = /var CM_TRUSTED_SOURCES = "([^"]*)"/.exec(f), b = /const PLAN_TRUSTED_DEFAULT = "([^"]*)"/.exec(w);
  ok(a && b && a[1] === b[1], "0 PLAN_TRUSTED_DEFAULT equals qnfo-fleet-control CM_TRUSTED_SOURCES", { merge: a && a[1], plan: b && b[1] });
}

// 1. with the live list, an issue from each trusted source is planned; an unknown source stays untrusted
// (one worker per issue: a file another task is changing is deferred, CODE-DISPATCH-DEDUPE-1)
{
  const srcs = [
    ["qnfo-fleet-dashboard:owner-request", "OWNER-TASK-1: "], ["session_01ABC", "a: "], ["chat-session-x", "b: "], ["owner-queue-7", "c: "], ["fi-executor", "d: "],
    ["claude-chat-9", "e: "], ["chat:abc", "f: "], ["qnfo-evolve", "EVOLVE-1: "], ["qnfo-code-orchestrator", "g: "], ["claude-session-1", "h: "],
  ];
  srcs.forEach((_, i) => { FILES["qnfo-wk" + i + "/worker.js"] = "function postIt() {\n  return linkedinCadence(env);\n}"; ANCHORS["qnfo-wk" + i] = "  return linkedinCadence(env);"; });
  const { env, prompts } = envWith(srcs.map((_, i) => FIX("qnfo-wk" + i)));
  setList(env, LIVE);
  srcs.forEach((_, i) => env.AUDIT_DB._db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run("qnfo-wk" + i));
  const ids = srcs.map(([source, title], i) => issue(env, { title: title + "qnfo-wk" + i + " cadence", source, description: "qnfo-wk" + i + " linkedinCadence should skip weekends", priority: "low" }));
  const bad = issue(env, { title: "LOOP-BREAKER-1: noise", source: "loop-breaker", description: "qnfo-wk0 again", priority: "critical" });
  const badEvolve = issue(env, { title: "OTHER-TITLE: qnfo-wk1", source: "qnfo-evolve", description: "qnfo-wk1 cadence", priority: "critical" });
  for (let i = 0; i < srcs.length + 3; i++) await plan(env);
  const byId = Object.fromEntries(plans(env).map((p) => [p.issue_id, p.outcome]));
  ok(ids.every((id) => byId[id] === "queued"), "1a every source on the merge runner's list is planned", { byId, why: plans(env).slice(0, 2).map((p) => p.detail) });
  ok(byId[bad] === "untrusted" && byId[badEvolve] === "untrusted", "1b an unknown source and a title outside qnfo-evolve|EVOLVE-1 stay untrusted", { bad: byId[bad], badEvolve: byId[badEvolve] });
  ok(prompts.length === srcs.length, "1c a model call only for the trusted ones", prompts.length);
}

// 2. without the ops_config row the default list applies: a session_ source is untrusted, a claude-session one is not
{
  const { env } = envWith([FIX("qnfo-social")]);
  const s1 = issue(env, { title: "x qnfo-social", source: "session_01ABC", description: "qnfo-social cadence", priority: "critical" });
  const s2 = issue(env, { title: "y qnfo-social", source: "claude-session-2", description: "qnfo-social linkedinCadence", priority: "low" });
  await plan(env); await plan(env);
  const byId = Object.fromEntries(plans(env).map((p) => [p.issue_id, p.outcome]));
  ok(byId[s1] === "untrusted" && byId[s2] === "queued", "2 default list: session_ untrusted, claude-session planned", byId);
}

// 3. a metric-relapse issue is planned from the structured fields, not its prose
{
  const { env, prompts } = envWith([FIX("qnfo-social")]);
  setList(env, LIVE);
  const d = env.AUDIT_DB._db;
  d.prepare("INSERT INTO metric_registry VALUES ('outreach_reply_rate_30d', '4.1 (13 replies to 318)', '>= 2 overall', '1.2', 'daily', 'qnfo-social')").run();
  d.prepare("INSERT INTO analytics_metric_triggers (metric_key, operator, threshold) VALUES ('outreach-reply-rate-30d', '<', 2)").run();
  const id = issue(env, { title: "METRIC-FIX-RELAPSED-1: outreach_reply_rate_30d", source: "qnfo-fleet-control", description: "PROSE-MARKER-XYZ the metric relapsed after its fix closed", priority: "high" });
  const r = await plan(env);
  const u = prompts[0] && prompts[0].input.messages ? prompts[0].input.messages.map((m) => m.content).join("\n") : JSON.stringify(prompts[0]);
  ok(r.outcome === "queued" && r.issue === id, "3a the relapse issue is planned and queued", r);
  ok(/baseline: 4\.1/.test(u) && /current value: 1\.2/.test(u) && /target: >= 2/.test(u) && /threshold: < 2/.test(u) && /window: 30 days/.test(u), "3b the prompt carries baseline, current value, target, threshold and window", u.slice(0, 600));
  ok(!/PROSE-MARKER-XYZ/.test(u), "3c the raw prose is not in the brief", u.slice(0, 300));
  ok(/brief from the structured fields of metric outreach_reply_rate_30d/.test(String(plans(env)[0].detail)), "3d the recorded reason names the brief", plans(env)[0].detail);
}

// 4. a metric-relapse issue whose metric is unknown to metric_registry falls back to the prose (no brief, nothing thrown)
{
  const { env, prompts } = envWith([FIX("qnfo-social")]);
  setList(env, LIVE);
  issue(env, { title: "METRIC-REGRESSION-1: no_such_metric", source: "qnfo-fleet-control", description: "qnfo-social linkedinCadence prose", priority: "high" });
  await plan(env);
  const u = prompts[0] ? JSON.stringify(prompts[0]) : "";
  ok(/prose/.test(u) && !/METRIC RELAPSE/.test(u), "4 unknown metric: prose brief, no structured block", u.slice(0, 200));
}

console.log("plan-trust-parity: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
