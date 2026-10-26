// PROBE-PLAYBOOKS-1 offline suite: replays migrations/2026-10-26-probe-playbooks.sql on node:sqlite over the live column lists, the live close/contract triggers and the real
// BREACH-DOCTOR-1 engine (the block of qnfo-fleet-control/worker.js, run through a D1 stub), so a rule is proved the way the doctor runs it.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, no DELETE or DROP in the body, apply_migrations.py --check passes); the ten playbook rows exist, are enabled, mode on,
// and every one passes the engine's own validators (bdValidateRule: one SELECT for trigger and verify, one INSERT or UPDATE on an allowlisted table for each action and revert, ?1 only,
// no free-text column, no semicolon); over fixtures each rule's trigger_sql names exactly the issues it should (and not the near misses), its per-issue action touches only that issue,
// closes only through issue_triage.close_evidence built from ids and enum codes (never while an active contract fails), its revert_sql restores, and its verify_sql reads a reason before
// and ok after; a second run of an action changes nothing; the embedded PROBE-NEEDED-1 probe text equals rtLivePathProbe() of the worker character for character; the template probes read
// pending on the live shapes and ok when the condition is met, carry no semicolon and no write keyword, and refuse a title that tries to inject SQL; the green-at-birth form installs
// holding with its second read 60 minutes out; a BACKFILL-1 alias is superseded only after the template is live; the real engine (breachDoctorTick) takes the PN-R3, PB-R0 and
// template cases from diagnosed to verified in three ticks and demotes PN-R2 when the filer undoes a close; the metrics, triggers, root-cause mapping, refresher task, failure modes,
// detectors, control row, the code-lever issue (its code-anchor occurs once in worker.js, its probe reads pending today), capability and decision row are present; a second apply changes nothing.
// Run: node migrations/probe-playbooks.test.mjs     (PROBE_PLAYBOOKS_SQL=<file> runs the same checks against another file; an empty file shows the suite failing on the pre-change state)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => new URL(p, import.meta.url);
const sqlPath = process.env.PROBE_PLAYBOOKS_SQL || fileURLToPath(here("./2026-10-26-probe-playbooks.sql"));
const sql = readFileSync(sqlPath, "utf8");
const doctorSql = readFileSync(here("./2026-10-26-breach-doctor.sql"), "utf8");
const workerSrc = readFileSync(process.env.PP_WORKER_PATH || here("../qnfo-fleet-control/worker.js"), "utf8");
const dtest = readFileSync(here("./breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };
const IDS = ["PN-R1", "PN-R2", "PN-R3", "PB-R0", "PB-T1", "PB-T1-green", "PB-T3", "PB-T3-green", "PB-T4", "PB-T4-green"];

// ---- header and shape of the file
const header = sql.split("\n").filter((l) => l.startsWith("--"));
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/CREATE\s+(TRIGGER|TABLE|VIEW)/i.test(body), "no new table, view or D1 trigger (the engine and its three tables already exist)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/skip ci|ci skip/i.test(sql), "no skip-CI token");
{
  const stmts = body.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  const big = Math.max(...stmts.map((s) => s.length));
  ok(big < 40000, "no single statement is near the 100 KB D1 limit (largest " + big + " bytes)", big);
  if (existsSync(sqlPath) && sql.length > 100) {
    const r = spawnSync("python3", [fileURLToPath(here("../scripts/apply_migrations.py")), "--check", sqlPath], { encoding: "utf8" });
    ok(r.status === 0 && /"ok": true/.test(r.stdout), "scripts/apply_migrations.py --check accepts the file", (r.stdout + r.stderr).slice(0, 300));
  }
}

// ---- the engine and the worker's PN probe
const a = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:BEGIN ----"), b = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:END ----");
const kwLine = workerSrc.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m);
const pnFn = workerSrc.match(/function rtLivePathProbe\(id\) \{[\s\S]*?\n\}\n/);
ok(a > 0 && b > a && kwLine && pnFn, "the worker carries the BREACH-DOCTOR-1 block, the write-keyword list and rtLivePathProbe");
const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, Error, Promise, isFinite, console: { error() {}, log() {} }, VERSION: "0.52.0-test", crypto: globalThis.crypto, TextEncoder, Uint8Array });
vm.runInContext(kwLine[0] + "\n" + pnFn[0] + "\n" + workerSrc.slice(a, b) + "\nthis.api = { breachDoctorTick, bdValidateRule, bdWriteWhy, bdReadOnlyWhy, bdFactsSafe, rtLivePathProbe };", cx);
const api = cx.api;

// ---- the world: live column lists (BASE_DDL of the doctor suite), the doctor migration, the live triggers this file meets, then the file
const baseDdl = dtest.match(/const BASE_DDL = `([\s\S]*?)`;/)[1];
const EXTRA_DDL = `
CREATE TABLE IF NOT EXISTS loop_lock (k TEXT PRIMARY KEY, holder TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT NOT NULL, outcome TEXT NOT NULL, detail TEXT, task_id TEXT, path TEXT, model TEXT, attempts INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT);
CREATE TABLE portfolio_gaps (kind TEXT, entity TEXT, detail TEXT, first_seen TEXT, day TEXT, status TEXT, resolved_at TEXT, issue_id INTEGER, attempts INTEGER);
CREATE TABLE journey_state (journey TEXT, runner TEXT, ts TEXT, ok INTEGER, steps INTEGER, failed INTEGER, ms INTEGER, failed_json TEXT, version TEXT);
CREATE VIEW v_journey_state AS SELECT journey, runner, ts, ok, steps, failed, ms, failed_json, version, (julianday('now') - julianday(ts)) * 1440.0 AS age_min FROM journey_state;
CREATE VIEW v_metric_trigger_state AS SELECT t.id AS id, t.metric_key AS metric_key, t.title AS title, t.operator AS operator, t.threshold AS threshold, t.owner AS owner, t.queue_target AS queue_target, t.priority AS priority, CAST(m.last_value AS REAL) AS val,
  CASE WHEN m.last_value IS NULL THEN NULL WHEN t.operator = 'gt' AND CAST(m.last_value AS REAL) > t.threshold THEN 1 WHEN t.operator = 'lt' AND CAST(m.last_value AS REAL) < t.threshold THEN 1 ELSE 0 END AS hit FROM analytics_metric_triggers t JOIN metric_registry m ON m.metric = t.metric_key;
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL, retries INTEGER NOT NULL, version INTEGER NOT NULL, enabled INTEGER NOT NULL, updated_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL, timezone TEXT NOT NULL, last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END;
CREATE TRIGGER issue_close_evidence_weak_predicate_upd BEFORE UPDATE OF close_evidence ON issue_triage WHEN NEW.close_evidence IS NOT NULL AND NEW.close_evidence LIKE '%present in%' AND NEW.close_evidence LIKE '%directory listing%' BEGIN SELECT RAISE(ABORT,'CLOSE-EVIDENCE-WEAK-PREDICATE-1'); END;
CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;`;
const H = 3600000;
const isoAgo = (min, ms = false) => new Date(Date.now() - min * 60000).toISOString().slice(0, ms ? 23 : 19) + (ms ? "Z" : "Z");
function world(o = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(baseDdl);
  raw.exec(doctorSql);
  raw.exec(EXTRA_DDL);
  // the live ops_config rows the engine reads
  raw.exec("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('breach_doctor_max_actions', '20'), ('breach_doctor_max_cases', '60')");
  if (o.before) o.before(raw);
  if (o.apply !== false) raw.exec(sql);
  return raw;
}
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);
const n = (raw, t) => q1(raw, "SELECT COUNT(*) n FROM " + t).n;
const pbs = (raw) => Object.fromEntries(qa(raw, "SELECT * FROM breach_playbooks").map((r) => [r.rule_id, r]));

