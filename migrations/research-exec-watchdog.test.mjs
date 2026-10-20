// RESEARCH-WATCHDOG-1 offline suite: applies migrations/2026-10-20-research-exec-watchdog.sql on SQLite (node:sqlite) over fixtures of the objects it touches.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, a BACKUP table it creates first) and never writes alternate_tested_at; v_dod_spof_gaps (the issue's
// reproduce query, replayed from the live view text) reads NO-ALTERNATE-PATH before and ALTERNATE-NEVER-TESTED after, and nothing once the drill's own stamp runs on a passing probe;
// the spof probe is one read-only SELECT that returns ok only when a forced stage, a fresh watchdog state and a moving queue are all present, and FAILS with a reason on each missing
// piece and on an empty world (no pass by absence), judged by the real chaosJudge sliced from qnfo-fleet-control/worker.js; the drill's stamp query (sliced from the worker) fills
// alternate_tested_at; the fm- detector reads 0 for a moving or empty queue and 1 for a 120-minute stall; the file is re-runnable and its Rollback restores the pre-state.
// Run: node migrations/research-exec-watchdog.test.mjs        (RW_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-20-research-exec-watchdog.sql"), "utf8");
const workerSrc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.RW_SKIP_MIGRATION === "1";
const COMP = "qnfo-research-exec single executor";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- the real judge and the real stamp ----
const BEGIN = "// ---- CHAOS-DRILL-1:BEGIN", END = "// ---- CHAOS-DRILL-1:END ----";
const a = workerSrc.indexOf(BEGIN), b = workerSrc.indexOf(END);
ok(a > 0 && b > a, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = workerSrc.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});
ok(/UPDATE spof_registry SET alternate_tested_at = \?1, reviewed_at = \?1 WHERE component = \?2 AND alternate_path IS NOT NULL/.test(workerSrc), "the deployed drill stamps spof_registry only for a row with an alternate_path (so the file's alternate_path is what lets the stamp land)");

