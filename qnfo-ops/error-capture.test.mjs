// ERROR-DETAIL-CAPTURE-1 offline suite (qnfo-ops 2.38.40, agent_issues 1826).
// Loads the real worker.js (the cloudflare:workers import swapped for stubs) and drives its scheduled handler against an
// in-memory SQLite qnfo-audit and a scripted Workers Observability telemetry API. Proves: error events become worker_logs
// rows with the real outcome and exceptions_json, so the issue's evidence query counts them; ok events are not copied; the
// URL keeps origin and path only and a message's email, long token and long number are masked (worker_logs is served
// publicly); a second tick adds no duplicate (deduplicated by the event id); a refused query writes no row and an error
// heartbeat that names the API status; without CF_API_TOKEN nothing is called or written.
// Run: node qnfo-ops/error-capture.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint, DurableObject } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (src.indexOf(IMPORT) < 0) throw new Error("worker.js import line changed: update the loader in this test");
const W = (await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {}; var DurableObject = class {};")).toString("base64"))).default;

const say = console.log.bind(console);
console.log = () => {};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; say("FAIL " + m); } };

const TOKEN = "fixtureFAKEtokenABCDEFGHIJKLMNOPQRSTUVWXYZ0123";
const now = Date.now();
const EVENTS = [
  { timestamp: now - 5 * 60e3, dataset: "cloudflare-workers",
    $workers: { scriptName: "qnfo-fleet-dashboard", outcome: "exception", eventType: "fetch", cpuTimeMs: 12, wallTimeMs: 340,
      event: { request: { url: "https://fleet.qnfo.org/api/ask?q=alice%40example.com&k=" + TOKEN, method: "POST" }, response: { status: 500 } } },
    $metadata: { id: "evt-aaa-1", service: "qnfo-fleet-dashboard", level: "error",
      error: "TypeError: Cannot read properties of undefined (reading 'x') for alice@example.com key " + TOKEN + " order 123456789" } },
  { timestamp: now - 3 * 60e3,
    $workers: { scriptName: "qnfo-ai-calibration", outcome: "exceededCpu", eventType: "scheduled" },
    $metadata: { id: "evt-bbb-2", service: "qnfo-ai-calibration", level: "info", message: "tick" } },
  { timestamp: now - 2 * 60e3,
    $workers: { scriptName: "qnfo-gateway", outcome: "ok", eventType: "fetch" },
    $metadata: { id: "evt-ccc-3", service: "qnfo-gateway", level: "log", message: "served" } }
];

