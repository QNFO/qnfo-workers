import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-roster-capability-ratchet.sql", import.meta.url), "utf8");
const header = migration.split("\n").filter((line) => line.startsWith("--"));
const body = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = header.find((line) => line.startsWith("-- Rollback:"))?.slice("-- Rollback:".length).trim();
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

ok(header.some((line) => /^-- APPLY-BY: ci\s*$/.test(line)), "migration opts in to CI");
ok(header.some((line) => /^-- DB: qnfo-audit\s*$/.test(line)), "migration targets qnfo-audit");
ok(Boolean(rollback), "migration has a rollback");
ok(!/\b(DELETE|DROP)\b/i.test(body), "migration does not delete or drop data");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+decision_log\b/i.test(body), "decision_log is append-only");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, target TEXT, last_value TEXT, last_refreshed TEXT);
  CREATE TABLE analytics_metric_triggers (metric_key TEXT PRIMARY KEY, threshold REAL, action TEXT);
  CREATE TABLE decision_log (
    actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
    rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
`);
const previousTarget = "0; trigger floor is the first measured value";
const previousAction = "Pillar core. The threshold is the count measured when this trigger was created; the target is 0. Read SELECT capability, MAX(executor) FROM v_executor_roster WHERE kind IN ('worker', 'model') GROUP BY capability HAVING SUM(healthy = 1) = 1 and compare with spof_registry.";
db.prepare("INSERT INTO metric_registry VALUES (?, ?, ?, ?)").run("roster_capabilities_single_executor", previousTarget, "179", "2026-11-01T14:01:25Z");
db.prepare("INSERT INTO analytics_metric_triggers VALUES (?, ?, ?)").run("roster_capabilities_single_executor", 158, previousAction);

db.exec(body);
const target = db.prepare("SELECT target, last_value FROM metric_registry WHERE metric = ?").get("roster_capabilities_single_executor");
const trigger = db.prepare("SELECT threshold, action FROM analytics_metric_triggers WHERE metric_key = ?").get("roster_capabilities_single_executor");
ok(target.target.includes("never above 157") && target.target.includes("0 is not achievable"), "target states the measured ratchet and why zero is impossible");
ok(target.last_value === "179" && Number(target.last_value) > trigger.threshold, "the current breach remains visible and the measured value is unchanged");
ok(trigger.threshold === 157, "the alert fires above the same 157 ratchet");
ok(trigger.action.includes("ratchet target at or below 157") && !trigger.action.includes("target is 0"), "trigger action no longer promises zero");
ok(trigger.action.includes("AND capability NOT LIKE 'worker:%'"), "diagnostic query excludes worker pseudo-capabilities just like the metric formula");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'ROSTER-CAPABILITY-RATCHET-1:%'").get().n === 1, "migration records one decision");

db.exec(body);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'ROSTER-CAPABILITY-RATCHET-1:%'").get().n === 1, "replay does not duplicate the decision");

db.exec(rollback);
const restoredTarget = db.prepare("SELECT target FROM metric_registry WHERE metric = ?").get("roster_capabilities_single_executor").target;
const restoredTrigger = db.prepare("SELECT threshold, action FROM analytics_metric_triggers WHERE metric_key = ?").get("roster_capabilities_single_executor");
ok(restoredTarget === previousTarget, "rollback restores the previous target");
ok(restoredTrigger.threshold === 158 && restoredTrigger.action.includes("target is 0"), "rollback restores the previous threshold and action");
ok(!restoredTrigger.action.includes("AND capability NOT LIKE 'worker:%'"), "rollback restores the previous diagnostic query");

console.log("ROSTER-CAPABILITY-RATCHET-1 checks passed");