// ---- static ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 400 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(hdr("BACKUP") === "bak_20261020_spof_research_exec", "BACKUP names the table the file creates first");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(/^CREATE TABLE IF NOT EXISTS bak_20261020_spof_research_exec AS SELECT \* FROM spof_registry WHERE component = /.test(stmts[0]), "the backup copy of the registry row is the first statement");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing");
ok(!/SET\s+alternate_tested_at/i.test(body) && !/SET\s+reviewed_at/i.test(body), "the file never writes alternate_tested_at or reviewed_at (only a passing drill stamps)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?|h)\b/i.test(body.replace(/inside 24 h|within \d+ h\b/g, "")), "no window, cadence or SLA is stated in hours or days in the statements");

// ---- fixture ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const sqlt = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace("T", " ").slice(0, 19);
const VIEW = "CREATE VIEW v_dod_spof_gaps AS SELECT component, CASE WHEN TRIM(COALESCE(alternate_path,''))='' THEN 'NO-ALTERNATE-PATH' WHEN alternate_tested_at IS NULL THEN 'ALTERNATE-NEVER-TESTED' ELSE 'ok' END AS verdict, critical_path FROM spof_registry WHERE TRIM(COALESCE(alternate_path,''))='' OR alternate_tested_at IS NULL";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE spof_registry (component TEXT PRIMARY KEY, critical_path TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE spof_alternate_probes (component TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, exercise TEXT, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE research_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);`);
  w.exec(VIEW);
  w.prepare("INSERT INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES (?, 'research: queue to published paper', NULL, NULL, 'one stage per tick | SPOF-RESOLVED-1 2026-10-12: kept, no tested alternate; lever on the issue', 2175)").run(COMP);
  return w;
}
const applied = () => { const w = world(); if (!SKIP) w.exec(body); return w; };
const judge = (w, p) => chaosJudge(w.prepare(p).all());
let evN = 0;
const ev = (w, kind, job, status, minAgo) => w.prepare("INSERT INTO cloud_ops_events VALUES (?,?,?,?,?,?)").run("e" + evN++, iso(minAgo), kind, "x", job, status);
const gaps = (w) => w.prepare("SELECT component, verdict FROM v_dod_spof_gaps WHERE component = ?").all(COMP);

// ---- before / after: the issue's reproduce query ----
{
  const pre = world();
  ok(gaps(pre)[0] && gaps(pre)[0].verdict === "NO-ALTERNATE-PATH", "before the file: the component reads NO-ALTERNATE-PATH (the issue's defect)");
  const w = applied();
  const g = gaps(w);
  ok(g.length === 1 && g[0].verdict === "ALTERNATE-NEVER-TESTED", "after the file: the component reads ALTERNATE-NEVER-TESTED until a drill passes (the alternate is declared with its code, not yet proven)", g);
  const row = w.prepare("SELECT alternate_path, alternate_tested_at, evidence FROM spof_registry WHERE component = ?").get(COMP);
  ok(/research-exec-watchdog/.test(row.alternate_path || "") && /RESEARCH_EXEC service binding/.test(row.alternate_path || "") && row.alternate_tested_at === null, "alternate_path names the watchdog and the binding; alternate_tested_at stays NULL", row);
  ok(/EVOLVE-1 2026-10-20/.test(row.evidence) && /SPOF-RESOLVED-1 2026-10-12/.test(row.evidence), "evidence keeps the old text and appends the new");
  if (!SKIP) ok(w.prepare("SELECT COUNT(*) n FROM bak_20261020_spof_research_exec").get().n === 1 && w.prepare("SELECT alternate_path FROM bak_20261020_spof_research_exec").get().alternate_path === null, "the backup holds the pre-change registry row");
}

// ---- the spof probe ----
{
  const w = applied();
  const pr = w.prepare("SELECT probe_sql, exercise, window_note, enabled FROM spof_alternate_probes WHERE component = ?").get(COMP);
  ok(pr && pr.probe_sql.length > 200 && pr.enabled === 1 && pr.exercise === null, "the component has an enabled, exercise-free spof_alternate_probes row");
  if (pr) {
    const p = pr.probe_sql;
    ok(!/;/.test(p) && /^SELECT /.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the probe is one read-only SELECT with no write keyword");
    ok(/'-\d+ minutes'/.test(p) && !/'-\d+ (hours?|days?)'/.test(p), "windows are in minutes");
    ok(/^1560 minutes for the forced proof stage/.test(pr.window_note), "the window note is the one the Rollback keys on");
    const empty = judge(w, p);
    ok(!empty.pass && /no research-watchdog stage was forced/.test(empty.observed), "an empty world (the state before the worker is deployed) fails with the reason: no pass by absence", empty);
    w.prepare("INSERT INTO research_queue (status) VALUES ('queued')").run();
    ev(w, "research-watchdog", "research-exec-watchdog", "ok", 60);
    w.prepare("INSERT INTO scheduler_state VALUES ('research_exec_watchdog','{}',?)").run(sqlt(5));
    ev(w, "done", "qnfo-research-exec", "ok", 3);
    let v = judge(w, p); ok(v.pass && v.observed === "ok", "ok with a forced stage 60 minutes ago, state 5 minutes old and a stage finished 3 minutes ago", v);
    w.prepare("UPDATE cloud_ops_events SET status = 'error' WHERE kind = 'research-watchdog'").run();
    v = judge(w, p); ok(!v.pass && /no research-watchdog stage was forced and answered/.test(v.observed), "a forced stage that errored does not count as a run of the alternate", v);
    w.prepare("UPDATE cloud_ops_events SET status = 'ok', ts = ? WHERE kind = 'research-watchdog'").run(iso(1561));
    v = judge(w, p); ok(!v.pass && /1560 minutes/.test(v.observed), "a forced stage 1561 minutes ago fails (the daily proof stage is overdue)", v);
    w.prepare("UPDATE cloud_ops_events SET ts = ? WHERE kind = 'research-watchdog'").run(iso(1559));
    ok(judge(w, p).pass, "1559 minutes ago still passes (the edge)");
    w.prepare("UPDATE scheduler_state SET updated_at = ?").run(sqlt(31));
    v = judge(w, p); ok(!v.pass && /state was not written in 30 minutes/.test(v.observed), "a watchdog state 31 minutes old fails (the tick no longer evaluates the queue)", v);
    w.prepare("UPDATE scheduler_state SET updated_at = ?").run(sqlt(29));
    ok(judge(w, p).pass, "29 minutes old still passes (the edge)");
    w.prepare("UPDATE cloud_ops_events SET ts = ? WHERE kind = 'done'").run(iso(121));
    v = judge(w, p); ok(!v.pass && /no stage finished in 120 minutes/.test(v.observed), "work waits and the last stage finished 121 minutes ago: fails", v);
    w.prepare("DELETE FROM research_queue").run();
    ok(judge(w, p).pass, "an empty queue with a quiet research-exec is not a stall");
    // the drill's stamp, as the worker runs it
    w.prepare("INSERT INTO research_queue (status) VALUES ('researching')").run();
    w.prepare("UPDATE cloud_ops_events SET ts = ? WHERE kind = 'done'").run(iso(3));
    const verdict = judge(w, p);
    const stamp = w.prepare("UPDATE spof_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE component = ?2 AND alternate_path IS NOT NULL");
    if (verdict.pass) stamp.run(new Date().toISOString(), COMP);
    ok(verdict.pass && gaps(w).length === 0, "a passing drill stamps the row and v_dod_spof_gaps reads 0 rows for the component (the issue's reproduce query)", gaps(w));
    // the stamp cannot land on a row the file never gave an alternate_path
    const bare = world();
    bare.prepare("UPDATE spof_registry SET alternate_tested_at = ?1 WHERE component = ?2 AND alternate_path IS NOT NULL").run("x", COMP);
    ok(bare.prepare("SELECT alternate_tested_at t FROM spof_registry").get().t === null, "without the file's alternate_path the drill's stamp changes nothing");
  }
}

// ---- the detector ----
{
  const w = applied();
  const c = w.prepare("SELECT verify_probe, status, verify_transport FROM remediation_contracts WHERE class = 'fm-research-exec-stalled'").get();
  ok(c && c.status === "active" && c.verify_transport === "d1-query" && /^SELECT '0' AS expected/.test(c.verify_probe), "the fm-research-exec-stalled detector contract is active, d1-query, expected 0");
  if (c) {
    const q = () => w.prepare(c.verify_probe).get().observed;
    ok(q() === "0", "an empty queue reads 0");
    w.prepare("INSERT INTO research_queue (status) VALUES ('queued')").run();
    ok(q() === "1", "a queued row and no finished stage reads 1");
    ev(w, "done", "qnfo-research-exec", "ok", 119);
    ok(q() === "0", "a stage finished 119 minutes ago reads 0");
    w.prepare("UPDATE cloud_ops_events SET ts = ?").run(iso(121));
    ok(q() === "1", "a stage finished 121 minutes ago reads 1");
    w.prepare("UPDATE cloud_ops_events SET ts = ?, job = 'other'").run(iso(1));
    ok(q() === "1", "another job's done event does not count");
    ok(!/;/.test(c.verify_probe) && !/\b(insert|update|delete|drop|create|alter)\b/i.test(c.verify_probe), "the detector probe is one read-only SELECT");
  }
  ok(!!w.prepare("SELECT 1 FROM failure_modes WHERE fm_key = 'research-exec-stalled' AND issue_id = 2838 AND detector LIKE 'fm-research-exec-stalled%'").get(), "the failure mode row exists with its fm- detector name and the issue");
}

// ---- re-run and rollback ----
if (!SKIP) {
  const w = applied();
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM spof_registry").all(), w.prepare("SELECT * FROM spof_alternate_probes").all(), w.prepare("SELECT fm_key FROM failure_modes").all(), w.prepare("SELECT class FROM remediation_contracts").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get(), w.prepare("SELECT COUNT(*) n FROM bak_20261020_spof_research_exec").get()]);
  const once = snap();
  w.exec(body);
  ok(snap() === once, "a second apply changes nothing (guarded UPDATE, INSERT OR IGNORE, decision_log guarded by text)");
  const pre = world();
  const preRow = JSON.stringify(pre.prepare("SELECT * FROM spof_registry").all());
  w.exec(rollback);
  ok(JSON.stringify(w.prepare("SELECT * FROM spof_registry").all()) === preRow, "the Rollback restores the registry row text for text (alternate_path NULL, evidence as before)");
  ok(w.prepare("SELECT COUNT(*) n FROM spof_alternate_probes").get().n === 0 && w.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0 && w.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0, "the Rollback removes the probe, the failure mode and the detector");
}

console.log(`research-exec-watchdog (migration): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
