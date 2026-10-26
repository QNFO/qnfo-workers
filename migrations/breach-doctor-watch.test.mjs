// BREACH-DOCTOR-WATCH-1 offline suite: applies migrations/2026-10-26-breach-doctor-watch.sql on SQLite (node:sqlite) over fixtures of the objects it touches.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback) and deletes, drops and stamps nothing; the doctor tick component gets the watch as its alternate_path whichever migration
// applies first (an empty registry, or a row the doctor migration wrote with a 'planned:' text and its issue_id); alternate_tested_at stays NULL; the spof probe is one read-only SELECT judged by the real
// chaosJudge sliced from qnfo-fleet-control/worker.js: it fails with a reason when the doctor ledger is missing (a failed or rolled-back doctor migration; the live ledger has existed since 2026-10-26T10:22Z)
// and on each missing piece, including the gap between this migration (applied at merge) and the first watch tick after the worker deploys (no pass by absence), and passes only with the ledger, a
// breach-doctor-watch event inside 30 minutes and doctor_tick_age_min at 30 or below; the fm- detector reads 1 only for an armed doctor with a silent watch, and waits 30 minutes after its own failure mode row
// is born (the deploy that follows the migration); issue BREACH-DOCTOR-WATCH-1 (1000397) is narrowed to the acting half and stays open: its description, its contract probe (which no longer reads job-run, a kind
// this job never writes on a tick) and control_registry breach-doctor-switch are rewritten once, the new probe fails today with the reason and passes only on the stamp and the capability row of the acting half;
// the file is re-runnable and its Rollback removes or restores what it created.
// Run: node migrations/breach-doctor-watch.test.mjs        (BDW_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-26-breach-doctor-watch.sql"), "utf8");
const workerSrc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.BDW_SKIP_MIGRATION === "1";
const COMP = "breach doctor tick (qnfo-fleet-control */10)";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- the real judge ----
const a = workerSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), b = workerSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
ok(a > 0 && b > a, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = workerSrc.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});
ok(/UPDATE spof_registry SET alternate_tested_at = \?1, reviewed_at = \?1 WHERE component = \?2 AND alternate_path IS NOT NULL/.test(workerSrc), "the deployed drill stamps spof_registry only for a row with an alternate_path");

