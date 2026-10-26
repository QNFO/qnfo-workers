// SWEEP-FLEET-TASKS-C offline suite (issues 100069, 100341, 100342). Runs migrations/2026-10-26-sweep-fleet-tasks-c.sql on node:sqlite against
// the live table and view DDL (read from qnfo-audit sqlite_master on 2026-10-26) and against the two LIVE definitions kept in
// migrations/sweep-fleet-tasks-c.fixture.json, then executes the edited statements the way fleet-exec does (every sql step, in order).
// Proves:
//   1. roadmap-self-maintain: only step 17 changes, byte for byte; a fresh deferred goal contract is no longer counted as unevaluated, while a probe
//      error, a parked contract, a stale deferral and a contract that was never attempted still are; the old statement counts all of them.
//   2. TP-5-MEASURE-TO-ACT-1: red-drain step 0 (the live text) supersedes its contract every hour before the change and leaves it active after; the DoD is the
//      same SELECT (old and new answer alike in every state) and the read query in trigger 9162's action text follows the metric.
//   3. portfolio-lifecycle: only steps 1, 5 and 6 change, by the substitution action='deploy' -> action IN ('deploy','deployed'); a reconciled deployment
//      stops filing deploy-unrecorded / project-stale-deploy and is linked to project_ledger and project_state; a failed row, a deploy-direct row, a
//      reconciled row older than 30 days and a worker with no row still file their gaps; the UPDATE projects statement is untouched.
//   4. fleet_tasks_canonical moves with the task (the drift gate reads nothing), docs/fleet-tasks-canonical.json mirrors the migrated row, a second apply
//      changes nothing, an unexpected shape aborts before any write, and the Rollback header restores every touched row.
//   5. The three fm- detectors fail before and pass after, and the closing probes handed to the issues do not pass before and pass after.
// Run: node --no-warnings migrations/sweep-fleet-tasks-c.test.mjs
// Mutation checks: SWEEP_C_MIGRATION=<path to an altered copy of the migration> must make this suite fail.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));
const MIGRATION_PATH = process.env.SWEEP_C_MIGRATION || here + "2026-10-26-sweep-fleet-tasks-c.sql";
const migration = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");
const fx = JSON.parse(readFileSync(here + "sweep-fleet-tasks-c.fixture.json", "utf8"));
const docs = JSON.parse(readFileSync(here + "../docs/fleet-tasks-canonical.json", "utf8"));
const OLD_RSM = fx.tasks["roadmap-self-maintain"].definition;
const OLD_PL = fx.tasks["portfolio-lifecycle"].definition;
const FIXED_AT = "2026-10-26T09:40:00Z";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const hash = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.codePointAt(0)) % 1000000007; return x; };
const count = (s, frag) => s.split(frag).length - 1;

// ---- provenance of the fixture: the checksums D1 returned for the live rows on 2026-10-26 ----
eq([[...OLD_RSM].length, hash(OLD_RSM)], [10956, 671801027], "fixture roadmap-self-maintain matches the live row (length, polynomial hash)");
eq([[...OLD_PL].length, hash(OLD_PL)], [4655, 751193138], "fixture portfolio-lifecycle matches the live row (length, polynomial hash)");

// ---- live texts that the replay needs (read from qnfo-audit 2026-10-26) ----
const TP5_DOD = "Done when this query reads ok or 1: SELECT 'ok' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='breach_code_task_pct') AS REAL) >= 30 AND (SELECT COUNT(*) FROM remediation_contracts WHERE status='needs-machine-probe') = 0 THEN 'ok' ELSE 'pending: breach_code_task_pct ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric='breach_code_task_pct'),'?') || ', needs-machine-probe contracts ' || (SELECT COUNT(*) FROM remediation_contracts WHERE status='needs-machine-probe') END AS observed";
const PENDING_DOD = "Done when this query reads ok: SELECT 'ok' AS expected, 'pending: not yet' AS observed";
const RED_DRAIN_STEP0 = "UPDATE remediation_contracts SET status='superseded',\n        last_verdict='superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)',\n        last_attempt_at=datetime('now')\n      WHERE status IN ('active','holding')\n        AND (verify_probe LIKE '%needs-machine-probe%' OR COALESCE(last_verdict,'') IN ('vacuous-probe-result','probe-not-machine-executable','probe-error'))\n        AND substr(class,1,3) <> 'fm-' AND substr(class,1,7) <> 'belief-'";
const TRIGGER_ACTION = "Pillar autonomy (ROADMAP-SELF-MAINTAIN-1). Read SELECT c.class, c.status, c.last_verdict, c.last_attempt_at, c.next_due_at FROM remediation_contracts c WHERE c.module = 'goal-dod-v1' AND c.class IN (SELECT 'goal-' || goal_key FROM v_goal_status WHERE status = 'adopted' AND transport IS NOT NULL AND (last_verified_at IS NULL OR last_verified_at < datetime('now', '-120 minutes'))). A contract that left status active was parked by another sweep and roadmap-self-maintain re-activates it on its next run; a last_verdict of probe-error or probe-not-machine-executable means the DoD text is not a runnable SELECT: correct the goal's dod (the contract follows it within the hour). If every contract is active and due, check that qnfo-fleet-control remediationContractsTick and scripts/remediation_consumer.py are running. Definition of done: goals_unevaluated reads 0.";
const GOAL_FORMULA = "adopted goals with a machine-checkable DoD (v_goal_dod) whose goal-<key> contract is older than 120 minutes and has no verdict in the last 120 minutes";

