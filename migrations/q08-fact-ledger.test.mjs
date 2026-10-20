// Q08-FACT-LEDGER-1 offline suite for migrations/2026-10-19-q08-fact-ledger.sql (q08-signal-engine 0.32.0, agent_issues 2606).
// Replays the file twice on SQLite against the live qnfo-audit definitions of control_registry, failure_modes, remediation_contracts,
// capability_ledger, decision_log (with its append-only triggers), ops_config and control_alternate_probes (read from sqlite_master on 2026-10-19),
// seeded to the pre-apply counts the file header quotes. Proves: the header opts into CI, names a one-line rollback that leaves decision_log alone and quotes the pre-apply
// counts; the file adds exactly one control, failure mode, detector contract, capability and decision and one ops_config row however often it is
// replayed (a replay is a no-op, the decision_log insert included) and touches none of the rows that were there; every row passes the table's own
// CHECKs; the control names the off switch as its tested alternate and states the unmeasured cost; the switch key, the pre-check marker and the three
// item texts the probe reads are the ones the worker writes; the detector is a plain SELECT and counts, on a q08-signal fixture, exactly the gate_failed
// runs that logged their calls, reached the panel and ended on a name, year or figure item; and the Rollback line removes every row the file added
// while the append-only decision_log row stays.
// The control is on the critical path, so (the second review) it is NOT hand-stamped: alternate_tested_at is NULL, exactly one enabled read-only
// control_alternate_probes row (expected/observed, one SELECT, a window in minutes) names the first of four parts that is gone (the control row, the
// switch row with a value of on, prune or off, the active detector contract, and (the third review) the latest successful q08-signal-engine deploy in
// deployment_history being 0.32.0 or later) and reads ok while all four hold, the live definitions of
// v_control_alternate_status / v_control_alternate_untested read the new control as probe-never-run (a probe the drill has yet to run, not no-probe and not
// hand-stamped), a drill that runs while the worker is still on 0.31.3 fails the probe and stamps nothing, and a drill after the 0.32.0 deploy reads it as
// drilled, and the Rollback line removes the probe row too. The deploy part is the only part the file itself cannot make true: it is tested against a
// deployment_history fixture that carries the live version-monotonic trigger (the repo generator scripts/test_version_monotonic_trigger.py, the text read from sqlite_master)
// for 0.31.3, 0.32.0, a lower row refused by VERSION-MONOTONIC-1 (qnfo-ops never writes ROLLBACK-OK, so a canary revert cannot lower the latest row), an intentional
// rollback written with ROLLBACK-OK, other workers, failed and non-deploy rows, numeric versus text order and an empty ledger. The decision_log row does not claim the alternate was drilled and quotes no branch commit hash.
// Q08_FACT_LEDGER_SQL=<path> replays another file (an empty one shows the suite failing on the base).
// Run: node migrations/q08-fact-ledger.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.Q08_FACT_LEDGER_SQL || here("2026-10-19-q08-fact-ledger.sql"), "utf8");
const worker = readFileSync(new URL("../q08-signal-engine/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];

// The live deployment_history_version_monotonic_ins text, from the repo's own generator (identical to qnfo-audit sqlite_master on 2026-10-20).
const MONOTONIC_TRIGGER = execFileSync("python3", ["-I", fileURLToPath(new URL("../scripts/test_version_monotonic_trigger.py", import.meta.url)), "--emit"], { encoding: "utf8" }).split("\n").find((l) => l.startsWith("CREATE TRIGGER deployment_history_version_monotonic_ins"));
const SCHEMA = `
CREATE TABLE control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE failure_modes (
  fm_key TEXT PRIMARY KEY,
  failure_mode TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  remediation TEXT NOT NULL,
  detector TEXT NOT NULL,
  probe_class TEXT,
  first_seen TEXT NOT NULL,
  issue_id INTEGER
, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE capability_ledger (
  capability TEXT PRIMARY KEY,
  provenance TEXT NOT NULL,
  prerequisites TEXT,
  reliability TEXT,
  acquired_at TEXT NOT NULL,
  last_exercised_at TEXT,
  evidence TEXT NOT NULL
);
CREATE TABLE decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  assumption TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  outcome TEXT NOT NULL,
  blast_radius TEXT NOT NULL,
  rollback_path TEXT NOT NULL
, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE deployment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_type TEXT,
            resource_name TEXT,
            action TEXT,
            version_id TEXT,
            deployed_by TEXT,
            deployed_at TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'success',
            notes TEXT
        , _version INTEGER DEFAULT 1, wbs_code TEXT);
CREATE TABLE control_alternate_probes (
  control TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_pass INTEGER,
  last_pass_at TEXT,
  last_observed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- The live views the scorecard reads (sqlite_master of qnfo-audit, 2026-10-19 23:10Z), verbatim.
CREATE VIEW v_control_alternate_status AS
SELECT c.control AS control, c.critical_path AS critical_path, c.disposition AS disposition, c.disposition_state AS disposition_state,
  c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at,
  p.enabled AS probe_enabled, p.last_run_at AS last_run_at, p.last_pass AS last_pass, p.last_pass_at AS last_pass_at, p.last_observed AS last_observed,
  p.window_note AS window_note,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    WHEN p.last_pass IS NOT 1 THEN 'probe-failing'
    WHEN p.last_pass_at IS NULL OR p.last_pass_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-480 minutes') THEN 'probe-stale'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control;
CREATE VIEW v_control_alternate_untested AS
SELECT
  (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL) AS critical_untested_by_register,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state NOT IN ('no-alternate', 'removed', 'not-exercisable', 'drilled')) AS critical_untested_by_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state IN ('probe-disabled', 'probe-never-run', 'probe-failing', 'probe-stale')) AS critical_probe_not_drilled,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state = 'no-probe') AS critical_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL) AS controls_untested_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NOT NULL) AS controls_hand_stamped_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'probe-failing') AS probes_failing,
  (SELECT COUNT(*) FROM control_alternate_probes WHERE enabled = 1) AS probes_enabled,
  (SELECT COUNT(*) FROM control_alternate_probes) AS probes_total;
`;
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const cnt = (db, t) => one(db, "SELECT COUNT(*) AS n FROM " + t).n;

// The pre-apply state the header quotes (read from qnfo-audit on 2026-10-19 22:45Z): 3 q08 controls, 10 q08 failure modes with 10 active fm-q08 contracts,
// 2 q08 capabilities, 3 q08 ops_config keys, no q08 decision for this change, and the deploy ledger with q08-signal-engine at 0.31.3-codeagent (read from
// qnfo-audit deployment_history on 2026-10-19 23:35Z, newest last; the rows of two other workers sit after it, as they do live).
const PRE = {
  controls: ["q08-source-sufficiency-pregate", "q08-repeat-class-repair-stop", "q08-reviewer-health-order"],
  fms: ["q08-analysis-marker-rejected", "q08-lede-provenance-unprunable", "q08-panel-pass-share-low", "q08-prune-floor-revision-loop", "q08-prune-short-revise-unpruned", "q08-repeat-class-extension", "q08-reviewer-error-share", "q08-thin-source-composed", "q08-title-only-writer-fallthrough", "q08-verdict-line-missing"],
  caps: ["q08-reviewer-health-order", "q08-run-yield-log"],
  cfg: ["q08_max_per_day", "q08_compose_temperature", "q08_panel_order"],
  probes: ["rt-ensure-live-path"], // a probe of another control: none of q08 had one (control_alternate_probes control LIKE 'q08%' = 0)
  deploys: [["q08-signal-engine", "deploy", "0.31.0-yield-1"], ["q08-signal-engine", "deploy", "0.31.1-panel-calibration-1"], ["q08-signal-engine", "deploy", "0.31.2-codeagent"], ["q08-signal-engine", "deploy", "0.31.3-codeagent"], ["qnfo-ai", "deploy", "5.37.1-email-binding"], ["qnfo-code-orchestrator", "deployed", "e11edf7c-f2eb-428c-8965-4b70269f6e32"]],
};
const seeded = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.exec(MONOTONIC_TRIGGER); // the live ledger trigger: a row below the highest version already recorded for the worker is refused unless its notes say ROLLBACK-OK
  for (const c of PRE.controls) db.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, evidence) VALUES (?, 'x', 'filter', 0, 'keep', 'seed')").run(c);
  for (const f of PRE.fms) {
    db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen) VALUES (?, 'x', 'x', 'x', 'x', ?, '2026-10-01')").run(f, "fm-" + f);
    db.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, 'x', 'x', 'SELECT 1', 'd1-query', 'q08-signal-engine', 'active')").run("fm-" + f);
  }
  for (const c of PRE.caps) db.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES (?, 'x', '2026-10-19T00:00:00Z', 'seed')").run(c);
  for (const k of PRE.cfg) db.prepare("INSERT INTO ops_config (key, value, note) VALUES (?, 'v', 'seed')").run(k);
  for (const k of PRE.probes) db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES (?, 'SELECT 1', 'seed', 1)").run(k);
  for (const [n, a, v] of PRE.deploys) db.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, status) VALUES ('worker', ?, ?, ?, 'qnfo-ops:cf_worker_deploy', 'success')").run(n, a, v);
  return db;
};
// A row of the deploy ledger the canonical path writes (action 'deploy', status 'success'); o overrides the worker, action or status.
const deploy = (d, version, o = {}) => d.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, status, notes) VALUES ('worker', ?, ?, ?, 'qnfo-ops:cf_worker_deploy', ?, ?)").run(o.name || "q08-signal-engine", o.action || "deploy", version, o.status || "success", o.notes || null);
const refused = (fn) => { try { fn(); return ""; } catch (e) { return String(e && e.message || e); } };
const RB = { notes: "ROLLBACK-OK intentional rollback" }; // the only way the live trigger lets a lower version in

