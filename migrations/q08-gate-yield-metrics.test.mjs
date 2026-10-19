// Q08-YIELD-1 + Q08-REVIEWER-SWAP-1 offline suite for migrations/2026-10-19-q08-gate-yield-metrics.sql (q08-signal-engine 0.31.0).
// Replays the file twice on SQLite against the live qnfo-audit definitions of control_registry, failure_modes, remediation_contracts,
// capability_ledger and decision_log (read from sqlite_master on 2026-10-19, decision_log with its append-only triggers). Proves: the header
// opts into CI and names a one-line rollback; the file inserts the five controls/modes/contracts/capabilities of the yield patch and the
// reviewer-order rows exactly once however often it is replayed (the decision_log row included); every row passes the table's own CHECKs;
// the probes are plain SELECTs (no ";", no write keyword, an expected and an observed column) and read the right thing on fixtures: the
// reviewer-share contract is red on the 2026-10-19 q08 numbers and green when the erroring models take a tenth of the calls or less, the
// thin-source and repeat-class contracts read q08-signal engine_runs; and the Rollback line removes every registry row while the append-only
// decision_log row stays.
// Q08_YIELD_SQL=<path> replays another file (an empty one shows the suite failing on the base).
// Run: node migrations/q08-gate-yield-metrics.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.Q08_YIELD_SQL || here("2026-10-19-q08-gate-yield-metrics.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];

const SCHEMA = `
CREATE TABLE control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE failure_modes (
  fm_key TEXT PRIMARY KEY,
  failure_mode TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  remediation TEXT NOT NULL,
  detector TEXT NOT NULL,
  probe_class TEXT,
  first_seen TEXT NOT NULL,
  issue_id INTEGER
, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE capability_ledger (
  capability TEXT PRIMARY KEY,
  provenance TEXT NOT NULL,
  prerequisites TEXT,
  reliability TEXT,
  acquired_at TEXT NOT NULL,
  last_exercised_at TEXT,
  evidence TEXT NOT NULL
);
CREATE TABLE decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  assumption TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  outcome TEXT NOT NULL,
  blast_radius TEXT NOT NULL,
  rollback_path TEXT NOT NULL
, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
`;
const fresh = () => { const db = new DatabaseSync(":memory:"); db.exec(SCHEMA); return db; };
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);

