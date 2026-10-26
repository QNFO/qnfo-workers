// CHAOS-DRILL-BUDGET-PAUSE-1 offline suite for migrations/2026-10-26-chaos-drill-budget-pause.sql (agent_issues 1000119 and 1000120).
// The COST-SUSTAIN-1 daily research budget is spent, the executor logs "daily budget exhausted" on every 10-minute tick and starts no stage, and two drill probes read that refusal as a dead loop:
//   spof_alternate_probes "qnfo-research-exec single executor" clause 3 (work waits, no done event in 120 minutes) and control_alternate_probes research-revise-refs-extend clause 2 (no revise-patch
//   event in 120 minutes). The migration makes each clause fail only while NO pause is recorded (a research-budget event from job qnfo-research-exec, status ok, text starting "daily budget exhausted",
//   30 minutes old or younger). This suite proves, on node:sqlite over the live probe texts:
//   1. the live pre-state (968 and 593 bytes) reproduces the defect: with a recorded pause and work waiting both old probes FAIL with the texts the issues quote;
//   2. the stored probe after the migration equals the independently written new text, and passes in the same world while the pause is recorded (the fix);
//   3. the pause is a reason that expires and is checked: a pause 31 minutes old, a warn row, a text that does not start with the phrase, a row of another job, and no row at all each leave the clause
//      FAILING with the old observed text; 29 minutes passes; an empty queue passes both before and after;
//   4. nothing else moved: over a grid of worlds with no pause the new probe and the old probe read the same observed text, and with a pause the new probe differs from the old one only where the old
//      one read clause 3 (or clause 2), and the earlier clauses (watchdog forced stage, watchdog state, the ops_config value) still fail first with their own texts;
//   5. the failure mode and its detector (reads 2 before, 0 after, 1 when one probe is restored), the window notes (once), the backup table, one decision row, the filed issue with a valid code-task,
//      code-anchor (occurs exactly once in qnfo-cloud-ops/worker.js) and code-probe (not yet on main), a second apply changes nothing, and the Rollback line restores both probes byte for byte.
// Run: node --no-warnings migrations/chaos-drill-budget-pause.test.mjs   -> prints "N passed, 0 failed"
// Mutation checks: CDBP_MIGRATION points the suite at a mutated copy of the migration.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.CDBP_MIGRATION ? resolve(process.env.CDBP_MIGRATION) : here("2026-10-26-chaos-drill-budget-pause.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
const cloudSrc = readFileSync(here("../qnfo-cloud-ops/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const code = sql.replace(/^--.*$/gm, "");

// the real judge, sliced from the worker (the function the chaos drill uses)
const A = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), B = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
ok(A > 0 && B > A, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = fleetSrc.slice(A, B); block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});

// ---- the live pre-state: the two probe texts and window notes as read from qnfo-audit on 2026-10-26 ----
const SPOF = "qnfo-research-exec single executor", CTRL = "research-revise-refs-extend";
const S1 = "no research-watchdog stage was forced and answered in 1560 minutes, so the second trigger path of qnfo-research-exec has not run";
const S2 = "the research_exec_watchdog state was not written in 30 minutes, so the tick no longer evaluates the research queue";
const S3 = "research work waits and no stage finished in 120 minutes: the cron and the watchdog both failed to move it";
const C1 = "ops_config research_revise_refs_extend holds a value other than on or off, and only the exact value off switches the route off";
const C2 = "the revise route recorded no revise-patch event in 120 minutes, so the switch guards a route that is not running";
const OLD_SPOF = "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'research-watchdog' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1560 minutes')) THEN '" + S1 + "' WHEN COALESCE((SELECT updated_at FROM scheduler_state WHERE key = 'research_exec_watchdog'), '') < datetime('now', '-30 minutes') THEN '" + S2 + "' WHEN EXISTS (SELECT 1 FROM research_queue WHERE status IN ('queued', 'researching')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN '" + S3 + "' ELSE 'ok' END AS observed";
const OLD_CTRL = "SELECT 'ok' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'research_revise_refs_extend'), 'on') NOT IN ('on', 'off') THEN '" + C1 + "' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'revise-patch' AND status IN ('ok', 'warn') AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN '" + C2 + "' ELSE 'ok' END AS observed";
ok(Buffer.byteLength(OLD_SPOF) === 968 && Buffer.byteLength(OLD_CTRL) === 593, "the pre-state probe texts have the lengths of the live rows of 2026-10-26 (968 and 593 bytes)", [Buffer.byteLength(OLD_SPOF), Buffer.byteLength(OLD_CTRL)]);
const OLD_NOTE_SPOF = "1560 minutes for the forced proof stage (one a day plus the 120 minutes SLA-120M-1 allows), 30 minutes for the watchdog state (written on every 10-minute tick of qnfo-cloud-ops), and 120 minutes for a stalled queue; the proof stage is the exercise: the watchdog forces one stage a day through the RESEARCH_EXEC binding, so the alternate is run, and a busy answer (the single-flight lease held by the cron) counts as a run";
const OLD_NOTE_CTRL = "120 minutes: a state check on one ops_config key plus the revise route the switch guards, which logs revise-patch about 60 to 100 times an hour; the absent key reads as on";

