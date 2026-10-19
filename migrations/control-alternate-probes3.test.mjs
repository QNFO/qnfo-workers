// CONTROL-ALT-PROBES-3 offline suite: applies migrations/2026-10-19-control-alternate-probes3.sql on SQLite (node:sqlite) over fixtures of the objects its probes read.
// Proves: the file is re-runnable and its Rollback line restores the pre-state (evidence, probes, red-team rows and the two views, text for text); it writes four read-only
// expected/observed probes (one SELECT, no semicolon, no write keyword, windows in minutes, LIKE patterns under D1's 50 bytes) and never stamps alternate_tested_at; every probe
// returns ok on a world where its alternate is in place and FAILS with a reason on a world where that alternate is broken (one failing world per branch, plus the grace and window
// edges), and fails on an empty world (no probe passes by absence); the three controls whose alternate leaves no D1 trace get no probe, an ALTERNATE-NOT-EXERCISABLE reason and a red-team
// row, and BOTH views read that reason on a row without a probe (the old clause needed an alternate_path starting with "none needed", which these rows do not have) while a marker never
// hides a probed row, a stamped row or an unmarked row; the verdicts are judged by the real chaosJudge sliced from qnfo-fleet-control/worker.js and the drill's stamp is replayed;
// the failure mode control-alternate-reason-unread has its row and an fm- detector that reads 0 after the file, reads 3 on the old views (it would have caught this defect) and ignores a row with a probe.
// Review repair: the bare token is no free exemption (the detector counts a marker with no confirmed blocker_redteam row, and a none-needed row keeps its old standing), each of the three reasons has
// a belief alt-unexercisable-<control> with a belief-<key> contract whose premise probe reads ok while the premise holds and FAILS, with the step to take, on a seeded ai-skip event, a no-fallback ai-warn
// event, a workflow-run table or a model_floor_guard record (the remediation tick is replayed: a failing verification makes the belief falsified and the detector counts it), and the one alternate that
// cannot be observed has a filed doer (MODEL-FLOOR-GUARD-OBSERVABLE-1: a trusted origin, a code-task whose anchor occurs once in the steward, and a closing probe that needs both the record and the probe row).
// Run: node migrations/control-alternate-probes3.test.mjs        (CAP3_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail, CAP3_MIGRATION=<file> tests a mutated copy)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(process.env.CAP3_MIGRATION || join(here, "2026-10-19-control-alternate-probes3.sql"), "utf8");
const first = readFileSync(join(here, "2026-10-19-control-alternate-probes.sql"), "utf8");
const workerSrc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.CAP3_SKIP_MIGRATION === "1";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- the real judge, sliced from the worker (the function the chaos drill uses) ----
const BEGIN = "// ---- CHAOS-DRILL-1:BEGIN", END = "// ---- CHAOS-DRILL-1:END ----";
const a = workerSrc.indexOf(BEGIN), b = workerSrc.indexOf(END);
ok(a > 0 && b > a, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = workerSrc.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});
ok(/control_alternate_probes WHERE enabled = 1/.test(workerSrc), "the deployed chaosDrill reads control_alternate_probes (CONTROL-ALT-PROBES-RUNNER-1 is on main, so these probes are run)");

// ---- static: header, order, vocabulary ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 500 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(/DELETE FROM control_alternate_probes/.test(rollback) && /DELETE FROM blocker_redteam/.test(rollback) && /CREATE VIEW v_path_coverage_gaps/.test(rollback) && /CREATE VIEW v_control_alternate_status/.test(rollback), "the Rollback restores probes, red-team rows and both views");
ok(/DELETE FROM belief_registry WHERE belief_key IN/.test(rollback) && /belief-alt-unexercisable-model_floor_pr_check/.test(rollback) && /UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'MODEL-FLOOR-GUARD-OBSERVABLE-1:%'/.test(rollback), "the Rollback also removes the three beliefs with their contracts and supersedes the filed issue (no silent drop)");
ok(hdr("BACKUP") === "bak_20261019_path_alt_views", "BACKUP names the table the file creates first");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const iBackup = stmts.findIndex((s) => /^CREATE TABLE IF NOT EXISTS bak_20261019_path_alt_views AS SELECT /.test(s));
const iDrop = stmts.findIndex((s) => /^DROP VIEW/.test(s));
ok(iBackup === 0 && iDrop > iBackup, "the backup of the two view definitions is the first statement, before any DROP VIEW", { iBackup, iDrop });
ok(/name IN \('v_path_coverage_gaps', 'v_control_alternate_status'\)/.test(stmts[iBackup]), "the backup copies exactly the two views the file replaces");
ok(stmts.filter((s) => /^DROP /.test(s)).every((s) => /^DROP VIEW IF EXISTS v_(path_coverage_gaps|control_alternate_status)$/.test(s)) && !/\bDELETE\s+FROM\b/i.test(body), "the body drops only those two views and deletes nothing");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/SET\s+alternate_tested_at/i.test(body) && !/SET\s+reviewed_at/i.test(body), "the file never writes alternate_tested_at or reviewed_at (only a passing drill stamps)");
ok(!/\b\d+ ?(hours?|days?|h)\b/i.test(body.replace(/within \d+ h\b/g, "")), "no window, cadence or SLA is stated in hours or days anywhere in the statements (the prediction's 'within N h' is the parsed format)");

// ---- fixture ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const TABLE_DDL = /CREATE TABLE IF NOT EXISTS control_alternate_probes \([\s\S]*?\);/.exec(first)[0];
const doctrine = readFileSync(join(here, "2026-10-08-12-doctrine.sql"), "utf8");
const BELIEF_DDL = /CREATE TABLE IF NOT EXISTS belief_registry \([\s\S]*?\);/.exec(doctrine)[0];
const BELIEF_VIEW = /CREATE VIEW IF NOT EXISTS v_belief_status AS[\s\S]*?FROM belief_registry b;/.exec(doctrine)[0];
ok(BELIEF_DDL && BELIEF_VIEW.includes("falsified"), "the real belief_registry table and v_belief_status view are sliced from the doctrine migration");
const viewOf = (re) => re.exec(first)[0].replace("CREATE VIEW IF NOT EXISTS", "CREATE VIEW");
const OLD_VIEWS = [
  viewOf(/^CREATE VIEW IF NOT EXISTS v_control_alternate_status AS[\s\S]*?;/m),
  viewOf(/^CREATE VIEW IF NOT EXISTS v_control_alternate_untested AS[\s\S]*?;/m),
  viewOf(/^CREATE VIEW v_path_coverage_gaps AS[\s\S]*?;/m),
  viewOf(/^CREATE VIEW v_path_coverage_violations AS[\s\S]*?;/m)
].join("\n");

const OLD_CFOBS_PROBE = "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-trigger-depth-compile' AND status = 'active') THEN 'the fm-trigger-depth-compile detector contract is missing or not active' WHEN COALESCE((SELECT last_verdict FROM remediation_contracts WHERE class = 'fm-trigger-depth-compile'), '') <> 'pass' THEN 'the fm-trigger-depth-compile detector does not read pass' ELSE 'ok' END AS observed";

const schema = (deferredColumn) => `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
${TABLE_DDL}
CREATE TABLE process_contracts (process TEXT PRIMARY KEY, paths_json TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, path TEXT, status TEXT, last_error TEXT, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE github_steward_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, version TEXT, detail TEXT);
${BELIEF_DDL}
${BELIEF_VIEW}
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, holder TEXT, pr INTEGER, outcome TEXT, released_at TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, issue_id INTEGER, event TEXT, to_status TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, verified_at TEXT, pass INTEGER, observed TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT, last_attempt_at TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0${deferredColumn ? ", deferred_since TEXT" : ""});
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, kind TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE improvement_loop_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, state_json TEXT);
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('false-belief-removed', 'confirmed-with-evidence', 'workaround-built')), evidence TEXT NOT NULL, actor TEXT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), text_sig TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE VIEW v_closure_relapses AS SELECT l.issue_id AS issue_id FROM issue_lifecycle l WHERE l.event IN ('dispositioned', 'closed');
CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 0 AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = NEW.class AND c.status = 'holding')
BEGIN UPDATE agent_issues SET status = 'open' WHERE id IN (SELECT issue_id FROM issue_lifecycle WHERE event = 'closed' AND ts > '1970') AND status = 'closed'; END;
${OLD_VIEWS}
`;

const PROBE_CONTROLS = ["code-task-publish-patch-cap", "relapse-reopen-window", "verification-deferral-escalation", "improvement-loop-relapse-trigger-judge"];
const NOT_EX = ["model_floor_pr_check", "research-model-skip-gauge", "research-fallback-price-guard"];
const SEVEN = [...PROBE_CONTROLS, ...NOT_EX];

