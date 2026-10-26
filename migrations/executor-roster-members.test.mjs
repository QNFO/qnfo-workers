// EXECUTOR-ROSTER-MEMBERS-1 offline suite: replays migrations/2026-10-26-executor-roster-members.sql on node:sqlite over the live shape of v_executor_roster (verbatim from
// qnfo-audit sqlite_master, read 2026-10-26) and the tables it reads (service_registry, worker_live_audit, ai_calibration_results, capability_ledger).
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP table the file creates before it drops the view); the old view reads a registry member and
// a never-probed stub as healthy 0 (the two executors roster_members_degraded counted); the new view judges the member by its host's probe, reads the stub as unmeasured (NULL),
// still reads a down worker, a stale probe and a failing model route as 0, keeps every other row (model, mechanism, worker: pseudo-capability) unchanged, and the two metric
// formulas of migrations/2026-10-12-21-tick-driver-roster.sql return 0 degraded executors on the repaired shape; a replay changes nothing; the Rollback text restores the old view.
// Output MUST contain "0 failed" on success.   node migrations/executor-roster-members.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-executor-roster-members.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_v_executor_roster\s*$/.test(l)), "the DROP VIEW names its BACKUP table");
ok(/CREATE TABLE IF NOT EXISTS bak_20261026_v_executor_roster AS\s+SELECT name, sql/i.test(body) && body.indexOf("bak_20261026_v_executor_roster") < body.indexOf("DROP VIEW IF EXISTS v_executor_roster"), "the file creates the backup (the saved view text) before it drops the view");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick\b/i.test(body), "no write to fleet_tick (its 52 triggers share one statement; the hourly tick refreshes the metrics)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");

// the live view, verbatim (qnfo-audit sqlite_master, 2026-10-26)
const OLD_VIEW = `CREATE VIEW v_executor_roster AS
SELECT j.value AS capability, s.service AS executor, 'worker' AS kind,
       CASE WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END AS healthy,
       'worker_live_audit http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never') AS evidence
  FROM service_registry s
  JOIN json_each(CASE WHEN json_valid(COALESCE(s.capabilities, '')) AND substr(trim(s.capabilities), 1, 1) = '[' THEN s.capabilities ELSE '[]' END) j
  LEFT JOIN worker_live_audit w ON w.worker = s.service
  WHERE s.state = 'live'
UNION ALL
SELECT 'worker:' || s.service, s.service, 'worker',
       CASE WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END,
       'no capability list in service_registry; worker_live_audit http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never')
  FROM service_registry s LEFT JOIN worker_live_audit w ON w.worker = s.service
  WHERE s.state = 'live' AND json_array_length(CASE WHEN json_valid(COALESCE(s.capabilities, '')) AND substr(trim(s.capabilities), 1, 1) = '[' THEN s.capabilities ELSE '[]' END) = 0
UNION ALL
SELECT 'ai-model-inference', r.target, 'model',
       CASE WHEN 1.0 * SUM(r.status = 'pass') / COUNT(*) >= 0.8 THEN 1 ELSE 0 END,
       'ai_calibration_results probe model: ' || SUM(r.status = 'pass') || ' pass of ' || COUNT(*) || ' in 24 h'
  FROM ai_calibration_results r
  WHERE r.probe = 'model' AND r.ts > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
  GROUP BY r.target
UNION ALL
SELECT c.capability, c.provenance, 'mechanism', NULL,
       'capability_ledger: ' || COALESCE(c.reliability, '?') || '; last exercised ' || COALESCE(c.last_exercised_at, 'not recorded')
  FROM capability_ledger c`;

