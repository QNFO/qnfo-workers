// FLEET-JOURNEYS-2 (0.27.0) offline suite. Slices the module between its markers out of worker.js and runs journeyTick against stub
// service bindings and an in-memory SQLite that stands in for qnfo-audit. Proves: every journey passes on a healthy fleet; a broken
// hop fails its journey, records the path with the failing hop and files one issue that names the hop's worker; a second failure
// updates it; a pass closes it with evidence unless the other runner's newest run failed; registry drift is healed and logged;
// real-traffic errors above 5% fail traffic-health and name the top route, client cancellations do not count; the ask journey runs
// only on its 6-hourly slot; ops_config fleet_journeys = off stops the tick; GET /journeys builds the hop graph.
// Run: node qnfo-fleet-control/journeys.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// ---- FLEET-JOURNEYS-2:BEGIN ----"), b = src.indexOf("// ---- FLEET-JOURNEYS-2:END ----");
if (a < 0 || b < a) throw new Error("FLEET-JOURNEYS-2 markers not found");
// timedFetch (outside the slice) serves worker sources from this checkout, as raw.githubusercontent.com serves main.
globalThis.__tel = [];
globalThis.__tf = async (url, opts) => {
  if (/telemetry\/query$/.test(url)) return new Response(JSON.stringify({ success: true, result: { events: globalThis.__tel } })); const m = /qnfo-workers\/main\/([a-z0-9-]+)\/worker\.js/.exec(url); try { return new Response(readFileSync(new URL("../" + m[1] + "/worker.js", import.meta.url), "utf8")); } catch (e) { return new Response("", { status: 404 }); } };
const M = new Function("var VERSION = '0.27.0-test'; var timedFetch = globalThis.__tf;\n" + src.slice(a, b) + "\nreturn { journeyTick, journeysStatus, jrnParseSse, jrnAgeMin, jrnAnchor };")();

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 27), "VERSION is at least 0.27.0");
ok(/onTwentyGrid\) ctx\.waitUntil\(journeyTick\(/.test(src), "journeyTick runs on the 20-minute grid");
ok(src.indexOf('p === "/journeys" && request.method === "GET"') > 0, "GET /journeys is routed");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
for (const bnd of ["SVC_QNFO_GATEWAY", "SVC_QNFO_AI_SEARCH", "SVC_DEPLOY_GUARD", "SVC_QNFO_DASH", "SVC_QNFO_OPS", "SVC_QNFO_AI", "SVC_QNFO_PDF"]) ok(toml.indexOf('binding = "' + bnd + '"') > 0, "wrangler.toml declares " + bnd);

function mkDb() {
  const s = new DatabaseSync(":memory:");
  s.exec(`CREATE TABLE journey_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, runner TEXT NOT NULL, journey TEXT NOT NULL, ok INTEGER NOT NULL, steps INTEGER, failed INTEGER, ms INTEGER, failed_json TEXT, path_json TEXT, healed_json TEXT, version TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, close_channel TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, close_evidence TEXT);
  CREATE TRIGGER t AFTER INSERT ON agent_issues BEGIN INSERT INTO issue_triage (issue_id) VALUES (NEW.id); END;
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
  INSERT INTO metric_registry (metric) VALUES ('fleet_journeys_failing');
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, version TEXT, updated_at TEXT, state TEXT);
  INSERT INTO service_registry VALUES ('idea-hub', '1.0.0', NULL, 'live'), ('qnfo-ai', '5.36.2-log-catches', NULL, 'live');
  CREATE TABLE self_heal_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref TEXT, action TEXT, ts TEXT, status TEXT, verified_at TEXT, claim TEXT, confidence TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, script_name TEXT, event_type TEXT, outcome TEXT, url TEXT, status INTEGER, exceptions_json TEXT);
  CREATE TABLE analytics_dash_workers (worker TEXT PRIMARY KEY, requests INTEGER);
  CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, payload TEXT);
  INSERT INTO analytics_dash_workers VALUES ('qnfo-ops', 4664), ('idea-hub', 1885);`);
  const wrap = (sql) => {
    let args = [];
    const st = s.prepare(sql);
    const o = { bind: (...x) => { args = x.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v)); return o; },
      all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) || null, run: async () => { const r = st.run(...args); return { meta: { changes: r.changes } }; } };
    return o;
  };
  return { raw: s, prepare: wrap };
}
const iso = (minAgo, now) => new Date(now - minAgo * 60000).toISOString();

