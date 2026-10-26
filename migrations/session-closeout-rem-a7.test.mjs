// SESSION-CLOSEOUT-20261026-REM-A7 offline suite: replays migrations/2026-10-26-session-closeout-rem-a7.sql on node:sqlite over the live shape of session_records.
// Proves: the header opts in; one row is written with the 32 tasks and the closed count, the ratio equals closed over total, no address or secret-shaped text is in the file; a replay writes nothing
// more; Rollback removes the row.
// Output MUST contain "0 failed" on success.   node migrations/session-closeout-rem-a7.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-session-closeout-rem-a7.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped in the body, no vendor link");
ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(sql) && !/(token|secret|password|api[_-]?key)\s*[:=]/i.test(sql), "no address and no secret-shaped assignment in the file");

const DDL = "CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))";
const w = new DatabaseSync(":memory:");
w.exec(DDL);
w.exec(sql);
const r = w.prepare("SELECT * FROM session_records").all();
ok(r.length === 1 && r[0].session_id === "session-rem-a7-owner-reach" && r[0].total_tasks === 32, "one row, session-rem-a7-owner-reach, 32 tasks", r.map((x) => x.session_id));
ok(r[0].completed_tasks >= 19 && r[0].completed_tasks <= 32 && Math.abs(r[0].execution_ratio - r[0].completed_tasks / r[0].total_tasks) < 0.01, "the ratio equals completed over total", [r[0].completed_tasks, r[0].execution_ratio]);
ok(/IDENTITY-BOUND/.test(r[0].handoff_notes) && /OPEN with owner and blocker/.test(r[0].handoff_notes) && r[0].summary.length > 500, "the handoff names the open items with their owner and blocker");
w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM session_records").get().n === 1, "a replay writes nothing more");
const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
w.exec(rb);
ok(w.prepare("SELECT COUNT(*) n FROM session_records").get().n === 0, "Rollback removes the row");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