// the closing probes handed to the issues (the dates are the first day after the fix)
const CLOSE_100069 = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM v_goal_status s JOIN remediation_contracts c ON c.class='goal-'||s.goal_key WHERE s.status='adopted' AND s.transport IS NOT NULL AND replace(substr(c.ts,1,19),'T',' ')<datetime('now','-120 minutes') AND (s.last_verified_at IS NULL OR s.last_verified_at<datetime('now','-120 minutes')) AND NOT (COALESCE(c.status,'')='active' AND COALESCE(c.last_verdict,'') LIKE 'deferred%' AND COALESCE(replace(substr(c.last_attempt_at,1,19),'T',' '),'')>=datetime('now','-120 minutes'))) AS TEXT) AS observed";
const closeGap = (kind, entity) => "SELECT '0' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind='portfolio-lifecycle' AND ts >= '2026-10-27') = 0 THEN 'pending: no portfolio-lifecycle tick has run on or after 2026-10-27' ELSE CAST((SELECT COUNT(*) FROM portfolio_gaps WHERE kind='" + kind + "' AND entity='" + entity + "' AND day >= '2026-10-27') AS TEXT) END AS observed";
const CLOSE_100341 = closeGap("deploy-unrecorded", "voice-stt");
const CLOSE_100342 = closeGap("project-stale-deploy", "W.voice-stt");
const today = sql => sql.replaceAll("'2026-10-27'", "date('now')"); // replay: "the first day after the fix" is today

// ---- live DDL ----
const DDL = `
PRAGMA foreign_keys = OFF;
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT DEFAULT (datetime('now')));
CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', parent_objective TEXT, alignment TEXT, source TEXT, score REAL, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', dod TEXT, owner TEXT, adopted_at TEXT, completed_at TEXT, retired_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), program_code TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT NOT NULL, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
CREATE VIEW v_goal_dod AS
SELECT g.id, g.goal_key, g.status, g.goal_type, g.program_code, g.owner, g.priority,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN 'code-read'
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0 THEN 'd1-query'
  END AS transport,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN trim(substr(g.dod, instr(g.dod, '{"paths"')))
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0
         THEN replace(rtrim(trim(substr(g.dod, instr(g.dod, 'SELECT '))), ';'), ';', ',')
  END AS probe
FROM goals g
WHERE g.goal_type <> 'objective-revision';
CREATE VIEW v_goal_evidence AS
SELECT class, pass, observed, vt AS verified_at
FROM (
  SELECT e.class, e.pass, e.observed, replace(substr(e.verified_at, 1, 19), 'T', ' ') AS vt,
    ROW_NUMBER() OVER (PARTITION BY e.class ORDER BY replace(substr(e.verified_at, 1, 19), 'T', ' ') DESC, e.id DESC) AS rn
  FROM v_remediation_evidence_all e
  WHERE e.class >= 'goal-' AND e.class < 'goal.'
)
WHERE rn = 1;
CREATE VIEW v_goal_status AS
SELECT d.goal_key, d.status, d.program_code, d.owner, d.transport, d.probe,
  ev.pass AS last_pass, ev.observed AS last_observed, ev.verified_at AS last_verified_at,
  (SELECT COUNT(*) FROM v_remediation_evidence_all e
    WHERE e.class = 'goal-' || d.goal_key AND e.pass = 0
      AND replace(substr(e.verified_at, 1, 19), 'T', ' ') > COALESCE(
        (SELECT MAX(replace(substr(e2.verified_at, 1, 19), 'T', ' ')) FROM v_remediation_evidence_all e2
          WHERE e2.class = 'goal-' || d.goal_key AND e2.pass = 1), '1970-01-01')) AS fails_since_pass
FROM v_goal_dod d
LEFT JOIN v_goal_evidence ev ON ev.class = 'goal-' || d.goal_key;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT, _version INTEGER DEFAULT 1, wbs_code TEXT);
CREATE TABLE programs (program_code TEXT PRIMARY KEY, portfolio_code TEXT NOT NULL, name TEXT NOT NULL, description TEXT, program_manager TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL REFERENCES programs(program_code), name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', github_repo TEXT, pages_project TEXT, r2_prefix TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, source TEXT, owner_service TEXT, gh_milestone INTEGER);
CREATE TABLE phases (phase_code TEXT PRIMARY KEY, project_code TEXT NOT NULL REFERENCES projects(project_code), phase_number INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'pending', started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_code, phase_number));
CREATE TABLE project_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, session_id TEXT NOT NULL, phase INTEGER NOT NULL, task_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('started','completed','blocked','skipped','deployed','archived','plan_created','phase_transition')), evidence TEXT, r2_artifact_path TEXT, worker_name TEXT, pages_project TEXT, timestamp TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE project_state (snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT, project_code TEXT NOT NULL REFERENCES projects(project_code), snapshot_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')), session_id TEXT, current_phase INTEGER, phase_progress REAL, resource_counts TEXT, git_branch TEXT, git_commit TEXT, r2_snapshot_path TEXT);
CREATE TABLE portfolio_gaps (kind TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT, first_seen TEXT DEFAULT (datetime('now')), day TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, issue_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, entity, day));
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
`;

