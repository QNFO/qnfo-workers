import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// COMPANION-GUARD-RECORD-1: the migration records the live deploy once and resolves both gaps.
const migration = readFileSync(new URL("./2026-11-09-companion-guard-deploy-record.sql", import.meta.url), "utf8");
for (const re of [/^-- APPLY-BY: ci$/m, /^-- DB: qnfo-audit$/m, /^-- BACKUP: bak_20261109_companion_guard_gaps$/m, /^-- Rollback: /m]) assert.match(migration, re);

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT, status TEXT, notes TEXT);
  CREATE TABLE project_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, session_id TEXT NOT NULL, phase INTEGER NOT NULL, task_id TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT, worker_name TEXT, timestamp TEXT);
  CREATE UNIQUE INDEX ux_pl ON project_ledger(project_id, task_id);
  CREATE TABLE projects (project_code TEXT);
  CREATE TABLE phases (project_code TEXT, phase_number INTEGER);
  CREATE TABLE portfolio_gaps (kind TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT, day TEXT NOT NULL DEFAULT 'd', status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, PRIMARY KEY (kind, entity, day));
  INSERT INTO projects VALUES ('W.qnfo-companion-guard');
  INSERT INTO portfolio_gaps (kind, entity, status) VALUES ('deploy-unrecorded','qnfo-companion-guard','open'), ('project-stale-deploy','W.qnfo-companion-guard','open'), ('deploy-unrecorded','other','open');
`);
db.exec(migration);
db.exec(migration); // idempotent
assert.equal(db.prepare("SELECT COUNT(*) n FROM deployment_history WHERE resource_name='qnfo-companion-guard' AND status='success'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM project_ledger WHERE project_id='W.qnfo-companion-guard' AND action='deployed'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM portfolio_gaps WHERE status='resolved'").get().n, 2);
assert.equal(db.prepare("SELECT status FROM portfolio_gaps WHERE entity='other'").get().status, "open");
console.log("companion-guard-deploy-record ok");