function mkEnv(db, now, broken = {}) {
  const claims = [];
  const svc = (handler) => ({ fetch: async (url, init) => { const r = await handler(new URL(url), init || {}); return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status || 200 }); } });
  const sse = 'event: meta\ndata: {"sources":[{"url":"https://papers.qnfo.org/papers/p1"}]}\n\nevent: token\ndata: {"t":"A long enough answer to the question that the journey accepts as a real answer to it [1]."}\n\nevent: done\ndata: {"id":"a"}\n\n';
  return {
    AUDIT_DB: db, CF_API_TOKEN: "t",
    SVC_QNFO_GATEWAY: svc((u) => {
      if (u.pathname === "/api/papers") return { body: { total: 1, items: [{ id: "oai:papers.qnfo.org:p1", slug: "p1", title: "A Paper on Things" }] } };
      if (u.pathname === "/papers/p1") return broken.page ? { status: 500, body: "err" } : { body: "<h1>A Paper on <em>Things</em></h1>" };
      if (u.pathname.startsWith("/papers/zz-journey-negative-control-")) return broken.failopen ? { body: "<h1>ok</h1>" } : { status: 404, body: "not found" };
      if (u.pathname === "/feed.json") return { body: { items: [{ url: "https://papers.qnfo.org/papers/p1" }] } };
      if (u.pathname === "/oai") return { body: "<record><identifier>oai:papers.qnfo.org:p1</identifier></record>" };
      if (u.pathname === "/api/render-health") return { body: { last_checked: iso(300, now).replace("T", " ").slice(0, 19) } };
      return { status: 404, body: {} };
    }),
    SVC_DEPLOY_GUARD: svc(async (u, init) => {
      const bd = init.body ? JSON.parse(init.body) : {};
      if (u.pathname === "/work-lock/acquire") { if (!/^(file|issue):/.test(bd.key || "")) return { status: 400, body: { error: "key must be issue:<id> or file:<path>" } }; claims.push({ holder: bd.owner }); return { body: { acquired: true, token: "t" } }; }
      if (u.pathname === "/work-lock/release") { if (!broken.release) claims.length = 0; return { body: { released: true } }; }
      if (u.pathname === "/work-locks") return { body: { claims: claims.slice() } };
      return { status: 404, body: {} };
    }),
    SVC_QNFO_OPS: svc(() => ({ body: { fleet: [
      { name: "idea-hub", healthy: true, version: "1.10.0-topic-clusters-derived", probe: "binding:CH_IDEA_HUB" },
      { name: "qnfo-ai", healthy: true, version: "5.36.2-log-catches" },
      { name: "personal-api", healthy: broken.blind ? null : true, version: "4.9.1" }] } })),
    SVC_QNFO_DASH: svc((u) => u.pathname === "/api/loop" ? { body: { last_sync: iso(broken.stale ? 300 : 5, now), last_execute: iso(5, now), last_execute_summary: { failed: 0 } } } : { body: { generated_at: iso(5, now), issue_counts: { err: 0 } } }),
    SVC_QNFO_AI_SEARCH: svc((u) => u.pathname === "/api/loop" ? { body: { runs: [{ ts: iso(20, now) }] } } : { body: sse }),
    SVC_QNFO_AI: svc((u) => u.pathname === "/health" ? { body: { bindings: { ai: true, auth: true, query_db: true, qnfo_infra: true, qnfo_intent: true } } } : { body: { data: [{ id: "qnfo" }] } }),
    SVC_QNFO_PDF: svc(() => ({ body: { ok: true } })),
  };
}
const NOW = Date.parse("2026-10-14T01:20:00Z"); // hour 1: not an ask slot
const q = (db, sql, ...x) => db.raw.prepare(sql).all(...x);