const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString().slice(0, 19).replace("T", " ");
function world() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT);
CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, http INTEGER, live_version TEXT, registry_before TEXT, match INTEGER, note TEXT, probed_at TEXT);
CREATE TABLE ai_calibration_results (id INTEGER PRIMARY KEY AUTOINCREMENT, probe TEXT, target TEXT, status TEXT, ts INTEGER);
CREATE TABLE capability_ledger (capability TEXT, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT, last_exercised_at TEXT, evidence TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  raw.exec(OLD_VIEW);
  const svc = (service, kind, caps, base) => raw.prepare("INSERT INTO service_registry (service, kind, base_url, capabilities, state) VALUES (?, ?, ?, ?, 'live')").run(service, kind, base ?? "https://" + service + ".q08.workers.dev", caps);
  const aud = (worker, http, note, ago = 5) => raw.prepare("INSERT INTO worker_live_audit (worker, http, note, probed_at) VALUES (?, ?, ?, ?)").run(worker, http, note, minsAgo(ago));
  svc("qnfo-lifecycle", "worker", JSON.stringify(["lifecycle-sync"])); aud("qnfo-lifecycle", 200, "SYNC");
  svc("qnfo-backlog-exec", "member", JSON.stringify(["backlog-inventory", "issue-drain", "stranded-job-recovery"]), "https://qnfo-lifecycle.q08.workers.dev/backlog"); aud("qnfo-backlog-exec", 404, "NOT_DEPLOYED");
  svc("qnfo-workers", "worker", "[]");                                     // retired repository-root stub: no audit row at all
  svc("worker-healthy", "worker", JSON.stringify(["thing-a", "thing-b"])); aud("worker-healthy", 200, "SYNC");
  svc("worker-down", "worker", JSON.stringify(["thing-c"])); aud("worker-down", 500, "DOWN");
  svc("worker-stale", "worker", JSON.stringify(["thing-d"])); aud("worker-stale", 200, "SYNC", 30 * 60);   // 200, but probed 30 hours ago
  svc("worker-nocaps", "worker", "[]"); aud("worker-nocaps", 200, "SYNC");
  svc("member-elsewhere", "member", JSON.stringify(["far-cap"]), "https://example.org/x");               // host not in the audit: unmeasured, not degraded
  raw.prepare("INSERT INTO service_registry (service, kind, state, capabilities) VALUES ('oauth-pending', 'mcp-server', 'registered-oauth-pending', '[\"x\"]')").run();
  const now = Date.now();
  for (let i = 0; i < 5; i++) raw.prepare("INSERT INTO ai_calibration_results (probe, target, status, ts) VALUES ('model', 'model-good', ?, ?)").run(i < 4 ? "pass" : "fail", now - i * 60000);
  for (let i = 0; i < 5; i++) raw.prepare("INSERT INTO ai_calibration_results (probe, target, status, ts) VALUES ('model', 'model-bad', ?, ?)").run(i < 2 ? "pass" : "fail", now - i * 60000);
  raw.prepare("INSERT INTO capability_ledger (capability, provenance, reliability) VALUES ('mech-cap', 'prov-1', 'ok')").run();
  return raw;
}
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const DEGRADED = "SELECT COUNT(DISTINCT executor) AS n FROM v_executor_roster WHERE healthy = 0";                      // roster_members_degraded, verbatim formula

// ---- before: the live view reads the member and the stub as degraded
const w = world();
const dBefore = qa(w, "SELECT DISTINCT executor FROM v_executor_roster WHERE healthy = 0 ORDER BY executor").map((r) => r.executor);
ok(dBefore.join() === "member-elsewhere,model-bad,qnfo-backlog-exec,qnfo-workers,worker-down,worker-stale", "before: the old view counts the member routes and the stub as degraded beside the three real faults (down worker, stale probe, failing model route)", dBefore);
const rowsBefore = qa(w, "SELECT capability, executor, kind, healthy FROM v_executor_roster WHERE kind <> 'worker' OR executor IN ('worker-healthy', 'worker-down', 'worker-stale', 'worker-nocaps', 'qnfo-lifecycle') ORDER BY kind, capability, executor");

// ---- after
w.exec(sql);
ok(q1(w, "SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'v_executor_roster'") !== undefined, "the view exists after the file");
const bak = q1(w, "SELECT name, sql FROM bak_20261026_v_executor_roster");
ok(bak && bak.name === "v_executor_roster" && /CREATE VIEW v_executor_roster/.test(bak.sql) && bak.sql.includes("WHERE w.http = 200") === false && bak.sql.includes("s.state = 'live'"), "the backup table holds the previous view text", bak && bak.sql.slice(0, 80));
const dAfter = qa(w, "SELECT DISTINCT executor FROM v_executor_roster WHERE healthy = 0 ORDER BY executor").map((r) => r.executor);
ok(dAfter.join() === "model-bad,worker-down,worker-stale", "after: only the failing model route, the worker that answers 500 and the worker probed 30 hours ago are degraded", dAfter);
const h = (cap, ex) => (qa(w, "SELECT healthy FROM v_executor_roster WHERE capability = ? AND executor = ?", cap, ex)[0] || {}).healthy;
ok(["backlog-inventory", "issue-drain", "stranded-job-recovery"].every((c) => h(c, "qnfo-backlog-exec") === 1), "the member's three capabilities are healthy through its host qnfo-lifecycle (http 200)");
ok(h("worker:qnfo-workers", "qnfo-workers") === null, "the never-probed stub is unmeasured (NULL), not degraded");
ok(h("far-cap", "member-elsewhere") === null, "a member whose host is not in the audit is unmeasured, not degraded");
ok(h("thing-c", "worker-down") === 0 && h("thing-d", "worker-stale") === 0, "a down worker (http 500) and a stale probe (200, 30 hours old) still read 0");
ok(h("thing-a", "worker-healthy") === 1 && h("thing-b", "worker-healthy") === 1 && h("worker:worker-nocaps", "worker-nocaps") === 1, "healthy workers and a worker with no capability list read 1");
ok(q1(w, "SELECT evidence e FROM v_executor_roster WHERE capability = 'issue-drain'").e === "worker_live_audit qnfo-lifecycle http 200 at " + q1(w, "SELECT probed_at p FROM worker_live_audit WHERE worker = 'qnfo-lifecycle'").p, "the member's evidence names the host it was judged by");
ok(qa(w, "SELECT executor FROM v_executor_roster WHERE executor = 'oauth-pending'").length === 0, "a registry row that is not in state live (registered-oauth-pending) is not listed, as before");
const rowsAfter = qa(w, "SELECT capability, executor, kind, healthy FROM v_executor_roster WHERE kind <> 'worker' OR executor IN ('worker-healthy', 'worker-down', 'worker-stale', 'worker-nocaps', 'qnfo-lifecycle') ORDER BY kind, capability, executor");
ok(JSON.stringify(rowsAfter) === JSON.stringify(rowsBefore), "the model, mechanism and unaffected worker rows are identical to the old view");
ok(q1(w, "SELECT COUNT(*) n FROM v_executor_roster WHERE kind = 'model' AND capability = 'ai-model-inference'").n === 2 && h("ai-model-inference", "model-good") === 1 && h("ai-model-inference", "model-bad") === 0, "model routes: 4 of 5 passes is healthy, 2 of 5 is degraded");