function mk({ rsm = OLD_RSM, pl = OLD_PL, canon = pl } = {}) {
  const d = new DatabaseSync(":memory:");
  d.exec(DDL);
  d.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('roadmap-self-maintain', 'RSM', 'workflow', ?, 1, 1, '2026-10-19T04:46:15Z')").run(rsm);
  d.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('portfolio-lifecycle', 'PL', 'workflow', ?, 2, 1, '2026-10-19 14:13:12')").run(pl);
  d.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('other-task', 'O', 'workflow', '{\"steps\":[]}', 5, 1, '2026-10-01 00:00:00')").run();
  d.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('portfolio-lifecycle', ?, NULL, '2026-10-18 13:49:49')").run(canon);
  d.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('other-task', '{\"steps\":[]}', NULL, '2026-10-18 13:49:49')").run();
  d.prepare("INSERT INTO goals (goal_key, statement, status, dod, updated_at) VALUES ('TP-5-MEASURE-TO-ACT-1', 'TP-5', 'adopted', ?, '2026-10-19 04:00:00')").run(TP5_DOD);
  d.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, operator, threshold, action) VALUES (9162, 'goals_unevaluated', 't', 'gt', 0, ?)").run(TRIGGER_ACTION);
  d.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, last_value, state) VALUES ('goals_unevaluated', 'operational', 'guard', ?, '11', 'MEASURED')").run(GOAL_FORMULA);
  d.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES ('breach_code_task_pct', 'operational', 'lagging', '8.1', 'MEASURED')").run();
  return d;
}
const defOf = (d, id) => d.prepare("SELECT definition FROM fleet_tasks WHERE id=?").get(id).definition;
const rowOf = (d, id) => d.prepare("SELECT definition, version, enabled, updated_at FROM fleet_tasks WHERE id=?").get(id);
const stepsOf = def => JSON.parse(def).steps;
const stepByName = (def, name) => stepsOf(def).find(s => s.name === name).sql;
const metric = d => d.prepare("SELECT last_value FROM metric_registry WHERE metric='goals_unevaluated'").get().last_value;
const probeRow = (d, sql) => { const r = d.prepare(sql).get(); return [r.expected, r.observed]; };

// ---- goal fixtures: one row per class of contract the metric has to tell apart ----
const iso = m => ["strftime('%Y-%m-%dT%H:%M:%SZ','now',?)", m];
function goal(d, key, { dod = PENDING_DOD, gstatus = "adopted", status = "active", verdict = "deferred", attemptMin = -10, isoAttempt = false, tsAge = "-3 days", verif = null, module = "goal-dod-v1" } = {}) {
  d.prepare("INSERT INTO goals (goal_key, statement, status, dod) VALUES (?, ?, ?, ?)").run(key, key, gstatus, dod);
  const attempt = attemptMin === null ? "NULL" : (isoAttempt ? "strftime('%Y-%m-%dT%H:%M:%SZ','now',?)" : "datetime('now',?)");
  const args = ["goal-" + key, "probe", status, tsAge, verdict, module];
  if (attemptMin !== null) args.push(attemptMin + " minutes");
  d.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status, ts, last_verdict, module, last_attempt_at) VALUES (?, 'p', 'a', ?, 'd1-query', 'x', ?, datetime('now', ?), ?, ?, " + attempt + ")").run(...args);
  if (verif) d.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at, verifier) VALUES (?, 'd1-query', 'ok', 'x', ?, datetime('now', ?), 't')").run("goal-" + key, verif.pass, verif.min + " minutes");
}
function seedMetricCases(d) {
  goal(d, "A-deferred-fresh");
  goal(d, "B-deferred-stale", { attemptMin: -200 });
  goal(d, "C-probe-error-fresh", { verdict: "probe-error", attemptMin: -5 });
  goal(d, "D-parked", { status: "escalated" });
  goal(d, "E-verified-fresh", { verdict: "pass", verif: { pass: 1, min: -10 } });
  goal(d, "F-superseded", { status: "superseded", verdict: "superseded:probe-unusable (x)", attemptMin: -30 });
  goal(d, "G-new-contract", { tsAge: "-10 minutes", verdict: null, attemptMin: null });
  goal(d, "H-deferred-fresh-iso", { isoAttempt: true, attemptMin: -5 });
  goal(d, "I-completed", { gstatus: "completed" });
  goal(d, "J-fail-fresh", { verdict: "fail", verif: { pass: 0, min: -10 } });
  goal(d, "K-deferred-fresh-like", { verdict: "deferred" });
}
const classes = (d) => d.prepare("SELECT class FROM remediation_contracts").all().map(r => r.class);

// ======================= 1. roadmap-self-maintain, the metric =======================
{
  const d = mk();
  seedMetricCases(d);
  const oldSql = stepByName(OLD_RSM, "metric-goals-unevaluated");
  d.exec(oldSql);
  eq(metric(d), "7", "old statement counts A, B, C, D, F, H, K: every adopted goal whose contract is older than 120 minutes and has no fresh verification row (E, J verified, G new, I completed are not)");
  d.exec(migration);
  const newSql = stepByName(defOf(d, "roadmap-self-maintain"), "metric-goals-unevaluated");
  ok(newSql !== oldSql, "step 17 changed");
  d.exec("UPDATE metric_registry SET last_value='x' WHERE metric='goals_unevaluated'");
  d.exec(newSql);
  eq(metric(d), "4", "new statement: B (stale deferral), C (probe error), D (parked), F (superseded) are still unevaluated; A, H, K (fresh deferrals) are not");

  // each fresh-deferral exclusion depends on every one of its three conditions
  for (const [label, opts, want] of [
    ["status other than active", { status: "holding" }, "1"],
    ["verdict other than deferred", { verdict: "fail" }, "1"],
    ["attempt older than 120 minutes", { attemptMin: -121 }, "1"],
    ["a deferred read at 119 minutes", { attemptMin: -119 }, "0"],
    ["deferred but never attempted (last_attempt_at NULL)", { verdict: "deferred", attemptMin: null }, "1"],
    ["status NULL", { status: null }, "1"],
    ["verdict NULL with a fresh attempt", { verdict: null }, "1"],
    ["deferred with a verdict suffix", { verdict: "deferred:pending-window" }, "0"],
  ]) {
    const e = mk();
    goal(e, "X", opts);
    e.exec(migration);
    e.exec(stepByName(defOf(e, "roadmap-self-maintain"), "metric-goals-unevaluated"));
    eq(metric(e), want, "metric, single goal: " + label);
  }
  // the metric does not move for a goal that is not adopted, or whose contract is younger than 120 minutes
  const e2 = mk();
  goal(e2, "Y", { gstatus: "completed" });
  goal(e2, "Z", { tsAge: "-5 minutes", verdict: null, attemptMin: null });
  e2.exec(migration);
  e2.exec(stepByName(defOf(e2, "roadmap-self-maintain"), "metric-goals-unevaluated"));
  eq(metric(e2), "0", "completed goals and new contracts are not counted");
}

