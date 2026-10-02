// WORK-CLAIM-UNIFY-1 offline suite (qnfo-deploy-guard 1.3.22). Drives the real fetch handler against an in-memory SQLite D1
// carrying the live work_claims and code_tasks schemas (read from sqlite_master 2026-10-02). Proves: /work-lock/acquire writes
// the work_claims ledger row; a session that claimed a path straight in work_claims (WORK-CLAIMS-1) blocks another session's
// acquire, but not its own; the code loop's unfinished task on the path is returned as in_flight and does not block; renew
// extends the ledger row; release closes it with pr and outcome; GET /work-locks lists ledger rows and code-loop tasks, never
// a token; an issue claim matches an issue_id ledger row and a code task filed from that issue; without the two tables the
// WORK-CLAIM-1 lease still works.
// Run: node qnfo-deploy-guard/work-claim-unify.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

let T = Date.parse("2026-10-02T10:00:00Z");
Date.now = () => T;
const isoS = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

function mk(withLedger = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE deploy_locks (worker TEXT PRIMARY KEY, token_hash TEXT NOT NULL, owner TEXT, actor TEXT, session_id TEXT, since TEXT NOT NULL, expires_at INTEGER NOT NULL, expected_version TEXT, released_at TEXT, released_by TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, version TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);`);
  if (withLedger) {
    db.exec(`CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT);
    CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'read', attempts INTEGER NOT NULL DEFAULT 0, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  }
  db.prepare("INSERT INTO agent_issues (id, title, status, created_at, updated_at) VALUES (1810, 'LIFECYCLE-PING-DEAD-1', 'open', 1, 1)").run();
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); }, async list() { return { keys: [] }; } };
  return { env: { AUDIT: { prepare: prep }, FLEET_CONFIG: KV }, db };
}
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
const O = "https://qnfo-deploy-guard.q08.workers.dev";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = async (env, path, body) => { const r = await call(env, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const get = async (env, path) => { const r = await call(env, path); const t = await r.text(); return { status: r.status, t, j: JSON.parse(t) }; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// U. the ledger is written, read, renewed and closed by /work-lock
{
  const { env, db } = mk();
  const t0 = T;
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, created_at, updated_at) VALUES ('ct_loop1', 'qnfo-workers', 'qnfo-lifecycle/worker.js', '[issue #1810] LIFECYCLE-PING-DEAD-1: runPing keyed on an undeclared cron', 'ready_to_publish', '2026-10-02T09:50:46Z', '2026-10-02T09:50:46Z')").run();
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, created_at, updated_at) VALUES ('ct_done', 'qnfo-workers', 'qnfo-lifecycle/worker.js', 'an earlier fix', 'merged', '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z')").run();

  const a = await post(env, "/work-lock/acquire", { key: "file:qnfo-lifecycle/worker.js", owner: "session_01AAA (PR 9)", ttl_sec: 1800, intent: "LIFECYCLE-PING-DEAD-1 by hand", pr: 9 });
  ok(a.status === 200 && a.j.acquired === true, "U1 a code-loop task on the path does not block a session's claim");
  ok(Array.isArray(a.j.in_flight) && a.j.in_flight.length === 1 && a.j.in_flight[0].kind === "code-loop" && a.j.in_flight[0].holder === "qnfo-code-orchestrator:ct_loop1", "U2 the acquire returns the code loop's unfinished task as in_flight (a merged task is not listed)");
  const row = db.prepare("SELECT * FROM work_claims").get();
  ok(row && row.path === "qnfo-lifecycle/worker.js" && row.holder === "session_01AAA (PR 9)" && row.intent === "LIFECYCLE-PING-DEAD-1 by hand" && row.pr === 9 && row.released_at === null, "U3 the acquire writes the work_claims ledger row (path, holder, intent, pr)");
  ok(row.claimed_at === isoS(t0) && row.expires_at === isoS(t0 + 1_800_000), "U4 the ledger row carries the lease's own expiry");

  const b = await post(env, "/work-lock/acquire", { key: "file:qnfo-lifecycle/worker.js", owner: "session_01BBB" });
  ok(b.status === 409 && b.j.acquired === false && b.j.holder === "session_01AAA (PR 9)", "U5 a second session is refused (the lease still decides first)");

  T = t0 + 600_000;
  const rn = await post(env, "/work-lock/acquire", { key: "file:qnfo-lifecycle/worker.js", owner: "session_01AAA (PR 9)", token: a.j.token, ttl_sec: 3600 });
  ok(rn.status === 200 && rn.j.renewed === true, "U6 the holder renews");
  ok(db.prepare("SELECT expires_at FROM work_claims WHERE id=?").get(row.id).expires_at === isoS(T + 3_600_000), "U7 a renewal extends the ledger row");
  ok(db.prepare("SELECT COUNT(*) n FROM work_claims").get().n === 1, "U8 a renewal writes no second ledger row");

  const l = await get(env, "/work-locks");
  ok(l.status === 200 && l.j.count === 1 && l.j.in_flight_count === 2, "U9 GET /work-locks lists the lease plus the ledger row and the code-loop task");
  ok(l.j.in_flight.some((x) => x.kind === "session" && x.intent === "LIFECYCLE-PING-DEAD-1 by hand") && l.j.in_flight.some((x) => x.kind === "code-loop"), "U10 the open read names what each holder is doing");
  ok(!/token/i.test(l.t) && !l.t.includes(a.j.token), "U11 the open read never shows a token");

  const rel = await post(env, "/work-lock/release", { key: "file:qnfo-lifecycle/worker.js", token: a.j.token, pr: 12, outcome: "merged" });
  ok(rel.status === 200 && rel.j.released === true, "U12 the holder releases");
  const closed = db.prepare("SELECT * FROM work_claims WHERE id=?").get(row.id);
  ok(closed.released_at === isoS(T) && closed.pr === 12 && closed.outcome === "merged", "U13 the release closes the ledger row with pr and outcome");
  ok((await get(env, "/work-locks")).j.in_flight.every((x) => x.kind !== "session"), "U14 a released ledger row leaves the open read");
  T = t0;
}

// V. a claim written straight into work_claims (the WORK-CLAIMS-1 procedure) is honoured
{
  const { env, db } = mk();
  db.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, pr, claimed_at, expires_at) VALUES ('scripts/ci_watchdog.py', 'API-BUDGET-1: cut watchdog API calls', 'session_01E1YWAR', NULL, NULL, ?, ?)").run(isoS(T - 600_000), isoS(T + 6_600_000));
  const v1 = await post(env, "/work-lock/acquire", { key: "file:scripts/ci_watchdog.py", owner: "session_01GqJR (PR 495)", intent: "ACTIONS-QUOTA-1" });
  ok(v1.status === 409 && v1.j.acquired === false && v1.j.reason === "work_claims", "V1 another session's ledger claim refuses a fresh acquire (PRs 480 and 495 fixed the same defect in parallel)");
  ok(v1.j.holder === "session_01E1YWAR" && v1.j.intent === "API-BUDGET-1: cut watchdog API calls" && v1.j.expires_at === isoS(T + 6_600_000), "V2 the refusal names the holder, what it is doing and when it lapses");
  ok(!("token" in v1.j) && db.prepare("SELECT COUNT(*) n FROM deploy_locks").get().n === 0, "V3 the refused session gets no token and takes no lease");
  ok(db.prepare("SELECT COUNT(*) n FROM work_claims").get().n === 1, "V4 a refusal writes no ledger row");

  const v2 = await post(env, "/work-lock/acquire", { key: "file:scripts/ci_watchdog.py", owner: "session_01E1YWAR (API-BUDGET-1)" });
  ok(v2.status === 200 && v2.j.acquired === true, "V5 the session that wrote the ledger row is not blocked by its own claim");

  const { env: env2, db: db2 } = mk();
  db2.prepare("INSERT INTO work_claims (path, intent, holder, claimed_at, expires_at) VALUES ('scripts/ci_watchdog.py', 'old', 'session_01E1YWAR', ?, ?)").run(isoS(T - 9_000_000), isoS(T - 1_000));
  db2.prepare("INSERT INTO work_claims (path, intent, holder, claimed_at, expires_at, released_at, outcome) VALUES ('scripts/ci_watchdog.py', 'done', 'session_01XYZ', ?, ?, ?, 'merged')").run(isoS(T - 600_000), isoS(T + 600_000), isoS(T - 60_000));
  const v3 = await post(env2, "/work-lock/acquire", { key: "file:scripts/ci_watchdog.py", owner: "session_01GqJR" });
  ok(v3.status === 200 && v3.j.acquired === true, "V6 an expired or released ledger row does not block");
}

