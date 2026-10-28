// Offline test for migrations/2026-10-28-bp26-edge-security-followups-2.sql: it files the code-task issue once, re-applies idempotently, carries the
// header lines MIGRATION-RUNNER-1 needs, and each code-anchor occurs exactly once in the named file.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-bp26-edge-security-followups-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "migration headers present");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP (so no BACKUP header is needed)");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)");
db.exec(sql);
db.exec(sql);
const rows = db.prepare("SELECT title, description FROM agent_issues ORDER BY id").all();
ok(rows.length === 1, "one issue, once after a double apply", rows.length);
for (const r of rows) {
  const path = /^code-task: repo=qnfo-workers path=(\S+)$/m.exec(r.description);
  const anchor = /^code-anchor: (.+)$/m.exec(r.description);
  ok(!!path && !!anchor, r.title.slice(0, 40) + ": code-task and code-anchor lines", r.description.slice(-160));
  if (path && anchor) {
    const src = readFileSync(new URL("../" + path[1], import.meta.url), "utf8");
    ok(src.split(anchor[1]).length - 1 === 1, path[1] + ": anchor occurs exactly once", anchor[1]);
  }
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
