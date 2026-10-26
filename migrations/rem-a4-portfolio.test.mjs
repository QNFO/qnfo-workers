// REM-A4-PORTFOLIO-1 offline suite: replays migrations/2026-10-26-issue-hygiene-1.sql, -2 and -3 on node:sqlite (the live definition of the hourly workflow issue-meta-fold, with the
// live close-guard triggers of migrations/issue-hygiene-3.test.mjs), then runs migrations/2026-10-26-rem-a4-portfolio.sql. Proves:
//  * the rule portfolio-gap-resolved: before the file the workflow does not close a PORTFOLIO-GAP ticket whose gap is gone (the gap in 1000395); after it the workflow closes a deploy-unrecorded or
//    project-stale-deploy ticket whose newest gap row is closed or resolved and older than a day AND for which a successful deployment_history row satisfies the detector, with 'moot:' evidence naming
//    the gap row (day, status, resolved_at) and the deployment row (id, action, deployed_at); it keeps a ticket whose newest gap row is open, filed today or yesterday, a gap with no satisfying
//    deployment row (none, failed, older than 30 days for the stale kind), another gap kind and another title;
//  * the workflow moves up one version, holds thirteen statements of which exactly the new insert is added, in front of the five settle statements, and is valid JSON; a second apply changes nothing;
//    the Rollback line restores the saved definition and the saved contract rows; the file adds no trigger and no DELETE or DROP;
//  * the contract of 100341 reads 0 on the live shape (detector reads reconciled deployments, voice-stt has a deployment row) and a non-zero text when the detector is reverted or the row is gone;
//    the contract of 99953 passes when only qnfo-model-eval is current and other workers carry an older date with no flips, and fails on a flip, an open gap or trigger 5108 in breach;
//    the contract of 1000194 passes on the live data shape and fails on a summary without the two labels, notes without counts and scorecards older than a day;
//    the actions of 100341, 99953, 2852 and 1000194 stop saying VACUOUS-PROBE-V3-1, a repaired contract is left alone; one decision_log row.
// Run: node --no-warnings migrations/rem-a4-portfolio.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sql1 = readFileSync(here("2026-10-26-issue-hygiene-1.sql"), "utf8");
const sql2 = readFileSync(here("2026-10-26-issue-hygiene-2.sql"), "utf8");
const sql3 = readFileSync(here("2026-10-26-issue-hygiene-3.sql"), "utf8");
// RA4_MIGRATION points the suite at a mutated copy of the migration (mutation checks); unset, it reads the merged file.
const sql = readFileSync(process.env.RA4_MIGRATION ? resolve(process.env.RA4_MIGRATION) : here("2026-10-26-rem-a4-portfolio.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

ok(/^-- APPLY-BY: ci\s*$/m.test(sql) && /^-- DB: qnfo-audit\s*$/m.test(sql) && sql.split("\n").filter((l) => l.startsWith("-- Rollback:")).length === 1, "header opts in, one single-line Rollback");
ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(sql.replace(/^--.*$/gm, "")) && !/claude\.ai|anthropic\.com/i.test(sql), "no DELETE or DROP, no claude.ai link");
ok(!/\b(update|delete|insert) ['"]/i.test(sql.split("\n").filter((l) => /verify_probe/.test(l)).join("\n")), "no write keyword with a trailing space inside the probe text lines");

// the base of hygiene-3.test.mjs: live close-guard triggers and tables, then the three hygiene files give the live definition of issue-meta-fold
const h3 = readFileSync(here("issue-hygiene-3.test.mjs"), "utf8");
const s0 = h3.indexOf("const TRIGGERS = ["), s1 = h3.indexOf("let k = 0;");
ok(s0 > 0 && s1 > s0, "the hygiene-3 suite carries the live-shaped base");
const { build3 } = new Function("DatabaseSync", h3.slice(s0, s1) + "\nreturn { build3 };")(DatabaseSync);

const EXTRA = `
CREATE TABLE portfolio_gaps (kind TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT, first_seen TEXT DEFAULT (datetime('now')), day TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, issue_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, entity, day));
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT DEFAULT 'worker', purpose TEXT, state TEXT DEFAULT 'live');
CREATE TABLE worker_compat_state (worker TEXT NOT NULL, checked_at TEXT NOT NULL, live_date TEXT NOT NULL, flips_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (worker, checked_at));
CREATE TABLE trig (id INTEGER PRIMARY KEY, metric_key TEXT, val REAL, hit INTEGER);
CREATE VIEW v_metric_trigger_state AS SELECT * FROM trig;
CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, session TEXT, summary TEXT);
CREATE TABLE program_review_notes (day TEXT, program_code TEXT, roadmap_now INTEGER, goals_adopted INTEGER);
CREATE TABLE program_scorecards (day TEXT, program_code TEXT);
`;
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ts = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ");
let nid = 3000000;
function base() {
  const db = build3(); db.exec(sql1); db.exec(sql2); db.exec(sql3); db.exec(EXTRA);
  // the triggers the hygiene base lacks: none needed. The contract table of the base has the columns of the live table.
  return db;
}
function ticket(db, title, o = {}) {
  const id = ++nid;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'x', 'portfolio-autopilot', 'portfolio', 'high', 'open', 1, 1)").run(id, title);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'PORTFOLIO-AUTOPILOT-1', 'triaged', 'qnfo-ops', '2026-10-27')").run(id);
  if (o.contract) db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-ops', 'active', ?)").run("issue-" + id, id, o.contract);
  return id;
}
const gap = (db, kind, entity, d, status, resolvedAt = null, issue = null) => db.prepare("INSERT INTO portfolio_gaps (kind, entity, detail, day, status, resolved_at, issue_id) VALUES (?, ?, 'd', ?, ?, ?, ?)").run(kind, entity, d, status, resolvedAt, issue);
const dep = (db, name, action, status, at) => db.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, deployed_by, deployed_at, status) VALUES ('worker', ?, ?, 'deployment-ledger-reconcile', ?, ?)").run(name, action, at, status);
const stepsOf = (db) => JSON.parse(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'issue-meta-fold'").definition).steps.map((s) => s.sql);
const run = (db) => { for (const s of stepsOf(db)) db.exec(s); };
const status = (db, id) => one(db, "SELECT status FROM agent_issues WHERE id = ?", id).status;

function fixture(db) {
  const f = {};
  // A: deploy-unrecorded voice-stt, gap rows closed 3 days ago, the live deployment is recorded as action deployed; its contract reads fail (a plain close would abort)
  f.A = ticket(db, "PORTFOLIO-GAP deploy-unrecorded voice-stt", { contract: "fail" });
  gap(db, "deploy-unrecorded", "voice-stt", day(5), "closed", ts(3), f.A); gap(db, "deploy-unrecorded", "voice-stt", day(4), "closed", ts(3), f.A);
  dep(db, "voice-stt", "deployed", "success", ts(6));
  // B: project-stale-deploy W.foo, newest row resolved, a deploy 2 days ago
  f.B = ticket(db, "PORTFOLIO-GAP project-stale-deploy W.foo");
  gap(db, "project-stale-deploy", "W.foo", day(4), "resolved", ts(3), f.B);
  dep(db, "foo", "deploy", "success", ts(2)); dep(db, "foo", "deploy", "failed", ts(0.5));
  // C: the newest row is still open
  f.C = ticket(db, "PORTFOLIO-GAP deploy-unrecorded still-open");
  gap(db, "deploy-unrecorded", "still-open", day(4), "closed", ts(3), f.C); gap(db, "deploy-unrecorded", "still-open", day(3), "open", null, f.C); dep(db, "still-open", "deploy", "success", ts(9));
  // D: closed, but the detector filed it yesterday
  f.D = ticket(db, "PORTFOLIO-GAP deploy-unrecorded filed-yesterday");
  gap(db, "deploy-unrecorded", "filed-yesterday", day(1), "closed", ts(0.2), f.D); dep(db, "filed-yesterday", "deploy", "success", ts(9));
  // E: closed gap, no deployment row at all
  f.E = ticket(db, "PORTFOLIO-GAP deploy-unrecorded no-deploy");
  gap(db, "deploy-unrecorded", "no-deploy", day(4), "closed", ts(3), f.E);
  // F: stale-deploy kind, the only deploy is older than 30 days
  f.F = ticket(db, "PORTFOLIO-GAP project-stale-deploy W.old");
  gap(db, "project-stale-deploy", "W.old", day(4), "resolved", ts(3), f.F); dep(db, "old", "deploy", "success", ts(45));
  // G: another gap kind with a closed gap and a deployment, H: another title, I: only failed deployments
  f.G = ticket(db, "PORTFOLIO-GAP upgrade-compat qnfo-model-eval");
  gap(db, "upgrade-compat", "qnfo-model-eval", day(4), "closed", ts(3), f.G); dep(db, "qnfo-model-eval", "deploy", "success", ts(1));
  f.H = ticket(db, "PORTFOLIO-GAP-RESOLVED-1: close a PORTFOLIO-GAP issue with evidence when its gap stops being detected");
  f.I = ticket(db, "PORTFOLIO-GAP deploy-unrecorded only-failed");
  gap(db, "deploy-unrecorded", "only-failed", day(4), "closed", ts(3), f.I); dep(db, "only-failed", "deployed", "failed", ts(2));
  return f;
}

// ---- before the file: the gap
const a = base();
const f = fixture(a);
run(a);
ok(status(a, f.A) === "open" && status(a, f.B) === "open", "before the file the workflow does not close a PORTFOLIO-GAP ticket whose gap is gone (the gap of 1000395)");
const v0 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const steps0 = stepsOf(a);
const triggers0 = one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n;
ok(steps0.length === 12 && v0.version === 3, "the live shape: twelve statements, version 3", { n: steps0.length, v: v0.version });

// the contracts the file rewrites, in their live (born-vacuous / time-gated) shape
const OLD_100341 = "SELECT '0' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind='portfolio-lifecycle' AND ts >= '2026-10-27') = 0 THEN 'pending: no portfolio-lifecycle tick has run on or after 2026-10-27' ELSE '0' END AS observed";
const OLD_99953 = "SELECT '1' AS expected, CASE WHEN (SELECT live_date FROM worker_compat_state WHERE worker='qnfo-model-eval' ORDER BY checked_at DESC LIMIT 1) >= '2026-10-10' AND (SELECT count(*) FROM worker_compat_state w WHERE checked_at=(SELECT MAX(checked_at) FROM worker_compat_state) AND live_date<'2026-10-10')=0 THEN '1' ELSE '0' END AS observed";
const VAC = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const contract = (db, cls, id, st, probe, action, verdict = "fail", module = "probe-template-v3-generic") => db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, module) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-fleet-control', ?, ?, 9, ?)").run(cls, id, action, probe, st, verdict, module);
for (const [id, probe] of [[100341, OLD_100341], [99953, OLD_99953], [2852, "SELECT 'ok' AS expected, 'below target' AS observed"], [2993, "SELECT '0' AS expected, '5' AS observed"]]) {
  a.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'x', 's', 'c', 'high', 'open', 1, 1)").run(id, "T" + id);
}
a.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (1000194, 'PORTFOLIO-STRATEGIC-2', 'x', 's', 'c', 'medium', 'open', 1, 1)").run();
contract(a, "issue-100341", 100341, "active", OLD_100341, VAC, "deferred", "sweep-fleet-tasks-c");
contract(a, "issue-99953", 99953, "active", OLD_99953, "Probe measures the live result: ...", "fail", "d1-query");
contract(a, "issue-2852", 2852, "active", "SELECT 'ok' AS expected, 'below target' AS observed", VAC);
contract(a, "issue-1000194", 1000194, "superseded", "SELECT 'closed' AS expected, NULL AS observed", VAC, "superseded:closure-observing-probe-at-birth");
contract(a, "issue-2993", 2993, "active", "SELECT '0' AS expected, '5' AS observed", VAC);

