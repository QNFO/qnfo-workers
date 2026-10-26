// CONTROL-ALT-PROBES-4B offline suite for migrations/2026-10-26-control-alternate-probes4b.sql (agent_issues 1000214). Clause 3 of the probe of breach-doctor-secret-change-measure
// (an open SECRET-CHANGE-OBSERVED issue with no live contract) would flap in the minutes after such an issue is filed, because its birth contract reads needs-machine-probe until the filing
// loop gives it its probe. The file gives an issue 120 minutes. The suite applies migrations/2026-10-26-control-alternate-probes4.sql first (the merged state), then the file, on node:sqlite:
//   1. before the file a 30-minute-old issue with a birth contract FAILS the probe (the flap reproduced), after it the probe reads ok;
//   2. an issue older than 120 minutes with no live contract still FAILS with the reason text (now naming 120 minutes), a monitoring or active contract passes, a closed issue passes;
//   3. every other clause of the probe still fails on its own, and over a grid of worlds the new probe reads what the old probe read except for an open issue younger than 120 minutes;
//   4. the window note gains the note once, the backup table holds the old text, one decision row, a second apply changes nothing, the Rollback restores the probe byte for byte.
// Run: node --no-warnings migrations/control-alternate-probes4b.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sqlB = readFileSync(process.env.CAP4B_MIGRATION ? resolve(process.env.CAP4B_MIGRATION) : here("2026-10-26-control-alternate-probes4b.sql"), "utf8");
const sql4 = readFileSync(here("2026-10-26-control-alternate-probes4.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sqlB)[1];
const code = sqlB.replace(/^--.*$/gm, "");
const A = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), B = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
let block = fleetSrc.slice(A, B); block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});
const C = "breach-doctor-secret-change-measure";
const NOW = Date.now();
const msAgo = (m) => NOW - m * 6e4;
const SCHEMA = `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL DEFAULT 'l', kind TEXT NOT NULL DEFAULT 'gate', guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL DEFAULT 'keep', disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL DEFAULT 'e', issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE breach_playbooks (rule_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'measure');
CREATE TABLE breach_diagnoses (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, rule_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'diagnosed', mode TEXT NOT NULL DEFAULT 'on');
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`;
function build(applyB = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.exec("INSERT INTO breach_playbooks (rule_id, enabled, mode) VALUES ('TL-R07-secret', 1, 'measure')");
  for (const n of ["research-repo-archive-gate", "research-repo-sync-switches", "breach-doctor-caps", "breach-doctor-taint-guard", "breach-doctor-action-allowlist", "breach-doctor-gap-measure", "breach-doctor-gap-caps", "breach-doctor-own-issue-guard", "breach-doctor-strike-cap", "email-filter-journal-pitch-senders", "dash-owner-decision-session-gate", "breach-doctor-auto-demotion", "breach-doctor-age-gate", "breach-doctor-tool-exclusion-rule", "breach-doctor-secret-change-measure", "breach-doctor-rearm-capacity", "metric-playbook-recovery-hold", "pn-r2-filer-quiet-gate"]) db.prepare("INSERT INTO control_registry (control, alternate_path, evidence) VALUES (?, 'a path', 'registered')").run(n);
  db.exec(sql4);
  if (applyB) db.exec(sqlB);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const probeOf = (db) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", C).probe_sql;
const obs = (db, probe) => { const before = one(db, "SELECT total_changes() AS n").n; const v = chaosJudge(db.prepare(probe || probeOf(db)).all()); v.readOnly = one(db, "SELECT total_changes() AS n").n === before; return v; };
let seq = 0;
const issue = (db, title, status, ageMin, contract) => {
  const id = db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)").run(title, status, msAgo(ageMin), msAgo(ageMin)).lastInsertRowid;
  if (contract) db.prepare("INSERT INTO remediation_contracts (class, issue_id, status) VALUES (?, ?, ?)").run("issue-" + id + "-" + (++seq), id, contract);
  return id;
};
const T = "SECRET-CHANGE-OBSERVED: some-worker 2026-10-26";
const REASON_OLD = "an open SECRET-CHANGE-OBSERVED issue has no live contract, so the rule in measure leaves it with no closer";
const REASON_NEW = "an open SECRET-CHANGE-OBSERVED issue older than 120 minutes has no live contract, so the rule in measure leaves it with no closer";