// ---- header: CI opt-in, database, one-line rollback --------------------------------------------------------------------------------
const lines = sql.split("\n");
const head = (k) => lines.find((l) => l.startsWith("-- " + k + ":"));
ok(head("APPLY-BY") === "-- APPLY-BY: ci" && head("DB") === "-- DB: qnfo-audit", "the header opts into CI and names qnfo-audit");
const rollback = (head("Rollback") || "").replace(/^-- Rollback:\s*/, "");
ok(rollback.length > 0 && !/\n/.test(rollback) && /DELETE FROM control_registry/.test(rollback) && /'q08-reviewer-health-order'/.test(rollback) && /fm-q08-reviewer-error-share/.test(rollback) && /'q08-reviewer-error-share'/.test(rollback), "the Rollback line is one line and covers the reviewer rows as well as the yield rows", rollback.slice(0, 200));
ok(!/decision_log/.test(rollback), "the Rollback line leaves the append-only decision_log alone");
ok(!/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file itself runs no DELETE or DROP (so no BACKUP line is owed)");
ok(!/0\.29\.0/.test(sql) && /0\.31\.0/.test(sql), "the yield rows name the version that lands (0.31.0), not the one the handoff patch assumed");

// ---- replay twice ----------------------------------------------------------------------------------------------------------------------------
const db = fresh();
let err = null;
try { db.exec(sql); db.exec(sql); } catch (e) { err = String(e && e.message || e); }
ok(err === null, "the file runs twice on SQLite without an error", err);
const cnt = (t) => one(db, "SELECT COUNT(*) AS n FROM " + t).n;
const CONTROLS = ["q08-source-sufficiency-pregate", "q08-repeat-class-repair-stop", "q08-reviewer-health-order"];
const FMS = ["q08-thin-source-composed", "q08-repeat-class-extension", "q08-reviewer-error-share"];
const CLASSES = ["fm-q08-thin-source-composed", "fm-q08-repeat-class-extension", "fm-q08-reviewer-error-share"];
ok(cnt("control_registry") === 3 && all(db, "SELECT control FROM control_registry ORDER BY control").map((r) => r.control).join() === CONTROLS.slice().sort().join(), "three controls, once each after two replays", all(db, "SELECT control FROM control_registry"));
ok(cnt("failure_modes") === 3 && all(db, "SELECT fm_key FROM failure_modes ORDER BY fm_key").map((r) => r.fm_key).join() === FMS.slice().sort().join(), "three failure modes, once each");
ok(cnt("remediation_contracts") === 3 && all(db, "SELECT class FROM remediation_contracts ORDER BY class").map((r) => r.class).join() === CLASSES.slice().sort().join(), "three fm- detector contracts, once each");
ok(cnt("capability_ledger") === 2 && one(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability IN ('q08-run-yield-log', 'q08-reviewer-health-order')").n === 2, "two capability rows, once each");
ok(cnt("decision_log") === 1, "one decision_log row after two replays (the insert is guarded)", cnt("decision_log"));

// ---- the rows are what the doctrine asks for ---------------------------------------------------------------------------------------------------
const rv = one(db, "SELECT * FROM control_registry WHERE control = 'q08-reviewer-health-order'");
ok(rv && rv.kind === "filter" && rv.disposition === "keep" && rv.disposition_state === "applied" && rv.critical_path === 0 && rv.issue_id === 2606 && /declared order is the floor/.test(rv.alternate_path) && /model-floor-guard/.test(rv.evidence) && rv.alternate_tested_at, "the reviewer ordering is registered as a filter (keep, applied, off the critical path) with its alternate and its evidence", rv);
const rvfm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'q08-reviewer-error-share'");
ok(rvfm && rvfm.probe_class === "fm-q08-reviewer-error-share" && /58 to 80 s/.test(rvfm.failure_mode) && /MODEL-FLOOR-1/.test(rvfm.root_cause) && rvfm.trigger_condition && rvfm.symptom && rvfm.blast_radius, "the failure mode names its root cause, trigger, symptom and detector class", rvfm);
const dl = one(db, "SELECT * FROM decision_log");
ok(dl && dl.actor.startsWith("session_01QpQv19uh1padRwZ3u1r766") && /qwen3-30b-a3b-fp8 was NOT used/.test(dl.action) && /model-floor-guard/.test(dl.evidence) && dl.outcome === "pending" && dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.predicted_outcome === "q08_panel_unavailable_share_7d <= 0.05 within 168 h" && /^[a-z0-9_]+ (<|<=|>|>=|=) [0-9.]+ within [0-9]+ h$/.test(dl.predicted_outcome), "the decision is logged with its refusal reason, capability gain, a prediction in the form decision_predictions_parse scores (a no-regression guard on the registered metric q08_panel_unavailable_share_7d), and the surfaces tested", dl);
ok(/ai_call_counters/.test(dl.evidence) && /104 of 134/.test(dl.evidence) && /175 of 400/.test(dl.evidence), "the decision cites the measured error counts");

// ---- the probes are plain SELECTs ------------------------------------------------------------------------------------------------------------------
const contracts = all(db, "SELECT * FROM remediation_contracts ORDER BY class");
for (const c of contracts) {
  const p = c.verify_probe, low = p.toLowerCase();
  ok(/^select\b/i.test(p) && !p.includes(";") && /\bexpected\b/i.test(p) && /\bobserved\b/i.test(p), c.class + ": a single SELECT with expected and observed columns and no semicolon", p.slice(0, 80));
  ok(!WRITE_KW.some((k) => low.includes(k)), c.class + ": no write keyword in the probe, string literals included", WRITE_KW.filter((k) => low.includes(k)));
  ok(c.status === "active" && c.expected_cadence_h === 1 && c.max_attempts === 3 && c.module === "failure-mode", c.class + ": active, hourly, three attempts", [c.status, c.expected_cadence_h, c.max_attempts]);
}
ok(contracts.find((c) => c.class === "fm-q08-reviewer-error-share").verify_transport === "d1-query" && contracts.filter((c) => c.verify_transport === "d1-query@q08-signal").length === 2, "the reviewer contract reads qnfo-audit; the two run-log contracts read q08-signal");
const due = (c) => c.next_due_at ? (Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) / 36e5 : null;
ok(due(contracts.find((c) => c.class === "fm-q08-reviewer-error-share")) > 24 && due(contracts.find((c) => c.class === "fm-q08-reviewer-error-share")) < 31, "the reviewer contract is first due about 30 hours after the migration, after a full UTC day on the new order", due(contracts.find((c) => c.class === "fm-q08-reviewer-error-share")));

ok(["fm-q08-thin-source-composed", "fm-q08-repeat-class-extension"].every((k) => { const h = due(contracts.find((c) => c.class === k)); return h > 2 && h < 4; }), "the two run-log contracts are first due about three hours after the migration, once the worker has added the engine_runs columns they read");

// ---- fm-q08-reviewer-error-share on fixtures (qnfo-audit.ai_call_counters) ----------------------------------------------------------------------
{
  const probe = contracts.find((c) => c.class === "fm-q08-reviewer-error-share").verify_probe;
  const day = (off) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
  const run = (rows) => {
    const d = fresh();
    const ins = d.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors) VALUES (?, ?, 'binding', ?, ?, ?)");
    for (const r of rows) ins.run(r[0], r[1] || "q08-signal-engine", r[2], r[3], r[4]);
    return d.prepare(probe).get();
  };
  const T = day(0), Y = day(-1);
  // 2026-10-19 numbers: glm-5.3-flash and qwen3.8-27b erroring and still asked on most calls
  const before = run([[Y, null, "glm", 217, 96], [Y, null, "qwen", 78, 63], [Y, null, "kimi", 148, 0], [Y, null, "dsf", 214, 1], [T, null, "glm", 102, 39], [T, null, "qwen", 38, 27], [T, null, "kimi", 68, 0], [T, null, "dsf", 101, 3]]);
  ok(before.expected === "ok" && /^erroring models took 140 of 309 q08 calls today$/.test(before.observed), "on the 2026-10-19 numbers the contract reads red and says how many calls went to erroring models", before);
  // after the swap: the two erroring models are the tail, asked on a few calls only
  const after = run([[Y, null, "glm", 217, 96], [Y, null, "qwen", 78, 63], [Y, null, "kimi", 148, 0], [Y, null, "dsf", 214, 1], [T, null, "glm", 9, 4], [T, null, "qwen", 3, 3], [T, null, "kimi", 120, 0], [T, null, "dsf", 150, 2]]);
  ok(after.observed === "ok", "with the erroring models on 12 of 282 calls today the contract reads ok", after);
  ok(run([[T, null, "kimi", 100, 0], [T, null, "dsf", 100, 1]]).observed === "ok", "no erroring model: ok");
  ok(run([]).observed === "ok", "no calls today: ok (nothing to be wrong about)");
  ok(run([[T, "personal-companion", "glm", 500, 400], [T, null, "kimi", 50, 0]]).observed === "ok", "another worker's errors do not count against q08");
  ok(run([[Y, null, "glm", 5, 5], [T, null, "glm", 5, 5], [T, null, "kimi", 20, 0]]).observed === "ok", "a model under 12 calls in two days is not flagged (same threshold as the worker)");
  const edge = run([[T, null, "kimi", 90, 0], [T, null, "glm", 10, 5], [Y, null, "glm", 10, 5]]);
  ok(edge.observed === "ok", "exactly a tenth of today's calls is still ok", edge);
  ok(/^erroring models took 11 of 101 q08 calls today$/.test(run([[T, null, "kimi", 90, 0], [T, null, "glm", 11, 6], [Y, null, "glm", 11, 6]]).observed), "just over a tenth reads red");
}

// ---- the two run-log contracts on a q08-signal fixture ---------------------------------------------------------------------------------------------
{
  const thin = contracts.find((c) => c.class === "fm-q08-thin-source-composed").verify_probe;
  const rep = contracts.find((c) => c.class === "fm-q08-repeat-class-extension").verify_probe;
  const mk = () => {
    const d = new DatabaseSync(":memory:");
    d.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER, signals_scored INTEGER, piece_published INTEGER, top_signal TEXT, model TEXT, ms INTEGER, status TEXT, error TEXT, source_chars INTEGER, source_kind TEXT, compose_calls INTEGER, verify_calls INTEGER)");
    return d;
  };
  const d = mk();
  const ins = d.prepare("INSERT INTO engine_runs (ran_at, status, error, source_chars, compose_calls) VALUES (datetime('now', ?), ?, ?, ?, ?)");
  for (const sc of [1500, 2600, 3000, 2800, 4100]) ins.run("-3 days", "ok", null, sc, 1);
  ok(d.prepare(thin).get().observed === "0", "thin-source contract: no failed run below the learned floor reads 0");
  ins.run("-2 hours", "gate_failed", "unsupported claim", 900, 3);
  ok(d.prepare(thin).get().observed === "1", "thin-source contract: a failed run composed from 900 characters (floor 1500) reads 1");
  ok(d.prepare(rep).get().observed === "0", "repeat-class contract: no extension after a repeat reads 0");
  ins.run("-1 hours", "gate_failed", "round 2: prune - 5 chars short, extending the pruned draft", 2000, 4);
  ok(d.prepare(rep).get().observed === "1", "repeat-class contract: a logged run that extended a pruned draft reads 1");
  ok(d.prepare(thin).get().expected === "0" && d.prepare(rep).get().expected === "0", "both read against an expected 0");
}

// ---- rollback: every registry row goes, the append-only decision stays -------------------------------------------------------------------------------
{
  let rbErr = null;
  try { db.exec(rollback); } catch (e) { rbErr = String(e && e.message || e); }
  ok(rbErr === null, "the Rollback line runs on the migrated tables", rbErr);
  ok(cnt("control_registry") === 0 && cnt("failure_modes") === 0 && cnt("remediation_contracts") === 0 && cnt("capability_ledger") === 0, "it removes every control, failure mode, contract and capability row the file added");
  ok(cnt("decision_log") === 1, "the decision_log row stays (append-only)");
  let del = null;
  try { db.exec("DELETE FROM decision_log"); } catch (e) { del = String(e && e.message || e); }
  ok(/append-only/.test(String(del)), "the fixture keeps the live append-only trigger, so a Rollback that touched decision_log would have failed", del);
}

console.log("q08-gate-yield-metrics.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
