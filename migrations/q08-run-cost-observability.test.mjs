import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-25-q08-run-cost-observability.sql", import.meta.url), "utf8");
const lines = sql.split(/\r?\n/);
const header = (key) => lines.find((line) => line.startsWith("-- " + key + ":"));
const rollback = header("Rollback")?.replace(/^-- Rollback:\s*/, "");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE capability_ledger (
    capability TEXT PRIMARY KEY,
    provenance TEXT NOT NULL,
    prerequisites TEXT,
    reliability TEXT,
    acquired_at TEXT NOT NULL,
    last_exercised_at TEXT,
    evidence TEXT NOT NULL
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actor TEXT NOT NULL,
    assumption TEXT NOT NULL,
    action TEXT NOT NULL,
    evidence TEXT NOT NULL,
    outcome TEXT NOT NULL,
    blast_radius TEXT NOT NULL,
    rollback_path TEXT NOT NULL,
    capability_gain TEXT,
    predicted_outcome TEXT,
    reach_gain TEXT,
    surfaces_tested TEXT
  );
`);
let pass = 0, fail = 0;
const ok = (condition, message, detail) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 400)));
  }
};

ok(header("APPLY-BY") === "-- APPLY-BY: ci" && header("DB") === "-- DB: qnfo-audit", "migration opts into CI and names qnfo-audit");
ok(rollback === "DELETE FROM capability_ledger WHERE capability = 'q08-run-stage-attribution'", "rollback removes the reversible capability row only", rollback);
ok(/returned 20 rows/.test(sql) && /not 60/.test(sql) && !/returned 60 rows/.test(sql), "evidence states the actual response sample size, not the requested limit");
let error = null;
try { db.exec(sql); db.exec(sql); } catch (e) { error = String(e?.message || e); }
ok(error === null, "migration replays idempotently", error);
const capability = db.prepare("SELECT * FROM capability_ledger WHERE capability = ?").get("q08-run-stage-attribution");
const decision = db.prepare("SELECT * FROM decision_log WHERE action LIKE 'Q08-RUN-STAGE-ATTRIBUTION-1:%'").get();
ok(capability && /panel_calls/.test(capability.provenance) && /factcheck_calls/.test(capability.provenance), "stage attribution capability is recorded once", capability);
ok(decision && /20 rows/.test(decision.evidence) && /verify_calls/.test(decision.action) && decision.outcome === "pending post-deploy measurement", "decision preserves the evidence and leaves the live outcome pending", decision);
db.exec(rollback);
ok(db.prepare("SELECT COUNT(*) n FROM capability_ledger").get().n === 0, "rollback removes the capability row");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "append-only decision history remains after rollback");

console.log("q08-run-cost-observability.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