// ---- 1. the flap reproduced on the merged state, then fixed ----
{
  const pre = build(false), post = build(true);
  const OLD = probeOf(pre);
  issue(pre, T, "open", 30, "needs-machine-probe"); issue(post, T, "open", 30, "needs-machine-probe");
  const v0 = obs(pre), v1 = obs(post);
  ok(v0.pass === false && v0.observed === REASON_OLD, "before the file: a SECRET-CHANGE-OBSERVED issue 30 minutes old with its birth contract FAILS the probe (the flap)", v0);
  ok(v1.pass === true && v1.observed === "ok" && v1.readOnly, "after the file: the same world reads ok, read-only", v1);
  const same = build(true); issue(same, T, "open", 121, "needs-machine-probe");
  ok(obs(same).observed === REASON_NEW && obs(same).pass === false, "an issue 121 minutes old whose contract is still needs-machine-probe FAILS with the reason that names 120 minutes", obs(same));
  ok(probeOf(post) !== OLD && probeOf(post).length - OLD.length === " AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000".length + " older than 120 minutes".length, "the new probe differs from the old one by the age condition and the words in the reason only");
}

// ---- 2. the clause still fails where it should, passes where it should ----
const CASES = [
  ["an issue 121 minutes old with no contract at all", (d) => issue(d, T, "open", 121, null), false],
  ["an issue 119 minutes old with no contract at all", (d) => issue(d, T, "open", 119, null), true],
  ["an old issue with a retired contract", (d) => issue(d, T, "open", 600, "retired"), false],
  ["an old issue with a superseded contract", (d) => issue(d, T, "open", 600, "superseded"), false],
  ["an old issue with a monitoring contract", (d) => issue(d, T, "open", 600, "monitoring"), true],
  ["an old issue with an active contract", (d) => issue(d, T, "open", 600, "active"), true],
  ["an old issue with a holding contract", (d) => issue(d, T, "open", 600, "holding"), true],
  ["an old closed issue with no contract", (d) => issue(d, T, "closed", 600, null), true],
  ["an old issue of another title with no contract", (d) => issue(d, "OTHER-1: x", "open", 600, null), true],
  ["no SECRET-CHANGE-OBSERVED issue at all", () => {}, true]
];
for (const [name, mk, expectOk] of CASES) {
  const db = build(); mk(db);
  const v = obs(db);
  ok(expectOk ? v.pass === true && v.observed === "ok" : v.pass === false && v.observed === REASON_NEW, name + ": " + (expectOk ? "reads ok" : "fails with the new reason"), v);
}
{ // the other clauses still fail on their own
  let db = build(); db.exec("UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'TL-R07-secret'");
  ok(/no longer in measure/.test(obs(db).observed), "clause 1 still fails when the rule is no longer in measure");
  db = build(); db.exec("INSERT INTO breach_diagnoses (issue_id, rule_id, state, mode) VALUES (1, 'TL-R07-secret', 'verified', 'measure')");
  ok(/acted/.test(obs(db).observed), "clause 2 still fails when a TL-R07-secret case acted");
}