// ---- apply
a.exec(sql);
const v1 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const steps1 = stepsOf(a);
ok(v1.version === v0.version + 1 && steps1.length === 13, "the workflow moves up one version and holds thirteen statements", { v0: v0.version, v1: v1.version, n: steps1.length });
const added = steps1.filter((s) => !steps0.includes(s));
ok(added.length === 1 && /portfolio-gap-resolved/.test(added[0]) && steps0.every((s) => steps1.includes(s)), "exactly one statement is added and the twelve others are unchanged", added.length);
ok(steps1.indexOf(added[0]) === 7 && JSON.stringify(steps1.filter((_, i) => i !== 7)) === JSON.stringify(steps0), "the new rule sits after the seven rules and before the five settle statements, the rest in order", steps1.indexOf(added[0]));
ok(one(a, "SELECT json_valid(definition) AS v FROM fleet_tasks WHERE id = 'issue-meta-fold'").v === 1, "the definition is valid JSON");
ok(one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n === triggers0, "the file adds no trigger");

// ---- the workflow now closes the resolved gaps and only those
run(a);
ok(status(a, f.A) === "closed" && status(a, f.B) === "closed", "a ticket whose gap is closed and satisfied by a deployment row closes (deploy-unrecorded with action deployed, stale-deploy with a deploy)", [status(a, f.A), status(a, f.B)]);
for (const [key, label] of [["C", "newest gap row still open"], ["D", "gap filed yesterday"], ["E", "no deployment row"], ["F", "only deployment older than 30 days (stale kind)"], ["G", "another gap kind"], ["H", "another title"], ["I", "only a failed deployment"]]) {
  ok(status(a, f[key]) === "open", "kept: " + label, status(a, f[key]));
}
const evA = one(a, "SELECT close_evidence FROM issue_triage WHERE issue_id = ?", f.A).close_evidence;
ok(/^moot: the gap this issue reports is no longer detected/.test(evA) && evA.includes("deploy-unrecorded voice-stt is day " + day(4)) && /status closed, resolved_at \d{4}-\d{2}-\d{2} \d{2}:/.test(evA) && /deployment_history row \d+ \(action deployed, deployed_at \d{4}-\d{2}-\d{2} /.test(evA) && /PORTFOLIO-GAP-RESOLVED-1 ISSUE-HYGIENE-1 \d{4}-\d{2}-\d{2}$/.test(evA), "the evidence names the gap row and the deployment row", evA);
const evB = one(a, "SELECT close_evidence FROM issue_triage WHERE issue_id = ?", f.B).close_evidence;
ok(evB.includes("project-stale-deploy W.foo is day") && evB.includes("(status resolved,") && evB.includes("action deploy,"), "the stale-deploy evidence names status resolved and the deploy row", evB);
const fooRow = one(a, "SELECT id FROM deployment_history WHERE resource_name = 'foo' AND status = 'success'").id;
ok(evB.includes("deployment_history row " + fooRow + " "), "the evidence names the successful row, not the failed one", evB);
ok(one(a, "SELECT close_channel AS c FROM agent_issues WHERE id = ?", f.A).c === "workflow:ISSUE-HYGIENE-1 portfolio-gap-resolved", "the close names its channel");
ok(one(a, "SELECT contract_status AS s FROM issue_fold_ledger WHERE issue_id = ?", f.A).s === "active" && one(a, "SELECT status FROM remediation_contracts WHERE issue_id = ?", f.A).status === "superseded", "its failing contract is superseded first, so the close is not refused");
ok(one(a, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE rule = 'portfolio-gap-resolved' AND applied = 1").n === 2 && one(a, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE applied = 0").n === 0, "the ledger holds one applied row per closed ticket");
ok(one(a, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE event = 'dispositioned' AND has_evidence = 1 AND issue_id IN (?, ?)", f.A, f.B).n === 2, "each close left a lifecycle row with evidence (no silent drop)");
// a gap that is later detected again keeps its ticket open
const J = ticket(a, "PORTFOLIO-GAP deploy-unrecorded flaps");
gap(a, "deploy-unrecorded", "flaps", day(6), "closed", ts(5), J); dep(a, "flaps", "deploy", "success", ts(7));
gap(a, "deploy-unrecorded", "flaps", day(0), "open", null, J);
run(a);
ok(status(a, J) === "open", "a gap detected again today keeps its ticket open");

// ---- idempotent, rollback
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM fleet_tasks ORDER BY id").all(), db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").all()]);
const snap1 = snap(a); a.exec(sql);
ok(snap(a) === snap1, "a second apply changes nothing");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_rem_a4_portfolio_task").n === 1 && one(a, "SELECT version FROM bak_20261026_rem_a4_portfolio_task").version === v0.version, "the hygiene-3 definition is saved once");

