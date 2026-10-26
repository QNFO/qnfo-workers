// REM-A4-FIRST-PASS-CLOSE-2 offline suite: replays migrations/2026-10-26-rem-a4-first-pass-close-2.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs. Proves: the header opts in; the issue FIRST-PASS-CLOSE-2 is filed once (a replay and a second open issue of the same title prefix change nothing)
// from a trusted source (claude-session*), with the three lines the code loop and the D1 birth triggers read exactly as they must be formed (a code-task line naming the worker, a code-anchor line
// whose text occurs exactly once in qnfo-fleet-control/worker.js, a single-line code-probe JSON naming the marker the edit adds); the change it asks for names the real statement shape (a
// pre-stamp of last_verdict before the pass row, the same refusal tokens the autoclose trigger reads); one decision_log row; the Rollback line closes the issue through issue_triage with evidence.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-first-pass-close-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-first-pass-close-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const worker = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
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
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);

const w = world();
w.exec(sql);
const issue = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%'");
ok(issue && issue.status === "open" && issue.priority === "medium" && issue.category === "autonomy", "the issue is filed open", issue && { status: issue.status, priority: issue.priority });
ok(/^claude-session/.test(issue.source), "the source matches the trusted claude-session* pattern of code_merge_trusted_sources", issue.source);
ok(issue.created_at > 1.7e12 && issue.created_at === issue.updated_at, "created_at is milliseconds", issue.created_at);
const lines = issue.description.split("\n");
const taskLine = lines.filter((l) => /^code-task: /.test(l)), anchorLine = lines.filter((l) => /^code-anchor: /.test(l)), probeLine = lines.filter((l) => /^code-probe: /.test(l));
ok(taskLine.length === 1 && taskLine[0] === "code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js", "one code-task line naming the worker", taskLine);
ok(anchorLine.length === 1, "one code-anchor line");
const anchor = anchorLine[0].slice("code-anchor: ".length);
ok(worker.split(anchor).length === 2, "the code-anchor text occurs exactly once in qnfo-fleet-control/worker.js", { anchor, count: worker.split(anchor).length - 1 });
ok(probeLine.length === 1, "one code-probe line");
let probe = null;
try { probe = JSON.parse(probeLine[0].slice("code-probe: ".length)); } catch (e) { probe = null; }
ok(probe && JSON.stringify(probe.paths) === JSON.stringify(["qnfo-fleet-control/worker.js"]) && probe.contains === "FIRST-PASS-CLOSE-2" && Object.keys(probe).length === 2, "the code-probe is single-line JSON with the worker path and the marker FIRST-PASS-CLOSE-2", probe);
ok(/UPDATE remediation_contracts SET last_verdict = 'pass' WHERE class = \?1 AND status IN \('active', 'holding'\) AND COALESCE\(last_verdict, ''\) IN \('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'\)/.test(issue.description), "the requested statement is the pre-stamp with the five refusal tokens of the autoclose trigger");
ok(/Definition of done: qnfo-fleet-control\/worker\.js on main holds FIRST-PASS-CLOSE-2/.test(issue.description) && /star-slash/.test(issue.description), "the definition of done and the block-comment warning are in the text");
ok(description_ok(issue.description), "no line of the description other than the three markers starts with code-task:, code-anchor: or code-probe:");
function description_ok(d) { return d.split("\n").filter((l) => /^(code-task|code-anchor|code-probe|session-task):/.test(l)).length === 3; }
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-FIRST-PASS-CLOSE-2:%'").n === 1, "one decision_log row");

// replay and a second open issue with the same title prefix change nothing
const snap = () => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const s = snap();
w.exec(sql);
ok(snap() === s, "a replay changes nothing");

// the worker really has the statement the issue describes (the edit is not already made, or if it is, the marker is there)
const hasMarker = worker.includes("FIRST-PASS-CLOSE-2");
ok(hasMarker === false || /var passed = es === os \? 1 : 0;[\s\S]{0,600}FIRST-PASS-CLOSE-2/.test(worker), "either the edit is not made yet, or the marker sits right after the anchor line");
ok(/rtIsDeferral\(os\)[\s\S]{0,2500}var passed = es === os \? 1 : 0;[\s\S]{0,400}INSERT INTO remediation_verifications/.test(worker), "the anchor line is in the verdict branch of remediationContractsTick, before the pass row insert");

// the Rollback line closes the filed issue through issue_triage with evidence
{
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  const w2 = world();
  w2.exec(sql);
  const id = q1(w2, "SELECT id FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%'").id;
  w2.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  w2.exec(rb);
  const a = q1(w2, "SELECT status, close_channel FROM agent_issues WHERE id = ?", id);
  ok(a.status === "closed" && /^auto:triage-sync/.test(a.close_channel), "Rollback closes the filed issue through the close-sync trigger", a);
  ok(/Rollback line/.test(q1(w2, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id).e), "Rollback leaves evidence");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
