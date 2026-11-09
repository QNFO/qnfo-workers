import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// UPGRADE-GAP-FRESH-SNAPSHOT-1: portfolio-gap-action must not file an upgrade against a snapshot older than a compat-advancing deploy.
const migration = readFileSync(new URL("./2026-11-09-upgrade-gap-fresh-snapshot.sql", import.meta.url), "utf8");
for (const re of [/^-- APPLY-BY: ci$/m, /^-- DB: qnfo-audit$/m, /^-- BACKUP: bak_20261109_upgrade_gap_fresh$/m, /^-- Rollback: /m]) assert.match(migration, re);

const ISSUE_STEP = `INSERT INTO agent_issues (title, status)
   SELECT 'PORTFOLIO-UPGRADE-1: advance compat_date for '||w.worker, 'open'
     FROM worker_compat_state w
    WHERE w.days_behind >= 30 AND w.checked_at=(SELECT MAX(w2.checked_at) FROM worker_compat_state w2 WHERE w2.worker=w.worker)
      AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title='PORTFOLIO-UPGRADE-1: advance compat_date for '||w.worker AND a.status='open')
    GROUP BY w.worker`;
const ROADMAP_STEP = `INSERT INTO roadmap_implementation (item) SELECT 'UPG-'||w.worker FROM worker_compat_state w
    WHERE w.days_behind >= 30 AND w.checked_at=(SELECT MAX(w2.checked_at) FROM worker_compat_state w2 WHERE w2.worker=w.worker) AND NOT EXISTS (SELECT 1 FROM roadmap_implementation r WHERE r.item='UPG-'||w.worker)
    GROUP BY w.worker`;

function run(deployAfterSnapshot) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
    CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY, item TEXT);
    CREATE TABLE worker_compat_state (worker TEXT, checked_at TEXT, days_behind INTEGER);
    CREATE TABLE deployment_history (id INTEGER PRIMARY KEY, resource_name TEXT, status TEXT, notes TEXT, deployed_at TEXT);
    CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, updated_at TEXT);
    INSERT INTO worker_compat_state VALUES ('w1', '2026-11-09T04:32:00.000Z', 40);
  `);
  if (deployAfterSnapshot) db.exec("INSERT INTO deployment_history (resource_name, status, notes, deployed_at) VALUES ('w1','success',' compat_date=2026-08-01->2026-11-04 reviewed=2026-11-09','2026-11-09T07:40:00Z')");
  db.prepare("INSERT INTO fleet_tasks VALUES ('portfolio-gap-action', ?, 1, '')").run(JSON.stringify({ steps: [{ type: "sql", sql: ROADMAP_STEP }, { type: "sql", sql: ISSUE_STEP }] }));
  db.exec(migration);
  const steps = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id='portfolio-gap-action'").get().definition).steps;
  for (const s of steps) db.exec(s.sql);
  const out = { issues: db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n, items: db.prepare("SELECT COUNT(*) n FROM roadmap_implementation").get().n, version: db.prepare("SELECT version FROM fleet_tasks").get().version };
  db.exec(migration); // idempotent
  assert.equal(db.prepare("SELECT version FROM fleet_tasks").get().version, 2);
  return out;
}

assert.deepEqual(run(false), { issues: 1, items: 1, version: 2 }, "stale-free snapshot still files");
assert.deepEqual(run(true), { issues: 0, items: 0, version: 2 }, "advance deployed after the snapshot suppresses filing");
console.log("upgrade-gap-fresh-snapshot ok");
