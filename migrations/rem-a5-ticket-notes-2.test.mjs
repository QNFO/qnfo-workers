// REM-A5-TICKET-NOTES-2 offline suite: replays migrations/2026-10-26-rem-a5-ticket-notes-2.sql on node:sqlite.
// Proves: the header opts in (nothing deleted or dropped); the one phrase of ticket 99909 is corrected and every other character of its text is kept; no other ticket changes; a replay changes
// nothing; the Rollback line restores the old text; and the original note text in migrations/2026-10-26-rem-a5-metric-triggers.sql names the phrase the correction targets.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-ticket-notes-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-ticket-notes-2.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(/closed by a person 9/.test(rd("migrations/2026-10-26-rem-a5-metric-triggers.sql")), "the earlier migration holds the phrase this file corrects");

const OLD = "original 99909 text\nREM-A5 2026-10-26 19:00Z: cause read. ... 44 now (github:rwnq8 21, merged_by null 13, closed by a person 9, session 1), the last at 2026-10-26T11:05Z, against 174 merged by qnfo-fleet-control. ...";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open')");
  const ins = w.prepare("INSERT INTO agent_issues (id, title, description) VALUES (?, ?, ?)");
  ins.run(99909, "T99909", OLD);
  ins.run(99923, "T99923", "text with closed by a person 9 elsewhere");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);

const w = world();
w.exec(sql);
const d = q1(w, "SELECT description d FROM agent_issues WHERE id = 99909").d;
ok(d === OLD.replace("closed by a person 9", "closed with a session or by-PR note 9"), "99909: exactly the one phrase changes and every other character is kept", d);
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 99923").d === "text with closed by a person 9 elsewhere", "no other ticket changes, even one that holds the same words");
{ const s1 = JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()); w.exec(sql); ok(JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()) === s1, "a second apply changes nothing"); }
{
  const r = world();
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(q1(r, "SELECT description d FROM agent_issues WHERE id = 99909").d === OLD, "Rollback restores the old text byte for byte");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