// 1. A healthy fleet: every journey passes, the registry drift on idea-hub is healed and logged, nothing is filed.
let db = mkDb();
let r = await M.journeyTick(mkEnv(db, NOW), { now: NOW });
ok(r.ran && r.failing.length === 0, "healthy fleet: no journey fails", r);
const names = q(db, "SELECT journey FROM journey_runs ORDER BY journey").map((x) => x.journey);
ok(JSON.stringify(names) === JSON.stringify(["ai-router", "binding-census", "deploy-coherence", "lock-roundtrip", "loop-heartbeats", "negative-control", "papers-path", "traffic-health"]), "eight journeys recorded, ask-path off-slot", names);
ok(q(db, "SELECT version FROM service_registry WHERE service = 'idea-hub'")[0].version === "1.10.0-topic-clusters-derived", "registry drift healed to the worker's own version");
ok(q(db, "SELECT COUNT(*) n FROM self_heal_actions WHERE kind = 'fleet-journeys' AND action LIKE '%1.0.0 -> 1.10.0%'")[0].n === 1, "the fix is logged with the old value");
ok(r.healed === 1, "tick reports one heal", r);
ok(q(db, "SELECT COUNT(*) n FROM agent_issues")[0].n === 0, "nothing filed on a healthy fleet");
ok(q(db, "SELECT last_value v FROM metric_registry")[0].v === "0", "metric 0");
const pp = JSON.parse(q(db, "SELECT path_json p FROM journey_runs WHERE journey = 'papers-path'")[0].p);
ok(pp.length === 4 && pp.every((h) => h.to === "qnfo-gateway" && h.status === 200) && pp[1].path === "papers.qnfo.org/papers/p1", "papers-path records four gateway hops with host and path", pp);

// 2. A broken hop: the paper page answers 500. The journey fails, its issue names the hop's worker, a second failure updates it.
r = await M.journeyTick(mkEnv(db, NOW + 1200e3, { page: true }), { now: NOW + 1200e3 });
ok(r.failing.length === 1 && r.failing[0] === "papers-path", "a broken page fails papers-path only", r);
let iss = q(db, "SELECT * FROM agent_issues");
ok(iss.length === 1 && iss[0].title.startsWith("FLEET-JOURNEY-FAILED-1: papers-path (1 of 4") && iss[0].description.indexOf("Hops that answered an error: qnfo-gateway") > 0, "one issue naming the failing hop's worker", iss[0]);
ok(iss[0].description.indexOf("SVC_QNFO_GATEWAY->qnfo-gateway papers.qnfo.org/papers/p1 500") > 0, "the issue carries the path taken");
{ const d = iss[0].description, m = /\ncode-task: repo=qnfo-workers path=qnfo-gateway\/worker\.js\ncode-anchor: (.+)$/.exec(d);
  const gw = readFileSync(new URL("../qnfo-gateway/worker.js", import.meta.url), "utf8");
  ok(m && gw.split(m[1]).length === 2, "the issue carries a code task whose anchor occurs exactly once in qnfo-gateway/worker.js (JOURNEY-CODE-TASK-1)", m && m[1]); }
ok(q(db, "SELECT last_value v FROM metric_registry")[0].v === "1", "metric counts the failing journey");
await M.journeyTick(mkEnv(db, NOW + 2400e3, { page: true }), { now: NOW + 2400e3 });
ok(q(db, "SELECT COUNT(*) n FROM agent_issues")[0].n === 1, "a second failure updates, never duplicates");