// ---- 3. differential: the new probe reads what the old one read, except for an open issue younger than 120 minutes ----
{
  let worlds = 0, differ = 0, bad = [];
  for (const age of [null, 10, 119, 121, 900]) for (const status of ["open", "closed"]) for (const contract of [null, "needs-machine-probe", "monitoring", "retired"]) for (const mode of ["measure", "on"]) {
    const mk = (applyB) => { const d = build(applyB); d.exec("UPDATE breach_playbooks SET mode = '" + mode + "' WHERE rule_id = 'TL-R07-secret'"); if (age !== null) issue(d, T, status, age, contract); return d; };
    const before = obs(mk(false)).observed, after = obs(mk(true)).observed;
    worlds++;
    const young = age !== null && status === "open" && age < 120;
    const expected = young && before === REASON_OLD ? "ok" : before === REASON_OLD ? REASON_NEW : before;
    if (after !== expected) bad.push({ age, status, contract, mode, before, after });
    if (after !== before) differ++;
  }
  ok(bad.length === 0 && worlds === 80 && differ > 0, "80 worlds: new = old except the young-issue grace and the reason text (" + differ + " differ)", bad.slice(0, 2));
}

// ---- 4. window note, backup, decision, replay, rollback, hygiene ----
{
  const db = build();
  const note = one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", C).window_note;
  ok((note.match(/CONTROL-ALT-PROBES-4B/g) || []).length === 1 && /120 minutes to carry its contract/.test(note) && /needs-machine-probe/.test(note), "the window note gains the grace note once");
  const bak = db.prepare("SELECT * FROM bak_20261026_control_probes4b").all();
  ok(bak.length === 1 && bak[0].control === C && bak[0].old_probe_sql.includes(REASON_OLD) && !bak[0].old_probe_sql.includes("7200") && !bak[0].old_window_note.includes("CONTROL-ALT-PROBES-4B"), "the backup table holds the old probe and window note", bak.length);
  const other = db.prepare("SELECT control FROM control_alternate_probes WHERE control <> ? AND instr(window_note, 'CONTROL-ALT-PROBES-4B') > 0").all(C);
  ok(other.length === 0 && one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 18, "no other probe row is touched", other.length);
  const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'CONTROL-ALT-PROBES-4B:') = 1").all();
  const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
  ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "one decision row fills all eleven columns and holds no ' within '", dl.length);
  const snap = (d) => JSON.stringify(["control_alternate_probes", "decision_log", "bak_20261026_control_probes4b"].map((t) => d.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));
  const s1 = snap(db); let threw = null;
  try { db.exec(sqlB); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(db) === s1, "applying the file a second time changes nothing", threw);
  const d2 = build(false); const orig = JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all());
  d2.exec(sqlB); d2.exec("DROP TABLE bak_20261026_control_probes4b"); d2.exec(rollback);
  ok(JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()) === orig, "the Rollback line restores the probe and the note byte for byte, with the backup table gone");
  const d3 = build(false); d3.prepare("UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, 'no live contract', 'no contract') WHERE control = ?").run(C); d3.exec(sqlB);
  ok(!probeOf(d3).includes("7200"), "a probe someone has since rewritten is left alone");
}
{
  const test = readFileSync(here("control-alternate-probes4b.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sqlB) && /^-- DB: qnfo-audit$/m.test(sqlB) && /^-- BACKUP: bak_20261026_control_probes4b$/m.test(sqlB) && /\n-- Rollback: [^\n]+\n/.test(sqlB), "the opt-in headers, the backup header and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code) && /^CREATE TABLE IF NOT EXISTS bak_20261026_control_probes4b AS\s+SELECT/.test(code.trim()), "no DELETE or DROP in the body and the backup is the first statement, created AS SELECT");
  ok((code.match(/;\s*\n/g) || []).length === 4, "four statements end a line with a semicolon (the runner counts four)", (code.match(/;\s*\n/g) || []).length);
  const WRITE = /\b(insert|update|delete|drop|alter|create|replace|attach|pragma|vacuum|reindex)\b/i;
  const stored = one(build(), "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", C).probe_sql;
  ok(!WRITE.test(stored) && !stored.includes(";"), "the stored probe is still a single read-only SELECT with no write word");
  ok(!/claude\.ai|anthropic\.com/i.test(sqlB + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sqlB + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sqlB + test), "no vendor link, no secret value, no e-mail address");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
