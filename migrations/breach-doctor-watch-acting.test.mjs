// BREACH-DOCTOR-WATCH-2 offline suite: applies migrations/2026-10-26-breach-doctor-watch3-acting.sql on SQLite (node:sqlite) over a fixture shaped like the live rows it touches (read 2026-10-26T12:32Z).
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback), deletes and drops nothing, never writes alternate_tested_at or last_exercised_at (only the drill of jobBreachDoctorWatch does,
// after it has seen a tick row with source=watch), states no window in hours or days, and every UPDATE is guarded by the text it replaces; the anchors it replaces are the texts the earlier migration
// (2026-10-26-breach-doctor-watch.sql) wrote; applied, it adds the capability row breach-doctor:second-path-playbooks (half of the closing probe of agent_issues 1000397), corrects the control_registry
// breach-doctor-switch and spof_registry doctor-tick alternate_path texts, appends one paragraph to the issue (which stays OPEN), rewrites the contract's precondition and action but not its probe, adds the failure
// mode breach-doctor-second-path-undrilled with its fm- detector and writes one decision_log row; the closing probe of the issue still FAILS after this file (no alternate_tested_at) and passes only when the drill
// has stamped the control row, so neither the migration nor the stamp alone closes the issue; the detector reads 1 only for an armed doctor whose second path has not verified a run in 1560 minutes; a replay
// changes nothing; a guard leaves a row someone rewrote alone; the Rollback restores the texts and removes the rows exactly (the decision_log row stays: append-only).
// Run: node migrations/breach-doctor-watch-acting.test.mjs     (BDWAM_SKIP=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "2026-10-26-breach-doctor-watch3-acting.sql");
const sql = readFileSync(FILE, "utf8");
const prev = readFileSync(join(here, "2026-10-26-breach-doctor-watch.sql"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.BDWAM_SKIP === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

// ---- static
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 500 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing (so no BACKUP table is needed)");
ok(!/DELETE\s+FROM\s+decision_log/i.test(rollback) && !/UPDATE\s+decision_log/i.test(rollback), "the Rollback never deletes or updates decision_log rows (append-only)");
ok(!/alternate_tested_at\s*=/i.test(body + rollback) && !/last_exercised_at\s*=/i.test(body + rollback) && !/SET\s+reviewed_at/i.test(body), "the file never writes alternate_tested_at, last_exercised_at or reviewed_at (only a verified drill stamps)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?|h)\b/i.test(body), "no window, cadence or SLA is stated in hours or days in the statements");
ok(body.split(";").filter((x) => /UPDATE\s/i.test(x)).every((x) => /\binstr\(/.test(x)), "every UPDATE is guarded by the text it replaces");
ok(/WHERE NOT EXISTS \(SELECT 1 FROM decision_log WHERE action LIKE 'BREACH-DOCTOR-WATCH-2:%'\)/.test(body) && (body.match(/INSERT INTO decision_log/g) || []).length === 1, "one decision_log INSERT, guarded by its own action prefix");
ok((body.match(/INSERT OR IGNORE INTO (capability_ledger|failure_modes|remediation_contracts)/g) || []).length === 3, "the three row inserts are INSERT OR IGNORE");
ok(/BREACH-DOCTOR-WATCH-2/.test(sql) && !/watch-acting\.sql/.test(sql), "the file name used inside it is the real one (sorts after the earlier watch files)");
ok("2026-10-26-breach-doctor-watch.sql" < "2026-10-26-breach-doctor-watch2-probe.sql" && "2026-10-26-breach-doctor-watch2-probe.sql" < "2026-10-26-breach-doctor-watch3-acting.sql", "the file name sorts after the two earlier watch migrations, so a rebuild from scratch ends in the corrected texts");

// ---- the live shapes (read 2026-10-26T12:32Z)
const COMP = "breach doctor tick (qnfo-fleet-control */10)";
const ISSUE_TITLE = "BREACH-DOCTOR-WATCH-1: the breach doctor has one runner, so qnfo-cloud-ops gets a watch that acts when the doctor stops ticking";
const OLD_CTRL = "qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, 1.39.0, built) reads the same switch and writes nothing while it is off, but runs no playbook yet, so this alternate stays untested until the acting half of issue BREACH-DOCTOR-WATCH-1 lands";
const CTRL_FULL = "per-rule stop (breach_playbooks.enabled = 0), automatic demotion to measure after 2 failures in 24 hours, every applied action carries its revert_sql; " + OLD_CTRL;
const CTRL_EVID = "new loop 2026-10-26: reversible actions only | BREACH-DOCTOR-WATCH-1 2026-10-26: alternate_path now names the built job (qnfo-cloud-ops 1.39.0 jobBreachDoctorWatch) and leaves the alternate untested until the acting half of issue BREACH-DOCTOR-WATCH-1 lands";
const OLD_SPOF_TAIL = "It makes no model call and runs no playbook: it notices and reports the stall, the diagnosis path itself keeps one runner, and the acting half (running the validated per-issue playbooks when the tick is stale) stays open as issue BREACH-DOCTOR-WATCH-1.";
const SPOF_FULL = "qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, qnfo-cloud-ops 1.39.0): on every 10-minute tick of a different worker and a different cron it reads the newest breach_diagnosis_events tick, writes metric doctor_tick_age_min from it and, when the age passes 30 minutes, files one deduped issue \"BREACH-DOCTOR-1: doctor stalled (watch)\". " + OLD_SPOF_TAIL;
const SPOF_EVID = "new 2026-10-26 | BREACH-DOCTOR-WATCH-1 2026-10-26 (agent_issues 1000266): alternate_path recorded with the job that implements it";
const OLD_PRE = "BREACH-DOCTOR-WATCH-1 (qnfo-cloud-ops 1.39.0) detects, measures and reports a stalled doctor tick but runs no playbook, so the diagnosis path still has one runner";
const OLD_ACT = "a session adds the playbook branch to jobBreachDoctorWatch in qnfo-cloud-ops (the detect and report half is deployed) and the control_alternate_probes row for breach-doctor-switch, the stale-PR lane merges it and the canonical deploy ships it";
const CLOSING_PROBE = "SELECT 'ok' AS expected, CASE WHEN (SELECT alternate_tested_at FROM control_registry WHERE control = 'breach-doctor-switch') IS NULL THEN 'control_registry breach-doctor-switch has no alternate_tested_at, so no drill has read an alternate that acts when the doctor tick stops' WHEN NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'breach-doctor:second-path-playbooks') THEN 'capability_ledger has no breach-doctor:second-path-playbooks row, so the watch does not run the per-issue playbooks yet' ELSE 'ok' END AS observed";
const OLD_DESC = "Charter pillar: autonomy. spof_registry holds the doctor tick row: one cron slot and one runner. Doer: a session.\nScope narrowed 2026-10-26 by the BREACH-DOCTOR-WATCH-1 package (qnfo-cloud-ops 1.39.0, migrations/2026-10-26-breach-doctor-watch.sql). DELIVERED: the detect, measure and report half. STILL OPEN: the acting half. When the tick is stale the watch runs the same validated per-issue playbooks (the S1 validators) and records every action in breach_diagnoses, and a drill reads that alternate and stamps alternate_tested_at on control_registry breach-doctor-switch (a control_alternate_probes row for the switch). The doer is unchanged. Definition of done (the closing probe of this issue): control_registry breach-doctor-switch has an alternate_tested_at and capability_ledger holds breach-doctor:second-path-playbooks, which the change that gives the watch its playbook branch writes in its own migration.";
// the anchors the file replaces are the texts the earlier migration wrote
for (const [name, t] of [["control_registry alternate_path", OLD_CTRL], ["spof_registry tail", OLD_SPOF_TAIL], ["contract precondition", OLD_PRE], ["contract action", OLD_ACT], ["closing probe", CLOSING_PROBE]]) {
  ok(prev.includes(t.replace(/'/g, "''")), "the fixture " + name + " is the text of migrations/2026-10-26-breach-doctor-watch.sql");
}
ok(sql.includes(OLD_CTRL.replace(/'/g, "''")) && sql.includes(OLD_SPOF_TAIL.replace(/'/g, "''")) && sql.includes(OLD_PRE.replace(/'/g, "''")) && sql.includes(OLD_ACT.replace(/'/g, "''")), "this file's guards and its Rollback carry the same four texts");

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, disposition TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE spof_registry (component TEXT PRIMARY KEY, critical_path TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, next_due_at TEXT, last_verdict TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only'); END;`);
  if (o.ledger !== false) w.exec("CREATE TABLE breach_diagnosis_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, event TEXT)");
  w.prepare("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, alternate_tested_at, evidence, issue_id) VALUES ('breach-doctor-switch', 'ops_config breach_doctor', 'kill-switch', 'keep', ?, NULL, ?, 1000397)").run(o.ctrl === undefined ? CTRL_FULL : o.ctrl, CTRL_EVID);
  w.prepare("INSERT INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES (?, 'unowned breach -> diagnosis -> allowlisted action -> verified close', ?, NULL, ?, 1000397)").run(COMP, o.spof === undefined ? SPOF_FULL : o.spof, SPOF_EVID);
  w.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('breach-doctor:second-path-watch', 'BREACH-DOCTOR-WATCH-1', '2026-10-26T11:17:25Z', 'detect and report')").run();
  if (o.issue !== false) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (1000397, ?, ?, 'session', ?, 1792000000000, 1792000000000)").run(ISSUE_TITLE, o.desc === undefined ? OLD_DESC : o.desc, o.status || "open");
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, last_verdict) VALUES ('issue-1000397', 1000397, ?, ?, ?, 'd1-query', 1000, 'qnfo-fleet-control', 1, 'active', 'breach-doctor', 'fail')").run(o.pre === undefined ? OLD_PRE : o.pre, OLD_ACT, CLOSING_PROBE);
  }
  w.prepare("INSERT INTO ops_config (key, value) VALUES ('breach_doctor', ?)").run(o.cfg === undefined ? "on" : o.cfg);
  return w;
}
const applied = (o) => { const w = world(o); if (!SKIP) w.exec(body); return w; };
const dump = (w, tables) => (tables || ["control_registry", "spof_registry", "capability_ledger", "agent_issues", "remediation_contracts", "failure_modes", "ops_config"]).map((t) => t + ":" + JSON.stringify(w.prepare("SELECT * FROM " + t + " ORDER BY 1").all())).join("\n");
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const observed = (w, probe) => { const r = w.prepare(probe).get(); return r && r.observed; };

// ---- applied
{
  const w = applied();
  const cap = one(w, "SELECT * FROM capability_ledger WHERE capability = 'breach-doctor:second-path-playbooks'");
  ok(cap && /^BREACH-DOCTOR-WATCH-2 /.test(cap.provenance) && /FLEET_CONTROL service binding/.test(cap.prerequisites) && /^unmeasured until the first drill/.test(cap.reliability) && cap.last_exercised_at === null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cap.acquired_at || "") && cap.evidence.length > 40, "the capability row exists: provenance, prerequisites, reliability unmeasured until the first drill, last_exercised_at NULL", cap);
  const c = one(w, "SELECT alternate_path, alternate_tested_at, evidence FROM control_registry WHERE control = 'breach-doctor-switch'");
  ok(c && c.alternate_tested_at === null && !/runs no playbook yet/.test(c.alternate_path) && /POST \/breach-doctor\/run/.test(c.alternate_path) && /FLEET_CONTROL service binding/.test(c.alternate_path) && /source=watch/.test(c.alternate_path) && c.alternate_path.startsWith("per-rule stop (breach_playbooks.enabled = 0)"), "control_registry breach-doctor-switch names the acting half, keeps the rest of its text, and is NOT stamped", c);
  ok(c && c.evidence.startsWith(CTRL_EVID) && / \| BREACH-DOCTOR-WATCH-2 2026-10-26: alternate_path now names the acting half/.test(c.evidence), "its evidence is kept and one clause appended");
  const s = one(w, "SELECT alternate_path, alternate_tested_at, evidence FROM spof_registry WHERE component = ?", COMP);
  ok(s && s.alternate_tested_at === null && !/runs no playbook/.test(s.alternate_path) && !/stays open as issue/.test(s.alternate_path) && /POST \/breach-doctor\/run/.test(s.alternate_path) && /a daily drill/.test(s.alternate_path) && s.alternate_path.startsWith("qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, qnfo-cloud-ops 1.39.0)"), "spof_registry doctor tick row: the clause that said the acting half stays open is corrected, the rest is kept, not stamped", s);
  ok(s && s.evidence.startsWith(SPOF_EVID) && /BREACH-DOCTOR-WATCH-2 2026-10-26 \(agent_issues 1000397\)/.test(s.evidence), "its evidence is kept and one clause appended");
  const i = one(w, "SELECT status, description FROM agent_issues WHERE id = 1000397");
  ok(i.status === "open" && i.description.startsWith(OLD_DESC) && (i.description.match(/BREACH-DOCTOR-WATCH-2 2026-10-26 \(qnfo-fleet-control 0\.54\.0/g) || []).length === 1 && /DELIVERED: the acting half/.test(i.description) && /stays open until that first drill/.test(i.description), "issue 1000397 stays OPEN with its text kept and one paragraph appended", i.status);
  const k = one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000397'");
  ok(k && k.verify_probe === CLOSING_PROBE && k.status === "active" && k.max_attempts === 1000 && !/runs no playbook/.test(k.precondition) && /BREACH-DOCTOR-WATCH-2/.test(k.precondition) && /first drill/.test(k.action) && k.last_verdict === "fail", "the contract's precondition and action stop saying the branch is unbuilt, its probe and verdict are untouched", k);
  const fm = one(w, "SELECT * FROM failure_modes WHERE fm_key = 'breach-doctor-second-path-undrilled'");
  ok(fm && fm.issue_id === 1000397 && fm.detector.startsWith("fm-breach-doctor-second-path-undrilled:") && fm.probe_class === "fm-breach-doctor-second-path-undrilled" && fm.root_cause.length > 80 && fm.remediation.length > 80 && fm.trigger_condition && fm.symptom && fm.blast_radius, "the failure mode row has root cause, remediation, detector and trigger", fm && fm.fm_key);
  const d = one(w, "SELECT * FROM remediation_contracts WHERE class = 'fm-breach-doctor-second-path-undrilled'");
  ok(d && d.status === "active" && d.module === "failure-mode" && d.verify_transport === "d1-query" && d.issue_id === null && d.escalate_to === "qnfo-fleet-control", "its detector is an active d1-query failure-mode contract", d && d.class);
  const dl = all(w, "SELECT * FROM decision_log");
  ok(dl.length === 1 && /^BREACH-DOCTOR-WATCH-2:/.test(dl[0].action) && ["assumption", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => String(dl[0][k] || "").length > 3) && !/\d+ (hours?|days?)\b/.test(dl[0].predicted_outcome), "exactly one decision_log row with the real columns filled and a prediction in minutes", dl[0] && dl[0].action);
  ok(one(w, "SELECT COUNT(*) n FROM capability_ledger").n === 2 && one(w, "SELECT COUNT(*) n FROM failure_modes").n === 1, "nothing else was created");
  ok(one(w, "SELECT alternate_tested_at t FROM control_registry").t === null && one(w, "SELECT alternate_tested_at t FROM spof_registry").t === null && one(w, "SELECT COUNT(*) n FROM capability_ledger WHERE last_exercised_at IS NOT NULL").n === 0, "NO stamp of any kind was written (the drill writes them)");
}

// ---- the closing probe of the issue: the migration is half of it, the drill is the other half
{
  const w = world();
  ok(/no alternate_tested_at/.test(observed(w, CLOSING_PROBE) || ""), "before: the probe fails because no drill has stamped the switch");
  w.prepare("UPDATE control_registry SET alternate_tested_at = '2026-10-26T13:00:00Z' WHERE control = 'breach-doctor-switch'").run();
  ok(/capability_ledger has no breach-doctor:second-path-playbooks row/.test(observed(w, CLOSING_PROBE) || ""), "a stamp alone does not close it: the capability row is missing without this migration");
  const a = applied();
  ok(/no alternate_tested_at/.test(observed(a, CLOSING_PROBE) || "") || SKIP, "after the migration alone the probe still fails: the capability row exists and no drill has stamped", observed(a, CLOSING_PROBE));
  a.prepare("UPDATE control_registry SET alternate_tested_at = '2026-10-26T13:00:00Z' WHERE control = 'breach-doctor-switch'").run();
  ok(observed(a, CLOSING_PROBE) === "ok", "migration + the drill's stamp: the probe passes and the hourly remediation tick closes the issue", observed(a, CLOSING_PROBE));
}

// ---- the detector of the failure mode: expected 0, observed 1 only for an armed doctor whose second path has not verified a run for 1560 minutes
{
  const probe = one(applied(), "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-breach-doctor-second-path-undrilled'");
  ok(probe && /^SELECT '0' AS expected, /.test(probe.p) && !/;/.test(probe.p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma|replace)\b/i.test(probe.p) && /'-1560 minutes'/.test(probe.p) && !/hours?|days?/i.test(probe.p), "the detector is one read-only SELECT expecting 0, with its window in minutes");
  const P = probe ? probe.p : "SELECT '0' AS expected, '?' AS observed";
  const at = (w, minAgo, col) => w.prepare("UPDATE capability_ledger SET " + col + " = ? WHERE capability = 'breach-doctor:second-path-playbooks'").run(new Date(Date.now() - minAgo * 6e4).toISOString().slice(0, 19) + "Z");
  const w = applied();
  ok(observed(w, P) === "0", "a fresh capability row (acquired now, no drill yet) is inside the grace: 0", observed(w, P));
  at(w, 1559, "acquired_at"); ok(observed(w, P) === "0", "acquired 1559 minutes ago and never drilled: still 0");
  at(w, 1561, "acquired_at"); ok(observed(w, P) === "1", "acquired 1561 minutes ago and never drilled: 1 (the first drill never verified)", observed(w, P));
  at(w, 100, "last_exercised_at"); ok(observed(w, P) === "0", "a verified run 100 minutes ago: 0");
  at(w, 1561, "last_exercised_at"); ok(observed(w, P) === "1", "a verified run 1561 minutes ago: 1 (the daily drill plus the 120 minutes allowed has passed)");
  w.prepare("UPDATE ops_config SET value = 'off'").run(); ok(observed(w, P) === "0", "breach_doctor = off: the second path is not expected to run: 0");
  w.prepare("UPDATE ops_config SET value = 'measure'").run(); ok(observed(w, P) === "1", "measure still counts as armed: 1");
  w.prepare("DELETE FROM ops_config").run(); ok(observed(w, P) === "1", "a missing switch row reads as measure: 1");
  w.exec("DROP TABLE breach_diagnosis_events"); ok(observed(w, P) === "0", "no doctor ledger (a failed doctor migration): 0, there is nothing to run");
  const w2 = applied(); w2.prepare("DELETE FROM capability_ledger WHERE capability = 'breach-doctor:second-path-playbooks'").run(); ok(observed(w2, P) === "0", "no capability row: 0");
}

// ---- guards: a row someone rewrote is left alone, a closed issue is not edited, replay changes nothing
{
  const w = applied({ ctrl: "a later hand-written alternate", spof: "another alternate", pre: "someone rewrote this" });
  ok(one(w, "SELECT alternate_path p FROM control_registry").p === "a later hand-written alternate" && one(w, "SELECT alternate_path p FROM spof_registry").p === "another alternate" && one(w, "SELECT precondition p FROM remediation_contracts WHERE class = 'issue-1000397'").p === "someone rewrote this", "texts that are not the ones the file replaces are left alone", dump(w, ["control_registry", "spof_registry"]).slice(0, 200));
  ok(one(w, "SELECT evidence e FROM control_registry").e === CTRL_EVID && one(w, "SELECT evidence e FROM spof_registry").e === SPOF_EVID, "and their evidence is not appended to either");
  const c = applied({ status: "closed" });
  ok(one(c, "SELECT description d FROM agent_issues").d === OLD_DESC && one(c, "SELECT precondition p FROM remediation_contracts WHERE class = 'issue-1000397'").p === OLD_PRE, "a closed issue keeps its description and contract text");
  const n = applied({ issue: false });
  ok(one(n, "SELECT COUNT(*) n FROM agent_issues").n === 0 && one(n, "SELECT COUNT(*) n FROM capability_ledger").n === 2, "with no issue row the file still applies and edits nothing it cannot find");
  const e = applied({ ctrl: null });
  ok(one(e, "SELECT alternate_path p FROM control_registry").p === null, "a control row with no alternate_path is not given one");
}
{
  const w = applied(); const first = dump(w) + JSON.stringify(all(w, "SELECT * FROM decision_log").map((r) => r.id));
  if (!SKIP) w.exec(body);
  ok(dump(w) + JSON.stringify(all(w, "SELECT * FROM decision_log").map((r) => r.id)) === first && one(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "a replay changes nothing and adds no second decision_log row");
}

// ---- Rollback restores the texts and removes the rows, and leaves the decision_log row
{
  const pre = dump(world());
  const w = applied();
  ok(SKIP || dump(w) !== pre, "applied, the state differs from the pre-state");
  w.exec(rollback.replace(/;\s*$/, ""));
  ok(dump(w) === pre, "after the Rollback the registry rows, the issue, the contract, the failure modes and the capabilities equal the pre-state exactly", SKIP ? undefined : dump(w).split("\n").filter((l, i) => l !== pre.split("\n")[i]).map((l) => l.slice(0, 160)));
  ok(one(w, "SELECT COUNT(*) n FROM decision_log").n === (SKIP ? 0 : 1), "the decision_log row stays (append-only)");
  w.exec(body);
  ok(one(w, "SELECT COUNT(*) n FROM failure_modes").n === 1 && one(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "re-applying after a Rollback restores the rows without a second decision_log row");
}

console.log("breach-doctor-watch-acting (migration): " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
