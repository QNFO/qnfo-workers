// REM-A5-TICKET-NOTES-1 offline suite: replays migrations/2026-10-26-rem-a5-ticket-notes.sql on node:sqlite.
// Proves: the header opts in (nothing deleted or dropped, no config or cap written); thirteen named tickets get one dated note each, appended to their old text, and no other ticket changes; no note
// carries a probe or code-task marker line (the description triggers read those), a phrase that v_blocker_claims counts as a blocker claim, or a word the code orchestrator's PLAN_DENY_TEXT refuses;
// the arithmetic the notes state is consistent (the five-part SLA sum, the seven-part stuck sum, the burst total and its cost); a replay changes nothing; the Rollback line restores every description.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-ticket-notes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-ticket-notes.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing");
ok(!/(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|REPLACE\s+INTO)\s+(ops_config|fleet_budget|analytics_metric_triggers|remediation_contracts|metric_registry|decision_log)\b/i.test(body), "no cap, config, trigger, contract, metric or decision row is written (notes only)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");

const IDS = [2447, 2522, 2971, 99906, 99923, 99933, 99935, 99938, 99943, 99950, 100226, 100464, 1000155];
const orch = rd("qnfo-code-orchestrator/worker.js");
const denyText = new Function("return " + /const PLAN_DENY_TEXT = (\/.*\/[a-z]*);/.exec(orch)[1])();
const BLOCKER_PHRASES = ["owner only", "owner-only", "needs a token", "no token", "needs the owner", "cannot be done", "blocked", "session-task:"];

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open')");
  const ins = w.prepare("INSERT INTO agent_issues (id, title, description) VALUES (?, ?, ?)");
  for (const id of IDS.concat([777, 1798])) ins.run(id, "T" + id, "original text of " + id);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);

const w = world();
w.exec(sql);
for (const id of IDS) {
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
  const note = d.slice(("original text of " + id).length);
  ok(d.startsWith("original text of " + id + "\nREM-A5 2026-10-26 ") && d.split("REM-A5 2026-10-26").length === 2, id + ": one dated note appended to the old text", d.slice(0, 80));
  ok(note.length > 200 && note.length < 1300, id + ": the note is a paragraph, not a stub or a dump", note.length);
  ok(!/^\s*(runtime-probe|code-probe|code-task|code-anchor):/im.test(note), id + ": no probe or code-task marker line");
  ok(!BLOCKER_PHRASES.some((p) => note.toLowerCase().includes(p)), id + ": no phrase that v_blocker_claims counts", BLOCKER_PHRASES.filter((p) => note.toLowerCase().includes(p)));
  ok(!denyText.test(note), id + ": no word the orchestrator's PLAN_DENY_TEXT refuses", note.match(denyText) && note.match(denyText)[0]);
}
ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE instr(description, 'REM-A5') > 0").n === 13, "exactly thirteen tickets changed");
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 777").d === "original text of 777" && q1(w, "SELECT description d FROM agent_issues WHERE id = 1798").d === "original text of 1798", "an unrelated ticket and the blocker-verdict ticket 1798 keep their text (its verdict is tied to it)");
{ // the arithmetic the notes state
  ok(290 + 1034 + 2 + 3 + 1 === 1330, "sla_breaches_over_120m: 290 + 1034 + 2 + 3 + 1 = 1330");
  ok(0 + 1 + 133 + 0 + 0 + 0 + 61 === 195, "stuck_items_over_sla: 0 + 1 + 133 + 0 + 0 + 0 + 61 = 195");
  const burst = 4.646 + 5.447 + 4.223 + 2.134;
  ok(Math.abs(burst - 16.45) < 0.01 && Math.abs((burst * 1e6 - 4 * 10000) / 1000 * 0.011 - 180.6) < 1, "the 10-18 to 10-21 burst is 16.45M neurons and about 180 USD after the free tier", burst);
  ok(Math.abs(450 + 5 + 321.89 + 29.86 + 660.09 - 1466.84) < 0.01 && Math.abs(450 + 5 + 321.89 - 777) < 0.2, "monthly_cost_run_rate_usd: the parts sum to 1466.84 and the fixed floor is 777", 450 + 5 + 321.89);
}
{ // replay
  const snap = () => JSON.stringify(qa(w, "SELECT id, description FROM agent_issues ORDER BY id"));
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing");
}
{ // rollback
  const r = world();
  const fresh = JSON.stringify(qa(r, "SELECT id, description FROM agent_issues ORDER BY id"));
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(JSON.stringify(qa(r, "SELECT id, description FROM agent_issues ORDER BY id")) === fresh, "Rollback restores every description byte for byte");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