// the new texts, written independently of the migration (the same fragment inserted before the THEN of the clause)
const PAUSE = " AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'research-budget' AND status = 'ok' AND instr(COALESCE(text, ''), 'daily budget exhausted') = 1 AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes'))";
const NEW_SPOF = OLD_SPOF.replace(" THEN '" + S3 + "'", PAUSE + " THEN '" + S3 + "'");
const NEW_CTRL = OLD_CTRL.replace(" THEN '" + C2 + "'", PAUSE + " THEN '" + C2 + "'");
ok(NEW_SPOF !== OLD_SPOF && NEW_CTRL !== OLD_CTRL && NEW_SPOF.length - OLD_SPOF.length === PAUSE.length && NEW_CTRL.length - OLD_CTRL.length === PAUSE.length, "the expected new texts differ from the old ones by the pause condition only");

const SCHEMA = `
CREATE TABLE spof_alternate_probes (component TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, exercise TEXT, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
`;
function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO spof_alternate_probes (component, probe_sql, window_note, enabled, created_at) VALUES (?, ?, ?, 1, '2026-10-20T06:27:49Z')").run(SPOF, OLD_SPOF, OLD_NOTE_SPOF);
  db.prepare("INSERT INTO spof_alternate_probes (component, probe_sql, window_note, enabled) VALUES ('Zenodo deposit', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'other row', 1)").run();
  db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, created_at) VALUES (?, ?, ?, 1, '2026-10-20T10:30:30Z')").run(CTRL, OLD_CTRL, OLD_NOTE_CTRL);
  db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES ('research-kimi-last-resort', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'other row', 1)").run();
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const spofSql = (db) => one(db, "SELECT probe_sql FROM spof_alternate_probes WHERE component = ?", SPOF).probe_sql;
const ctrlSql = (db) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", CTRL).probe_sql;
const RO = (db, probe) => { const before = one(db, "SELECT total_changes() AS n").n; const rows = db.prepare(probe).all(); const v = chaosJudge(rows); v.readOnly = one(db, "SELECT total_changes() AS n").n === before; v.cols = rows[0] ? Object.keys(rows[0]).join(",") : ""; v.rows = rows.length; return v; };

// a world: the facts the two probes read. minutes ago, null = none
let seq = 0;
function world(o = {}) {
  const w = Object.assign({ queue: 3, wdOk: 60, wdState: 5, done: null, pause: null, revise: null, reviseStatus: "ok", refs: undefined }, o);
  const db = build();
  const ev = (kind, job, status, text, ago) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status, text) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), ?, ?, ?, ?)").run("e" + (++seq), "-" + ago + " minutes", kind, job, status, text);
  for (let i = 0; i < w.queue; i++) db.prepare("INSERT INTO research_queue (id, status) VALUES (?, ?)").run("r" + i, i % 2 ? "researching" : "queued");
  db.prepare("INSERT INTO research_queue (id, status) VALUES ('rp', 'published')").run();
  if (w.wdOk != null) ev("research-watchdog", "research-exec-watchdog", "ok", "RESEARCH-WATCHDOG-1: forced", w.wdOk);
  if (w.wdState != null) db.prepare("INSERT INTO scheduler_state (key, value, updated_at) VALUES ('research_exec_watchdog', '{}', datetime('now', ?))").run("-" + w.wdState + " minutes");
  if (w.done != null) ev("done", "qnfo-research-exec", "ok", "stage done", w.done);
  if (w.revise != null) ev("revise-patch", "qnfo-research-exec", w.reviseStatus, "row=1 proposed=3 applied=3", w.revise);
  if (w.pause) { const p = Object.assign({ ago: 5, job: "qnfo-research-exec", status: "ok", text: "daily budget exhausted: spent=414726 budget=360000 (COST-SUSTAIN-1; work resumes at 00:00 UTC)" }, w.pause); ev("research-budget", p.job, p.status, p.text, p.ago); }
  if (w.refs !== undefined) db.prepare("INSERT INTO ops_config (key, value) VALUES ('research_revise_refs_extend', ?)").run(w.refs);
  return db;
}
const obsOf = (db, probe) => RO(db, probe).observed;

