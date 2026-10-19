// CONTROL-ALT-PROBES-2 offline suite: applies migrations/2026-10-19-control-alternate-probes2.sql on SQLite (node:sqlite) to a fixture of the objects its probes read.
// Proves: the file is re-runnable and its Rollback line restores the pre-state; it writes nine read-only expected/observed probes (one SELECT, no semicolon, no write
// keyword) and an evidence note only on controls that exist and carry no earlier note; every probe returns ok on a world where its alternate is in place and FAILS with a
// reason on a world where that alternate is broken (one failing world per branch); an absent ops_config key reads as its default (the workers read it so); the probe of the
// loop-owned park control may exist before its control row; the decision row carries a prediction decision_predictions_parse can read.
// Run: node migrations/control-alternate-probes2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-19-control-alternate-probes2.sql", import.meta.url), "utf8");
const first = readFileSync(new URL("./2026-10-19-control-alternate-probes.sql", import.meta.url), "utf8");
const TABLE_DDL = /CREATE TABLE IF NOT EXISTS control_alternate_probes \([\s\S]*?\);/.exec(first)[0];
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const NINE = ["claim-integrity-gate", "research-floor-extend", "research-revise-shrink-guard", "research-width-governor", "code_reasoning_low",
  "loop_breaker_tool_exclusions", "research-floor-rearm", "research-kimi-last-resort", "loop-owned-contract-park"];

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .*DELETE FROM control_alternate_probes/m.test(sql), "the file opts in with the header lines and a Rollback");
ok(!/\b(DELETE|DROP)\b/i.test(body), "the body deletes and drops nothing, so it needs no BACKUP line");
ok(!/claude\.ai/i.test(sql), "no claude.ai link");

const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const isoMs = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString();

