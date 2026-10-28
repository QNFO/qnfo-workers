// BREACH-UNMAPPED-3 offline suite. Run: node migrations/breach-unmapped-3.test.mjs
import { DatabaseSync } from "node:sqlite"; import { readFileSync } from "node:fs";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
INSERT INTO metric_registry VALUES ('breaches_unmapped','9',NULL);
INSERT INTO metric_breach_cause VALUES ('pii_in_logs','measurement','earlier');
CREATE VIEW v_breach_by_cause AS SELECT 'unmapped' AS cause_key, COUNT(*) AS breaches FROM (SELECT 'drift_total' AS m UNION SELECT 'pii_in_logs' UNION SELECT 'brand_new_metric') b WHERE b.m NOT IN (SELECT metric_key FROM metric_breach_cause);`);
const sql = readFileSync(new URL("./2026-10-28-breach-unmapped-3.sql", import.meta.url), "utf8");
db.exec(sql);
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL " + m); } };
ok(db.prepare("SELECT cause_key FROM metric_breach_cause WHERE metric_key='drift_total'").get().cause_key === "structure", "drift_total mapped");
ok(db.prepare("SELECT cause_key FROM metric_breach_cause WHERE metric_key='pii_in_logs'").get().cause_key === "measurement", "an earlier mapping is not overwritten");
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric='breaches_unmapped'").get().last_value === "1", "a metric registered later stays unmapped (no guess)");
const causes = new Set(["spend","issue-backlog","code-loop","owner-routing","publishing","heartbeat","structure","measurement","breach-doctor"]);
const rows = db.prepare("SELECT cause_key FROM metric_breach_cause").all();
ok(rows.every(r => causes.has(r.cause_key)), "every cause_key is a breach_causes key");
ok(rows.length === 34, "34 rows: " + rows.length);
console.log(fail ? fail + " failed" : "all passed"); process.exit(fail ? 1 : 0);
