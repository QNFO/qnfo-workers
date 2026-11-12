// COMPETE-SLOT-1: the compete-* request trigger passes 6 requests in 24 h, logs and ignores the 7th, and leaves other instances alone.
// Run: node migrations/compete-daily-cap.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-13-compete-daily-cap.sql", import.meta.url), "utf8");
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
for (const h of ["-- APPLY-BY: ci", "-- DB: qnfo-audit", "-- Rollback:"]) ok(sql.includes(h), h);
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))");
db.exec("CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT, window_note TEXT, enabled INTEGER)");
db.exec("CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, instance TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))");
db.exec(sql); db.exec(sql);
const ins = (i) => { const b = db.prepare("SELECT COUNT(*) n FROM cf_agent_requests").get().n; db.prepare("INSERT INTO cf_agent_requests (requester, instance) VALUES ('product-manager:x', ?)").run(i); return db.prepare("SELECT COUNT(*) n FROM cf_agent_requests").get().n - b; };
for (let i = 0; i < 6; i++) ok(ins("compete-p" + i + "-20261113") === 1, "compete " + i);
ok(ins("compete-p7-20261113") === 0, "seventh ignored");
ok(db.prepare("SELECT COUNT(*) n FROM cf_agent_requests_dropped").get().n === 1, "drop logged");
ok(db.prepare("SELECT COUNT(*) n FROM control_registry WHERE control = 'compete-request-cap'").get().n === 1, "one control_registry row");
ok(ins("scout-comp-x-2026111320") === 1 && ins("lever-1-2026") === 1, "other instances untouched");
console.log("compete-daily-cap.test.mjs: " + pass + " checks passed");
