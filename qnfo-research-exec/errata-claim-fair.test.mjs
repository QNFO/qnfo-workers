// ERRATA-CLAIM-FAIR-1 (qnfo-research-exec 0.40.9, agent_issues 1000472) offline suite: the claim lane that gives errata remediation rows a bounded share of
// the claims. 233 errata rows had never been claimed because every other class ranks ahead of the FIFO tier where they wait and the daily neuron budget is spent
// after about 26 claims. The lane takes one claim per errata_claim_interval_hours window, respects the class allocator's total window and leaves the budget alone,
// and fails soft. This runs the real functions from worker.js against SQLite.
// Run: node qnfo-research-exec/errata-claim-fair.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { claimErrataFair, errataClaimIntervalHours } from "./worker.js";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
console.error = () => {};

const T0 = Date.parse("2026-10-30T00:05:00.000Z");
const H = 36e5;
const iso = (ms) => new Date(ms).toISOString();

function mk(rows, cfg) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, source TEXT, source_id TEXT, stage TEXT, created_at TEXT, score REAL, attempt INTEGER DEFAULT 0, claimed_at TEXT);"
    + "CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);"
    + "CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);"
    + "CREATE INDEX idx_coe_kind_text_ts ON cloud_ops_events(kind, text, ts);");
  const ins = db.prepare("INSERT INTO research_queue (id, status, source, source_id, stage, created_at, score, attempt, claimed_at) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const r of rows) ins.run(r.id, r.status || "queued", r.source || "remediation", r.source_id === undefined ? "errata:" + r.id : r.source_id, r.stage === undefined ? null : r.stage, r.created || "2026-10-18T00:00:00.000Z", r.score === undefined ? 0.95 : r.score, r.attempt || 0, r.claimed_at || null);
  if (cfg !== undefined) db.prepare("INSERT INTO ops_config VALUES ('errata_claim_interval_hours', ?)").run(String(cfg));
  return db;
}
function d1(db) {
  return { QNFO_AUDIT: { prepare(sql) {
    let a = [];
    const q = {
      bind(...x) { a = x; return q; },
      async first() { return db.prepare(sql).get(...a) || null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...a).changes) } }; },
      async all() { return { results: db.prepare(sql).all(...a) }; }
    };
    return q;
  } } };
}
const one = (db, sql, ...a) => db.prepare(sql).get(...a);
const claimEvent = (db, id, ts) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").run("ev-" + id + "-" + ts, ts, "claim", "claimed errata:" + id + " (pipeline x) at stage ground", "{}", "qnfo-research-exec", "ok");
const park = (db, id) => db.prepare("UPDATE research_queue SET status='queued', claimed_at=NULL WHERE id=?").run(id);

const queue = () => [
  { id: "e-old-attempted", created: "2026-10-17T00:00:00.000Z", attempt: 2 },
  { id: "e-a", created: "2026-10-18T00:00:00.000Z" },
  { id: "e-b", created: "2026-10-19T00:00:00.000Z" },
  { id: "e-resume", created: "2026-10-25T00:00:00.000Z", stage: "revise" },
  { id: "e-deferred", status: "deferred", created: "2026-10-10T00:00:00.000Z" },
  { id: "e-done", status: "done", created: "2026-10-09T00:00:00.000Z" },
  { id: "revision-1", source_id: "revision:p1@1#1", created: "2026-10-01T00:00:00.000Z" },
  { id: "completeness-1", source_id: "completeness:abc", created: "2026-10-01T00:00:00.000Z" },
  { id: "proposal-1", source: "proposal", source_id: "errata:not-remediation", created: "2026-10-01T00:00:00.000Z" }
];

