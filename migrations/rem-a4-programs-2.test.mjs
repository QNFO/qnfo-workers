// REM-A4-PROGRAMS-2 offline suite: replays migrations/2026-10-26-rem-a4-programs-2.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs. Proves: the header opts in and nothing is deleted or dropped; the correction notes land once on 100293 and
// 100294 after their original text, the dated notes once on 100279, 100318, 100366 and 2008; the action text of contract issue-100318 is corrected (and only
// that phrase); an issue that is not open gets no note; no status, probe or other contract changes; one decision_log row; a replay changes nothing; the
// Rollback line restores the previous action phrase.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-programs-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-programs-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const OLD_ACTION = "reads a rollup. 7 verified loop merges on qnfo-gateway and 12 merged (8 verified) on qnfo-ai in 7 days, more text";
const OLD_ACTION_BEFORE = "reads a rollup. 7 verified loop merges on qnfo-gateway and 12 on qnfo-ai in 7 days, more text";
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  for (const id of [100293, 100294, 100279, 100318, 100366, 2008]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original text', 'qnfo-fleet-control', 'critical', ?, 1, 1)").run(id, "ISSUE-" + id + ": a program issue", o.closed === id ? "closed" : "open");
  }
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES ('issue-100318', 100318, 'pre', ?, 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'd1-query', 1000, 'qnfo-ops', 'active', 'rem-a4-programs', 4, 'fail')").run(o.fixed ? OLD_ACTION : OLD_ACTION_BEFORE);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status) VALUES ('issue-100366', 100366, 'pre', 'untouched 12 on qnfo-ai in 7 days', 'SELECT 1', 'd1-query', 1000, 'qnfo-ops', 'active')").run();
  w.exec("CREATE TABLE bak_20261026_rem_a4_programs (class TEXT, action TEXT)");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const desc = (w, id) => q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;

const w = world();
w.exec(sql);
for (const [id, marker] of [[100293, "REM-A4-PROGRAMS-2 correction"], [100294, "REM-A4-PROGRAMS-2 correction"], [100279, "REM-A4-PROGRAMS-2 2026-10-26"], [100318, "REM-A4-PROGRAMS-2 2026-10-26"], [100366, "REM-A4-PROGRAMS-2 2026-10-26"], [2008, "REM-A4-PROGRAMS-2 2026-10-26"]]) {
  const d = desc(w, id);
  ok(d.startsWith("original text\n") && d.split(marker).length === 2, "issue " + id + " gets one note after its original text", d.slice(0, 120));
}
ok(/ct_im1000430c/.test(desc(w, 100294)) && /PR 4736 belongs to BREACH-DOCTOR-WATCHMAKER-1/.test(desc(w, 100294)), "the 100294 correction names the merged tasks and the family of PR 4736");
ok(/95 merged tasks/.test(desc(w, 100293)) && /withdrawn/.test(desc(w, 100293)), "the 100293 correction states the recount and withdraws the unmeasured claims");
ok(/2026-11-08T09:31Z/.test(desc(w, 2008)) && /MERGE-STREAMLINE-1/.test(desc(w, 2008)), "the 2008 note states the clear date and the gate change");
ok(/2026-10-27T04:00Z/.test(desc(w, 100279)) && /1000171/.test(desc(w, 100279)), "the 100279 note states the time gate and the one revert issue");
ok(q1(w, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a === OLD_ACTION, "the action phrase of issue-100318 is corrected and the rest of the text is kept");
ok(q1(w, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100366'").a === "untouched 12 on qnfo-ai in 7 days", "another contract is untouched");
ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'").n === 6, "no issue status is changed");
ok(q1(w, "SELECT verify_probe p, status s, attempts a FROM remediation_contracts WHERE class = 'issue-100318'").p.startsWith("SELECT 'ok'") && q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100318'").s === "active", "the probe and status of issue-100318 are kept");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-PROGRAMS-2:%'").n === 1, "one decision_log row");

{
  const w2 = world();
  w2.exec(sql);
  const snap = () => JSON.stringify([w2.prepare("SELECT id, description, updated_at FROM agent_issues ORDER BY id").all(), w2.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w2.prepare("SELECT action FROM decision_log").all()]);
  const s1 = snap();
  w2.exec(sql);
  ok(snap() === s1, "a replay changes nothing");
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(q1(w2, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a === OLD_ACTION_BEFORE, "Rollback restores the previous action phrase");
}
{
  const w3 = world({ closed: 2008 });
  w3.exec(sql);
  ok(desc(w3, 2008) === "original text", "an issue that is not open gets no note");
  ok(desc(w3, 100279).includes("REM-A4-PROGRAMS-2"), "the open ones still do");
}
{
  const w4 = world({ fixed: true });
  const before = q1(w4, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a;
  w4.exec(sql);
  ok(q1(w4, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a === before, "an action text that already holds the corrected phrase is left as it is");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