// [control, critical, disposition, state, alternate_path, tested_at, evidence]
const CONTROLS = [
  ["code-task-publish-patch-cap", 1, "keep", "applied", "a session edits the file in a pull request (no patch cap)", null, "5 of 5 tasks publish_failed"],
  ["relapse-reopen-window", 0, "keep", "applied", "the D1 trigger remediation_reopen_on_relapse_d1 runs the same rule", null, "VERIFICATION-PATH-1"],
  ["verification-deferral-escalation", 0, "keep", "applied", "the standing detector fm-verification-deferral-unaged counts the same contracts", null, "VERIFICATION-PATH-1: new"],
  ["improvement-loop-relapse-trigger-judge", 0, "keep", "applied", "the target-based reading is not removed: fix_target_hold_rate_30d", null, "109 assertions"],
  ["model_floor_pr_check", 0, "keep", "applied", "the post-merge push run and the 2-hourly schedule of the same workflow", null, "PR 2753"],
  ["research-model-skip-gauge", 0, "keep", "applied", "the pause is 20 s and expires by itself", null, "30 rate limits per 10 minutes"],
  ["research-fallback-price-guard", 0, "keep", "applied", "a fallback is taken only when its rate is not above the primary's", null, "13636 vs 31818"],
  // the three rows CONTROL-ALT-PROBES-1 already excused (alternate_path starts with none needed)
  ["research-owner-hold", 1, "remove", "applied", "none needed", null, "19 rows released | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  ["command-drain-key", 0, "remove", "applied", "none needed", null, "removed | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  ["outreach-consent-gate", 0, "keep", "applied", "none needed: protects people outside the fleet", null, "never on a research path | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  // rows that must keep their state
  ["canary-functional", 1, "keep", "applied", "a second canary", "2026-10-12T08:30:00Z", "stamped by hand"],
  ["bare-control", 0, "keep", "applied", "", null, "no alternate declared"],
  ["a-new-control", 0, "keep", "applied", "a second path", null, "registered after this file: no probe and no reason, so it must stay a gap"],
  ["none-needed-unmarked", 0, "keep", "applied", "none needed: a failure only keeps rows longer", null, "no ALTERNATE record here"],
  ["probed-and-drilled", 0, "keep", "applied", "a standby", "2026-10-19T12:00:00Z", "drilled"]
];

function world({ deferredColumn = true, seed = true, apply = !SKIP } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema(deferredColumn));
  if (seed) {
    const ins = db.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES (?, 'loc', 'guard', ?, ?, ?, ?, ?, ?)");
    for (const c of CONTROLS) ins.run(...c);
    db.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('probed-and-drilled', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'test')");
    db.exec("INSERT INTO process_contracts VALUES ('p-ok', '[1,2,3]'), ('p-single', '[1]')");
    // code_tasks: a merged task, an oversize refusal 300 minutes old whose path has a loop-breaker issue, a failure with its reason
    const ct = db.prepare("INSERT INTO code_tasks (id, path, status, last_error, updated_at) VALUES (?, ?, ?, ?, ?)");
    ct.run("t1", "qnfo-fleet-control/worker.js", "merged", null, iso(20));
    ct.run("t2", "qnfo-fleet-dashboard/worker.js", "publish_failed", "publish: patch larger than 200000 chars", iso(300));
    ct.run("t3", "qnfo-fleet-dashboard/worker.js", "publish_failed", "patch touches files other than the task path", iso(30));
    // agent_issues.created_at is epoch milliseconds (live: 1792428739174). The oversize hand-off was filed 300 minutes ago, past the 120 minute grace, and the session merge below is 30 minutes ago, after it.
    const ai = db.prepare("INSERT INTO agent_issues (title, description, status, created_at) VALUES (?, ?, ?, ?)");
    ai.run("LOOP-BREAKER-1: qnfo-fleet-dashboard/worker.js: publish: patch larger than  chars", "loop breaker", "open", Date.now() - 300 * 6e4);
    ai.run("some closed issue", "reopened\nREOPENED 2026-10-19T10:00:00Z (REMEDIATION-REOPEN-2, D1 trigger): contract issue-9 failed 3 times", "open", Date.now() - 600 * 6e4);
    ai.run("VERIFICATION-DEFERRED-7D-1: issue-2346", "escalation", "open", Date.now() - 600 * 6e4);
    db.exec("INSERT INTO work_claims (path, holder, pr, outcome, released_at) VALUES ('file:x.js', 'session_01ABC', 3091, 'merged', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes'))");
    db.exec("INSERT INTO remediation_verifications (class, verified_at, pass, observed) VALUES ('issue-9', datetime('now', '-5 minutes'), 1, 'ok')");
    const rc = db.prepare("INSERT INTO remediation_contracts (class, status, verify_probe, last_attempt_at) VALUES (?, 'active', ?, datetime('now', '-20 minutes'))");
    rc.run("fm-relapse-window-close-anchor", "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM issue_lifecycle WHERE event IN ('dispositioned', 'closed')) AS TEXT) AS observed");
    rc.run("fm-verification-deferral-unaged", "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c WHERE c.deferred_since < datetime('now', '-10110 minutes') AND NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.title LIKE 'VERIFICATION-DEFERRED-7D-1: %')) AS TEXT) AS observed");
    db.exec("INSERT INTO metric_registry VALUES ('fix_target_hold_rate_30d', 'guard', '0.4516', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'))");
    db.exec("INSERT INTO improvement_loop_runs (ts, state_json) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'), '{\"fix_hold_rate_30d\":0.66,\"fix_target_hold_rate_30d\":0.4516,\"target_misses\":13}')");
    // the live world of 2026-10-19: provider rate limits logged as transient ai-warn rows and kimi timeouts that took the cheaper fallback, no ai-skip event and no wait-path event.
    // An ai-error row that merely quotes the wait text is not the wait path, and a steward row that quotes the workflow in a failure notification (3 live rows do) is not a run record.
    const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, 'qnfo-research-exec', 'info')");
    ev.run("e1", "ai-warn", "aiText model=@cf/zai-org/glm-5.3-flash transient (3021: rate limit), backing off 600ms (attempt 1/3)");
    ev.run("e2", "ai-warn", "aiText model=@cf/moonshotai/kimi-k2.6 exhausted (3046: timeout), fallback @cf/zai-org/glm-5.3-flash");
    ev.run("e3", "ai-error", "aiText model=x quoted: no fallback at or under its price");
    ev.run("e4", "deploy", "qnfo-github-steward model-floor-guard 0.7.0");
    db.exec("INSERT INTO github_steward_runs (started_at, version, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'), '0.7.0', '{\"main_rules\":{\"status\":200},\"notifications\":{\"kept\":[{\"title\":\"model-floor-guard workflow run failed for main branch\"}]}}')");
  }
  if (apply) db.exec(sql);
  return db;
}

const probeOf = (db, c) => db.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = ?").get(c)?.probe_sql;
const verdict = (db, c) => {
  const p = probeOf(db, c);
  if (!p) return { pass: false, observed: "no probe row" };
  const before = db.prepare("SELECT total_changes() AS n").get().n;
  const rows = db.prepare(p).all();
  const v = chaosJudge(rows);
  v.readOnly = db.prepare("SELECT total_changes() AS n").get().n === before;
  v.cols = rows[0] ? Object.keys(rows[0]).join(",") : "";
  return v;
};
const reasonOf = (db, c) => { const v = verdict(db, c); return v.pass ? "ok" : v.observed; };
const snap = (db) => JSON.stringify({
  p: db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(),
  c: db.prepare("SELECT control, evidence, alternate_tested_at FROM control_registry ORDER BY control").all(),
  r: db.prepare("SELECT target, verdict, claim, attempt, evidence FROM blocker_redteam ORDER BY target").all(),
  d: db.prepare("SELECT actor, action FROM decision_log").all(),
  f: db.prepare("SELECT * FROM failure_modes ORDER BY fm_key").all(),
  k: db.prepare("SELECT class, verify_probe, status, module FROM remediation_contracts WHERE class LIKE 'fm-control-%' ORDER BY class").all(),
  b: db.prepare("SELECT name, sql FROM bak_20261019_path_alt_views ORDER BY name").all(),
  v: db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'view' ORDER BY name").all(),
  bl: db.prepare("SELECT * FROM belief_registry ORDER BY belief_key").all(),
  bk: db.prepare("SELECT class, issue_id, verify_probe, verify_transport, status, module, next_due_at, last_verdict, attempts FROM remediation_contracts WHERE class LIKE 'belief-%' OR class LIKE 'issue-%' ORDER BY class").all(),
  i: db.prepare("SELECT id, title, description, source, category, priority, status, created_at FROM agent_issues ORDER BY id").all()
});
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const viewSql = (db) => Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'view'").all().map((r) => [r.name, norm(r.sql)]));
const state = (db, c) => db.prepare("SELECT drill_state FROM v_control_alternate_status WHERE control = ?").get(c)?.drill_state;
const path = (db, c) => db.prepare("SELECT path_state FROM v_path_coverage_gaps WHERE process = ?").get(c)?.path_state;
const counts = (db) => db.prepare("SELECT * FROM v_control_alternate_untested").get();
const violations = (db) => db.prepare("SELECT path_state, COUNT(*) AS n FROM v_path_coverage_violations GROUP BY path_state ORDER BY path_state").all();

// ---- 0. the defect, on the state before the file ----
{
  const db = world({ apply: false });
  ok(counts(db).controls_untested_without_probe === 9 && SEVEN.every((c) => state(db, c) === "no-probe"), "before: the seven controls read no-probe and the detector figure is 9 (the seven, a-new-control and none-needed-unmarked)", counts(db));
  ok(NOT_EX.every((c) => path(db, c) === "alternate-untested"), "before: a recorded ALTERNATE-NOT-EXERCISABLE reason would not clear them (their alternate_path does not start with none needed)");
  ok(["research-owner-hold", "command-drain-key", "outreach-consent-gate"].every((c) => path(db, c) === "alternate-not-exercisable"), "before: the three none-needed rows read alternate-not-exercisable");
  ok(db.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n === 1, "before: only the fixture's own control has a probe row");
}

