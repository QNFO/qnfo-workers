// SESSION-CLOSEOUT-20261026-ISSUE-SWEEP-2 offline suite: migrations/2026-10-26-session-closeout-issue-sweep-2.sql saves the session row it changes, appends the second closeout to it once, leaves other sessions
// alone, does nothing when the row is absent, and its Rollback line restores every changed column from the backup (and only when the marker is present). Replayed in node:sqlite.
// Run: node --no-warnings migrations/session-closeout-issue-sweep-2.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-session-closeout-issue-sweep-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const SID = "015kWmGuAq2fNuvzu4MrD7x3";
const DDL = `CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT, agent_name TEXT, summary TEXT, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT, completed_at TEXT, created_at TEXT);`;
const seed = (db, sid) => db.prepare("INSERT INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at, created_at) VALUES (?, 'core/issue-hygiene', 'Claude Code', 'S0', 'D0', 'F0', '#1 #2', 'I0', 'H0', 0.96, 25, 24, '2026-10-26T06:20:00Z', '2026-10-26T09:00:00Z', '2026-10-26 09:00:00')").run(sid);
const row = (db, sid) => db.prepare("SELECT * FROM session_records WHERE session_id = ?").get(sid);
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql) && /^-- BACKUP: bak_20261026_session_record_closeout2$/m.test(sql), "the file carries the migration headers and names its backup table");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''")), "the body runs no DELETE or DROP outside quoted text");
const db = new DatabaseSync(":memory:");
db.exec(DDL); seed(db, SID); seed(db, "other-session");
db.exec(sql); db.exec(sql);
const r = row(db, SID);
ok((r.handoff_notes.match(/CLOSEOUT-2 \(2026-10-26\)/g) || []).length === 1 && (r.summary.match(/CLOSEOUT-2 \(2026-10-26\)/g) || []).length === 1, "applied twice: the second closeout is appended once", [r.handoff_notes.length, r.summary.length]);
ok(r.summary.startsWith("S0\n") && r.decisions_made.startsWith("D0\n") && r.infrastructure_changes.startsWith("I0\n") && r.handoff_notes.startsWith("H0\n") && r.commits.startsWith("#1 #2 "), "the first closeout's text is the prefix of every appended column");
ok(r.total_tasks === 33 && r.completed_tasks === 31 && Math.abs(r.execution_ratio - 31 / 33) < 0.01, "the task counts and the ratio agree (31 of 33)", [r.total_tasks, r.completed_tasks, r.execution_ratio]);
ok(r.completed_at > "2026-10-26T09:00:00Z" && r.started_at === "2026-10-26T06:20:00Z", "completed_at moves forward and started_at stays", [r.started_at, r.completed_at]);
ok(JSON.stringify(row(db, "other-session")) === JSON.stringify((() => { const d = new DatabaseSync(":memory:"); d.exec(DDL); seed(d, "other-session"); return row(d, "other-session"); })()), "another session's row is untouched");
// the text names what the owner needs to know and holds none of the shapes the doctrine scan reads in a handoff
const txt = [r.summary, r.decisions_made, r.handoff_notes].join("\n");
ok(/1000419/.test(txt) && /QNFO-AI-STREAM-SPEND-TWIN-1/.test(txt) && /docs\/root-cause-contract/.test(txt) && /not landed/.test(txt), "it names the issue left open, the follow-ups and where the kept design lives");
ok(!/\b(if you want|tell me to|let me know if|shall I|would you like|you could|needs you to|you should|you can|your call)\b/i.test(txt), "no conditional offer or 'you' as the actor in the appended text", txt.match(/\b(if you want|tell me to|let me know if|shall I|would you like|you could|needs you to|you should|you can|your call)\b/i));
// the backup holds the row as it was, and the Rollback restores it exactly
const bak = db.prepare("SELECT * FROM bak_20261026_session_record_closeout2 WHERE session_id = ?").get(SID);
ok(bak && bak.summary === "S0" && bak.total_tasks === 25 && bak.completed_at === "2026-10-26T09:00:00Z", "the backup table holds the row before the change", bak);
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
const back = row(db, SID);
ok(JSON.stringify(back) === JSON.stringify(bak), "the Rollback line restores the row exactly", back);
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
ok(JSON.stringify(row(db, SID)) === JSON.stringify(bak), "a second Rollback changes nothing (the marker is gone)");
// no row for the session: nothing happens, the file still applies
const none = new DatabaseSync(":memory:");
none.exec(DDL); seed(none, "other-session");
let threw = null; try { none.exec(sql); } catch (e) { threw = e; }
ok(!threw && none.prepare("SELECT COUNT(*) AS n FROM session_records").get().n === 1, "with no row for the session the file applies and changes nothing", threw && String(threw));
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
