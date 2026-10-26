// ERRATA-ISSUE-NOTES-1 offline suite: replays migrations/2026-10-26-errata-issue-notes.sql on SQLite.
// Proves: the dated note is appended to exactly the five issues it names (100449, 1000019, 100456, 1000002, 1000094) after their own text, once
// (a second run changes nothing), no status, priority or probe line is touched, and an unrelated issue is left alone.
// Run: node migrations/errata-issue-notes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-errata-issue-notes.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const body = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const stmts = []; { let cur = "", q = false; for (const c of body) { if (c === "'") q = !q; if (c === ";" && !q) { if (cur.trim()) stmts.push(cur.trim()); cur = ""; } else cur += c; } }
ok(stmts.length === 3 && stmts.every((s) => /^UPDATE agent_issues SET description = description \|\|/.test(s)), "three description appends and nothing else", stmts.map((s) => s.slice(0, 40)));
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority TEXT)");
const ins = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, 'open', 'critical')");
for (const id of [100449, 1000019, 100456, 1000002, 1000094, 1000293]) ins.run(id, "t" + id, "original " + id + "\ncode-probe: {\"paths\": [\"x\"], \"contains\": \"y\"}");
const run = () => { for (const s of stmts) db.exec(s); };
const snap = () => JSON.stringify(db.prepare("SELECT * FROM agent_issues ORDER BY id").all());
run();
const rows = db.prepare("SELECT * FROM agent_issues ORDER BY id").all();
const by = Object.fromEntries(rows.map((r) => [r.id, r]));
for (const id of [100449, 1000019, 100456, 1000002, 1000094]) {
  ok(by[id].description.startsWith("original " + id) && by[id].description.includes("SESSION-RESEARCH-ERRATA-NOTES 2026-10-26") && by[id].status === "open" && by[id].priority === "critical", "issue " + id + ": note appended after its own text, status and priority kept");
  ok(by[id].description.split("code-probe: {").length === 2, "issue " + id + ": its probe line is not duplicated");
}
ok(by[1000293].description === "original 1000293\ncode-probe: {\"paths\": [\"x\"], \"contains\": \"y\"}", "an issue the file does not name is untouched");
const once = snap(); run();
ok(snap() === once, "a second run changes nothing");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