// ---- the contracts
const c = (cls) => one(a, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const val = (db, probe) => { const r = db.prepare(probe).get(); return [r.expected, r.observed]; };
const LIFECYCLE_NEW = JSON.stringify({ steps: [{ type: "sql", db: "AUDIT", sql: "INSERT OR IGNORE INTO portfolio_gaps (kind, entity, detail, day) SELECT 'deploy-unrecorded', s.service, 'x', date('now') FROM service_registry s WHERE s.kind='worker' AND s.state='live' AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=s.service AND dh.action IN ('deploy','deployed') AND COALESCE(dh.status,'success')='success')" }] });
const LIFECYCLE_OLD = LIFECYCLE_NEW.replace("IN ('deploy','deployed')", "= 'deploy'");
function p100341(life, deps, ledger = true) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT); CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, state TEXT); CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_name TEXT, action TEXT, status TEXT); CREATE TABLE project_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, action TEXT)");
  if (ledger) db.prepare("INSERT INTO project_ledger (project_id, action) VALUES ('W.voice-stt', 'deployed')").run();
  db.prepare("INSERT INTO fleet_tasks VALUES ('portfolio-lifecycle', ?)").run(life);
  db.prepare("INSERT INTO service_registry VALUES ('voice-stt', 'worker', 'live')").run();
  for (const [action, st] of deps) db.prepare("INSERT INTO deployment_history (resource_name, action, status) VALUES ('voice-stt', ?, ?)").run(action, st);
  return val(db, c("issue-100341").verify_probe);
}
const r1 = p100341(LIFECYCLE_NEW, [["deployed", "success"]]);
ok(r1[0] === "0" && r1[1] === "0", "100341: reads 0 on the live shape (detector reads reconciled deployments, voice-stt has a deployed row)", r1);
const r2 = p100341(LIFECYCLE_OLD, [["deployed", "success"]]);
ok(r2[1] !== "0" && /does not read reconciled deployments/.test(r2[1]), "100341: a detector reverted to action = deploy reads a non-zero text", r2);
const r3 = p100341(LIFECYCLE_NEW, []);
ok(r3[1] === "1", "100341: no deployment row for voice-stt reads 1", r3);
const r4 = p100341(LIFECYCLE_NEW, [["deployed", "failed"], ["deploy-direct", "success"]]);
ok(r4[1] === "1", "100341: a failed or deploy-direct row does not count", r4);
const r5 = p100341(LIFECYCLE_NEW, [["deployed", "success"]], false);
ok(/no project_ledger row shows what W\.voice-stt runs/.test(r5[1]), "100341: no project_ledger row for W.voice-stt (the project cannot show what it runs) reads a non-zero text", r5);
ok(c("issue-100341").status === "active" && c("issue-100341").last_verdict === null && c("issue-100341").attempts === 0 && !/VACUOUS-PROBE-V3-1/.test(c("issue-100341").action) && c("issue-100341").module === "rem-a4-portfolio", "100341: contract re-armed with an honest action");

