// OWNER-EXEMPT-METRIC-1 offline suite: applies migrations/2026-10-20-idea-topic-owner-exempt.sql on SQLite (node:sqlite) over fixtures of the three tables it touches.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback), deletes and drops nothing, writes no metric value (only the daily job does), keeps the old formula text and
// appends the continuity note once, is re-runnable, and its Rollback restores the formula and the trigger note text for text; and the closing probe of issue 1947 (the contract's own SQL shape) reads
// the metric the file documents: it FAILS at 0.895 (all sources) and passes at 0.46 (generated) when the other three conditions hold, and fails when the value is stale or a condition is missing.
// Run: node migrations/idea-topic-owner-exempt.test.mjs        (OE_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-20-idea-topic-owner-exempt.sql"), "utf8");
const worker = readFileSync(join(here, "..", "qnfo-cloud-ops", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.OE_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 300 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing (no BACKUP header owed)");
ok(!/SET\s+last_value|SET\s+last_refreshed/i.test(body), "the file writes no metric value (only the daily job does)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(/ideaTopicOwnerSourced/.test(worker) && /OWNER-EXEMPT-METRIC-1/.test(worker), "the worker change this file documents is on this branch (qnfo-cloud-ops ideaTopicOwnerSourced)");

const FORMULA = "Since 2026-10-13 (TOPIC-CLUSTERS-DERIVED-1): share of ACCEPTed idea_proposals in the last 30 days whose idea text falls in the single largest topic cluster.";
const NOTES = "Owner directive 2026-10-04: arXiv QEC must stop dominating. | REPOINTED 2026-10-06.";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, notes TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, decision TEXT, created_at TEXT);`);
  w.prepare("INSERT INTO metric_registry VALUES ('idea_topic_concentration_30d', ?, '0.895', ?)").run(FORMULA, new Date().toISOString());
  w.prepare("INSERT INTO analytics_metric_triggers (metric_key, notes) VALUES ('idea_topic_concentration_30d', ?)").run(NOTES);
  return w;
}
const applied = () => { const w = world(); if (!SKIP) w.exec(body); return w; };

{
  const w = applied();
  const m = w.prepare("SELECT formula, last_value FROM metric_registry").get();
  ok(m.formula.startsWith(FORMULA) && /OWNER-EXEMPT-METRIC-1 2026-10-20/.test(m.formula) && /generated accepts|GENERATED accepts/.test(m.formula) && /all-sources share/.test(m.formula), "the formula keeps its text and appends the definition, the exemption and where the all-sources share lives", m.formula.slice(-200));
  ok(m.last_value === "0.895", "the value is untouched by the file");
  ok(/0\.895/.test(m.formula) && /0\.46/.test(m.formula), "the continuity figures (all sources 0.895, generated about 0.46) are in the formula text");
  ok(/OWNER-EXEMPT-METRIC-1/.test(w.prepare("SELECT notes FROM analytics_metric_triggers").get().notes), "the trigger note records the change");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === (SKIP ? 0 : 1), "one decision_log row");
}

// the closing probe of issue 1947, in the contract's own shape, over a world of accepted rows
const PROBE = "SELECT '1' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = 'idea_topic_concentration_30d') AS REAL) <= 0.5 AND (SELECT julianday('now') - julianday(replace(substr(last_refreshed,1,19),'T',' ')) FROM metric_registry WHERE metric = 'idea_topic_concentration_30d') < 1.1 AND (SELECT COUNT(DISTINCT name) FROM idea_proposals WHERE decision = 'ACCEPT' AND replace(substr(created_at,1,19),'T',' ') >= datetime('now','-30 day')) >= 3 AND EXISTS (SELECT 1 FROM idea_proposals WHERE decision = 'ACCEPT' AND lower(name) LIKE '%owner%' AND replace(substr(created_at,1,19),'T',' ') >= datetime('now','-30 day')) THEN '1' ELSE '0' END AS observed";
{
  const w = applied();
  const add = (name) => w.prepare("INSERT INTO idea_proposals (name, decision, created_at) VALUES (?, 'ACCEPT', datetime('now','-1 day'))").run(name);
  const at = (v, minAgo) => w.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?").run(String(v), new Date(Date.now() - minAgo * 6e4).toISOString());
  const obs = () => w.prepare(PROBE).get().observed;
  add("owner-corpus"); add("auto-scan"); add("intake:arxiv-x");
  at(0.895, 5); ok(obs() === "0", "the probe fails at the all-sources value 0.895 (the metric before the change)");
  at(0.46, 5); ok(obs() === "1", "the probe passes at the generated value 0.46 with three producers and an owner producer");
  at(0.46, 2000); ok(obs() === "0", "a value older than 1.1 days fails (the daily job has not run)");
  at(0.46, 5); w.prepare("DELETE FROM idea_proposals WHERE name = 'intake:arxiv-x'").run(); ok(obs() === "0", "fewer than three distinct producers fails");
  add("intake:arxiv-x"); w.prepare("DELETE FROM idea_proposals WHERE name = 'owner-corpus'").run(); ok(obs() === "0", "no accepted owner producer fails");
  add("owner-corpus"); at(0.5, 5); ok(obs() === "1", "0.50 is the edge and passes (target <= 0.50)"); at(0.501, 5); ok(obs() === "0", "0.501 fails");
}

if (!SKIP) {
  const w = applied();
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM metric_registry").all(), w.prepare("SELECT * FROM analytics_metric_triggers").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
  const once = snap();
  w.exec(body);
  ok(snap() === once, "a second apply changes nothing");
  const pre = world();
  const preSnap = JSON.stringify([pre.prepare("SELECT formula, last_value FROM metric_registry").all(), pre.prepare("SELECT notes FROM analytics_metric_triggers").all()]);
  w.exec(rollback);
  ok(JSON.stringify([w.prepare("SELECT formula, last_value FROM metric_registry").all(), w.prepare("SELECT notes FROM analytics_metric_triggers").all()]) === preSnap, "the Rollback restores the formula and the trigger note text for text");
}
console.log(`idea-topic-owner-exempt (migration): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
