// BP26-LEASES-KILLSWITCH-1 offline suite (qnfo-deploy-guard 1.4.0). Drives the real fetch handler against an in-memory SQLite D1.
// Proves: with ops_config fleet_kill_switch = on a fresh work claim, a renewal and a deploy or secret lease are refused with 503 reason
// kill-switch, a release still works, reads and /health still answer, and one cloud_ops_events row of kind kill-switch.observed is written (not one per refusal);
// turning the switch off lets claims through again after the 30 second cache; GET /kill-switch reads the state; each fresh claim on a path takes the next fence
// number, a renewal keeps it, POST /work-lock/check is valid for the live token and fence and refused for a stale fence, a wrong token and a lapsed claim;
// the claim still works while work_claims has no fence column.
// Run: node qnfo-deploy-guard/kill-switch-fence.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
let T = 1_790_000_000_000;
Date.now = () => T;

function mk({ fenceCol = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE deploy_locks (worker TEXT PRIMARY KEY, token_hash TEXT NOT NULL, owner TEXT, actor TEXT, session_id TEXT, since TEXT NOT NULL, expires_at INTEGER NOT NULL, expected_version TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, version TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, step TEXT, attempts INTEGER, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT${fenceCol ? ", fence INTEGER" : ""});`);
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const KV = { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [] }; } };
  return { env: { AUDIT: { prepare: prep }, FLEET_CONFIG: KV }, db };
}
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
const O = "https://qnfo-deploy-guard.q08.workers.dev";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = async (env, path, body) => { const r = await call(env, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const get = async (env, path) => { const r = await call(env, path); const t = await r.text(); return { status: r.status, t, j: JSON.parse(t) }; };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// A. fencing
{
  const { env, db } = mk();
  const a = await post(env, "/work-lock/acquire", { key: "file:x/a.js", owner: "s1", ttl_sec: 600 });
  ok(a.status === 200 && a.j.fence === 1, "A1 the first claim on a path takes fence 1: " + JSON.stringify(a.j));
  const r = await post(env, "/work-lock/acquire", { key: "file:x/a.js", owner: "s1", token: a.j.token, ttl_sec: 600 });
  ok(r.status === 200 && r.j.renewed === true && r.j.fence === 1, "A2 a renewal keeps the fence: " + JSON.stringify(r.j));
  let c = await post(env, "/work-lock/check", { key: "file:x/a.js", token: a.j.token, fence: 1 });
  ok(c.status === 200 && c.j.valid === true && c.j.fence === 1 && c.j.holder === "s1", "A3 check is valid for the live token and fence: " + JSON.stringify(c.j));
  c = await post(env, "/work-lock/check", { key: "file:x/a.js", token: "wrong", fence: 1 });
  ok(c.status === 409 && c.j.valid === false, "A4 check refuses a wrong token");
  c = await post(env, "/work-lock/check", { key: "file:x/a.js", token: a.j.token, fence: 0 });
  ok(c.status === 409 && c.j.reason === "stale fence", "A5 check refuses a stale fence: " + JSON.stringify(c.j));
  await post(env, "/work-lock/release", { key: "file:x/a.js", token: a.j.token, outcome: "done" });
  const b = await post(env, "/work-lock/acquire", { key: "file:x/a.js", owner: "s2", ttl_sec: 600 });
  ok(b.status === 200 && b.j.fence === 2, "A6 the next claim on the path takes fence 2: " + JSON.stringify(b.j));
  c = await post(env, "/work-lock/check", { key: "file:x/a.js", token: a.j.token, fence: 1 });
  ok(c.status === 409 && c.j.valid === false, "A7 the first holder's token no longer passes the check");
  T += 700_000;
  c = await post(env, "/work-lock/check", { key: "file:x/a.js", token: b.j.token, fence: 2 });
  ok(c.status === 409 && c.j.valid === false, "A8 a lapsed claim fails the check");
  ok(db.prepare("SELECT COUNT(*) n FROM work_claims").get().n === 2, "A9 two ledger rows");
}

// B. the claim works while the fence column does not exist yet
{
  const { env } = mk({ fenceCol: false });
  const a = await post(env, "/work-lock/acquire", { key: "file:x/b.js", owner: "s1", ttl_sec: 600 });
  ok(a.status === 200 && a.j.acquired === true && (a.j.fence === null || a.j.fence === undefined), "B1 a claim still works without the fence column: " + JSON.stringify(a.j));
}

// C. the kill switch
{
  const { env, db } = mk();
  const held = await post(env, "/work-lock/acquire", { key: "file:x/c.js", owner: "s1", ttl_sec: 600 });
  ok(held.status === 200, "C0 a claim before the switch");
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('fleet_kill_switch', 'on')").run();
  T += 31_000;
  const a = await post(env, "/work-lock/acquire", { key: "file:x/d.js", owner: "s2", ttl_sec: 600 });
  ok(a.status === 503 && a.j.acquired === false && a.j.reason === "kill-switch", "C1 a fresh claim is refused: " + JSON.stringify(a.j));
  const rn = await post(env, "/work-lock/acquire", { key: "file:x/c.js", owner: "s1", token: held.j.token, ttl_sec: 600 });
  ok(rn.status === 503 && rn.j.reason === "kill-switch", "C2 a renewal is refused");
  const dl = await post(env, "/lock/acquire", { worker: "qnfo-ops", owner: "deployer", ttl_sec: 120 });
  ok(dl.status === 503 && dl.j.reason === "kill-switch", "C3 a deploy lease is refused");
  const sl = await post(env, "/secret-lock/acquire", { worker: "qnfo-ops", owner: "s3", ttl_sec: 120 });
  ok(sl.status === 503 && sl.j.reason === "kill-switch", "C4 a secret lease is refused");
  const n1 = db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'kill-switch.observed'").get().n;
  ok(n1 === 1, "C5 one observed event for four refusals in the same five minutes: " + n1);
  const rl = await post(env, "/work-lock/release", { key: "file:x/c.js", token: held.j.token, outcome: "done" });
  ok(rl.status === 200 && rl.j.released === true, "C6 a release still works while the switch is on: " + JSON.stringify(rl.j));
  ok((await get(env, "/work-locks")).status === 200 && (await get(env, "/health")).status === 200, "C7 reads and /health still answer");
  const ks = await get(env, "/kill-switch");
  ok(ks.status === 200 && ks.j.kill_switch === "on", "C8 GET /kill-switch says on: " + ks.t);
  const ck = await post(env, "/work-lock/check", { key: "file:x/c.js", token: held.j.token });
  ok(ck.status !== 200 || ck.j.valid !== true, "C9 a check never passes while the switch is on");
  db.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'fleet_kill_switch'").run();
  T += 31_000;
  const b = await post(env, "/work-lock/acquire", { key: "file:x/d.js", owner: "s2", ttl_sec: 600 });
  ok(b.status === 200 && b.j.acquired === true, "C10 off again: a claim goes through after the cache lapses: " + JSON.stringify(b.j));
  ok((await get(env, "/kill-switch")).j.kill_switch === "off", "C11 GET /kill-switch says off");
  T += 301_000;
  db.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'fleet_kill_switch'").run();
  T += 31_000;
  await post(env, "/lock/acquire", { worker: "qnfo-ops", owner: "deployer", ttl_sec: 120 });
  ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'kill-switch.observed'").get().n === 2, "C12 a refusal after five quiet minutes writes a second observed event");
}

// D. no ops_config table at all: the switch is off, nothing breaks
{
  const { env, db } = mk();
  T += 31_000;
  db.exec("DROP TABLE ops_config");
  const a = await post(env, "/work-lock/acquire", { key: "file:x/e.js", owner: "s1", ttl_sec: 600 });
  ok(a.status === 200 && a.j.acquired === true, "D1 a missing ops_config means off");
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