function p99953(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(EXTRA);
  const t = "2026-10-26T16:02:12Z";
  db.prepare("INSERT INTO worker_compat_state VALUES ('qnfo-model-eval', ?, ?, ?)").run(t, o.live ?? "2026-10-10", o.flips ?? 0);
  db.prepare("INSERT INTO worker_compat_state VALUES ('q08-mind', ?, '2026-10-01', 0)").run(t);
  db.prepare("INSERT INTO worker_compat_state VALUES ('voice-stt', ?, '2026-10-01', 0)").run(t);
  db.prepare("INSERT INTO trig VALUES (5108, 'workers_compat_date_behind', ?, ?)").run(o.hit ?? 0, o.hit ?? 0);
  if (o.gap) db.prepare("INSERT INTO portfolio_gaps (kind, entity, day, status) VALUES ('upgrade-compat', 'qnfo-model-eval', ?, 'open')").run(day(0));
  return val(db, c("issue-99953").verify_probe);
}
const q1 = p99953();
ok(q1[0] === "1" && q1[1] === "1", "99953: passes when qnfo-model-eval is current with no flips, although q08-mind and voice-stt carry an older date with no flips (the dropped clause)", q1);
ok(p99953({ flips: 1 })[1] === "0" && p99953({ live: "2026-10-01" })[1] === "0" && p99953({ gap: 1 })[1] === "0" && p99953({ hit: 1 })[1] === "0", "99953: fails on a flip, an older live date, an open upgrade-compat gap and trigger 5108 in breach");
ok(c("issue-99953").last_verdict === null && c("issue-99953").attempts === 0 && !/Probe measures the live result: qnfo-model-eval live_date is 2026-10-10 or later, the compat metric trigger 5108 is not in breach, and no worker/.test(c("issue-99953").action), "99953: contract re-armed with the scoped action");

