import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-stuck-items-exclude-research-backlog.sql", import.meta.url), "utf8");
const ok = (condition, message, value) => {
  if (!condition) {
    console.error("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value)));
    process.exitCode = 1;
  }
};

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY);
  CREATE TABLE research_review_seen (id TEXT PRIMARY KEY, first_seen TEXT);
  CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, claimed_at TEXT, recover_count INTEGER, error TEXT);
  CREATE TABLE queue_sla_actions (stuck_type TEXT, n INTEGER, note TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE intents (id TEXT, status TEXT, created_at TEXT, noise INTEGER, triaged_at TEXT, triage_decision TEXT, triage_rationale TEXT);
  CREATE TABLE outreach_queue (id TEXT, status TEXT, created_at TEXT, error TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, target TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
  CREATE TABLE analytics_metric_triggers (metric_key TEXT PRIMARY KEY, action TEXT);
  CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY);
  CREATE VIEW v_stuck_summary AS
    SELECT 1 research_review_error, 1 research_head_stalled, 192 research_queued_180m,
           1 intents_pending, 1 outreach_waiting, 1 code_tasks_stalled, 11 issues_unprobed_60m,
           1 issues_without_doer_3h;
  INSERT INTO metric_registry (metric, formula, target, last_value) VALUES
    ('stuck_items_over_sla', 'old formula', '0', '198'),
    ('issues_unprobed_60m', 'separate metric', '0', '11');
  INSERT INTO analytics_metric_triggers VALUES ('stuck_items_over_sla', 'old action');
  INSERT INTO queue_sla VALUES ('research-queued-age');
  INSERT INTO ops_config VALUES ('queue_sla_autofix', 'on');
  INSERT INTO intents VALUES ('stale-intent', 'pending', '2000-01-01 00:00:00', 0, NULL, NULL, NULL);
`);
  db.exec("CREATE TRIGGER queue_sla_tick_10m AFTER INSERT ON fleet_tick BEGIN SELECT 1; END;");

function statements(text) {
  const out = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("--")) continue;
    current += line + "\n";
    if (/;\s*$/.test(line) && (current.match(/'/g) || []).length % 2 === 0) {
      out.push(current.trim());
      current = "";
    }
  }
  return out;
}

const triggerBlock = migration.match(/^DROP TRIGGER IF EXISTS queue_sla_tick_10m;\s*CREATE TRIGGER queue_sla_tick_10m[\s\S]*?\nEND;/m)?.[0];
ok(!!triggerBlock, "migration replaces the SLA trigger");
const rest = statements(migration.replace(triggerBlock, ""));
const backup = rest.find((statement) => statement.startsWith("CREATE TABLE IF NOT EXISTS bak_20261101_queue_sla_tick"));
ok(!!backup, "migration saves the existing trigger before dropping it");
db.exec(backup);
ok(db.prepare("SELECT sql FROM bak_20261101_queue_sla_tick").get().sql.includes("SELECT 1"), "backup preserves the pre-migration trigger");
db.exec(triggerBlock);
for (const statement of rest) if (statement !== backup) db.exec(statement);

const metric = db.prepare("SELECT formula, target, last_value FROM metric_registry WHERE metric = 'stuck_items_over_sla'").get();
ok(metric.last_value === "6", "initial metric refresh excludes controlled backlog but retains true stuck columns", metric);
ok(metric.target === "0", "target remains zero for true stuck items", metric);
ok(metric.formula.includes("research_ready_cap") && metric.formula.includes("research_deferred_pool"), "formula documents capacity and its independent monitor", metric.formula);
ok(!metric.formula.includes("sum of v_stuck_summary columns except issues_unprobed_60m ("), "obsolete formula is replaced");

db.prepare("INSERT INTO fleet_tick DEFAULT VALUES").run();
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'stuck_items_over_sla'").get().last_value === "6", "ten-minute refresh excludes only research_queued_180m");
ok(db.prepare("SELECT status FROM intents WHERE id = 'stale-intent'").get().status === "rejected", "existing intent SLA fix still runs");
ok(db.prepare("SELECT COUNT(*) AS n FROM queue_sla_actions WHERE stuck_type = 'intent-untriaged'").get().n === 1, "existing SLA fix ledger remains active");
ok(db.prepare("SELECT action FROM analytics_metric_triggers WHERE metric_key = 'stuck_items_over_sla'").get().action.includes("controlled backlog"), "breach action distinguishes controlled backlog");

const source = migration.match(/-- Rollback: (.*)/)?.[1] || "";
ok(source.includes("research_queued_180m + intents_pending"), "rollback restores the old metric aggregation");
ok(migration.includes("-- APPLY-BY: ci") && migration.includes("-- DB: qnfo-audit") && migration.includes("-- BACKUP: bak_20261101_queue_sla_tick"), "migration opts into CI application with a trigger backup");
db.exec(source);
db.prepare("INSERT INTO fleet_tick DEFAULT VALUES").run();
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'stuck_items_over_sla'").get().last_value === "198", "rollback restores the original aggregation");

console.log("stuck-items-exclude-research-backlog: " + (process.exitCode ? "failed" : "passed"));
