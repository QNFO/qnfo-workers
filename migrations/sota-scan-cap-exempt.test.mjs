// SOTA-SCAN-CAP-1: replays the cap trigger, then the exemption migration. Proves a roadmap-*-sota-* and roadmap-*-comp-* scan insert passes at the cap while other
// program-manager requests are still ignored and non-manager requesters are untouched; the file re-applies to one trigger.
// Run: node migrations/sota-scan-cap-exempt.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-12-sota-scan-cap-exempt-3.sql", import.meta.url), "utf8");
const old = readFileSync(new URL("./2026-11-05-cost-levers-1.sql", import.meta.url), "utf8");
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
for (const h of ["-- APPLY-BY: ci", "-- DB: qnfo-audit", "-- Rollback:", "-- BACKUP: bak_20261112_manager_cap_trigger_3"]) ok(sql.includes(h), "header " + h);
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'run', prompt TEXT, instance TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
  CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
  CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT, window_note TEXT, enabled INTEGER);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`);
db.exec(old);
for (const f of ["2026-11-12-sota-scan-cap-exempt.sql", "2026-11-12-sota-scan-cap-exempt-2.sql"]) db.exec(readFileSync(new URL("./" + f, import.meta.url), "utf8")); db.exec(sql); db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='cf_agent_requests_manager_cap_bi'").get().n === 1, "one cap trigger");
const ins = (r, i) => { const b = db.prepare("SELECT COUNT(*) n FROM cf_agent_requests").get().n; db.prepare("INSERT INTO cf_agent_requests (requester, instance) VALUES (?, ?)").run(r, i); return db.prepare("SELECT COUNT(*) n FROM cf_agent_requests").get().n - b; };
for (let i = 0; i < 48; i++) ins("program-manager:QNFO.OPS", "doer-" + i);
ok(ins("program-manager:QNFO.OPS", "doer-x") === 0, "other manager request ignored at the cap");
ok(ins("program-manager:QNFO.OPS", "roadmap-QNFO.OPS-sota-20261112") === 1, "sota scan passes at the cap");
ok(ins("program-manager:QNFO.RSCH", "roadmap-QNFO.RSCH-comp-20261112") === 1, "market scan passes at the cap");
ok(ins("program-manager:QNFO.OPS", "roadmap-QNFO.OPS-20261112") === 0, "ordinary roadmap request still capped");
ok(ins("program-manager:QNFO.OPS", "roadmap-QNFO.OPS-sota-doer-42") === 0, "lookalike instance still capped");
ok(ins("program-manager:QNFO.OPS", "ROADMAP-QNFO.OPS-SOTA-20261112") === 0, "case variant still capped");
ok(db.prepare("SELECT COUNT(*) n FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-comp-20261112'").get().n === 1, "scan row stored");
ok(ins("product-manager:brand", "compete-brand-20261112") === 1, "non-manager requester untouched");
ok(ins("program-manager:QNFO.OPS", "roadmap-QNFO.OPS-sota-abc123") === 0, "non-numeric suffix capped");
ok(ins("program-manager:QNFO.OPS", "roadmap-QNFO.OPS-sota-2026-1-1") === 0, "malformed date capped");
ok(db.prepare("SELECT COUNT(*) n FROM cf_agent_requests_dropped").get().n >= 5, "every dropped request is logged");
console.log("sota-scan-cap-exempt.test.mjs: " + pass + " checks passed");