function world({ withControlRows = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
${TABLE_DDL}
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
CREATE TABLE tool_error_exclusions (pattern TEXT PRIMARY KEY, err_class TEXT, rationale TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, verify_probe TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE paper_integrity_backups (id INTEGER PRIMARY KEY);
CREATE TABLE bak_20261019_research_parked (id TEXT PRIMARY KEY);
CREATE VIEW tool_failures_excluded_24h AS SELECT pattern, err_class FROM tool_error_exclusions;
CREATE VIEW v_loop_breaker_signatures AS SELECT pattern AS signature FROM tool_error_exclusions;
CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT ON remediation_contracts
BEGIN /* LOOP-OWNED-CONTRACT-MONITORING-1 */ SELECT 1; END;
`);
  const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES (?, ?, ?, 'ok')");
  ["claim-gate", "claim-integrity", "floor-extend", "floor-route", "revise-patch", "research-width", "park-rearm-tick"].forEach((k, i) => ev.run("e" + i, iso(30), k));
  db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('ct1', 'merged', ?)").run(isoMs(30));
  db.prepare("INSERT INTO tool_error_exclusions VALUES ('p', 'agent-input-error', 'the agent supplied bad input')").run();
  db.prepare("INSERT INTO fleet_tasks VALUES ('red-drain', ?)").run('{"steps":[{"sql":"UPDATE remediation_contracts SET status = 1 /* LOOP-OWNED-CONTRACT-MONITORING-1 */"}]}');
  db.prepare("INSERT INTO remediation_contracts VALUES ('fm-loop-owned-contract-circular', NULL, 'active', 'SELECT 1')").run();
  if (withControlRows) {
    const ins = db.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, alternate_path, evidence) VALUES (?, 'loc', 'guard', 1, 'keep', 'alt', ?)");
    for (const c of NINE.filter((c) => c !== "loop-owned-contract-park")) ins.run(c, c === "code_reasoning_low" ? "earlier | CONTROL-ALT-PROBES-1 2026-10-19: note" : "evidence of " + c);
  }
  return db;
}
const run = (db, sqlText) => db.prepare(sqlText).get();
const probeOf = (db, c) => db.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = ?").get(c)?.probe_sql;
const observed = (db, c) => { const r = run(db, probeOf(db, c)); return r.expected === "ok" ? r.observed : "bad expected " + r.expected; };
const snapshot = (db) => JSON.stringify({ p: db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(), c: db.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all(), d: db.prepare("SELECT actor, action FROM decision_log").all() });

// ---- apply, twice ----
const db = world();
db.exec(sql);
const s1 = snapshot(db);
db.exec(sql);
ok(snapshot(db) === s1, "a second apply changes nothing");
const probes = db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all();
ok(probes.length === 9 && JSON.stringify(probes.map((p) => p.control).sort()) === JSON.stringify([...NINE].sort()), "nine probes are seeded, for the nine controls", probes.map((p) => p.control));
ok(probes.every((p) => p.enabled === 1 && p.last_run_at === null && p.last_pass === null && p.last_pass_at === null), "every probe is enabled and none is marked as run or passed by the file");
const WRITE_KW = ["insert into", "update ", "delete from", "drop ", "alter table", "create ", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
ok(probes.every((p) => /^SELECT 'ok' AS expected, /.test(p.probe_sql) && !p.probe_sql.includes(";") && !WRITE_KW.some((k) => p.probe_sql.toLowerCase().includes(k)) && p.window_note.length > 20),
  "each probe is one read-only expected/observed SELECT with a window note", probes.filter((p) => !/^SELECT 'ok'/.test(p.probe_sql)).map((p) => p.control));
const ctl = db.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all();
const noted = ctl.filter((r) => /CONTROL-ALT-PROBES-2 2026-10-19/.test(r.evidence));
ok(noted.length === 7 && noted.every((r) => (r.evidence.match(/CONTROL-ALT-PROBES-2 2026-10-19/g) || []).length === 1), "the evidence note is added once to the seven controls without an earlier note", noted.map((r) => r.control));
ok(ctl.find((r) => r.control === "code_reasoning_low").evidence === "earlier | CONTROL-ALT-PROBES-1 2026-10-19: note", "a control that already carries the first-file note is left alone");
ok(!ctl.some((r) => r.control === "loop-owned-contract-park"), "the probe of the loop-owned park control exists without a control row (that row comes from the other migration)");
const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].action.startsWith("CONTROL-ALT-PROBES-2:") && dl[0].capability_gain && /^[a-z_0-9]+ (<|<=|>|>=|=) \d+ within \d+ h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction decision_predictions_parse reads", dl[0] && dl[0].predicted_outcome);

// ---- every probe passes on a world where the alternate is in place ----
for (const c of NINE) ok(observed(db, c) === "ok", "passes where its alternate is in place: " + c, observed(db, c));

// ---- and fails, with a reason, on a world where it is broken ----
// [control, sql run on a fresh world, a substring of the reason]
const BREAK = [
  ["claim-integrity-gate", "DROP TABLE paper_integrity_backups", "paper_integrity_backups is missing"],
  ["claim-integrity-gate", "INSERT INTO ops_config VALUES ('claim_integrity_mode', 'maybe')", "claim_integrity_mode holds a value"],
  ["claim-integrity-gate", "DELETE FROM cloud_ops_events WHERE kind IN ('claim-gate', 'claim-integrity')", "no claim-gate or claim-integrity event"],
  ["research-floor-extend", "INSERT INTO ops_config VALUES ('research_floor_extend', 'maybe')", "research_floor_extend holds a value"],
  ["research-floor-extend", "DELETE FROM cloud_ops_events WHERE kind IN ('floor-extend', 'floor-route')", "no floor-extend or floor-route event"],
  ["research-revise-shrink-guard", "INSERT INTO ops_config VALUES ('research_revise_shrink_guard', 'maybe')", "research_revise_shrink_guard holds a value"],
  ["research-revise-shrink-guard", "DELETE FROM cloud_ops_events WHERE kind = 'revise-patch'", "no revise-patch event"],
  ["research-revise-shrink-guard", "UPDATE cloud_ops_events SET status = 'error' WHERE kind = 'revise-patch'", "no revise-patch event"],
  ["research-width-governor", "INSERT INTO ops_config VALUES ('research_governor', 'maybe')", "research_governor holds a value"],
  ["research-width-governor", "DELETE FROM cloud_ops_events WHERE kind = 'research-width'", "no research-width event"],
  ["research-width-governor", "UPDATE cloud_ops_events SET ts = '" + iso(60 * 49) + "' WHERE kind = 'research-width'", "no research-width event"],
  ["code_reasoning_low", "INSERT INTO ops_config VALUES ('code_reasoning_low', '  ')", "code_reasoning_low is blank"],
  ["code_reasoning_low", "UPDATE code_tasks SET status = 'queued'", "no code task reached a terminal status"],
  ["code_reasoning_low", "UPDATE code_tasks SET updated_at = '" + isoMs(60 * 25) + "'", "no code task reached a terminal status"],
  ["loop_breaker_tool_exclusions", "DROP VIEW tool_failures_excluded_24h", "tool_failures_excluded_24h is missing"],
  ["loop_breaker_tool_exclusions", "DROP VIEW v_loop_breaker_signatures; CREATE VIEW v_loop_breaker_signatures AS SELECT 'x' AS signature", "no longer reads tool_error_exclusions"],
  ["loop_breaker_tool_exclusions", "UPDATE tool_error_exclusions SET rationale = ''", "has no rationale"],
  ["research-floor-rearm", "INSERT INTO ops_config VALUES ('park_rearm', 'maybe')", "park_rearm holds a value"],
  ["research-floor-rearm", "DROP TABLE bak_20261019_research_parked", "bak_20261019_research_parked is missing"],
  ["research-floor-rearm", "DELETE FROM cloud_ops_events WHERE kind = 'park-rearm-tick'", "no park-rearm-tick event"],
  ["research-kimi-last-resort", "INSERT INTO ops_config VALUES ('research_kimi_last_resort', 'maybe')", "research_kimi_last_resort holds a value"],
  ["research-kimi-last-resort", "DELETE FROM cloud_ops_events WHERE kind = 'revise-patch'", "no revise-patch event"],
  ["loop-owned-contract-park", "UPDATE fleet_tasks SET definition = '{\"steps\":[]}'", "red-drain park step"],
  ["loop-owned-contract-park", "DROP TRIGGER contract_probe_templates_loop_merged; CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT ON remediation_contracts BEGIN SELECT 1; END", "birth trigger no longer parks"],
  ["loop-owned-contract-park", "UPDATE remediation_contracts SET status = 'monitoring'", "detector fm-loop-owned-contract-circular is missing or not active"],
  ["loop-owned-contract-park", "INSERT INTO agent_issues VALUES (7, 'open'); INSERT INTO remediation_contracts VALUES ('issue-7', 7, 'active', 'SELECT ''ok'' AS expected, (SELECT status FROM agent_issues WHERE id = 7) AS observed')", "is active again"],
];
for (const [control, mutation, reason] of BREAK) {
  const w = world();
  w.exec(sql);
  w.exec(mutation);
  const o = observed(w, control);
  ok(o !== "ok" && o.includes(reason), "fails when its alternate is broken: " + control + " / " + reason, o);
}
// a circular contract on a CLOSED issue does not count
{ const w = world(); w.exec(sql); w.exec("INSERT INTO agent_issues VALUES (7, 'closed'); INSERT INTO remediation_contracts VALUES ('issue-7', 7, 'active', 'SELECT ''ok'' AS expected, (SELECT status FROM agent_issues WHERE id = 7) AS observed')");
  ok(observed(w, "loop-owned-contract-park") === "ok", "a circular contract of a closed issue does not fail the park probe"); }
// an absent ops_config key reads as its default: the world above has none of the seven keys and passes; a key set to the default passes too
{ const w = world(); w.exec(sql); w.exec("INSERT INTO ops_config VALUES ('research_governor', 'off'), ('park_rearm', 'off'), ('claim_integrity_mode', 'measure')");
  ok(["research-width-governor", "research-floor-rearm", "claim-integrity-gate"].every((c) => observed(w, c) === "ok"), "an off or measure lever the workers read is not a failure of the alternate"); }

// ---- a world where the control rows are absent still applies; the Rollback line restores the pre-state ----
{
  const w = world({ withControlRows: false });
  w.exec(sql);
  ok(w.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n === 9, "the probes are written even when no control row exists yet");
}
{
  const w = world();
  const pre = JSON.stringify(w.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all());
  w.exec(sql);
  const rb = (/^-- Rollback: (.*)$/m.exec(sql) || [])[1];
  w.exec(rb);
  ok(w.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n === 0, "the Rollback line removes the nine probes");
  ok(JSON.stringify(w.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all()) === pre, "and the evidence notes");
  ok(w.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "the append-only decision row stays");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