// 3. Recovery while the outside runner's newest run still fails: stays open. Then the runner passes: it closes with evidence.
db.raw.prepare("INSERT INTO journey_runs (ts, runner, journey, ok) VALUES (?, 'gha', 'papers-path', 0)").run(iso(5, NOW + 3600e3));
await M.journeyTick(mkEnv(db, NOW + 3600e3), { now: NOW + 3600e3 });
ok(q(db, "SELECT status FROM agent_issues")[0].status === "open", "stays open while the other runner's newest run failed");
db.raw.prepare("INSERT INTO journey_runs (ts, runner, journey, ok) VALUES (?, 'gha', 'papers-path', 1)").run(iso(1, NOW + 4800e3));
await M.journeyTick(mkEnv(db, NOW + 4800e3), { now: NOW + 4800e3 });
iss = q(db, "SELECT a.status, a.close_channel, t.close_evidence FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id");
ok(iss[0].status === "closed" && iss[0].close_channel === "auto-recovery" && /passed all 4 steps/.test(iss[0].close_evidence) && /qnfo-gateway 200/.test(iss[0].close_evidence), "closes on recovery with the passing path as evidence", iss[0]);

// 4. Other broken hops: a lock left behind, a blind census, a stale loop each fail their own journey.
for (const [k, j] of [["release", "lock-roundtrip"], ["blind", "binding-census"], ["stale", "loop-heartbeats"]]) {
  const d = mkDb();
  const rr = await M.journeyTick(mkEnv(d, NOW, { [k]: true }), { now: NOW });
  ok(rr.failing.length === 1 && rr.failing[0] === j, k + " fails " + j + " only", rr);
}

// 5. Real traffic over 6 h: qnfo-ops 250 server errors over ~1166 requests (a quarter of 4664) fails, names the route and carries a
// code task on the route's handler in qnfo-ops; idea-hub's 115 client cancellations do not count.
db = mkDb();
// JOURNEY-TEST-TICK-CLOCK-1: since qnfo-fleet-control 0.31.1 (JRN-CLOCK-1, PR 1263) traffic-health reads its 6 h window from the tick's
// now, so the rows are planted relative to the fixed NOW again and the case no longer depends on the hour the suite runs. PR 1264 had
// planted them on the wall clock while the worker still read it; with both merged the "older than 6 h" case failed.
const WALL = NOW;
const ins = db.raw.prepare("INSERT INTO worker_logs (ts_ms, script_name, event_type, outcome, url, status, exceptions_json) VALUES (?, ?, 'fetch', ?, ?, NULL, ?)");
for (let i = 0; i < 250; i++) ins.run(WALL - 3600e3, "qnfo-ops", "exception", "https://qnfo-ops.internal/registry/register", '[{"message":"D1_ERROR: duplicate column name"}]');
for (let i = 0; i < 115; i++) ins.run(WALL - 3600e3, "idea-hub", "canceled", "https://ideas.qnfo.org/api/sessions", "[]");
r = await M.journeyTick(mkEnv(db, NOW), { now: NOW });
const th = JSON.parse(q(db, "SELECT failed_json f FROM journey_runs WHERE journey = 'traffic-health'")[0].f);
ok(r.failing.indexOf("traffic-health") >= 0 && th.length === 1 && th[0].step.startsWith("qnfo-ops") && /registry\/register/.test(th[0].detail) && /21\.4%/.test(th[0].detail), "traffic-health fails qnfo-ops with its top route; cancellations ignored", th);
{ const d = q(db, "SELECT description FROM agent_issues WHERE title LIKE 'FLEET-JOURNEY-FAILED-1: traffic-health %'")[0].description;
  ok(/code-task: repo=qnfo-workers path=qnfo-ops\/worker\.js\ncode-anchor: .*"\/registry\/register"/.test(d), "the traffic issue's code task points at the failing route's handler", d.slice(-220)); }
