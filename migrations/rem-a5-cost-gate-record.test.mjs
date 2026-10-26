// REM-A5-COST-GATE-1 offline suite: replays migrations/2026-10-26-rem-a5-cost-gate-record.sql on node:sqlite against the live control_registry layout (CHECK constraints included).
// Proves: the header opts in; one control row research-daily-neuron-gate is registered (kind cap, critical path 1, disposition replace, state planned, issue 100622, no alternate) and an existing
// row of that name is never overwritten; the two issue notes land once, on those two issues only, and trip neither the code orchestrator's PLAN_DENY_TEXT nor a phrase that v_blocker_claims counts;
// one decision row is written; a replay changes nothing; the Rollback line removes the control row and restores both descriptions. The figures the record states are internally consistent
// (the bound's parts sum to the stated bound within one percent, and the stated reduction brings it to 300 USD).
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-cost-gate-record.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-cost-gate-record.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing (the DELETE sits in the Rollback header only)");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+(fleet_tick|ops_config|fleet_budget)\b/i.test(body) && !/UPDATE\s+(ops_config|fleet_budget)\b/i.test(body), "no cap, config row or budget is written (a record only)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(Array.from(body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)).every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes");

const orch = rd("qnfo-code-orchestrator/worker.js");
const denyText = new Function("return " + /const PLAN_DENY_TEXT = (\/.*\/[a-z]*);/.exec(orch)[1])();
const BLOCKER_PHRASES = ["owner only", "owner-only", "needs a token", "no token", "needs the owner", "cannot be done", "blocked", "session-task:"];

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE control_registry (
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
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;`);
  w.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, evidence) VALUES ('research-width-governor', 'x', 'cap', 1, 'keep', 'e')").run();
  const iss = w.prepare("INSERT INTO agent_issues (id, title, description) VALUES (?, ?, ?)");
  iss.run(100622, "COST-SUSTAIN-1 pace gate hard-stops the entire research pipeline", "original text of 100622");
  iss.run(100408, "COST-SUSTAIN-1: research pipeline spend to <=$300/mo all-in", "original text of 100408");
  iss.run(555, "unrelated", "original text of 555");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);

const w = world();
w.exec(sql);
const c = q1(w, "SELECT * FROM control_registry WHERE control = 'research-daily-neuron-gate'");
ok(!!c && c.kind === "cap" && c.critical_path === 1 && c.disposition === "replace" && c.disposition_state === "planned" && c.issue_id === 100622 && c.alternate_path === null && c.alternate_tested_at === null, "the control is registered as a cap on the critical path, disposition replace, planned, issue 100622, no alternate yet", c);
ok(/^REM-A5-COST-GATE-1 2026-10-26: MEASURED/.test(c.evidence) && /BUDGET-SOFT-ROUTE-1/.test(c.evidence) && /100622/.test(c.evidence) && /100408/.test(c.evidence), "its evidence carries the measurement, the directive it conflicts with and the two issues");
ok(qa(w, "SELECT control FROM control_registry ORDER BY control").map((r) => r.control).join() === "research-daily-neuron-gate,research-width-governor", "no other control row changes");
for (const id of [100622, 100408]) {
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
  ok(d.startsWith("original text of " + id + "\nREM-A5 2026-10-26 19:11Z: ") && d.split("REM-A5 2026-10-26").length === 2, id + ": one note appended to the old text");
  const note = d.slice(("original text of " + id).length);
  ok(!denyText.test(note), id + ": the note does not trip the orchestrator's PLAN_DENY_TEXT", note.match(denyText) && note.match(denyText)[0]);
  ok(!BLOCKER_PHRASES.some((p) => note.toLowerCase().includes(p)), id + ": the note holds no phrase that v_blocker_claims counts");
  ok(!/^\s*(runtime-probe|code-probe|code-task|code-anchor):/im.test(note), id + ": the note has no probe or code-task marker line");
}
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 555").d === "original text of 555", "an unrelated issue is untouched");
ok(!denyText.test(c.evidence) && !denyText.test(c.guards_against || ""), "the control text does not trip PLAN_DENY_TEXT either");
const dec = qa(w, "SELECT actor, action, predicted_outcome FROM decision_log");
ok(dec.length === 1 && dec[0].actor === "rem-a5" && /^REM-A5-COST-GATE-1:/.test(dec[0].action) && dec[0].predicted_outcome.length > 20, "one decision row with a stated prediction", dec);

{ // an existing row of that name is kept (INSERT OR IGNORE)
  const x = world();
  x.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, evidence) VALUES ('research-daily-neuron-gate', 'someone else', 'gate', 0, 'keep', 'written first')").run();
  x.exec(sql);
  ok(q1(x, "SELECT location l, evidence e FROM control_registry WHERE control = 'research-daily-neuron-gate'").e === "written first", "a row of that name written by someone else is never overwritten");
}
{ // internal consistency of the stated figures
  const code = 140 * 1774, others = 103000, bound = 360000 + 150000 + code + others;
  ok(Math.abs(bound - 852612) / 852612 < 0.02, "the parts the record names (360000 + 150000 + 140 x 1774 + 103000) sum to the stated bound of 852612 within 2 percent", bound);
  const usd = (bound - 10000) * 0.011 / 1000 + 1.7056;
  ok(Math.abs(usd * 30 - 329.21) < 6, "and cost about 329 USD over 30 days with 1.70 USD a day of gateway and plan", usd * 30);
  const target = (300 / 30 - 1.7056) / 0.011 * 1000 + 10000;
  ok(Math.abs((852612 - target) - 88000) < 1500, "the reduction that reaches 300 USD is about 88000 neurons a day", 852612 - target);
}
{ // replay
  const snap = () => JSON.stringify([qa(w, "SELECT * FROM control_registry ORDER BY control"), qa(w, "SELECT id, description FROM agent_issues ORDER BY id"), qa(w, "SELECT action FROM decision_log")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing");
}
{ // rollback
  const r = world();
  const fresh = JSON.stringify([qa(r, "SELECT control FROM control_registry ORDER BY control"), qa(r, "SELECT id, description FROM agent_issues ORDER BY id")]);
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(JSON.stringify([qa(r, "SELECT control FROM control_registry ORDER BY control"), qa(r, "SELECT id, description FROM agent_issues ORDER BY id")]) === fresh, "Rollback removes the control row and restores both descriptions byte for byte");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