// ---- what the file added
{
  const raw = world();
  const P = pbs(raw);
  ok(IDS.every((id) => P[id]) && n(raw, "breach_playbooks") === 5 + IDS.length, "the ten playbook rows exist next to the five seed rows", Object.keys(P));
  ok(IDS.every((id) => P[id] && P[id].enabled === 1 && P[id].mode === "on" && P[id].action_kind === "sql" && P[id].max_per_tick >= 1 && P[id].max_per_tick <= 6 && P[id].max_per_day >= 12), "every row is enabled, mode on (the engine holds a new row 30 minutes in measure), sql, capped per tick and per day");
  for (const id of IDS) {
    const v = api.bdValidateRule(P[id] || {});
    ok(v && v.ok === true, "playbook " + id + " passes the engine's bdValidateRule", v);
    const act = JSON.parse((P[id] || {}).action_sql || "[]"), rev = JSON.parse((P[id] || {}).revert_sql || "[]");
    ok(act.length >= 1 && act.length <= 6 && rev.length >= 1 && act.concat(rev).every((s) => s.includes("?1") && !s.includes(";")), id + ": 1 to 6 action statements and a revert, each binds ?1 and has no semicolon");
    ok(/LIVE 2026-10-26 \d\d:\d\dZ: /.test((P[id] || {}).note || ""), id + ": the note quotes the live hit count");
  }
  ok(IDS.every((id) => !/\b(description|exceptions_json|last_error)\b/i.test(P[id].trigger_sql.replace(/'(?:[^']|'')*'/g, "''"))), "no trigger reads a free-text column");
  ok(n(raw, "agent_issues WHERE title = 'BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'") === 1 && n(raw, "agent_issues") === 4, "the file files one issue, the code lever (the doctor migration filed the other three)", n(raw, "agent_issues"));
}

// ---- the embedded PN probe equals the worker's rtLivePathProbe, character for character
{
  const raw = world();
  for (const t of [7411, 100435, 1000029]) {
    raw.prepare("INSERT INTO agent_issues (id, title, source, status, created_at, updated_at) VALUES (?, ?, 'qnfo-fleet-control', 'open', ?, ?)").run(9000000 + t, "PROBE-NEEDED-1: issue-" + t, Date.now() - 30 * H, Date.now());
    const want = api.rtLivePathProbe(t);
    // the SQL expression PN-R3 builds, extracted from its action statement
    const act = JSON.parse(pbs(raw)["PN-R3"].action_sql)[0];
    const expr = act.slice(act.indexOf("verify_probe = (SELECT ") + "verify_probe = ".length);
    const got = raw.prepare("SELECT " + expr.replace(/\?1/g, String(9000000 + t)) + " AS p").get().p;
    ok(got === want, "PN-R3's probe expression equals rtLivePathProbe(" + t + ")", { got: String(got).slice(0, 120), want: want.slice(0, 120) });
  }
}

// ---- fixtures
const MIN = 60000;
function fixtures(raw) {
  const iss = (id, title, o = {}) => {
    raw.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, close_channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, title, o.desc ?? null, o.source ?? "qnfo-fleet-control", o.priority ?? "high", o.status ?? "open", o.cc ?? null, Date.now() - (o.ageH ?? 30) * H, Date.now());
    raw.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01', ?)").run(id, o.evidence ?? null);
  };
  const con = (cls, issue, o = {}) => raw.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, module, attempts, expected_cadence_h) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'x', ?, ?, ?, ?, 1)")
    .run(cls, issue, o.probe ?? "SELECT 1", o.status ?? "active", o.verdict ?? null, o.module ?? null, o.attempts ?? 0);
  const lc = (issue, event, to, minAgo, ev = 0) => raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence, ts) VALUES (?, ?, 'open', ?, ?, ?)").run(issue, event, to, ev, isoAgo(minAgo, true));
  const V3 = "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status)";
  const circ = (id) => `SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = ${id}) AS observed`;
  const pn = (id, target, o = {}) => { iss(id, "PROBE-NEEDED-1: issue-" + target, { source: o.source ?? "qnfo-fleet-control", priority: "medium", ageH: o.ageH ?? 30 }); con("issue-" + id, id, { probe: o.probe ?? api.rtLivePathProbe(target), module: o.module ?? "reopen-live-path", status: o.status ?? "active", verdict: o.verdict ?? "deferred", attempts: 40 }); };

  // PN-R1: the target closed 3 hours ago (hit), closed 10 minutes ago (hysteresis), reopened 5 minutes ago, an open target, a failing contract, a foreign filer and a title with trailing text
  iss(7001, "TARGET closed long ago", { status: "closed", cc: "auto:triage-resolved-sync", evidence: "x" }); lc(7001, "dispositioned", "closed", 180, 1); pn(7101, 7001);
  iss(7002, "TARGET closed just now", { status: "closed", cc: "auto:x", evidence: "x" }); lc(7002, "dispositioned", "closed", 10, 1); pn(7102, 7002);
  iss(7003, "TARGET reopened and closed", { status: "closed", cc: "auto:x", evidence: "x" }); lc(7003, "dispositioned", "closed", 180, 1); lc(7003, "reopened", "open", 5); pn(7103, 7003);
  iss(7004, "TARGET still open"); pn(7104, 7004);
  iss(7005, "TARGET closed, PN contract failing", { status: "closed", cc: "auto:x", evidence: "x" }); lc(7005, "dispositioned", "closed", 180, 1); pn(7105, 7005, { verdict: "fail" });
  iss(7006, "TARGET closed, foreign filer", { status: "closed", cc: "auto:x", evidence: "x" }); lc(7006, "dispositioned", "closed", 180, 1); pn(7106, 7006, { source: "session" });
  iss(7007, "TARGET closed, junk title", { status: "closed", cc: "auto:x", evidence: "x" }); lc(7007, "dispositioned", "closed", 180, 1);
  iss(7107, "PROBE-NEEDED-1: issue-7007 (copy)", { priority: "medium" }); con("issue-7107", 7107, { probe: api.rtLivePathProbe(7007), module: "reopen-live-path" });

  // PN-R2: an OWNER-TASK and an OWNER-NOTE target (hits when the gate is open), an ordinary open target and an owner item whose PN is not the fleet's
  iss(7201, "OWNER-TASK-op-mvhw5vy4ce86: Audit all owner-local desktop AI", { source: "qnfo-fleet-dashboard:owner-request", priority: "critical" }); pn(7301, 7201);
  iss(7202, "OWNER-NOTE-49: UIA-SOURCE-FIDELITY-1: authorize the seven fixes", { source: "qnfo-fleet-dashboard:owner-request", priority: "critical" }); pn(7302, 7202);
  iss(7203, "OWNER-TASK-op-zzz: owned by a session", { source: "qnfo-fleet-dashboard:owner-request" }); pn(7303, 7203, { source: "session" });
  lc(7301, "opened", "open", 120); lc(7302, "opened", "open", 130); // the filer opened both 2 hours ago: the PN-R2 gate is shut

  // PN-R3: the fleet's own probe refused (hit), a session-written probe refused, a refused probe under another module, an active one, a refused one of a closed PN
  iss(7411, "ordinary orphan A"); pn(7401, 7411, { status: "probe-review-refused", verdict: "probe-review-refused" });
  iss(7412, "ordinary orphan B"); pn(7402, 7412, { status: "probe-review-refused", verdict: "probe-review-refused", probe: "SELECT 'ok' AS expected, 'ok' AS observed -- written by a session" });
  iss(7413, "ordinary orphan C"); pn(7403, 7413, { status: "probe-review-refused", verdict: "probe-review-refused", module: "probe-author-1" });
  iss(7414, "ordinary orphan D"); pn(7404, 7414);
  iss(7415, "ordinary orphan E"); pn(7405, 7415, { status: "probe-review-refused", verdict: "probe-review-refused", probe: api.rtLivePathProbe(7415) + " " });

  // PB-R0: a real probe superseded at birth (hit), a circular one, one reading issue_triage, one with another live contract, one with its own id in the text, another verdict, a closed issue
  const REALP = (o) => `SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM metric_improvement_now WHERE verdict = 'unmeasured' AND owner = '${o}') AS TEXT) AS observed`;
  iss(7501, "METRIC-UNMEASURED-1: qnfo-social has metrics with no value"); con("issue-7501", 7501, { status: "superseded", verdict: V3, module: "probe-template-v3-generic", probe: REALP("qnfo-social"), attempts: 3 });
  iss(7502, "circular one"); con("issue-7502", 7502, { status: "superseded", verdict: V3, module: "probe-template-v3-generic", probe: circ(7502) });
  iss(7503, "reads triage"); con("issue-7503", 7503, { status: "superseded", verdict: V3, probe: "SELECT 'x' AS expected, (SELECT close_evidence FROM issue_triage WHERE issue_id = 7503) AS observed" });
  iss(7504, "has a live contract"); con("issue-7504", 7504, { status: "superseded", verdict: V3, probe: REALP("a") }); con("issue-7504-X", 7504, { status: "active", probe: "SELECT 1" });
  iss(7505, "id in the text"); con("issue-7505", 7505, { status: "superseded", verdict: V3, probe: "SELECT 'x' AS expected, (SELECT status FROM v_other WHERE id = 7505) AS observed" });
  iss(7506, "other verdict"); con("issue-7506", 7506, { status: "superseded", verdict: "superseded:operator", probe: REALP("b") });
  iss(7507, "closed", { status: "closed", cc: "x", evidence: "x" }); con("issue-7507", 7507, { status: "superseded", verdict: V3, probe: REALP("c") });
  iss(7508, "reads the remediation tables"); con("issue-7508", 7508, { status: "superseded", verdict: V3, probe: "SELECT 'x' AS expected, (SELECT COUNT(*) FROM remediation_verifications) AS observed" });

  // T1: pending (open gap rows, superseded v3 contract and an active BACKFILL alias), green (all gap rows closed), no gap rows, a live non-circular contract, a RESOLVED-1 title
  const gap = (issue, status) => raw.prepare("INSERT INTO portfolio_gaps (kind, entity, detail, first_seen, day, status, issue_id, attempts) VALUES ('deploy-unrecorded', 'voice-stt', 'x', '2026-10-20', '2026-10-20', ?, ?, 1)").run(status, issue);
  iss(7601, "PORTFOLIO-GAP deploy-unrecorded voice-stt", { source: "portfolio-autopilot" }); con("issue-7601", 7601, { status: "superseded", verdict: V3, module: "probe-template-v3-generic", probe: circ(7601) });
  con("issue-7601-BACKFILL-1", 7601, { status: "active", verdict: "deferred", attempts: 241, probe: "SELECT 'x' AS expected, (SELECT close_evidence FROM issue_triage WHERE issue_id = 7601) AS observed" }); gap(7601, "open"); gap(7601, "open");
  iss(7602, "PORTFOLIO-GAP upgrade-compat qnfo-model-eval", { source: "portfolio-autopilot" }); con("issue-7602", 7602, { status: "superseded", verdict: V3, probe: circ(7602) }); gap(7602, "closed"); gap(7602, "resolved");
  iss(7603, "PORTFOLIO-GAP no-mapped-work umbrella", { source: "portfolio-autopilot" }); con("issue-7603", 7603, { status: "superseded", verdict: V3, probe: circ(7603) });
  iss(7604, "PORTFOLIO-GAP project-stale-deploy W.x", { source: "portfolio-autopilot" }); con("issue-7604", 7604, { status: "active", probe: "SELECT 'ok' AS expected, 'pending' AS observed" }); gap(7604, "open");
  iss(7605, "PORTFOLIO-GAP-RESOLVED-1: close a PORTFOLIO-GAP issue with evidence", { source: "sweep-fleet-tasks-c" }); con("issue-7605", 7605, { status: "superseded", verdict: V3, probe: circ(7605) }); gap(7605, "open");

  // T3: journey with failing runners (pending), journey with every runner ok and fresh (green), a stale journey, an injection title, an unknown journey
  const jr = (j, runner, ok, minAgo) => raw.prepare("INSERT INTO journey_state (journey, runner, ts, ok, steps, failed, ms) VALUES (?, ?, ?, ?, 3, ?, 10)").run(j, runner, isoAgo(minAgo), ok, ok ? 0 : 1);
  jr("binding-census", "cf", 0, 12); jr("binding-census", "gha", 0, 8); jr("loop-heartbeats", "cf", 1, 5); jr("loop-heartbeats", "gha", 1, 9); jr("stale-journey", "cf", 1, 400); jr("x' OR 1=1 --", "cf", 1, 5);
  iss(7701, "FLEET-JOURNEY-FAILED-1: binding-census (1 of 3 steps failing)", { source: "fleet-journeys" }); con("issue-7701", 7701, { status: "superseded", verdict: V3, probe: circ(7701) });
  iss(7702, "FLEET-JOURNEY-FAILED-1: loop-heartbeats (1 of 7 steps failing)", { source: "fleet-journeys" }); con("issue-7702", 7702, { status: "superseded", verdict: V3, probe: circ(7702) });
  iss(7703, "FLEET-JOURNEY-FAILED-1: x' OR 1=1 -- (1 of 2 steps failing)", { source: "fleet-journeys" }); con("issue-7703", 7703, { status: "superseded", verdict: V3, probe: circ(7703) });
  iss(7704, "FLEET-JOURNEY-FAILED-1: unknown-journey (1 of 2 steps failing)", { source: "fleet-journeys" }); con("issue-7704", 7704, { status: "superseded", verdict: V3, probe: circ(7704) });
  iss(7705, "FLEET-JOURNEY-FAILED-1: stale-journey (1 of 2 steps failing)", { source: "fleet-journeys" }); con("issue-7705", 7705, { status: "superseded", verdict: V3, probe: circ(7705) });

  // T4: metric trigger hitting (pending), not hitting (green), METRIC-TRIGGER-<id> form (pending), longest key wins, a title without a registered metric, a metric without a trigger
  const metric = (m, v, op, thr) => { raw.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES (?, 'operational', 'target', ?, 'MEASURED')").run(m, String(v)); if (op) raw.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, action, owner, queue_target) VALUES (?, ?, 't', 'registry', ?, ?, 'a', 'o', 'agent_issues')").run(op[0], m, op[1], thr); };
  metric("issues_unaccounted", 2231, [5001, "gt"], 0); metric("issues_unaccounted_extra", 9, [5002, "gt"], 5); metric("human_wait_oldest_min", 3, [5003, "gt"], 120); metric("q08_verified_votes_7d", 3, [786, "lt"], 5); metric("no_trigger_metric", 1, null, 0);
  iss(7801, "issues_unaccounted is permanently red by construction", { source: "owner-chat" }); con("issue-7801", 7801, { status: "superseded", verdict: V3, probe: circ(7801) });
  iss(7802, "human_wait_oldest_min: 'processed' emails never leave the view", { source: "owner-chat" }); con("issue-7802", 7802, { status: "superseded", verdict: V3, probe: circ(7802) });
  iss(7803, "METRIC-TRIGGER-786-Q08-VERIFIED-VOTES-7D: q08 gets under 5 reader votes a week"); con("issue-7803", 7803, { status: "superseded", verdict: "superseded:issue-contract-bridge", probe: circ(7803) });
  iss(7804, "issues_unaccounted_extra: a longer key that starts with a shorter one", { source: "owner-chat" }); con("issue-7804", 7804, { status: "superseded", verdict: V3, probe: circ(7804) });
  iss(7805, "nothing registered starts this title", { source: "owner-chat" }); con("issue-7805", 7805, { status: "superseded", verdict: V3, probe: circ(7805) });
  iss(7806, "no_trigger_metric: a metric with no trigger", { source: "owner-chat" }); con("issue-7806", 7806, { status: "superseded", verdict: V3, probe: circ(7806) });
  // a gap row of the same shape for a young issue: too young for the engine, never a case
  iss(7900, "PORTFOLIO-GAP young one", { source: "portfolio-autopilot", ageH: 1 }); con("issue-7900", 7900, { status: "superseded", verdict: V3, probe: circ(7900) }); gap(7900, "open");
  // class-C PN events in the last 24 hours keep the PN-R2 gate shut: the PN rows above were created by iss() without a lifecycle row, so none yet
}
const aged = (raw, minAgo = 120) => raw.prepare("UPDATE breach_playbooks SET created_at = ?").run(isoAgo(minAgo));
const hits = (raw, id) => qa(raw, "SELECT * FROM (" + pbs(raw)[id].trigger_sql + ")");
const hitIds = (raw, id) => hits(raw, id).map((h) => h.issue_id).sort((x, y) => x - y);
const act = (raw, id, issue) => { let ch = 0; for (const s of JSON.parse(pbs(raw)[id].action_sql)) ch += Number(raw.prepare(s).run(issue).changes); return ch; };
const rev = (raw, id, issue) => { for (const s of JSON.parse(pbs(raw)[id].revert_sql)) raw.prepare(s).run(issue); };
const vfy = (raw, id, issue) => raw.prepare(pbs(raw)[id].verify_sql).get(issue);
const st = (raw, id) => q1(raw, "SELECT status, close_channel FROM agent_issues WHERE id = ?", id);
const ct = (raw, cls) => q1(raw, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const openIds = (raw) => qa(raw, "SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id).join(",");
const contractSnap = (raw) => JSON.stringify(qa(raw, "SELECT * FROM remediation_contracts ORDER BY class"));
const triageSnap = (raw) => JSON.stringify(qa(raw, "SELECT * FROM issue_triage ORDER BY issue_id"));

const W = world({ before: fixtures });
aged(W);
const facts = (raw, id) => hits(raw, id).map((h) => JSON.parse(h.facts_json));

// ---- trigger_sql names exactly the issues the rule names
ok(JSON.stringify(hitIds(W, "PN-R1")) === "[7101]", "PN-R1 names the PN whose target closed 3 hours ago, not the 10-minute, the reopened, the open-target, the failing-contract, the foreign-filer or the junk-title one", hitIds(W, "PN-R1"));
ok(JSON.stringify(hitIds(W, "PN-R2")) === "[]", "PN-R2 names nothing while the filer opened class-C PNs 2 hours ago (the gate is shut)", hitIds(W, "PN-R2"));
ok(JSON.stringify(hitIds(W, "PN-R3")) === "[7401]", "PN-R3 names the refused PN with the fleet's own probe text, not a session-written probe, another module, an active contract or a probe with one extra character", hitIds(W, "PN-R3"));
ok(JSON.stringify(hitIds(W, "PB-R0")) === "[7501]", "PB-R0 names the superseded real probe, not the circular one, the triage reader, the live-contract one, the id literal, another verdict, a closed issue or a remediation-table reader", hitIds(W, "PB-R0"));
ok(JSON.stringify(hitIds(W, "PB-T1")) === "[7601,7900]" && JSON.stringify(hitIds(W, "PB-T1-green")) === "[7602]", "T1 names the PORTFOLIO-GAP with open gap rows (pending, and the young one: the engine's 120-minute age gate keeps it out of a case) and the one with every gap row closed (green); not the one without gap rows, with a live contract or the RESOLVED-1 title", { p: hitIds(W, "PB-T1"), g: hitIds(W, "PB-T1-green") });
ok(JSON.stringify(hitIds(W, "PB-T3")) === "[7701,7705]" && JSON.stringify(hitIds(W, "PB-T3-green")) === "[7702]", "T3 names the failing journey and the stale one (pending), the healthy journey (green); not the injection title or the unknown journey", { p: hitIds(W, "PB-T3"), g: hitIds(W, "PB-T3-green") });
ok(JSON.stringify(hitIds(W, "PB-T4")) === "[7801,7803,7804]" && JSON.stringify(hitIds(W, "PB-T4-green")) === "[7802]", "T4 names the metrics whose trigger hits (key titles and METRIC-TRIGGER-<id>) and the one that does not (green); not an unregistered title or a metric without a trigger", { p: hitIds(W, "PB-T4"), g: hitIds(W, "PB-T4-green") });
for (const id of IDS) for (const f of facts(W, id)) ok(api.bdFactsSafe(f), id + ": facts hold only numbers, ids and enum codes", f);
for (const id of IDS) for (const h of hits(W, id)) ok(Object.keys(h).sort().join() === "facts_json,issue_id,subject" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,48}$/.test(h.subject), id + ": trigger columns are issue_id, subject, facts_json", Object.keys(h));
{
  const f = Object.fromEntries(hits(W, "PB-T3").map((h) => [h.issue_id, JSON.parse(h.facts_json)]));
  ok(f[7701].journey === "binding-census" && f[7701].runners === 2 && f[7701].failing_runners === 2, "T3 facts name the journey and its runners", f[7701]);
  const m = Object.fromEntries(hits(W, "PB-T4").map((h) => [h.issue_id, JSON.parse(h.facts_json)]));
  ok(m[7801].metric === "issues_unaccounted" && m[7803].metric === "q08_verified_votes_7d" && m[7804].metric === "issues_unaccounted_extra" && m[7801].trigger_hit === 1, "T4 facts name the metric: the longest registered key wins and METRIC-TRIGGER-<id> resolves through the trigger", m);
}

// ---- the PN-R2 gate: shut while the filer opens or reopens PNs for class-C targets, open after 24 hours of quiet
function lcGate(raw, minAgo) { raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (7301, 'opened', NULL, 'open', ?)").run(isoAgo(minAgo, true)); }
{
  const raw = W;
  const clear = () => raw.prepare("DELETE FROM issue_lifecycle WHERE issue_id IN (7301, 7302)").run();
  clear(); lcGate(raw, 120);
  ok(JSON.stringify(hitIds(raw, "PN-R2")) === "[]", "PN-R2: a class-C PN opened 2 hours ago shuts the gate", hitIds(raw, "PN-R2"));
  clear(); raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (7301, 'reopened', 'closed', 'open', ?)").run(isoAgo(300, true));
  ok(JSON.stringify(hitIds(raw, "PN-R2")) === "[]", "PN-R2: a reopen 5 hours ago shuts it too", hitIds(raw, "PN-R2"));
  clear(); lcGate(raw, 25 * 60);
  ok(JSON.stringify(hitIds(raw, "PN-R2")) === "[7301,7302]", "PN-R2 names the two class-C PNs once the last class-C PN event is 25 hours old (7303 is not the fleet's PN)", hitIds(raw, "PN-R2"));
  const f = facts(raw, "PN-R2")[0];
  ok(f.target_id === 7201 && f.target_class === "owner-task" && f.filer_quiet_24h === 1, "PN-R2 facts", f);
  ok(act(raw, "PN-R2", 7203) === 0 && act(raw, "PN-R2", 7104) === 0, "PN-R2: a foreign filer's PN and an ordinary target are refused by the action");
}

// ---- each action touches only its issue, closes through the live trigger with evidence, reverts, verifies
{
  const raw = W;
  const before = openIds(raw);
  ok(vfy(raw, "PN-R1", 7101).observed === "pn-still-open", "PN-R1: verify reads pn-still-open before the action", vfy(raw, "PN-R1", 7101));
  ok(act(raw, "PN-R1", 7101) >= 1, "PN-R1: the action changes rows");
  const after = openIds(raw);
  ok(before.split(",").filter((x) => !after.split(",").includes(x)).join(",") === "7101", "PN-R1: it closed only PN 7101", [before, after]);
  ok(st(raw, 7101).status === "closed" && st(raw, 7101).close_channel === "auto:triage-sync:breach-doctor", "PN-R1: closed through the close-sync trigger as breach-doctor", st(raw, 7101));
  const ev = q1(raw, "SELECT rc, close_evidence e FROM issue_triage WHERE issue_id = 7101");
  ok(ev.rc === "breach-doctor:PN-R1" && /target issue 7001 is closed \(issue_lifecycle id \d+ at \d{4}-\d\d-\d\dT[\d:.]+Z, has_evidence 1\)/.test(ev.e) && /Closed by breach-doctor rule PN-R1 from ids and enum codes only/.test(ev.e) && !ev.e.includes(";"), "PN-R1: close_evidence names the target, the lifecycle id, its timestamp and the evidence flag, built from ids and enum codes", ev);
  ok(!/Audit|TARGET|owner-local/.test(ev.e), "PN-R1: no title text reached the evidence");
  ok(ct(raw, "issue-7101").status === "superseded" && ct(raw, "issue-7101").last_verdict === "superseded:pn-target-closed", "PN-R1: the PN's own contract is superseded");
  ok(vfy(raw, "PN-R1", 7101).observed === "ok", "PN-R1: verify reads ok after", vfy(raw, "PN-R1", 7101));
  ok(act(raw, "PN-R1", 7101) === 0, "PN-R1: a second run changes nothing");
  ok(st(raw, 7102).status === "open" && st(raw, 7103).status === "open" && st(raw, 7104).status === "open" && st(raw, 7105).status === "open" && st(raw, 7106).status === "open" && st(raw, 7107).status === "open", "PN-R1: every other PN stayed open");
  ok(act(raw, "PN-R1", 7105) === 0 && act(raw, "PN-R1", 7102) === 0 && act(raw, "PN-R1", 7104) === 0 && act(raw, "PN-R1", 7106) === 0, "PN-R1: the action itself refuses a failing contract, a fresh close, an open target and a foreign filer");
  rev(raw, "PN-R1", 7101);
  ok(st(raw, 7101).status === "open" && st(raw, 7101).close_channel === null && q1(raw, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 7101").e === null && ct(raw, "issue-7101").status === "active", "PN-R1: revert_sql reopens the PN, clears the evidence and puts the contract back", st(raw, 7101));
  act(raw, "PN-R1", 7101);
  // the target reopens: verify catches a close that was wrong
  raw.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 7001").run();
  raw.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 7101").run();
  ok(vfy(raw, "PN-R1", 7101).observed === "pn-still-open", "PN-R1: verify reads a reason when the PN is open again");
  raw.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 7101").run();
  ok(vfy(raw, "PN-R1", 7101).observed === "target-reopened", "PN-R1: and target-reopened when the target came back", vfy(raw, "PN-R1", 7101));
  raw.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 7001").run();
}
{
  const raw = W;
  const before = openIds(raw);
  ok(vfy(raw, "PN-R2", 7301).observed === "pn-reopened", "PN-R2: verify reads a reason while the PN is open", vfy(raw, "PN-R2", 7301));
  ok(act(raw, "PN-R2", 7301) >= 1, "PN-R2: the action changes rows once the gate is open");
  const after = openIds(raw);
  ok(before.split(",").filter((x) => !after.split(",").includes(x)).join(",") === "7301", "PN-R2: it closed only PN 7301", [before, after]);
  ok(st(raw, 7201).status === "open", "PN-R2: the target stays open as its own work item");
  const ev = q1(raw, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 7301").e;
  ok(ev.startsWith("SUPERSEDED BY #7201: ") && /an OWNER-TASK item/.test(ev) && /Closed by breach-doctor rule PN-R2 from ids and enum codes only/.test(ev) && !ev.includes(";") && !/Audit|desktop/.test(ev), "PN-R2: SUPERSEDED BY the target id, built from ids and enum codes (no title text)", ev);
  ok(vfy(raw, "PN-R2", 7301).observed === "ok", "PN-R2: verify reads ok after");
  // the filer undoes the close: issue_refile_reopen reopens the PN, verify then reads pn-reopened
  raw.prepare("INSERT OR IGNORE INTO agent_issues (title, source, status, created_at, updated_at) VALUES ('PROBE-NEEDED-1: issue-7201', 'qnfo-fleet-control', 'open', ?, ?)").run(Date.now(), Date.now());
  ok(st(raw, 7301).status === "open" && vfy(raw, "PN-R2", 7301).observed === "pn-reopened", "PN-R2: when the filer files again the D1 trigger reopens the PN and verify reads pn-reopened", vfy(raw, "PN-R2", 7301));
  raw.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 7301").run();
  rev(raw, "PN-R2", 7301);
  ok(st(raw, 7301).status === "open" && ct(raw, "issue-7301").status === "active", "PN-R2: revert_sql reopens the PN");
}
{
  const raw = W;
  const before = contractSnap(raw);
  ok(vfy(raw, "PN-R3", 7401).observed === "still-refused", "PN-R3: verify reads still-refused before");
  ok(act(raw, "PN-R3", 7401) === 1, "PN-R3: one row changes");
  const c = ct(raw, "issue-7401");
  ok(c.status === "active" && c.module === "probe-template-v4-pn" && c.last_verdict === null && c.attempts === 0 && c.next_due_at && c.verify_probe === api.rtLivePathProbe(7411), "PN-R3: the contract is active, module probe-template-v4-pn (PROBE-REVIEW-1 skips probe-template%), verdict cleared, probe text unchanged", c);
  const changedRows = qa(raw, "SELECT * FROM remediation_contracts").filter((r) => JSON.stringify(r) !== JSON.stringify(JSON.parse(before).find((x) => x.class === r.class))).map((r) => r.class);
  ok(changedRows.join() === "issue-7401", "PN-R3: only the contract of PN 7401 changed", changedRows);
  ok(vfy(raw, "PN-R3", 7401).observed === "ok", "PN-R3: verify reads ok after");
  ok(act(raw, "PN-R3", 7401) === 0 && act(raw, "PN-R3", 7402) === 0 && act(raw, "PN-R3", 7403) === 0 && act(raw, "PN-R3", 7404) === 0 && act(raw, "PN-R3", 7405) === 0, "PN-R3: a second run, a session-written probe, another module, an active contract and an altered text change nothing");
  ok(ct(raw, "issue-7402").status === "probe-review-refused" && ct(raw, "issue-7405").status === "probe-review-refused", "PN-R3: the refused contracts that are not the fleet's own text stay refused");
  rev(raw, "PN-R3", 7401);
  ok(ct(raw, "issue-7401").status === "probe-review-refused" && ct(raw, "issue-7401").module === "reopen-live-path", "PN-R3: revert_sql puts the refusal back");
  act(raw, "PN-R3", 7401);
  ok(st(raw, 7401).status === "open", "PN-R3 never closes an issue");
}
{
  const raw = W;
  ok(vfy(raw, "PB-R0", 7501).observed === "still-superseded", "PB-R0: verify reads still-superseded before");
  ok(act(raw, "PB-R0", 7501) === 1, "PB-R0: one row changes");
  const c = ct(raw, "issue-7501");
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.next_due_at && c.expected_cadence_h === 1 && /metric_improvement_now/.test(c.verify_probe) && c.module === "probe-template-v3-generic", "PB-R0: the contract is active with verdict NULL, attempts 0 and its own probe untouched", c);
  ok(vfy(raw, "PB-R0", 7501).observed === "ok", "PB-R0: verify reads ok after");
  ok(act(raw, "PB-R0", 7501) === 0 && [7502, 7503, 7504, 7505, 7506, 7507, 7508].every((i) => act(raw, "PB-R0", i) === 0), "PB-R0: a second run and every near miss change nothing");
  ok(ct(raw, "issue-7502").status === "superseded" && ct(raw, "issue-7504").status === "superseded" && ct(raw, "issue-7505").status === "superseded", "PB-R0: the circular, live-contract and id-literal contracts stay superseded");
  rev(raw, "PB-R0", 7501);
  ok(ct(raw, "issue-7501").status === "superseded" && /^superseded:closure-observing-probe-at-birth/.test(ct(raw, "issue-7501").last_verdict), "PB-R0: revert_sql restores the superseded status and a superseded-at-birth verdict");
  act(raw, "PB-R0", 7501);
}

// ---- templates: install, probe text, supersede the alias only after the template is live, green-at-birth holding, revert
{
  const raw = W;
  const probeRows = (cls) => raw.prepare(ct(raw, cls).verify_probe).get();
  // T1 pending
  ok(act(raw, "PB-T1", 7601) >= 1, "T1: the action changes rows");
  const c = ct(raw, "issue-7601");
  ok(c.status === "active" && c.module === "probe-template-v4-portfolio-gap" && c.verify_transport === "d1-query" && c.last_verdict === null && c.attempts === 0 && c.expected_cadence_h === 1 && c.deferred_since === null, "T1: active, module probe-template-v4-portfolio-gap, verdict NULL, attempts 0", c);
  ok(/^2 of 2 gap rows|^pending: 2 of 2 gap rows still open$/.test(probeRows("issue-7601").observed) && probeRows("issue-7601").expected === "resolved", "T1: the probe reads 'pending: 2 of 2 gap rows still open' on the live shape", probeRows("issue-7601"));
  ok(!c.verify_probe.includes(";") && !cx.__RT_WRITE_KW.some((k) => (" " + c.verify_probe.toLowerCase().replace(/\s+/g, " ") + " ").includes(" " + k)) && !/agent_issues|issue_triage|close_evidence/i.test(c.verify_probe), "T1: the probe has no semicolon, no write keyword and does not read the guarded issue or its triage row");
  ok(ct(raw, "issue-7601-BACKFILL-1").status === "superseded" && ct(raw, "issue-7601-BACKFILL-1").last_verdict === "superseded:circular-backfill-replaced", "R7: the circular BACKFILL-1 alias is superseded after the template is live");
  ok(vfy(raw, "PB-T1", 7601).observed === "ok", "T1: verify reads ok after");
  ok(act(raw, "PB-T1", 7601) === 0 || ct(raw, "issue-7601").module === "probe-template-v4-portfolio-gap", "T1: a second run leaves the template in place");
  ok([7602, 7603, 7604, 7605].every((i) => act(raw, "PB-T1", i) === 0), "T1: the near misses (all gap rows closed is the green form's, no gap rows, a live contract, RESOLVED-1 title) are refused by the pending action");
  // the probe turns ok when the rows close
  raw.prepare("UPDATE portfolio_gaps SET status = 'closed' WHERE issue_id = 7601").run();
  ok(probeRows("issue-7601").observed === "resolved" && probeRows("issue-7601").expected === "resolved", "T1: the probe reads resolved when every gap row is closed", probeRows("issue-7601"));
  raw.prepare("UPDATE portfolio_gaps SET status = 'open' WHERE issue_id = 7601").run();
  rev(raw, "PB-T1", 7601);
  ok(ct(raw, "issue-7601").status === "superseded" && ct(raw, "issue-7601-BACKFILL-1").status === "active", "T1: revert_sql supersedes the template contract and puts the alias back");
  // T1 green
  ok(act(raw, "PB-T1-green", 7602) >= 1, "T1 green: the action changes rows");
  const g = ct(raw, "issue-7602");
  ok(g.status === "holding" && g.module === "probe-template-v4-portfolio-gap" && g.last_verdict === null && probeRows("issue-7602").observed === "resolved", "T1 green: holding, and the probe already reads resolved", g);
  const due = (Date.parse(g.next_due_at.replace(" ", "T") + "Z") - Date.now()) / MIN;
  ok(due > 55 && due < 65, "T1 green: the second read is due in about 60 minutes (remediation_probe_edit_rerun reset it to now, so the install sets it last)", due);
  ok(act(raw, "PB-T1-green", 7601) === 0, "T1 green: refuses a pending issue");
}
{
  const raw = W;
  const probeRows = (cls) => raw.prepare(ct(raw, cls).verify_probe).get();
  ok(act(raw, "PB-T3", 7701) >= 1, "T3: the action changes rows");
  const c = ct(raw, "issue-7701");
  ok(c.status === "active" && c.module === "probe-template-v4-journey" && /journey = 'binding-census'/.test(c.verify_probe), "T3: active, module probe-template-v4-journey, the journey literal is the validated name", c.verify_probe.slice(0, 200));
  ok(probeRows("issue-7701").expected === "ok" && /^pending: (cf|gha) ok=0 age_min=\d+, (cf|gha) ok=0 age_min=\d+$/.test(probeRows("issue-7701").observed), "T3: the probe reads pending with every runner on the live shape", probeRows("issue-7701"));
  ok(!c.verify_probe.includes(";"), "T3: no semicolon in the probe (the D1 trigger remediation_probe_semicolon_upd would rewrite it)");
  raw.prepare("UPDATE journey_state SET ok = 1 WHERE journey = 'binding-census'").run();
  ok(probeRows("issue-7701").observed === "ok", "T3: the probe reads ok when every runner is ok and fresh");
  raw.prepare("UPDATE journey_state SET ok = 0 WHERE journey = 'binding-census'").run();
  ok(act(raw, "PB-T3", 7705) >= 1 && /^pending: /.test(probeRows("issue-7705").observed), "T3: a journey whose runner rows are older than 180 minutes reads pending (stale is not ok)", probeRows("issue-7705"));
  ok(act(raw, "PB-T3", 7703) === 0 && act(raw, "PB-T3", 7704) === 0 && act(raw, "PB-T3", 7702) === 0, "T3: an injection title, an unknown journey and a healthy journey are refused by the pending action");
  ok(ct(raw, "issue-7703").status === "superseded" && !/OR 1=1/.test(ct(raw, "issue-7703").verify_probe), "T3: nothing of the injection title reached a contract");
  ok(act(raw, "PB-T3-green", 7702) >= 1 && ct(raw, "issue-7702").status === "holding" && probeRows("issue-7702").observed === "ok", "T3 green: holding, and the probe already reads ok");
  ok(vfy(raw, "PB-T3", 7701).observed === "ok", "T3: verify reads ok after");
  rev(raw, "PB-T3", 7701);
  ok(ct(raw, "issue-7701").status === "superseded" && ct(raw, "issue-7701").module === "probe-template-v3-generic", "T3: revert_sql puts the superseded contract back");
}
{
  const raw = W;
  const probeRows = (cls) => raw.prepare(ct(raw, cls).verify_probe).get();
  ok(act(raw, "PB-T4", 7801) >= 1 && act(raw, "PB-T4", 7803) >= 1 && act(raw, "PB-T4", 7804) >= 1, "T4: the key titles and the METRIC-TRIGGER-<id> title are installed");
  ok(ct(raw, "issue-7801").status === "active" && ct(raw, "issue-7801").module === "probe-template-v4-metric" && /metric_key = 'issues_unaccounted' /.test(ct(raw, "issue-7801").verify_probe), "T4: active, module probe-template-v4-metric, the metric literal is the registered key", ct(raw, "issue-7801").verify_probe.slice(0, 160));
  ok(probeRows("issue-7801").observed === "pending: val=2231.0 gt 0.0", "T4: the probe reads 'pending: val=2231.0 gt 0.0' on the live shape", probeRows("issue-7801"));
  ok(/metric_key = 'q08_verified_votes_7d'/.test(ct(raw, "issue-7803").verify_probe) && probeRows("issue-7803").observed === "pending: val=3.0 lt 5.0", "T4: METRIC-TRIGGER-786 resolves through the trigger to its metric", probeRows("issue-7803"));
  ok(/metric_key = 'issues_unaccounted_extra'/.test(ct(raw, "issue-7804").verify_probe), "T4: the longest registered key wins");
  raw.prepare("UPDATE metric_registry SET last_value = '0' WHERE metric = 'issues_unaccounted'").run();
  ok(probeRows("issue-7801").observed === "ok", "T4: the probe reads ok when the trigger no longer hits");
  raw.prepare("UPDATE metric_registry SET last_value = '2231' WHERE metric = 'issues_unaccounted'").run();
  ok(act(raw, "PB-T4", 7802) === 0 && act(raw, "PB-T4", 7805) === 0 && act(raw, "PB-T4", 7806) === 0, "T4: a healthy metric, an unregistered title and a metric without a trigger are refused by the pending action");
  ok(act(raw, "PB-T4-green", 7802) >= 1 && ct(raw, "issue-7802").status === "holding" && probeRows("issue-7802").observed === "ok", "T4 green: holding, and the probe already reads ok");
}
ok(st(W, 7900).status === "open" && ct(W, "issue-7900").status === "superseded", "a young issue was never touched");

// ---- the real engine: three ticks take the cases from diagnosed to verified
function mkDb(raw) {
  const stmt = (s) => {
    let args = [];
    const self = {
      sql: s, bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: raw.prepare(s).all(...args) }; },
      async first() { return raw.prepare(s).get(...args) ?? null; },
      async run() { const r = raw.prepare(s).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return self;
  };
  return { prepare: stmt, async batch(stmts) { raw.exec("BEGIN"); try { const out = []; for (const s of stmts) out.push(await s.run()); raw.exec("COMMIT"); return out; } catch (e) { raw.exec("ROLLBACK"); throw e; } } };
}
const tick = async (raw) => cx.api.breachDoctorTick({ AUDIT_DB: mkDb(raw) }, {});
{
  const raw = world({ before: fixtures });
  aged(raw);
  lcGate(raw, 120); // the filer is not quiet: PN-R2 must not act
  const r1 = await tick(raw);
  ok(r1.ok === true && r1.mode === "on" && r1.taint_dropped === 0 && r1.rule_errors === 0, "engine tick 1: ok, mode on, no taint drop, no rule error", { ok: r1.ok, taint: r1.taint_dropped, errs: r1.rule_errors, err: r1.error });
  const cases = Object.fromEntries(qa(raw, "SELECT issue_id, rule_id, state, cause_class FROM breach_diagnoses WHERE rule_id NOT IN ('unclassified') ").map((r) => [r.issue_id, r]));
  ok(cases[7401] && cases[7401].rule_id === "PN-R3" && cases[7401].state === "applied", "engine: PN-R3 applied to PN 7401", cases[7401]);
  ok(cases[7501] && cases[7501].rule_id === "PB-R0" && cases[7501].state === "applied", "engine: PB-R0 applied to issue 7501", cases[7501]);
  ok(cases[7601] && cases[7601].rule_id === "PB-T1" && cases[7601].state === "applied" && cases[7602] && cases[7602].rule_id === "PB-T1-green", "engine: the T1 pending and green cases are applied", [cases[7601], cases[7602]]);
  ok(cases[7701] && cases[7701].rule_id === "PB-T3" && cases[7702] && cases[7702].rule_id === "PB-T3-green" && cases[7801] && cases[7801].rule_id === "PB-T4" && cases[7802] && cases[7802].rule_id === "PB-T4-green", "engine: T3 and T4 cases are applied in their pending and green forms");
  ok(!cases[7301] || cases[7301].state === "diagnosed" || cases[7301].rule_id !== "PN-R2", "engine: PN-R2 took no action while the filer was not quiet", cases[7301]);
  ok(st(raw, 7301).status === "open" && st(raw, 7302).status === "open", "engine: the class-C PNs are still open behind the gate");
  const dl = qa(raw, "SELECT action, rollback_path FROM decision_log WHERE actor = 'qnfo-fleet-control:breach-doctor'");
  ok(dl.length >= 8 && dl.every((d) => /BREACH-DOCTOR-1 (PN|PB)-/.test(d.action) && /revert_sql/.test(d.rollback_path)), "engine: every action wrote a decision_log row with its revert", dl.length);
  const r2 = await tick(raw), r3 = await tick(raw);
  const v = qa(raw, "SELECT issue_id, rule_id, state FROM breach_diagnoses WHERE state = 'verified' ORDER BY issue_id");
  ok(r2.ok && r3.ok && v.map((x) => x.issue_id).join() === "7101,7401,7501,7601,7602,7701,7702,7705,7801,7802,7803,7804", "engine: three ticks verify the PN-R1, PN-R3, PB-R0 and template cases (two consecutive verify passes)", v.map((x) => x.issue_id + ":" + x.rule_id));
  ok(qa(raw, "SELECT 1 FROM breach_diagnoses WHERE state IN ('failed','reverted')").length === 0, "engine: no case failed or reverted");
  ok(ct(raw, "issue-7601-BACKFILL-1").status === "superseded", "engine: the BACKFILL-1 alias was superseded by the template case");
  // the filer is quiet for 25 hours: PN-R2 acts on one PN a tick (max_per_tick 1), the filer undoes the close, verify fails and the gate shuts again
  raw.prepare("DELETE FROM issue_lifecycle WHERE issue_id IN (7301, 7302)").run();
  lcGate(raw, 25 * 60);
  await tick(raw);
  const closedNow = [7301, 7302].filter((i) => st(raw, i).status === "closed");
  ok(closedNow.length === 1 && st(raw, 7201).status === "open" && st(raw, 7202).status === "open", "engine: with the gate open PN-R2 closes one class-C PN a tick (max_per_tick 1) and leaves both targets open", { a: st(raw, 7301), b: st(raw, 7302) });
  ok(st(raw, 7303).status === "open", "engine: it did not touch the foreign PN");
  const first = closedNow[0], firstTarget = first === 7301 ? 7201 : 7202, second = first === 7301 ? 7302 : 7301;
  // the filer files again for the first target: issue_refile_reopen reopens the PN and logs a reopened event, which shuts the gate
  raw.prepare("INSERT OR IGNORE INTO agent_issues (title, source, status, created_at, updated_at) VALUES ('PROBE-NEEDED-1: issue-" + firstTarget + "', 'qnfo-fleet-control', 'open', ?, ?)").run(Date.now(), Date.now());
  raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (?, 'reopened', 'closed', 'open', ?)").run(first, isoAgo(1, true));
  ok(st(raw, first).status === "open", "the filer's insert reopened the PN (issue_refile_reopen)");
  await tick(raw);
  const failed = qa(raw, "SELECT issue_id, error_code FROM breach_diagnoses WHERE rule_id = 'PN-R2' AND state = 'failed'");
  ok(failed.length === 1 && failed[0].issue_id === first && failed[0].error_code === "verify-failed", "engine: the PN-R2 case fails verify (the filer undid the close)", failed);
  ok(st(raw, second).status === "open", "engine: the gate is shut again, so the second class-C PN is not touched", st(raw, second));
  ok(q1(raw, "SELECT mode FROM breach_playbooks WHERE rule_id = 'PN-R2'").mode === "on", "engine: one failure in 24 hours does not demote the rule (the flap is one PN a day)");
  // a second quiet period and a second undone close: two failures in 24 hours demote the rule
  raw.prepare("DELETE FROM issue_lifecycle WHERE issue_id IN (7301, 7302)").run();
  lcGate(raw, 25 * 60);
  await tick(raw);
  ok(st(raw, second).status === "closed", "engine: after another quiet period PN-R2 closes the second one", st(raw, second));
  raw.prepare("UPDATE agent_issues SET status = 'open', updated_at = ? WHERE id = ?").run(Date.now(), second);
  raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (?, 'reopened', 'closed', 'open', ?)").run(second, isoAgo(1, true));
  await tick(raw);
  await tick(raw);
  ok(q1(raw, "SELECT mode FROM breach_playbooks WHERE rule_id = 'PN-R2'").mode === "measure", "engine: two failed cases in 24 hours demote PN-R2 to measure, which stops the flap", q1(raw, "SELECT mode, substr(note, 1, 60) n FROM breach_playbooks WHERE rule_id = 'PN-R2'"));
}

// ---- engine, kill switch and measure: nothing changes with the doctor off, and a rule younger than 30 minutes only diagnoses
{
  const raw = world({ before: fixtures });
  const snap = contractSnap(raw) + triageSnap(raw);
  raw.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('breach_doctor', 'off')").run();
  await tick(raw);
  ok(contractSnap(raw) + triageSnap(raw) === snap, "breach_doctor = off: no contract or triage row changes");
  raw.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('breach_doctor', 'on')").run();
  await tick(raw);
  ok(contractSnap(raw) + triageSnap(raw) === snap && qa(raw, "SELECT 1 FROM breach_diagnoses WHERE rule_id LIKE 'P%-%' AND mode = 'measure'").length >= 7, "a row younger than 30 minutes runs in measure: it records the would-do and changes no contract", n(raw, "breach_diagnoses"));
}

// ---- metrics, triggers, root cause, refresher, failure modes, detectors, control, code lever, capability, decision
{
  const raw = world({ before: fixtures });
  const MET = ["orphan_issues_no_live_path", "probe_author_accept_rate_7d", "pn_open_over_120m"];
  ok(MET.every((m) => q1(raw, "SELECT 1 x FROM metric_registry WHERE metric = ?", m)), "the three metrics are registered");
  ok(MET.every((m) => q1(raw, "SELECT 1 x FROM analytics_metric_triggers WHERE metric_key = ? AND enabled = 1", m)), "each has an enabled trigger");
  const trig = (k) => q1(raw, "SELECT operator, threshold, cooldown_hours c, action FROM analytics_metric_triggers WHERE metric_key = ?", k);
  ok(trig(MET[0]).operator === "gt" && trig(MET[0]).threshold === 0 && trig(MET[1]).operator === "lt" && trig(MET[1]).threshold === 25 && trig(MET[2]).operator === "gt" && trig(MET[2]).threshold === 0, "targets: orphans > 0, accept rate < 25, PN over 120 minutes > 0");
  ok(MET.every((m) => trig(m).c <= 2) && MET.every((m) => /Read: /.test(trig(m).action) && /Done when /.test(trig(m).action) && !/code-task:|code-anchor:/.test(trig(m).action)), "SLA-120M-1: no cooldown over 2 hours; each action says what to read and when it is done and carries no code-task line");
  ok(qa(raw, "SELECT metric_key FROM metric_breach_cause WHERE metric_key IN ('" + MET.join("','") + "') AND cause_key IN (SELECT cause_key FROM breach_causes)").length === 3, "BREACH-ONE-MEANING-1: each metric maps to a breach_causes row");
  ok(MET.every((m) => !/hours|days/i.test(q1(raw, "SELECT warning_band||kill_band w FROM metric_registry WHERE metric = ?", m).w)), "no band is stated in hours or days");
  // the refresher: first reading at apply, then the task's own SQL
  const val = (m) => q1(raw, "SELECT last_value v, state s FROM metric_registry WHERE metric = ?", m);
  ok(val(MET[0]).s === "MEASURED" && Number(val(MET[0]).v) > 0 && val(MET[2]).s === "MEASURED" && val(MET[1]).v === "100", "the first readings are written at apply: orphans > 0 on the fixture, the accept rate reads 100 below 30 attempts", [val(MET[0]), val(MET[1]), val(MET[2])]);
  const task = JSON.parse(q1(raw, "SELECT definition d FROM fleet_tasks WHERE id = 'probe-playbooks-metrics'").d);
  ok(task.steps.length === 3 && task.steps.every((s) => s.type === "sql" && s.db === "AUDIT" && /^UPDATE metric_registry SET last_value/.test(s.sql)), "the fleet_tasks workflow has one UPDATE step per metric");
  ok(q1(raw, "SELECT cron_expr c, enabled e FROM fleet_crons WHERE task_id = 'probe-playbooks-metrics'").c === "*/10 * * * *", "and a 10-minute fleet_crons row");
  // 30 attempts: 3 accepted of 30 reads 10, 12 of 30 reads 40
  const ev = (kind, i) => raw.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, ?, 'x', 'qnfo-fleet-control', 'ok')").run(kind + i, isoAgo(60, true), kind);
  for (let i = 0; i < 3; i++) ev("remediation.probe-authored", i);
  for (let i = 0; i < 27; i++) ev("remediation.probe-author-reject", i);
  for (const s of task.steps) raw.prepare(s.sql).run();
  ok(val(MET[1]).v === "10.0", "the accept rate reads 10.0 for 3 accepted of 30 attempts", val(MET[1]));
  ok(Number(val(MET[0]).v) === q1(raw, "SELECT COUNT(*) n FROM agent_issues a WHERE a.status = 'open' AND a.title NOT LIKE 'OWNER-TASK%' AND a.title NOT LIKE 'OWNER-NOTE%' AND a.created_at <= (CAST(strftime('%s','now') AS INTEGER) - 3600) * 1000 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active','holding','monitoring','escalated') AND c.class NOT LIKE '%-BACKFILL-1' AND instr(lower(c.verify_probe), 'close_evidence') = 0)").n, "the orphan metric equals the stricter orphan definition", val(MET[0]));
  ok(Number(val(MET[2]).v) === q1(raw, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open' AND title LIKE 'PROBE-NEEDED-1: issue-%' AND created_at <= (CAST(strftime('%s','now') AS INTEGER) - 7200) * 1000").n && Number(val(MET[2]).v) === 15, "pn_open_over_120m counts the open PN older than 120 minutes (15 in the fixture)", val(MET[2]));

  // failure modes and detectors
  const FM = { "probe-author-unreachable": "fm-probe-author-unreachable", "pn-probe-refused-by-reviewer": "fm-pn-probe-refused", "pn-target-closed-open": "fm-pn-target-closed-open", "born-superseded-real-probe": "fm-born-superseded-real-probe" };
  for (const [k, cls] of Object.entries(FM)) {
    ok(q1(raw, "SELECT 1 x FROM failure_modes WHERE fm_key = ? AND probe_class = ? AND issue_id = 1000266", k, cls), "failure mode " + k + " with probe_class " + cls);
    const c = ct(raw, cls);
    ok(c && c.status === "active" && c.verify_transport === "d1-query" && c.module === "failure-mode" && c.issue_id === null, "detector contract " + cls + " is an active d1-query failure-mode detector", c);
    const p = raw.prepare(c.verify_probe).get();
    ok(p && typeof p.expected === "string" && typeof p.observed === "string" && !cx.__RT_WRITE_KW.some((kw) => (" " + c.verify_probe.toLowerCase().replace(/\s+/g, " ") + " ").includes(" " + kw)), cls + ": the probe runs and passes the write-keyword guard", p);
  }
  ok(["fm-pn-probe-refused", "fm-pn-target-closed-open", "fm-born-superseded-real-probe"].every((c) => Date.parse(ct(raw, c).next_due_at.replace(" ", "T") + "Z") - Date.now() > 80 * MIN), "the three repair detectors are first read after the playbooks had time to act");
  const fmv = (cls) => raw.prepare(ct(raw, cls).verify_probe).get();
  ok(fmv("fm-pn-probe-refused").observed === "4" && fmv("fm-pn-target-closed-open").observed === "4" && fmv("fm-born-superseded-real-probe").observed === "1", "the detectors count the fixture defects (4 refused PN, 4 PN with a target closed for an hour, 1 superseded real probe: the same predicate as PB-R0)", [fmv("fm-pn-probe-refused"), fmv("fm-pn-target-closed-open"), fmv("fm-born-superseded-real-probe")]);
  // fm-probe-author-unreachable: reads pending when PN were filed and the author left no event, ok once it did
  raw.prepare("DELETE FROM cloud_ops_events").run();
  ok(fmv("fm-probe-author-unreachable").observed === "ok", "fm-probe-author-unreachable reads ok when no PROBE-NEEDED-1 was filed");
  for (let i = 0; i < 3; i++) raw.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, 'remediation.probe-needed-filed', 'x', 'qnfo-fleet-control', 'warn')").run("f" + i, isoAgo(30, true));
  ok(fmv("fm-probe-author-unreachable").observed === "pending: 3 probe-needed filings and 0 author attempts in 24 hours", "and pending when 3 were filed and the author left no event (the 2026-10-26 state: 0 events against 77 filings)", fmv("fm-probe-author-unreachable"));
  raw.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('r1', ?, 'remediation.probe-author-reject', 'x', 'qnfo-fleet-control', 'warn')").run(isoAgo(20, true));
  ok(fmv("fm-probe-author-unreachable").observed === "ok", "and ok once the author recorded a reject");

  // the control row and the code lever
  const cl = q1(raw, "SELECT * FROM agent_issues WHERE title = 'BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'");
  ok(cl && cl.source === "qnfo-fleet-control" && cl.status === "open" && cl.category === "autonomy", "the code-lever issue is open with the trusted source qnfo-fleet-control and the BREACH-DOCTOR-1: prefix");
  const lines = cl.description.split("\n");
  const anchor = lines.find((l) => l.startsWith("code-anchor: ")).slice("code-anchor: ".length);
  ok(lines.filter((l) => l.startsWith("code-task: ")).join() === "code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js" && lines.filter((l) => l.startsWith("code-anchor: ")).length === 1, "it carries exactly one code-task and one code-anchor line");
  ok(workerSrc.split(anchor).length === 2, "its code-anchor occurs exactly once in qnfo-fleet-control/worker.js", workerSrc.split(anchor).length - 1);
  ok(/RT_LIVEPATH_ORPHAN_SQL = /.test(workerSrc) && workerSrc.indexOf(anchor) > workerSrc.indexOf("var RT_LIVEPATH_ORPHAN_SQL") && workerSrc.indexOf(anchor) - workerSrc.indexOf("var RT_LIVEPATH_ORPHAN_SQL") < 400, "the anchor is inside RT_LIVEPATH_ORPHAN_SQL");
  ok(!/OWNER-TASK/.test(workerSrc.slice(workerSrc.indexOf("var RT_LIVEPATH_ORPHAN_SQL"), workerSrc.indexOf("async function rtFileLivePathIssue"))), "the defect exists on main today: the filer's orphan SQL has no OWNER-TASK exclusion");
  const clc = ct(raw, "issue-" + cl.id);
  ok(clc.status === "active" && clc.verify_transport === "d1-query" && clc.module === "breach-doctor" && clc.verify_probe !== "needs-machine-probe", "its contract is the active d1-query outcome probe", clc);
  ok(!/(^|[^a-z])(insert|update|delete|drop|alter|create|replace) /i.test(clc.verify_probe.replace(/'[^']*'/g, "''")) && !clc.verify_probe.includes(";"), "the outcome probe passes the runners' write-keyword guard");
  ok(raw.prepare(clc.verify_probe).get().observed.startsWith("pending: the filer opened or reopened 2 "), "the outcome probe reads pending while the filer opened a class-C PN in the last 24 hours (it did 6 times on 2026-10-26)", raw.prepare(clc.verify_probe).get());
  raw.prepare("DELETE FROM issue_lifecycle").run();
  ok(raw.prepare(clc.verify_probe).get().observed === "ok", "and ok after 24 hours of quiet");
  const ctl = q1(raw, "SELECT * FROM control_registry WHERE control = 'pn-r2-filer-quiet-gate'");
  ok(ctl && ctl.kind === "gate" && ctl.disposition === "replace" && ctl.issue_id === cl.id && /review by 2026-11-02/.test(ctl.evidence) && /issue_refile_reopen/.test(ctl.guards_against) && ctl.alternate_path, "the gate is in control_registry with its reason, its replacement (the code lever), its alternate path and a dated expiry", ctl);
  ok(q1(raw, "SELECT 1 x FROM capability_ledger WHERE capability = 'probe-playbooks:repair-closing-paths'"), "the capability is in the ledger");
  const d = qa(raw, "SELECT * FROM decision_log WHERE action LIKE 'PROBE-PLAYBOOKS-1:%'");
  ok(d.length === 1 && IDS.every((id) => d[0].action.includes(id)) && d[0].predicted_outcome === "breaches_auto_remediated_24h >= 6 within 24 h", "one decision_log row names every rule and predicts an outcome the doctor has to earn", d.map((x) => x.predicted_outcome));
  if (q1(raw, "SELECT name FROM sqlite_master WHERE name = 'decision_predictions'")) ok(n(raw, "decision_predictions") >= 1 && q1(raw, "SELECT subject FROM decision_predictions ORDER BY id DESC LIMIT 1").subject === "breaches_auto_remediated_24h", "decision_predictions_parse scored the prediction on breaches_auto_remediated_24h");
}

// ---- idempotence
{
  const raw = world({ before: fixtures });
  const tables = ["breach_playbooks", "metric_registry", "analytics_metric_triggers", "metric_breach_cause", "fleet_tasks", "fleet_crons", "failure_modes", "remediation_contracts", "agent_issues", "control_registry", "capability_ledger", "decision_log", "issue_triage"];
  const snap = () => JSON.stringify(tables.map((t) => qa(raw, "SELECT * FROM " + t + " ORDER BY 1, 2")));
  const before = snap();
  raw.exec(sql);
  ok(snap() === before, "a second apply changes nothing (playbooks, metrics, triggers, tasks, failure modes, detectors, the issue, the control, the ledger rows)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