db.raw.exec("UPDATE worker_logs SET ts_ms = " + (WALL - 7 * 3600e3));
r = await M.journeyTick(mkEnv(db, NOW + 60e3), { now: NOW + 60e3 });
ok(r.failing.indexOf("traffic-health") < 0, "errors older than the 6 h window no longer fail traffic-health", r);

// 5a. Handled 5xx answers from the telemetry API: qnfo-ops 40 x 502 on /v1/chat/completions over ~1166 requests (3.4%) fails with
// the route and a code task; a filter that did not apply and a blind query (Cloudflare Issues shows a 5xx group) each fail.
{ const ev = (st, path) => ({ $workers: { scriptName: "qnfo-ops", event: { request: { url: "https://ops.qnfo.org" + path }, response: { status: st } } } });
  globalThis.__tel = Array.from({ length: 40 }, () => ev(502, "/v1/chat/completions"));
  let d = mkDb(); let rr = await M.journeyTick(mkEnv(d, NOW), { now: NOW });
  let f = JSON.parse(q(d, "SELECT failed_json f FROM journey_runs WHERE journey = 'traffic-health'")[0].f);
  ok(f.length === 1 && /qnfo-ops 5xx/.test(f[0].step) && /\/v1\/chat\/completions 502 x40/.test(f[0].detail), "a 5xx rate above 2% fails traffic-health with its route", f);
  ok(/code-task: repo=qnfo-workers path=qnfo-ops\/worker\.js\ncode-anchor: .*\/v1\/chat\/completions/.test(q(d, "SELECT description FROM agent_issues")[0].description), "the 5xx route gets a code task on qnfo-ops");
  globalThis.__tel = [ev(200, "/x")];
  d = mkDb(); await M.journeyTick(mkEnv(d, NOW), { now: NOW });
  f = JSON.parse(q(d, "SELECT failed_json f FROM journey_runs WHERE journey = 'traffic-health'")[0].f);
  ok(f.some((x) => x.step === "telemetry 5xx filter applied"), "a returned event below 500 means the filter did not apply", f);
  globalThis.__tel = [];
  d = mkDb(); d.raw.prepare("INSERT INTO fleet_issue_dispatch VALUES ('cf-obs-1', 'worker-observability', ?)").run(JSON.stringify({ service: "qnfo-ai", title: "HttpServerError · HTTP 502", lastObserved: NOW - 600e3 }));
  await M.journeyTick(mkEnv(d, NOW), { now: NOW });
  f = JSON.parse(q(d, "SELECT failed_json f FROM journey_runs WHERE journey = 'traffic-health'")[0].f);
  ok(f.some((x) => /telemetry sees every 5xx group/.test(x.step) && /qnfo-ai/.test(x.detail)), "a 5xx group Cloudflare reports but telemetry missed fails as blind", f);
  globalThis.__tel = [];
  // CF-ISSUES-LOOP-1: an active Cloudflare error group seen in 6 h fails traffic-health; a scanner probe group and a stale group do not.
  d = mkDb();
  const ins2 = d.raw.prepare("INSERT INTO fleet_issue_dispatch VALUES (?, 'worker-observability', ?)");
  ins2.run("cf-obs-a", JSON.stringify({ service: "qnfo-fleet-control", title: "Unexpected end of JSON input", status: "active", lastObserved: NOW - 900e3 }));
  ins2.run("cf-obs-b", JSON.stringify({ service: "qnfo-gateway", title: "Potential vulnerability scan · wordpress · low risk", status: "active", lastObserved: NOW - 900e3 }));
  ins2.run("cf-obs-c", JSON.stringify({ service: "qnfo-ai", title: "Old failure", status: "active", lastObserved: NOW - 8 * 3600e3 }));
  await M.journeyTick(mkEnv(d, NOW), { now: NOW });
  f = JSON.parse(q(d, "SELECT failed_json f FROM journey_runs WHERE journey = 'traffic-health'")[0].f);
  ok(f.length === 1 && /Cloudflare Observability error group/.test(f[0].step) && /qnfo-fleet-control: Unexpected end/.test(f[0].detail) && !/wordpress|Old failure/.test(f[0].detail), "a recurring Cloudflare error group fails traffic-health; scanner probes and stale groups do not", f); }

