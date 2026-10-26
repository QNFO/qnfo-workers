// REM-A4-FIRST-PASS-CLOSE-2B offline suite: replays migrations/2026-10-26-rem-a4-first-pass-close-2.sql (files the issue) and then 2026-10-26-rem-a4-first-pass-close-2b.sql on node:sqlite over the
// live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs. Proves: the header opts in; the born-superseded contract of the filed issue becomes the code-read contract of its code-probe line
// (module code-probe-line-v1, the probe JSON equal to the one in the description, active, attempts 0, due now); a contract that is not the born-superseded template, another issue's contract and a
// closed issue are untouched; a replay changes nothing; one decision_log row; the Rollback line parks the contract again.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-first-pass-close-2b.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql1 = readFileSync(here("./2026-10-26-rem-a4-first-pass-close-2.sql"), "utf8");
const sql = readFileSync(here("./2026-10-26-rem-a4-first-pass-close-2b.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const BORN = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = ";
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(sql1); // files the issue
  const id = w.prepare("SELECT id FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%'").get().id;
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES (?, ?, 'p', 'VACUOUS-PROBE-V3-1: x', ?, 'd1-query', 'qnfo-fleet-control', ?, ?, ?)")
    .run("issue-" + id, id, BORN + id + ") AS observed", o.status ?? "superseded", o.module ?? "probe-template-v3-generic", o.verdict ?? "superseded:closure-observing-probe-at-birth");
  return { w, id };
}
const row = (w, id) => w.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + id);

{
  const { w, id } = world();
  w.exec(sql);
  const c = row(w, id);
  const desc = w.prepare("SELECT description d FROM agent_issues WHERE id = ?").get(id).d;
  const probeLine = desc.split("\n").find((l) => l.startsWith("code-probe: ")).slice("code-probe: ".length);
  ok(c.status === "active" && c.verify_transport === "code-read" && c.module === "code-probe-line-v1" && c.last_verdict === null && c.attempts === 0 && c.next_due_at !== null, "the contract is active, code-read, module code-probe-line-v1, attempts 0, due now", c);
  ok(c.verify_probe === probeLine && JSON.parse(c.verify_probe).contains === "FIRST-PASS-CLOSE-2", "the probe is the code-probe line of the issue, byte for byte", c.verify_probe);
  ok(!/VACUOUS/.test(c.action) && /scripts\/remediation_consumer\.py reads its checkout of main/.test(c.action), "the action text is the code-probe contract text, not the born-superseded one");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-FIRST-PASS-CLOSE-2B:%'").get().n === 1, "one decision_log row");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT actor, action FROM decision_log ORDER BY id").all()]);
  w.prepare("UPDATE remediation_contracts SET attempts = 4, last_verdict = 'fail' WHERE class = ?").run("issue-" + id);
  const s = snap();
  w.exec(sql);
  ok(snap() === s, "a replay changes nothing (a probed contract is not reset)");
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  w.exec(rb);
  ok(row(w, id).status === "superseded", "Rollback parks the contract again");
}
for (const [name, o] of [["a contract already rewritten by someone else", { module: "rem-other" }], ["a contract that is not superseded", { status: "active", module: "probe-template-v3-generic" }]]) {
  const { w, id } = world(o);
  const before = JSON.stringify(row(w, id));
  w.exec(sql);
  ok(JSON.stringify(row(w, id)) === before, name + ": left untouched");
}
{
  const { w, id } = world();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'x', 'triaged', 'o', '2026-10-01', 'fixture evidence') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = 'fixture evidence'").run(id);
  w.prepare("DELETE FROM remediation_contracts WHERE class = ?").run("issue-" + id);
  w.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES (?, ?, 'p', 'a', 'x', 'd1-query', 'q', 'superseded', 'probe-template-v3-generic')").run("issue-" + id, id);
  const before = JSON.stringify(row(w, id));
  w.exec(sql);
  ok(JSON.stringify(row(w, id)) === before, "a closed issue's contract is untouched");
}
{
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(sql);
  ok(w.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0, "without the filed issue nothing is written");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