function p1000194(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(EXTRA);
  db.prepare("INSERT INTO portfolio_runs (run_date, kind, summary) VALUES (?, 'weekly-strategic', ?)").run(day(0), o.summary ?? "weekly-strategic: constraint QNFO.OPS (program risk 666); portfolio risk 768; cost 1");
  db.prepare("INSERT INTO portfolio_runs (run_date, kind, summary) VALUES (?, 'weekly-strategic', 'constraint QNFO.OPS risk 801')").run(day(2));
  db.prepare("INSERT INTO program_review_notes VALUES (?, 'QNFO.OPS', ?, ?)").run(day(0), o.now === undefined ? 3 : o.now, 2);
  db.prepare("INSERT INTO program_scorecards VALUES (?, 'QNFO.OPS')").run(o.sc ?? day(0));
  return val(db, c("issue-1000194").verify_probe);
}
const s = p1000194();
ok(s[0] === "ok" && s[1] === "ok", "1000194: passes on the live data shape", s);
ok(/does not label/.test(p1000194({ summary: "constraint QNFO.OPS risk 801" })[1]) && /no roadmap or goal counts/.test(p1000194({ now: null })[1]) && /more than a day old/.test(p1000194({ sc: day(3) })[1]), "1000194: fails on a summary without the two labels, notes without counts and scorecards older than a day");
ok(c("issue-1000194").status === "active" && c("issue-1000194").last_verdict === null && c("issue-1000194").module === "rem-a4-portfolio" && !/VACUOUS-PROBE-V3-1/.test(c("issue-1000194").action), "1000194: the born-superseded template is replaced by an active measuring contract");
ok(!/VACUOUS-PROBE-V3-1/.test(c("issue-2852").action) && c("issue-2852").verify_probe === "SELECT 'ok' AS expected, 'below target' AS observed" && c("issue-2852").status === "active", "2852: only the action text changed, the probe stays the measurement");
ok(/VACUOUS-PROBE-V3-1/.test(c("issue-2993").action), "2993 is the other file's (the BP26 half): untouched here");

