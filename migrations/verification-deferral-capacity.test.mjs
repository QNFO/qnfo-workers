// VERIFICATION-DEFERRED-7D-1 capacity migration suite. Run: node migrations/verification-deferral-capacity.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-11-01-verification-deferral-capacity.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, reliability TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
db.prepare("INSERT INTO capability_ledger VALUES ('verification-deferral-escalation', ?)").run("the sweep files at most 3 issues a tick and 12 in any 24 hours");

let pass = 0, fail = 0;
const ok = (condition, message) => { if (condition) pass++; else { fail++; console.log("FAIL " + message); } };
const header = sql.split("\n").filter((line) => line.startsWith("--"));
ok(header.includes("-- APPLY-BY: ci") && header.includes("-- DB: qnfo-audit"), "migration opts in for the audit database");
ok(header.filter((line) => line.startsWith("-- Rollback:")).length === 1, "migration has one rollback statement");

db.exec(sql);
const reliability = () => db.prepare("SELECT reliability FROM capability_ledger WHERE capability = 'verification-deferral-escalation'").get().reliability;
ok(reliability() === "the sweep files at most 3 issues a tick and 432 in any 24 hours", "capability ledger matches the daily capacity");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'VERIFICATION-DEFERRED-7D-1 capacity:%'").get().n === 1, "capacity change is recorded once");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'VERIFICATION-DEFERRED-7D-1 capacity:%'").get().n === 1, "replay does not duplicate the decision");

const rollback = sql.match(/^-- Rollback: (.+)$/m)?.[1];
ok(rollback, "rollback statement is present");
db.exec(rollback);
ok(reliability() === "the sweep files at most 3 issues a tick and 12 in any 24 hours", "rollback restores the prior ledger value");
console.log(`verification-deferral-capacity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
