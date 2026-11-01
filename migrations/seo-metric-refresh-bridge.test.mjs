import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-seo-metric-refresh-bridge.sql", import.meta.url), "utf8");
const rollback = migration.match(/^-- Rollback: (.*)$/m)?.[1];
assert.ok(rollback);
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE analytics_dash_meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
  CREATE TABLE failure_modes (
    fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
    probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT
  );
  CREATE TABLE remediation_contracts (
    class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT,
    verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT
  );
  CREATE TABLE decision_log (
    actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
    rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
`);
const keys = ["seo_crawl_googlebot_7d", "seo_crawl_bingbot_7d", "seo_indexnow_engines_ok", "seo_sitemap_urls"];
const old = "2026-10-25T09:45:00Z";
const insert = db.prepare("INSERT INTO metric_registry VALUES (?, 'stale', ?, 'MEASURED')");
for (const key of [...keys, "worker_count", "seo_unrelated"]) insert.run(key, old);
db.prepare("INSERT INTO analytics_dash_meta VALUES (?, '522')").run(keys[0]);
const metric = (key) => db.prepare("SELECT * FROM metric_registry WHERE metric = ?").get(key);
const publish = db.prepare("INSERT INTO analytics_dash_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

db.exec(migration);
assert.equal(metric(keys[0]).last_refreshed, old, "cached metadata is not backfilled as a new reading");
const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-seo-metric-refresh-bridge'").get().verify_probe;
assert.notEqual(db.prepare(probe).get().observed, "ok", "installation alone is not recovery");

const gateway = readFileSync(new URL("../qnfo-gateway/worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = gateway.indexOf("function indexNowEnginesAccepted(details) {");
const end = gateway.indexOf("var gateway_worker_default =", start);
assert.ok(start >= 0 && end > start);
const seoPublishMetrics = new Function("LP_PUBLIC", "SEO_PAPER_HUB_COUNT", gateway.slice(start, end) + "\nreturn seoPublishMetrics;")("('published')", 1);
db.exec(`
  CREATE TABLE seo_crawl_log (day TEXT, bot TEXT, n INTEGER);
  INSERT INTO seo_crawl_log VALUES (date('now'), 'googlebot', 4), (date('now', '-1 day'), 'bingbot', 3);
  CREATE TABLE indexnow_log (ts TEXT, detail TEXT);
  INSERT INTO indexnow_log VALUES (datetime('now'), '[{"eps":[{"ep":"test-engine","status":200}]}]');
  CREATE TABLE papers (slug TEXT, status TEXT);
  INSERT INTO papers VALUES ('test-paper', 'published');
`);
const d1 = {
  prepare(sql) {
    const statement = db.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args); },
      async all() { return { results: statement.all(...args) }; },
      async run() { return statement.run(...args); }
    };
  }
};
const published = await seoPublishMetrics({ AUDIT: d1, LIVING_PAPER: d1 });
assert.equal(published.ok, true, "the real gateway publisher completes with the bridge installed");
for (const key of keys) assert.equal(metric(key).last_value, published.values[key], "gateway readings reach the registry");
assert.equal(db.prepare(probe).get().observed, "ok", "the next gateway publish satisfies the closing detector");

for (const [index, key] of keys.entries()) {
  publish.run(key, String(index));
  assert.equal(metric(key).last_value, String(index), "zero is a measured count, not unknown");
  assert.equal(metric(key).state, "MEASURED");
  assert.ok(Math.abs(Date.parse(metric(key).last_refreshed) - Date.now()) < 60000);
  db.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = ?").run(old, key);
  publish.run(key, String(index));
  assert.notEqual(metric(key).last_refreshed, old, "an unchanged upsert refreshes the cadence");
}
assert.equal(db.prepare(probe).get().observed, "ok");
for (const value of ["", "   ", null]) {
  publish.run(keys[0], value);
  assert.equal(metric(keys[0]).last_value, null);
  assert.equal(metric(keys[0]).state, "UNMEASURED", "unknown source values never become a fabricated zero");
}
publish.run(keys[0], "10");
assert.equal(metric(keys[0]).state, "MEASURED", "later readings recover from unknown");
for (const key of ["worker_count", "seo_unrelated"]) {
  const before = JSON.stringify(metric(key));
  publish.run(key, "999");
  assert.equal(JSON.stringify(metric(key)), before, "non-allowlisted metadata cannot overwrite a registry metric");
}
publish.run("seo_crawl_coverage_days", "2");
assert.equal(metric("seo_crawl_coverage_days"), undefined, "the bridge does not register undeclared metrics");
db.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = ?").run(old, keys[1]);
assert.notEqual(db.prepare(probe).get().observed, "ok", "the detector still exposes stopped publishers");

db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "replay is idempotent");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n, 1);
db.exec(rollback);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n, 0);
const beforeRollbackPublish = JSON.stringify(metric(keys[1]));
publish.run(keys[1], "888");
assert.equal(JSON.stringify(metric(keys[1])), beforeRollbackPublish, "rollback removes both refresh paths");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the decision record");
db.close();
console.log("seo-metric-refresh-bridge: all passed");
