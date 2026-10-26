// SESSION-CLOSEOUT-20261026-BACKLOG offline suite: replays the migration on node:sqlite. Output MUST contain "0 failed".   node migrations/session-closeout-backlog-1026.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-session-closeout-backlog-1026.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: /m.test(sql), "header opts in");
const w = new DatabaseSync(":memory:");
w.exec("CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
w.exec(sql); w.exec(sql);
const r = w.prepare("SELECT * FROM session_records").all();
ok(r.length === 1 && r[0].total_tasks === 20 && r[0].completed_tasks === 0 && r[0].execution_ratio === 0, "one honest row, replay-safe");
w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice(13));
ok(w.prepare("SELECT COUNT(*) n FROM session_records").get().n === 0, "rollback removes the row");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
