// REM-A7-DOI-SWEEP-3 offline suite: replays migrations/2026-10-26-rem-a7-doi-sweep-3.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus portfolio_repos.
// Proves: the closing contract of NOZ-DOI-SWEEP-2A moves from an external-https read of the GitHub API description (which observed "(absent)" on its first run) to a d1-query that counts the non-archived repositories whose synced
// description names 10.5281 (3 on the live copy of 2026-10-26, 6 with the archived ones); it reads a positive count while a description names the prefix and exactly 0 once the three are revised, ignores archived and unseen
// rows and third-party DOIs; the issue gets one explanatory paragraph; another issue's contract is untouched; a replay changes nothing; Rollback restores the external-https probe and trims the paragraph.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-doi-sweep-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-doi-sweep-3.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const consumer = readFileSync(here("../scripts/remediation_consumer.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
const OLD = '{"url": "https://api.github.com/repos/QNFO/ignorance-audit", "method": "GET", "check": "json:description", "expected": "QNFO research code: ignorance-audit. Staged and tested in QNFO/qnfo-workers/research-code/ignorance-audit."}';
const Z = "zen" + "odo";
const R = (n) => "10.5281/" + Z + "." + n;

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE portfolio_repos (name TEXT PRIMARY KEY, archived INTEGER, seen INTEGER, description TEXT)");
  const pr = w.prepare("INSERT INTO portfolio_repos (name, archived, seen, description) VALUES (?, ?, ?, ?)");
  pr.run("agentic-collapse", 0, 1, "QNFO research code: agentic-collapse (companion to " + R(18133065) + "). Staged and tested in QNFO/qnfo-workers/research-code/agentic-collapse.");
  pr.run("ignorance-audit", 0, 1, "QNFO research code: ignorance-audit (companion to " + R(21901984) + "). Staged and tested in QNFO/qnfo-workers/research-code/ignorance-audit.");
  pr.run("ultrametric-lean", 0, 1, "QNFO research code: ultrametric-lean (companion to " + R(22073477) + "). Staged and tested in QNFO/qnfo-workers/research-code/ultrametric-lean.");
  pr.run("biophoton-archived", 1, 1, "Biophoton Ultrametricity: DOI " + R(21651892));
  pr.run("unseen-repo", 0, 0, "gone from GitHub " + R(1));
  pr.run("third-party", 0, 1, "cites 10.1111/phpr.12228");
  pr.run("clean", 0, 1, "a clean description");
  const issue = (id, title, desc) => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'claude-session:rem-a7-f4', 'medium', 'open', 1, 1)").run(id, title, desc);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  issue(1000479, "NOZ-DOI-SWEEP-2A: three public repository descriptions carry a closed-registry DOI", "Doer: qnfo-fleet-control code loop.");
  issue(1000480, "NOZ-DOI-SWEEP-2B: QNFO/.github release-pipeline.yml still calls the disabled registry workflow", "Doer: external-repo-patch.");
  const c = w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict, attempts) VALUES (?, ?, 'p', 'a', ?, 'external-https', 'qnfo-fleet-control', 'active', 'rem-a7-doi-sweep-v1', 'fail', 1)");
  c.run("issue-1000479", 1000479, OLD);
  c.run("issue-1000480", 1000480, '{"url": "https://raw.githubusercontent.com/QNFO/.github/master/.github/workflows/release-pipeline.yml", "method": "GET", "check": "body-contains:NOZ-DOI-1: no registry stage", "expected": "present"}');
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const snap = (w) => JSON.stringify([qa(w, "SELECT id, description FROM agent_issues ORDER BY id"), qa(w, "SELECT class, status, verify_probe, verify_transport FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);

{
  const w = world();
  w.exec(sql);
  const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000479'");
  ok(c.verify_transport === "d1-query" && c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.expected_cadence_h === 1 && c.module === "rem-a7-doi-sweep-v1" && /portfolio_repos/.test(c.verify_probe), "2A: the contract is a d1-query on portfolio_repos, re-armed", c);
  const low = c.verify_probe.toLowerCase();
  ok(low.startsWith("select") && !WRITE_KW.some((kw) => low.includes(kw)) && !c.verify_probe.replace(/;\s*$/, "").includes(";") && !/agent_issues/.test(c.verify_probe), "the probe is one literal read-only select that does not read an issue's status");
  const run = () => qa(w, c.verify_probe)[0];
  const r0 = run();
  ok(r0.expected === "0" && r0.observed === "3", "three non-archived descriptions name the prefix: reads 3 (archived, unseen and third-party rows are ignored)", r0);
  w.exec("UPDATE portfolio_repos SET description = 'QNFO research code: ignorance-audit. Staged and tested in QNFO/qnfo-workers/research-code/ignorance-audit.' WHERE name = 'ignorance-audit'");
  ok(run().observed === "2", "one description revised: reads 2");
  w.exec("UPDATE portfolio_repos SET description = 'QNFO research code: agentic-collapse. Staged.' WHERE name = 'agentic-collapse'; UPDATE portfolio_repos SET description = 'QNFO research code: ultrametric-lean. Staged.' WHERE name = 'ultrametric-lean'");
  const r3 = run();
  ok(r3.expected === "0" && r3.observed === "0", "all three revised: reads exactly 0 (the archived and unseen rows are not counted)", r3);
  ok(q1(w, "SELECT COUNT(*) n FROM portfolio_repos WHERE instr(description, '10.5281') > 0").n === 2, "the archived and unseen rows still name the prefix and are out of scope");
  w.exec("UPDATE portfolio_repos SET description = 'again " + R(5) + "' WHERE name = 'clean'");
  ok(run().observed === "1", "a re-entry in a non-archived repository reads 1");
  const c2 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000480'");
  ok(c2.verify_transport === "external-https" && /raw\.githubusercontent\.com/.test(c2.verify_probe) && c2.last_verdict === "fail", "2B is untouched (its raw-file read already carries a positive marker)");
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = 1000479").d;
  ok(d.startsWith("Doer: qnfo-fleet-control code loop.") && (d.match(/PROBE CHANGED \(REM-A7-DOI-SWEEP-3/g) || []).length === 1 && /\(absent\)/.test(d) && /portfolio_repos/.test(d) && /rate limited/.test(d), "2A gets one paragraph that says why the probe changed");
  ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 1000480").d === "Doer: external-repo-patch.", "2B's description is untouched");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f4' AND action LIKE 'REM-A7-DOI-SWEEP-3:%'").n === 1, "one decision_log row");
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  const w2 = world();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  const rc = q1(w2, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000479'");
  ok(rc.verify_transport === "external-https" && rc.verify_probe === OLD, "Rollback restores the external-https probe", rc);
  ok(q1(w2, "SELECT description d FROM agent_issues WHERE id = 1000479").d === "Doer: qnfo-fleet-control code loop.", "Rollback trims the paragraph");
}
{
  // no open 2A issue (already closed): nothing is rewritten
  const w = world();
  w.exec("UPDATE issue_triage SET close_evidence = 'e' WHERE issue_id = 1000479");
  w.exec("UPDATE remediation_contracts SET last_verdict = NULL WHERE class = 'issue-1000479'");
  w.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1000479");
  w.exec(sql);
  ok(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-1000479'").p === OLD, "a closed 2A keeps its contract as it was");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