// ---- 1. apply, twice ----
const pre = world({ apply: false });
const preViews = viewSql(pre);
const db = world();
const s1 = SKIP ? "" : snap(db);
if (!SKIP) { db.exec(sql); ok(snap(db) === s1, "a second apply changes nothing (probes, evidence, red-team rows, backup, views, decision row)"); }
const probes = db.prepare("SELECT * FROM control_alternate_probes WHERE control <> 'probed-and-drilled' ORDER BY control").all();
ok(JSON.stringify(probes.map((p) => p.control)) === JSON.stringify([...PROBE_CONTROLS].sort()), "four probes are seeded, for the four controls whose alternate leaves a D1 trace", probes.map((p) => p.control));
ok(probes.length === 4 && probes.every((p) => p.enabled === 1 && p.last_run_at === null && p.last_pass === null && p.last_pass_at === null), "every probe is enabled and none is marked as run or passed by the file");
ok(NOT_EX.every((c) => probeOf(db, c) === undefined), "the three controls whose alternate leaves no trace get no probe (a probe that passes by absence would stamp a declaration)");
const WRITE_KW = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(table|view|index|trigger)|alter\s+table|create\s+(table|view|index|trigger)|attach|detach|replace\s+into|vacuum)\b|pragma\s/i;
ok(probes.every((p) => /^SELECT 'ok' AS expected, /.test(p.probe_sql) && / AS observed$/.test(p.probe_sql) && !p.probe_sql.includes(";") && !WRITE_KW.test(p.probe_sql)), "each probe is one read-only expected/observed SELECT", probes.filter((p) => !/^SELECT 'ok'/.test(p.probe_sql)).map((p) => p.control));
// the remediation tick refuses a d1-query probe with these words anywhere, string literals included (CLAUDE.md, write-keyword guard): keep the probes clean of them so they could be reused as contract probes
const TICK_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
ok(probes.every((p) => { const l = " " + p.probe_sql.toLowerCase().replace(/\s+/g, " ") + " "; return !TICK_KW.some((k) => l.includes(k)); }), "no probe text contains a write keyword the remediation tick's literal check would refuse", probes.map((p) => TICK_KW.filter((k) => (" " + p.probe_sql.toLowerCase() + " ").includes(k))));
ok(probes.every((p) => /\b\d+ minutes\b/.test(p.window_note) && !/\b\d+ ?(hours?|days?)\b/i.test(p.window_note) && p.window_note.length > 40), "each window note states its window in minutes");
ok(probes.every((p) => !/'-\d+ (hours?|days?)'/.test(p.probe_sql) && (p.probe_sql.match(/'-(\d+) minutes'/g) || []).length > 0), "each probe's windows are written in minutes");
const likeLits = (s) => [...s.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => m[1]);
ok(probes.every((p) => likeLits(p.probe_sql).every((l) => Buffer.byteLength(l) <= 50)) && likeLits(body).every((l) => Buffer.byteLength(l) <= 50), "every LIKE or GLOB pattern is within D1's 50 bytes");
for (const p of probes) { const v = verdict(db, p.control); ok(v.readOnly === true && v.cols === "expected,observed", "probe is read-only and returns exactly expected,observed: " + p.control, v); }
ok(db.prepare("SELECT COUNT(*) AS n FROM control_registry WHERE alternate_tested_at IS NOT NULL").get().n === 2 && SEVEN.every((c) => db.prepare("SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?").get(c).t === null), "the file stamps nothing: the seven controls still have no tested date");

// ---- 2. evidence, red-team rows, decision, backup ----
const ev = (c) => db.prepare("SELECT evidence FROM control_registry WHERE control = ?").get(c)?.evidence || "";
ok(PROBE_CONTROLS.every((c) => (ev(c).match(/CONTROL-ALT-PROBES-3 2026-10-19: probed by its control_alternate_probes row/g) || []).length === 1), "the probe note is added once to each of the four");
ok(NOT_EX.every((c) => (ev(c).match(/ALTERNATE-NOT-EXERCISABLE:/g) || []).length === 1 && /alternate_tested_at stays NULL on purpose/.test(ev(c)) && ev(c).length > 600), "the reason is added once to each of the three, with the measured read and the NULL-on-purpose line");
ok(NOT_EX.every((c) => !/CONTROL-ALT-PROBES-3 2026-10-19: probed/.test(ev(c))) && PROBE_CONTROLS.every((c) => !/ALTERNATE-NOT-EXERCISABLE/i.test(ev(c))), "a probed control carries no reason and an unprobed one no probe note");
ok(["canary-functional", "a-new-control", "bare-control", "none-needed-unmarked"].every((c) => !/CONTROL-ALT-PROBES-3/.test(ev(c))), "no other control's evidence is touched");
ok(NOT_EX.every((c) => /^model_floor_pr_check$/.test(c) ? /workflow/.test(ev(c)) && /github_steward_runs/.test(ev(c)) : /ai-skip|ai-warn/.test(ev(c)) && /width-governor\.test\.mjs/.test(ev(c))), "each reason names what was read and, for the research controls, the offline suite that pins the logic");
const rt = db.prepare("SELECT * FROM blocker_redteam ORDER BY target").all();
ok(rt.length === 3 && JSON.stringify(rt.map((r) => r.target)) === JSON.stringify(NOT_EX.map((c) => "control:" + c).sort()), "one blocker_redteam row per reason, target control:<name>", rt.map((r) => r.target));
ok(rt.every((r) => r.verdict === "confirmed-with-evidence" && /SELECT only/.test(r.attempt) && r.evidence.length > 150 && /^ALTERNATE-NOT-EXERCISABLE/.test(r.claim) && /^session_/.test(r.actor)), "each red-team row records the attempt (reads) and the evidence, verdict confirmed-with-evidence");
// doctrine revision 3: each red-team carries a surfaces: line, and the guard metric blocker_surface_coverage_7d (v_doctrine_rev3_blockers) counts exactly this predicate. Live 2026-10-19: 29 of 41 rows
// have it (0.7073), so a row without it would pull the ratio to 29/44 (0.6591) - the regression INTEGRITY-GUARDS-1 forbids.
ok(rt.every((r) => /surfaces:/i.test(r.evidence)) && db.prepare("SELECT COUNT(*) AS n FROM blocker_redteam WHERE lower(evidence) LIKE '%surfaces:%'").get().n === rt.length, "every red-team row's evidence carries a surfaces: line (the exact predicate of v_doctrine_rev3_blockers)", rt.filter((r) => !/surfaces:/i.test(r.evidence)).map((r) => r.target));
ok(rt.every((r) => { const s = /surfaces:([^]*)$/i.exec(r.evidence); return s && s[1].trim().length > 60 && s[1].includes(",") && /cloud_ops_events/.test(s[1]); }), "each surfaces: line is the last thing in the evidence, names several surfaces and the cloud_ops_events read, not a bare marker", rt.map((r) => (/surfaces:([^]*)$/i.exec(r.evidence) || [])[1]));
ok(rt.filter((r) => /model_floor/.test(r.target)).every((r) => /model-floor-guard\.yml/.test(r.evidence) && /model-floor-guard\.test\.mjs/.test(r.evidence)) && rt.filter((r) => !/model_floor/.test(r.target)).every((r) => /width-governor\.test\.mjs/.test(r.evidence.split(/surfaces:/i)[1] || "")), "the surfaces line names the workflow and its offline suite for the workflow control, and width-governor.test.mjs for the two research controls");
const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].action.startsWith("CONTROL-ALT-PROBES-3:") && dl[0].capability_gain && /^[a-z_0-9]+ (<|<=|>|>=|=) \d+ within \d+ h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction decision_predictions_parse reads", dl[0] && dl[0].predicted_outcome);
let bak = [];
try { bak = db.prepare("SELECT name, sql FROM bak_20261019_path_alt_views ORDER BY name").all(); } catch (e) { bak = []; }
ok(bak.length === 2 && JSON.stringify(bak.map((r) => r.name)) === JSON.stringify(["v_control_alternate_status", "v_path_coverage_gaps"]) && bak.every((r) => norm(r.sql) === preViews[r.name]), "the backup holds the pre-change SQL of the two views, text for text", bak.map((r) => r.name));

// ---- 3. the views ----
{
  const c = counts(db);
  ok(SEVEN.filter((x) => !NOT_EX.includes(x)).every((x) => state(db, x) === "probe-never-run"), "status: the four probed controls read probe-never-run until the drill runs them");
  ok(NOT_EX.every((x) => state(db, x) === "not-exercisable"), "status: the three recorded reasons read not-exercisable though their alternate_path does not start with none needed");
  ok(c.controls_untested_without_probe === 2 && c.probes_total === 5, "untested view: controls_untested_without_probe falls from 9 to 2 (a-new-control and none-needed-unmarked, which have neither a probe nor a reason)", c);
  ok(state(db, "a-new-control") === "no-probe" && state(db, "none-needed-unmarked") === "no-probe" && path(db, "a-new-control") === "alternate-untested" && path(db, "none-needed-unmarked") === "alternate-untested", "no blanket exemption: a row without probe and without the reason stays a gap, 'none needed' text alone excuses nothing");
  ok(NOT_EX.every((x) => path(db, x) === "alternate-not-exercisable") && ["research-owner-hold", "command-drain-key", "outreach-consent-gate"].every((x) => path(db, x) === "alternate-not-exercisable"), "gaps: the three new rows and the three old ones read alternate-not-exercisable");
  ok(PROBE_CONTROLS.every((x) => path(db, x) === "alternate-untested"), "gaps: the four probed controls stay alternate-untested until the drill stamps them (not excused)");
  ok(path(db, "canary-functional") === "ok" && path(db, "bare-control") === "no-alternate" && path(db, "p-ok") === "ok" && path(db, "p-single") === "single-path", "gaps: tested, empty-alternate and process_contracts rows are unchanged");
  const viol = violations(db);
  ok(!viol.some((r) => r.path_state === "alternate-not-exercisable"), "violations: no alternate-not-exercisable row is listed", viol);
  ok(db.prepare("SELECT COUNT(*) AS n FROM v_path_coverage_violations WHERE path_state = 'alternate-untested'").get().n === 6, "violations: alternate-untested is the four probed controls plus a-new-control and none-needed-unmarked", viol);
  // the readers of the two views keep their columns
  ok(JSON.stringify(db.prepare("PRAGMA table_info(v_path_coverage_gaps)").all().map((r) => r.name)) === JSON.stringify(["source", "process", "path_kind", "path_state", "alternate", "alternate_tested_at"]), "gaps: the view keeps its six columns");
  ok(JSON.stringify(db.prepare("PRAGMA table_info(v_control_alternate_status)").all().map((r) => r.name)) === JSON.stringify(["control", "critical_path", "disposition", "disposition_state", "alternate_path", "alternate_tested_at", "probe_enabled", "last_run_at", "last_pass", "last_pass_at", "last_observed", "window_note", "drill_state"]), "status: the view keeps its thirteen columns");
  const keep = ["v_control_alternate_untested", "v_path_coverage_violations"];
  ok(keep.every((k) => viewSql(db)[k] === preViews[k]), "the two views that read them are not touched");
}
// a marker never hides a probed row, a stamped row or a row on a different state
{
  const w = world();
  w.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('model_floor_pr_check', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'a probe added later')");
  ok(path(w, "model_floor_pr_check") === "alternate-untested" && state(w, "model_floor_pr_check") === "probe-never-run", "a reason row that later gains a probe is judged by the probe again (gaps alternate-untested, status probe-never-run)");
  w.exec("UPDATE control_registry SET alternate_tested_at = '2026-10-19T19:00:00Z' WHERE control = 'model_floor_pr_check'");
  ok(path(w, "model_floor_pr_check") === "ok", "and a pass (the drill's stamp) turns it ok");
  w.exec("UPDATE control_registry SET alternate_tested_at = '2026-10-19T19:00:00Z' WHERE control = 'research-model-skip-gauge'");
  ok(path(w, "research-model-skip-gauge") === "ok", "a stamped reason row reads ok (the stamp wins)");
  w.exec("UPDATE control_registry SET alternate_path = '' WHERE control = 'research-fallback-price-guard'");
  ok(path(w, "research-fallback-price-guard") === "no-alternate" && state(w, "research-fallback-price-guard") === "no-alternate", "no alternate declared still reads no-alternate whatever the evidence says");
  w.exec("UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied' WHERE control = 'research-model-skip-gauge'");
  ok(state(w, "research-model-skip-gauge") === "removed", "a removed control still reads removed");
}

