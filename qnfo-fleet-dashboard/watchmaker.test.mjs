// WATCHMAKER-INDEX-1 offline suite: replays the watchmaker block from worker.js against an in-memory SQLite D1 with
// synthetic ledgers and proves: a fully fresh fleet reads 0; a stalled runner, a never-run one, an unreadable ledger,
// a research backlog and live code-task merges each count; a first run not yet due and the owner's by-policy approvals do
// not; the daily run writes one row and the metric once per day, never before 07:00Z; GET /api/watchmaker serves it.
// Run: node qnfo-fleet-dashboard/watchmaker.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("var WATCHMAKER_AFTER_UTC_HOUR");
const b = src.indexOf("// NO-CLAUDE-RUNTIME-DEPENDENCY-1: the owner's data and workflow live on Cloudflare.");
if (a < 0 || b < a) throw new Error("WATCHMAKER-INDEX-1 block not found in worker.js");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, created_at TEXT);
CREATE TABLE charter_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE portfolio_sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT);
CREATE TABLE evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, last_attempt_at TEXT);
CREATE TABLE intents (id TEXT PRIMARY KEY, status TEXT, type TEXT, created_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT,
  owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);`);
const NOW = Date.parse("2026-10-06T08:00:00Z");
const ago = (h) => new Date(NOW - h * 36e5).toISOString();
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('portfolio-daily-2026-10-06', ?, 'ok')").run(ago(3));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('portfolio-dailyx', ?, 'ok')").run(ago(1));   // outside the id range
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('reach-ingest-2026-10-06', ?, 'ok')").run(ago(6));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jo-qnfo-backlog-exec-abc', ?, 'ok')").run(ago(7));
db.prepare("INSERT INTO portfolio_runs (run_date, kind, created_at) VALUES ('2026-10-05', 'identity-weekly', ?)").run(new Date(NOW - 26 * 36e5).toISOString().replace("T", " ").slice(0, 19));
db.prepare("INSERT INTO charter_snapshots (ts) VALUES (?)").run(ago(5));
db.prepare("INSERT INTO portfolio_sync_runs (ts, status) VALUES (?, 'ok')").run(ago(1));
db.prepare("INSERT INTO evolve_candidates (ts) VALUES (?)").run(ago(9));
db.prepare("INSERT INTO remediation_contracts (class, last_attempt_at) VALUES ('EVID-1', ?)").run(new Date(NOW - 2 * 36e5).toISOString().replace("T", " ").slice(0, 19));
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('i1', 'pending', 'research', ?)").run(ago(10));

function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(sql) };
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, isNaN });
vm.runInContext("var VERSION = 'test'; var DAY_MS = 864e5; function squash(s) { return String(s).replace(/\\s+/g, ' '); }\n" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
  src.slice(a, b) + "\n;this.__api = { watchmakerMeasure, watchmakerDaily, wmIso };", cx);
const api = cx.__api;
const env = { AUDIT };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const op = (m, k) => m.ops.find((o) => o.key === k);

let m = await api.watchmakerMeasure(env, NOW);
ok(m.index === 0 && m.counted.length === 0, "a fully fresh fleet reads 0 (got " + m.index + ": " + m.counted.join(",") + ")");
ok(op(m, "portfolio-daily").state.startsWith("ok") && op(m, "portfolio-daily").age_h === 3, "the id range picks the real portfolio-daily row");
ok(op(m, "identity-weekly").state.startsWith("ok") && op(m, "time-gated-verification").state.startsWith("ok"), "space-format timestamps are read as UTC");
ok(!op(m, "linkedin-draft-approval").counted && /by policy/.test(op(m, "linkedin-draft-approval").state), "by-policy owner approvals are listed, not counted");
ok(!op(m, "code-task-merge").counted && /^0 code tasks/.test(op(m, "code-task-merge").state), "no live code-task PRs: merging is dormant, not counted");
ok(m.retired.length === 4, "retired claude.ai Routines are listed with what replaced them");

db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('t1', 'pending', 'task', ?)").run(ago(5));
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "task-intent-intake").counted, "a fresh task intent is not yet counted");
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('t2', 'pending', 'task', ?)").run(ago(100));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "task-intent-intake").counted && /^1 pending task intents older than 48h with no consumer/.test(op(m, "task-intent-intake").state) && m.index === 1, "task intents nobody reads count once 48h old");
db.exec("DELETE FROM intents WHERE id IN ('t1', 't2')");

// Stalled, never-run, backlog, live merges, unreadable
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'portfolio-daily-2026-10-06'").run(ago(60));
db.exec("DELETE FROM charter_snapshots");
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('i2', 'pending', 'research', ?)").run(ago(72));
db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('c1', 'published', ?)").run(ago(48));
db.exec("DROP TABLE evolve_candidates");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "portfolio-daily").counted && /stalled: last run 60h ago, cadence 24h/.test(op(m, "portfolio-daily").state), "a runner silent for over twice its cadence counts as stalled");
ok(op(m, "charter-loop").counted && op(m, "charter-loop").state === "never ran", "a runner past its first due date that never ran counts");
ok(op(m, "research-intent-triage").counted && /^1 pending research intents older than 48h/.test(op(m, "research-intent-triage").state), "a research backlog older than 48h counts");
ok(op(m, "code-task-merge").counted && /^1 code tasks waiting/.test(op(m, "code-task-merge").state), "a code task waiting on a person counts");
ok(op(m, "fleet-defects").counted && /^unmeasured/.test(op(m, "fleet-defects").state), "an unreadable ledger counts as unmeasured");
ok(m.index === 5 && m.counted.join(",") === "charter-loop,fleet-defects,portfolio-daily,research-intent-triage,code-task-merge".split(",").sort((x, y) => m.counted.indexOf(x) - m.counted.indexOf(y)).join(","), "the index is the number of counted operations (" + m.index + ")");
// first_due in the future: not counted
const early = await api.watchmakerMeasure(env, Date.parse("2026-10-01T15:00:00Z"));
ok(/^first run due/.test(op(early, "charter-loop").state) && !op(early, "charter-loop").counted, "a new loop is not counted before its first run is due");

// Daily run: once a day, after 07:00Z, writes the row and the metric
let d = await api.watchmakerDaily(env, { now: Date.parse("2026-10-06T06:30:00Z") });
ok(/before 7:00Z/.test(d.skipped || ""), "nothing runs before 07:00Z");
d = await api.watchmakerDaily(env, { now: NOW });
const row = db.prepare("SELECT day, index_value, counted FROM watchmaker_runs").get();
ok(row && row.day === "2026-10-06" && row.index_value === 5 && row.counted.includes("portfolio-daily"), "one watchmaker_runs row per day");
const mr = db.prepare("SELECT * FROM metric_registry WHERE metric = 'watchmaker_index'").get();
ok(mr && mr.last_value === "5" && mr.refresh_cadence === "daily" && mr.target === "0" && mr.source_of_truth && mr.disposition_actor, "metric_registry carries the index with the METRIC-INTEGRITY-1 fields");
d = await api.watchmakerDaily(env, { now: NOW + 36e5 });
ok(/already measured/.test(d.skipped || "") && db.prepare("SELECT COUNT(*) n FROM watchmaker_runs").get().n === 1, "a second run the same day is skipped");
ok(api.wmIso(1790849435000) === "2026-10-01T10:10:35.000Z" && api.wmIso(1790849435) === "2026-10-01T10:10:35.000Z" && api.wmIso("x") === null, "epoch ms, epoch s and junk are handled");

// GET /api/watchmaker through the real fetch handler (no OWNER_TOKEN configured: full view)
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const r = await worker.fetch(new Request("https://fleet.qnfo.org/api/watchmaker"), { AUDIT }, { waitUntil() {}, passThroughOnException() {} });
const j = await r.json();
ok(r.status === 200 && j.day === "2026-10-06" && j.index === 5 && Array.isArray(j.ops) && j.ops.length >= 10, "GET /api/watchmaker serves the latest run");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
