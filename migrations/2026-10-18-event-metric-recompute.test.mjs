// METRIC-REGISTRY-STALENESS-1 (#2192): the event-only metrics stay fresh after their cadence floor is installed.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE metric_registry (
    metric TEXT PRIMARY KEY,
    refresh_cadence TEXT,
    last_value TEXT,
    last_refreshed TEXT,
    state TEXT
  );
  CREATE TABLE fleet_tasks (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    definition TEXT,
    timeout_ms INTEGER,
    retries INTEGER,
    version INTEGER,
    enabled INTEGER,
    updated_at TEXT
  );
  CREATE TABLE fleet_crons (
    name TEXT PRIMARY KEY,
    cron_expr TEXT,
    task_id TEXT,
    enabled INTEGER,
    timezone TEXT,
    last_fired TEXT,
    next_fire TEXT,
    updated_at TEXT
  );
  CREATE TABLE cloud_ops_events (
    id TEXT PRIMARY KEY,
    ts TEXT,
    kind TEXT,
    text TEXT,
    meta TEXT,
    job TEXT,
    status TEXT
  );
  CREATE TABLE v_process_path_gaps (no_sla INTEGER, single_path INTEGER);
  INSERT INTO v_process_path_gaps VALUES (1, 0), (0, 0), (0, 1);
  INSERT INTO metric_registry VALUES
    ('process_path_gaps', 'hourly', '0', '2000-01-01T00:00:00Z', 'MEASURED'),
    ('probe_review_refused_share_7d', '2h', '0', '2000-01-01T00:00:00Z', 'MEASURED'),
    ('spof_alternates_untested_24h', '2h', '0', '2000-01-01T00:00:00Z', 'MEASURED');
`);
const event = db.prepare("INSERT INTO cloud_ops_events VALUES (?, datetime('now', '-1 day'), 'probe-review', '', ?, 'probe-review', ?)");
for (let i = 0; i < 5; i++) event.run(`probe-${i}`, JSON.stringify({ verdict: "reviewed" }), i === 0 ? "refused" : "ok");

db.exec(readFileSync(new URL("./2026-10-18-event-metric-recompute.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./2026-10-18-metric-cadence-floor-2.sql", import.meta.url), "utf8"));

const task = db.prepare("SELECT definition, version FROM fleet_tasks WHERE id = 'event-metric-recompute'").get();
const cron = db.prepare("SELECT cron_expr, task_id FROM fleet_crons WHERE name = 'event-metric-recompute-daily'").get();
assert.equal(task.version, 2);
assert.equal(cron.cron_expr, "25 6 * * *");
assert.equal(cron.task_id, "event-metric-recompute");

const steps = JSON.parse(task.definition).steps;
assert.deepEqual(steps.map(({ name, type }) => [name, type]), [
  ["recompute-process-path-gaps", "sql"],
  ["recompute-probe-review-refused", "sql"],
  ["ledger", "sql"]
]);
for (const step of steps) db.exec(step.sql);

const pathMetric = db.prepare("SELECT refresh_cadence, last_value, last_refreshed, state FROM metric_registry WHERE metric = 'process_path_gaps'").get();
assert.equal(pathMetric.refresh_cadence, "daily");
assert.equal(pathMetric.last_value, "2");
assert.equal(pathMetric.state, "MEASURED");
assert.ok(Date.parse(pathMetric.last_refreshed) > Date.parse("2000-01-01T00:00:00Z"));

const reviewMetric = db.prepare("SELECT refresh_cadence, last_value, last_refreshed FROM metric_registry WHERE metric = 'probe_review_refused_share_7d'").get();
assert.equal(reviewMetric.refresh_cadence, "daily");
assert.equal(reviewMetric.last_value, "0.2");
assert.ok(Date.parse(reviewMetric.last_refreshed) > Date.parse("2000-01-01T00:00:00Z"));