// ---- header: CI opt-in, database, one-line rollback, the pre-apply counts ------------------------------------------------------------------------
const lines = sql.split("\n");
const head = (k) => lines.find((l) => l.startsWith("-- " + k + ":"));
ok(head("APPLY-BY") === "-- APPLY-BY: ci" && head("DB") === "-- DB: qnfo-audit", "the header opts into CI and names qnfo-audit");
const rollback = (head("Rollback") || "").replace(/^-- Rollback:\s*/, "");
ok(rollback.length > 0 && lines.filter((l) => l.startsWith("-- Rollback:")).length === 1, "exactly one Rollback line", rollback.slice(0, 120));
for (const [t, k] of [["control_alternate_probes", "q08-ground-precheck"], ["control_registry", "q08-ground-precheck"], ["remediation_contracts", "fm-q08-factcheck-late-failure"], ["failure_modes", "q08-factcheck-late-failure"], ["capability_ledger", "q08-ground-precheck"], ["ops_config", "q08_ground_precheck"]]) {
  ok(new RegExp("DELETE FROM " + t + " WHERE \\w+ = '" + k + "'").test(rollback), "the Rollback line removes the " + t + " row " + k, rollback.slice(0, 200));
}
ok(!/decision_log/.test(rollback), "the Rollback line leaves the append-only decision_log alone");
ok(rollback.indexOf("DELETE FROM control_alternate_probes") < rollback.indexOf("DELETE FROM control_registry"), "the Rollback line removes the probe row before the control row it reads");
ok(!/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file itself runs no DELETE or DROP (so no BACKUP line is owed)");
ok(/PRE-APPLY COUNTS/.test(sql) && /control LIKE 'q08%' = 3/.test(sql) && /fm_key LIKE 'q08%' = 10/.test(sql) && /class LIKE 'fm-q08%' = 10/.test(sql) && /capability LIKE 'q08%' = 2/.test(sql) && /control_alternate_probes\s+control LIKE 'q08%' = 0/.test(sql), "the header quotes the pre-apply SELECT counts (3 controls, 0 probes, 10 failure modes, 10 contracts, 2 capabilities)");
ok(/q08-ground-precheck = 0/.test(sql) && /q08-factcheck-late-failure = 0/.test(sql) && /fm-q08-factcheck-late-failure = 0/.test(sql) && /q08_ground_precheck = 0/.test(sql) && /'Q08-FACT-LEDGER-1:' = 0/.test(sql) && /control_alternate_probes\s+control LIKE 'q08%' = 0 \(23:10Z\); q08-ground-precheck = 0/.test(sql), "and that every name the file adds was absent, the probe row included");
ok(/\(7 inserts\)/.test(sql) && /alternate_tested_at NULL/.test(sql) && /controls_hand_stamped_without_probe/.test(sql) && /probe-never-run/.test(sql), "the header states 7 inserts, that no alternate_tested_at is stamped and what the scorecard reads until the drill passes");
ok(/deployment_history\s+latest resource_name = 'q08-signal-engine' AND action = 'deploy' AND status = 'success' = 0\.31\.3-codeagent/.test(sql) && /WHY THE PROBE READS THE DEPLOY/.test(sql) && /fails today and passes only after the 0\.32\.0 deploy/.test(sql), "the header quotes the deploy ledger it read (0.31.3 latest) and says why the probe reads it");
ok(!/0c64b5a6/.test(sql) && !/\bcommit [0-9a-f]{7,40}\b/.test(sql), "no branch commit hash anywhere in the file (a squash merge leaves it dangling)");
ok(!/[^\x00-\x7f]/.test(sql), "the file is ASCII only");
ok(!/claude\.ai|anthropic\.com/i.test(sql.replace(/Claude-Session[^\n]*/g, "")), "no claude.ai or anthropic.com link in the file (cloudflare-only-host-guard)");
ok(/ops_config q08_ground_precheck/.test(sql) && /\bon\b/.test(sql) && /\bprune\b/.test(sql) && /\boff\b/.test(sql), "the header describes the three modes of the switch");

// ---- replay twice on the pre-apply state --------------------------------------------------------------------------------------------------------
const db = seeded();
ok(cnt(db, "control_registry") === 3 && cnt(db, "failure_modes") === 10 && cnt(db, "remediation_contracts") === 10 && cnt(db, "capability_ledger") === 2 && cnt(db, "ops_config") === 3 && cnt(db, "decision_log") === 0 && cnt(db, "control_alternate_probes") === 1 && cnt(db, "control_alternate_probes WHERE control LIKE 'q08%'") === 0 && cnt(db, "deployment_history") === PRE.deploys.length && one(db, "SELECT version_id FROM deployment_history WHERE resource_name = 'q08-signal-engine' AND action = 'deploy' AND status = 'success' ORDER BY id DESC LIMIT 1").version_id === "0.31.3-codeagent", "fixture: the pre-apply counts the header quotes, and the deploy ledger holds q08-signal-engine at 0.31.3-codeagent");
const ALL_TABLES = ["control_registry", "control_alternate_probes", "failure_modes", "remediation_contracts", "capability_ledger", "ops_config", "decision_log", "deployment_history"];
const key = { control_registry: "control", control_alternate_probes: "control", failure_modes: "fm_key", remediation_contracts: "class", capability_ledger: "capability", ops_config: "key", decision_log: "id", deployment_history: "id" };
const snapAll = (d) => JSON.stringify(ALL_TABLES.map((t) => all(d, "SELECT * FROM " + t + " ORDER BY " + key[t])));
const viewBefore = one(db, "SELECT * FROM v_control_alternate_untested");
let err = null;
try { db.exec(sql); } catch (e) { err = String(e && e.message || e); }
ok(err === null, "the file runs on SQLite without an error", err);
const after1 = { cr: cnt(db, "control_registry"), cap_probe: cnt(db, "control_alternate_probes"), fm: cnt(db, "failure_modes"), rc: cnt(db, "remediation_contracts"), cap: cnt(db, "capability_ledger"), cfg: cnt(db, "ops_config"), dl: cnt(db, "decision_log") };
ok(after1.cr === 4 && after1.cap_probe === 2 && after1.fm === 11 && after1.rc === 11 && after1.cap === 3 && after1.cfg === 4 && after1.dl === 1, "one row more in each table after the first run (control, probe, failure mode, contract, capability, ops_config) and one decision", after1);
const snap = snapAll(db);
err = null;
try { db.exec(sql); } catch (e) { err = String(e && e.message || e); }
ok(err === null, "a second run raises no error", err);
ok(snapAll(db) === snap, "a replay is a no-op: every table, control_alternate_probes included, is byte-identical after the second run");
ok(cnt(db, "deployment_history") === PRE.deploys.length, "the file writes no deployment_history row: the deploy part of the probe reads a ledger only the canonical path writes");
ok(PRE.controls.every((c) => one(db, "SELECT evidence FROM control_registry WHERE control = ?", c).evidence === "seed") && PRE.cfg.every((k) => one(db, "SELECT value FROM ops_config WHERE key = ?", k).value === "v") && PRE.probes.every((k) => one(db, "SELECT probe_sql, window_note FROM control_alternate_probes WHERE control = ?", k).window_note === "seed"), "the rows that were there are untouched");

// ---- the rows are what the doctrine asks for --------------------------------------------------------------------------------------------------------
const cr = one(db, "SELECT * FROM control_registry WHERE control = 'q08-ground-precheck'");
ok(cr && cr.kind === "filter" && cr.disposition === "keep" && cr.disposition_state === "applied" && cr.critical_path === 1 && cr.issue_id === 2606 && cr.alternate_tested_at === null && /generate, generateForecast/.test(cr.location), "the pre-check is registered as a filter (keep, applied, critical path stated as 1) with its location and its issue, and alternate_tested_at is NULL: nothing is hand-stamped on a critical-path control", cr);
ok(cr && /ops_config q08_ground_precheck/.test(cr.alternate_path) && /on \(default\)/.test(cr.alternate_path) && /prune/.test(cr.alternate_path) && /off \(no pre-check call, the 0\.31\.3 flow/.test(cr.alternate_path) && /no deploy/.test(cr.alternate_path) && /fail-safe/.test(cr.alternate_path), "the alternate path is the off switch with its three modes, the in-code fail-safe and no deploy needed", cr && cr.alternate_path.slice(0, 200));
ok(cr && /Unmeasured/.test(cr.evidence) && /ok rows keep no repair trail/.test(cr.evidence) && /25 naming a name, year or figure/.test(cr.evidence) && /fact-ledger\.test\.mjs/.test(cr.evidence), "the evidence states the unmeasured cost plainly, the live count of the refused class and where the alternate is tested", cr && cr.evidence.slice(0, 200));
ok(cr && /tested offline in q08-signal-engine\/fact-ledger\.test\.mjs/.test(cr.evidence) && /not yet drilled live: alternate_tested_at is NULL on purpose/.test(cr.evidence) && /the drill stamps a passing probe/.test(cr.evidence) && !/ALTERNATE-NOT-EXERCISABLE/.test(cr.evidence), "the evidence says the alternate is tested offline, not yet drilled, stamped by the drill on a passing probe, and does not use the not-exercisable excuse (the live views would read it as an excuse for a probe-less row)", cr && cr.evidence.slice(-420));
const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'q08-factcheck-late-failure'");
ok(fm && fm.probe_class === "fm-q08-factcheck-late-failure" && fm.first_seen === "2026-10-19" && fm.issue_id === 2606 && /groundingProblems/.test(fm.root_cause) && fm.trigger_condition && fm.symptom && fm.blast_radius && /fm-q08-factcheck-late-failure/.test(fm.detector), "the failure mode names its root cause, trigger, symptom, blast radius and detector class", fm);
const cap = one(db, "SELECT * FROM capability_ledger WHERE capability = 'q08-ground-precheck'");
ok(cap && /fact-ledger\.sql/.test(cap.provenance) && cap.prerequisites && cap.reliability && /Not claimed: that this restores publishing/.test(cap.evidence), "the capability row has provenance, prerequisites, reliability and an evidence line that does not over-claim", cap);
const cfg = one(db, "SELECT * FROM ops_config WHERE key = 'q08_ground_precheck'");
ok(cfg && cfg.value === "on" && /alternate path of control_registry q08-ground-precheck/.test(cfg.note), "ops_config q08_ground_precheck is inserted at its default, on, and points at the control", cfg);
const dl = one(db, "SELECT * FROM decision_log");
ok(dl && dl.actor.startsWith("session_01QpQv19uh1padRwZ3u1r766") && dl.outcome === "pending" && dl.capability_gain && dl.reach_gain && dl.surfaces_tested && /^Q08-FACT-LEDGER-1:/.test(dl.action), "the decision is logged with its actor, the action that opens with the guard text, capability gain, reach gain and surfaces tested", dl);
ok(dl && /^[a-z0-9_]+ (<|<=|>|>=|=) [0-9.]+ within [0-9]+ h$/.test(dl.predicted_outcome) && dl.predicted_outcome === "q08_gate_pass_rate_7d >= 0.05 within 168 h", "the prediction is in the form decision_predictions_parse scores, a no-regression guard on a registered metric and not a claim that publishing recovers", dl && dl.predicted_outcome);
ok(dl && !/drilled live/.test(dl.action) && /tested offline in q08-signal-engine\/fact-ledger\.test\.mjs; to be drilled by its control_alternate_probes row on the next 360-minute drill after the 0\.32\.0 deploy, alternate_tested_at left NULL\)/.test(dl.action), "the append-only decision does not say the alternate was drilled: tested offline, to be drilled by the probe row after the deploy, alternate_tested_at left NULL", dl && dl.action);
ok(dl && !/0c64b5a6/.test(JSON.stringify(dl)) && !/\bcommit [0-9a-f]{7,40}\b/.test(JSON.stringify(dl)) && /hand-stamped/.test(dl.evidence) && /deploy to be 0\.32\.0 or later/.test(dl.evidence), "the evidence names the review findings by content (no commit hash), including the self-referential drill probe", dl && dl.evidence.slice(-700));
ok(dl && /ops_config q08_ground_precheck = off/.test(dl.rollback_path) && /append-only/.test(dl.rollback_path) && /317 runs, 17 ok, 265 gate_failed/.test(dl.evidence), "the decision names its revert path (the switch, no deploy) and cites the measured counts", dl && dl.rollback_path.slice(0, 160));

// ---- the drill probe (second review): exactly one enabled read-only row, three state checks, a window in minutes -------------------------------------------------
const probeRows = all(db, "SELECT * FROM control_alternate_probes WHERE control = 'q08-ground-precheck'");
ok(probeRows.length === 1 && cnt(db, "control_alternate_probes WHERE control LIKE 'q08%'") === 1, "exactly one control_alternate_probes row for q08-ground-precheck, and no other q08 probe", probeRows.length);
const pr = probeRows[0] || {};
ok(pr.enabled === 1 && pr.last_run_at === null && pr.last_pass === null && pr.last_pass_at === null && pr.last_observed === null, "it is enabled and carries no run, pass or observation: only the drill writes those", pr);
ok(/^\d+ minutes: /.test(pr.window_note || "") && !/\b(hours?|days?)\b/i.test(pr.window_note || "") && /360 minutes/.test(pr.window_note), "its window_note states the window in minutes (360, the drill cadence), never hours or days", pr.window_note);
{
  const p = pr.probe_sql || "", low = " " + p.toLowerCase() + " ";
  ok(/^select\b/i.test(p) && !p.includes(";") && /\bexpected\b/i.test(p) && /\bobserved\b/i.test(p), "the probe is one SELECT with expected and observed columns and no semicolon", p.slice(0, 80));
  ok(!WRITE_KW.some((k) => low.includes(k)), "no write keyword in the probe, string literals included", WRITE_KW.filter((k) => low.includes(k)));
  ok(!/\b(hours?|days?)\b/.test(low), "the probe states no window in hours or days");
  ok(/q08_ground_precheck/.test(p) && /fm-q08-factcheck-late-failure/.test(p) && /control = 'q08-ground-precheck'/.test(p) && /'on', 'prune', 'off'/.test(p) && /status = 'active'/.test(p), "it reads the switch row and its three values, the active detector contract and the control row");
  ok(/FROM deployment_history WHERE resource_name = 'q08-signal-engine' AND action = 'deploy' AND status = 'success' ORDER BY id DESC LIMIT 1/.test(p) && /0\.32\.0 or later is not the latest successful deploy/.test(p), "and the latest successful q08-signal-engine deploy in deployment_history (the part the file cannot make true by itself), naming it when it is below 0.32.0");
  ok(/four checks/.test(pr.window_note) && /deployment_history/.test(pr.window_note) && /0\.32\.0 or later/.test(pr.window_note), "the window_note names the deploy check and says what a failing probe means", pr.window_note);
}
if (!pr.probe_sql) ok(false, "there is a probe to run");
else {
  // Run the probe on a copy of the migrated state, breaking one part at a time.
  const probeOf = (d) => d.prepare(pr.probe_sql).get();
  const fresh031 = () => { const d = seeded(); d.exec(sql); return d; }; // the file applied, the worker still on 0.31.3 (what is live now)
  const fresh = () => { const d = fresh031(); deploy(d, "0.32.0-codeagent"); return d; }; // the file applied and the 0.32.0 deploy recorded
  let d = fresh();
  let r = probeOf(d);
  ok(r.expected === "ok" && r.observed === "ok", "on the migrated state with the 0.32.0 deploy recorded the probe reads ok, ok (the drill's chaosJudge passes it)", r);
  // The third review: the three state parts are all rows this file inserts, so they alone read ok the moment it applies. The deploy part is what holds the probe back.
  {
    const g = fresh031();
    const row = g.prepare(pr.probe_sql).get();
    ok(row.expected === "ok" && row.observed === "q08-signal-engine 0.32.0 or later is not the latest successful deploy (latest: 0.31.3-codeagent), so the pre-check is not live", "the file applied with the worker on 0.31.3: the three state parts all hold and the probe still FAILS, naming the version it found", row);
    ok(cnt(g, "control_registry WHERE control = 'q08-ground-precheck'") === 1 && cnt(g, "ops_config WHERE key = 'q08_ground_precheck' AND value = 'on'") === 1 && cnt(g, "remediation_contracts WHERE class = 'fm-q08-factcheck-late-failure' AND status = 'active'") === 1, "fixture: the control row, the switch row at on and the active detector contract all exist in that failing state (this is what made the old probe self-referential)");
    // A state part that is gone is still named first, ahead of the deploy part.
    g.prepare("DELETE FROM ops_config WHERE key = 'q08_ground_precheck'").run();
    ok(/switch q08_ground_precheck is missing/.test(g.prepare(pr.probe_sql).get().observed), "a missing state part is named ahead of the deploy part");
  }
  // The deploy part on its own, one ledger, newest row last (the probe reads the highest id).
  {
    const g = fresh031();
    const obs = () => g.prepare(pr.probe_sql).get().observed;
    const NOT = (v) => "q08-signal-engine 0.32.0 or later is not the latest successful deploy (latest: " + v + "), so the pre-check is not live";
    ok(obs() === NOT("0.31.3-codeagent"), "latest successful deploy 0.31.3: fails", obs());
    deploy(g, "5.40.0-next", { name: "qnfo-ai" });
    deploy(g, "0.40.0-x", { name: "q08-signal-engine-other" });
    ok(obs() === NOT("0.31.3-codeagent"), "a newer successful deploy of ANOTHER worker, with a higher id and version, does not count", obs());
    deploy(g, "0.32.0-codeagent", { status: "failed" });
    ok(obs() === NOT("0.31.3-codeagent"), "a failed 0.32.0 deploy does not count", obs());
    deploy(g, "0.32.0-codeagent", { action: "deployed" });
    deploy(g, "0.32.0-codeagent", { action: "deploy-direct" });
    deploy(g, "0.32.0-codeagent", { action: "REMOVE", status: "recorded-absent" });
    ok(obs() === NOT("0.31.3-codeagent"), "rows of another action (deployed, deploy-direct, REMOVE) do not count: only the canonical deploy row does", obs());
    deploy(g, "0.32.0-codeagent");
    ok(obs() === "ok", "the 0.32.0 deploy lands (action deploy, status success): the probe reads ok", obs());
    // The live ledger trigger refuses a lower row: qnfo-ops writes no ROLLBACK-OK, so a canary revert cannot make 0.31.3 the latest row, and the probe cannot tell it.
    const refusal = refused(() => deploy(g, "0.31.3-codeagent"));
    ok(/VERSION-MONOTONIC-1/.test(refusal) && obs() === "ok", "a 0.31.3 row after 0.32.0 is refused by the live version-monotonic trigger and the probe stays ok (it does not read a later rollback)", [refusal, obs()]);
    ok(refused(() => deploy(g, "0.31.99-codeagent")).includes("VERSION-MONOTONIC-1") && obs() === "ok", "a 0.31.99 row is refused as well");
    deploy(g, "0.32.0-codeagent");
    deploy(g, "0.32.1-codeagent");
    ok(obs() === "ok", "0.32.1 after the redeploy: ok", obs());
    deploy(g, "0.33.0-next");
    ok(obs() === "ok", "0.33.0 is later than 0.32.0: ok", obs());
    deploy(g, "0.100.0-next");
    ok(obs() === "ok", "0.100.0 passes: the minor number is compared as a number, not as text", obs());
    deploy(g, "1.0.0");
    ok(obs() === "ok", "1.0.0 passes: a major bump does not fail the probe for good", obs());
    // An intentional rollback is the one lower row the live trigger accepts (notes say ROLLBACK-OK); the probe reads it as the latest row and fails.
    deploy(g, "0.9.0-old", RB);
    ok(obs() === NOT("0.9.0-old"), "an intentional rollback to 0.9.0 (ROLLBACK-OK) fails (a text comparison would put '9' above '3' and pass it)", obs());
    deploy(g, "0.31.99-old", RB);
    ok(obs() === NOT("0.31.99-old"), "a ROLLBACK-OK 0.31.99 fails: the patch number does not lift a minor below 32", obs());
    deploy(g, "0.32.0", RB);
    ok(obs() === "ok", "0.32.0 without a suffix is the boundary and passes", obs());
    g.prepare("UPDATE deployment_history SET version_id = NULL WHERE id = (SELECT MAX(id) FROM deployment_history)").run();
    ok(obs() === NOT("none"), "a NULL version_id on the newest row reads as none and FAILS: a NULL never falls through to ok", obs());
  }
  {
    const g = fresh031();
    g.prepare("DELETE FROM deployment_history").run();
    const row = g.prepare(pr.probe_sql).get();
    ok(row && row.expected === "ok" && row.observed === "q08-signal-engine 0.32.0 or later is not the latest successful deploy (latest: none), so the pre-check is not live", "an empty deploy ledger returns a row that FAILS (latest: none): a NULL never falls through to ok", row);
    deploy(g, "not-a-version");
    ok(/is not the latest successful deploy \(latest: not-a-version\)/.test(g.prepare(pr.probe_sql).get().observed), "a version_id that is not a number is a failure, not a pass");
    const only = g.prepare("SELECT COUNT(*) AS n FROM (" + pr.probe_sql + ")").get();
    ok(only.n === 1, "however the ledger reads, the probe returns exactly one row (chaosJudge reads the first)", only);
  }
  for (const v of ["prune", "off", "on", " Off ", "PRUNE"]) {
    d.prepare("UPDATE ops_config SET value = ? WHERE key = 'q08_ground_precheck'").run(v);
    ok(probeOf(d).observed === "ok", "the switch at " + JSON.stringify(v) + " still reads ok (the worker's parse trims and lowercases)", probeOf(d));
  }
  d.prepare("UPDATE ops_config SET value = 'maybe' WHERE key = 'q08_ground_precheck'").run();
  ok(/reads maybe, not on, prune or off/.test(probeOf(d).observed), "a value outside on, prune and off is named", probeOf(d));
  d.prepare("UPDATE ops_config SET value = NULL WHERE key = 'q08_ground_precheck'").run();
  ok(/reads NULL, not on, prune or off/.test(probeOf(d).observed), "a NULL value is named, not read as ok", probeOf(d));
  d.prepare("UPDATE ops_config SET value = '' WHERE key = 'q08_ground_precheck'").run();
  ok(/not on, prune or off/.test(probeOf(d).observed), "an empty value is named", probeOf(d));
  d = fresh();
  d.prepare("DELETE FROM ops_config WHERE key = 'q08_ground_precheck'").run();
  ok(/switch q08_ground_precheck is missing/.test(probeOf(d).observed), "a missing switch row is named", probeOf(d));
  d = fresh();
  for (const st of ["superseded", "holding", "monitoring", "escalated", "closed", "paused"]) {
    d.prepare("UPDATE remediation_contracts SET status = ? WHERE class = 'fm-q08-factcheck-late-failure'").run(st);
    ok(/detector fm-q08-factcheck-late-failure is missing or not active/.test(probeOf(d).observed), "a detector contract in status " + st + " is named (only active passes)", probeOf(d));
  }
  d.prepare("DELETE FROM remediation_contracts WHERE class = 'fm-q08-factcheck-late-failure'").run();
  ok(/detector fm-q08-factcheck-late-failure is missing or not active/.test(probeOf(d).observed), "a missing detector contract is named", probeOf(d));
  d = fresh();
  d.prepare("DELETE FROM control_registry WHERE control = 'q08-ground-precheck'").run();
  ok(/control_registry row q08-ground-precheck is missing/.test(probeOf(d).observed), "a missing control row is named", probeOf(d));
  // The other controls' state cannot make it pass or fail: only its own three parts count.
  d = fresh();
  d.prepare("UPDATE control_registry SET evidence = 'changed' WHERE control <> 'q08-ground-precheck'").run();
  ok(probeOf(d).observed === "ok", "the rows of other controls do not move the probe");

  // What the scorecard reads: the live views over the migrated fixture; then a drill while the worker is still on 0.31.3 (it must fail and stamp nothing), then a
  // drill after the 0.32.0 deploy (it passes and stamps). The drill (chaosDrill) runs the probe, judges it with chaosJudge, writes the probe row and stamps
  // control_registry only for a pass (chaosPlan).
  d = fresh031();
  const st = () => one(d, "SELECT drill_state, alternate_tested_at, probe_enabled FROM v_control_alternate_status WHERE control = 'q08-ground-precheck'");
  const ut = () => one(d, "SELECT * FROM v_control_alternate_untested");
  const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const drill = () => {
    const probeRow = one(d, "SELECT probe_sql FROM control_alternate_probes WHERE control = 'q08-ground-precheck'");
    const verdict = d.prepare(probeRow.probe_sql).get();
    const pass = verdict.expected !== "" && verdict.expected === verdict.observed;
    const t = nowIso();
    d.prepare("UPDATE control_alternate_probes SET last_run_at = ?1, last_pass = ?2, last_observed = ?3, last_pass_at = CASE WHEN ?2 = 1 THEN ?1 ELSE last_pass_at END WHERE control = ?4").run(t, pass ? 1 : 0, String(verdict.observed), "q08-ground-precheck");
    if (pass) d.prepare("UPDATE control_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE control = ?2").run(t, "q08-ground-precheck");
    return { pass, observed: String(verdict.observed) };
  };
  ok(st().drill_state === "probe-never-run" && st().alternate_tested_at === null, "v_control_alternate_status reads the new control as probe-never-run with no stamp (not no-probe, not hand-stamped)", st());
  const u1 = ut();
  ok(u1.critical_untested_by_register === 1 && u1.critical_untested_by_probe === 1 && u1.critical_probe_not_drilled === 1 && u1.critical_without_probe === 0 && u1.controls_hand_stamped_without_probe === 0 && u1.controls_untested_without_probe === 0, "v_control_alternate_untested: the new control adds 1 to critical_probe_not_drilled, none to critical_without_probe and none to controls_hand_stamped_without_probe", u1);
  ok(viewBefore.critical_untested_by_register === 0 && viewBefore.critical_probe_not_drilled === 0 && viewBefore.controls_hand_stamped_without_probe === 0, "fixture: the scorecard read 0 on all three before the file", viewBefore);
  ok(one(d, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 2 && u1.probes_enabled === 2, "the probe count rises by one (the seeded probe plus this one)", u1);
  // Drill 1: the file has applied, the worker has not deployed (or a canary reverted it).
  const dr1 = drill();
  ok(!dr1.pass && /0\.32\.0 or later is not the latest successful deploy \(latest: 0\.31\.3-codeagent\)/.test(dr1.observed), "a drill that runs before the 0.32.0 deploy FAILS the probe", dr1);
  const u1b = ut();
  ok(st().drill_state === "probe-failing" && st().alternate_tested_at === null && u1b.probes_failing === 1 && u1b.critical_untested_by_register === 1 && u1b.critical_untested_by_probe === 1 && u1b.critical_probe_not_drilled === 1, "and stamps nothing: the control reads probe-failing, alternate_tested_at stays NULL and the three critical figures keep their value", [st(), u1b]);
  // The worker deploys; the next drill passes and stamps.
  deploy(d, "0.32.0-codeagent");
  const dr2 = drill();
  ok(dr2.pass && st().drill_state === "drilled" && st().alternate_tested_at !== null, "once the 0.32.0 deploy is on the ledger the next drill passes, stamps alternate_tested_at and the control reads drilled", [dr2, st()]);
  const u2 = ut();
  ok(u2.critical_untested_by_register === 0 && u2.critical_untested_by_probe === 0 && u2.critical_probe_not_drilled === 0 && u2.probes_failing === 0, "and the three critical figures fall back to their value before the file", u2);
  // A canary revert cannot lower the ledger (the live trigger refuses 0.31.3 without ROLLBACK-OK, and a revert PR lands above the bad version), so the next drill still passes.
  ok(/VERSION-MONOTONIC-1/.test(refused(() => deploy(d, "0.31.3-codeagent"))), "the live trigger refuses a 0.31.3 row after the 0.32.0 deploy");
  const dr3 = drill();
  ok(dr3.pass && st().drill_state === "drilled", "a refused lower row leaves the ledger as it was: the next drill passes and the view reads drilled", [st(), dr3]);
  deploy(d, "0.32.1-codeagent");
  ok(drill().pass && st().drill_state === "drilled", "a version-bumped revert (0.32.1) also reads drilled", st());
  // Only an intentional rollback (ROLLBACK-OK) lowers the latest row; the drill then fails and the view reads probe-failing until the redeploy.
  deploy(d, "0.31.3-codeagent", RB);
  const dr3b = drill();
  ok(!dr3b.pass && st().drill_state === "probe-failing" && ut().probes_failing === 1, "an intentional ROLLBACK-OK rollback to 0.31.3 fails the next drill and the view reads probe-failing", [st(), dr3b]);
  deploy(d, "0.32.1-codeagent");
  ok(drill().pass && st().drill_state === "drilled", "the redeploy of 0.32.1 (not below the highest recorded version) and the next drill read drilled again", st());
  d.prepare("DELETE FROM ops_config WHERE key = 'q08_ground_precheck'").run();
  const bad = drill();
  ok(!bad.pass && st().drill_state === "probe-failing" && ut().probes_failing === 1, "a drill that fails the probe (switch row gone) reads probe-failing on the scorecard", [st(), bad]);
}

// ---- the switch, the marker and the item texts are the ones the worker uses ------------------------------------------------------------------------------
ok(worker.includes('var GROUND_PRE_KEY = "q08_ground_precheck"'), "the ops_config key of the row is the key the worker reads");
ok(worker.includes('"pre-check: " + pre.trail') && worker.includes('"pre-check: " + fpre.trail'), "the worker writes 'pre-check: ' into the error of a run the pre-check refuses (the marker the probe excludes)");
ok(["name not in the source", "figure not in the source", "year not in the source"].every((t) => worker.includes('"' + t + '"')), "the three item texts the probe reads are the ones groundingProblems writes");
ok(worker.includes('["accuracy: " + ev.problems.join("; ")]') && worker.includes('"forecast: " + gateResult.problems.join("; ")'), "a late failure is written as 'accuracy: ...' (essay) or 'forecast: accuracy: ...' (forecast) by the worker");

// ---- the detector contract -----------------------------------------------------------------------------------------------------------------------------
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-q08-factcheck-late-failure'");
{
  const p = c.verify_probe, low = p.toLowerCase();
  ok(/^select\b/i.test(p) && !p.includes(";") && /\bexpected\b/i.test(p) && /\bobserved\b/i.test(p), "a single SELECT with expected and observed columns and no semicolon", p.slice(0, 80));
  ok(!WRITE_KW.some((k) => low.includes(k)), "no write keyword in the probe, string literals included", WRITE_KW.filter((k) => low.includes(k)));
  ok(!/\b(like|glob)\b/i.test(p), "no LIKE or GLOB (D1 caps a pattern at 50 bytes)");
  ok(c.status === "active" && c.expected_cadence_h === 1 && c.max_attempts === 3 && c.module === "failure-mode" && c.verify_transport === "d1-query@q08-signal" && c.escalate_to === "q08-signal-engine", "active, hourly, three attempts, read from q08-signal", [c.status, c.expected_cadence_h, c.verify_transport]);
  const hours = (Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) / 36e5;
  ok(hours > 29 && hours < 31, "first due about 30 hours after the file is applied (a full UTC day on the new flow)", hours);
}
{
  const probe = c.verify_probe;
  const mk = () => {
    const d = new DatabaseSync(":memory:");
    d.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER, signals_scored INTEGER, piece_published INTEGER, top_signal TEXT, model TEXT, ms INTEGER, status TEXT, error TEXT, source_chars INTEGER, source_kind TEXT, compose_calls INTEGER, verify_calls INTEGER)");
    return d;
  };
  const d = mk();
  const ins = d.prepare("INSERT INTO engine_runs (ran_at, status, error, compose_calls) VALUES (datetime('now', ?), ?, ?, ?)");
  const read = () => d.prepare(probe).get();
  ok(read().expected === "0" && read().observed === "0", "no runs: reads 0");
  ins.run("-1 hours", "ok", null, 2);
  ins.run("-1 hours", "gate_failed", "ensemble: the edited draft was still not worth reading (panel mean 3 of 5)", 4);
  ins.run("-1 hours", "gate_failed", "accuracy: unsupported claim: the co-founder announced the launch", 5);
  ins.run("-1 hours", "gate_failed", "accuracy: name not in the source: Zorblax Systems; pre-check: prune blocked: a flagged name or figure is in the lede", 2);
  ins.run("-1 hours", "gate_failed", "forecast: accuracy: figure not in the source: 4200; pre-check: a forecast draft names or counts what the source does not hold (no prune for a forecast)", 1);
  ins.run("-2 days", "gate_failed", "accuracy: name not in the source: Zorblax Systems", 4);
  ins.run("-1 hours", "gate_failed", "accuracy: name not in the source: Zorblax Systems", null);
  ok(read().observed === "0", "reads 0 for an ok run, a panel failure, an LLM-only accuracy failure, two runs the pre-check refused, a run older than 24 hours and a run that logged no calls", read());
  ins.run("-3 hours", "gate_failed", "accuracy: name not in the source: Zorblax Systems; repair trail: r1 prune -2 (4210 chars)", 6);
  ok(read().observed === "1", "a run that reached the panel and ended on a name not in the source reads 1", read());
  ins.run("-4 hours", "gate_failed", "forecast: accuracy: figure not in the source: 4200", 3);
  ins.run("-5 hours", "gate_failed", "accuracy: year not in the source: 2019; unsupported claim: x", 3);
  ok(read().observed === "3" && read().expected === "0", "a late forecast failure and a late year item count too", read());
  ins.run("-23 hours", "gate_failed", "accuracy: figure not in the source: 12", 3);
  ok(read().observed === "4", "a run 23 hours old is inside the window", read());
  ins.run("-25 hours", "gate_failed", "accuracy: figure not in the source: 12", 3);
  ok(read().observed === "4", "a run 25 hours old is outside it", read());
}

// ---- rollback: every row goes, the append-only decision stays -----------------------------------------------------------------------------------------
{
  let rbErr = null;
  try { db.exec(rollback); } catch (e) { rbErr = String(e && e.message || e); }
  ok(rbErr === null, "the Rollback line runs on the migrated tables", rbErr);
  ok(cnt(db, "control_registry") === 3 && cnt(db, "control_alternate_probes") === 1 && cnt(db, "failure_modes") === 10 && cnt(db, "remediation_contracts") === 10 && cnt(db, "capability_ledger") === 2 && cnt(db, "ops_config") === 3, "it takes the tables back to the pre-apply counts and removes nothing that was there");
  ok(!one(db, "SELECT 1 AS x FROM control_registry WHERE control = 'q08-ground-precheck'") && !one(db, "SELECT 1 AS x FROM control_alternate_probes WHERE control = 'q08-ground-precheck'") && !one(db, "SELECT 1 AS x FROM ops_config WHERE key = 'q08_ground_precheck'"), "the control, its probe row and the switch row are gone");
  ok(PRE.probes.every((k) => one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", k).window_note === "seed"), "the probe of another control survives the rollback");
  ok(cnt(db, "decision_log") === 1, "the decision_log row stays (append-only)");
  let del = null;
  try { db.exec("DELETE FROM decision_log"); } catch (e) { del = String(e && e.message || e); }
  ok(/append-only/.test(String(del)), "the fixture keeps the live append-only trigger, so a Rollback that touched decision_log would have failed", del);
}

console.log("q08-fact-ledger.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