// ---- 4. the drill, replayed: probes judged by chaosJudge, a pass stamps ----
{
  const w = world();
  const probesNow = w.prepare("SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1 AND control IN (" + PROBE_CONTROLS.map((c) => "'" + c + "'").join(",") + ")").all();
  const stamp = w.prepare("UPDATE control_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE control = ?2");
  const mark = w.prepare("UPDATE control_alternate_probes SET last_run_at = ?1, last_pass = ?2, last_pass_at = CASE WHEN ?2 = 1 THEN ?1 ELSE last_pass_at END WHERE control = ?3");
  const now = new Date().toISOString();
  let passed = 0;
  for (const p of probesNow) { const v = chaosJudge(w.prepare(p.probe_sql).all()); mark.run(now, v.pass ? 1 : 0, p.control); if (v.pass) { stamp.run(now, p.control); passed++; } }
  ok(passed === 4, "the drill passes all four probes on the healthy world", passed);
  ok(PROBE_CONTROLS.every((c) => state(w, c) === "drilled" && path(w, c) === "ok"), "after the stamp the four read drilled / ok");
  ok(counts(w).critical_untested_by_register === 0 && counts(w).critical_untested_by_probe === 0 + counts(w).critical_without_probe, "the critical control code-task-publish-patch-cap leaves critical_untested_by_register (1 to 0)", counts(w));
  ok(w.prepare("SELECT COUNT(*) AS n FROM v_path_coverage_violations WHERE path_state = 'alternate-untested' AND process IN (" + SEVEN.map((c) => "'" + c + "'").join(",") + ")").get().n === 0, "none of the seven is left in v_path_coverage_violations as alternate-untested");
  // and the probes do not stamp a broken alternate
  const w2 = world();
  w2.exec("DELETE FROM agent_issues WHERE title LIKE 'LOOP-BREAKER-1:%'");
  ok(!verdict(w2, "code-task-publish-patch-cap").pass, "a broken alternate is not stamped: the patch-cap probe fails once the loop-breaker hand-off is gone");
}