// 5b. Negative control: a gateway that answers 200 for a paper that cannot exist fails open; its hops never earn a code task.
{ const d = mkDb(); const rr = await M.journeyTick(mkEnv(d, NOW, { failopen: true }), { now: NOW });
  const iss2 = q(d, "SELECT description FROM agent_issues");
  ok(rr.failing.length === 1 && rr.failing[0] === "negative-control" && iss2.length === 1 && iss2[0].description.indexOf("code-task:") < 0 && /Hops that answered an error: none/.test(iss2[0].description), "a fail-open route fails negative-control, with no code task on its expected-error hops", iss2[0] && iss2[0].description.slice(0, 300)); }
ok(M.jrnAnchor(readFileSync(new URL("../qnfo-gateway/worker.js", import.meta.url), "utf8"), "/api/render-health") === null, "a route with no unique line gets no anchor");

// 6. The ask journey runs on its slot (hour divisible by 6, first 20 minutes) and its citations resolve through the gateway.
db = mkDb();
const T6 = Date.parse("2026-10-14T06:00:00Z");
r = await M.journeyTick(mkEnv(db, T6), { now: T6 });
const ask = q(db, "SELECT ok, path_json FROM journey_runs WHERE journey = 'ask-path'");
ok(ask.length === 1 && ask[0].ok === 1 && JSON.parse(ask[0].path_json).some((h) => h.to === "qnfo-gateway" && h.path === "papers.qnfo.org/papers/p1"), "ask-path runs at 06:00 and follows its citation to the gateway", ask);

// 7. Kill switch, a missing binding, and the status view.
db = mkDb(); db.raw.exec("INSERT INTO ops_config VALUES ('fleet_journeys', 'off')");
r = await M.journeyTick(mkEnv(db, NOW), { now: NOW });
ok(!r.ran && q(db, "SELECT COUNT(*) n FROM journey_runs")[0].n === 0, "ops_config fleet_journeys = off stops the tick", r);
db = mkDb();
const env7 = mkEnv(db, NOW); delete env7.SVC_DEPLOY_GUARD;
r = await M.journeyTick(env7, { now: NOW });
ok(r.failing.indexOf("lock-roundtrip") >= 0 && /binding missing/.test(q(db, "SELECT path_json p FROM journey_runs WHERE journey = 'lock-roundtrip'")[0].p), "a missing binding fails its journey and says so");
// JOURNEYS-TEST-CLOCK-1: journeysStatus reads rows newer than Date.now() - 24 h, but this suite plants its rows at NOW (2026-10-14), so on the
// wall clock every row aged out on 2026-10-15T01:20Z and the assertion below failed on main and on every pull request. The clock is held at
// the suite's own NOW for this one call and restored in finally, so the 24 h window means what it meant when the suite was written.
const realNow = Date.now;
Date.now = () => NOW;
let st;
try { st = await M.journeysStatus(env7); } finally { Date.now = realNow; }
ok(st.ok && st.journeys.length === 8 && st.graph.some((e) => e.from === "qnfo-fleet-control" && e.to === "qnfo-gateway" && e.calls === 6 && e.errors === 0) && st.graph.some((e) => e.to === "qnfo-ops" && e.calls === 1), "GET /journeys returns the newest runs and the hop graph", st.graph);
ok(M.jrnAgeMin("2026-10-14 01:10:00", NOW) === 10 && M.jrnAgeMin(null, NOW) === null, "age parses the D1 datetime form");

console.log(`journeys: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
