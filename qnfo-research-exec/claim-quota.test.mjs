// RESEARCH-PRIORITY-STARVATION-1 (#3751): run real claim SQL against SQLite, including racing slots.
// Run: node qnfo-research-exec/claim-quota.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { claimErrataFair } from "./worker.js";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const selector = src.match(/var RESEARCH_CLAIM_ID_SQL = `([^`]+)`;/)[1];
const body = src.slice(src.indexOf("async function claimNew("), src.indexOf("async function run(env)"));
const claimNew = new Function("RESEARCH_CLAIM_ID_SQL", "claimErrataFair", "nowIso", "logEvent", "resumeStage", "advanceClaimed",
  body + "; return claimNew;")(selector, async () => null, () => new Date().toISOString(), async () => {},
  (row) => ["complete", "review", "revise", "verify"].includes(row.stage) ? row.stage : "ground",
  async (_env, row) => ({ status: "ok", row }));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + " :: " + JSON.stringify(x)); } };

function fixture({ proposals = 40, revisions = 40, others = 40, fallback = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, source TEXT, source_id TEXT, stage TEXT, created_at TEXT, score REAL, attempt INTEGER DEFAULT 0, claimed_at TEXT);"
    + "CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);"
    + "CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  const insert = db.prepare("INSERT INTO research_queue (id,status,source,source_id,stage,created_at,score) VALUES (?,'queued',?,?,? ,?,?)");
  for (const [source, count] of [["proposal", proposals], ["remediation", revisions], ["idea", others]]) {
    for (let i = 0; i < count; i++) {
      insert.run(source + i, source, source === "remediation" ? "revision:p" + i : source + ":" + i,
        i === 0 ? "revise" : null, new Date().toISOString(), source === "proposal" ? 0.9 + i / 1000 : 0.99);
    }
  }
  const env = { QNFO_AUDIT: { prepare(sql) {
    let args = [];
    return {
      bind(...a) { args = a; return this; },
      async first() {
        if (fallback && sql.includes("RETURNING")) throw new Error("RETURNING unsupported");
        return db.prepare(sql).get(...args) || null;
      },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; }
    };
  } } };
  const counts = () => db.prepare("SELECT source, COUNT(*) n FROM research_queue WHERE status='researching' GROUP BY source").all();
  return { db, env, counts };
}

// A scarce prefix already includes proposals; a full window satisfies integer-rounded quotas.
for (const fallback of [false, true]) {
  const f = fixture({ fallback });
  const first = await claimNew(f.env);
  ok(first.row.source === "proposal" && first.row.id === "proposal39", "first scarce claim is the highest-score proposal", first.row);
  const results = [first, ...await Promise.all(Array.from({ length: 40 }, () => claimNew(f.env)))];
  if (fallback) {
    ok(results.filter((r) => r.row).length === 2, "racing fallback losers stay idle instead of bypassing quota revalidation");
    for (let i = 0; i < 24; i++) results.push(await claimNew(f.env));
  }
  const rows = results.filter((r) => r.row).map((r) => r.row);
  const counts = Object.fromEntries(f.counts().map((r) => [r.source, r.n]));
  ok(rows.length === 24 && new Set(rows.map((r) => r.id)).size === 24, "racing slots fill exactly 24 distinct rows, fallback=" + fallback, counts);
  ok(counts.proposal === 8 && counts.remediation === 14 && counts.idea === 2, "window reserves >=30% proposals, <=60% revisions and other-source progress", counts);
  ok(rows.some((r) => r.id === "remediation0" && r.stage === "revise"), "resumable draft stage is retained", rows.map((r) => [r.id, r.stage]));
  f.db.close();
}

// Existing researching and publish-ready rows count against quotas, even when more slots race.
let f = fixture();
f.db.exec("UPDATE research_queue SET status='researching' WHERE source='remediation' AND CAST(substr(id,12) AS INTEGER)<13;"
  + "UPDATE research_queue SET status='review', stage='publish' WHERE id='remediation13'");
