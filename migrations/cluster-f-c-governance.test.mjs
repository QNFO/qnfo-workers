// CONTROL-ALT-PROBES-5 offline suite (agent_issues 2826): runs migrations/2026-10-28-cluster-f-c-governance.sql on SQLite over fixtures and replays each probe.
// State-independent: asserts the probes' behaviour on seeded worlds, never the live counts.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const sql = readFileSync(new URL("./2026-10-28-cluster-f-c-governance.sql", import.meta.url), "utf8");
function world(seed) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT);" +
    "CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT);CREATE TABLE ops_config (key TEXT, value TEXT);CREATE TABLE control_registry (control TEXT, evidence TEXT);");
  seed(db); db.exec(sql); db.exec(sql); // re-runnable
  return db;
}
const iso = (m) => new Date(Date.now() - m * 60000).toISOString();
const run = (db, c) => db.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = ?").get(c).probe_sql;
const obs = (db, c) => db.prepare(run(db, c)).get().observed;
const empty = world(() => {});
assert.equal(empty.prepare("SELECT COUNT(*) n FROM control_alternate_probes").get().n, 2);
for (const c of ["pub-gate-withdraw", "owner-authorization-hold-100576"]) {
  const p = run(empty, c);
  assert.ok(!p.includes(";") && /^SELECT/.test(p), c + " is one SELECT");
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(p), c + " is read-only");
  for (const m of p.match(/LIKE '[^']*'/g) || []) assert.ok(m.length - 7 < 50, "LIKE under 50 bytes");
  assert.notEqual(obs(empty, c), "ok", c + " fails on an empty world");
}
const q = (ts, text) => (db) => db.prepare("INSERT INTO cloud_ops_events VALUES ('x',?,'quality-score',?)").run(ts, text);
assert.equal(obs(world(q(iso(30), "quality sweep: pass=467 revise=238 withdrawn=0 restored=0")), "pub-gate-withdraw"), "ok");
assert.notEqual(obs(world(q(iso(300), "quality sweep: pass=467 revise=238 withdrawn=0")), "pub-gate-withdraw"), "ok", "stale sweep fails");
assert.notEqual(obs(world(q(iso(30), "quality sweep: pass=705 revise=0 withdrawn=0")), "pub-gate-withdraw"), "ok", "no revise fails");
const hold = (cfg, ev) => (db) => {
  if (cfg) db.exec("INSERT INTO ops_config VALUES ('OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1','{}')");
  db.prepare("INSERT INTO control_registry VALUES ('owner-authorization-hold-100576',?)").run(ev);
};
assert.equal(obs(world(hold(true, "x RELEASED 2026-10-26")), "owner-authorization-hold-100576"), "ok");
assert.notEqual(obs(world(hold(false, "x RELEASED")), "owner-authorization-hold-100576"), "ok");
assert.notEqual(obs(world(hold(true, "still held")), "owner-authorization-hold-100576"), "ok");
for (const h of ["-- APPLY-BY: ci", "-- DB: qnfo-audit", "-- Rollback: ", "-- BACKUP: control_alternate_probes"]) assert.ok(sql.includes(h), h);
console.log("cluster-f-c-governance: ok");
