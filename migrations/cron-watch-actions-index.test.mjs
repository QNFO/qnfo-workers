import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-15-cron-watch-actions-index.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE cron_watch_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    action TEXT NOT NULL, fault_key TEXT, issue_id INTEGER, note TEXT);
  INSERT INTO agent_issues VALUES (1, 'CRON-FAULT-1: a', 'closed'), (2, 'CRON-FAULT-1: b', 'closed'), (3, 'CRON-FAULT-1: c', 'open');
  INSERT INTO cron_watch_actions (action, issue_id) VALUES ('filed', 1), ('filed', 2), ('closed-seen', 2), ('filed', 3);
`);
const step = `SELECT a.id FROM agent_issues a WHERE a.title LIKE 'CRON-FAULT-1: %' AND a.status <> 'open' AND EXISTS (SELECT 1 FROM cron_watch_actions w
  WHERE w.issue_id = a.id AND w.action = 'filed' AND w.id > COALESCE((SELECT MAX(w2.id) FROM cron_watch_actions w2 WHERE w2.issue_id = a.id
  AND w2.action = 'closed-seen'), 0)) ORDER BY a.id`;
const before = db.prepare(step).all().map((r) => r.id);
db.exec(migration);
db.exec(migration); // idempotent
const after = db.prepare(step).all().map((r) => r.id);
assert.deepEqual(after, before, "the index changes no result");
assert.deepEqual(after, [1], "only the closed issue with a newer 'filed' than 'closed-seen' is picked");
const plan = db.prepare("EXPLAIN QUERY PLAN " + step).all().map((r) => r.detail).join("\n");
assert.match(plan, /idx_cron_watch_actions_issue_action/, "the correlated subqueries search the new index:\n" + plan);
assert.doesNotMatch(plan, /SCAN w\b|SCAN w2\b/, "no per-issue table scan of cron_watch_actions:\n" + plan);
console.log("ok cron-watch-actions-index");
