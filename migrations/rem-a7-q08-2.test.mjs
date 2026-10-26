// REM-A7-Q08-2 offline suite: replays migrations/2026-10-26-rem-a7-q08-2.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in; the finding is appended once to 100439's text and to the triage rows of 100439 and 100607 (after the text REM-A7-Q08-1 wrote), nothing else changes, one
// decision_log row is inserted, a replay changes nothing, the Rollback header strips exactly what the file appended, nothing is deleted, no probe line enters a description.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-q08-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-q08-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "nothing is deleted or dropped");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/code-probe: \{|runtime-probe: \{/.test(sql), "no probe line is written into a description");
ok(!/^\s*(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+"?(decision_log|issue_lifecycle)\b/im.test(body), "decision_log and issue_lifecycle are only inserted into");
ok((body.match(/INSERT INTO decision_log/g) || []).length === 1, "exactly one decision_log insert");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title, status, desc) => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'owner-chat', 'reach', 'critical', ?, 1, 1)").run(id, title, desc, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'q08-signal-engine', '2026-10-01', ?)").run(id, "REM-A7-Q08-1 (rem-a7-f2, 2026-10-26): first note for " + id + ".");
  };
  issue(100439, "Q08-GATE-ECONOMICS: gate_pass_rate_7d 0.032", o.s100439 || "open", "original text\n\nFINDING 2026-10-26 (REM-A7-Q08-1, session rem-a7-f2): first finding.");
  issue(100607, "Q08-PUBLISH-STALL-AUTO-1: q08-signal-engine published nothing", "open", "loop text");
  issue(1000999, "SOME-OTHER-ISSUE: unrelated", "open", "other text");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const desc = (w, id) => q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
const rem = (w, id) => q1(w, "SELECT remediation r FROM issue_triage WHERE issue_id = ?", id).r;
const snap = (w) => JSON.stringify(["agent_issues", "issue_triage", "decision_log"].map((t) => w.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));

{
  const w = world();
  const before = { d: desc(w, 100439), r1: rem(w, 100439), r7: rem(w, 100607), other: desc(w, 1000999), otherR: rem(w, 1000999), loop: desc(w, 100607) };
  w.exec(sql);
  const d = desc(w, 100439);
  ok(d.startsWith(before.d) && /UPDATE 2026-10-26 19:25Z \(REM-A7-Q08-2/.test(d), "100439: the update is appended after its text and the first finding", d.slice(0, 120));
  ok(/0\.37\.4/.test(d) && /0\.37\.5/.test(d) && /PR 4835/.test(d) && /PR 4848/.test(d) && /2610\.32638/.test(d) && /419,000/.test(d) && /1,256,947/.test(d) && /179,564/.test(d) && /nothing is edited to pass/.test(d), "it names the two changes, the blocked paper, and the corrected baseline", d.slice(-900));
  ok(rem(w, 100439).startsWith(before.r1) && /REM-A7-Q08-2 \(19:25Z\)/.test(rem(w, 100439)) && /0\.37\.5/.test(rem(w, 100439)) && /2026-10-29/.test(rem(w, 100439)), "100439: the triage text keeps the first note and adds the next reading date");
  ok(rem(w, 100607).startsWith(before.r7) && /REM-A7-Q08-2 \(19:25Z\)/.test(rem(w, 100607)) && /0\.37\.4/.test(rem(w, 100607)), "100607: the triage text keeps the first note and adds the two causes");
  ok(desc(w, 100607) === before.loop, "100607's description (rewritten hourly by its detector) is not touched");
  ok(desc(w, 1000999) === before.other && rem(w, 1000999) === before.otherR, "an unrelated issue is untouched");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100439").s === "open" && q1(w, "SELECT status s FROM agent_issues WHERE id = 100607").s === "open", "both issues stay open");
  const dl = w.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 1 && dl[0].actor === "rem-a7-f2" && /^REM-A7-Q08-2:/.test(dl[0].action) && /ground-blind|dollar amounts/.test(dl[0].action) && /revert the 0\.37\.4 and 0\.37\.5 commits/.test(dl[0].rollback_path) && /40 percent or more/.test(dl[0].predicted_outcome), "one decision_log row with its prediction and rollback", dl);
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(desc(w, 100439) === before.d && rem(w, 100439) === before.r1 && rem(w, 100607) === before.r7, "Rollback strips exactly what the file appended", [desc(w, 100439).slice(-80), rem(w, 100439).slice(-80)]);
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "the decision_log row stays (append-only)");
}
{
  const w = world({ s100439: "closed" });
  const s0 = snap(w);
  w.exec(sql);
  ok(desc(w, 100439) === q1(w, "SELECT description d FROM agent_issues WHERE id = 100439").d && !/REM-A7-Q08-2/.test(desc(w, 100439)), "an issue that is no longer open gets no appended text");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