await Promise.all(Array.from({ length: 40 }, () => claimNew(f.env)));
ok(f.db.prepare("SELECT COUNT(*) n FROM research_queue WHERE source='remediation' AND status='queued'").get().n === 26,
  "14 existing revision rows, including publish-ready work, prevent any further revision claim");
ok(f.db.prepare("SELECT COUNT(*) n FROM research_queue WHERE status='researching' OR status='review'").get().n === 24,
  "pre-existing work does not permit the window to overflow");
f.db.close();

// A legacy window with too many other-source rows must reserve every remaining slot for proposals.
f = fixture();
f.db.exec("UPDATE research_queue SET status='researching' WHERE source='idea' AND CAST(substr(id,5) AS INTEGER)<16");
f.db.exec("INSERT INTO research_queue (id,status,source,source_id,created_at,score) VALUES ('errata','queued','remediation','errata:p','2026-01-01',1)");
ok(await claimErrataFair(f.env) === null, "errata lane cannot borrow slots reserved for the proposal floor");
await Promise.all(Array.from({ length: 40 }, () => claimNew(f.env)));
ok(f.db.prepare("SELECT COUNT(*) n FROM research_queue WHERE source='proposal' AND status='researching'").get().n === 8,
  "proposal floor survives pre-existing over-allocation to another class");
f.db.close();

// Selection never changes the parked/deferred pool, regardless of its score.
f = fixture();
f.db.exec("INSERT INTO research_queue (id,status,source,source_id,created_at,score,attempt) VALUES ('parked','deferred','proposal','proposal:parked','2026-01-01',1,7)");
const parked = f.db.prepare("SELECT * FROM research_queue WHERE id='parked'").get();
await Promise.all(Array.from({ length: 40 }, () => claimNew(f.env)));
ok(JSON.stringify(f.db.prepare("SELECT * FROM research_queue WHERE id='parked'").get()) === JSON.stringify(parked),
  "claim quotas leave parked/deferred rows unchanged");
f.db.close();

// Missing classes may lend their unused slots, but cannot lift the revision ceiling.
for (const [proposals, revisions, others, expected] of [[40, 0, 0, 24], [0, 40, 0, 14], [0, 0, 40, 24], [40, 40, 0, 24], [2, 40, 40, 24], [0, 0, 0, 0]]) {
  f = fixture({ proposals, revisions, others });
  await Promise.all(Array.from({ length: 40 }, () => claimNew(f.env)));
  const counts = Object.fromEntries(f.counts().map((r) => [r.source, r.n]));
  ok(Object.values(counts).reduce((a, b) => a + b, 0) === expected && (counts.remediation || 0) <= 14,
    "empty/sparse classes borrow capacity without exceeding revision limit", { proposals, revisions, others, counts });
  if (proposals === 2) ok(counts.proposal === 2, "all available proposals are admitted when supply is below its floor", counts);
  f.db.close();
}

// Repeated single-slot scarcity cannot starve an old low-score row in any class.
for (const source of ["proposal", "remediation", "idea"]) {
  f = fixture();
  f.db.prepare("DELETE FROM research_queue WHERE source<>?").run(source);
  f.db.prepare("UPDATE research_queue SET created_at='2026-01-01T00:00:00Z', score=0.01 WHERE id=?").run(source + "0");
  const ids = [];
  for (let i = 0; i < 8; i++) {
    const r = await claimNew(f.env);
    ids.push(r.row.id);
    f.db.prepare("UPDATE research_queue SET status='done' WHERE id=?").run(r.row.id);
  }
  ok(ids[3] === source + "0" && ids[0] !== source + "0", "aged FIFO gets a recurring turn while normal turns use score: " + source, ids);
  f.db.close();
}

// The independent errata lane must not bypass a full window.
f = fixture();
await Promise.all(Array.from({ length: 24 }, () => claimNew(f.env)));
f.db.exec("INSERT INTO research_queue (id,status,source,source_id,created_at,score) VALUES ('errata','queued','remediation','errata:p','2026-01-01',1)");
ok(await claimErrataFair(f.env) === null, "errata fairness lane respects the same total window");
f.db.close();
console.log("claim-quota: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
