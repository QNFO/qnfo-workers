// TRIGGER-DONE-CRITERIA-1 offline suite: runs migrations/2026-10-19-trigger-done-criteria.sql on SQLite. Proves: the three action texts state the
// threshold their trigger judges (2 h, 2 h, 1.5) and keep the rest of the prose, thresholds and operators do not move, a row edited since is
// never overwritten, a second apply writes nothing, the backup holds the old rows and the Rollback header restores them, and the decision_log
// row carries a parseable prediction.
// Run: node migrations/trigger-done-criteria.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-trigger-done-criteria.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const A410 = "Pillar autonomy. Median time to close (30d) is above 48h. Take the oldest open classes first. Definition of done: the metric is back inside its threshold.";
const A3464 = "Pillar autonomy (doctrine rev 5 sections 3 and 24). Group the closes of 7 days by title prefix. Do not close issues to lower this metric. Done = mttr_h_7d <= 24 at two refreshes.";
const A5708 = "Pillar autonomy (owner directive 2026-10-13). Read SELECT event, COUNT(*) FROM issue_lifecycle. Levers in order: (1) reopens. Done: issue_drain_ratio_24h >= 1 at two refreshes.";

function fresh(edit5708) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT, created_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched TEXT);`);
  const ins = db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold, action, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)");
  ins.run(410, "issue_mttr_h_30d", "gt", 2, A410, "PERFORMANCE-LOOP-1 2026-10-02 | SLA-120M-2 2026-10-14: threshold 2 h = 120 minutes (was 48.0 h)");
  ins.run(3464, "mttr_h_7d", "gt", 2, A3464, "DOCTRINE-REV5-1 | SLA-120M-2 2026-10-14: threshold 2 h = 120 minutes (was 24.0 h)");
  ins.run(5708, "issue_drain_ratio_24h", "lt", 1.5, edit5708 || A5708, "REMEDIATION-2X-1");
  ins.run(378, "code_task_success_rate_30d", "lt", 0.5, "Pillar autonomy. Done: back inside its threshold.", null);
  return db;
}
const row = (db, id) => db.prepare("SELECT * FROM analytics_metric_triggers WHERE id = ?").get(id);

const db = fresh();
const before378 = row(db, 378);
db.exec(sql);
const r410 = row(db, 410), r3464 = row(db, 3464), r5708 = row(db, 5708);
ok(/above 2 h \(SLA-120M-2, 2026-10-14: the trigger threshold is 120 minutes, it was 48 h\)\./.test(r410.action) && !/48h\./.test(r410.action), "410 states the 2 h threshold", r410.action);
ok(r410.action.includes("Take the oldest open classes first.") && r410.action.includes("Definition of done: the metric is back inside its threshold."), "410 keeps the rest of the prose");
ok(r3464.action.endsWith("Done = mttr_h_7d <= 2 (SLA-120M-2, 2026-10-14: the trigger threshold is 2 h, it was 24 h) at two refreshes.") && !/<= 24 /.test(r3464.action), "3464 definition of done is the 2 h threshold", r3464.action);
ok(r3464.action.includes("Do not close issues to lower this metric."), "3464 keeps the guard sentence");
ok(r5708.action.endsWith("Done: issue_drain_ratio_24h >= 1.5 (the trigger threshold, REMEDIATION-2X-1: issues resolved at 1.5x their accumulation) at two refreshes."), "5708 definition of done is the 1.5 threshold", r5708.action);
ok(r5708.action.includes("Levers in order: (1) reopens."), "5708 keeps the levers");
ok(r410.threshold === 2 && r3464.threshold === 2 && r5708.threshold === 1.5 && r410.operator === "gt" && r3464.operator === "gt" && r5708.operator === "lt", "thresholds and operators do not move");
ok(r410.enabled === 1 && r3464.enabled === 1 && r5708.enabled === 1, "no trigger is disabled");
ok(JSON.stringify(row(db, 378)) === JSON.stringify(before378), "a trigger outside the three is untouched");
ok(r410.notes.includes("PERFORMANCE-LOOP-1") && r410.notes.includes("TRIGGER-DONE-CRITERIA-1") && r5708.notes.startsWith("REMEDIATION-2X-1 | TRIGGER-DONE-CRITERIA-1"), "notes keep their history and gain one entry");

const bak = db.prepare("SELECT id, action FROM bak_20261019_trigger_done ORDER BY id").all();
ok(bak.length === 3 && bak[0].id === 410 && bak[0].action === A410 && bak[1].action === A3464 && bak[2].action === A5708, "the backup holds the three old rows", bak.map((b) => b.id));

const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].action.startsWith("TRIGGER-DONE-CRITERIA-1:"), "one decision_log row", dl.length);
ok(/^[a-z0-9_]+ (>=|<=|>|<) [0-9.]+ within [0-9]+ h$/.test(dl[0].predicted_outcome), "the prediction parses as metric op number within N h", dl[0].predicted_outcome);
ok(dl[0].rollback_path && dl[0].capability_gain && dl[0].blast_radius, "the row names its rollback, capability gain and blast radius");

const snap = JSON.stringify([row(db, 410), row(db, 3464), row(db, 5708)]);
db.exec(sql);
ok(JSON.stringify([row(db, 410), row(db, 3464), row(db, 5708)]) === snap && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "a second apply writes nothing");

// A row edited since is not overwritten: the old text is gone from 5708, so the statement does not match.
const edited = "Pillar autonomy. Someone rewrote this. Done: issue_drain_ratio_24h >= 1.4 at two refreshes.";
const db2 = fresh(edited);
db2.exec(sql);
ok(row(db2, 5708).action === edited && row(db2, 5708).notes === "REMEDIATION-2X-1", "an edited row is left alone, notes included", row(db2, 5708));
ok(/Done = mttr_h_7d <= 2 /.test(row(db2, 3464).action), "the other rows still change");

// The Rollback header restores action and notes.
const rb = /^-- Rollback: (.+)$/m.exec(sql);
ok(!!rb, "the migration has a Rollback line");
if (rb) {
  db.exec(rb[1]);
  const back = [row(db, 410), row(db, 3464), row(db, 5708)];
  ok(back[0].action === A410 && back[1].action === A3464 && back[2].action === A5708, "the Rollback line restores the action text");
  ok(back[0].notes.startsWith("PERFORMANCE-LOOP-1") && !back[0].notes.includes("TRIGGER-DONE-CRITERIA-1"), "the Rollback line restores the notes");
}
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "APPLY-BY and DB headers");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP, so no BACKUP header is owed");
console.log(`trigger-done-criteria: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
