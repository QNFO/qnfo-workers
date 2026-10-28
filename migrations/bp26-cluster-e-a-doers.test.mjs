// BP26-CLUSTER-E-A-DOERS-1 offline suite: replays migrations/2026-10-28-bp26-cluster-e-a-doers.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in; nothing is deleted or dropped; issue 1000346 is closed with evidence through the live close-sync trigger; the two child issues are filed once with source 'session', a
// code-task path, a code-anchor and a code-probe line; the DELTA-NOTE lands once on each parent; a closed parent is untouched; a replay changes nothing; Rollback undoes the file.
// State-independent: no assertion reads the live repository.
// Output MUST contain "0 failed" on success.   node migrations/bp26-cluster-e-a-doers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-28-bp26-cluster-e-a-doers.sql"), "utf8");
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

const PARENTS = [1000333, 1000334, 1000335, 1000337, 1000338, 1000339, 1000340, 1000341, 1000345, 1000347, 1000351, 1000352, 1000354, 1000356, 1000357, 1000358, 1000360];
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title, status = "open") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'bp26-catalogue', 'medium', ?, 1, 1)").run(id, title, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  for (const id of PARENTS) issue(id, "BP26-PARENT-" + id + ": parent", o.closedParent === id ? "closed" : "open");
  issue(1000346, "BP26-AI-ACT-ARTICLE4-1: EU AI Act Article 4 AI literacy evidence");
  if (o.failingContract) w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-1000346', 1000346, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 'active', 'fail')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;

{
  const w = world();
  w.exec(sql);
  ok(st(w, 1000346) === "closed", "1000346 is closed through the live close-sync trigger");
  const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000346");
  ok(t.triage_state === "closed" && /AI-USE-POLICY\.md/.test(t.close_evidence) && /AGENTS\.md/.test(t.close_evidence), "the close evidence names the policy file and the handbook", t);
  for (const title of ["BP26-PROVENANCE-MARKING-1 (implement):", "BP26-EMAIL-AUTH-1 (implement):"]) {
    const rows = w.prepare("SELECT * FROM agent_issues WHERE title LIKE ?").all(title + "%");
    ok(rows.length === 1 && rows[0].source === "session" && rows[0].status === "open", "child filed once with source session: " + title);
    const d = rows[0].description;
    ok(/^code-task: repo=qnfo-workers path=\S+\.js$/m.test(d) && /^code-anchor: .{20,}$/m.test(d) && /^code-probe: \{.*\}$/m.test(d), "child carries code-task, code-anchor and code-probe lines on lines of their own: " + title);
  }
  for (const id of PARENTS) ok(/DELTA-NOTE \(session-cluster-e-a, 2026-10-28\)/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d), "parent " + id + " carries the note");
  for (const id of PARENTS) ok(st(w, id) === "open", "parent " + id + " keeps its status");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all()]);
  const a = snap();
  w.exec(sql);
  ok(snap() === a, "a replay changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(!/DELTA-NOTE/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 1000333").d), "Rollback removes the note");
  ok(q1(w, "SELECT triage_state s FROM issue_triage WHERE issue_id = 1000346").s === "triaged", "Rollback puts 1000346 back to triaged");
}
{
  const w = world({ closedParent: 1000333 });
  w.exec(sql);
  ok(!/DELTA-NOTE/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 1000333").d), "a closed parent gets no note");
}
{
  const w = world({ failingContract: true });
  w.exec(sql);
  ok(st(w, 1000346) === "open", "an active failing contract leaves 1000346 to the contract");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