// ---- static ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 300 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing (so no BACKUP table is needed)");
ok(!/DELETE\s+FROM\s+decision_log/i.test(rollback), "the Rollback never deletes decision_log rows (append-only)");
ok(!/SET\s+alternate_tested_at/i.test(body) && !/SET\s+reviewed_at/i.test(body), "the file never writes alternate_tested_at or reviewed_at (only a passing drill stamps)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?|h)\b/i.test(body), "no window, cadence or SLA is stated in hours or days in the statements");
ok(/INSERT OR IGNORE INTO spof_registry/.test(body) && /INSERT OR IGNORE INTO spof_alternate_probes/.test(body) && /INSERT OR IGNORE INTO failure_modes/.test(body) && /INSERT OR IGNORE INTO remediation_contracts/.test(body) && /INSERT OR IGNORE INTO capability_ledger/.test(body), "every insert is INSERT OR IGNORE");

// ---- fixture ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const sqlt = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace("T", " ").slice(0, 19);
const DOCTOR_PLANNED = "planned: qnfo-cloud-ops jobBreachDoctorWatch runs the validated per-issue playbooks when doctor_tick_age_min exceeds 30 (issue BREACH-DOCTOR-WATCH-1, a session, closing probe on its job-run event)";
const ISSUE_TITLE = "BREACH-DOCTOR-WATCH-1: the breach doctor has one runner, so qnfo-cloud-ops gets a watch that acts when the doctor stops ticking";
const OLD_DOD = "Definition of done: a cloud_ops_events job-run row for job breach-doctor-watch is under 120 minutes old (the closing probe of this issue) and the spof_registry row names the tested alternate.";
const OLD_DESC = "Charter pillar: autonomy. spof_registry holds \"breach doctor tick (qnfo-fleet-control */10)\": one cron slot and one runner on the path from an unowned breach to a verified close. ANTIFRAGILE-1: a design with one executor on a critical path ships with its second path or an issue that builds it; this is that issue.\n" +
  "Doer: a session (a design, not a single-file edit, so no code-task line). Change in qnfo-cloud-ops/worker.js, on the existing hourly tick and CRON_TABLE (CRON-SINGLE-TRIGGER-1, no new cron): jobBreachDoctorWatch reads the newest breach_diagnosis_events tick; when it is older than 30 minutes (doctor_tick_age_min) it runs the same validated per-issue playbooks (the S1 validators) and records every action in breach_diagnoses; every run, acting or not, logs a job-run event for job breach-doctor-watch (a heartbeat, the lesson of PARK-REARM-HEARTBEAT-1). Then set spof_registry alternate_tested_at and control_registry breach-doctor-switch alternate_tested_at in the same migration.\n" + OLD_DOD;
const OLD_PRE = "BREACH-DOCTOR-1: the doctor tick is the only runner of the diagnosis path";
const OLD_ACT = "a session adds jobBreachDoctorWatch to qnfo-cloud-ops; the stale-PR lane merges it and the canonical deploy ships it";
const OLD_PROBE = "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'job-run' AND job = 'breach-doctor-watch' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN 'no breach-doctor-watch job-run event in the last 120 minutes' ELSE 'ok' END AS observed";
const OLD_CTRL = "the qnfo-cloud-ops watch (separate package) reads the same switch";
const OLD_CTRL_FULL = "per-rule stop (breach_playbooks.enabled = 0), automatic demotion to measure after 2 failures in 24 hours, every applied action carries its revert_sql; " + OLD_CTRL;
// the fixture strings are the doctor migration's own (so the guards of this file are proved against what is really on D1)
const doctorSql = readFileSync(join(here, "2026-10-26-breach-doctor.sql"), "utf8");
for (const [name, t] of [["description line", OLD_DOD], ["precondition", OLD_PRE], ["action", OLD_ACT], ["probe", OLD_PROBE]])
  ok(doctorSql.includes(t.replace(/'/g, "''")), "the fixture " + name + " is the text of migrations/2026-10-26-breach-doctor.sql");
ok(doctorSql.includes(OLD_CTRL), "the fixture switch alternate_path is the text of migrations/2026-10-26-breach-doctor.sql");
function world(o) {
  o = o || {};
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE spof_registry (component TEXT PRIMARY KEY, critical_path TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE spof_alternate_probes (component TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, exercise TEXT, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER, updated_at INTEGER, recheck_count INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));`);
  if (o.doctorIssue) {
    // the rows the doctor migration wrote and the live D1 holds (read 2026-10-26T10:52Z): the open issue with its three-line description, its active job-run contract and the kill-switch row
    w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at, recheck_count) VALUES (1000397, ?, ?, 'session', 'autonomy', 'high', 'open', 1792000000000, 1792000000000, 0)").run(ISSUE_TITLE, OLD_DESC);
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES ('issue-1000397', 1000397, ?, ?, ?, 'd1-query', 1000, 'qnfo-fleet-control', 1, 'active', 'breach-doctor', '2026-10-26 10:49:50')").run(OLD_PRE, OLD_ACT, OLD_PROBE);
    w.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES ('breach-doctor-switch', 'ops_config breach_doctor (on|measure|off)', 'kill-switch', 'a doctor action that proves wrong', 0, 'keep', 'planned', ?, NULL, 'new loop 2026-10-26: reversible actions only, a 30-minute measure period per playbook, measured by doctor_actions_failed_24h', 1000397)").run(OLD_CTRL_FULL);
  }
  if (o.doctorRow) w.prepare("INSERT INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES (?, 'unowned breach -> diagnosis -> allowlisted action -> verified close', ?, NULL, 'new 2026-10-26; the engine is worker code on an existing cron', 1000300)").run(COMP, DOCTOR_PLANNED);
  return w;
}
const applied = (o) => { const w = world(o); if (!SKIP) w.exec(body); return w; };
const judge = (w, p) => chaosJudge(w.prepare(p).all());
let evN = 0;
const ev = (w, kind, status, minAgo) => w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?,?,?,?,?,?)").run("e" + evN++, iso(minAgo), kind, "x", kind, status);
const setMetric = (w, v) => { w.prepare("DELETE FROM metric_registry WHERE metric = 'doctor_tick_age_min'").run(); w.prepare("INSERT INTO metric_registry (metric, last_value, state) VALUES ('doctor_tick_age_min', ?, 'MEASURED')").run(v); };
const dump = (w) => ["spof_registry", "spof_alternate_probes", "failure_modes", "remediation_contracts", "capability_ledger", "agent_issues", "control_registry"].map((t) => JSON.stringify(w.prepare("SELECT * FROM " + t + " ORDER BY 1").all())).join("\n") + JSON.stringify(w.prepare("SELECT COUNT(*) n FROM decision_log").get());
const ledger = (w) => w.exec("CREATE TABLE IF NOT EXISTS breach_diagnosis_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, event TEXT)");

// ---- the registry row, in both migration orders ----
{
  const w = applied();
  const r = w.prepare("SELECT * FROM spof_registry WHERE component = ?").get(COMP);
  ok(r && /^qnfo-cloud-ops jobBreachDoctorWatch \(BREACH-DOCTOR-WATCH-1, qnfo-cloud-ops 1\.39\.0\)/.test(r.alternate_path || "") && r.alternate_tested_at === null && r.critical_path === "unowned breach -> diagnosis -> allowlisted action -> verified close", "doctor migration not applied yet: the row is written with the watch as alternate_path and no test stamp", r);
  ok(r && /doctor_tick_age_min/.test(r.alternate_path) && /breach-doctor-watch/.test(r.alternate_path) && /no model call/.test(r.alternate_path) && /30 minutes/.test(r.alternate_path) && /120 minutes/.test(r.alternate_path), "the text names the metric, the event kind, the 30 and 120 minute windows and that it makes no model call");
  const w2 = applied({ doctorRow: true });
  const r2 = w2.prepare("SELECT * FROM spof_registry WHERE component = ?").get(COMP);
  ok(r2 && /^qnfo-cloud-ops jobBreachDoctorWatch/.test(r2.alternate_path || "") && r2.issue_id === 1000300 && r2.alternate_tested_at === null, "doctor migration applied first: its 'planned:' text is replaced, its issue_id kept, no test stamp", r2);
  ok(r2 && /new 2026-10-26; the engine is worker code on an existing cron \| BREACH-DOCTOR-WATCH-1 2026-10-26/.test(r2.evidence), "its evidence is kept and ours appended");
  // the other order: the doctor's INSERT OR IGNORE after ours changes nothing
  if (!SKIP) {
    const before = JSON.stringify(w.prepare("SELECT * FROM spof_registry").all());
    w.prepare("INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence) VALUES (?, 'x', ?, NULL, 'y')").run(COMP, DOCTOR_PLANNED);
    ok(JSON.stringify(w.prepare("SELECT * FROM spof_registry").all()) === before, "watch migration first, doctor migration second: the doctor's INSERT OR IGNORE leaves the row as ours");
  }
  // a row that already has a tested alternate or a non-planned text is never rewritten
  const w3 = world({ doctorRow: true });
  w3.prepare("UPDATE spof_registry SET alternate_path = 'a later hand-written alternate', alternate_tested_at = '2026-10-27T00:00:00Z' WHERE component = ?").run(COMP);
  if (!SKIP) w3.exec(body);
  const r3 = w3.prepare("SELECT alternate_path, alternate_tested_at FROM spof_registry WHERE component = ?").get(COMP);
  ok(r3.alternate_path === "a later hand-written alternate" && r3.alternate_tested_at === "2026-10-27T00:00:00Z", "a row whose alternate is not the planned text is left alone", r3);
}

// ---- the spof probe ----
{
  const w = applied();
  const pr = w.prepare("SELECT probe_sql, exercise, window_note, enabled FROM spof_alternate_probes WHERE component = ?").get(COMP);
  ok(pr && pr.probe_sql.length > 200 && pr.enabled === 1 && pr.exercise === null, "the component has an enabled, exercise-free spof_alternate_probes row");
  if (pr) {
    const p = pr.probe_sql;
    ok(!/;/.test(p) && /^SELECT /.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the probe is one read-only SELECT with no write keyword");
    ok(/'-\d+ minutes'/.test(p) && !/'-\d+ (hours?|days?)'/.test(p), "windows are in minutes");
    ok(/^30 minutes for the watch heartbeat/.test(pr.window_note), "the window note is the one the Rollback keys on");
    let v = judge(w, p);
    ok(!v.pass && /does not exist, so there is no doctor tick to watch yet/.test(v.observed), "with no doctor ledger (a failed or rolled-back doctor migration) the probe fails with the reason: no pass by absence", v);
    ledger(w);
    v = judge(w, p); ok(!v.pass && /no breach-doctor-watch event answered in 30 minutes/.test(v.observed), "the ledger exists but the watch has not run: fails", v);
    ev(w, "breach-doctor-watch", "ok", 5);
    v = judge(w, p); ok(!v.pass && /doctor_tick_age_min has no value/.test(v.observed), "a heartbeat but no metric value: fails", v);
    setMetric(w, "12");
    v = judge(w, p); ok(v.pass && v.observed === "ok", "ledger, a heartbeat 5 minutes old and doctor_tick_age_min 12: ok", v);
    setMetric(w, "30");
    ok(judge(w, p).pass, "a tick age of 30 is the edge of ok");
    setMetric(w, "31");
    v = judge(w, p); ok(!v.pass && /doctor_tick_age_min reads 31 minutes, above the limit of 30/.test(v.observed), "31 fails with the number: a stalled doctor is not a tested alternate", v);
    setMetric(w, "12");
    w.prepare("UPDATE cloud_ops_events SET status = 'error'").run();
    v = judge(w, p); ok(!v.pass && /no breach-doctor-watch event answered in 30 minutes/.test(v.observed), "an error heartbeat does not count as a run of the alternate", v);
    w.prepare("UPDATE cloud_ops_events SET status = 'ok', ts = ?").run(iso(31));
    ok(!judge(w, p).pass, "a heartbeat 31 minutes old fails");
    w.prepare("UPDATE cloud_ops_events SET ts = ?").run(iso(29));
    ok(judge(w, p).pass, "29 minutes old still passes (the edge)");
    w.prepare("UPDATE cloud_ops_events SET kind = 'research-watchdog'").run();
    ok(!judge(w, p).pass, "an event of another kind does not count");
    w.prepare("UPDATE cloud_ops_events SET kind = 'breach-doctor-watch'").run();
    // the drill's stamp, as the worker runs it
    const verdict = judge(w, p);
    const stamp = w.prepare("UPDATE spof_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE component = ?2 AND alternate_path IS NOT NULL");
    if (verdict.pass) stamp.run(new Date().toISOString(), COMP);
    ok(verdict.pass && w.prepare("SELECT alternate_tested_at FROM spof_registry WHERE component = ?").get(COMP).alternate_tested_at !== null, "a passing drill stamps the row (the file itself never does)");
  }
}

// ---- the failure mode and its detector ----
{
  const w = applied();
  const fm = w.prepare("SELECT * FROM failure_modes WHERE fm_key = 'breach-doctor-watch-silent'").get();
  ok(fm && fm.issue_id === 1000266 && fm.probe_class === "fm-breach-doctor-watch-silent" && /30 minutes/.test(fm.trigger_condition), "the failure mode is recorded against issue 1000266 with its detector class", fm);
  const c = w.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-breach-doctor-watch-silent'").get();
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.issue_id === null, "the fm- detector is an active d1-query contract", c);
  if (c) {
    const p = c.verify_probe;
    ok(!/;/.test(p) && /^SELECT /.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the detector is one read-only SELECT");
    const read = () => { const r = w.prepare(p).get(); return r.observed; };
    ok(read() === "0", "no doctor ledger: 0 (nothing to watch)");
    ledger(w);
    w.prepare("INSERT OR REPLACE INTO ops_config (key, value, updated_at) VALUES ('breach_doctor', 'on', ?)").run(sqlt(10));
    ok(read() === "0", "armed 10 minutes ago and no watch event yet: 0 (inside the grace window)");
    w.prepare("UPDATE ops_config SET updated_at = ? WHERE key = 'breach_doctor'").run(sqlt(45));
    ok(read() === "0", "armed 45 minutes ago but this failure mode row was born just now (the migration applies at merge, the worker deploys after it): 0 inside the 30 minute grace");
    w.prepare("UPDATE failure_modes SET first_seen = ? WHERE fm_key = 'breach-doctor-watch-silent'").run(iso(20));
    ok(read() === "0", "the failure mode row is 20 minutes old: still 0");
    w.prepare("UPDATE failure_modes SET first_seen = ? WHERE fm_key = 'breach-doctor-watch-silent'").run(iso(45));
    ok(read() === "1", "armed 45 minutes ago, the failure mode row 45 minutes old and no watch event in 30 minutes: 1 (the second path is silent)");
    w.prepare("UPDATE ops_config SET value = ' OFF ' WHERE key = 'breach_doctor'").run();
    ok(read() === "0", "breach_doctor off: 0 (the watch skips on purpose)");
    w.prepare("UPDATE ops_config SET value = 'measure' WHERE key = 'breach_doctor'").run();
    ok(read() === "1", "measure watches too");
    ev(w, "breach-doctor-watch", "ok", 8);
    ok(read() === "0", "a heartbeat 8 minutes old: 0");
    w.prepare("UPDATE cloud_ops_events SET ts = ?").run(iso(31));
    ok(read() === "1", "a heartbeat 31 minutes old: 1");
    w.prepare("DELETE FROM ops_config WHERE key = 'breach_doctor'").run();
    ok(read() === "0", "no switch row at all: 0");
  }
  const cap = w.prepare("SELECT * FROM capability_ledger WHERE capability = 'breach-doctor:second-path-watch'").get();
  ok(cap && /1\.39\.0/.test(cap.provenance) && cap.last_exercised_at === null && /second worker/.test(cap.evidence), "the capability is recorded, not yet exercised", cap);
  const dl = w.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 2 && /^BREACH-DOCTOR-WATCH-1:/.test(dl[0].action) && /^BREACH-DOCTOR-WATCH-1-SCOPE:/.test(dl[1].action) && dl.every((r) => r.capability_gain && r.predicted_outcome && r.surfaces_tested && r.rollback_path), "two decision_log rows (the package, the scope of issue 1000397), each with capability_gain, predicted_outcome, surfaces_tested and its revert path", dl.map((r) => r.action.slice(0, 40)));
  // the rows state what D1 held when they were written, and say that the deploy is still to come (no false "deployed", no "does not exist yet" for objects that exist)
  const d0 = dl[0] || { evidence: "", outcome: "" };
  ok(/migration_runs id 606/.test(d0.evidence) && /breach_diagnosis_events exists/.test(d0.evidence) && /doctor_tick_age_min is MEASURED/.test(d0.evidence) && /spof_registry holds the doctor row/.test(d0.evidence) && !/does not exist/.test(d0.evidence) && !/holds no /.test(d0.evidence), "the decision_log evidence states the live state read at 10:52Z", d0.evidence.slice(0, 300));
  ok(/deploy is pending/.test(d0.outcome) && /breach-doctor-watch-tick/.test(d0.outcome) && !/1\.39\.0 deployed through/.test(d0.outcome), "the outcome says the deploy is pending and names the proof to read later", d0.outcome);
}

// ---- issue 1000397: narrowed, not closed, and its probe passable only by the unbuilt half ----
{
  const NEW_CTRL_HEAD = "qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, 1.39.0, built) reads the same switch";
  const issue = (w) => w.prepare("SELECT * FROM agent_issues WHERE id = 1000397").get();
  const contract = (w) => w.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-1000397'").get();
  const w = applied({ doctorRow: true, doctorIssue: true });
  const i = issue(w), c = contract(w);
  ok(i && i.status === "open" && i.priority === "high" && i.title === ISSUE_TITLE && i.updated_at === 1792000000000 && i.recheck_count === 0, "the issue stays open at high priority with its title, and updated_at and recheck_count are not touched", i && { status: i.status, upd: i.updated_at, rc: i.recheck_count });
  ok(i && !i.description.includes(OLD_DOD) && i.description.startsWith(OLD_DESC.slice(0, OLD_DESC.length - OLD_DOD.length)) && /Scope narrowed 2026-10-26 by the BREACH-DOCTOR-WATCH-1 package/.test(i.description), "the description keeps its design paragraphs and only the Definition of done line is replaced by the narrowed scope");
  ok(i && /DELIVERED: the detect, measure and report half/.test(i.description) && /STILL OPEN: the acting half/.test(i.description) && /validated per-issue playbooks/.test(i.description) && /control_registry breach-doctor-switch/.test(i.description) && /a heartbeat does not close this issue/.test(i.description), "it names the delivered half, the open half, the playbooks and the control_registry stamp, and says a heartbeat does not close it");
  ok(i && !/runtime-probe: \{|code-probe: \{|code-task:|code-anchor:/.test(i.description), "no probe or code-task directive line is added (the issue probe triggers and the code loop stay out of it)");
  ok(c && c.status === "active" && c.verify_transport === "d1-query" && c.module === "breach-doctor" && c.max_attempts === 1000 && c.expected_cadence_h === 1 && c.escalate_to === "qnfo-fleet-control", "the contract stays the same active d1-query contract of the same module", c);
  ok(c && c.verify_probe !== OLD_PROBE && !/job-run/.test(c.verify_probe) && !/;/.test(c.verify_probe) && /^SELECT /.test(c.verify_probe) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(c.verify_probe) && /^SELECT 'ok' AS expected, /.test(c.verify_probe), "the probe no longer reads job-run, holds no semicolon (the live probe trigger would rewrite one) and is one read-only expected/observed SELECT");
  ok(c && /runs no playbook/.test(c.precondition) && /playbook branch/.test(c.action) && !/the only runner/.test(c.precondition), "the precondition and the action say what is built and what is left");
  const cr = w.prepare("SELECT * FROM control_registry WHERE control = 'breach-doctor-switch'").get();
  ok(cr && cr.alternate_path.includes(NEW_CTRL_HEAD) && !/separate package/.test(cr.alternate_path) && cr.alternate_path.startsWith("per-rule stop (breach_playbooks.enabled = 0)") && cr.alternate_tested_at === null && cr.issue_id === 1000397 && / \| BREACH-DOCTOR-WATCH-1 2026-10-26: alternate_path now names the built job/.test(cr.evidence), "control_registry breach-doctor-switch names the built job, keeps its other alternates and its issue_id, appends its evidence and stays untested", cr);
  // the probe, judged by the real chaosJudge: it fails today with the reason, and only the acting half's own stamp and capability row make it pass
  if (c) {
    const p = c.verify_probe;
    let v = judge(w, p);
    ok(!v.pass && /control_registry breach-doctor-switch has no alternate_tested_at/.test(v.observed), "today the probe fails with the missing stamp", v);
    // the delivered job's own output cannot satisfy it: its heartbeat (kind breach-doctor-watch, job breach-doctor-watch) and the capability this file writes
    ev(w, "breach-doctor-watch", "ok", 2);
    w.prepare("UPDATE cloud_ops_events SET job = 'breach-doctor-watch'").run();
    ok(w.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'breach-doctor:second-path-watch'").get().n === 1, "(the delivered half's capability row is present)");
    v = judge(w, p); ok(!v.pass, "the job's heartbeat row and the second-path-watch capability do not pass it", v);
    // the old probe, run on that same heartbeat, never passed either: the job writes kind breach-doctor-watch and never job-run on a tick
    ok(!judge(w, OLD_PROBE).pass && /no breach-doctor-watch job-run event/.test(judge(w, OLD_PROBE).observed), "the old probe fails on that heartbeat (it reads kind job-run, which this job never writes on a tick)");
    w.prepare("UPDATE control_registry SET alternate_tested_at = '2026-10-27T00:00:00Z' WHERE control = 'breach-doctor-switch'").run();
    v = judge(w, p); ok(!v.pass && /capability_ledger has no breach-doctor:second-path-playbooks row/.test(v.observed), "the stamp alone is not enough: the playbook capability row is missing", v);
    w.prepare("UPDATE control_registry SET alternate_tested_at = NULL WHERE control = 'breach-doctor-switch'").run();
    w.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('breach-doctor:second-path-playbooks', 'x', '2026-10-27T00:00:00Z', 'y')").run();
    v = judge(w, p); ok(!v.pass && /has no alternate_tested_at/.test(v.observed), "the capability row alone is not enough: the control stamp is missing", v);
    w.prepare("UPDATE control_registry SET alternate_tested_at = '2026-10-27T00:00:00Z' WHERE control = 'breach-doctor-switch'").run();
    v = judge(w, p); ok(v.pass && v.observed === "ok", "the stamp and the playbook capability row together pass it", v);
  }
  // a world without the doctor's rows gets none created; a closed issue is not rewritten
  const w2 = applied({ doctorRow: true });
  ok(w2.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === 0 && w2.prepare("SELECT COUNT(*) n FROM control_registry").get().n === 0 && w2.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'issue-%'").get().n === 0, "no issue, contract or switch row exists: none is created");
  const w3 = world({ doctorRow: true, doctorIssue: true });
  w3.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 1000397").run();
  if (!SKIP) w3.exec(body);
  ok(issue(w3).description === OLD_DESC && contract(w3).verify_probe === OLD_PROBE, "an issue that was closed before the file applied is left alone (description and contract)");
}

// ---- re-run is a no-op ----
{
  const w = applied();
  if (!SKIP) {
    const once = dump(w);
    w.exec(body);
    ok(dump(w) === once, "applying the file twice changes nothing");
    const w2 = applied({ doctorRow: true, doctorIssue: true });
    const once2 = dump(w2);
    w2.exec(body);
    ok(dump(w2) === once2, "and twice over the doctor rows (spof row, issue 1000397, its contract, the switch row) changes nothing");
  } else ok(false, "skipped: the pre-change state has no file to re-run");
}

// ---- rollback ----
{
  const w0 = world({ doctorRow: true, doctorIssue: true });
  const before = ["agent_issues", "control_registry"].map((t) => JSON.stringify(w0.prepare("SELECT * FROM " + t + " ORDER BY 1").all())).join("\n") + JSON.stringify(w0.prepare("SELECT * FROM remediation_contracts ORDER BY 1").all());
  const w = w0;
  if (!SKIP) w.exec(body);
  if (!SKIP) {
    w.prepare("INSERT INTO spof_registry (component, critical_path, alternate_path, evidence) VALUES ('other', 'x', 'y', 'z')").run();
    w.exec(rollback.split(/;\s*/).filter(Boolean).join(";\n") + ";");
    const after = ["agent_issues", "control_registry"].map((t) => JSON.stringify(w.prepare("SELECT * FROM " + t + " ORDER BY 1").all())).join("\n") + JSON.stringify(w.prepare("SELECT * FROM remediation_contracts ORDER BY 1").all());
    ok(after === before, "Rollback restores the issue description, the issue contract (precondition, action, probe) and the switch row exactly as the doctor migration wrote them");
    const r = w.prepare("SELECT alternate_path, alternate_tested_at, issue_id FROM spof_registry WHERE component = ?").get(COMP);
    ok(/^planned:/.test(r.alternate_path) && r.alternate_tested_at === null && r.issue_id === 1000300, "Rollback returns the row to a planned alternate and keeps its issue_id", r);
    ok(w.prepare("SELECT COUNT(*) n FROM spof_alternate_probes").get().n === 0 && w.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0 && w.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n === 0 && w.prepare("SELECT COUNT(*) n FROM capability_ledger").get().n === 0, "Rollback removes the probe, the failure mode, its detector and the capability");
    ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 2 && w.prepare("SELECT COUNT(*) n FROM spof_registry WHERE component = 'other'").get().n === 1, "and leaves the decision_log row and unrelated rows");
  } else ok(false, "skipped: nothing to roll back in the pre-change state");
}

console.log("breach-doctor-watch (migration): " + pass + " passed, " + fail + " failed" + (SKIP ? " (pre-change run: failures are expected)" : ""));
process.exit(fail ? 1 : 0);
