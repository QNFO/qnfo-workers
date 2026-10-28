// Offline test for migrations/2026-10-28-cluster-g-plain-errata.sql: headers, one issue and one config row after a double apply, one decision_log row,
// and the code-anchor occurs once in qnfo-fleet-control/worker.js (or the fix marker is already there).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-cluster-g-plain-errata.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql) && /^-- BACKUP: ops_config$/m.test(sql), "migration headers present");
ok(!/[^\x00-\x7f]/.test(sql), "the file is ASCII");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE decision_log (id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT)");
db.exec(sql);
db.exec(sql);
const rows = db.prepare("SELECT title, description FROM agent_issues").all();
ok(rows.length === 1, "one issue after a double apply", rows.length);
ok(db.prepare("SELECT value FROM ops_config WHERE key = 'research_errata_ready_cap'").get().value === "24", "the errata cap is registered at 24");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "one decision_log row after a double apply");
ok(db.prepare("SELECT predicted_outcome p FROM decision_log").get().p.includes("224 to 0"), "the decision row states the prediction");
const r = rows[0];
const path = /^code-task: repo=qnfo-workers path=(\S+)$/m.exec(r.description);
const anchor = /^code-anchor: (.+)$/m.exec(r.description);
ok(!!path && !!anchor, "code-task and code-anchor lines");
if (path && anchor) {
  const src = readFileSync(new URL("../" + path[1], import.meta.url), "utf8");
  const n = src.split(anchor[1]).length - 1;
  ok(n === 1 || src.includes("research_errata_ready_cap"), "anchor occurs once, or the fix is already in", n);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
