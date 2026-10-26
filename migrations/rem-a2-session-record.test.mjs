// SESSION-CLOSEOUT-REM-A2 offline suite: replays migrations/2026-10-26-rem-a2-session-record.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); one session_records row is written once although the file runs twice; total_tasks is the 50 assigned issues and its id
// list holds exactly 50 distinct ids; completed_tasks and execution_ratio are counted from agent_issues (status closed, only the assigned ids), not typed; a different session row is untouched; the row has the fields the
// closeout asks for (what was asked, decisions, files, commits, infrastructure changes, handoff notes); the Rollback removes it.
// Run: node migrations/rem-a2-session-record.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-rem-a2-session-record.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\r/.test(sql), "the file has LF line endings only");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai link");

const ids = [...body.matchAll(/id IN \(([0-9,]+)\)/g)].map((m) => m[1].split(",").map(Number));
ok(ids.length === 2 && ids.every((l) => l.length === 50 && new Set(l).size === 50) && JSON.stringify(ids[0]) === JSON.stringify(ids[1]), "the 50 assigned ids are listed twice (completed_tasks and execution_ratio), distinct and identical", ids.map((l) => l.length));
const assigned = ids[0];

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
CREATE TABLE session_records (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, wbs_code TEXT, agent_name TEXT, summary TEXT, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT, completed_at TEXT, created_at TEXT);`);
  assigned.forEach((id, i) => w.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, 't', ?)").run(id, i < 30 ? "closed" : "open"));   // 30 closed, 20 open, the live shape
  w.prepare("INSERT INTO agent_issues (id, title, status) VALUES (999999991, 'not assigned', 'closed'), (999999992, 'not assigned', 'closed')").run();
  w.prepare("INSERT INTO session_records (session_id, wbs_code, total_tasks, completed_tasks) VALUES ('session-someone-else', 'QNFO.OPS', 3, 2)").run();
  return w;
}
const w = world();
w.exec(sql); w.exec(sql);   // a replay adds nothing
const rows = w.prepare("SELECT * FROM session_records WHERE session_id = 'session-rem-a2-fleet-remediation'").all();
ok(rows.length === 1, "one session_records row although the file ran twice", rows.length);
const r = rows[0];
ok(r.total_tasks === 50 && r.completed_tasks === 30 && r.execution_ratio === 0.6, "total 50, completed 30 and ratio 0.6 are counted from agent_issues (closed assigned ids only; two closed strangers are not counted)", [r.total_tasks, r.completed_tasks, r.execution_ratio]);
w.exec("DELETE FROM session_records WHERE session_id = 'session-rem-a2-fleet-remediation'");
w.exec("UPDATE agent_issues SET status = 'closed' WHERE id = " + assigned[40]);
w.exec(sql);
const r2 = w.prepare("SELECT * FROM session_records WHERE session_id = 'session-rem-a2-fleet-remediation'").get();
ok(r2.completed_tasks === 31 && r2.execution_ratio === 0.62, "one more closed issue before apply gives 31 and 0.62 (counted, not typed)", [r2.completed_tasks, r2.execution_ratio]);
ok(r.wbs_code === "QNFO.OPS" && r.agent_name === "claude-code" && r.started_at === "2026-10-26T17:52:00Z" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(r.completed_at) && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.created_at), "wbs_code, agent_name, started_at and the apply-time completed_at and created_at are set");
ok(/^Asked: /.test(r.summary) && /30 of the 50 closed/.test(r.summary) && /4742, 4757, 4766, 4775, 4790, 4820, 4829, 4831, 4858, 4875, 4887, 4904/.test(r.summary), "the summary says what was asked, what finished and the PRs");
ok(/No probe, cap or guard was loosened/.test(r.decisions_made) && /METRIC-SAMPLE-GATE-2/.test(r.decisions_made) && /ISSUE-TOOL-REPO-ARGS-1/.test(r.decisions_made) && /rem-a6/.test(r.decisions_made), "the decisions name the guardrail kept, the two self-corrections and the claim disclosure");
ok(/qnfo-ops\/worker\.js/.test(r.files_changed) && /migrations\/2026-10-26-root-cause-probe-at-birth-2\.sql/.test(r.files_changed) && /4818 closed unmerged/.test(r.commits), "files and commits are listed, including the closed PR");
ok(/migration_runs ok for the nine migrations/.test(r.infrastructure_changes) && /2\.59\.5/.test(r.infrastructure_changes) && /0\.56\.2/.test(r.infrastructure_changes), "infrastructure changes name the applied migrations and the live worker versions");
ok(/^OPEN, each with its doer or clock\./.test(r.handoff_notes) && /1000301 to 1000310/.test(r.handoff_notes) && /2954/.test(r.handoff_notes) && /1000248/.test(r.handoff_notes) && /1000038/.test(r.handoff_notes) && /100310 and 100362/.test(r.handoff_notes), "the handoff names every open group with its doer or clock");
ok(w.prepare("SELECT total_tasks t FROM session_records WHERE session_id = 'session-someone-else'").get().t === 3, "another session's row is untouched");
const down = /^-- Rollback: (.*)$/m.exec(sql)[1];
w.exec(down);
ok(!w.prepare("SELECT 1 x FROM session_records WHERE session_id = 'session-rem-a2-fleet-remediation'").get() && w.prepare("SELECT COUNT(*) n FROM session_records").get().n === 1, "Rollback: the row is gone and the other session's row stays");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