// W. issue keys match an issue_id ledger row and a code task filed from the issue
{
  const { env, db } = mk();
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, created_at, updated_at) VALUES ('ct_i1', 'qnfo-workers', 'qnfo-lifecycle/worker.js', '[issue #1810] LIFECYCLE-PING-DEAD-1', 'queued', '2026-10-02T09:50:46Z', '2026-10-02T09:50:46Z')").run();
  const w1 = await post(env, "/work-lock/acquire", { key: "issue:1810", owner: "session_01AAA", intent: "close 1810 with evidence" });
  ok(w1.status === 200 && w1.j.in_flight.length === 1 && w1.j.in_flight[0].holder === "qnfo-code-orchestrator:ct_i1", "W1 an issue claim lists the code task filed from that issue");
  const r = db.prepare("SELECT path, issue_id FROM work_claims").get();
  ok(r.path === "issue:1810" && r.issue_id === 1810, "W2 an issue claim's ledger row carries issue_id");
  ok(w1.j.issue && w1.j.issue.linked_session === "session_01AAA", "W3 the issue is still linked to the holder (WORK-CLAIM-1 unchanged)");
  const { env: e2, db: d2 } = mk();
  d2.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, claimed_at, expires_at) VALUES ('qnfo-lifecycle/worker.js', 'fixing 1810', 'session_01OTHER', 1810, ?, ?)").run(isoS(T - 60_000), isoS(T + 3_600_000));
  const w2 = await post(e2, "/work-lock/acquire", { key: "issue:1810", owner: "session_01AAA" });
  ok(w2.status === 409 && w2.j.holder === "session_01OTHER", "W4 a ledger claim on a file that names the issue blocks a claim on the issue");
}

// X. without the ledger tables the WORK-CLAIM-1 lease works as before
{
  const { env } = mk(false);
  const x1 = await post(env, "/work-lock/acquire", { key: "file:qnfo-lifecycle/worker.js", owner: "session_01AAA" });
  ok(x1.status === 200 && x1.j.acquired === true && Array.isArray(x1.j.in_flight) && x1.j.in_flight.length === 0, "X1 acquire works with no work_claims or code_tasks table");
  const x2 = await get(env, "/work-locks");
  ok(x2.status === 200 && x2.j.count === 1 && x2.j.in_flight_count === 0, "X2 the open read works with no ledger");
  ok((await post(env, "/work-lock/release", { key: "file:qnfo-lifecycle/worker.js", token: x1.j.token, outcome: "merged" })).status === 200, "X3 release works with no ledger");
  const h = await get(env, "/health");
  ok(h.j.version === "1.3.22-work-claim-unify", "X4 /health reports 1.3.22");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