// ---- 1. the defect, reproduced on the live pre-state ----
const PAUSED = { queue: 192, done: 700, revise: 700, pause: { ago: 9 } };
{
  const v1 = RO(world(PAUSED), OLD_SPOF), v2 = RO(world(PAUSED), OLD_CTRL);
  ok(v1.pass === false && v1.observed === S3, "pre-state: the single-executor probe FAILS with the text of issue 1000119 while the budget pause is recorded and work waits", v1);
  ok(v2.pass === false && v2.observed === C2, "pre-state: the refs-extend probe FAILS with the text of issue 1000120 while the budget pause is recorded", v2);
  ok(RO(world({ queue: 192, done: 3, revise: 3 }), OLD_SPOF).pass === true && RO(world({ revise: 3 }), OLD_CTRL).pass === true, "pre-state: both old probes can pass in a running world");
}

// ---- 2. the migration ----
const db = build();
db.exec(sql);
ok(spofSql(db) === NEW_SPOF, "the stored single-executor probe equals the independently written new text", { len: spofSql(db).length, want: NEW_SPOF.length });
ok(ctrlSql(db) === NEW_CTRL, "the stored refs-extend probe equals the independently written new text", { len: ctrlSql(db).length, want: NEW_CTRL.length });
ok(one(db, "SELECT probe_sql FROM spof_alternate_probes WHERE component = 'Zenodo deposit'").probe_sql === "SELECT 'ok' AS expected, 'ok' AS observed" && one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = 'research-kimi-last-resort'").probe_sql === "SELECT 'ok' AS expected, 'ok' AS observed", "no other probe row changed");
ok(one(db, "SELECT enabled FROM spof_alternate_probes WHERE component = ?", SPOF).enabled === 1 && one(db, "SELECT enabled FROM control_alternate_probes WHERE control = ?", CTRL).enabled === 1, "both probes stay enabled");
{
  const v1 = RO(world(PAUSED), spofSql(db)), v2 = RO(world(PAUSED), ctrlSql(db));
  ok(v1.pass === true && v1.observed === "ok" && v1.readOnly && v1.rows === 1 && v1.cols === "expected,observed", "the single-executor probe PASSES in the paused world (read-only, one row, expected and observed)", v1);
  ok(v2.pass === true && v2.observed === "ok" && v2.readOnly && v2.rows === 1 && v2.cols === "expected,observed", "the refs-extend probe PASSES in the paused world", v2);
}

// ---- 3. the pause is a recorded, current, expiring, checked reason ----
const S = (o) => obsOf(world(o), spofSql(db)), Cc = (o) => obsOf(world(o), ctrlSql(db));
const stalled = { queue: 192, done: 700, revise: 700 };
ok(S(stalled) === S3 && Cc(stalled) === C2, "no pause on record: both clauses fail with the old text (a stalled executor is still caught)", [S(stalled), Cc(stalled)]);
for (const [name, p, expect] of [
  ["a pause 29 minutes old", { ago: 29 }, "ok"],
  ["a pause 31 minutes old", { ago: 31 }, "fail"],
  ["a pause 5 hours old", { ago: 300 }, "fail"],
  ["a pause event with status warn", { ago: 5, status: "warn" }, "fail"],
  ["a pause event with status error", { ago: 5, status: "error" }, "fail"],
  ["a research-budget event of another text (stages held)", { ago: 5, text: "stages held: spent=1 pace=1" }, "fail"],
  ["a text that mentions the phrase but does not start with it", { ago: 5, text: "note: daily budget exhausted earlier" }, "fail"],
  ["a pause event of another job", { ago: 5, job: "errata-hub" }, "fail"],
  ["a pause event with an empty text", { ago: 5, text: "" }, "fail"]
]) {
  const s = S({ ...stalled, pause: p }), c = Cc({ ...stalled, pause: p });
  ok(expect === "ok" ? s === "ok" && c === "ok" : s === S3 && c === C2, name + ": " + (expect === "ok" ? "both clauses pass" : "both clauses still fail with the old text"), [s, c]);
}
{ // a pause event of a different kind does not count
  const db2 = world(stalled);
  db2.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status, text) VALUES ('x1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes'), 'research-width', 'qnfo-research-exec', 'ok', 'daily budget exhausted')").run();
  ok(obsOf(db2, spofSql(db)) === S3 && obsOf(db2, ctrlSql(db)) === C2, "the phrase under another event kind is not a pause record");
}
ok(S({ ...stalled, queue: 0 }) === "ok" && Cc({ ...stalled, revise: 30 }) === "ok", "an empty queue (nothing waits) and a recent revise-patch event still pass without any pause");
ok(S({ queue: 192, done: 30 }) === "ok", "a stage that finished 30 minutes ago passes without a pause (the running case is unchanged)");