// ---- the metric formulas (verbatim from migrations/2026-10-12-21-tick-driver-roster.sql)
const SINGLE_LIST = "SELECT capability FROM (SELECT capability FROM v_executor_roster WHERE kind IN ('worker', 'model') AND capability NOT LIKE 'worker:%' GROUP BY capability HAVING SUM(healthy = 1) = 1) ORDER BY capability";
ok(q1(w, DEGRADED).n === 3, "roster_members_degraded counts the three real faults of the fixture (worker-down, worker-stale, model-bad) and neither the member route nor the stub", q1(w, DEGRADED));
const singleAfter = qa(w, SINGLE_LIST).map((r) => r.capability);
ok(["backlog-inventory", "issue-drain", "stranded-job-recovery"].every((c) => singleAfter.includes(c)), "the member's three capabilities now count as single healthy executors (the measurement is correct; the metric reads 3 higher)", singleAfter);
// repairing the real faults brings the formula to 0
w.prepare("UPDATE worker_live_audit SET http = 200 WHERE worker = 'worker-down'").run();
w.prepare("UPDATE worker_live_audit SET probed_at = ? WHERE worker = 'worker-stale'").run(minsAgo(5));
w.prepare("UPDATE ai_calibration_results SET status = 'pass' WHERE target = 'model-bad'").run();
ok(q1(w, DEGRADED).n === 0, "once the real faults are repaired roster_members_degraded reads 0 although the stub and the member route stay in the registry", q1(w, DEGRADED));
{
  // the old view on the same repaired fixture still reads 2: the defect this file removes
  const wo = world();
  wo.prepare("UPDATE worker_live_audit SET http = 200 WHERE worker = 'worker-down'").run();
  wo.prepare("UPDATE worker_live_audit SET probed_at = ? WHERE worker = 'worker-stale'").run(minsAgo(5));
  wo.prepare("UPDATE ai_calibration_results SET status = 'pass' WHERE target = 'model-bad'").run();
  ok(q1(wo, DEGRADED).n === 3, "control: the old view on the same repaired fixture reads 3 (two member routes and the stub), so the metric cannot reach 0 without this file", q1(wo, DEGRADED));
  ok(!qa(wo, SINGLE_LIST).some((r) => r.capability === "issue-drain"), "control: the old view leaves the member's capabilities out of the single-executor count");
}

// ---- replay and rollback
{
  const viewRows = () => JSON.stringify(qa(w, "SELECT * FROM v_executor_roster ORDER BY kind, capability, executor"));
  const v1 = viewRows(), b1 = JSON.stringify(qa(w, "SELECT * FROM bak_20261026_v_executor_roster"));
  w.exec(sql);
  ok(viewRows() === v1, "a second apply leaves the view reading the same rows");
  ok(JSON.stringify(qa(w, "SELECT * FROM bak_20261026_v_executor_roster")) === b1, "and keeps the first backup (CREATE TABLE IF NOT EXISTS: the saved text stays the original view, not the new one)");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'EXECUTOR-ROSTER-MEMBERS-1:%'").n === 1, "and writes no second decision_log row");
}
{
  const wr = world();
  wr.exec(sql);
  const saved = q1(wr, "SELECT sql FROM bak_20261026_v_executor_roster").sql;
  wr.exec("DROP VIEW IF EXISTS v_executor_roster");
  wr.exec(saved);
  ok(qa(wr, "SELECT DISTINCT executor FROM v_executor_roster WHERE healthy = 0").map((r) => r.executor).includes("qnfo-backlog-exec"), "Rollback (drop the view, run the saved text) restores the previous behaviour");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
