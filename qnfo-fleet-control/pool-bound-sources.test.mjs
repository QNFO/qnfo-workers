// POOL-BOUND-SOURCES-1 offline suite (qnfo-fleet-control 0.41.1, issue 100213, human_actions 107, pillar research).
// POOL-BOUND-1 ranked every row whose proposal contact is owner as an owner-authored row and parked only the rest, so the 267-row
// deferred pool of notebook extractions (idea_proposals name owner-corpus, contact owner) was never parked; and a row an owner directive
// queued directly (source idea) had no proposal at all, read as a generated row and was parked (research_queue
// idea-reality-idempotent-exchange-symmetry-20261019 on 2026-10-19). Proves: a pool of 267 owner-corpus rows parks the rows beyond 60 (207 less the 3 the ready queue takes first);
// owner-written proposals, remediation rows and rows of source idea, chat or operator-prime are never parked and rank first;
// the ready queue still takes the best rows in RB_ORDER_SQL order; the parked rows carry the POOL-BOUND-1 revert line and are
// re-armed when the pool falls under half the bound.
// Run: node --no-warnings qnfo-fleet-control/pool-bound-sources.test.mjs   -> prints "N checks, 0 failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// BEGIN RESEARCH-BACKPRESSURE-1"), b = src.indexOf("// END RESEARCH-BACKPRESSURE-1");
if (a < 0 || b < a) throw new Error("RESEARCH-BACKPRESSURE-1 block not found");
let fails = 0, n = 0;
const check = (c, m, x) => { n++; if (!c) { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const vm1 = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
check(vm1 && (+vm1[1] > 0 || +vm1[2] > 41 || (+vm1[2] === 41 && +vm1[3] >= 1)), "VERSION at least 0.41.1", vm1 && vm1[0]);

const ctx = vm.createContext({ Date, Math, Number, String, JSON, Object, Array, console });
const W = vm.runInContext(src.slice(a, b) + "\n;({ researchBackpressureTick, RB_ORDER_SQL, RB_DIRECT_SRC_SQL });", ctx, { filename: "fleet-control#RESEARCH-BACKPRESSURE-1" });
check(/'idea'/.test(W.RB_DIRECT_SRC_SQL) && /'chat'/.test(W.RB_DIRECT_SRC_SQL) && /'operator-prime'/.test(W.RB_DIRECT_SRC_SQL), "the direct sources are idea, chat and operator-prime");
check(/NOT p\.name = 'owner-corpus'|p\.name <> 'owner-corpus'/.test(src) === true, "the pool query reads owner-corpus as generated");
check(!/p\.name <> 'owner-corpus'/.test(W.RB_ORDER_SQL), "RB_ORDER_SQL keeps ranking owner-corpus with the owner's proposals (the best rows stay in line)");

const wrap = (db) => {
  const stmt = (sql, args) => ({
    bind: (...x) => stmt(sql, x),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) })
  });
  return { prepare: (sql) => stmt(sql, []) };
};
const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, score REAL, status TEXT, created_at TEXT, error TEXT, published_at TEXT, stage TEXT);
    CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, contact TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    INSERT INTO metric_registry (metric) VALUES ('research_deferred_pool');`);
  return db;
};

// the issue's own test: 267 owner-corpus rows in the deferred pool, max 60 -> 207 parked, 60 kept
{
  const db = mk();
  db.exec("INSERT INTO ops_config VALUES ('research_ready_cap', '3')");
  const ip = db.prepare("INSERT INTO idea_proposals VALUES (?, 'owner-corpus', 'owner')");
  const qi = db.prepare("INSERT INTO research_queue (id, source, source_id, score, status, created_at) VALUES (?, 'proposal', ?, ?, 'deferred', ?)");
  for (let k = 1; k <= 267; k++) { ip.run(k); qi.run("c" + k, String(k), (k % 17) / 17, "2026-10-1" + (k % 7) + "T00:00:" + String(k % 60).padStart(2, "0") + "Z"); }
  const cnt = (w) => db.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE " + w).get().n;
  const env = { AUDIT: wrap(db) };
  const out = await W.researchBackpressureTick(env);
  check(out.ok && out.released === 3, "the ready queue still takes its three best rows", out);
  check(out.pool_parked === 204 && cnt("status = 'wontfix' AND stage = 'parked'") === 204, "a pool of 267 owner-corpus rows parks all but 60 (the ready queue took 3 first, so 204 of 264)", out);
  check(cnt("status = 'deferred'") === 60 && out.deferred_pool === 60, "and keeps 60 in the pool", out);
  check(cnt("status = 'wontfix' AND error LIKE 'POOL-BOUND-1 parked%Revert:%'") === 204, "each parked row carries the POOL-BOUND-1 revert line");
  const kept = db.prepare("SELECT MIN(score) AS lo FROM research_queue WHERE status IN ('deferred','queued')").get().lo;
  const parkedTop = db.prepare("SELECT MAX(score) AS hi FROM research_queue WHERE status = 'wontfix'").get().hi;
  check(kept >= parkedTop, "the parked rows are the lowest-ranked ones; the best stay in line", { kept, parkedTop });
  // re-armed by priority when the pool is under half the bound
  db.exec("UPDATE research_queue SET status = 'published' WHERE status IN ('deferred','queued') AND id NOT IN (SELECT id FROM research_queue WHERE status IN ('deferred','queued') ORDER BY score DESC LIMIT 20)");
  const o2 = await W.researchBackpressureTick(env);
  check(o2.pool_rearmed > 0 && cnt("status = 'deferred' AND error LIKE 'POOL-BOUND-1 re-armed%'") === o2.pool_rearmed, "under half the bound the parked rows are re-armed automatically", o2);
}

// direct owner rows are never parked and rank first; owner-written proposals and remediation rows stay protected
{
  const db = mk();
  db.exec("INSERT INTO ops_config VALUES ('research_ready_cap', '1'), ('research_deferred_max', '3')");
  db.exec("INSERT INTO idea_proposals VALUES (1, 'owner-corpus', 'owner'), (2, 'rowan-chat', 'owner'), (3, 'arxiv-scan', '')");
  const qi = db.prepare("INSERT INTO research_queue (id, source, source_id, score, status, created_at) VALUES (?, ?, ?, ?, 'deferred', ?)");
  for (let k = 0; k < 8; k++) qi.run("corpus" + k, "proposal", "1", 9 - k, "2026-10-12T00:00:0" + k + "Z");
  qi.run("direct-idea", "idea", "reality-idempotent-exchange-symmetry-factcheck", null, "2026-10-19T04:47:35Z");
  qi.run("direct-chat", "chat", "c1", 0, "2026-10-19T04:48:00Z");
  qi.run("direct-prime", "operator-prime", "p1", 0, "2026-10-19T04:49:00Z");
  qi.run("owner-written", "proposal", "2", 0, "2026-10-01T00:00:00Z");
  qi.run("machine", "proposal", "3", 5, "2026-10-12T00:00:00Z");
  qi.run("fix", "remediation", "r1", 0, "2026-10-12T05:00:00Z");
  const st = (id) => db.prepare("SELECT status, stage FROM research_queue WHERE id = ?").get(id);
  const out = await W.researchBackpressureTick({ AUDIT: wrap(db) });
  check(out.ok && out.pool_max === 3, "the bound reads research_deferred_max", out);
  for (const id of ["direct-idea", "direct-chat", "direct-prime", "owner-written", "fix"]) check(st(id).status !== "wontfix", id + " is never parked", st(id));
  check(["direct-idea", "direct-chat", "direct-prime", "fix"].filter((id) => st(id).status === "queued").length === 1, "the one ready slot goes to a remediation or direct owner row, not to a corpus row", ["direct-idea", "direct-chat", "direct-prime", "fix"].map((id) => st(id).status));
  check(db.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE id LIKE 'corpus%' AND status = 'wontfix'").get().n >= 5 && st("machine").status === "wontfix", "the notebook extractions and the machine proposal beyond the bound are parked");
}

// the scheduled tick still runs the step, the mirror is identical
check(/researchBackpressureTick\(env\)/.test(src), "the backpressure tick is still wired");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
check(mirror === src, "deployed-current.worker.js is identical to worker.js");
console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
