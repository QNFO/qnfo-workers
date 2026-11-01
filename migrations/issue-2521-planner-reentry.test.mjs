import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-issue-2521-planner-reentry.sql", import.meta.url), "utf8");
const rollback = migration.match(/^-- Rollback: (.*)$/m)?.[1];
assert.ok(rollback);

const marker = "code-task: repo=qnfo-workers path=idea-hub/worker.js";
const description = `Remaining work\n${marker}\ncode-anchor: const RESEARCH=['quantum'`;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");

function database({ status = "open", plan = false, task = null, claim = false, diagnosis = false, ageAction = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, description TEXT);
    CREATE TABLE issue_age_actions (issue_id INTEGER, rung TEXT);
    CREATE TABLE issue_plans (issue_id INTEGER, task_id TEXT);
    CREATE TABLE code_tasks (id TEXT, goal TEXT, status TEXT, updated_at TEXT, lease_until TEXT);
    CREATE TABLE work_claims (issue_id INTEGER, path TEXT, released_at TEXT, expires_at TEXT);
    CREATE TABLE breach_diagnoses (issue_id INTEGER, mode TEXT, state TEXT, action_ref TEXT, action_kind TEXT, lease_until TEXT, last_progress_at TEXT);
    CREATE TABLE decision_log (
      actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
      rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
    );
  `);
  db.prepare("INSERT INTO agent_issues VALUES (2521, ?, ?)").run(status, description);
  if (ageAction) db.prepare("INSERT INTO issue_age_actions VALUES (2521, '24h')").run();
  if (plan) db.prepare("INSERT INTO issue_plans VALUES (2521, 'ct_im2521')").run();
  if (task) db.prepare("INSERT INTO code_tasks VALUES ('ct_im2521', '[issue #2521] prior handoff', ?, ?, ?)").run(task.status, task.updated || iso(-180 * 60000), task.lease || null);
  if (claim) db.prepare("INSERT INTO work_claims VALUES (2521, 'issue:2521', NULL, ?)").run(iso(60 * 60000));
  if (diagnosis) db.prepare("INSERT INTO breach_diagnoses VALUES (2521, 'on', 'applied', 'action', 'sql', ?, ?)").run(iso(60 * 60000), iso(-10 * 60000));
  return db;
}

function apply(db) {
  db.exec(migration);
}

{
  const db = database({ task: { status: "failed", updated: iso(-14 * 86400000) } });
  apply(db);
  const row = db.prepare("SELECT status, description FROM agent_issues WHERE id = 2521").get();
  assert.equal(row.status, "open", "the original issue stays open");
  assert.ok(row.description.includes("completed task handoff: repo=qnfo-workers path=idea-hub/worker.js"));
  assert.ok(!row.description.includes("code-task:"), "the stale marker no longer excludes the issue from planner intake");
  assert.ok(db.prepare("SELECT 1 FROM agent_issues WHERE id = 2521 AND COALESCE(description, '') NOT LIKE '%code-task:%'").get(), "trusted planner intake can reconsider the issue");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1);
  db.exec(rollback);
  assert.equal(db.prepare("SELECT description FROM agent_issues WHERE id = 2521").get().description, description);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision record");
  db.close();
}

for (const options of [
  { task: { status: "queued", updated: iso(-10 * 60000) } },
  { task: { status: "editing", updated: iso(-180 * 60000), lease: iso(60 * 60000) } },
  { claim: true },
  { diagnosis: true },
  { plan: true },
  { status: "closed" },
  { ageAction: false },
]) {
  const db = database(options);
  apply(db);
  assert.equal(db.prepare("SELECT description FROM agent_issues WHERE id = 2521").get().description, description, JSON.stringify(options));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 0, JSON.stringify(options));
  db.close();
}

console.log("issue-2521-planner-reentry: all passed");
