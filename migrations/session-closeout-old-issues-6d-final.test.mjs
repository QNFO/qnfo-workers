// SESSION-CLOSEOUT-20261026-OLD-ISSUES-6D (final) offline suite: replays migrations/2026-10-26-session-closeout-old-issues-6d-final.sql on SQLite.
// Proves: the early row (3 of 110) is replaced by the closing state (11 of 110, ratio 0.1, 18 pull requests), the backup holds the early row, a second apply keeps the closing
// state, another session's row is untouched, and the Rollback line restores the early row from the backup.
// Run: node --no-warnings migrations/session-closeout-old-issues-6d-final.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-session-closeout-old-issues-6d-final.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_session_record_6d$/m.test(sql), "the opt-in, DB and BACKUP headers are present");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT,
  infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
d.exec("INSERT INTO session_records (session_id, wbs_code, agent_name, summary, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at) VALUES ('session-old-issues-6d-2038', 'QNFO.OPS.AUDT', 'claude-code', 'early', 'early handoff', 0.027, 110, 3, '2026-10-26T16:05:00Z', '2026-10-26T17:18:58Z')");
d.exec("INSERT INTO session_records (session_id, wbs_code, summary, started_at) VALUES ('other-session', 'X', 'untouched', '2026-10-26T00:00:00Z')");
d.exec(body);
const r = d.prepare("SELECT * FROM session_records WHERE session_id = 'session-old-issues-6d-2038'").get();
ok(r.total_tasks === 110 && r.completed_tasks === 11 && Math.abs(r.execution_ratio - 11 / 110) < 0.001, "the row reads 11 of 110 with the matching ratio", [r.total_tasks, r.completed_tasks, r.execution_ratio]);
ok(r.commits.split(" ").length === 18 && r.wbs_code === "QNFO.OPS.AUDT" && r.started_at === "2026-10-26T16:05:00Z", "18 pull requests listed, wbs code and start time kept", r.commits);
ok(r.summary.includes("11 closed with evidence") && r.handoff_notes.includes("100166") && r.completed_at > "2026-10-26T17:18:58Z", "summary, handoff and completion time are the closing ones");
ok(d.prepare("SELECT summary FROM session_records WHERE session_id = 'other-session'").get().summary === "untouched", "another session's row is untouched");
const bak = d.prepare("SELECT * FROM bak_20261026_session_record_6d").all();
ok(bak.length === 1 && bak[0].summary === "early" && bak[0].completed_tasks === 3, "the backup holds the early row", bak);
d.exec(body);
ok(d.prepare("SELECT completed_tasks FROM session_records WHERE session_id = 'session-old-issues-6d-2038'").get().completed_tasks === 11 && d.prepare("SELECT COUNT(*) AS n FROM bak_20261026_session_record_6d").get().n === 1 && d.prepare("SELECT summary FROM bak_20261026_session_record_6d").get().summary === "early", "a second apply keeps the closing state and the original backup");
d.exec(rollback);
const back = d.prepare("SELECT * FROM session_records WHERE session_id = 'session-old-issues-6d-2038'").get();
ok(back.summary === "early" && back.total_tasks === 110 && back.completed_tasks === 3 && back.execution_ratio === 0.027 && back.completed_at === "2026-10-26T17:18:58Z", "the Rollback line restores the early row", back);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