// 1 the first claim of a window is an errata row: never-attempted first, a resumable stage before a fresh one, nothing else touched
let db = mk(queue());
let env = d1(db);
let row = await claimErrataFair(env, T0);
ok(row && row.id === "e-resume", "the first claim takes the never-attempted errata row that already holds a draft", row && row.id);
ok(row && row.status === "researching" && row.stage === "revise" && row.attempt === 1 && row.claimed_at === iso(T0), "the claimed row is in flight at its resumable stage with attempt 1", row);
ok(one(db, "SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'errata-claim-fair'").n === 1, "the lane records one errata-claim-fair event");
ok(one(db, "SELECT COUNT(*) n FROM research_queue WHERE status = 'queued' AND attempt = 0 AND id IN ('revision-1','completeness-1','proposal-1')").n === 3, "revision, completeness and non-remediation rows are never taken by the lane");
ok(one(db, "SELECT status FROM research_queue WHERE id = 'e-deferred'").status === "deferred" && one(db, "SELECT status FROM research_queue WHERE id = 'e-done'").status === "done", "deferred and finished errata rows are not claimable");

// 2 one claim per window: the row in flight holds the window, and two slots of one round cannot both take it
ok(await claimErrataFair(env, T0) === null, "a second claim in the same window finds the errata row in flight and takes nothing");
ok(await claimErrataFair(env, T0 + 19 * H) === null, "19 hours later the claim event window is still open");
db = mk(queue());
env = d1(db);
const pair = await Promise.all([claimErrataFair(env, T0), claimErrataFair(env, T0), claimErrataFair(env, T0)]);
ok(pair.filter(Boolean).length === 1 && one(db, "SELECT COUNT(*) n FROM research_queue WHERE status = 'researching'").n === 1, "three slots racing for the lane claim exactly one row", pair.map((p) => p && p.id));

// 3 a failure loop cannot reopen the window: the claim event outlives the park path that clears claimed_at
db = mk(queue());
env = d1(db);
row = await claimErrataFair(env, T0);
claimEvent(db, row.id, iso(T0 + 1000));
park(db, row.id);
ok(await claimErrataFair(env, T0 + 2 * H) === null, "a parked errata row (claimed_at cleared) does not reopen the window while its claim event is inside it");
const control = mk(queue());
const first = await claimErrataFair(d1(control), T0);
park(control, first.id);
const again = await claimErrataFair(d1(control), T0 + 2 * H);
ok(again && again.id !== first.id, "without the claim event the same park would reopen the window, which is why the event is the durable signal", again && again.id);

// 4 the window passes: the next claim rotates to a never-attempted row, not back to the row that just failed
row = await claimErrataFair(env, T0 + 21 * H);
ok(row && row.id === "e-a", "after the window the next claim is the oldest never-attempted errata row, not the parked retry", row && row.id);
ok(await claimErrataFair(env, T0 + 21 * H) === null, "and that claim closes the new window");
db = mk([{ id: "e-failed", created: "2026-10-01T00:00:00.000Z", attempt: 1 }, { id: "e-fresh", created: "2026-10-20T00:00:00.000Z" }]);
row = await claimErrataFair(d1(db), T0);
ok(row && row.id === "e-fresh", "attempt ranks before age: a fresher never-attempted row beats an older row that has already failed", row && row.id);
db = mk([{ id: "e-only-failed", attempt: 3 }]);
row = await claimErrataFair(d1(db), T0);
ok(row && row.id === "e-only-failed" && row.attempt === 4, "a row that has failed before is still claimed when nothing else is waiting", row);