function d1(db) {
  const prep = (sql) => {
    let a = [];
    const q = {
      bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; },
      async all() { return { results: db.prepare(sql).all(...a) }; },
      async first() { return db.prepare(sql).get(...a) || null; },
      async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return q;
  };
  return { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

function mk(env = {}, telemetry = { status: 200, body: { success: true, result: { events: { events: EVENTS, count: EVENTS.length } } } }) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, linked_session TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT, error TEXT, updated_at TEXT);
  CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_hash TEXT UNIQUE NOT NULL, ts_ms INTEGER NOT NULL, ingested_at TEXT NOT NULL, script_name TEXT NOT NULL, event_type TEXT, outcome TEXT, url TEXT, method TEXT, status INTEGER, cpu_ms REAL, wall_ms REAL, logs_json TEXT, exceptions_json TEXT);`);
  const calls = [];
  globalThis.fetch = async (u, o) => {
    const url = String(u && u.url || u);
    calls.push({ url, method: (o && o.method) || "GET", body: o && o.body ? String(o.body) : "", headers: (o && o.headers) || {} });
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
    if (/\/workers\/observability\/telemetry\/query$/.test(url)) return J(telemetry.body, telemetry.status);
    if (/\/workers\/scripts$/.test(url)) return J({ result: [] });
    return new Response("{}", { status: 503 });
  };
  return { db, calls, env: Object.assign({ QNFO_AUDIT: d1(db), CF_API_TOKEN: "cf-test" }, env) };
}
const tick = async (t) => {
  const pending = [];
  await W.scheduled({ cron: "*/30 * * * *", scheduledTime: Date.now() }, t.env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
  await Promise.allSettled(pending);
};
const rows = (t) => t.db.prepare("SELECT * FROM worker_logs ORDER BY ts_ms").all();
const beats = (t) => t.db.prepare("SELECT status, text, meta FROM cloud_ops_events WHERE kind = 'error-capture-tick' ORDER BY ts").all();

// A. error events become worker_logs rows; the ok event does not.
{
  const t = mk();
  await tick(t);
  const q = t.calls.find((c) => /telemetry\/query$/.test(c.url));
  ok(q && q.method === "POST", "A one POST to the telemetry query endpoint");
  const body = q ? JSON.parse(q.body) : {};
  const span = body.timeframe ? body.timeframe.to - body.timeframe.from : 0;
  ok(body.view === "events" && span >= 30 * 60e3 && span <= 40 * 60e3, "A events view over a ~35-minute window: " + span);
  ok(JSON.stringify(body.parameters || {}).includes("$metadata.error"), "A filters on $metadata.error");
  const r = rows(t);
  ok(r.length === 2, "A two error rows, the ok event skipped: " + JSON.stringify(r.map((x) => x.script_name)));
  const dash = r.find((x) => x.script_name === "qnfo-fleet-dashboard");
  ok(dash && dash.outcome === "exception" && dash.status === 500 && dash.method === "POST" && dash.event_type === "telemetry:fetch", "A dashboard row keeps outcome, status, method and trigger");
  ok(dash && dash.url === "https://fleet.qnfo.org/api/ask", "A url keeps origin and path only: " + (dash && dash.url));
  const exc = dash ? JSON.parse(dash.exceptions_json) : [];
  ok(exc[0] && exc[0].name === "TypeError" && /Cannot read properties of undefined/.test(exc[0].message), "A exceptions_json carries the name and message");
  const all = JSON.stringify(r);
  ok(all.indexOf("alice@example.com") < 0 && all.indexOf("alice%40example.com") < 0 && all.indexOf(TOKEN) < 0 && all.indexOf("123456789") < 0, "A email, token and long number are masked everywhere");
  ok(exc[0] && /\[email\]/.test(exc[0].message) && /\[token\]/.test(exc[0].message), "A masks are visible in the message");
  const cal = r.find((x) => x.script_name === "qnfo-ai-calibration");
  ok(cal && cal.outcome === "exceededCpu" && cal.event_type === "telemetry:scheduled", "A an exceededCpu run without error text is still recorded");
  const ev = t.db.prepare("SELECT COUNT(*) AS n FROM worker_logs WHERE outcome <> 'ok' OR exceptions_json IS NOT NULL").get().n;
  ok(ev === 2, "A the issue's evidence query counts both rows");
  const b = beats(t);
  ok(b.length === 1 && b[0].status === "ok" && /http 200, 3 error event\(s\) in 35 min, 2 new worker_logs row\(s\) across 2 worker\(s\)/.test(b[0].text), "A heartbeat: " + JSON.stringify(b));

  // B. the next tick sees the same events and adds nothing.
  await tick(t);
  ok(rows(t).length === 2, "B no duplicate rows (deduplicated by event id)");
  const b2 = beats(t);
  ok(b2.length === 2 && /0 new worker_logs row/.test(b2[1].text), "B second heartbeat reports 0 new rows");
}

// C. a refused query writes no row and an error heartbeat naming the status and reason.
{
  const t = mk({}, { status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } });
  let threw = null;
  try { await tick(t); } catch (e) { threw = e; }
  ok(!threw, "C cron completes when the query is refused");
  ok(rows(t).length === 0, "C no worker_logs row");
  const b = beats(t);
  ok(b.length === 1 && b[0].status === "error" && /http 403/.test(b[0].text) && /Authentication error/.test(b[0].text), "C error heartbeat: " + JSON.stringify(b));
}

// D. without CF_API_TOKEN nothing is called or written.
{
  const t = mk({ CF_API_TOKEN: undefined });
  await tick(t);
  ok(!t.calls.some((c) => /telemetry/.test(c.url)), "D no telemetry call without the token");
  ok(rows(t).length === 0 && beats(t).length === 0, "D nothing written without the token");
}

say(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
