import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const migration = read("./2026-11-01-owner-dispatch-qualified.sql");
const sql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const gateMigration = read("./2026-10-20-human-items-automatic.sql");
const gateSql = gateMigration.match(/CREATE VIEW v_human_action_gate AS[\s\S]+?;/)?.[0];
const db = new DatabaseSync(":memory:");
let pass = 0;
let fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value)));
  }
};

db.exec(`
  CREATE TABLE fleet_tick (ts TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, source TEXT, created_at INTEGER);
  CREATE TABLE human_actions (
    id INTEGER PRIMARY KEY, slug TEXT, status TEXT, source TEXT, title TEXT,
    why TEXT, action TEXT, default_in_effect TEXT, created_at TEXT
  );
  CREATE TABLE metric_registry (
    metric TEXT PRIMARY KEY, formula TEXT, source_of_truth TEXT,
    last_value TEXT, last_refreshed TEXT, state TEXT
  );
  CREATE TABLE analytics_metric_triggers (
    id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, action TEXT, notes TEXT
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT,
    outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT,
    predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
  CREATE VIEW v_issue_initiation AS SELECT id, source, created_at, 1 AS self_initiated FROM agent_issues;
`);
if (!gateSql) throw new Error("could not load the current owner gate view");
db.exec(gateSql);
db.exec(`
  CREATE VIEW v_doctrine_headline AS
  SELECT 100 AS tick_completion_24h, 100 AS initiation_rate_7d,
    (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id
     WHERE g.gate = 'owner' AND h.created_at >= datetime('now', '-7 days')) AS owner_dispatch_7d;
  INSERT INTO metric_registry VALUES ('owner_dispatch_7d', 'all owner cards', 'human_actions', '15', 'before', 'MEASURED');
  INSERT INTO analytics_metric_triggers VALUES (3454, 'owner_dispatch_7d', 'Owner dispatch', 'old action', 'old notes');
`);
const insert = db.prepare(`
  INSERT INTO human_actions (id, slug, status, source, title, why, action, default_in_effect, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date().toISOString();
const old = new Date(Date.now() - 8 * 86400000).toISOString();
for (let id = 1; id <= 15; id++) {
  insert.run(id, `valid-${id}`, id % 2 ? "open" : "resolved", "bp26-catalogue",
    `Owner decision ${id}`, "IDENTITY-BOUND: the owner must make this choice",
    "Keep the stated default", "No change unless the owner chooses otherwise", now);
}
insert.run(16, "soft-marker", "dismissed", "session:test",
  "Post a public update to the profile", "No identity-bound marker", "Handle the task", "", now);
insert.run(17, "missing-default", "open", "session:test",
  "Owner-only step", "IDENTITY-BOUND: this step requires the owner", "Handle the task", "", now);
insert.run(18, "duplicate-a", "resolved", "session:test",
  "Payment decision: approve the model budget", "Same spend decision", "Choose", "Keep current spend", now);
insert.run(19, "duplicate-b", "dismissed", "session:test",
  "Payment decision: fund the model", "Same spend decision", "Choose", "Keep current spend", now);
insert.run(20, "outside-window", "open", "session:test",
  "Payment decision outside the window", "No marker", "Choose", "", old);
insert.run(21, "fleet-card", "open", "session:test",
  "Fix the public worker.js account flow", "Pull request will make the change", "Handle the code task", "", now);
insert.run(22, "owner-request", "open", "owner-request-issue",
  "Decision about a public account", "Closure notice", "Review", "", now);

db.exec(sql);
const measure = () => db.prepare("SELECT owner_dispatch_7d FROM v_doctrine_headline").get().owner_dispatch_7d;
ok(measure() === 4, "only unqualified owner-gated cards in the seven-day window count, independent of status", measure());
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'owner_dispatch_7d'").get().last_value === "4",
  "the metric registry refreshes immediately from the corrected view");
ok(db.prepare("SELECT title, action, notes FROM analytics_metric_triggers WHERE id = 3454").get().action.includes("identity-bound:"),
  "trigger instructions diagnose the same unqualified-card condition");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'OWNER-DISPATCH-QUALIFIED-1:%'").get().n === 1,
  "the metric decision is recorded once");

db.exec(sql);
ok(measure() === 4 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1,
  "reapplying the migration preserves results and does not duplicate the decision");

if (!rollback) throw new Error("migration has no rollback");
db.exec(rollback);
ok(measure() === 19, "rollback restores the original all-owner-card metric");
ok(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'owner_dispatch_7d'").get().formula === "all owner cards",
  "rollback restores the prior metric definition");
ok(db.prepare("SELECT title, action FROM analytics_metric_triggers WHERE id = 3454").get().title === "Owner dispatch",
  "rollback restores the prior trigger wording");

console.log(`owner-dispatch-qualified: ${pass} passed, ${fail} failed`);
db.close();
process.exit(fail ? 1 : 0);
