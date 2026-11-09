import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// GAP-SKIP-RETIRED-WORKERS-1: portfolio-gap-action must not file an upgrade for a retired or folded worker.
const migration = readFileSync(new URL("./2026-11-09-gap-skip-retired-workers.sql", import.meta.url), "utf8");
for (const re of [/^-- APPLY-BY: ci$/m, /^-- DB: qnfo-audit$/m, /^-- BACKUP: bak_20261109_gap_skip_retired$/m, /^-- Rollback: /m]) assert.match(migration, re);

const STEP = `INSERT INTO agent_issues (title, status)
   SELECT 'PORTFOLIO-UPGRADE-1: advance compat_date for '||w.worker, 'open'
     FROM worker_compat_state w
    WHERE w.days_behind >= 30 AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=w.worker AND dh.status='success')
    GROUP BY w.worker`;

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE worker_compat_state (worker TEXT, checked_at TEXT, days_behind INTEGER);
  CREATE TABLE deployment_history (resource_name TEXT, status TEXT);
  CREATE TABLE service_registry (service TEXT, state TEXT);
  CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, updated_at TEXT);
  INSERT INTO worker_compat_state VALUES ('live-w', 'x', 100), ('folded-w', 'x', 100);
  INSERT INTO service_registry VALUES ('live-w', 'live'), ('folded-w', 'retired');
`);
db.prepare("INSERT INTO fleet_tasks VALUES ('portfolio-gap-action', ?, 1, '')").run(JSON.stringify({ steps: [{ type: "sql", sql: STEP }] }));
db.exec(migration);
db.exec(migration); // idempotent
assert.equal(db.prepare("SELECT version FROM fleet_tasks").get().version, 2);
for (const s of JSON.parse(db.prepare("SELECT definition FROM fleet_tasks").get().definition).steps) db.exec(s.sql);
assert.deepEqual(db.prepare("SELECT title FROM agent_issues").all().map((r) => r.title), ["PORTFOLIO-UPGRADE-1: advance compat_date for live-w"]);
console.log("gap-skip-retired-workers ok");
