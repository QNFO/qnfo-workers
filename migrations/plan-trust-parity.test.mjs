// PLAN-TRUST-PARITY-1 migration suite (agent_issues 100303). Real SQL on node:sqlite: the relapse prefixes are appended once behind a backup
// row, the untrusted verdicts are re-armed once, the decision row is written once, and the Rollback line restores the previous state.
// Run: node --no-warnings migrations/plan-trust-parity.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "2026-10-20-plan-trust-parity.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } };

const LIVE = "qnfo-fleet-dashboard:owner-request|OWNER-TASK-,claude-session*,session*,qnfo-evolve|EVOLVE-1";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT);
  CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT, detail TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
db.prepare("INSERT INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', ?)").run(LIVE);
for (let i = 1; i <= 6; i++) db.prepare("INSERT INTO agent_issues VALUES (?, ?)").run(i, i === 6 ? "closed" : "open");
const plansIn = [[1, "untrusted"], [2, "untrusted"], [3, "not-code"], [4, "queued"], [5, "untrusted"], [6, "untrusted"]];
for (const [id, o] of plansIn) db.prepare("INSERT INTO issue_plans VALUES (?, '2026-10-19T09:00:00Z', ?, 'source x is not a trusted origin')").run(id, o);

const apply = () => { for (const st of sql.split(/;\s*\n/).map((s) => s.replace(/^(--.*\n)+/gm, "").trim()).filter(Boolean)) db.exec(st); };
apply();
const v = () => db.prepare("SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources'").get().value;
ok(v().startsWith(LIVE + ",") && v().includes("qnfo-fleet-control|METRIC-FIX-RELAPSED-1:") && v().includes("qnfo-fleet-control|METRIC-REGRESSION-1:"), "1 the two relapse prefixes are appended to the live list", v());
ok(db.prepare("SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261020T0630Z'").get().value === LIVE, "2 the backup row holds the previous list");
const by = Object.fromEntries(db.prepare("SELECT issue_id, planned_at, outcome, detail FROM issue_plans").all().map((r) => [r.issue_id, r]));
ok([1, 2, 5].every((i) => by[i].planned_at === "2000-01-01T00:00:00Z" && /PLAN-TRUST-PARITY-1 re-arm/.test(by[i].detail)), "3 open untrusted verdicts are re-armed with the old reason kept", by);
ok(by[3].planned_at === "2026-10-19T09:00:00Z" && by[4].planned_at === "2026-10-19T09:00:00Z" && by[6].planned_at === "2026-10-19T09:00:00Z", "4 not-code, queued and closed-issue rows are untouched", by);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PLAN-TRUST-PARITY-1:%'").get().n === 1 && /issues_over_24h_no_doer <= \d+ within \d+ h/.test(db.prepare("SELECT predicted_outcome AS p FROM decision_log").get().p), "5 one decision row with a parseable prediction");
const before = v();
apply();
ok(v() === before && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "6 a second apply changes nothing (idempotent)");
ok(!/\bDELETE\b|\bDROP\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "7 the file runs no DELETE or DROP");

// Rollback line restores the list
const rb = /^-- Rollback: (.*)$/m.exec(sql)[1];
for (const st of rb.split(/;\s*/).filter(Boolean)) db.exec(st);
ok(v() === LIVE && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 0 && db.prepare("SELECT outcome FROM issue_plans WHERE issue_id = 1").get().outcome === "untrusted", "8 the Rollback line restores the list, drops the decision row and keeps the verdict untrusted");

console.log("plan-trust-parity (migration): " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