// 5 the knob
const hours = async (cfg) => errataClaimIntervalHours(d1(mk([], cfg)));
ok(await hours(undefined) === 20, "no ops_config row means the 20 hour default");
ok(await hours("off") === 0 && await hours(" OFF ") === 0 && await hours("0") === 0 && await hours("-5") === 0, "off, 0 and a negative value disable the lane");
ok(await hours("abc") === 20 && await hours("") === 20, "an unreadable value keeps the default rather than disabling the lane");
ok(await hours("12") === 12 && await hours("36.5") === 36.5, "a number of hours is used as given");
ok(await hours("0.2") === 1 && await hours("1000") === 168, "the window is clamped to 1..168 hours so the share stays bounded");
db = mk(queue(), "off");
ok(await claimErrataFair(d1(db), T0) === null && one(db, "SELECT COUNT(*) n FROM research_queue WHERE status = 'researching'").n === 0, "off claims nothing and changes no row");
db = mk(queue(), "6");
claimEvent(db, "x", iso(T0 - 5 * H));
ok(await claimErrataFair(d1(db), T0) === null, "a 6 hour window is still closed by a claim 5 hours ago");
db = mk(queue(), "6");
claimEvent(db, "x", iso(T0 - 7 * H));
ok((await claimErrataFair(d1(db), T0)) !== null, "a 6 hour window is open 7 hours after the last claim");
db = mk(queue());
claimEvent(db, "elsewhere", iso(T0 - H));
db.prepare("UPDATE cloud_ops_events SET text = 'claimed proposal:p1 (pipeline x) at stage ground'").run();
ok((await claimErrataFair(d1(db), T0)) !== null, "claims of other classes do not count against the errata window");

// 6 fail-soft: a fault returns null so the normal claim still runs
ok(await claimErrataFair({ QNFO_AUDIT: { prepare() { throw new Error("d1 down"); } } }, T0) === null, "an unreadable database returns null instead of throwing");
db = mk(queue());
db.exec("DROP TABLE cloud_ops_events");
ok(await claimErrataFair(d1(db), T0) === null && one(db, "SELECT COUNT(*) n FROM research_queue WHERE status = 'researching'").n === 0, "a missing event log claims nothing rather than claiming without the bound");
db = mk([{ id: "revision-only", source_id: "revision:p@1#1" }]);
ok(await claimErrataFair(d1(db), T0) === null && one(db, "SELECT COUNT(*) n FROM cloud_ops_events").n === 0, "with no errata row queued the lane returns null and logs nothing");

// 7 wiring: the lane runs first in every claim path before the shared class allocator
const claim = src.slice(src.indexOf("async function claimNew("), src.indexOf("async function run(env)"));
ok(claim.indexOf("await claimErrataFair(env)") >= 0 && claim.indexOf("await claimErrataFair(env)") < claim.indexOf("UPDATE research_queue SET status='researching'"), "claimNew takes the errata lane before the atomic claim");
ok(/if \(!row\) row = await env\.QNFO_AUDIT\.prepare\("UPDATE research_queue SET status='researching'/.test(claim), "the atomic claim runs only when the lane claimed nothing, so its fallback honours the lane too");
ok(/return await advanceClaimed\(env, row\);/.test(claim), "claimNew hands every claimed row, whichever lane claimed it, to advanceClaimed");
const legacy = src.slice(src.indexOf("async function run(env)"), src.indexOf('__name(run, "run")'));
ok(/const errataRow = await claimErrataFair\(env\);\s*if \(errataRow\) return await advanceClaimed\(env, errataRow\);/.test(legacy) && legacy.indexOf("claimErrataFair(env)") < legacy.indexOf("RESEARCH_CLAIM_ID_SQL"), "the single-stage path takes the lane before its own claim");
ok((src.match(/SELECT \* FROM research_queue WHERE id = \(" \+ RESEARCH_CLAIM_ID_SQL/g) || []).length === 2, "fallback and single-stage claims use the shared class allocator");
const adv = src.slice(src.indexOf("async function advanceClaimed("), src.indexOf("// RESEARCH-THROUGHPUT-1: the claim half of run()"));
ok(/RESUMABLE_STAGES\.indexOf/.test(adv) && /MIRROR\.head\("pipeline\//.test(adv) && /logEvent\(env, "claim", "claimed " \+ row\.source_id/.test(adv) && /claimHeartbeat\(env, row\)/.test(adv), "advanceClaimed keeps the draft check, the claim event the window reads, and the heartbeat");
ok(!src.includes("Ensure errata remediation rows are never claimed") && src.includes('nullify the whole paper")'), "the inert snippet that said errata rows are never claimed is gone from the version comment and the comment reads whole again");

console.log("errata-claim-fair: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
