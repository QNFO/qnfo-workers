// REM-A7-Q08-4 offline suite: replays migrations/2026-10-26-rem-a7-q08-4.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in; the placeholder contract of issue 1000512 becomes the code-read probe (valid JSON, no semicolon, red on the committed worker until researchLedger lands, green on a worker that has it);
// only that contract changes, only while the issue is open and the placeholder is still there; a replay changes nothing; the Rollback header re-parks the contract; nothing is deleted.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-q08-4.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-q08-4.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const worker = readFileSync(here("../q08-signal-engine/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const PLACEHOLDER = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000512) AS observed";
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (1000512, 'Q08-FORECAST-LEDGER-1: forecast ground = the source essay + a research ledger', 'text', 'session', 'reach', 'high', ?, 1, 1)").run(o.status || "open");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-1000512', 1000512, 'pre', 'VACUOUS-PROBE-V3-1: act', ?, 'd1-query', 'qnfo-fleet-control', 'superseded', 'superseded:closure-observing-probe-at-birth')").run(PLACEHOLDER);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-1000999', 1000999, 'pre', 'act', 'SELECT 1', 'd1-query', 'x', 'superseded', 'v')").run();
  return w;
}
const con = (w, c) => w.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const snap = (w) => JSON.stringify(w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all());

{
  const w = world();
  const other = JSON.stringify(con(w, "issue-1000999"));
  w.exec(sql);
  const c = con(w, "issue-1000512");
  ok(c.status === "active" && c.verify_transport === "code-read" && c.last_verdict === null && c.attempts === 0 && /REM-A7-Q08-4/.test(c.precondition), "the placeholder becomes the active code-read closing probe", c);
  let j = null; try { j = JSON.parse(c.verify_probe); } catch (e) { j = null; }
  ok(j && j.paths.length === 1 && j.paths[0] === "q08-signal-engine/worker.js" && j.contains === "function researchLedger(" && !/;/.test(c.verify_probe), "the probe is valid JSON on the worker, with no semicolon", c.verify_probe);
  ok(!worker.includes(j.contains), "the probe is red on the committed worker until the slice lands (researchLedger is not there yet)");
  ok((worker + "\nfunction researchLedger(env, src, signalText) { return { lines: [], sources: [] }; }\n").includes(j.contains), "and green on a worker that carries researchLedger");
  ok(JSON.stringify(con(w, "issue-1000999")) === other, "another contract is untouched");
  const s_1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s_1, "a replay changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(con(w, "issue-1000512").status === "superseded", "Rollback re-parks the contract");
}
{ const w = world({ status: "closed" }); const before = snap(w); w.exec(sql); ok(snap(w) === before, "a closed issue: nothing changes"); }

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