// the earlier clauses still fail first, pause or not
for (const pause of [null, { ago: 2 }]) {
  ok(S({ ...stalled, pause, wdOk: null }) === S1 && S({ ...stalled, pause, wdOk: 1600 }) === S1, "clause 1 still fails with its own text when no forced stage in 1560 minutes (pause " + (pause ? "recorded" : "absent") + ")");
  ok(S({ ...stalled, pause, wdState: 45 }) === S2 && S({ ...stalled, pause, wdState: null }) === S2, "clause 2 still fails with its own text when the watchdog state is stale or missing (pause " + (pause ? "recorded" : "absent") + ")");
  ok(Cc({ ...stalled, pause, refs: "banana" }) === C1 && Cc({ ...stalled, pause, refs: "" }) === C1 && Cc({ ...stalled, pause, refs: "ON" }) === C1, "refs-extend clause 1 still fails on a value other than on or off (pause " + (pause ? "recorded" : "absent") + ")");
  ok(Cc({ ...stalled, pause, refs: "off" }) === (pause ? "ok" : C2) && Cc({ ...stalled, pause, refs: "on" }) === (pause ? "ok" : C2), "an off or on switch value passes clause 1 and clause 2 decides (pause " + (pause ? "recorded" : "absent") + ")");
}

// ---- 4. differential grid: nothing but the pause exemption moved ----
{
  let worlds = 0, same = 0, differ = 0, bad = [];
  for (const queue of [0, 3]) for (const wdOk of [null, 60, 1600]) for (const wdState of [null, 5, 45]) for (const done of [null, 30, 200]) for (const pause of [null, { ago: 3 }, { ago: 45 }]) {
    const o = { queue, wdOk, wdState, done, pause };
    const before = obsOf(world(o), OLD_SPOF), after = obsOf(world(o), spofSql(db));
    worlds++;
    const expected = pause && pause.ago < 30 && before === S3 ? "ok" : before;
    if (after !== expected) bad.push({ o, before, after });
    if (after === before) same++; else differ++;
  }
  ok(bad.length === 0 && worlds === 162 && differ > 0 && same > differ, "single executor, 162 worlds: new = old except clause 3 under a current pause (" + differ + " differ, " + same + " identical)", bad.slice(0, 2));
  worlds = 0; same = 0; differ = 0; bad = [];
  for (const refs of [undefined, "on", "off", "banana"]) for (const revise of [null, 30, 200]) for (const reviseStatus of ["ok", "warn", "error"]) for (const pause of [null, { ago: 3 }, { ago: 45 }]) {
    const o = { revise, reviseStatus, refs, pause };
    const before = obsOf(world(o), OLD_CTRL), after = obsOf(world(o), ctrlSql(db));
    worlds++;
    const expected = pause && pause.ago < 30 && before === C2 ? "ok" : before;
    if (after !== expected) bad.push({ o, before, after });
    if (after === before) same++; else differ++;
  }
  ok(bad.length === 0 && worlds === 108 && differ > 0 && same > differ, "refs-extend, 108 worlds: new = old except clause 2 under a current pause (" + differ + " differ, " + same + " identical)", bad.slice(0, 2));
}

