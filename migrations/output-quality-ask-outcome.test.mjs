import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./2026-11-01-output-quality-ask-outcome.sql", import.meta.url), "utf8");
const sql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const judgedBy = "visitors who submit helpful/unhelpful answer ratings (qnfo-ai-search /api/feedback; minimum 10 ratings in 30d)";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, PRIMARY KEY (metric, day));
    CREATE TABLE output_quality_measures (
      metric TEXT PRIMARY KEY, surface TEXT NOT NULL, role TEXT NOT NULL,
      polarity INTEGER NOT NULL, tol_rel REAL NOT NULL, tol_abs REAL NOT NULL,
      judged_by TEXT NOT NULL, caveat TEXT
    );
    CREATE TABLE decision_log (
      id INTEGER PRIMARY KEY, actor TEXT NOT NULL, assumption TEXT NOT NULL,
      action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL,
      blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT,
      predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
    );
    CREATE TABLE failure_modes (
      fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL,
      remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL,
      issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT
    );
    CREATE TABLE remediation_contracts (
      class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL,
      verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL,
      escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT
    );
    CREATE TABLE capability_ledger (
      capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT,
      acquired_at TEXT NOT NULL, evidence TEXT NOT NULL
    );
    INSERT INTO metric_history VALUES
      ('ask_helpful_rate_30d', '2026-10-25', 33.3),
      ('ask_helpful_rate_30d', '2026-10-26', 50.0),
      ('ask_helpful_rate_30d', '2026-10-27', 0.75),
      ('unrelated_metric', '2026-10-26', 33.3);
    INSERT INTO output_quality_measures VALUES
      ('jobsearch_reply_rate_90d', 'job applications', 'outcome', 1, 0.1, 0.05, 'mature applications', NULL),
      ('papers_with_open_high_errata_pct', 'papers', 'outcome', -1, 0.05, 1, 'falsifying reviewer', NULL);
  `);
  return db;
}

test("Ask helpfulness is classified as an outcome without corrupting its historical scale", () => {
  assert.match(migration, /^-- APPLY-BY: ci$/m);
  assert.match(migration, /^-- DB: qnfo-audit$/m);
  assert.match(migration, /^-- BACKUP: bak_20261101_ask_helpful_history$/m);
  assert.ok(rollback);

  const db = database();
  try {
    db.exec(sql);
    db.exec(sql);

    const ask = db.prepare("SELECT * FROM output_quality_measures WHERE metric = 'ask_helpful_rate_30d'").get();
    assert.equal(ask.surface, "ask");
    assert.equal(ask.role, "outcome");
    assert.equal(ask.polarity, 1);
    assert.equal(ask.judged_by, judgedBy);
    assert.match(ask.caveat, /fewer than 10 ratings is unmeasured/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM output_quality_measures WHERE role = 'outcome' AND surface IN ('ask', 'job applications', 'papers')").get().n, 3);

    const value = (day) => db.prepare("SELECT value FROM metric_history WHERE metric = 'ask_helpful_rate_30d' AND day = ?").get(day).value;
    assert.equal(value("2026-10-25"), 0.333);
    assert.equal(value("2026-10-26"), 0.5);
    assert.equal(value("2026-10-27"), 0.75, "already normalized ratios are unchanged");
    assert.equal(db.prepare("SELECT value FROM metric_history WHERE metric = 'unrelated_metric'").get().value, 33.3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM bak_20261101_ask_helpful_history").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1);
    const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-ask-helpful-history-unit-drift'").get().verify_probe;
    assert.deepEqual(Object.fromEntries(Object.entries(db.prepare(probe).get())), { expected: "0", observed: "0" });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'ask-helpful-history-unit-drift'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'ask-reader-outcome-quality-trend'").get().n, 1);
    assert.match(db.prepare("SELECT predicted_outcome FROM decision_log").get().predicted_outcome, /^ask_outcome_measure_count >= 1 within 24 h$/);

    db.exec(rollback);
    assert.equal(value("2026-10-25"), 33.3);
    assert.equal(value("2026-10-26"), 50.0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM output_quality_measures WHERE metric = 'ask_helpful_rate_30d'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM output_quality_measures WHERE metric IN ('jobsearch_reply_rate_90d', 'papers_with_open_high_errata_pct')").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-ask-helpful-history-unit-drift'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'ask-helpful-history-unit-drift'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'ask-reader-outcome-quality-trend'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1, "the decision log remains append-only");
  } finally {
    db.close();
  }
});