// ======================= roadmap-self-maintain, byte identity =======================
{
  const d = mk();
  d.exec(migration);
  const row = rowOf(d, "roadmap-self-maintain");
  eq([row.version, row.enabled, row.updated_at], [2, 1, FIXED_AT], "roadmap-self-maintain version 2, enabled, fixed updated_at");
  ok(d.prepare("SELECT json_valid(?) v").get(row.definition).v === 1, "roadmap-self-maintain definition is valid JSON");
  const a = stepsOf(OLD_RSM), b = stepsOf(row.definition);
  eq(b.length, a.length, "same number of steps");
  const diff = a.map((s, i) => JSON.stringify(s) === JSON.stringify(b[i]) ? null : i).filter(i => i !== null);
  eq(diff, [17], "only step 17 differs");
  eq(b[17].name, "metric-goals-unevaluated", "the changed step is metric-goals-unevaluated");
  const OLD_FRAG = "AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime('now', '-120 minutes'))) AS TEXT), last_refreshed";
  const NEW_FRAG = "AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime('now', '-120 minutes')) AND NOT (COALESCE(c.status, '') = 'active' AND COALESCE(c.last_verdict, '') LIKE 'deferred%' AND COALESCE(replace(substr(c.last_attempt_at, 1, 19), 'T', ' '), '') >= datetime('now', '-120 minutes'))) AS TEXT), last_refreshed";
  eq(row.definition, OLD_RSM.replace(OLD_FRAG, NEW_FRAG), "the new definition is the old one with exactly one text substitution (every other byte kept, whitespace included)");
  eq(row.definition.replace(NEW_FRAG, OLD_FRAG), OLD_RSM, "reversing the substitution restores the live definition byte for byte");
  ok(row.definition.length - OLD_RSM.length === NEW_FRAG.length - OLD_FRAG.length, "length grows by exactly the added clause");
  eq(rowOf(d, "other-task").version, 5, "an unrelated task keeps its version");
}