// a contract another session already repaired is left alone
const b = base(); b.exec("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (100341, 'T', 'x', 's', 'c', 'high', 'open', 1, 1)");
b.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, module) VALUES ('issue-100341', 100341, 'p', 'repaired by someone', 'SELECT ''1'' AS expected, ''1'' AS observed', 'd1-query', 'qnfo-fleet-control', 'active', 'pass', 4, 'other')").run();
b.exec(sql);
ok(one(b, "SELECT action AS a FROM remediation_contracts WHERE class = 'issue-100341'").a === "repaired by someone" && one(b, "SELECT attempts AS n FROM remediation_contracts WHERE class = 'issue-100341'").n === 4, "a contract that is no longer in the old shape is left alone");
// a definition that already holds the rule, or lacks the anchor, is left alone
const d = base(); d.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'ISSUE-HYGIENE-1)', 'ISSUE-HYGIENE-X)') WHERE id = 'issue-meta-fold'").run();
const dv = one(d, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
d.exec(sql);
const dv2 = one(d, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
ok(dv2.version === dv.version && dv2.definition === dv.definition, "a definition without the anchor (or with it twice) is left alone");

// ---- the failure mode and its detector
const fmRow = one(a, "SELECT * FROM failure_modes WHERE fm_key = 'portfolio-gap-ticket-outlives-gap'");
const det = c("fm-portfolio-gap-ticket-outlives-gap");
ok(fmRow && fmRow.probe_class === "fm-portfolio-gap-ticket-outlives-gap" && fmRow.issue_id === 1000395 && det && det.status === "active" && det.module === "failure-mode" && det.issue_id === null && det.verify_transport === "d1-query", "the failure mode and its detector contract are registered", [fmRow && fmRow.fm_key, det && det.status]);
// on the fixture the detector counts the tickets whose gap is gone for over two days and that the rule cannot close (no satisfying deployment row): E, F and I; the ones the rule closed (A, B) and the rest do not count
const dres = val(a, det.verify_probe);
ok(dres[0] === "0" && dres[1] === "3", "the detector counts the three tickets the rule cannot close (no deployment row, deploy older than 30 days, failed deployment)", dres);
const e = base(); const t1 = ticket(e, "PORTFOLIO-GAP deploy-unrecorded voice-stt"); gap(e, "deploy-unrecorded", "voice-stt", day(5), "closed", ts(3), t1); dep(e, "voice-stt", "deployed", "success", ts(6));
const t2 = ticket(e, "PORTFOLIO-GAP deploy-unrecorded fresh"); gap(e, "deploy-unrecorded", "fresh", day(1), "closed", ts(0.1), t2); gap(e, "deploy-unrecorded", "open-one", day(0), "open");
e.exec(sql);
ok(val(e, one(e, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-portfolio-gap-ticket-outlives-gap'").verify_probe)[1] === "1", "before the workflow runs, the detector counts the one ticket the rule is about to close (the voice-stt ticket; a gap closed yesterday does not count)");
run(e);
ok(val(e, one(e, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-portfolio-gap-ticket-outlives-gap'").verify_probe)[1] === "0" && status(e, t1) === "closed" && status(e, t2) === "open", "after the workflow runs the detector reads 0");

// ---- decision and rollback
ok(one(a, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REM-A4-PORTFOLIO-1:') = 1").n === 1, "the decision is logged once");
const before = JSON.stringify([a.prepare("SELECT * FROM remediation_contracts WHERE class IN ('issue-100341','issue-99953','issue-2852','issue-1000194') ORDER BY class").all().map((r) => r.class)]);
for (const stmt of rollback.split("; ")) a.exec(stmt);
const rd = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
ok(rd.definition === v0.definition && !/portfolio-gap-resolved/.test(rd.definition), "Rollback restores the hygiene-3 definition");
ok(c("issue-100341").verify_probe === OLD_100341 && c("issue-99953").verify_probe === OLD_99953 && c("issue-1000194").status === "superseded" && c("issue-100341").action === VAC, "Rollback restores the four contract rows", before);
ok(!c("fm-portfolio-gap-ticket-outlives-gap") && !one(a, "SELECT 1 AS x FROM failure_modes WHERE fm_key = 'portfolio-gap-ticket-outlives-gap'"), "Rollback removes the detector and the failure mode");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