// ---- 5. the notes, the backup, the failure mode, the detector, the decision, the issue ----
const noteS = one(db, "SELECT window_note FROM spof_alternate_probes WHERE component = ?", SPOF).window_note, noteC = one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", CTRL).window_note;
ok(noteS.startsWith(OLD_NOTE_SPOF + " | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 3") && noteC.startsWith(OLD_NOTE_CTRL + " | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 2"), "each window note keeps its text and gains the pause note once");
ok(/30 minutes old or younger/.test(noteS) && /fails as before/.test(noteS) && /a stalled executor is not excused/.test(noteS) && /30 minutes old or younger/.test(noteC) && /fails as before/.test(noteC), "the notes say how long a pause counts and that no pause fails as before");
const bak = db.prepare("SELECT src, name, old_probe_sql, old_window_note FROM bak_20261026_chaos_probe_sql ORDER BY src").all();
ok(bak.length === 2 && bak.find((b) => b.name === SPOF).old_probe_sql === OLD_SPOF && bak.find((b) => b.name === CTRL).old_probe_sql === OLD_CTRL && bak.find((b) => b.name === SPOF).old_window_note === OLD_NOTE_SPOF && bak.find((b) => b.name === CTRL).old_window_note === OLD_NOTE_CTRL, "the backup table holds both old probe texts and window notes", bak.length);
const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'drill-probe-blames-budget-pause'");
ok(fm && fm.probe_class === "fm-drill-probe-blames-budget-pause" && fm.issue_id === 1000119 && [fm.failure_mode, fm.root_cause, fm.remediation, fm.detector, fm.trigger_condition, fm.symptom, fm.blast_radius].every((s) => s && s.length > 40), "the failure mode is complete and names issue 1000119", fm && fm.fm_key);
const rc = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-drill-probe-blames-budget-pause'");
ok(rc && rc.verify_transport === "d1-query" && rc.status === "active" && rc.module === "failure-mode" && rc.issue_id === null && !/\b(insert|update|delete|drop|create|alter|pragma|attach)\b/i.test(rc.verify_probe), "the detector contract is an active d1-query probe with no write keyword", rc && rc.verify_probe);
const det = (d) => d.prepare(rc.verify_probe).get();
ok(det(db).expected === "0" && det(db).observed === "0", "the detector reads 0 after the migration", det(db));
{
  const pre = build();
  ok(pre.prepare(rc.verify_probe).get().observed === "2", "the detector reads 2 on the pre-state (both probes read a stage event without the pause)");
  const half = build(); half.exec(sql);
  half.prepare("UPDATE spof_alternate_probes SET probe_sql = ? WHERE component = ?").run(OLD_SPOF, SPOF);
  ok(det(half).observed === "1", "the detector fails (1) when the single-executor probe is restored to the old text");
  half.prepare("UPDATE spof_alternate_probes SET enabled = 0 WHERE component = ?").run(SPOF);
  ok(det(half).observed === "0", "and ignores a disabled history row");
  const other = build(); other.exec(sql);
  other.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('new-route', ?, 'n')").run("SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'revise-patch' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN 'x' ELSE 'ok' END AS observed");
  ok(det(other).observed === "1", "a new drill probe that reads revise-patch in 120 minutes without the pause is caught");
  other.prepare("UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, '-120 minutes', '-48 hours') WHERE control = 'new-route'").run();
  ok(det(other).observed === "0", "a 48-hour probe of the same event is not flagged (it survives a daily pause)");
}
const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && instr(dl[0].action, "CHAOS-DRILL-BUDGET-PAUSE-1:") === 1, "one decision_log row by rem-a3-drills", dl.length);
function instr(s, t) { return s.indexOf(t) + 1; }
const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
ok(cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "the decision row fills all eleven columns and holds no ' within ' (a prediction form the scorecard parses)", cols.filter((c) => !dl[0][c]));
ok(/1000119 and 1000120/.test(dl[0].predicted_outcome) && /Rollback header/.test(dl[0].rollback_path), "the decision states its prediction and its revert path");
const iss = db.prepare("SELECT * FROM agent_issues WHERE title LIKE 'RESEARCH-WATCHDOG-PROOF-HELD-1:%'").all();
ok(iss.length === 1 && iss[0].status === "open" && iss[0].priority === "high" && iss[0].source === "session" && iss[0].category === "autonomy", "exactly one open high issue RESEARCH-WATCHDOG-PROOF-HELD-1 is filed by source session", iss.length);
{
  const lines = iss[0].description.split("\n");
  const task = lines.find((l) => l.startsWith("code-task: ")), anchor = lines.find((l) => l.startsWith("code-anchor: ")), probe = lines.find((l) => l.startsWith("code-probe: "));
  ok(task === "code-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js", "the issue carries the code-task line on a line of its own", task);
  const a = anchor && anchor.slice("code-anchor: ".length), p = probe && JSON.parse(probe.slice("code-probe: ".length));
  const p0 = p || {};
  const landed = (typeof p0.contains === "string" && cloudSrc.includes(p0.contains)) || cloudSrc.includes("RESEARCH-WATCHDOG-PROOF-HELD-1 (issue 1000470)");   // the fix landed in cloud-ops 1.40.1 (PR 4845) under this comment marker, not under the probe's guessed word
  ok(a && (landed || cloudSrc.split(a).length - 1 === 1), "the code-anchor occurs exactly once in qnfo-cloud-ops/worker.js (or the fix has landed)", a && cloudSrc.split(a).length - 1);
  ok(p && p.paths.length === 1 && p.paths[0] === "qnfo-cloud-ops/worker.js" && p.contains === "proof-held", "the code-probe names the file and the marker the fix must carry", p);
  ok(/researchWatchdogDecide/.test(iss[0].description) && /RESEARCH_WATCHDOG_PROOF_MIN/.test(iss[0].description) && /18:21Z on 2026-10-27/.test(iss[0].description) && /budgetHeld/.test(iss[0].description), "the issue names the exact change and the measured consequence");
}

