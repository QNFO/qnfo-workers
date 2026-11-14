// D1-ROWS-READ-COST-8 item 3: proves migrations/2026-11-13-d1-reads-cut-8.sql serves v_issue_age_ladder's live_tasks scan from the partial index idx_code_tasks_live.
// It reads the NOT IN list from the view's own migration (2026-11-01-issue-age-live-doers.sql) and the index's WHERE from the new file, requires them to match exactly
// (a partial index applies only when the query's WHERE implies it), then checks the plan in node:sqlite and that the live rows are unchanged.
// Run: node --no-warnings migrations/d1-reads-cut-8.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const view = readFileSync(new URL("./2026-11-01-issue-age-live-doers.sql", import.meta.url), "utf8");
const mig = readFileSync(new URL("./2026-11-13-d1-reads-cut-8.sql", import.meta.url), "utf8");
const live = /live_tasks AS MATERIALIZED \(\s*SELECT id, goal FROM code_tasks\s*WHERE (status NOT IN \([^)]*\))\s*AND ([\s\S]*?)\r?\n\),/.exec(view);
ok(!!live, "the view's live_tasks clause is found");
const idx = /WHERE (status NOT IN \([^)]*\));/.exec(mig);
ok(!!idx, "the index's WHERE is found");
ok(live && idx && live[1].replace(/\s+/g, " ") === idx[1].replace(/\s+/g, " "), "the index WHERE equals the view's NOT IN list", { view: live && live[1], index: idx && idx[1] });

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, updated_at TEXT, lease_until TEXT); CREATE INDEX idx_code_tasks_status ON code_tasks (status);");
const statuses = ["merged", "superseded", "failed", "closed", "publish_failed", "queued", "running"];
for (let i = 0; i < 400; i++) {
  const s = statuses[i % statuses.length];
  db.exec(`INSERT INTO code_tasks VALUES ('t${i}', 'g${i}', '${s}', strftime('%Y-%m-%dT%H:%M:%SZ','now','-${i % 3 === 0 ? 300 : 10} minutes'), ${i % 11 === 0 ? "strftime('%Y-%m-%dT%H:%M:%SZ','now','+30 minutes')" : "NULL"})`);
}
const q = live ? "SELECT id, goal FROM code_tasks WHERE " + live[1] + " AND " + live[2] : "SELECT 1";
const rowsOf = () => db.prepare(q).all().map((r) => r.id).sort();
const before = rowsOf();
const planBefore = db.prepare("EXPLAIN QUERY PLAN " + q).all().map((r) => r.detail).join(" | ");
ok(/SCAN code_tasks(?! USING)/.test(planBefore), "before: live_tasks scans the whole table", planBefore);

db.exec(mig);
const planAfter = db.prepare("EXPLAIN QUERY PLAN " + q).all().map((r) => r.detail).join(" | ");
ok(/USING (COVERING )?INDEX idx_code_tasks_live/.test(planAfter), "after: live_tasks reads the partial index", planAfter);
const after = rowsOf();
ok(JSON.stringify(after) === JSON.stringify(before) && after.length > 0, "the live rows are unchanged", { before: before.length, after: after.length });
db.exec(mig);
ok(true, "the migration re-applies (IF NOT EXISTS)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
