// CONTROL-ALT-PROBES-4C offline suite for migrations/2026-10-26-control-alternate-probes4c.sql (agent_issues 1000214). Clause 3 of the probe of breach-doctor-own-issue-guard failed for an open
// BREACH-DOCTOR-1: issue older than 24 hours with no breach_diagnoses row, but the doctor classifies only the issues with no doer (qnfo-fleet-control bdLoadState: a code-task line, a live code
// task or a live work claim marks an issue owned and leaves it out of the cases), so six owned doctor issues would turn a healthy guard red at 24 hours. The file reads the doctor own rule.
// The suite applies migrations/2026-10-26-control-alternate-probes4.sql first (the merged state) and then the file, on node:sqlite:
//   1. an owned 25-hour-old doctor issue with no case FAILS before the file (the false alarm reproduced) and reads ok after; the code-task line, a live work claim and a live code task each exempt it;
//   2. an unowned doctor issue older than 24 hours with no case still FAILS with the new reason; a released or expired claim, a failed or closed task and a task of another issue do not exempt it;
//   3. clauses 1 and 2 still fail on their own, and over a grid of worlds the new probe reads what the old probe read except for an owned issue;
//   4. the window note gains the note once, the backup table holds the old text, one decision row, a second apply changes nothing, the Rollback restores the probe byte for byte.
// Run: node --no-warnings migrations/control-alternate-probes4c.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sqlC = readFileSync(process.env.CAP4C_MIGRATION ? resolve(process.env.CAP4C_MIGRATION) : here("2026-10-26-control-alternate-probes4c.sql"), "utf8");
const sql4 = readFileSync(here("2026-10-26-control-alternate-probes4.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sqlC)[1];
const code = sqlC.replace(/^--.*$/gm, "");
const A = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), B = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
let block = fleetSrc.slice(A, B); block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});
// the claim the migration makes about the doctor is true of the code on main: the three doer kinds of bdLoadState
ok(/instr\(COALESCE\(description, ''\), 'code-task:'\) > 0/.test(fleetSrc.slice(fleetSrc.indexOf("async function bdLoadState"), fleetSrc.indexOf("async function bdWriteMetrics"))) && /live code task/.test(fleetSrc.slice(fleetSrc.indexOf("async function bdLoadState"), fleetSrc.indexOf("async function bdWriteMetrics"))) && /live work claim/.test(fleetSrc.slice(fleetSrc.indexOf("async function bdLoadState"), fleetSrc.indexOf("async function bdWriteMetrics"))), "qnfo-fleet-control bdLoadState marks an issue owned by a code-task line, a live code task and a live work claim (the rule the probe now reads)");
const C = "breach-doctor-own-issue-guard";
const NOW = Date.now();
const msAgo = (m) => NOW - m * 6e4;
const iso = (m) => new Date(NOW - m * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const SCHEMA = `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL DEFAULT 'l', kind TEXT NOT NULL DEFAULT 'gate', guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL DEFAULT 'keep', disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL DEFAULT 'e', issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE breach_playbooks (rule_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'measure');
CREATE TABLE breach_diagnoses (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, rule_id TEXT NOT NULL DEFAULT 'R', state TEXT NOT NULL DEFAULT 'diagnosed', mode TEXT NOT NULL DEFAULT 'on');
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, path TEXT, released_at TEXT, expires_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`;
function build(applyC = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.exec("INSERT INTO breach_playbooks (rule_id, enabled, mode) VALUES ('TL-R07-secret', 1, 'measure')");
  for (const n of ["research-repo-archive-gate", "research-repo-sync-switches", "breach-doctor-caps", "breach-doctor-taint-guard", "breach-doctor-action-allowlist", "breach-doctor-gap-measure", "breach-doctor-gap-caps", "breach-doctor-own-issue-guard", "breach-doctor-strike-cap", "email-filter-journal-pitch-senders", "dash-owner-decision-session-gate", "breach-doctor-auto-demotion", "breach-doctor-age-gate", "breach-doctor-tool-exclusion-rule", "breach-doctor-secret-change-measure", "breach-doctor-rearm-capacity", "metric-playbook-recovery-hold", "pn-r2-filer-quiet-gate"]) db.prepare("INSERT INTO control_registry (control, alternate_path, evidence) VALUES (?, 'a path', 'registered')").run(n);
  db.exec(sql4);
  if (applyC) db.exec(sqlC);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const probeOf = (db) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", C).probe_sql;
const obs = (db, probe) => { const before = one(db, "SELECT total_changes() AS n").n; const v = chaosJudge(db.prepare(probe || probeOf(db)).all()); v.readOnly = one(db, "SELECT total_changes() AS n").n === before; return v; };
const REASON_OLD = "an open doctor issue older than 24 hours has no breach_diagnoses row, so it is not classified or counted";
const REASON_NEW = "an open doctor issue with no doer is older than 24 hours and has no breach_diagnoses row, so it is not classified or counted";
const T = "BREACH-DOCTOR-1: TD-D1Q-REJECT qnfo-ops";
const doc = (db, o = {}) => db.prepare("INSERT INTO agent_issues (title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(o.title || T, o.desc === undefined ? "plain text, no doer line" : o.desc, o.status || "open", msAgo(o.age === undefined ? 25 * 60 : o.age), msAgo(o.age === undefined ? 25 * 60 : o.age)).lastInsertRowid;
const claim = (db, id, o = {}) => db.prepare("INSERT INTO work_claims (issue_id, path, released_at, expires_at) VALUES (?, ?, ?, ?)").run(o.byPath ? null : id, o.byPath ? "issue:" + id : null, o.released ? iso(5) : null, o.expired ? iso(5) : iso(-60));
const task = (db, id, status, goal) => db.prepare("INSERT INTO code_tasks (id, goal, status) VALUES (?, ?, ?)").run("ct" + Math.random(), goal === undefined ? "[issue #" + id + "] fix it" : goal, status);

// ---- 1. the false alarm reproduced on the merged state, then fixed ----
{
  const pre = build(false), post = build(true);
  const OLD = probeOf(pre);
  for (const d of [pre, post]) doc(d, { desc: "AUTO-FILED\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js\ncode-anchor: x" });
  const v0 = obs(pre), v1 = obs(post);
  ok(v0.pass === false && v0.observed === REASON_OLD, "before the file: an owned doctor issue (code-task line) 25 hours old with no case FAILS the probe on a healthy guard (the false alarm)", v0);
  ok(v1.pass === true && v1.observed === "ok" && v1.readOnly, "after the file: the same world reads ok, read-only", v1);
  ok(probeOf(post) !== OLD && probeOf(post).includes("work_claims") && probeOf(post).includes("code_tasks"), "the stored probe now reads the three doer kinds");
}

// ---- 2. the clause still fails where it should and is exempted where the doctor leaves the issue alone ----
const CASES = [
  ["an unowned doctor issue 25 hours old with no case", (d) => { doc(d); }, false],
  ["an unowned doctor issue 23 hours old with no case", (d) => { doc(d, { age: 23 * 60 }); }, true],
  ["an unowned doctor issue 25 hours old with a case", (d) => { const id = doc(d); d.prepare("INSERT INTO breach_diagnoses (issue_id) VALUES (?)").run(id); }, true],
  ["a closed unowned doctor issue 25 hours old", (d) => { doc(d, { status: "closed" }); }, true],
  ["an unowned issue that is not a doctor issue", (d) => { doc(d, { title: "OTHER-1: something" }); }, true],
  ["a code-task line in the description", (d) => { doc(d, { desc: "x\ncode-task: repo=qnfo-workers path=a/worker.js" }); }, true],
  ["a live work claim by issue id", (d) => { claim(d, doc(d)); }, true],
  ["a live work claim by path", (d) => { claim(d, doc(d), { byPath: true }); }, true],
  ["a released work claim", (d) => { claim(d, doc(d), { released: true }); }, false],
  ["an expired work claim", (d) => { claim(d, doc(d), { expired: true }); }, false],
  ["a live code task naming the issue", (d) => { const id = doc(d); task(d, id, "running"); }, true],
  ["a queued code task naming the issue", (d) => { const id = doc(d); task(d, id, "queued"); }, true],
  ["a failed code task naming the issue", (d) => { const id = doc(d); task(d, id, "failed"); }, false],
  ["a needs_human code task naming the issue", (d) => { const id = doc(d); task(d, id, "needs_human"); }, false],
  ["a closed code task naming the issue", (d) => { const id = doc(d); task(d, id, "closed"); }, false],
  ["a live code task for another issue number that starts with the same digits", (d) => { const id = doc(d); task(d, id, "running", "[issue #" + id + "0] other"); }, false],
  ["a live code task for another issue", (d) => { doc(d); task(d, 999999, "running"); }, false]
];
for (const [name, mk, expectOk] of CASES) {
  const db = build(); mk(db);
  const v = obs(db);
  ok(expectOk ? v.pass === true && v.observed === "ok" : v.pass === false && v.observed === REASON_NEW, name + ": " + (expectOk ? "reads ok" : "fails with the new reason"), v);
}
{ // clauses 1 and 2 are untouched
  let db = build(); const id = doc(db, { age: 30 }); db.prepare("INSERT INTO breach_diagnoses (issue_id, state) VALUES (?, 'applied')").run(id);
  ok(/acted on an issue the doctor filed itself/.test(obs(db).observed), "clause 1 still fails when a playbook acted on a doctor issue");
  db = build(); doc(db, { title: "BREACH-DOCTOR-1: playbook gap BREACH-DOCTOR-1", status: "closed", age: 600 });
  ok(/gap issue was filed about the doctor own family/.test(obs(db).observed), "clause 2 still fails when a gap issue was filed about the doctor own family");
}

// ---- 3. differential over a grid: new = old except for an owned doctor issue ----
{
  let worlds = 0, differ = 0, bad = [];
  for (const age of [null, 60, 23 * 60, 25 * 60]) for (const status of ["open", "closed"]) for (const owner of ["none", "code-task", "claim", "task", "failed-task"]) for (const diag of [false, true]) {
    const mk = (applyC) => {
      const d = build(applyC);
      if (age !== null) { const id = doc(d, { age, status, desc: owner === "code-task" ? "x\ncode-task: repo=qnfo-workers path=a/worker.js" : "plain" }); if (diag) d.prepare("INSERT INTO breach_diagnoses (issue_id) VALUES (?)").run(id); if (owner === "claim") claim(d, id); if (owner === "task") task(d, id, "running"); if (owner === "failed-task") task(d, id, "failed"); }
      return d;
    };
    const before = obs(mk(false)).observed, after = obs(mk(true)).observed;
    worlds++;
    const owned = age !== null && owner !== "none" && owner !== "failed-task";
    const expected = before === REASON_OLD ? (owned ? "ok" : REASON_NEW) : before;
    if (after !== expected) bad.push({ age, status, owner, diag, before, after });
    if (after !== before) differ++;
  }
  ok(bad.length === 0 && worlds === 80 && differ > 0, "80 worlds: new = old except for an owned issue and the reason text (" + differ + " differ)", bad.slice(0, 2));
}

// ---- 4. window note, backup, decision, replay, rollback, hygiene ----
{
  const db = build();
  const note = one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", C).window_note;
  ok((note.match(/CONTROL-ALT-PROBES-4C/g) || []).length === 1 && /no code-task line, no live work claim, no live code task/.test(note) && /1000427 to 1000433/.test(note), "the window note gains the note once");
  const bak = db.prepare("SELECT * FROM bak_20261026_control_probes4c").all();
  ok(bak.length === 1 && bak[0].control === C && bak[0].old_probe_sql.includes(REASON_OLD) && !bak[0].old_probe_sql.includes("work_claims") && !bak[0].old_window_note.includes("CONTROL-ALT-PROBES-4C"), "the backup table holds the old probe and window note", bak.length);
  ok(db.prepare("SELECT control FROM control_alternate_probes WHERE control <> ? AND instr(window_note, 'CONTROL-ALT-PROBES-4C') > 0").all(C).length === 0 && one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 18, "no other probe row is touched");
  const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'CONTROL-ALT-PROBES-4C:') = 1").all();
  const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
  ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "one decision row fills all eleven columns and holds no ' within '", dl.length);
  const snap = (d) => JSON.stringify(["control_alternate_probes", "decision_log", "bak_20261026_control_probes4c"].map((t) => d.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));
  const s1 = snap(db); let threw = null;
  try { db.exec(sqlC); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(db) === s1, "applying the file a second time changes nothing", threw);
  const d2 = build(false); const orig = JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all());
  d2.exec(sqlC); d2.exec("DROP TABLE bak_20261026_control_probes4c"); d2.exec(rollback);
  ok(JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()) === orig, "the Rollback line restores the probe and the note byte for byte, with the backup table gone");
  const d3 = build(false); d3.prepare("UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, 'not classified or counted', 'not classified') WHERE control = ?").run(C); d3.exec(sqlC);
  ok(!probeOf(d3).includes("work_claims"), "a probe someone has since rewritten is left alone");
}
{
  const test = readFileSync(here("control-alternate-probes4c.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sqlC) && /^-- DB: qnfo-audit$/m.test(sqlC) && /^-- BACKUP: bak_20261026_control_probes4c$/m.test(sqlC) && /\n-- Rollback: [^\n]+\n/.test(sqlC), "the opt-in headers, the backup header and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code) && /^CREATE TABLE IF NOT EXISTS bak_20261026_control_probes4c AS\s+SELECT/.test(code.trim()), "no DELETE or DROP in the body and the backup is the first statement, created AS SELECT");
  ok((code.match(/;\s*\n/g) || []).length === 4, "four statements end a line with a semicolon (the runner counts four)", (code.match(/;\s*\n/g) || []).length);
  const WRITE = /\b(insert|update|delete|drop|alter|create|replace|attach|pragma|vacuum|reindex)\b/i;
  const stored = probeOf(build());
  ok(!WRITE.test(stored) && !stored.includes(";"), "the stored probe is still a single read-only SELECT with no write word");
  ok(!/claude\.ai|anthropic\.com/i.test(sqlC + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sqlC + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sqlC + test), "no vendor link, no secret value, no e-mail address");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
