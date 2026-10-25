import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const migration = readFileSync(new URL("./2026-10-25-portfolio-gap-close-evidence.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const guardSource = readFileSync(new URL("./2026-10-18-close-binds-to-probe.sql", import.meta.url), "utf8");
const guard = /^CREATE TRIGGER issue_close_evidence_required[\s\S]*?^END;/m.exec(guardSource.replace(/\r\n/g, "\n"))[0];
const snapshot = JSON.parse(readFileSync(new URL("../docs/fleet-tasks-canonical.json", import.meta.url), "utf8"));
const task = snapshot.tasks["portfolio-gap-action"];
const current = JSON.parse(task.definition);
const oldClose = "UPDATE agent_issues SET status='closed', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000\n   WHERE title LIKE 'PORTFOLIO-UPGRADE-1: %' AND status='open'\n     AND EXISTS (SELECT 1 FROM roadmap_implementation r WHERE r.item='UPG-'||substr(agent_issues.title, length('PORTFOLIO-UPGRADE-1: advance compat_date for ')+1) AND r.status='verified')";
const old = JSON.stringify({ steps: [...current.steps.slice(0, 7), { type: "sql", db: "AUDIT", sql: oldClose }] });

export function fixture(definition = old, canonical = definition) {
  const d = new DatabaseSync(":memory:");
  d.exec(`
    CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, enabled INTEGER, updated_at TEXT);
    CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT, repo_path TEXT, exported_at TEXT);
    CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT, module TEXT, last_verdict TEXT);
    CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT, last_exercised_at TEXT, evidence TEXT);
    CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
    CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT, confidence REAL, evidence TEXT, probe_class TEXT, built_on TEXT);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER, close_channel TEXT);
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, close_evidence TEXT);
    CREATE TABLE worker_compat_state (worker TEXT, checked_at TEXT, live_date TEXT, days_behind INTEGER);
    CREATE TABLE roadmap_implementation (item TEXT, status TEXT, verified_at TEXT, evidence TEXT);
    CREATE TABLE cron_faults (fault_key TEXT);
    CREATE VIEW v_cron_faults AS SELECT * FROM cron_faults;
    INSERT INTO cron_faults VALUES ('task-failed:portfolio-gap-action');
  `);
  d.exec(guard);
  d.prepare("INSERT INTO fleet_tasks VALUES ('portfolio-gap-action', ?, 3, 1, 'old')").run(definition);
  d.prepare("INSERT INTO fleet_tasks_canonical VALUES ('portfolio-gap-action', ?, 'old', 'old')").run(canonical);
  return d;
}

function seed(d, { days = 2, age = "-1 minutes", roadmap = "open", triage = true, verdict = null } = {}) {
  d.exec("INSERT INTO agent_issues VALUES (1, 'PORTFOLIO-UPGRADE-1: advance compat_date for demo', 'open', 0, NULL)");
  d.prepare("INSERT INTO roadmap_implementation VALUES ('UPG-demo', ?, datetime('now'), 'prior')").run(roadmap);
  d.prepare("INSERT INTO worker_compat_state VALUES ('demo', datetime('now', ?), '2026-10-24', ?)").run(age, days);
  if (triage) d.exec("INSERT INTO issue_triage VALUES (1, 'maintenance', 'triaged', 'existing-owner', 'now', NULL)");
  if (verdict) d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-1', 1, 'active', ?)").run(verdict);
}
const definition = d => d.prepare("SELECT definition FROM fleet_tasks").get().definition;
const status = d => d.prepare("SELECT status FROM agent_issues WHERE id=1").get().status;
const evidence = d => d.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id=1").get()?.close_evidence;
const steps = d => JSON.parse(definition(d)).steps;
const run = d => { for (const s of steps(d).slice(6)) d.exec(s.sql); };

export function migratedTask() {
  const d = fixture();
  d.exec(migration);
  const result = d.prepare("SELECT id, definition, version, enabled, updated_at FROM fleet_tasks").get();
  d.close();
  return result;
}

function test() {
  const broken = fixture();
  seed(broken, { roadmap: "verified" });
  assert.throws(() => broken.exec(oldClose), /close-without-evidence/);
  assert.equal(status(broken), "open");

  for (const triage of [true, false]) {
    const d = fixture();
    seed(d, { triage });
    d.exec(migration);
    assert.equal(status(d), "open", "migration itself never closes an issue");
    assert.equal(evidence(d), triage ? null : undefined);
    d.exec(steps(d)[6].sql);
    d.exec(steps(d)[7].sql);
    assert.equal(status(d), "open", "evidence is written before closure");
    assert.match(evidence(d), /worker=demo checked_at=.+ live_date=2026-10-24 days_behind=2 roadmap=UPG-demo verified_at=/);
    if (triage) assert.equal(d.prepare("SELECT owner FROM issue_triage").get().owner, "existing-owner");
    d.exec(steps(d)[8].sql);
    assert.equal(status(d), "closed", "the actual close guard permits evidence-backed closure");
    assert.equal(d.prepare("SELECT close_channel FROM agent_issues").get().close_channel, "auto:portfolio-gap-action");
    assert.equal(d.prepare("SELECT definition FROM fleet_tasks_canonical").get().definition, definition(d));
    const before = definition(d);
    d.exec(migration);
    assert.equal(definition(d), before);
    assert.equal(d.prepare("SELECT version FROM fleet_tasks").get().version, 4);
    assert.equal(d.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1);
    assert.equal(d.prepare("SELECT COUNT(*) n FROM capability_ledger").get().n, 1);
    const probe = d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class LIKE 'fm-%'").get().verify_probe;
    assert.equal(d.prepare(probe).get().observed, "1", "detector fails while cron fault remains");
    d.exec("DELETE FROM cron_faults");
    assert.equal(d.prepare(probe).get().observed, "0");
    d.exec(/^-- Rollback: (.+)$/m.exec(migration)[1]);
    assert.equal(definition(d), old);
    assert.equal(d.prepare("SELECT definition FROM fleet_tasks_canonical").get().definition, old);
    d.close();
  }

  for (const options of [
    { days: 30 }, { days: null }, { days: -1 }, { days: "unsupported" },
    { age: "-121 minutes" }, { age: "+10 minutes" }, { age: "invalid" },
    ...["fail", "probe-error", "probe-not-machine-executable", "vacuous-probe-result", "probe-same-account-host"].map(verdict => ({ verdict })),
  ]) {
    const d = fixture();
    seed(d, { roadmap: "verified", ...options });
    d.exec(migration);
    run(d);
    assert.equal(status(d), "open", JSON.stringify(options));
    assert.equal(evidence(d), null, "unsupported or failed probes produce no evidence: " + JSON.stringify(options));
    d.close();
  }
  const latest = fixture();
  seed(latest, { roadmap: "verified", age: "-10 minutes" });
  latest.exec("INSERT INTO worker_compat_state VALUES ('demo', datetime('now'), '2020-01-01', 100)");
  latest.exec(migration);
  run(latest);
  assert.equal(status(latest), "open", "an older passing probe cannot override the latest failure");
  assert.equal(evidence(latest), null);

  const race = fixture();
  seed(race);
  race.exec(migration);
  race.exec(steps(race)[6].sql);
  race.exec(steps(race)[7].sql);
  race.exec("INSERT INTO worker_compat_state VALUES ('demo', datetime('now'), '2020-01-01', NULL)");
  race.exec(steps(race)[8].sql);
  assert.equal(status(race), "open", "closure rechecks measurements changed after evidence was written");

  for (const [live, canon] of [[JSON.stringify({ steps: [] }), old], [old, "{}"]]) {
    const drifted = fixture(live, canon);
    assert.throws(() => drifted.exec(migration), /malformed JSON/);
    assert.equal(definition(drifted), live);
    assert.equal(drifted.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 0);
  }
  assert.deepEqual(JSON.parse(migratedTask().definition), current, "documented snapshot matches migrated definition");
  console.log("portfolio-gap-close-evidence: all regression assertions passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) test();
