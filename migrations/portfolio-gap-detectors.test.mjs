// PORTFOLIO-GAP-DETECTORS-1 offline suite: migrations/2026-10-26-portfolio-gap-detectors.sql makes the portfolio deploy detectors judge only
// owners that can be deployed.
// It runs the two LIVE task texts (pinned in portfolio-gap-detectors.fixture.json, read from qnfo-audit on 2026-10-26: portfolio-lifecycle v3 after
// SWEEP-FLEET-TASKS-C, portfolio-deploy-sync v1) in node:sqlite
// against the live column lists, before and after the migration, and proves:
//   * the pre-change state is the defect: a program-manager owner and two stub registry entries produce project-stale-deploy and
//     project-never-deployed gaps (this suite fails on the old definitions);
//   * after the change a manager-owned project, a stub and a retired service produce nothing, while a live worker (and a 'member' service) with
//     no deploy in 30 days, a worker with no deploy at all and a project with no owner_service still do;
//   * the stub list is data (ops_config portfolio_gap_stub_services);
//   * the task replace is a no-op on replay, when the fragment is absent or doubled, and when the text is not JSON; only the fragments change;
//     a task another session edited is never blessed into fleet_tasks_canonical;
//   * the closes: every issue carries issue_triage.close_evidence naming the entity, the owner_service and the registry fact, the live close guard
//     (issue_close_evidence_required) is replayed, an issue with a LIVE claim by another session in the work_claims ledger or an armed contract
//     (failing or pending) is left to it, an unrelated stale-deploy gap and its issue stay; agent_issues.linked_session is attribution that outlives a
//     release (qnfo-deploy-guard keeps it), so it never blocks a close: a released, abandoned or expired claim, a claim carrying this change's tag and
//     the claim-then-apply scenario (the work-claim procedure sets linked_session on every target) all close;
//   * the spec's closing probe reads 10 before and 0 after; the failure-mode detector and the belief probe read 0 and 1 and fire on a regression;
//   * a second apply changes nothing, and the Rollback line restores the definitions, gaps, issues and contracts (decision_log stays: append-only).
// Run: node --no-warnings migrations/portfolio-gap-detectors.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-portfolio-gap-detectors.sql"), "utf8").replace(/\r\n/g, "\n");
const fixture = JSON.parse(readFileSync(here("portfolio-gap-detectors.fixture.json"), "utf8"));
const LIFECYCLE = fixture["portfolio-lifecycle"];
const SYNC = fixture["portfolio-deploy-sync"];
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const all = (db, s, ...a) => db.prepare(s).all(...a);
const stepsOf = (def) => JSON.parse(def).steps;
const STALE_FRAG = "WHERE p.status='active' AND p.owner_service IS NOT NULL AND COALESCE(";
const SYNC_FRAG_1 = "'open' FROM v_portfolio_deploy_drift\"";
const SYNC_FRAG_2 = "SELECT 1 FROM v_portfolio_deploy_drift v WHERE v.kind";
const count = (text, frag) => text.split(frag).length - 1;

// the spec's closing probe, verbatim
const CLOSING_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM portfolio_gaps g JOIN projects p ON p.project_code = g.entity WHERE g.status = 'open' AND g.kind IN ('project-stale-deploy','project-never-deployed') AND p.owner_service LIKE 'program-manager:%') AS TEXT) AS observed";
const FM_PROBE = "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_portfolio_gap_owner_not_deployable WHERE status = 'open'";

// ---------------------------------------------------------------------------------------------------------------------------------------
// the fixture database: live column lists (qnfo-audit, read 2026-10-26) and the live guard triggers
// ---------------------------------------------------------------------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE portfolios (portfolio_code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, owner TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE programs (program_code TEXT PRIMARY KEY, portfolio_code TEXT NOT NULL REFERENCES portfolios(portfolio_code), name TEXT NOT NULL, description TEXT, program_manager TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL REFERENCES programs(program_code), name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', github_repo TEXT, pages_project TEXT, r2_prefix TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, source TEXT, owner_service TEXT, gh_milestone INTEGER);
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT, _version INTEGER DEFAULT 1, wbs_code TEXT);
CREATE TABLE project_deployment_state (project_code TEXT NOT NULL, worker_name TEXT NOT NULL, deployments INTEGER NOT NULL DEFAULT 0, first_deploy TEXT, last_deploy TEXT, last_version TEXT, versions INTEGER NOT NULL DEFAULT 0, last_upgrade TEXT, days_since_deploy INTEGER, synced_at TEXT, PRIMARY KEY (project_code, worker_name));
CREATE TABLE portfolio_gaps (kind TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT, first_seen TEXT DEFAULT (datetime('now')), day TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, issue_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, entity, day));
CREATE VIEW v_portfolio_deploy_drift AS
SELECT 'project-never-deployed' AS kind, p.project_code AS ref, 'active project with no recorded deployment for ' || COALESCE(p.owner_service,'(no owner_service)') AS detail
  FROM projects p LEFT JOIN project_deployment_state s ON s.project_code = p.project_code
 WHERE p.status = 'active' AND s.project_code IS NULL
UNION ALL
SELECT 'project-stale-deploy', p.project_code, p.name || ': last deploy ' || s.days_since_deploy || ' days ago (' || s.deployments || ' total, ' || s.versions || ' versions)'
  FROM projects p JOIN project_deployment_state s ON s.project_code = p.project_code
 WHERE p.status = 'active' AND s.days_since_deploy > 30
UNION ALL
SELECT 'project-no-upgrade-tracked', p.project_code, p.name || ': ' || s.deployments || ' deploys but a single distinct version - nothing to upgrade from'
  FROM projects p JOIN project_deployment_state s ON s.project_code = p.project_code
 WHERE p.status = 'active' AND s.versions <= 1 AND s.deployments > 1;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;
CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status, CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`;

// services: [service, kind, state, version]
const SERVICES = [
  ["qnfo-ops", "worker", "live", "1.0.0"],
  ["old-worker", "worker", "live", "2.0.0"],
  ["never-worker", "worker", "live", "0.1.0"],
  ["member-svc", "member", "live", "0.3.0"],
  ["voice-stt", "worker", "live", "unknown"],
  ["qnfo-workers", "worker", "live", "unknown"],
  ["qnfo-agents", "worker", "live", "0.2.3"],
  ["retired-worker", "worker", "retired", "1.0.0"],
];
// active projects: [project_code, program_code, owner_service]
const PROJECTS = [
  ["BP26.AGENTOPS", "QNFO.OPS", "program-manager:QNFO.OPS"],
  ["BP26.COMPLIANCE", "QNFO.OPS", "program-manager:QNFO.OPS"],
  ["BP26.EDITORIAL", "QNFO.RSCH", "program-manager:QNFO.RSCH"],
  ["BP26.ENGINEERING", "QNFO.INFRA", "program-manager:QNFO.INFRA"],
  ["BP26.REACH", "QNFO.REACH", "program-manager:QNFO.REACH"],
  ["W.qnfo-ops", "QNFO.INFRA", "qnfo-ops"],
  ["W.old-worker", "QNFO.INFRA", "old-worker"],
  ["W.never-worker", "QNFO.INFRA", "never-worker"],
  ["W.member-svc", "QNFO.INFRA", "member-svc"],
  ["W.voice-stt", "QNFO.INFRA", "voice-stt"],
  ["W.qnfo-workers", "QNFO.INFRA", "qnfo-workers"],
  ["W.qnfo-agents", "QNFO.INFRA", "qnfo-agents"],
  ["W.retired-worker", "QNFO.INFRA", "retired-worker"],
  ["W.no-owner", "QNFO.INFRA", null],
];
const BP26 = PROJECTS.filter((p) => p[0].startsWith("BP26.")).map((p) => p[0]);
// the issue ids the autopilot filed (live ids), plus two unrelated stale-deploy issues that must stay
const ISSUE_OF = { "BP26.AGENTOPS": 1000376, "BP26.COMPLIANCE": 1000377, "BP26.EDITORIAL": 1000378, "BP26.ENGINEERING": 1000379, "BP26.REACH": 1000380, "W.qnfo-workers": 1000126, "W.voice-stt": 100342, "W.qnfo-agents": 1000264, "W.old-worker": 5000001, "W.never-worker": 5000002 };
const PERSONAS = [1000376, 1000377, 1000378, 1000379, 1000380];
const CLOSES = [...PERSONAS, 1000264, 1000126];
// the stub issues: 1000126 keeps its linked_session (attribution; its only claim, work_claims 5392, was released as abandoned) and closes with the stub
// evidence; 100342 has the closing contract SWEEP-FLEET-TASKS-C re-armed and is left to it
const STUBS = [1000126, 100342];
const SKIPPED = [100342];
const STAYS = [5000001, 5000002];

function newDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  return db;
}

// the world: registry, projects, deployments and the two live tasks (old definitions)
function world(db, { defs = true } = {}) {
  db.exec("INSERT INTO portfolios (portfolio_code, name) VALUES ('QNFO', 'QNFO')");
  for (const p of ["QNFO.OPS", "QNFO.RSCH", "QNFO.INFRA", "QNFO.REACH"]) db.prepare("INSERT INTO programs (program_code, portfolio_code, name) VALUES (?, 'QNFO', ?)").run(p, p);
  for (const [s, k, st, v] of SERVICES) db.prepare("INSERT INTO service_registry (service, kind, state, version) VALUES (?, ?, ?, ?)").run(s, k, st, v);
  for (const [code, prog, owner] of PROJECTS) {
    const created = code === "W.qnfo-agents" ? "datetime('now', '-5 hours')" : "datetime('now', '-3 days')";
    db.exec(`INSERT INTO projects (project_code, program_code, name, status, owner_service, created_at) VALUES ('${code}', '${prog}', '${code}', 'active', ${owner === null ? "NULL" : "'" + owner + "'"}, ${created})`);
  }
  const dep = (name, action, ver, ago, by = "test") => db.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status) VALUES ('worker', ?, ?, ?, ?, datetime('now', ?), 'success')").run(name, action, ver, by, ago);
  dep("qnfo-ops", "deploy", "1.0.0", "-3 days"); dep("qnfo-ops", "deploy", "1.0.1", "-2 days");
  dep("old-worker", "deploy", "1.9.0", "-50 days"); dep("old-worker", "deploy", "2.0.0", "-40 days");
  dep("voice-stt", "deployed", "3c470eb5", "-40 days", "deployment-ledger-reconcile");
  dep("qnfo-workers", "deployed", "u1", "-1 days", "deployment-ledger-reconcile"); dep("qnfo-workers", "deployed", "u1", "-2 days", "deployment-ledger-reconcile");
  dep("qnfo-agents", "deployed", "u9", "-5 hours", "deployment-ledger-reconcile");
  dep("qnfo-agents", "deploy", "0.2.1", "-70 minutes", "qnfo-ops:cf_worker_deploy"); dep("qnfo-agents", "deploy", "0.2.2", "-60 minutes", "qnfo-ops:cf_worker_deploy");
  if (defs) {
    db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('portfolio-lifecycle', 'PORTFOLIO-LIFECYCLE-1', 'workflow', ?, 3, '2026-10-26T09:40:00Z')").run(LIFECYCLE);
    db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('portfolio-deploy-sync', 'Portfolio deploy/upgrade sync', 'workflow', ?, 1, '2026-10-18 13:49:46')").run(SYNC);
    db.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('portfolio-lifecycle', ?, NULL, '2026-10-18 13:49:49')").run(LIFECYCLE);
    db.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('portfolio-deploy-sync', ?, NULL, '2026-10-18 13:49:49')").run(SYNC);
  }
  return db;
}

// one tick of the two detectors: the lifecycle stale-deploy statement, then the sync steps (portfolio-lifecycle runs at :10, the sync at :20)
function tick(db) {
  const lc = stepsOf(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'portfolio-lifecycle'").definition);
  db.exec(lc.find((s) => s.sql.includes("SELECT 'project-stale-deploy', p.project_code")).sql);
  for (const s of stepsOf(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'portfolio-deploy-sync'").definition)) db.exec(s.sql);
}
const openGaps = (db) => all(db, "SELECT kind, entity FROM portfolio_gaps WHERE status = 'open' AND kind IN ('project-stale-deploy', 'project-never-deployed', 'project-no-upgrade-tracked') ORDER BY kind, entity").map((r) => r.kind + " " + r.entity);

// the legacy state: the old detectors have run, the autopilot has filed and linked its issues (live ids), voice-stt has seven daily rows
function legacy() {
  const db = world(newDb());
  tick(db);
  // the W.qnfo-agents row was written at 05:10Z, 35 minutes after the project was created and before the first action=deploy row
  db.prepare("DELETE FROM portfolio_gaps WHERE entity = 'W.qnfo-agents'").run();
  db.exec("INSERT INTO portfolio_gaps (kind, entity, detail, first_seen, day) VALUES ('project-stale-deploy', 'W.qnfo-agents', 'active project whose owner last deployed never', datetime('now', '-5 hours', '+35 minutes'), date('now'))");
  for (let i = 1; i <= 6; i++) db.exec(`INSERT INTO portfolio_gaps (kind, entity, detail, first_seen, day) VALUES ('project-stale-deploy', 'W.voice-stt', 'active project whose owner last deployed never', datetime('now', '-${i} days'), date('now', '-${i} days'))`);
  // qnfo-workers filed two rows before lifecycle v3 counted the reconcile rows (live: 2026-10-25 and 2026-10-26)
  for (const i of [0, 1]) db.exec(`INSERT INTO portfolio_gaps (kind, entity, detail, first_seen, day) VALUES ('project-stale-deploy', 'W.qnfo-workers', 'active project whose owner last deployed never', datetime('now', '-${i} days'), date('now', '-${i} days'))`);
  const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?, ?, ?, 'portfolio-autopilot', 'portfolio', 'high', 'open', ?, 1, 1)");
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'PORTFOLIO-AUTOPILOT-1', 'triaged', 'qnfo-ops', '2026-10-26 10:00:00')");
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', ?, ?)");
  for (const [entity, id] of Object.entries(ISSUE_OF)) {
    ins.run(id, "PORTFOLIO-GAP project-stale-deploy " + entity, "Filed by the portfolio autopilot (entity " + entity + ").", id === 1000126 ? "b6445c2a-8e78-4ad1-bca0-41d39f3c4f7b" : null);
    tri.run(id);
    // 100342's closing contract was re-armed by SWEEP-FLEET-TASKS-C: active, answering pending
    if (id === 100342) con.run("issue-" + id, id, "active", "rearmed: SWEEP-FLEET-TASKS-C (was superseded:closure-observing-probe-at-birth)");
    else con.run("issue-" + id, id, "superseded", "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1)");
    db.prepare("UPDATE portfolio_gaps SET issue_id = ? WHERE kind = 'project-stale-deploy' AND entity = ?").run(id, entity);
  }
  con.run("issue-100342-BACKFILL-1", 100342, "probe-review-refused", "probe-review-refused");
  // live work_claims id 5392: the only claim ever taken on 1000126, released as abandoned two minutes after it was acquired (linked_session stayed)
  db.exec("INSERT INTO work_claims (id, path, intent, holder, issue_id, claimed_at, expires_at, released_at, outcome) VALUES (5392, 'issue:1000126', 'Own separate entity evidence handoff for mirrored issue #3934 W.qnfo-workers', 'b6445c2a-8e78-4ad1-bca0-41d39f3c4f7b', 1000126, '2026-10-25T07:41:20Z', '2026-10-25T08:41:20Z', '2026-10-25T07:43:07Z', 'abandoned')");
  return db;
}

const TABLES = ["fleet_tasks", "fleet_tasks_canonical", "portfolio_gaps", "agent_issues", "issue_triage", "remediation_contracts", "ops_config", "failure_modes", "belief_registry", "control_registry", "capability_ledger", "service_registry", "projects", "project_deployment_state", "deployment_history", "work_claims"];
const snapshot = (db) => JSON.stringify({
  t: TABLES.map((t) => all(db, `SELECT * FROM ${t} ORDER BY rowid`)),
  decisions: one(db, "SELECT COUNT(*) AS n FROM decision_log").n,
  lifecycle: one(db, "SELECT COUNT(*) AS n FROM issue_lifecycle").n,
  objects: all(db, "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"),
});
const defOf = (db, id) => one(db, "SELECT definition FROM fleet_tasks WHERE id = ?", id).definition;
const verOf = (db, id) => one(db, "SELECT version FROM fleet_tasks WHERE id = ?", id).version;
const canon = (db, id) => one(db, "SELECT definition FROM fleet_tasks_canonical WHERE id = ?", id).definition;
const issue = (db, id) => one(db, "SELECT a.id, a.status, a.close_channel, t.triage_state, t.close_evidence FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = ?", id);

// ---------------------------------------------------------------------------------------------------------------------------------------
// 0. the migration file and the pinned live task texts
// ---------------------------------------------------------------------------------------------------------------------------------------
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the file opts in to the migration runner");
ok(sql.split("\n").filter((l) => l.startsWith("-- Rollback:")).length === 1 && rollback.length > 200, "one Rollback line");
const banned = ["claude" + ".ai", "anthropic" + ".com", "[skip" + " ci]", "[ci" + " skip]", "skip-checks" + ":"];
ok(!banned.some((t) => (sql + JSON.stringify(fixture)).toLowerCase().includes(t)), "no claude or anthropic host and no skip-CI token in the migration or the fixture");
ok(!/^\s*(DELETE\s+FROM|DROP\s+)/im.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no DELETE or DROP is executed (nothing needs a BACKUP header)");
const execSql = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/linked_session/i.test(execSql.split("INSERT INTO decision_log")[0]), "no statement before the decision_log row reads agent_issues.linked_session (attribution that outlives a release, not a claim)");
ok((execSql.match(/FROM work_claims w WHERE/g) || []).length === 4 && (execSql.match(/released_at IS NULL AND w\.expires_at > strftime\('%Y-%m-%dT%H:%M:%SZ', 'now'\) AND instr\(COALESCE\(w\.intent, ''\), 'PORTFOLIO-GAP-DETECTORS-1'\) = 0/g) || []).length === 4, "each of the four closes consults the live claim ledger (unreleased, unexpired, not this change's own tag)");
ok(count(LIFECYCLE, STALE_FRAG) === 1 && count(SYNC, SYNC_FRAG_1) === 1 && count(SYNC, SYNC_FRAG_2) === 1, "each live fragment occurs exactly once in the pinned task texts");
ok(count(SYNC, "v_portfolio_deploy_drift") === 2 && count(SYNC, "project-never-deployed") === 1, "the sync task reads the drift view twice; 'project-never-deployed' appears only in its resolve step");
ok(LIFECYCLE.length === 4719 && SYNC.length === 1728, "the pinned texts have the live lengths (4719 and 1728)", [LIFECYCLE.length, SYNC.length]);
ok(count(LIFECYCLE, "dh.action IN ('deploy','deployed')") === 4, "the pinned lifecycle text is the SWEEP-FLEET-TASKS-C one (reconciled deploys count)");
for (const t of [LIFECYCLE, SYNC]) ok(stepsOf(t).every((s) => s.type === "sql" && s.db === "AUDIT" && typeof s.sql === "string"), "every pinned step is a typed sql step");

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. the defect: the OLD definitions file gaps for personas, stubs and retired services (this is what fails before the change)
// ---------------------------------------------------------------------------------------------------------------------------------------
const BP_STALE = BP26.map((c) => "project-stale-deploy " + c);
const BP_NEVER = BP26.map((c) => "project-never-deployed " + c);
const OLD_EXPECTED = [
  ...BP_STALE, ...BP_NEVER,
  "project-never-deployed W.member-svc", "project-never-deployed W.never-worker", "project-never-deployed W.no-owner", "project-never-deployed W.retired-worker",
  "project-no-upgrade-tracked W.qnfo-workers",
  "project-stale-deploy W.member-svc", "project-stale-deploy W.never-worker", "project-stale-deploy W.old-worker", "project-stale-deploy W.retired-worker", "project-stale-deploy W.voice-stt",
];
const NEW_EXPECTED = [
  "project-never-deployed W.member-svc", "project-never-deployed W.never-worker", "project-never-deployed W.no-owner",
  "project-stale-deploy W.member-svc", "project-stale-deploy W.never-worker", "project-stale-deploy W.old-worker",
];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
{
  const db = world(newDb());
  tick(db);
  const got = openGaps(db);
  ok(same(got, OLD_EXPECTED), "OLD: the detectors file gaps for 5 BP26 personas x2 kinds, a stub whose only deploy is 40 days old, the stub's no-upgrade-tracked row and a retired service", got);
  ok(one(db, CLOSING_PROBE).observed === "10", "OLD: the spec's closing probe reads 10", one(db, CLOSING_PROBE));
  // negative control: the post-change expectation does not hold on the old text, so this suite fails on the pre-change definitions
  ok(!same(got, NEW_EXPECTED), "OLD: the post-change expectation does not hold on the old definitions");
  // the belief probe is the regression guard for the definitions: it reads 0 on the old text
  const m = /VALUES \('belief-portfolio-gap-deployable-owner', NULL,\s*\n\s*'((?:[^']|'')*)'/.exec(sql);
  ok(m !== null, "the belief probe is readable from the migration");
  if (m) ok(one(db, m[1].replace(/''/g, "'")).observed === "0", "OLD: the belief probe reads 0");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. the detectors after the change, on a fresh database (an existing row cannot hide a gap)
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const db = world(newDb());
  const viewBefore = one(db, "SELECT sql FROM sqlite_master WHERE name = 'v_portfolio_deploy_drift'").sql;
  db.exec(sql);
  tick(db);
  const got = openGaps(db);
  ok(same(got, NEW_EXPECTED), "NEW: only deployable owners (and the owner-less project) file gaps", got);
  ok(!got.some((g) => /BP26\.|voice-stt|qnfo-workers|retired-worker|qnfo-agents|qnfo-ops/.test(g)), "NEW: no persona, stub, retired or freshly deployed project files a gap");
  ok(got.includes("project-stale-deploy W.old-worker"), "NEW: a live worker with no deploy in 40 days still files project-stale-deploy");
  ok(got.includes("project-stale-deploy W.never-worker") && got.includes("project-never-deployed W.never-worker"), "NEW: a live worker with no deploy at all still files both kinds");
  ok(got.includes("project-stale-deploy W.member-svc"), "NEW: a 'member' service counts as deployable");
  ok(got.includes("project-never-deployed W.no-owner"), "NEW: a project with no owner_service still shows as never-deployed (unchanged)");
  ok(one(db, CLOSING_PROBE).observed === "0", "NEW: the spec's closing probe reads 0 after a tick");
  ok(one(db, FM_PROBE).observed === "0", "NEW: the failure-mode detector reads 0 after a tick");
  ok(one(db, "SELECT sql FROM sqlite_master WHERE name = 'v_portfolio_deploy_drift'").sql === viewBefore, "the live drift view is not touched");
  const deployable = () => all(db, "SELECT service FROM v_portfolio_deployable_owner ORDER BY service").map((r) => r.service).join(",");
  ok(deployable() === "member-svc,never-worker,old-worker,qnfo-agents,qnfo-ops", "v_portfolio_deployable_owner: live worker and member services minus the stub list", deployable());

  // the stub list is data
  db.exec("UPDATE ops_config SET value = 'voice-stt' WHERE key = 'portfolio_gap_stub_services'");
  ok(deployable().split(",").includes("qnfo-workers") && !deployable().split(",").includes("voice-stt"), "removing a name from ops_config puts that service back under judgement");
  db.exec("UPDATE ops_config SET value = 'voice-stt, qnfo-workers , old-worker' WHERE key = 'portfolio_gap_stub_services'");
  ok(!deployable().split(",").some((s) => ["old-worker", "qnfo-workers", "voice-stt"].includes(s)), "the list tolerates spaces and takes a third name");
  db.exec("DELETE FROM ops_config WHERE key = 'portfolio_gap_stub_services'");
  ok(["voice-stt", "qnfo-workers"].every((s) => deployable().split(",").includes(s)), "without the row every live worker is judged again");

  // the replace changes only the fragments
  const lcNew = defOf(db, "portfolio-lifecycle");
  const syncNew = defOf(db, "portfolio-deploy-sync");
  ok(JSON.parse(lcNew) && JSON.parse(syncNew), "both new definitions are valid JSON");
  ok(lcNew !== LIFECYCLE && lcNew.replace("AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner) AND COALESCE(", "AND COALESCE(") === LIFECYCLE, "lifecycle: only the stale-deploy fragment changed");
  ok(syncNew !== SYNC && syncNew.replace("v_portfolio_deploy_drift_deployable\"", "v_portfolio_deploy_drift\"").replace("v_portfolio_deploy_drift_deployable v WHERE", "v_portfolio_deploy_drift v WHERE") === SYNC, "sync: only the two view reads changed");
  const stale = (s) => s.sql.includes("SELECT 'project-stale-deploy', p.project_code");
  const keep = (def) => JSON.stringify(stepsOf(def).filter((s) => !stale(s)).map((s) => s.sql));
  ok(keep(lcNew) === keep(LIFECYCLE) && keep(lcNew).includes("deploy-unrecorded"), "lifecycle: the other steps, deploy-unrecorded included, are byte-identical");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3. the migration on the legacy state: definitions, canonical copies, gaps, issues, registries
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const db = legacy();
  ok(defOf(db, "portfolio-lifecycle") === LIFECYCLE && defOf(db, "portfolio-deploy-sync") === SYNC, "the legacy fixture carries the pinned live texts");
  ok(one(db, CLOSING_PROBE).observed === "10", "legacy: the closing probe reads 10");
  ok(one(db, "SELECT COUNT(*) AS n FROM portfolio_gaps WHERE entity = 'W.voice-stt' AND status = 'open'").n === 7 && one(db, "SELECT COUNT(*) AS n FROM portfolio_gaps WHERE entity = 'W.qnfo-workers' AND kind = 'project-stale-deploy'").n === 2, "legacy: seven daily voice-stt rows and two qnfo-workers rows, as live");
  ok([...CLOSES, ...SKIPPED].every((id) => issue(db, id).status === "open"), "legacy: the eight issues are open");
  let threw = null;
  try { db.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 5000001"); } catch (e) { threw = String(e.message); }
  ok(threw && /close-without-evidence/.test(threw), "the live close guard is in the fixture: a bare close is refused", threw);

  let err = null;
  try { db.exec(sql); } catch (e) { err = e; }
  ok(err === null, "the migration applies without error (no close guard fires)", err && err.message);

  // tasks and canonical copies
  ok(verOf(db, "portfolio-lifecycle") === 4 && verOf(db, "portfolio-deploy-sync") === 2, "fleet_tasks versions +1 (lifecycle 3 -> 4, sync 1 -> 2)", [verOf(db, "portfolio-lifecycle"), verOf(db, "portfolio-deploy-sync")]);
  for (const id of ["portfolio-lifecycle", "portfolio-deploy-sync"]) {
    ok(defOf(db, id) === canon(db, id), id + ": fleet_tasks_canonical equals the live definition (the drift gate stays quiet)");
    ok(one(db, "SELECT json_valid(definition) AS v FROM fleet_tasks WHERE id = ?", id).v === 1, id + ": json_valid");
    ok(one(db, "SELECT repo_path FROM fleet_tasks_canonical WHERE id = ?", id).repo_path === "migrations/2026-10-26-portfolio-gap-detectors.sql", id + ": canonical repo_path names the migration");
  }
  ok(defOf(db, "portfolio-lifecycle").includes("v_portfolio_deployable_owner") && defOf(db, "portfolio-deploy-sync").includes("v_portfolio_deploy_drift_deployable"), "both definitions carry the filter");
  ok(count(defOf(db, "portfolio-deploy-sync"), "v_portfolio_deploy_drift_deployable") === 2 && count(defOf(db, "portfolio-deploy-sync"), "deployable_deployable") === 0, "the sync task reads the narrowed view in both steps, once each");

  // the closing probe and the failure-mode detector
  ok(one(db, CLOSING_PROBE).observed === "0", "the spec's closing probe reads 0 after the migration", one(db, CLOSING_PROBE));
  const fm = one(db, "SELECT verify_probe, verify_transport, status, expected_cadence_h FROM remediation_contracts WHERE class = 'fm-portfolio-gap-owner-not-deployable'");
  ok(fm && fm.verify_probe === FM_PROBE && fm.verify_transport === "d1-query" && fm.status === "active" && fm.expected_cadence_h <= 2, "the fm detector contract is an active hourly d1-query", fm);
  ok(fm && one(db, fm.verify_probe).observed === "0" && one(db, fm.verify_probe).expected === "0", "the fm detector reads 0 after the migration");
  const belief = one(db, "SELECT verify_probe, status FROM remediation_contracts WHERE class = 'belief-portfolio-gap-deployable-owner'");
  ok(belief && belief.status === "active" && one(db, belief.verify_probe).observed === "1", "the belief probe reads 1 after the migration");
  ok(!/;|insert |update |delete |drop /i.test(fm.verify_probe + belief.verify_probe), "the probes are read-only text (no write keyword, no semicolon)");

  // gaps
  const left = all(db, "SELECT kind, entity FROM portfolio_gaps WHERE status = 'open' AND kind IN ('project-stale-deploy', 'project-never-deployed') ORDER BY kind, entity").map((r) => r.kind + " " + r.entity);
  ok(same(left, ["project-never-deployed W.member-svc", "project-never-deployed W.never-worker", "project-never-deployed W.no-owner", "project-stale-deploy W.member-svc", "project-stale-deploy W.never-worker", "project-stale-deploy W.old-worker"]), "the open gaps left are exactly the live workers' and the owner-less project's", left);
  const resolved = all(db, "SELECT kind, entity, detail, resolved_at FROM portfolio_gaps WHERE status = 'resolved' AND kind IN ('project-stale-deploy', 'project-never-deployed')");
  ok(resolved.length === 10 + 7 + 2 + 2 + 1, "resolved rows: 10 BP26, 7 voice-stt, 2 qnfo-workers, 2 retired-worker, 1 qnfo-agents", resolved.length);
  ok(resolved.every((r) => r.resolved_at && /PORTFOLIO-GAP-DETECTORS-1 \d{4}-\d{2}-\d{2}: resolved/.test(r.detail)), "every resolved row carries a resolved_at and a dated note");
  ok(resolved.filter((r) => /BP26\./.test(r.entity)).every((r) => r.detail.includes("program-manager:")), "a BP26 row's note names its program-manager owner");
  ok(resolved.filter((r) => r.entity === "W.voice-stt").every((r) => r.detail.includes("owner_service voice-stt is not a deployable worker")), "a voice-stt row's note names the stub owner");
  ok(resolved.find((r) => r.entity === "W.qnfo-agents").detail.includes("the owner deployed inside the 30-day window"), "the qnfo-agents row is resolved because the owner deployed");
  ok(one(db, "SELECT status FROM portfolio_gaps WHERE kind = 'project-no-upgrade-tracked' AND entity = 'W.qnfo-workers'").status === "open", "other kinds are left to the sync tick (still open right after the migration)");

  // issues
  for (const id of CLOSES) {
    const i = issue(db, id);
    ok(i.status === "closed" && i.close_channel === "auto:portfolio-gap-detectors" && i.triage_state === "closed" && i.close_evidence.startsWith("PORTFOLIO-GAP-DETECTORS-1 "), "issue " + id + " closed with evidence through its channel", i);
    const lc = one(db, "SELECT event, has_evidence FROM issue_lifecycle WHERE issue_id = ? ORDER BY id DESC LIMIT 1", id);
    ok(lc && lc.event === "dispositioned" && lc.has_evidence === 1, "issue " + id + ": the lifecycle row records the close with evidence", lc);
    ok(all(db, "SELECT status, last_verdict FROM remediation_contracts WHERE issue_id = ?", id).every((c) => c.status === "superseded"), "issue " + id + ": its contracts are settled as superseded");
  }
  const ev = (id) => issue(db, id).close_evidence;
  for (const [entity, id] of [["BP26.AGENTOPS", 1000376], ["BP26.COMPLIANCE", 1000377], ["BP26.EDITORIAL", 1000378], ["BP26.ENGINEERING", 1000379], ["BP26.REACH", 1000380]]) {
    const owner = PROJECTS.find((p) => p[0] === entity)[2];
    ok(ev(id).includes("project-stale-deploy " + entity + " is a false positive") && ev(id).includes("'" + owner + "'") && ev(id).includes("a program-manager persona: service_registry holds 0 rows for it") && ev(id).includes("v_portfolio_deployable_owner"), "issue " + id + ": evidence names the entity, the owner_service and the registry fact", ev(id));
  }
  // 100342 is left to the contract that owns it; its gap rows are still resolved
  for (const id of SKIPPED) ok(issue(db, id).status === "open" && issue(db, id).close_evidence === null && issue(db, id).close_channel === null && issue(db, id).triage_state === "triaged", "issue " + id + " is left open and untouched", issue(db, id));
  // 1000126: linked_session is attribution (its only claim, work_claims 5392, was released as abandoned), so it closes with the stub evidence
  ok(one(db, "SELECT linked_session FROM agent_issues WHERE id = 1000126").linked_session === "b6445c2a-8e78-4ad1-bca0-41d39f3c4f7b", "1000126 keeps its linked_session attribution after the close");
  ok(issue(db, 1000126).status === "closed" && ev(1000126).includes("W.qnfo-workers") && ev(1000126).includes("'qnfo-workers'") && ev(1000126).includes("portfolio_gap_stub_services") && !ev(1000126).includes("session claim"), "1000126 closes with the stub evidence although linked_session is set: its claim was released as abandoned", ev(1000126));
  ok(one(db, "SELECT COUNT(*) AS n FROM work_claims WHERE released_at IS NULL").n === 0, "the ledger holds no live claim, as live (work_claims 5392 is released)");
  ok(JSON.stringify(all(db, "SELECT class, status, last_verdict FROM remediation_contracts WHERE issue_id = 100342 ORDER BY class")) === JSON.stringify([{ class: "issue-100342", status: "active", last_verdict: "rearmed: SWEEP-FLEET-TASKS-C (was superseded:closure-observing-probe-at-birth)" }, { class: "issue-100342-BACKFILL-1", status: "probe-review-refused", last_verdict: "probe-review-refused" }]), "100342 keeps the contract SWEEP-FLEET-TASKS-C re-armed (still active) and its backfill contract");
  ok(all(db, "SELECT status FROM portfolio_gaps WHERE entity IN ('W.voice-stt', 'W.qnfo-workers') AND kind = 'project-stale-deploy'").every((r) => r.status === "resolved"), "the stubs' stale-deploy rows are resolved, and 100342 stays open with its armed contract");
  const lastDeploy = one(db, "SELECT id, version_id, deployed_at FROM deployment_history WHERE resource_name = 'qnfo-agents' AND action = 'deploy' ORDER BY deployed_at DESC, id DESC LIMIT 1");
  ok(ev(1000264).includes("project-stale-deploy W.qnfo-agents is cleared by the detector's own test") && ev(1000264).includes("owner_service 'qnfo-agents'") && ev(1000264).includes("action=deploy row") && ev(1000264).includes("(id " + lastDeploy.id + ", version 0.2.2, deployed_at " + lastDeploy.deployed_at + ", by qnfo-ops:cf_worker_deploy)") && ev(1000264).includes("35 minutes after the project was created"), "issue 1000264: evidence names the deployment_history row that clears the gap", ev(1000264));
  ok(STAYS.every((id) => issue(db, id).status === "open" && issue(db, id).close_evidence === null), "the unrelated stale-deploy issues (a live worker without a recent deploy) stay open and get no evidence", STAYS.map((id) => issue(db, id)));
  ok(all(db, "SELECT class, last_verdict FROM remediation_contracts WHERE issue_id IN (5000001, 5000002)").every((c) => c.last_verdict.startsWith("superseded:closure-observing-probe-at-birth")), "contracts of the open issues are untouched");

  // registries
  ok(one(db, "SELECT value FROM ops_config WHERE key = 'portfolio_gap_stub_services'").value === "voice-stt,qnfo-workers", "ops_config seeds the stub list");
  ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes f JOIN remediation_contracts c ON c.class = f.probe_class WHERE f.fm_key = 'portfolio-gap-owner-not-deployable' AND f.probe_class = 'fm-portfolio-gap-owner-not-deployable' AND f.detector LIKE '%fm-portfolio-gap-owner-not-deployable%'").n === 1, "failure mode row whose probe_class is its fm- detector contract (v_failure_mode_status joins on it)");
  ok(one(db, "SELECT COUNT(*) AS n FROM control_registry WHERE control = 'portfolio_gap_deployable_owner_filter' AND kind = 'filter' AND disposition = 'keep' AND disposition_state = 'applied'").n === 1, "control_registry row for the filter");
  ok(one(db, "SELECT COUNT(*) AS n FROM belief_registry WHERE belief_key = 'portfolio-gap-deployable-owner' AND probe_class = 'belief-portfolio-gap-deployable-owner'").n === 1, "belief_registry row with a belief- probe class");
  ok(one(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'portfolio-gap-deployable-owner'").n === 1, "capability_ledger row");
  const dl = all(db, "SELECT actor, action, capability_gain, predicted_outcome, surfaces_tested FROM decision_log");
  ok(dl.length === 1 && dl[0].action.startsWith("PORTFOLIO-GAP-DETECTORS-1:") && dl[0].capability_gain === "portfolio-gap-deployable-owner" && dl[0].predicted_outcome.length > 20 && dl[0].surfaces_tested.length > 10, "one decision_log row with capability_gain, predicted_outcome and surfaces_tested", dl);
  ok(!/\b(uninstall|disable)\b/i.test(dl[0].action), "the decision names no kill switch");

  // the tick after the migration: the sync resolves the other kinds, nothing new is filed for a persona or a stub
  tick(db);
  ok(same(openGaps(db), ["project-never-deployed W.member-svc", "project-never-deployed W.never-worker", "project-never-deployed W.no-owner", "project-stale-deploy W.member-svc", "project-stale-deploy W.never-worker", "project-stale-deploy W.old-worker"]), "a tick after the migration leaves only live-worker gaps and resolves project-no-upgrade-tracked for the stub", openGaps(db));
  ok(one(db, FM_PROBE).observed === "0", "the fm detector still reads 0 after the tick");

  // a regression fires both probes: a persona's gap row written again
  db.exec("INSERT INTO portfolio_gaps (kind, entity, detail, day) VALUES ('project-stale-deploy', 'BP26.REACH', 'regression', date('now', '+1 days'))");
  ok(one(db, FM_PROBE).observed === "1" && one(db, CLOSING_PROBE).observed === "1", "a new open gap for a persona makes the fm detector and the closing probe read 1");
  db.exec("DELETE FROM portfolio_gaps WHERE detail = 'regression'");

  // a second apply changes nothing
  const s1 = snapshot(db);
  let err2 = null;
  try { db.exec(sql); } catch (e) { err2 = e; }
  ok(err2 === null, "a second apply raises nothing", err2 && err2.message);
  ok(snapshot(db) === s1, "a second apply changes nothing (tasks, canonical, gaps, issues, triage, contracts, registries, decision_log, lifecycle, views)");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 4. the Rollback line restores the definitions, gaps, issues and contracts; decision_log keeps its row
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const db = legacy();
  const pre = {
    tasks: all(db, "SELECT id, definition, version, updated_at FROM fleet_tasks ORDER BY id"),
    canon: all(db, "SELECT id, definition, repo_path, exported_at FROM fleet_tasks_canonical ORDER BY id"),
    gaps: all(db, "SELECT * FROM portfolio_gaps ORDER BY kind, entity, day"),
    issues: all(db, "SELECT id, status, close_channel, updated_at FROM agent_issues ORDER BY id"),
    triage: all(db, "SELECT issue_id, triage_state, close_evidence FROM issue_triage ORDER BY issue_id"),
    contracts: all(db, "SELECT class, status, last_verdict, last_attempt_at FROM remediation_contracts ORDER BY class"),
  };
  db.exec(sql);
  let err = null;
  try { db.exec(rollback); } catch (e) { err = e; }
  ok(err === null, "the Rollback line runs without error", err && err.message);
  const now = {
    tasks: all(db, "SELECT id, definition, version, updated_at FROM fleet_tasks ORDER BY id"),
    canon: all(db, "SELECT id, definition, repo_path, exported_at FROM fleet_tasks_canonical ORDER BY id"),
    gaps: all(db, "SELECT * FROM portfolio_gaps ORDER BY kind, entity, day"),
    issues: all(db, "SELECT id, status, close_channel, updated_at FROM agent_issues ORDER BY id"),
    triage: all(db, "SELECT issue_id, triage_state, close_evidence FROM issue_triage ORDER BY issue_id"),
    contracts: all(db, "SELECT class, status, last_verdict, last_attempt_at FROM remediation_contracts WHERE class LIKE 'issue-%' ORDER BY class"),
  };
  const j = JSON.stringify;
  ok(j(now.tasks) === j(pre.tasks), "Rollback: both task definitions, versions and updated_at are back");
  ok(j(now.canon) === j(pre.canon), "Rollback: both canonical copies are back");
  ok(j(now.gaps) === j(pre.gaps), "Rollback: the gap rows are open again with their old detail");
  ok(j(now.issues) === j(pre.issues), "Rollback: the eight issues are open again with their old status, channel and updated_at");
  ok(j(now.triage) === j(pre.triage), "Rollback: triage state and close_evidence are back");
  ok(j(now.contracts) === j(pre.contracts.filter((c) => c.class.startsWith("issue-"))), "Rollback: the contracts are back", now.contracts);
  ok(all(db, "SELECT name FROM sqlite_master WHERE name IN ('v_portfolio_deployable_owner', 'v_portfolio_deploy_drift_deployable', 'v_portfolio_gap_owner_not_deployable')").length === 0, "Rollback: the three views are dropped");
  ok(one(db, "SELECT COUNT(*) AS n FROM ops_config").n === 0 && one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 0 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'fm-%' OR class LIKE 'belief-%'").n === 0 && one(db, "SELECT COUNT(*) AS n FROM control_registry").n === 0 && one(db, "SELECT COUNT(*) AS n FROM belief_registry").n === 0 && one(db, "SELECT COUNT(*) AS n FROM capability_ledger").n === 0, "Rollback: the seeded rows are gone");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "Rollback: decision_log is append-only, so its row stays");
  ok(!/DELETE FROM decision_log/i.test(rollback), "the Rollback never deletes from decision_log");
  // the old detectors work again, then the migration applies again on top
  tick(db);
  ok(same(openGaps(db).filter((g) => /BP26\./.test(g)), [...BP_STALE, ...BP_NEVER]), "after Rollback the old detectors file the persona gaps again (the defect is back)");
  let err3 = null;
  try { db.exec(sql); } catch (e) { err3 = e; }
  ok(err3 === null && one(db, CLOSING_PROBE).observed === "0", "the migration applies again after a Rollback", err3 && err3.message);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 5. a concurrent edit, a doubled fragment and a text that is not JSON are no-ops; no gap is resolved and no issue is closed while a detector is unfixed
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const staleSql = stepsOf(LIFECYCLE).find((s) => s.sql.includes("SELECT 'project-stale-deploy', p.project_code")).sql;
  const mutate = {
    "lifecycle fragment changed by another session": (db) => db.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'IS NOT NULL AND COALESCE(', 'IS NOT NULL AND  COALESCE(') WHERE id = 'portfolio-lifecycle'").run(),
    "lifecycle fragment doubled": (db) => db.prepare("UPDATE fleet_tasks SET definition = ? WHERE id = 'portfolio-lifecycle'").run(JSON.stringify({ steps: [...stepsOf(LIFECYCLE), { type: "sql", db: "AUDIT", sql: staleSql }] })),
    "lifecycle text is not JSON": (db) => db.prepare("UPDATE fleet_tasks SET definition = ? WHERE id = 'portfolio-lifecycle'").run(LIFECYCLE.slice(0, -7)),
    "sync resolve fragment changed": (db) => db.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'v_portfolio_deploy_drift v WHERE', 'v_portfolio_deploy_drift w WHERE') WHERE id = 'portfolio-deploy-sync'").run(),
  };
  for (const [name, edit] of Object.entries(mutate)) {
    const db = legacy();
    edit(db);
    const lcBefore = defOf(db, "portfolio-lifecycle"), syBefore = defOf(db, "portfolio-deploy-sync");
    const lcV = verOf(db, "portfolio-lifecycle"), syV = verOf(db, "portfolio-deploy-sync");
    const canonBefore = [canon(db, "portfolio-lifecycle"), canon(db, "portfolio-deploy-sync")];
    let err = null;
    try { db.exec(sql); } catch (e) { err = e; }
    ok(err === null, name + ": the migration still applies", err && err.message);
    const touchedLc = name.startsWith("lifecycle");
    const [edited, editedV, editedBefore, other, otherV, otherBefore] = touchedLc ? ["portfolio-lifecycle", lcV, lcBefore, "portfolio-deploy-sync", syV, syBefore] : ["portfolio-deploy-sync", syV, syBefore, "portfolio-lifecycle", lcV, lcBefore];
    ok(defOf(db, edited) === editedBefore && verOf(db, edited) === editedV, name + ": the edited definition and its version are untouched", verOf(db, edited));
    ok(canon(db, edited) === canonBefore[edited === "portfolio-lifecycle" ? 0 : 1], name + ": its canonical copy is not advanced, so the drift gate still sees the other session's edit");
    ok(defOf(db, other) !== otherBefore && verOf(db, other) === otherV + 1 && defOf(db, other) === canon(db, other), name + ": the other definition is still fixed and its canonical copy follows");
    ok(PERSONAS.every((id) => issue(db, id).status === "open" && issue(db, id).close_evidence === null), name + ": no persona or stub issue is closed and no evidence is written while a detector is unfixed");
    ok(one(db, "SELECT COUNT(*) AS n FROM portfolio_gaps WHERE status = 'resolved'").n === 1 && one(db, "SELECT status FROM portfolio_gaps WHERE entity = 'W.qnfo-agents'").status === "resolved" && one(db, CLOSING_PROBE).observed === "10", name + ": no persona or stub gap row is resolved (only the qnfo-agents row, whose own test is false)");
    ok(issue(db, 1000264).status === "closed" && /action=deploy row/.test(issue(db, 1000264).close_evidence), name + ": the qnfo-agents close rests on the deploy rows, not on the filter");
  }
}

{
  // a canonical copy that someone else changed since the backup is left alone, so the drift gate keeps reporting it
  const db = legacy();
  const edited = LIFECYCLE.replace("'deploy-unrecorded'", "'deploy-unrecorded' ");
  db.prepare("UPDATE fleet_tasks_canonical SET definition = ? WHERE id = 'portfolio-lifecycle'").run(edited);
  db.exec(sql);
  ok(canon(db, "portfolio-lifecycle") === edited && defOf(db, "portfolio-lifecycle").includes("v_portfolio_deployable_owner") && canon(db, "portfolio-lifecycle") !== defOf(db, "portfolio-lifecycle"), "a canonical copy edited elsewhere is not overwritten (the drift gate still sees it)");
  ok(canon(db, "portfolio-deploy-sync") === defOf(db, "portfolio-deploy-sync"), "the other canonical copy still follows its task");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 6. edge cases: an active failing contract blocks the close, an issue closed earlier and an issue with no triage row
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const db = legacy();
  db.exec("INSERT INTO projects (project_code, program_code, name, status, owner_service) VALUES ('BP26.FAILING', 'QNFO.OPS', 'BP26.FAILING', 'active', 'program-manager:QNFO.OPS')");
  db.exec("INSERT INTO portfolio_gaps (kind, entity, detail, day, issue_id) VALUES ('project-stale-deploy', 'BP26.FAILING', 'active project whose owner last deployed never', date('now'), 5000003)");
  db.exec("INSERT INTO agent_issues (id, title, source, category, priority, status, created_at, updated_at) VALUES (5000003, 'PORTFOLIO-GAP project-stale-deploy BP26.FAILING', 'portfolio-autopilot', 'portfolio', 'high', 'open', 1, 1)");
  db.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (5000003, 'PORTFOLIO-AUTOPILOT-1', 'triaged', 'qnfo-ops', '2026-10-26 10:00:00')");
  db.exec("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-5000003', 5000003, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 'active', 'fail')");
  // 1000377 was closed by someone else before the apply, 1000378 never had a triage row
  db.exec("UPDATE issue_triage SET close_evidence = 'closed earlier by another path' WHERE issue_id = 1000377");
  db.exec("UPDATE agent_issues SET status = 'closed', close_channel = 'other:earlier' WHERE id = 1000377");
  db.exec("DELETE FROM issue_triage WHERE issue_id = 1000378");
  let err = null;
  try { db.exec(sql); } catch (e) { err = e; }
  ok(err === null, "an active failing contract does not abort the migration (the close is skipped, not refused)", err && err.message);
  const f = issue(db, 5000003);
  ok(f.status === "open" && f.close_evidence === null, "the issue with an active failing contract stays open and gets no evidence", f);
  ok(one(db, "SELECT status FROM portfolio_gaps WHERE entity = 'BP26.FAILING'").status === "resolved", "its gap row is still resolved: the detector no longer produces it");
  ok(issue(db, 1000377).close_evidence === "closed earlier by another path" && issue(db, 1000377).close_channel === "other:earlier", "an issue closed earlier keeps its evidence and channel");
  const n = issue(db, 1000378);
  ok(n.status === "closed" && n.triage_state === "closed" && /^PORTFOLIO-GAP-DETECTORS-1 /.test(n.close_evidence), "an issue with no triage row gets one with the evidence and is closed", n);
  ok(one(db, "SELECT rc FROM issue_triage WHERE issue_id = 1000378").rc === "PORTFOLIO-GAP-DETECTORS-1", "the new triage row names this change as its rc");
}

{
  // the same two stub issues close, with the stub evidence, once nothing else owns them (no live claim, no armed contract; 1000126 keeps its
  // linked_session attribution); a retired owner is told apart from a stub
  const db = legacy();
  db.exec("UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded' WHERE issue_id = 100342");
  db.exec("INSERT INTO agent_issues (id, title, source, category, priority, status, created_at, updated_at) VALUES (5000004, 'PORTFOLIO-GAP project-stale-deploy W.retired-worker', 'portfolio-autopilot', 'portfolio', 'high', 'open', 1, 1)");
  db.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (5000004, 'PORTFOLIO-AUTOPILOT-1', 'triaged', 'qnfo-ops', '2026-10-26 10:00:00')");
  db.exec("UPDATE portfolio_gaps SET issue_id = 5000004 WHERE kind = 'project-stale-deploy' AND entity = 'W.retired-worker'");
  let err = null;
  try { db.exec(sql); } catch (e) { err = e; }
  ok(err === null, "the stub variant applies without error", err && err.message);
  const ev = (id) => issue(db, id).close_evidence;
  ok(issue(db, 100342).status === "closed" && ev(100342).includes("W.voice-stt") && ev(100342).includes("'voice-stt'") && ev(100342).includes("kind worker, state live, version unknown") && ev(100342).includes("ops_config portfolio_gap_stub_services names it as a stub"), "100342 closes with the stub evidence once its contract is no longer armed", ev(100342));
  ok(issue(db, 1000126).status === "closed" && ev(1000126).includes("W.qnfo-workers") && ev(1000126).includes("'qnfo-workers'") && ev(1000126).includes("portfolio_gap_stub_services") && one(db, "SELECT linked_session FROM agent_issues WHERE id = 1000126").linked_session !== null, "1000126 closes with the stub evidence with its linked_session still set", ev(1000126));
  ok(issue(db, 5000004).status === "closed" && ev(5000004).includes("'retired-worker'") && ev(5000004).includes("kind worker, state retired") && ev(5000004).includes("does not accept (kind worker or member, state live)") && !ev(5000004).includes("names it as a stub"), "a retired owner is described as not live, not as a stub", ev(5000004));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 8. the claim ledger decides, linked_session does not (reviewer finding: linked_session is attribution that outlives a release)
// ---------------------------------------------------------------------------------------------------------------------------------------
{
  const TAG = "PORTFOLIO-GAP-DETECTORS-1";
  // claim(): a work_claims row as deploy-guard writes it; ago/ahead are SQLite modifiers relative to now
  const claim = (db, { path, issueId = null, intent = "another session's change", holder = "0aa11bb2-other-session", expires = "+1 hours", released = null, outcome = null }) =>
    db.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, claimed_at, expires_at, released_at, outcome) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?), " + (released ? "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)" : "NULL") + ", ?)")
      .run(...[path, intent, holder, issueId, expires, ...(released ? [released] : []), outcome]);
  const attribute = (db, ids, who = "0aa11bb2-other-session") => { for (const id of ids) db.prepare("UPDATE agent_issues SET linked_session = ? WHERE id = ?").run(who, id); };
  const apply = (db) => { let e = null; try { db.exec(sql); } catch (x) { e = x; } return e; };
  const isClosed = (db, id) => issue(db, id).status === "closed" && issue(db, id).close_channel === "auto:portfolio-gap-detectors" && /^PORTFOLIO-GAP-DETECTORS-1 /.test(issue(db, id).close_evidence);
  const untouched = (db, id) => issue(db, id).status === "open" && issue(db, id).close_evidence === null && issue(db, id).close_channel === null;
  const SIX = [...PERSONAS, 1000264];

  // (1) the reviewer's repro: the work-claim procedure sets linked_session on every target, then the migration applies; the claims are released
  {
    const db = legacy();
    attribute(db, SIX);
    for (const id of SIX) claim(db, { path: "issue:" + id, issueId: id, released: "-1 minutes", outcome: "merged" });
    const e = apply(db);
    ok(e === null, "claim-then-apply: the migration applies", e && e.message);
    ok(SIX.every((id) => isClosed(db, id)), "claim-then-apply (released claims, linked_session set on all six): 1000376-1000380 and 1000264 close", SIX.map((id) => issue(db, id).status));
    ok(isClosed(db, 1000126) && untouched(db, 100342), "claim-then-apply: 1000126 closes (abandoned claim), 100342 stays with its armed contract");
    ok(one(db, CLOSING_PROBE).observed === "0" && one(db, FM_PROBE).observed === "0", "claim-then-apply: the closing probe and the fm detector read 0 and no target issue is left open behind them");
    ok(SIX.every((id) => one(db, "SELECT linked_session FROM agent_issues WHERE id = ?", id).linked_session === "0aa11bb2-other-session"), "claim-then-apply: linked_session is left as it was");
  }
  // (2) the pushing session still holds its claim (live, unreleased) and the intent carries the tag: its own claim never blocks its closes
  {
    const db = legacy();
    attribute(db, SIX, "9f8e7d6c-pusher");
    for (const id of SIX) claim(db, { path: "issue:" + id, issueId: id, holder: "9f8e7d6c-pusher", intent: TAG + ": close the false positive gap issues" });
    claim(db, { path: "file:migrations/2026-10-26-portfolio-gap-detectors.sql", holder: "9f8e7d6c-pusher", intent: TAG + ": the migration file" });
    const e = apply(db);
    ok(e === null && SIX.every((id) => isClosed(db, id)) && isClosed(db, 1000126), "a live claim whose intent carries the change tag does not block the closes", e ? e.message : SIX.map((id) => issue(db, id).status));
    ok(one(db, "SELECT COUNT(*) AS n FROM work_claims WHERE released_at IS NULL").n === 7, "the pusher's live claims are not touched (the migration never writes the ledger)");
  }
  // (3) a live claim by another holder skips exactly that issue: evidence is not written, the gap row is still resolved, the rest close
  {
    const db = legacy();
    attribute(db, [1000377, 1000126]);
    claim(db, { path: "issue:1000377", issueId: 1000377, intent: "Fix the BP26 projects by hand" });
    // 1000126: a live claim taken on the issue through a file path (issue_id column set), the way the ledger links a file claim to its issue
    claim(db, { path: "file:scripts/portfolio_autopilot.py", issueId: 1000126, intent: "Rework the stub handling" });
    // an expired claim that was never released, and a released one: neither blocks
    claim(db, { path: "issue:1000378", issueId: 1000378, expires: "-10 minutes" });
    claim(db, { path: "issue:1000379", issueId: 1000379, released: "-2 minutes", outcome: "closed" });
    // a live claim on an unrelated issue does not block
    claim(db, { path: "issue:5000001", issueId: 5000001 });
    const e = apply(db);
    ok(e === null, "live claim by another holder: the migration applies", e && e.message);
    ok(untouched(db, 1000377) && issue(db, 1000377).triage_state === "triaged", "live claim by another holder (issue: path): the issue stays open and gets no evidence", issue(db, 1000377));
    ok(untouched(db, 1000126) && issue(db, 1000126).triage_state === "triaged", "live claim by another holder (file path with issue_id): the issue stays open and gets no evidence", issue(db, 1000126));
    ok(isClosed(db, 1000378) && isClosed(db, 1000379), "an expired unreleased claim and a released claim do not block");
    ok([1000376, 1000380, 1000264].every((id) => isClosed(db, id)), "issues without a live claim still close");
    ok(untouched(db, 5000001), "the unrelated issue with a live claim is untouched");
    ok(one(db, "SELECT status FROM portfolio_gaps WHERE entity = 'BP26.COMPLIANCE'").status === "resolved" && one(db, "SELECT status FROM portfolio_gaps WHERE entity = 'W.qnfo-workers' AND kind = 'project-stale-deploy' AND day = date('now')").status === "resolved", "the skipped issues' gap rows are still resolved: the detectors no longer produce them");
    ok(all(db, "SELECT status FROM remediation_contracts WHERE issue_id IN (1000377, 1000126)").every((c) => c.status === "superseded"), "a skipped issue's contracts are not changed by this file");
    // the claim lapses: the migration is a one-shot, so the evidence a later apply would write is the same text (a replay closes it)
    db.exec("UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), outcome = 'abandoned' WHERE released_at IS NULL");
    ok(apply(db) === null && isClosed(db, 1000377) && isClosed(db, 1000126), "once the claims lapse a replay closes the two issues with evidence");
  }
  // (4) a claim with a different tag text, or one that merely mentions another change, is another session's claim
  {
    const db = legacy();
    claim(db, { path: "issue:1000376", issueId: 1000376, intent: "PORTFOLIO-GAP-RESOLVED-1 close the stub gaps" });
    ok(apply(db) === null && untouched(db, 1000376), "a live claim for a different change (PORTFOLIO-GAP-RESOLVED-1) still blocks");
  }
  // (5) the old rule is gone: with linked_session set and no claim at all, everything closes
  {
    const db = legacy();
    attribute(db, [...SIX, 1000126]);
    db.exec("DELETE FROM work_claims");
    ok(apply(db) === null && [...SIX, 1000126].every((id) => isClosed(db, id)) && untouched(db, 100342), "linked_session alone, with no ledger row, blocks nothing");
  }
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