// ---- 6. replay, rollback, hygiene ----
{
  const snap = (d) => JSON.stringify(["spof_alternate_probes", "control_alternate_probes", "failure_modes", "remediation_contracts", "decision_log", "agent_issues", "bak_20261026_chaos_probe_sql"].map((t) => d.prepare("SELECT * FROM " + t + " ORDER BY 1, 2").all()));
  const s1 = snap(db); let threw = null;
  try { db.exec(sql); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(db) === s1, "applying the migration a second time changes nothing", threw);
  const d2 = build();
  const orig = JSON.stringify([d2.prepare("SELECT * FROM spof_alternate_probes ORDER BY 1").all(), d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()]);
  d2.exec(sql); d2.exec("DROP TABLE bak_20261026_chaos_probe_sql"); d2.exec(rollback);
  const back = JSON.stringify([d2.prepare("SELECT * FROM spof_alternate_probes ORDER BY 1").all(), d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()]);
  ok(orig === back, "the Rollback line restores both probes and both window notes byte for byte, with the backup table gone");
  ok(one(d2, "SELECT COUNT(*) AS n FROM failure_modes").n === 0 && one(d2, "SELECT COUNT(*) AS n FROM remediation_contracts").n === 0, "and removes the failure mode and its detector");
  ok(one(d2, "SELECT COUNT(*) AS n FROM decision_log").n === 1 && one(d2, "SELECT COUNT(*) AS n FROM agent_issues").n === 1, "and leaves the decision row and the filed issue (append-only and a code-probe issue)");
  const d3 = build(); d3.prepare("UPDATE spof_alternate_probes SET probe_sql = replace(probe_sql, 'research work waits', 'research work is waiting') WHERE component = ?").run(SPOF);
  d3.exec(sql);
  ok(!spofSql(d3).includes("research-budget") && ctrlSql(d3) === NEW_CTRL, "a probe someone has since rewritten is left alone and not corrupted");
}
{
  const test = readFileSync(here("chaos-drill-budget-pause.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_chaos_probe_sql$/m.test(sql) && /\n-- Rollback: [^\n]+\n/.test(sql) && rollback.length > 400, "the opt-in headers, the backup header and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code) && !/\bCREATE\s+TRIGGER\b/i.test(code), "no DELETE or DROP in the body and no trigger");
  ok(/^CREATE TABLE IF NOT EXISTS bak_20261026_chaos_probe_sql AS\s+SELECT/.test(code.trim()), "the backup is the first statement, created AS SELECT from the rows it protects");
  ok(!/claude\.ai|anthropic\.com/i.test(sql + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sql + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), "no vendor link, no secret value, no e-mail address");
  const probes = [NEW_SPOF, NEW_CTRL, rc.verify_probe];
  ok(probes.every((p) => !/\b(update|delete|insert) /i.test(p)), "no stored probe text holds the words update, delete or insert followed by a space (the runners' write-keyword guard scans literals)");
  const bad = [...code.matchAll(/;\s*\n/g)].length;
  ok(bad === 9, "nine statements end a line with a semicolon (the runner counts nine), none is hidden in a literal", bad);
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
