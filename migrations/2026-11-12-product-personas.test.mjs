import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./2026-11-12-product-personas.sql", import.meta.url), "utf8");

test("personas replay, tick, write briefs and metrics", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, updated_at TEXT);
    INSERT INTO fleet_tasks VALUES ('management-personas', '{"steps":[]}', 1, '');
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class);
    CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes);
    CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
    CREATE TABLE capability_ledger (capability TEXT UNIQUE, provenance, prerequisites, reliability, acquired_at, evidence);
    CREATE TABLE decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested);
    CREATE TABLE persona_briefs (tick TEXT NOT NULL, persona_key TEXT NOT NULL, level TEXT NOT NULL, scope TEXT NOT NULL, verdict TEXT, decision TEXT, summary TEXT NOT NULL, computed_at TEXT, PRIMARY KEY (tick, persona_key));
    INSERT INTO metric_registry (metric, last_value) VALUES ('publications_30d','164'),('engaged_reader_sessions_7d','2'),('companion_pieces_published_7d','16'),('metrics_unmeasured','17'),('ask_answers_7d','7'),('social_posts_7d','38');
  `);
  db.exec(sql);
  db.exec(sql);
  const steps = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks").get().definition).steps;
  assert.deepEqual(steps.map((s) => s.name), ["pp-ticks", "pp-metrics", "pp-briefs"]);
  for (const s of steps) db.exec(s.sql);
  const t = Object.fromEntries(db.prepare("SELECT persona_key, verdict FROM persona_ticks").all().map((r) => [r.persona_key, r.verdict]));
  assert.equal(t["product-owner:papers"], "GREEN");
  assert.equal(t["product-owner:reading"], "RED");
  assert.equal(t["product-owner:ask"], "RED");
  assert.equal(t["social-media-coordinator"], "AMBER");
  assert.equal(Object.keys(t).length, 6);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM persona_briefs").get().n, 6);
  assert.equal(db.prepare("SELECT last_value v FROM metric_registry WHERE metric='persona_social_gap_pct'").get().v, "5.0");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get().n, 6);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_breach_cause").get().n, 6);
});
