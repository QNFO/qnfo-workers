// WORK-CLAIM-1 offline suite (qnfo-deploy-guard 1.3.21). Drives the real fetch handler against an in-memory SQLite D1 and a
// map-backed KV. Proves: a work claim is acquired with a token and an expiry; a second session is refused and told who holds
// it (and gets no token); the claim lapses at its TTL and a peer takes it; release with the wrong token is refused and leaves
// the claim; the holder's token renews and releases; the open read GET /work-locks lists key, holder and expiry and never a
// token or its hash; an issue claim writes agent_issues.linked_session for a live issue only; bad keys are refused; a refused
// work claim records no lock denial (so it cannot raise DEPLOY-LOCK-CONTENTION); deploy locks and secret leases are unchanged.
// Run: node qnfo-deploy-guard/work-lock.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

let T = 1_790_000_000_000; // controlled clock: the worker reads Date.now() for every lease decision
Date.now = () => T;

function mk() {
  const db = new DatabaseSync(":memory:");
  // Same columns and constraints as the live qnfo-audit tables (read from sqlite_master 2026-10-02).
  db.exec(`CREATE TABLE deploy_locks (worker TEXT PRIMARY KEY, token_hash TEXT NOT NULL, owner TEXT, actor TEXT, session_id TEXT, since TEXT NOT NULL, expires_at INTEGER NOT NULL, expected_version TEXT, released_at TEXT, released_by TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, version TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);`);
  db.prepare("INSERT INTO agent_issues (id, title, status, linked_session, created_at, updated_at) VALUES (42, 'live issue', 'open', 'filer-1', 1, 1)").run();
  db.prepare("INSERT INTO agent_issues (id, title, status, linked_session, created_at, updated_at) VALUES (43, 'closed issue', 'closed', 'filer-2', 1, 1)").run();
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); }, async list(o) { const p = (o && o.prefix) || ""; return { keys: [...kv.keys()].filter((k) => k.startsWith(p)).map((name) => ({ name })) }; } };
  return { env: { AUDIT: { prepare: prep }, FLEET_CONFIG: KV }, db, kv };
}
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
const O = "https://qnfo-deploy-guard.q08.workers.dev";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = async (env, path, body) => { const r = await call(env, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const get = async (env, path) => { const r = await call(env, path); const t = await r.text(); return { status: r.status, t, j: JSON.parse(t) }; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// A. acquire, conflict, open read, wrong-token release, expiry, renew, release
{
  const { env, db, kv } = mk();
  const t0 = T;
  let a = await post(env, "/work-lock/acquire", { key: "file:qnfo-fleet-dashboard/worker.js", owner: "session-A", ttl_sec: 600 });
  ok(a.status === 200 && a.j.acquired === true, "A1 the first session acquires the claim");
  ok(typeof a.j.token === "string" && a.j.token.length >= 12, "A2 the holder gets a token");
  ok(a.j.holder === "session-A" && a.j.key === "file:qnfo-fleet-dashboard/worker.js", "A3 holder and normalized key are returned");
  ok(a.j.expires_at === new Date(t0 + 600_000).toISOString(), "A4 expires_at is now + ttl_sec");
  const tokA = a.j.token;

  let b = await post(env, "/work-lock/acquire", { key: "file:./qnfo-fleet-dashboard//worker.js", owner: "session-B", ttl_sec: 600 });
  ok(b.status === 409 && b.j.acquired === false, "A5 a second session is refused (also through a differently spelled path)");
  ok(b.j.holder === "session-A" && b.j.expires_at === new Date(t0 + 600_000).toISOString(), "A6 the refusal names the holder and when the claim lapses");
  ok(!("token" in b.j) && !JSON.stringify(b.j).includes(tokA), "A7 the refused session gets no token");
  ok(b.j.since === new Date(t0).toISOString(), "A8 the refusal says since when the claim is held");
  ok([...kv.keys()].every((k) => !k.startsWith("deploydeny:")), "A9 a refused work claim records no lock denial (no DEPLOY-LOCK-CONTENTION)");

  let l = await get(env, "/work-locks");
  ok(l.status === 200 && l.j.count === 1 && l.j.claims[0].key === "file:qnfo-fleet-dashboard/worker.js" && l.j.claims[0].holder === "session-A", "A10 GET /work-locks lists the claim and its holder");
  ok(l.j.claims[0].expires_at === new Date(t0 + 600_000).toISOString() && l.j.claims[0].ttl_left_sec === 600, "A11 the open read shows expiry and time left");
  const hash = db.prepare("SELECT token_hash FROM deploy_locks").get().token_hash;
  ok(!l.t.includes(tokA) && !l.t.includes(hash) && !/token/i.test(l.t), "A12 the open read never shows a token or its hash");

  let rw = await post(env, "/work-lock/release", { key: "file:qnfo-fleet-dashboard/worker.js", token: "not-the-token" });
  ok(rw.status === 409 && rw.j.released === false, "A13 release with the wrong token is refused");
  ok((await get(env, "/work-locks")).j.count === 1, "A14 the claim is still held after a wrong-token release");
  ok((await post(env, "/work-lock/release", { key: "file:qnfo-fleet-dashboard/worker.js" })).status === 400, "A15 release without a token is a 400");

  T = t0 + 300_000;
  let rn = await post(env, "/work-lock/acquire", { key: "file:qnfo-fleet-dashboard/worker.js", owner: "session-A", token: tokA, ttl_sec: 600 });
  ok(rn.status === 200 && rn.j.renewed === true && rn.j.token === tokA && rn.j.expires_at === new Date(T + 600_000).toISOString(), "A16 the holder's token renews the claim");
  ok((await post(env, "/work-lock/acquire", { key: "file:qnfo-fleet-dashboard/worker.js", owner: "session-B", token: "guess" })).status === 409, "A17 a wrong token cannot renew or take the claim");

  T = t0 + 300_000 + 600_001;
  ok((await get(env, "/work-locks")).j.count === 0, "A18 an expired claim disappears from the open read");
  let c = await post(env, "/work-lock/acquire", { key: "file:qnfo-fleet-dashboard/worker.js", owner: "session-B", ttl_sec: 600 });
  ok(c.status === 200 && c.j.acquired === true && c.j.holder === "session-B", "A19 after expiry a peer takes the claim (a dead session never blocks forever)");
  ok(db.prepare("SELECT COUNT(*) n FROM deploy_locks").get().n === 1, "A20 the expired lease was reaped, one row remains");
  ok((await post(env, "/work-lock/release", { key: "file:qnfo-fleet-dashboard/worker.js", token: tokA })).status === 409, "A21 the lapsed holder's old token cannot release the new claim");
  let rl = await post(env, "/work-lock/release", { key: "file:qnfo-fleet-dashboard/worker.js", token: c.j.token });
  ok(rl.status === 200 && rl.j.released === true, "A22 the holder releases with its token");
  ok((await get(env, "/work-locks")).j.count === 0, "A23 nothing is listed after release");
  ok((await post(env, "/work-lock/acquire", { key: "file:qnfo-fleet-dashboard/worker.js", owner: "session-C" })).j.acquired === true, "A24 a released key is free at once");
}

// B. issue claims and agent_issues.linked_session
{
  const { env, db } = mk();
  let a = await post(env, "/work-lock/acquire", { key: "issue:42", owner: "claude-code-session-X", ttl_sec: 7200 });
  ok(a.status === 200 && a.j.key === "issue:42" && a.j.issue && a.j.issue.status === "open", "B1 an issue claim reports the issue status");
  ok(db.prepare("SELECT linked_session s FROM agent_issues WHERE id=42").get().s === "claude-code-session-X", "B2 a claim on a live issue writes agent_issues.linked_session");
  ok((await post(env, "/work-lock/acquire", { key: "issue:#42", owner: "session-Y" })).j.holder === "claude-code-session-X", "B3 issue:#42 is the same key as issue:42");
  ok(db.prepare("SELECT linked_session s FROM agent_issues WHERE id=42").get().s === "claude-code-session-X", "B4 a refused claim does not overwrite linked_session");
  let cl = await post(env, "/work-lock/acquire", { key: "issue:43", owner: "session-Z" });
  ok(cl.status === 200 && cl.j.issue.status === "closed" && cl.j.issue.linked_session === null, "B5 a closed issue is reported as closed and not relinked");
  ok(db.prepare("SELECT linked_session s FROM agent_issues WHERE id=43").get().s === "filer-2", "B6 a closed issue's linked_session is untouched");
  let nf = await post(env, "/work-lock/acquire", { key: "issue:999", owner: "session-Z" });
  ok(nf.status === 200 && nf.j.issue.status === null && nf.j.issue.linked_session === null, "B7 an unknown issue id still gets a claim, flagged status null");
  await post(env, "/work-lock/release", { key: "issue:42", token: a.j.token });
  ok(db.prepare("SELECT linked_session s FROM agent_issues WHERE id=42").get().s === "claude-code-session-X", "B8 linked_session stays as attribution after release");
  let big = await post(env, "/work-lock/acquire", { key: "file:x/y.js", owner: "s", ttl_sec: 999999 });
  ok(big.j.expires_at === new Date(T + 7200_000).toISOString(), "B9 ttl_sec is capped at 7200");
  let small = await post(env, "/work-lock/acquire", { key: "file:x/z.js", owner: "s", ttl_sec: "soon" });
  ok(small.j.expires_at === new Date(T + 3600_000).toISOString(), "B10 a non-numeric ttl_sec falls back to the 3600 s default");
  let ren = await post(env, "/work-lock/acquire", { key: "file:x/z.js", owner: "s", token: small.j.token, ttl_sec: 999999 });
  ok(ren.j.renewed === true && ren.j.expires_at === new Date(T + 7200_000).toISOString(), "B11 a renewal is capped at 7200 s too");
}

// C. refused input
{
  const { env, db } = mk();
  for (const key of ["", "issue:abc", "issue:", "pr:12", "file:", "file:../secrets", "file:a/../b", "file:a b.js", "file:" + "a".repeat(201), "worker:qnfo-ops"]) {
    const r = await post(env, "/work-lock/acquire", { key, owner: "s" });
    ok(r.status === 400 && !r.j.acquired, "C1 refused key " + JSON.stringify(key.slice(0, 30)));
  }
  ok((await post(env, "/work-lock/acquire", { key: "issue:7" })).status === 400, "C2 a claim without an owner is refused");
  ok((await post(env, "/work-lock/release", { key: "nope", token: "t" })).status === 400, "C3 release of a malformed key is refused");
  ok((await post(env, "/work-lock/acquire", null)).status === 400 && (await post(env, "/work-lock/release", null)).status === 400, "C5 a null JSON body is a 400, not a crash");
  ok(db.prepare("SELECT COUNT(*) n FROM deploy_locks").get().n === 0, "C4 refused input writes nothing");
}

// D. deploy locks and secret leases are unchanged by the shared helpers
{
  const { env, db, kv } = mk();
  let d = await post(env, "/lock/acquire", { worker: "qnfo-ops", owner: "canonical-deploy", ttl_sec: 300 });
  ok(d.status === 200 && d.j.acquired && d.j.token, "D1 a deploy lock is acquired as before");
  let w = await post(env, "/work-lock/acquire", { key: "file:qnfo-ops/worker.js", owner: "s1" });
  ok(w.status === 200, "D2 a work claim does not collide with a deploy lock on the same worker");
  let d2 = await post(env, "/lock/acquire", { worker: "qnfo-ops", owner: "other" });
  ok(d2.status === 409 && d2.j.held_by === "canonical-deploy" && d2.j.holder === "canonical-deploy", "D3 a deploy lock conflict keeps held_by (and adds holder)");
  ok([...kv.keys()].some((k) => k.startsWith("deploydeny:")), "D4 a deploy lock conflict still records a denial");
  let s = await post(env, "/secret-lock/acquire", { worker: "qnfo-ops", owner: "rotator", ttl_sec: 120 });
  ok(s.status === 200 && s.j.acquired, "D5 a secret lease is acquired through the same table");
  ok((await post(env, "/secret-lock/acquire", { worker: "qnfo-ops", owner: "rotator-2" })).status === 409, "D6 a second secret lease is refused");
  ok((await post(env, "/secret-lock/release", { worker: "qnfo-ops", token: s.j.token })).j.released === true, "D7 the secret lease releases");
  ok((await post(env, "/lock/release", { worker: "qnfo-ops", token: d.j.token })).j.released === true, "D8 the deploy lock releases");
  const l = await get(env, "/work-locks");
  ok(l.j.count === 1 && l.j.claims[0].key === "file:qnfo-ops/worker.js", "D9 GET /work-locks lists work claims only, not deploy or secret leases");
  ok(db.prepare("SELECT worker FROM deploy_locks").get().worker === "work:file:qnfo-ops/worker.js", "D10 a work claim is stored as a work:<key> lease in deploy_locks");
  const h = await get(env, "/health");
  ok(versionAtLeast(h.j.version, "1.3.21") && h.j.capabilities.includes("work-claim"), "D11 /health reports the version and the work-claim capability");
}

// E. the read reports an unavailable store instead of an empty list
{
  const env = { AUDIT: { prepare() { throw new Error("D1 down"); } }, FLEET_CONFIG: { async get() { return null; }, async put() {}, async list() { return { keys: [] }; }, async delete() {} } };
  const r = await call(env, "/work-locks");
  ok(r.status === 503, "E1 GET /work-locks is a 503 when D1 is unavailable, never a false empty list");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