// ======================= 2. TP-5 and red-drain step 0 =======================
{
  // before: the contract flaps between superseded (red-drain) and active (roadmap-self-maintain contracts-reactivate)
  const d = mk();
  const steps = name => stepByName(defOf(d, "roadmap-self-maintain"), name);
  d.exec(steps("contracts"));
  const st = () => d.prepare("SELECT status, last_verdict FROM remediation_contracts WHERE class='goal-TP-5-MEASURE-TO-ACT-1'").get();
  eq(st().status, "active", "the goal contract is created active");
  ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class='goal-TP-5-MEASURE-TO-ACT-1'").get().verify_probe.includes("needs-machine-probe"), "its probe text carries the placeholder status literal");
  d.exec(RED_DRAIN_STEP0);
  eq(st().status, "superseded", "BEFORE: red-drain step 0 supersedes it");
  d.exec(steps("contracts-reactivate"));
  eq(st().status, "active", "BEFORE: roadmap-self-maintain re-activates it");
  d.exec(RED_DRAIN_STEP0);
  eq(st().status, "superseded", "BEFORE: and red-drain supersedes it again (the hourly flap)");
  const oldProbe = d.prepare("SELECT probe FROM v_goal_dod WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get().probe;

  // apply the migration, let the next roadmap-self-maintain run sync and re-activate, then red-drain runs
  d.exec(migration);
  const dod = d.prepare("SELECT dod FROM goals WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get().dod;
  ok(!dod.includes("needs-machine-probe"), "AFTER: the DoD no longer contains the literal");
  ok(dod.includes("status='needs-machine-'||'probe'") && dod.includes(", needs-machine probe contracts "), "AFTER: the status is built from two literals and the label is reworded");
  eq(dod, TP5_DOD.replaceAll("status='needs-machine-probe'", "status='needs-machine-'||'probe'").replace(", needs-machine-probe contracts ", ", needs-machine probe contracts "), "AFTER: nothing else in the DoD changed");
  d.exec(steps("contracts-sync"));
  d.exec(steps("contracts-reactivate"));
  d.exec(RED_DRAIN_STEP0);
  eq(st().status, "active", "AFTER: red-drain step 0 leaves the goal contract active");
  const vp = d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class='goal-TP-5-MEASURE-TO-ACT-1'").get().verify_probe;
  eq(vp, d.prepare("SELECT probe FROM v_goal_dod WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get().probe, "AFTER: the contract follows the DoD (contracts-sync)");
  ok(!/needs-machine-probe/.test(vp), "AFTER: the contract probe carries no literal for red-drain to match");
  // a second tick keeps it
  d.exec(RED_DRAIN_STEP0); d.exec(steps("contracts-reactivate")); d.exec(RED_DRAIN_STEP0);
  eq(st().status, "active", "AFTER: stable over further ticks");

  // the DoD is the same SELECT: old and new probe answer alike in every state
  const states = [
    ["8.1", 34], ["40", 0], ["40", 2], ["29.9", 0], [null, 0],
  ];
  for (const [pct, n] of states) {
    const e = mk();
    e.exec("DELETE FROM metric_registry WHERE metric='breach_code_task_pct'");
    if (pct !== null) e.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES ('breach_code_task_pct', 'o', 'l', ?, 'M')").run(pct);
    for (let i = 0; i < n; i++) e.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, 'p', 'a', 'x', 'd1-query', 'x', 'needs-machine-probe')").run("n" + i);
    const o = probeRow(e, oldProbe);
    const nw = probeRow(e, vp);
    eq(o[0], "ok", "old probe expected token");
    eq(nw, [o[0], o[1].replace("needs-machine-probe contracts", "needs-machine probe contracts")], "old and new DoD agree at breach_code_task_pct=" + pct + " with " + n + " placeholder contracts");
  }

  // the closing probe of issue 100069: not passing while TP-5 is superseded, passing once it is probed
  const live = mk();
  for (let i = 0; i < 10; i++) goal(live, "deferred-" + i, { tsAge: "-6 days", attemptMin: -10 - i });
  live.exec("UPDATE goals SET status='adopted' WHERE goal_key='TP-5-MEASURE-TO-ACT-1'");
  live.exec(stepByName(OLD_RSM, "contracts"));
  live.exec(RED_DRAIN_STEP0);
  live.exec("UPDATE remediation_contracts SET ts=datetime('now','-6 days') WHERE class='goal-TP-5-MEASURE-TO-ACT-1'");
  live.exec(stepByName(OLD_RSM, "metric-goals-unevaluated"));
  eq(metric(live), "11", "live-shaped state: the old metric reads 11 (10 deferred + TP-5)");
  eq(probeRow(live, CLOSE_100069), ["0", "1"], "closing probe 100069 does not pass before (TP-5 is the one unprobed goal)");
  live.exec(migration);
  live.exec(stepByName(defOf(live, "roadmap-self-maintain"), "contracts-sync"));
  live.exec(stepByName(defOf(live, "roadmap-self-maintain"), "contracts-reactivate"));
  live.exec("UPDATE remediation_contracts SET ts=datetime('now','-6 days') WHERE class='goal-TP-5-MEASURE-TO-ACT-1'");
  eq(probeRow(live, CLOSE_100069), ["0", "1"], "right after the re-activation TP-5 is still not probed (the consumer has not run yet)");
  live.exec("UPDATE remediation_contracts SET last_verdict='deferred', last_attempt_at=datetime('now') WHERE class='goal-TP-5-MEASURE-TO-ACT-1'");
  eq(probeRow(live, CLOSE_100069), ["0", "0"], "closing probe 100069 passes once the contract is probed (deferred read)");
  live.exec(stepByName(defOf(live, "roadmap-self-maintain"), "metric-goals-unevaluated"));
  eq(metric(live), "0", "and the new metric reads 0");
  // the old statement on the same state still reads 11: the change is what moves it
  live.exec(stepByName(OLD_RSM, "metric-goals-unevaluated"));
  eq(metric(live), "11", "the old statement on the same state still reads 11");
}
{
  const d = mk();
  seedMetricCases(d);
  const readQuery = a => /Read (SELECT [\s\S]*?)\. A (?:deferred read|contract that left)/.exec(a)[1];
  const before = d.prepare("SELECT class FROM (" + readQuery(TRIGGER_ACTION) + ")").all().map(r => r.class).sort();
  d.exec(migration);
  const action = d.prepare("SELECT action FROM analytics_metric_triggers WHERE id=9162").get().action;
  const after = d.prepare("SELECT class FROM (" + readQuery(action) + ")").all().map(r => r.class).sort();
  const gone = before.filter(c => !after.includes(c));
  eq(gone, ["goal-A-deferred-fresh", "goal-H-deferred-fresh-iso", "goal-K-deferred-fresh-like"], "the trigger's read query no longer lists fresh deferrals and keeps everything else");
  ok(after.every(c => before.includes(c)), "the new read query lists no class the old one did not");
  ok(action.endsWith(TRIGGER_ACTION.split("-120 minutes'))). A contract")[1]), "the rest of the action text is kept");
  ok(action.includes("Definition of done: goals_unevaluated reads 0."), "definition of done kept");
}

// ======================= 3. portfolio-lifecycle =======================
const F = {
  step1: ["JOIN projects p ON p.project_code='W.'||dh.resource_name WHERE dh.action='deploy' AND", "JOIN projects p ON p.project_code='W.'||dh.resource_name WHERE dh.action IN ('deploy','deployed') AND"],
  step5: ["dh.resource_name=p.owner_service AND dh.action='deploy' AND", "dh.resource_name=p.owner_service AND dh.action IN ('deploy','deployed') AND"],
  step6: ["dh.resource_name=s.service AND dh.action='deploy' AND", "dh.resource_name=s.service AND dh.action IN ('deploy','deployed') AND"],
};
{
  const d = mk();
  d.exec(migration);
  const row = rowOf(d, "portfolio-lifecycle");
  eq([row.version, row.enabled, row.updated_at], [3, 1, FIXED_AT], "portfolio-lifecycle version 3, enabled, fixed updated_at");
  ok(d.prepare("SELECT json_valid(?) v").get(row.definition).v === 1, "portfolio-lifecycle definition is valid JSON");
  const a = stepsOf(OLD_PL), b = stepsOf(row.definition);
  eq(b.length, 8, "eight steps");
  eq(a.map((s, i) => JSON.stringify(s) === JSON.stringify(b[i]) ? null : i).filter(i => i !== null), [1, 5, 6], "only steps 1, 5 and 6 differ");
  let expect = OLD_PL;
  for (const [o, n] of Object.values(F)) expect = expect.replaceAll(o, n);
  eq(row.definition, expect, "the new definition is the old one with exactly the three named substitutions");
  let back = row.definition;
  for (const [o, n] of Object.values(F)) back = back.replaceAll(n, o);
  eq(back, OLD_PL, "reversing them restores the live definition byte for byte");
  eq([count(OLD_PL, "dh.action='deploy'"), count(row.definition, "dh.action='deploy'"), count(row.definition, "dh.action IN ('deploy','deployed')")], [6, 2, 4], "'deploy' reads: 6 before, 2 after (the UPDATE projects statement), 4 reads of the pair");
  eq(count(b[3].sql, "dh.action='deploy'"), 2, "step 3 (UPDATE projects.updated_at) still reads action='deploy' only");
  for (const i of [0, 2, 3, 4, 7]) eq(b[i].sql, a[i].sql, "step " + i + " is byte identical");
  // the canonical row moved with it
  const c = d.prepare("SELECT definition, repo_path FROM fleet_tasks_canonical WHERE id='portfolio-lifecycle'").get();
  eq(c.definition, row.definition, "fleet_tasks_canonical equals the live definition (the drift gate files nothing)");
  eq(c.repo_path, "migrations/2026-10-26-sweep-fleet-tasks-c.sql", "canonical repo_path names the migration");
  eq(d.prepare("SELECT definition, repo_path FROM fleet_tasks_canonical WHERE id='other-task'").get().repo_path, null, "an unrelated canonical row is untouched");
  const gate = d.prepare("SELECT COUNT(*) n FROM fleet_tasks t JOIN fleet_tasks_canonical c ON c.id=t.id WHERE t.definition <> c.definition").get().n;
  eq(gate, 0, "fleet-tasks-drift-gate query finds no drift");
  // docs mirror
  const doc = docs.tasks["portfolio-lifecycle"];
  eq([doc.definition === row.definition, doc.version, doc.enabled, doc.updated_at], [true, 3, 1, FIXED_AT], "docs/fleet-tasks-canonical.json mirrors the migrated portfolio-lifecycle row");
}

const DAY = "strftime('%Y-%m-%dT%H:%M:%fZ','now',?)";
function seedPortfolio(d) {
  d.exec("INSERT INTO programs (program_code, portfolio_code, name) VALUES ('QNFO.OPS', 'QNFO', 'ops')");
  const worker = (name, rows) => {
    d.prepare("INSERT INTO service_registry (service, kind, state) VALUES (?, 'worker', 'live')").run(name);
    d.prepare("INSERT INTO projects (project_code, program_code, name, status, owner_service, updated_at) VALUES (?, 'QNFO.OPS', ?, 'active', ?, '2000-01-01 00:00:00')").run("W." + name, name, name);
    for (const [action, status, ago] of rows) d.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status, notes) VALUES ('worker', ?, ?, 'v-' || ?, 'seed', " + DAY + ", ?, 'n')").run(name, action, name + action + ago, ago, status);
  };
  worker("voice-stt", [["deployed", "success", "-6 days"]]);           // reconciled only (issues 100341, 100342)
  worker("plain-deploy", [["deploy", "success", "-2 days"]]);          // an ordinary deploy
  worker("never", []);                                                  // nothing recorded
  worker("failed-recon", [["deployed", "failed", "-1 days"]]);         // a failed reconcile row does not count
  worker("direct-only", [["deploy-direct", "success", "-1 days"]]);    // a content deploy is not a worker deploy
  worker("old-recon", [["deployed", "success", "-45 days"]]);          // reconciled, but older than 30 days
  worker("mixed", [["deploy", "success", "-40 days"], ["deployed", "success", "-3 days"]]);
}
const gaps = d => d.prepare("SELECT kind, entity FROM portfolio_gaps ORDER BY kind, entity").all().map(r => r.kind + ":" + r.entity);
const ledger = d => d.prepare("SELECT project_id FROM project_ledger ORDER BY project_id, task_id").all().map(r => r.project_id);
function tick(d, def) { for (const s of stepsOf(def)) d.exec(s.sql); }

{
  const o = mk(); seedPortfolio(o);
  tick(o, OLD_PL);
  eq(gaps(o), [
    "deploy-unrecorded:direct-only", "deploy-unrecorded:failed-recon", "deploy-unrecorded:never", "deploy-unrecorded:old-recon", "deploy-unrecorded:voice-stt",
    "project-stale-deploy:W.direct-only", "project-stale-deploy:W.failed-recon", "project-stale-deploy:W.mixed", "project-stale-deploy:W.never", "project-stale-deploy:W.old-recon", "project-stale-deploy:W.voice-stt",
  ], "BEFORE: voice-stt is filed for both gaps (as live)");
  eq(ledger(o), ["W.plain-deploy"], "BEFORE: only the ordinary deploy is linked to project_ledger");

  const n = mk(); seedPortfolio(n);
  n.exec(migration);
  const NEW_PL = defOf(n, "portfolio-lifecycle");
  tick(n, NEW_PL);
  eq(gaps(n), [
    "deploy-unrecorded:direct-only", "deploy-unrecorded:failed-recon", "deploy-unrecorded:never",
    "project-stale-deploy:W.direct-only", "project-stale-deploy:W.failed-recon", "project-stale-deploy:W.never", "project-stale-deploy:W.old-recon",
  ], "AFTER: voice-stt, mixed and the reconciled worker inside 30 days are no longer filed; failed, deploy-direct, never and 45-day-old rows still are");
  eq(ledger(n), ["W.mixed", "W.plain-deploy", "W.voice-stt"], "AFTER: reconciled deployments inside 7 days are linked (the 40-day deploy, the 45-day row and the failed row are not)");
  eq(n.prepare("SELECT COUNT(*) c FROM project_state").get().c, 3, "AFTER: one project_state snapshot per linked deployment");
  const evidence = n.prepare("SELECT evidence, worker_name, action FROM project_ledger WHERE project_id='W.voice-stt'").get();
  eq([evidence.worker_name, evidence.action, /deployed by seed/.test(evidence.evidence)], ["voice-stt", "deployed", true], "AFTER: the ledger row says who recorded it");
  eq(n.prepare("SELECT updated_at FROM projects WHERE project_code='W.voice-stt'").get().updated_at, "2000-01-01 00:00:00", "projects.updated_at (not named by the issues) is not touched for a reconciled-only worker");
  // gaps both versions file for the same worker are identical (the change adds nothing it did not file before)
  const oldSet = new Set(gaps(o));
  ok(gaps(n).every(g => oldSet.has(g)), "the new gap set is a subset of the old one: nothing new is filed");
  const stale = n.prepare("SELECT detail FROM portfolio_gaps WHERE entity='W.old-recon'").get().detail;
  ok(/last deployed 20\d\d-\d\d-\d\dT/.test(stale), "the stale gap detail names the reconciled deployment time: " + stale);

  // idempotent over further ticks, and the next day's tick files nothing for voice-stt
  const before = JSON.stringify([gaps(n), ledger(n), n.prepare("SELECT COUNT(*) c FROM project_state").get().c]);
  tick(n, NEW_PL);
  eq(JSON.stringify([gaps(n), ledger(n), n.prepare("SELECT COUNT(*) c FROM project_state").get().c]), before, "a second tick changes nothing");

  // closing probes of 100341 / 100342 (the first day after the fix is today in the replay)
  const p41 = today(CLOSE_100341), p42 = today(CLOSE_100342);
  const fresh = mk(); seedPortfolio(fresh);
  eq(probeRow(fresh, p41)[1].startsWith("pending:"), true, "closing probe 100341 reads pending before any tick (does not pass)");
  eq(probeRow(fresh, p42)[1].startsWith("pending:"), true, "closing probe 100342 reads pending before any tick (does not pass)");
  tick(fresh, OLD_PL);
  eq([probeRow(fresh, p41), probeRow(fresh, p42)], [["0", "1"], ["0", "1"]], "closing probes read 1 when the old definition ticks: they fail while the defect exists");
  eq([probeRow(n, p41), probeRow(n, p42)], [["0", "0"], ["0", "0"]], "closing probes read 0 after a tick of the new definition");
  eq(CLOSE_100341.includes("'voice-stt'") && CLOSE_100342.includes("'W.voice-stt'"), true, "probes name the real entities");
}

// ======================= 4. whole-migration properties =======================
{
  const d = mk();
  d.exec(migration);
  const snap = () => JSON.stringify({
    t: d.prepare("SELECT id, definition, version, enabled, updated_at FROM fleet_tasks ORDER BY id").all(),
    c: d.prepare("SELECT * FROM fleet_tasks_canonical ORDER BY id").all(),
    g: d.prepare("SELECT goal_key, dod, updated_at FROM goals ORDER BY goal_key").all(),
    a: d.prepare("SELECT id, action FROM analytics_metric_triggers").all(),
    f: d.prepare("SELECT fm_key FROM failure_modes ORDER BY fm_key").all(),
    r: d.prepare("SELECT class, status FROM remediation_contracts ORDER BY class").all(),
    l: d.prepare("SELECT COUNT(*) n FROM decision_log").get(),
  });
  const first = snap();
  const goalsUpdatedAt = d.prepare("SELECT updated_at FROM goals WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get().updated_at;
  d.exec(migration);
  eq(snap(), first, "a second apply changes nothing");
  eq(d.prepare("SELECT updated_at FROM goals WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get().updated_at, goalsUpdatedAt, "a second apply does not touch goals.updated_at");
  eq([rowOf(d, "roadmap-self-maintain").version, rowOf(d, "portfolio-lifecycle").version], [2, 3], "versions bump once");
  eq(d.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1, "one decision_log row");
  const dl = d.prepare("SELECT * FROM decision_log").get();
  for (const k of ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"]) ok(dl[k] && String(dl[k]).length > 0, "decision_log." + k + " is filled");
  ok(/^goals_unevaluated < 1 within 6 h$/.test(dl.predicted_outcome), "predicted_outcome is in the parsable '<metric> <op> <n> within <n> h' form and nothing follows it");
  eq(d.prepare("SELECT COUNT(*) n FROM failure_modes").get().n, 3, "three failure modes");
  eq(d.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%' AND module='failure-mode' AND status='active' AND verify_transport='d1-query'").get().n, 3, "three active d1-query fm- detector contracts");
  eq(d.prepare("SELECT COUNT(*) n FROM failure_modes f JOIN remediation_contracts c ON c.class = f.probe_class AND c.class = 'fm-' || f.fm_key").get().n, 3, "each failure mode names its detector contract (fm-<key>) as probe_class");
  eq(d.prepare("SELECT COUNT(*) n FROM failure_modes WHERE issue_id IN (100069, 100341)").get().n, 3, "each failure mode points at its issue");
  // backups hold the old rows
  eq(d.prepare("SELECT id, definition, version, updated_at FROM bak_20261026_sweep_c_fleet_tasks ORDER BY id").all().map(r => [r.id, r.definition === (r.id === "portfolio-lifecycle" ? OLD_PL : OLD_RSM), r.version]), [["portfolio-lifecycle", true, 2], ["roadmap-self-maintain", true, 1]], "bak_20261026_sweep_c_fleet_tasks holds both old rows");
  eq(d.prepare("SELECT definition = ? AS same FROM bak_20261026_sweep_c_canon").get(OLD_PL).same, 1, "canon backup holds the old canonical row");
  eq(d.prepare("SELECT dod FROM bak_20261026_sweep_c_goal").get().dod, TP5_DOD, "goal backup holds the old DoD");
  eq(d.prepare("SELECT action FROM bak_20261026_sweep_c_trigger").get().action, TRIGGER_ACTION, "trigger backup holds the old action text");

  // detectors: fail before, pass after
  const before = mk();
  const detectors = (db) => Object.fromEntries(db.prepare("SELECT class, verify_probe FROM remediation_contracts WHERE class LIKE 'fm-%'").all().map(r => [r.class, probeRow(db, r.verify_probe)]));
  const after = detectors(d);
  eq(Object.entries(after).sort(), [
    ["fm-goal-dod-embeds-placeholder-literal", ["0", "0"]],
    ["fm-goals-unevaluated-counts-deferred-probes", ["1", "1"]],
    ["fm-portfolio-gap-ignores-reconciled-deploy", ["1", "1"]],
  ], "AFTER: all three detectors pass (observed equals expected)");
  // the same probes against the pre-migration database: read their text from the migrated one
  const probes = d.prepare("SELECT class, verify_probe FROM remediation_contracts WHERE class LIKE 'fm-%'").all();
  eq(probes.map(p => [p.class, probeRow(before, p.verify_probe)]).sort(), [
    ["fm-goal-dod-embeds-placeholder-literal", ["0", "1"]],
    ["fm-goals-unevaluated-counts-deferred-probes", ["1", "0"]],
    ["fm-portfolio-gap-ignores-reconciled-deploy", ["1", "0"]],
  ], "BEFORE: all three detectors fail on the live definitions");
  for (const p of probes) ok(!/\b(insert into|update |delete from|drop |alter |pragma )/i.test(p.verify_probe), "detector probe is read-only: " + p.class);

  // Rollback header restores every touched row
  const rb = /^-- Rollback: (.+)$/m.exec(migration)[1];
  d.exec(rb);
  eq(rowOf(d, "roadmap-self-maintain"), { definition: OLD_RSM, version: 1, enabled: 1, updated_at: "2026-10-19T04:46:15Z" }, "Rollback restores roadmap-self-maintain");
  eq(rowOf(d, "portfolio-lifecycle"), { definition: OLD_PL, version: 2, enabled: 1, updated_at: "2026-10-19 14:13:12" }, "Rollback restores portfolio-lifecycle");
  eq(d.prepare("SELECT definition, repo_path, exported_at FROM fleet_tasks_canonical WHERE id='portfolio-lifecycle'").get(), { definition: OLD_PL, repo_path: null, exported_at: "2026-10-18 13:49:49" }, "Rollback restores the canonical row");
  eq(d.prepare("SELECT dod, updated_at FROM goals WHERE goal_key='TP-5-MEASURE-TO-ACT-1'").get(), { dod: TP5_DOD, updated_at: "2026-10-19 04:00:00" }, "Rollback restores the TP-5 DoD");
  eq(d.prepare("SELECT action FROM analytics_metric_triggers WHERE id=9162").get().action, TRIGGER_ACTION, "Rollback restores the trigger action");
  eq([d.prepare("SELECT COUNT(*) n FROM failure_modes").get().n, d.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n], [0, 0], "Rollback removes the failure modes and their detectors");
}

// an unexpected shape aborts before any write
for (const [label, opts] of [
  ["roadmap-self-maintain step 17 edited elsewhere", { rsm: OLD_RSM.replace("s.last_verified_at < datetime('now', '-120 minutes')))", "s.last_verified_at < datetime('now', '-60 minutes')))") }],
  ["portfolio-lifecycle step 6 edited elsewhere", { pl: OLD_PL.replace("dh.resource_name=s.service AND dh.action='deploy' AND", "dh.resource_name=s.service AND dh.action='deployx' AND") }],
  ["portfolio-lifecycle differs from fleet_tasks_canonical", { canon: OLD_PL + " " }],
]) {
  const d = mk(opts);
  let err = null;
  try { d.exec(migration); } catch (e) { err = e; }
  ok(err && /malformed JSON/.test(String(err.message)), "guard aborts: " + label, err && err.message);
  eq(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'bak_20261026_sweep_c_%'").get().n, 0, "nothing was written (no backup table): " + label);
  eq([rowOf(d, "roadmap-self-maintain").version, rowOf(d, "portfolio-lifecycle").version], [1, 2], "versions unchanged: " + label);
}

console.log("sweep-fleet-tasks-c: " + pass + " assertions passed, " + fail + " failed");
if (fail) process.exit(1);
