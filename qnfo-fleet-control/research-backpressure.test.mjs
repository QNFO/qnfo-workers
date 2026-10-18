// RESEARCH-BACKPRESSURE-1 offline suite (qnfo-fleet-control 0.24.0, agent_issues 2193, pillar research).
// research_queue held 85 queued rows against an executor that publishes 22-31 a day, so every row aged about 3.5 days past a
// 180-minute SLA. Proves: at most the cap stays queued, chosen by priority (remediation, owner-authored, score, age); the rest
// become deferred with a revert line, and are released by the same priority as slots free; a queued row is never bounced back;
// research_ready stamps when a row became ready and forgets rows that left the queue; research_deferred_pool is written; the
// off switch releases the pool; the tick is wired into the 20-minute cron.
// Run: node --no-warnings qnfo-fleet-control/research-backpressure.test.mjs   -> prints "N checks, 0 failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// BEGIN RESEARCH-BACKPRESSURE-1"), b = src.indexOf("// END RESEARCH-BACKPRESSURE-1");
if (a < 0 || b < a) throw new Error("RESEARCH-BACKPRESSURE-1 block not found");
let fails = 0, n = 0;
const check = (c, m, x) => { n++; if (!c) { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const vm1 = /var VERSION = "(\d+)\.(\d+)\./.exec(src);
check(vm1 && (+vm1[1] > 0 || +vm1[2] >= 24), "VERSION at least 0.24");
const sched = src.slice(src.indexOf("async scheduled(event, env, ctx) {\n    // CRON-DISPATCH-ELIMINATION-1"));
const twenty = sched.slice(0, sched.indexOf('if (cron === "0 3 * * *")'));
check(/researchBackpressureTick\(env\)/.test(twenty), "the 20-minute cron runs the backpressure tick");

const ctx = vm.createContext({ Date, Math, Number, String, JSON, Object, Array, console });
const W = vm.runInContext(src.slice(a, b) + "\n;({ rbPlan, researchBackpressureTick, RB_CAP_DEFAULT });", ctx, { filename: "fleet-control#RESEARCH-BACKPRESSURE-1" });

// pure plan
let p = W.rbPlan(["a", "b", "c", "d", "e"], [], 3, true);
check(p.defer.join() === "d,e" && p.release.length === 0, "over the cap: the lowest-priority queued rows are deferred", p);
p = W.rbPlan(["a"], ["x", "y", "z"], 3, true);
check(p.release.join() === "x,y" && p.defer.length === 0, "under the cap: the best deferred rows are released to fill it", p);
p = W.rbPlan(["a", "b", "c"], ["x"], 3, true);
check(p.defer.length === 0 && p.release.length === 0, "at the cap nothing moves (no bouncing)", p);
p = W.rbPlan(["a"], ["x", "y"], 3, false);
check(p.release.join() === "x,y" && p.defer.length === 0, "off: the whole pool is released", p);
check(W.rbPlan([], [], 0, true).release.length === 0 && W.RB_CAP_DEFAULT === 3, "a zero cap reads as 1; the default cap is 3");

const wrap = (db) => {
  const stmt = (sql, args) => ({
    bind: (...x) => stmt(sql, x),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) })
  });
  return { prepare: (sql) => stmt(sql, []) };
};
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, score REAL, status TEXT, created_at TEXT, error TEXT, published_at TEXT, stage TEXT);
  CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, contact TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  INSERT INTO metric_registry (metric) VALUES ('research_deferred_pool');
  INSERT INTO idea_proposals VALUES (1, 'arxiv-scan', ''), (2, 'rowan-chat', 'owner'), (3, 'arxiv-scan', ''), (4, 'think', ''), (5, 'think', ''), (6, 'think', '');`);
const ins = db.prepare("INSERT INTO research_queue (id, source, source_id, score, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)");
ins.run("gen-hi", "proposal", "1", 9, "2026-10-10T00:00:00Z");
ins.run("owner", "proposal", "2", 1, "2026-10-12T00:00:00Z");
ins.run("gen-lo", "proposal", "3", 2, "2026-10-09T00:00:00Z");
ins.run("fix", "remediation", "r1", 0, "2026-10-12T05:00:00Z");
ins.run("gen-mid", "proposal", "4", 5, "2026-10-11T00:00:00Z");
ins.run("gen-mid2", "proposal", "5", 5, "2026-10-10T00:00:00Z");
db.exec("INSERT INTO research_queue (id, source, source_id, score, status, created_at) VALUES ('busy', 'proposal', '6', 8, 'researching', '2026-10-08T00:00:00Z')");
const st = (id) => db.prepare("SELECT status, error FROM research_queue WHERE id = ?").get(id);
const env = { AUDIT: wrap(db) };

let out = await W.researchBackpressureTick(env);
check(out.ok && out.queued === 3 && out.deferred === 3 && out.deferred_pool === 3, "first tick: 3 stay queued, 3 deferred", out);
check(st("fix").status === "queued" && st("owner").status === "queued" && st("gen-hi").status === "queued", "kept by priority: the remediation row, the owner's idea, then the best score", ["fix", "owner", "gen-hi"].map(st));
check(st("gen-lo").status === "deferred" && /Revert: status queued/.test(st("gen-lo").error), "a deferred row carries its revert");
check(st("busy").status === "researching", "a row being researched is never touched");
const ready = () => db.prepare("SELECT id FROM research_ready ORDER BY id").all().map((r) => r.id).join();
check(ready() === "fix,gen-hi,owner", "research_ready stamps exactly the queued rows", ready());
check(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'research_deferred_pool'").get().last_value === "3", "the pool metric is written");
check(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'research-backpressure'").get().n === 1, "a moving tick leaves one event");

// the executor claims two rows; the next tick releases the two best deferred rows (score 5, older first)
db.exec("UPDATE research_queue SET status = 'researching' WHERE id IN ('fix', 'owner')");
out = await W.researchBackpressureTick(env);
check(out.released === 2 && st("gen-mid2").status === "queued" && st("gen-mid").status === "queued" && st("gen-lo").status === "deferred", "freed slots are refilled by priority (score, then age)", out);
check(st("gen-mid").error === null, "a released row's deferral note is cleared");
check(ready() === "gen-hi,gen-mid,gen-mid2", "rows that left the queue are forgotten; released rows are stamped", ready());

// a quiet tick changes nothing and logs nothing
const evBefore = db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n;
out = await W.researchBackpressureTick(env);
check(out.deferred === 0 && out.released === 0 && db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n === evBefore, "at the cap a tick moves nothing and logs nothing", out);

// cap from ops_config, and the off switch releases the pool
db.exec("INSERT INTO ops_config VALUES ('research_ready_cap', '4')");
out = await W.researchBackpressureTick(env);
check(out.cap === 4 && out.released === 1 && st("gen-lo").status === "queued", "research_ready_cap raises the cap", out);
db.exec("UPDATE ops_config SET value = '1' WHERE key = 'research_ready_cap'");
out = await W.researchBackpressureTick(env);
check(out.deferred === 3 && out.queued === 1, "a lower cap defers the surplus", out);
db.exec("INSERT INTO ops_config VALUES ('research_backpressure', 'off')");
out = await W.researchBackpressureTick(env);
check(!out.on && out.deferred_pool === 0 && out.released === 3, "off releases the whole pool", out);


// POOL-BOUND-1 (0.33.9): an unbounded deferred pool is capped at research_deferred_max; lowest-priority overflow is parked
// with a revert line and re-armed when the pool falls below half the bound. Owner and remediation rows are never parked.
{
  const pdb = new DatabaseSync(":memory:");
  pdb.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, score REAL, status TEXT, created_at TEXT, error TEXT, published_at TEXT, stage TEXT);
    CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, contact TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    INSERT INTO ops_config VALUES ('research_ready_cap', '2'), ('research_deferred_max', '4');
    INSERT INTO idea_proposals VALUES (100, 'rowan-chat', 'owner');`);
  const pi = pdb.prepare("INSERT INTO research_queue (id, source, source_id, score, status, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (let k = 0; k < 10; k++) pi.run("p" + k, "proposal", "x" + k, 10 - k, k < 2 ? "queued" : "deferred", "2026-10-1" + (k % 9) + "T00:00:00Z");
  pi.run("own", "proposal", "100", 0, "deferred", "2026-10-01T00:00:00Z");
  pi.run("rem", "remediation", "r9", 0, "deferred", "2026-10-01T00:00:00Z");
  const penv = { AUDIT: wrap(pdb) };
  const cnt = (w) => pdb.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE " + w).get().n;
  let po = await W.researchBackpressureTick(penv);
  check(po.ok && po.pool_max === 4 && cnt("status = 'deferred'") === 4, "POOL-BOUND-1: the pool is cut to research_deferred_max", po);
  check(po.pool_parked === 6 && cnt("status = 'wontfix' AND stage = 'parked' AND error LIKE 'POOL-BOUND-1%Revert:%'") === 6, "POOL-BOUND-1: overflow is parked with a revert line", po);
  check(pdb.prepare("SELECT status FROM research_queue WHERE id = 'own'").get().status === "deferred" && pdb.prepare("SELECT status FROM research_queue WHERE id = 'rem'").get().status === "deferred", "POOL-BOUND-1: owner and remediation rows are never parked");
  pdb.exec("UPDATE research_queue SET status = 'published' WHERE status IN ('deferred', 'queued')");
  po = await W.researchBackpressureTick(penv);
  check(po.pool_rearmed === 2 && cnt("status = 'deferred' AND error LIKE 'POOL-BOUND-1%re-armed%'") === 2, "POOL-BOUND-1: below half the bound, parked rows are re-armed by priority", po);
  pdb.exec("UPDATE ops_config SET value = '0' WHERE key = 'research_deferred_max'");
  po = await W.researchBackpressureTick(penv);
  check(po.pool_parked === 0 && po.pool_rearmed === 0, "POOL-BOUND-1: research_deferred_max 0 turns the bound off", po);
}
console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