// ---- 5. each probe passes where the alternate is in place and fails, with its reason, where it is broken ----
{
  const w = world();
  for (const c of PROBE_CONTROLS) ok(reasonOf(w, c) === "ok", "passes where its alternate is in place: " + c, reasonOf(w, c));
}
// [control, mutation, substring of the reason]
const BREAK = [
  ["code-task-publish-patch-cap", "INSERT INTO code_tasks VALUES ('t9', 'a/worker.js', 'publish_failed', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'))", "carries no reason"],
  ["code-task-publish-patch-cap", "INSERT INTO code_tasks VALUES ('t9', 'a/worker.js', 'publish_failed', '   ', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1000 minutes'))", "carries no reason"],
  ["code-task-publish-patch-cap", "DELETE FROM agent_issues WHERE title LIKE 'LOOP-BREAKER-1:%'", "no LOOP-BREAKER-1 issue records an oversize refusal"],
  ["code-task-publish-patch-cap", "UPDATE agent_issues SET title = 'LOOP-BREAKER-1: qnfo-fleet-dashboard/worker.js: some other loop' WHERE title LIKE 'LOOP-BREAKER-1:%'", "no LOOP-BREAKER-1 issue records an oversize refusal"],
  ["code-task-publish-patch-cap", "INSERT INTO code_tasks VALUES ('t7', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-200 minutes')), ('t8', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-190 minutes')), ('t9', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 minutes'))", "three oversize refusals older than 120 minutes has no LOOP-BREAKER-1 issue"],
  ["code-task-publish-patch-cap", "INSERT INTO code_tasks VALUES ('t7', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1400 minutes')), ('t8', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-700 minutes')), ('t9', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1000000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-125 minutes'))", "three oversize refusals older than 120 minutes has no LOOP-BREAKER-1 issue"],
  // the session route is owed a change only while an open oversize hand-off older than 120 minutes has no session merge after it was filed (the fixture's hand-off was filed 300 minutes ago)
  ["code-task-publish-patch-cap", "UPDATE work_claims SET outcome = 'abandoned'", "no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "UPDATE work_claims SET pr = NULL", "no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "UPDATE work_claims SET holder = 'qnfo-code-orchestrator'", "no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1500 minutes')", "no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-400 minutes')", "open for more than 120 minutes and no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "DELETE FROM work_claims", "open for more than 120 minutes and no session pull request has merged since it was filed"],
  ["code-task-publish-patch-cap", "UPDATE agent_issues SET created_at = CAST(strftime('%s', 'now', '-121 minutes') AS INTEGER) * 1000 WHERE title LIKE 'LOOP-BREAKER-1:%'; DELETE FROM work_claims", "open for more than 120 minutes and no session pull request has merged since it was filed"],
  // two open hand-offs: the older one has a merge after it (250 minutes ago), the newer one (200 minutes ago) has none, so the route still owes that one
  ["code-task-publish-patch-cap", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-250 minutes'); INSERT INTO agent_issues (title, description, status, created_at) VALUES ('LOOP-BREAKER-1: qnfo-fleet-control/worker.js: publish: patch larger than  chars', 'second hand-off', 'open', CAST(strftime('%s', 'now', '-200 minutes') AS INTEGER) * 1000)", "open for more than 120 minutes and no session pull request has merged since it was filed"],
  ["relapse-reopen-window", "DROP TRIGGER remediation_reopen_on_relapse_d1", "remediation_reopen_on_relapse_d1 is missing"],
  ["relapse-reopen-window", "DROP TRIGGER remediation_reopen_on_relapse_d1; CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications BEGIN SELECT 1; END", "no longer starts its window at the issue_lifecycle close event"],
  ["relapse-reopen-window", "DROP VIEW v_closure_relapses", "v_closure_relapses is missing"],
  ["relapse-reopen-window", "DROP VIEW v_closure_relapses; CREATE VIEW v_closure_relapses AS SELECT 1 AS issue_id", "v_closure_relapses is missing or no longer reads the close event"],
  ["relapse-reopen-window", "UPDATE remediation_contracts SET status = 'parked' WHERE class = 'fm-relapse-window-close-anchor'", "fm-relapse-window-close-anchor is missing, not active"],
  ["relapse-reopen-window", "UPDATE remediation_contracts SET verify_probe = 'SELECT 1' WHERE class = 'fm-relapse-window-close-anchor'", "fm-relapse-window-close-anchor is missing, not active or no longer reads the close event"],
  ["relapse-reopen-window", "UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-130 minutes') WHERE class = 'fm-relapse-window-close-anchor'", "did not run in 120 minutes"],
  ["relapse-reopen-window", "UPDATE remediation_contracts SET last_attempt_at = NULL WHERE class = 'fm-relapse-window-close-anchor'", "did not run in 120 minutes"],
  ["relapse-reopen-window", "DELETE FROM remediation_verifications", "no feed"],
  ["relapse-reopen-window", "UPDATE remediation_verifications SET verified_at = datetime('now', '-200 minutes')", "no feed"],
  ["relapse-reopen-window", "UPDATE agent_issues SET description = 'plain'", "has never reopened an issue"],
  ["verification-deferral-escalation", "DELETE FROM remediation_contracts WHERE class = 'fm-verification-deferral-unaged'", "fm-verification-deferral-unaged is missing"],
  ["verification-deferral-escalation", "UPDATE remediation_contracts SET status = 'parked' WHERE class = 'fm-verification-deferral-unaged'", "fm-verification-deferral-unaged is missing, not active"],
  ["verification-deferral-escalation", "UPDATE remediation_contracts SET verify_probe = 'SELECT 1 FROM agent_issues' WHERE class = 'fm-verification-deferral-unaged'", "no longer counts deferred_since against the escalation issue"],
  ["verification-deferral-escalation", "UPDATE remediation_contracts SET verify_probe = 'SELECT deferred_since FROM remediation_contracts' WHERE class = 'fm-verification-deferral-unaged'", "no longer counts deferred_since against the escalation issue"],
  ["verification-deferral-escalation", "UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-121 minutes') WHERE class = 'fm-verification-deferral-unaged'", "did not run in 120 minutes"],
  ["verification-deferral-escalation", "DELETE FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1:%'", "no escalation issue VERIFICATION-DEFERRED-7D-1 was ever filed"],
  ["improvement-loop-relapse-trigger-judge", "DELETE FROM metric_registry", "fix_target_hold_rate_30d is missing from metric_registry"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET kind = 'lagging'", "fix_target_hold_rate_30d is missing from metric_registry"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-200 minutes')", "was not refreshed in 120 minutes"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET last_refreshed = NULL", "was not refreshed in 120 minutes"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET last_value = 'n/a'", "holds no figure between 0 and 1"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET last_value = '1.5'", "holds no figure between 0 and 1"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE metric_registry SET last_value = NULL", "holds no figure between 0 and 1"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE improvement_loop_runs SET ts = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-150 minutes')", "recorded no run in 120 minutes"],
  ["improvement-loop-relapse-trigger-judge", "DELETE FROM improvement_loop_runs", "recorded no run in 120 minutes"],
  ["improvement-loop-relapse-trigger-judge", "UPDATE improvement_loop_runs SET state_json = '{\"fix_hold_rate_30d\":0.66}'", "no longer keeps the target-based figure"]
];
for (const [control, mutation, reason] of BREAK) {
  const w = world();
  w.exec(mutation);
  const o = reasonOf(w, control);
  ok(o !== "ok" && o.includes(reason), "fails when its alternate is broken: " + control + " / " + reason, o);
}
// the edges that must NOT fail
const KEEP = [
  ["code-task-publish-patch-cap", "three oversize refusals 30 minutes old, no issue yet (inside the 120 minute grace)", "INSERT INTO code_tasks VALUES ('t7', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes')), ('t8', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 minutes')), ('t9', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-32 minutes'))"],
  ["code-task-publish-patch-cap", "two old oversize refusals, no issue (under the loop breaker's threshold of three: it files nothing, so this is not a missing hand-off)", "INSERT INTO code_tasks VALUES ('t8', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-300 minutes')), ('t9', 'qnfo-new/worker.js', 'publish_failed', 'publish: patch larger than 1500000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-310 minutes'))"],
  ["code-task-publish-patch-cap", "three oversize refusals older than 1440 minutes, no issue (outside the window)", "INSERT INTO code_tasks VALUES ('t7', 'qnfo-old/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1500 minutes')), ('t8', 'qnfo-old/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1600 minutes')), ('t9', 'qnfo-old/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1700 minutes'))"],
  ["code-task-publish-patch-cap", "three old oversize refusals on a path that has its loop-breaker issue", "INSERT INTO code_tasks VALUES ('t7', 'qnfo-fleet-dashboard/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-300 minutes')), ('t8', 'qnfo-fleet-dashboard/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-310 minutes')), ('t9', 'qnfo-fleet-dashboard/worker.js', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-320 minutes'))"],
  ["code-task-publish-patch-cap", "a reason-less failure older than 1440 minutes", "INSERT INTO code_tasks VALUES ('t9', 'a/worker.js', 'publish_failed', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1500 minutes'))"],
  ["code-task-publish-patch-cap", "a claude-session holder carries the route", "UPDATE work_claims SET holder = 'claude-session-77'"],
  // the quiet-period world (work_claims 2026-10-14T13:32Z to 2026-10-19T04:34Z: no session merge for about 5 days). A standing "a session merged in the last 1440 minutes" clause failed here for about 5220 minutes
  // and filed a drill issue only a session merge could close; nothing is owed while no oversize hand-off is open, so these pass
  ["code-task-publish-patch-cap", "quiet period: the last session merge is 5 days old and the hand-off is closed", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7200 minutes'); UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'LOOP-BREAKER-1:%'"],
  ["code-task-publish-patch-cap", "quiet period: no session claim at all and the hand-off is closed", "DELETE FROM work_claims; UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'LOOP-BREAKER-1:%'"],
  ["code-task-publish-patch-cap", "quiet period: every claim of the day was abandoned (the 2026-10-17 ledger: 521 abandoned session claims, no merged one) and the hand-off is resolved", "UPDATE work_claims SET outcome = 'abandoned'; UPDATE agent_issues SET status = 'resolved' WHERE title LIKE 'LOOP-BREAKER-1:%'"],
  ["code-task-publish-patch-cap", "an open hand-off filed 100 minutes ago (inside the 120 minute grace) and no session merge yet", "DELETE FROM work_claims; UPDATE agent_issues SET created_at = CAST(strftime('%s', 'now', '-100 minutes') AS INTEGER) * 1000 WHERE title LIKE 'LOOP-BREAKER-1:%'"],
  ["code-task-publish-patch-cap", "an open hand-off older than 120 minutes whose only session merge came after it was filed (250 minutes ago, hand-off 300)", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-250 minutes')"],
  ["code-task-publish-patch-cap", "a fractional-second release time, as three live claims carry", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-250 minutes')"],
  ["code-task-publish-patch-cap", "a second hand-off that is closed does not make the route owe anything", "UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-250 minutes'); INSERT INTO agent_issues (title, description, status, created_at) VALUES ('LOOP-BREAKER-1: qnfo-fleet-control/worker.js: publish: patch larger than  chars', 'second hand-off', 'closed', CAST(strftime('%s', 'now', '-200 minutes') AS INTEGER) * 1000)"],
  ["code-task-publish-patch-cap", "an old open loop-breaker issue about another failure is not an oversize hand-off (the oversize one is closed)", "DELETE FROM work_claims; UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'LOOP-BREAKER-1:%'; INSERT INTO agent_issues (title, description, status, created_at) VALUES ('LOOP-BREAKER-1: a/worker.js: verify loop', 'another loop', 'open', CAST(strftime('%s', 'now', '-500 minutes') AS INTEGER) * 1000)"],  ["code-task-publish-patch-cap", "the loop-breaker issue is closed (the hand-off happened)", "UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'LOOP-BREAKER-1:%'"],
  ["improvement-loop-relapse-trigger-judge", "a figure of exactly 1 and exactly 0", "UPDATE metric_registry SET last_value = '1'"],
  ["improvement-loop-relapse-trigger-judge", "ops_config lever absent or detector reading failing: not this probe's business", "UPDATE remediation_contracts SET status = 'active'"],
  ["relapse-reopen-window", "a detector that is failing (it is alive and counting)", "UPDATE remediation_contracts SET status = 'active' WHERE class = 'fm-relapse-window-close-anchor'"],
  ["verification-deferral-escalation", "an unrelated contract that is parked", "INSERT INTO remediation_contracts (class, status, verify_probe) VALUES ('issue-5', 'parked', 'x')"]
];
for (const [control, why, mutation] of KEEP) { const w = world(); w.exec(mutation); ok(reasonOf(w, control) === "ok", "still passes: " + control + " / " + why, reasonOf(w, control)); }
// the quiet period replayed drill by drill: the last session merge ages from 1500 to 6660 minutes (2026-10-14T13:32Z to 2026-10-19T04:34Z is 6662), one drill every 360 minutes, and the hand-off is closed.
// The standing clause the review refused ("a session merged in the last 1440 minutes") fails on every one of those drills; the demand-conditioned clause passes on every one.
{
  const STANDING = "SELECT NOT EXISTS (SELECT 1 FROM work_claims WHERE (substr(holder, 1, 8) = 'session_' OR substr(holder, 1, 14) = 'claude-session') AND pr IS NOT NULL AND outcome = 'merged' AND released_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1440 minutes')) AS fails";
  let drills = 0, standingFails = 0, probeFails = 0;
  for (let ago = 1500; ago <= 6660; ago += 360) {
    const w = world();
    w.exec("UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-" + ago + " minutes'); UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'LOOP-BREAKER-1:%'");
    drills++;
    if (w.prepare(STANDING).get().fails === 1) standingFails++;
    if (reasonOf(w, "code-task-publish-patch-cap") !== "ok") probeFails++;
  }
  ok(drills === 15 && standingFails === drills && probeFails === 0, "quiet period: the standing 1440 minute clause would fail all " + drills + " drills, the probe fails none", { drills, standingFails, probeFails });
  const p = probeOf(world(), "code-task-publish-patch-cap") || "";
  const iOpen = p.indexOf("FROM agent_issues WHERE status = 'open'"), iClaims = p.indexOf("FROM work_claims");
  ok((p.match(/FROM work_claims/g) || []).length === 1 && iOpen > 0 && iClaims > iOpen && !/no session pull request merged in 1440 minutes/.test(p), "the probe carries no standing session-merge window: its one work_claims read sits after, and inside, the open LOOP-BREAKER-1 oversize issue sub-select", { iOpen, iClaims });
}
// no probe passes by absence: an empty world fails every probe
{
  const w = world({ seed: false });
  for (const c of PROBE_CONTROLS) { const r = reasonOf(w, c); ok(r !== "ok" && r.length > 20, "an empty world fails (no pass by absence): " + c, r); }
  const w2 = world({ deferredColumn: false });
  ok(reasonOf(w2, "verification-deferral-escalation").includes("has no deferred_since column"), "a database without the deferred_since column fails the deferral probe with that reason", reasonOf(w2, "verification-deferral-escalation"));
}

// ---- 6. a second, hand-written reason row and an unmarked row survive the apply untouched ----
{
  const w = world({ apply: false });
  w.exec("UPDATE control_registry SET evidence = evidence || ' | PATHS-UNTESTED-1 earlier ALTERNATE-NOT-EXERCISABLE: written by hand' WHERE control = 'model_floor_pr_check'");
  const before = w.prepare("SELECT evidence FROM control_registry WHERE control = 'model_floor_pr_check'").get().evidence;
  w.exec(sql);
  ok(w.prepare("SELECT evidence FROM control_registry WHERE control = 'model_floor_pr_check'").get().evidence === before, "a control that already carries the reason is not given a second one");
}

// ---- 6b. the failure mode and its detector ----
{
  const w = world();
  const fm = w.prepare("SELECT * FROM failure_modes WHERE fm_key = 'control-alternate-reason-unread'").get();
  ok(fm && fm.probe_class === "fm-control-alternate-reason-unread" && fm.issue_id === 2826 && [fm.failure_mode, fm.root_cause, fm.remediation, fm.detector, fm.trigger_condition, fm.symptom, fm.blast_radius].every((x) => x && x.length > 30), "failure mode control-alternate-reason-unread is recorded with root cause, remediation, detector and blast radius", fm);
  const rc = w.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-control-alternate-reason-unread'").get();
  ok(rc && rc.verify_transport === "d1-query" && rc.status === "active" && rc.module === "failure-mode" && rc.expected_cadence_h === 1, "the fm- detector contract is an active hourly d1-query contract", rc);
  const l = " " + String(rc && rc.verify_probe).toLowerCase().replace(/\s+/g, " ") + " ";
  ok(rc && /^select /i.test(rc.verify_probe) && !rc.verify_probe.includes(";") && !TICK_KW.some((k) => l.includes(k)), "the detector passes the remediation tick's literal check (one SELECT, no semicolon, no write keyword)");
  const det = (d) => (rc ? chaosJudge(d.prepare(rc.verify_probe).all()) : { pass: false, observed: "no detector contract" });
  ok(det(w).pass === true && det(w).observed === "0", "the detector reads 0 after the file (every recorded reason is read by both views)", det(w));
  // the old views, put back under the new evidence: the detector sees exactly the defect
  const old = world({ apply: false });
  old.exec(sql);
  old.exec("DROP VIEW v_path_coverage_gaps; DROP VIEW v_control_alternate_status;");
  old.exec(OLD_VIEWS.replace(/CREATE VIEW v_control_alternate_untested[\s\S]*?;\s*/, "").replace(/CREATE VIEW v_path_coverage_violations[\s\S]*?;\s*/, ""));
  ok(det(old).pass === false && det(old).observed === "3", "the detector FAILS (3) when the views are the old ones: it would have caught the defect", det(old));
  // a marker row that has a probe is not its business, and neither is a stamped one or one with no alternate
  const w2 = world(); w2.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('model_floor_pr_check', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'later')");
  ok(det(w2).observed === "0", "a reason row that later gains a probe is not counted");
  const w3 = world(); w3.exec("UPDATE control_registry SET alternate_tested_at = '2026-10-19T19:00:00Z' WHERE control = 'model_floor_pr_check'"); w3.exec("UPDATE control_registry SET alternate_path = '' WHERE control = 'research-model-skip-gauge'");
  ok(det(w3).observed === "0", "a stamped row and a row with no alternate are not counted");
  // the gaming surface the review found: the bare token clears a probe-less control in both views (the spec asks for that), so the detector must be the review. A control that records the reason
  // later is read as not exercisable by both views at once, and the detector reads 1 until a confirmed blocker_redteam row for control:<name> exists.
  const w4 = world(); w4.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('another-control', 'l', 'gate', 'keep', 'a second path', 'ALTERNATE-NOT-EXERCISABLE: because')");
  ok(path(w4, "another-control") === "alternate-not-exercisable" && state(w4, "another-control") === "not-exercisable" && counts(w4).controls_untested_without_probe === 2, "a bare token with no review reads not exercisable in BOTH views, so controls_untested_without_probe falls to 2: the views alone cannot tell a review from a text edit", counts(w4));
  ok(det(w4).pass === false && det(w4).observed === "1", "the detector reads 1 for a bare-token row with no blocker_redteam row (the text edit is no longer a free exemption)", det(w4));
  const RT = (w, target, verdict) => w.exec("INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor) VALUES ('" + target + "', 'ALTERNATE-NOT-EXERCISABLE: because', 'read it', '" + verdict + "', 'the refusal text | surfaces: a, b', 'session_x')");
  RT(w4, "control:another-control", "confirmed-with-evidence");
  ok(det(w4).observed === "0", "and 0 once its confirmed-with-evidence red-team row exists", det(w4));
  const w4b = world(); w4b.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('another-control', 'l', 'gate', 'keep', 'a second path', 'ALTERNATE-NOT-EXERCISABLE: because')");
  RT(w4b, "control:another-control", "workaround-built");
  ok(det(w4b).observed === "1", "a red-team row whose verdict is workaround-built does not review the reason (the alternate can be built, so build it)");
  const w4c = world(); w4c.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('another-control', 'l', 'gate', 'keep', 'a second path', 'ALTERNATE-NOT-EXERCISABLE: because')");
  RT(w4c, "control:some-other-control", "confirmed-with-evidence"); RT(w4c, "another-control", "confirmed-with-evidence");
  ok(det(w4c).observed === "1", "a red-team row for another target, or one without the control: prefix, is not this control's review");
  const w4d = world(); w4d.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('none-needed-marked', 'l', 'gate', 'keep', 'None needed: protects people outside the fleet', 'ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed')");
  ok(det(w4d).observed === "0" && path(w4d, "none-needed-marked") === "alternate-not-exercisable", "a none needed alternate_path with the token keeps its CONTROL-ALT-PROBES-1 standing (the three old rows need no red-team row)");
  // the shipped rows each have their review: remove one and the detector names exactly it
  for (const c of NOT_EX) { const w5 = world(); w5.exec("DELETE FROM blocker_redteam WHERE target = 'control:" + c + "'"); ok(det(w5).observed === "1", "the detector reads 1 when the red-team row of " + c + " is missing", det(w5)); }
  const w6 = world(); w6.exec("DELETE FROM blocker_redteam"); ok(det(w6).observed === "3", "and 3 with none of the three reviews");
}

// ---- 6c. the premises as beliefs: a reason is a dated measurement, so it breaks loudly ----
const BELIEF_OF = (c) => "alt-unexercisable-" + c;
const beliefRows = (w) => NOT_EX.map((c) => w.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("belief-" + BELIEF_OF(c)));
const beliefVerdict = (w, c) => { const r = w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get("belief-" + BELIEF_OF(c)); if (!r) return { pass: false, observed: "no belief contract" }; const before = w.prepare("SELECT total_changes() AS n").get().n; const v = chaosJudge(w.prepare(r.verify_probe).all()); v.readOnly = w.prepare("SELECT total_changes() AS n").get().n === before; return v; };
// the remediation tick, replayed: run each belief contract and write the verification row it writes (class, verified_at, pass, observed)
const tick = (w) => { for (const c of NOT_EX) { const v = beliefVerdict(w, c); w.prepare("INSERT INTO remediation_verifications (class, verified_at, pass, observed) VALUES (?, datetime('now'), ?, ?)").run("belief-" + BELIEF_OF(c), v.pass ? 1 : 0, v.observed); } };
const beliefStatus = (w, c) => w.prepare("SELECT status FROM v_belief_status WHERE belief_key = ?").get(BELIEF_OF(c))?.status;
{
  const w = world();
  const br = w.prepare("SELECT * FROM belief_registry ORDER BY belief_key").all();
  ok(JSON.stringify(br.map((r) => r.belief_key)) === JSON.stringify(NOT_EX.map(BELIEF_OF).sort()), "one belief per recorded reason, belief_key alt-unexercisable-<control> (the name the detector derives from the control)", br.map((r) => r.belief_key));
  ok(br.every((r) => r.probe_class === "belief-" + r.belief_key && r.claim.length > 120 && r.evidence.length > 150 && r.confidence > 0 && r.confidence < 1 && /CONTROL-ALT-PROBES-3/.test(r.built_on) && /blocker_redteam control:/.test(r.evidence)), "each belief names its belief-<key> probe class, a claim, the evidence and the red-team row it rests on");
  const bc = beliefRows(w);
  ok(bc.every((r) => r && r.status === "active" && r.verify_transport === "d1-query" && r.module === "belief" && r.expected_cadence_h === 1 && r.issue_id === null && r.max_attempts === 3 && [r.precondition, r.action, r.verify_probe, r.escalate_to].every((x) => x && x.length > 3)), "each belief has an active hourly d1-query contract in module belief, with every NOT NULL column of the live table set");
  ok(bc.every((r) => { if (!r) return false; const l = " " + r.verify_probe.toLowerCase().replace(/\s+/g, " ") + " "; return /^select /i.test(r.verify_probe) && !r.verify_probe.includes(";") && !TICK_KW.some((k) => l.includes(k)) && /^SELECT 'ok' AS expected, /.test(r.verify_probe) && / AS observed$/.test(r.verify_probe); }), "each premise probe is one expected/observed SELECT that passes the remediation tick's literal check (no semicolon, no write keyword, string literals included)", bc.map((r) => r && TICK_KW.filter((k) => (" " + r.verify_probe.toLowerCase() + " ").includes(k))));
  ok(bc.every((r) => r && likeLits(r.verify_probe).every((l) => Buffer.byteLength(l) <= 50)) && likeLits(bc[1].verify_probe).length === 1 && likeLits(bc[2].verify_probe).length === 1, "every LIKE pattern in a premise probe is within D1's 50 bytes", bc.map((r) => r && likeLits(r.verify_probe)));
  for (const c of NOT_EX) { const v = beliefVerdict(w, c); ok(v.pass === true && v.observed === "ok" && v.readOnly === true, "the premise probe reads ok and writes nothing while the premise holds (live 2026-10-19 world: transient ai-warn rows, a quoted wait text under ai-error, a failure notice in the steward detail): " + c, v); }
  tick(w);
  ok(NOT_EX.every((c) => beliefStatus(w, c) === "held") && w.prepare("SELECT COUNT(*) AS n FROM v_belief_status WHERE status = 'falsified'").get().n === 0, "after one replayed tick the three beliefs read held");
  const rcDet = w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-control-alternate-reason-unread'").get()?.verify_probe || "SELECT 'x' AS expected, 'no detector contract' AS observed";
  ok(chaosJudge(w.prepare(rcDet).all()).observed === "0", "and the detector reads 0 with held beliefs");
}
// [belief control, mutation, substring of the observed text]: the premise breaks, the probe FAILS and says what to do
const PREMISE_BREAK = [
  ["research-model-skip-gauge", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('s1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-skip', 'aiText model=@cf/zai-org/glm-5.3-flash skipped for 20 s after a rate limit, using @cf/openai/gpt-oss-120b')", "an ai-skip event now exists"],
  ["research-fallback-price-guard", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('s1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-skip', 'aiText model=@cf/zai-org/glm-5.3-flash waiting 12 s after a rate limit, no fallback at or under its price')", "an ai-skip event now exists"],
  ["research-model-skip-gauge", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('w1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-warn', 'aiText model=@cf/zai-org/glm-5.3-flash exhausted (3021: rate limit), no fallback at or under its price: one more try after 20 s')", "an ai-warn event with no fallback at or under its price now exists"],
  ["research-fallback-price-guard", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('w1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-warn', 'aiText model=@cf/zai-org/glm-5.3-flash exhausted (3021: rate limit), no fallback at or under its price: one more try after 20 s')", "an ai-warn event with no fallback at or under its price now exists"],
  ["research-model-skip-gauge", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('s0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-100000 minutes'), 'ai-skip', 'an old skip event: the premise is about ever, so age does not restore it')", "an ai-skip event now exists"],
  ["model_floor_pr_check", "CREATE TABLE workflow_runs (id INTEGER PRIMARY KEY, workflow TEXT, conclusion TEXT)", "a table or view that records workflow runs now exists"],
  ["model_floor_pr_check", "CREATE TABLE model_floor_guard_runs (id INTEGER PRIMARY KEY, conclusion TEXT)", "a table or view that records workflow runs now exists"],
  ["model_floor_pr_check", "CREATE VIEW v_gha_runs AS SELECT 1 AS id", "a table or view that records workflow runs now exists"],
  ["model_floor_pr_check", "CREATE TABLE pipeline_ci_runs (id INTEGER PRIMARY KEY)", "a table or view that records workflow runs now exists"],
  ["model_floor_pr_check", "CREATE TABLE actions_runs (id INTEGER PRIMARY KEY)", "a table or view that records workflow runs now exists"],
  ["model_floor_pr_check", "INSERT INTO github_steward_runs (started_at, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '{\"model_floor_guard\":{\"status\":200,\"last_conclusion\":\"success\"}}')", "github_steward_runs.detail now carries a model_floor_guard record"],
  ["model_floor_pr_check", "INSERT INTO github_steward_runs (started_at, detail) VALUES ('2026-10-01T00:00:00.000Z', '{\"model_floor_guard\":{\"status\":200}}')", "github_steward_runs.detail now carries a model_floor_guard record"]
];
for (const [control, mutation, reason] of PREMISE_BREAK) {
  const w = world();
  w.exec(mutation);
  const v = beliefVerdict(w, control);
  ok(v.pass === false && v.observed.includes(reason) && v.observed.includes("add a control_alternate_probes row for " + control) && v.observed.includes("retire its ALTERNATE-NOT-EXERCISABLE reason") && v.readOnly === true, "the premise probe FAILS when the premise breaks, naming the step: " + control + " / " + reason, v);
  // the other two premises are independent of this one
  for (const other of NOT_EX.filter((c) => c !== control)) {
    const o = beliefVerdict(w, other);
    const shared = other.startsWith("research-") && control.startsWith("research-");
    ok(shared ? o.pass === false : o.pass === true, "the premise of " + other + " " + (shared ? "shares the research event and breaks with it" : "is untouched by a break of " + control), o);
  }
}
// premises that must NOT break: look-alikes the live world carries
const PREMISE_KEEP = [
  ["ai-warn transient and fallback rows, an ai-error row that quotes the wait text, a deploy row naming model-floor", "SELECT 1"],
  ["tables of other runs (perf_runs, fleet_runs, cf_obs_sweep_runs) and the steward table itself", "CREATE TABLE perf_runs (id INTEGER PRIMARY KEY); CREATE TABLE fleet_runs (id INTEGER PRIMARY KEY); CREATE TABLE cf_obs_sweep_runs (id INTEGER PRIMARY KEY); CREATE VIEW v_process_run_freshness AS SELECT 1 AS id"],
  ["a steward row that quotes the failed workflow in a notification title", "INSERT INTO github_steward_runs (started_at, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '{\"notifications\":{\"kept\":[{\"title\":\"model-floor-guard workflow run failed for main branch\"}]},\"workflows\":3}')"],
  ["an ai-warn row about reasoning_effort and an ai-warn row naming a fallback", "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('k1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-warn', 'aiText model=m rejected reasoning_effort, retrying without: x'), ('k2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-warn', 'aiText model=m exhausted (3021), fallback @cf/openai/gpt-oss-20b')"]
];
for (const [why, mutation] of PREMISE_KEEP) { const w = world(); w.exec(mutation); ok(NOT_EX.every((c) => beliefVerdict(w, c).pass === true), "the premise still holds: " + why, NOT_EX.map((c) => beliefVerdict(w, c).observed)); }
// the whole chain: a premise breaks, the next hourly tick writes a failing verification, the belief reads falsified and the detector turns red for exactly that control; retiring the reason (a probe row) turns it green
{
  const w = world();
  const detOf = (d) => chaosJudge(d.prepare(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-control-alternate-reason-unread'").get()?.verify_probe || "SELECT 'x' AS expected, 'no detector contract' AS observed").all());
  w.exec("INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('s1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'ai-skip', 'aiText model=m skipped for 20 s after a rate limit, using f')");
  ok(detOf(w).observed === "0", "before the next tick nothing has judged the broken premise yet (the detector still reads 0)");
  tick(w);
  ok(beliefStatus(w, "research-model-skip-gauge") === "falsified" && beliefStatus(w, "research-fallback-price-guard") === "falsified" && beliefStatus(w, "model_floor_pr_check") === "held", "after the tick the two research beliefs read falsified and the workflow belief held");
  const d1 = detOf(w);
  ok(d1.pass === false && d1.observed === "2", "the detector fm-control-alternate-reason-unread reads 2: a reason whose premise broke does not lie in a list that nothing grades", d1);
  w.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('research-model-skip-gauge', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'a probe on the ai-skip event')");
  ok(detOf(w).observed === "1", "retiring one reason (a probe row on the control) leaves only the other");
  w.exec("UPDATE control_registry SET alternate_tested_at = '2026-10-19T20:00:00Z' WHERE control = 'research-fallback-price-guard'");
  ok(detOf(w).pass === true && detOf(w).observed === "0", "and the stamp of the second one turns the detector green again");
  // a belief with no fresh verdict is suspect, not falsified: a slow tick is not a broken premise
  const w2 = world();
  w2.exec("INSERT INTO remediation_verifications (class, verified_at, pass, observed) VALUES ('belief-alt-unexercisable-model_floor_pr_check', datetime('now', '-300 minutes'), 0, 'old failure')");
  ok(beliefStatus(w2, "model_floor_pr_check") === "suspect" && detOf(w2).observed === "0", "a failing verification older than 60 minutes reads suspect (v_belief_status) and is not counted by the detector");
  const w3 = world();
  w3.exec("INSERT INTO remediation_verifications (class, verified_at, pass, observed) VALUES ('belief-alt-unexercisable-model_floor_pr_check', datetime('now', '-5 minutes'), 0, 'x'), ('belief-alt-unexercisable-model_floor_pr_check', datetime('now', '-1 minutes'), 1, 'ok')");
  ok(beliefStatus(w3, "model_floor_pr_check") === "held" && detOf(w3).observed === "0", "the latest verification decides: a pass after a failure reads held");
  // the mapping is by name: a reason whose belief is missing is the review's business (red-team row), not the detector's belief leg
  const w4 = world(); w4.exec("DELETE FROM belief_registry WHERE belief_key = 'alt-unexercisable-model_floor_pr_check'");
  ok(detOf(w4).observed === "0", "a missing belief row does not fail the detector by itself (the red-team row is the review the detector requires)");
}

// ---- 6d. the doer for the one alternate that cannot be observed at all ----
{
  const w = world();
  const stew = readFileSync(join(here, "..", "qnfo-github-steward", "worker.js"), "utf8");
  const is = w.prepare("SELECT * FROM agent_issues WHERE title LIKE 'MODEL-FLOOR-GUARD-OBSERVABLE-1:%'").all();
  ok(is.length === 1 && is[0].status === "open" && /^claude-session:session_/.test(is[0].source) && is[0].category === "reliability" && is[0].priority === "medium" && is[0].created_at > 1.7e12, "one open MODEL-FLOOR-GUARD-OBSERVABLE-1 issue is filed from a trusted code-task origin (source claude-session:...)", is.map((r) => [r.status, r.source, r.category]));
  const d = is[0] ? is[0].description : "";
  ok(/^Charter pillar: autonomy\./.test(d) && /\nStep 1 \(code-task, qnfo-github-steward/.test(d) && /\nStep 2 \(migration/.test(d) && /\nDefinition of done: /.test(d) && !/claude\.ai|anthropic\.com/i.test(d), "the issue names its pillar, both steps and its definition of done");
  ok(/\ncode-task: repo=qnfo-workers path=qnfo-github-steward\/worker\.js\n/.test(d), "it carries the code-task line for the code loop, on a line of its own");
  const anchor = (/\ncode-anchor: (.*)\n/.exec(d) || [])[1];
  // The doer of this issue is a code-task that adds the model_floor_guard key to the steward, so these two pins hold on the pre-doer state and must keep passing once it has landed
  // (otherwise the doer's own merge turns every later migration or control-plane pull request red; control-alternate-probes.test.mjs uses the same 'landed ||' shape).
  const landed = /model_floor_guard/.test(stew);
  ok(anchor && anchor.length > 30 && (landed || stew.split(anchor).length - 1 === 1), "its code-anchor occurs exactly once in qnfo-github-steward/worker.js until the doer has landed (ACT-BRIDGE-1)", anchor);
  ok(/function mainRulesVisibility\(/.test(stew) && (landed || !/model_floor_guard/.test(stew)), "the steward has the function the issue builds beside and carries no model_floor_guard key until the doer has landed (the defect is real on main)");
  {
    const stewLanded = stew.replace("function mainRulesVisibility(", "function mainRulesVisibility(/* model_floor_guard added by the doer */");
    const landed2 = /model_floor_guard/.test(stewLanded);
    ok(landed2 && (landed2 || false) && /function mainRulesVisibility\(/.test(stewLanded) && (landed2 || !/model_floor_guard/.test(stewLanded)), "a steward source that already carries the model_floor_guard key still satisfies both pins (the doer's merge does not turn this suite red)");
  }
  ok(!/\b\d+ ?(hours?|days?)\b/i.test(d) && /at most 120|none above 120/.test(d) && /120 minutes/.test(d), "windows in the issue are stated in minutes and none above 120");
  const c = (is[0] && w.prepare("SELECT * FROM remediation_contracts WHERE issue_id = ?").get(is[0].id)) || { class: "", verify_probe: "SELECT 'none' AS expected, 'no contract' AS observed" };
  ok(is[0] && c.class === "issue-" + is[0].id && c.status === "active" && c.verify_transport === "d1-query" && c.module === "control-alt-probes" && c.expected_cadence_h === 1 && c.next_due_at === null && c.attempts === 0 && c.last_verdict === null, "the birth contract of the issue is given its d1-query probe and armed (no longer needs-machine-probe)", c);
  const l = " " + String(c.verify_probe).toLowerCase().replace(/\s+/g, " ") + " ";
  ok(/^select /i.test(c.verify_probe) && !c.verify_probe.includes(";") && !TICK_KW.some((k) => l.includes(k)) && /^SELECT '1' AS expected, /.test(c.verify_probe), "its probe is one expected/observed SELECT that passes the tick's literal check");
  const run = (db) => chaosJudge(db.prepare(c.verify_probe).all());
  const fresh = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes')", stale = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-200 minutes')";
  const rec = (db, when) => db.exec("INSERT INTO github_steward_runs (started_at, detail) VALUES (" + when + ", '{\"model_floor_guard\":{\"last_conclusion\":\"success\"}}')");
  const prb = (db, en) => db.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES ('model_floor_pr_check', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'x', " + en + ")");
  ok(run(w).pass === false && run(w).observed === "0", "the closing probe FAILS today: the defect exists (no record, no probe row)", run(w));
  { const a = world(); rec(a, fresh); ok(run(a).pass === false, "the record alone does not close it (step 2 is still owed)"); }
  { const a = world(); prb(a, 1); ok(run(a).pass === false, "a probe row alone does not close it (it would read an empty record)"); }
  { const a = world(); rec(a, stale); prb(a, 1); ok(run(a).pass === false, "a record older than 120 minutes does not close it (the steward stopped writing it)"); }
  { const a = world(); rec(a, fresh); prb(a, 0); ok(run(a).pass === false, "a disabled probe row does not close it"); }
  { const a = world(); rec(a, fresh); prb(a, 1); ok(run(a).pass === true, "the record of the last 120 minutes and the enabled probe row close it"); }
  { const a = world(); a.exec("INSERT INTO github_steward_runs (started_at, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'), '{\"notifications\":{\"kept\":[{\"title\":\"model-floor-guard workflow run failed for main branch\"}]}}')"); prb(a, 1); ok(run(a).pass === false, "a steward row that only quotes the failed workflow is no record"); }
}

// ---- 7. the Rollback line restores the pre-state ----
{
  const w = world({ apply: false });
  const preC = JSON.stringify(w.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all());
  const preV = viewSql(w);
  w.exec(sql);
  w.exec(rollback);
  ok(JSON.stringify(w.prepare("SELECT control, evidence FROM control_registry ORDER BY control").all()) === preC, "the Rollback line restores every evidence text");
  ok(w.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes WHERE control <> 'probed-and-drilled'").get().n === 0, "and removes the four probes");
  ok(w.prepare("SELECT COUNT(*) AS n FROM blocker_redteam").get().n === 0, "and the three red-team rows");
  ok(w.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && w.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-control-alternate-reason-unread'").get().n === 0, "and the failure mode with its detector contract");
  const rb = viewSql(w);
  ok(rb["v_path_coverage_gaps"] === preV["v_path_coverage_gaps"] && rb["v_control_alternate_status"] === preV["v_control_alternate_status"], "and both views, text for text", { gaps: rb["v_path_coverage_gaps"] === preV["v_path_coverage_gaps"], status: rb["v_control_alternate_status"] === preV["v_control_alternate_status"] });
  ok(w.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "the append-only decision row stays");
  ok(NOT_EX.every((c) => path(w, c) === "alternate-untested"), "after the Rollback the three read alternate-untested again (the defect returns)");
  ok(w.prepare("SELECT COUNT(*) AS n FROM belief_registry").get().n === 0 && w.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'belief-%'").get().n === 0, "and the three beliefs with their belief-<key> contracts");
  const iss = w.prepare("SELECT status FROM agent_issues WHERE title LIKE 'MODEL-FLOOR-GUARD-OBSERVABLE-1:%'").all();
  ok(iss.length === 1 && iss[0].status === "superseded", "and the filed issue is superseded, not deleted (no silent drop)", iss);
}

// ---- 7. cf-obs-nested-too-deep-pin: restated over 120 minutes (CHAOS-DRILL-FAILED-1 issue 100247, found at the first control drill) ----
{
  // the probe probes1 seeded for this control reads only the last verdict of a detector whose window is 25 minutes, so it flapped; seed it here (not in world()) so the other sections keep their counts
  const w = world({ apply: false });
  w.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('cf-obs-nested-too-deep-pin', ?, 'old')").run(OLD_CFOBS_PROBE);
  w.exec(sql);
  const row = w.prepare("SELECT probe_sql, window_note FROM control_alternate_probes WHERE control = 'cf-obs-nested-too-deep-pin'").get() || { probe_sql: "", window_note: "" };
  ok(/remediation_verifications/.test(row.probe_sql) && !/last_verdict/.test(row.probe_sql) && /-120 minutes/.test(row.probe_sql) && /120 minutes/.test(row.window_note), "the probe now asks for a passing verification inside 120 minutes and no longer reads the last verdict", row);
  ok(/^select /i.test(row.probe_sql) && !row.probe_sql.includes(";") && !TICK_KW.some((k) => (" " + row.probe_sql.toLowerCase().replace(/\s+/g, " ") + " ").includes(k)), "it is one expected/observed SELECT that passes the tick's literal check");
  const mini = (verdict, verifs) => {
    const d = new DatabaseSync(":memory:");
    d.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, last_verdict TEXT); CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, verified_at TEXT, pass INTEGER)");
    if (verdict !== null) d.prepare("INSERT INTO remediation_contracts (class, status, last_verdict) VALUES ('fm-trigger-depth-compile', 'active', ?)").run(verdict);
    for (const [mins, pass, iso] of verifs) d.prepare("INSERT INTO remediation_verifications (class, verified_at, pass) VALUES ('fm-trigger-depth-compile', " + (iso ? "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)" : "datetime('now', ?)") + ", ?)").run("-" + mins + " minutes", pass);
    return { new: d.prepare(row.probe_sql).get().observed, old: d.prepare(OLD_CFOBS_PROBE).get().observed };
  };
  const flap = mini("fail", [[50, 1, true], [20, 0, true]]);
  ok(flap.new === "ok" && flap.old !== "ok", "the 25-minute flap (last verdict fail, a pass 50 minutes ago) reads ok now and failed under the old probe", flap);
  ok(mini("pass", [[200, 1, false]]).new.includes("no passing verification in 120 minutes"), "a pass only 200 minutes old no longer counts");
  ok(mini("pass", [[30, 0, false], [10, 0, false]]).new.includes("no passing verification in 120 minutes"), "failing verifications only: still red (the control is not hidden)");
  ok(mini(null, [[10, 1, false]]).new.includes("missing or not active"), "no active detector contract: red");
  ok(mini("pass", [[30, 1, true]]).new === "ok" && mini("pass", [[30, 1, false]]).new === "ok", "ISO and space-separated verified_at both parse");
  const w2 = world({ apply: false });
  w2.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('cf-obs-nested-too-deep-pin', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'someone restated this')").run();
  w2.exec(sql);
  ok(w2.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = 'cf-obs-nested-too-deep-pin'").get().probe_sql === "SELECT 'ok' AS expected, 'ok' AS observed", "a row someone already restated is left alone by a replay (guarded on the old last_verdict text)");
}

console.log(pass + " passed, " + fail + " failed" + (SKIP ? " (pre-change run: failures are expected)" : ""));
process.exit(fail ? 1 : 0);
