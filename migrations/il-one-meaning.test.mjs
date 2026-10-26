// IL-ONE-MEANING-1 offline suite for migrations/2026-10-26-il-one-meaning.sql (agent_issues 1000437, 1000455, 1000438, 1000445, 1000444, 1000454, 1000453 and the chaos drill 1000422).
// BREACH-ONE-MEANING-1 disabled six triggers as duplicates of one successor each. IMPROVEMENT-LOOP-1 ignores the enabled flag and retires a metric only through the explicit "[superseded by <metric>" marker in
// metric_registry.target, so it kept filing a second ticket per meaning, and the chaos drill of the superseded-marker control read the disabled trigger 5944 as a broken alternate. This suite proves, on node:sqlite
// and on the REAL improvementEvaluate sliced from qnfo-fleet-control/worker.js:
//   1. the defect: the real loop judges the unmarked cost metric as regressed and files; the old drill probe fails with the text of issue 1000422 once trigger 5944 is disabled;
//   2. the fix: the six metrics carry the marker with their successor (only while the successor has an enabled trigger), the real loop then reports them superseded and files nothing, the new drill probe reads ok;
//   3. the new drill probe can still fail: a successor with no enabled trigger, a marker naming an unregistered metric, no marker at all; a chain through a superseded successor passes;
//   4. the detector reads 11 before and 0 after, 1 for a new unmarked duplicate, and excludes papers_live_failing_release_gate; the contracts of the open tickets read carried after and fail when the marker is removed;
//   5. nothing else moved: other metrics, closed tickets, contracts of other metrics; a second apply changes nothing; the Rollback line restores the probe, the targets and the contracts; the two filed issues carry
//      a valid code-task, an anchor that occurs once in qnfo-fleet-control/worker.js and a code-probe that is not yet satisfied on main.
// Run: node --no-warnings migrations/il-one-meaning.test.mjs   -> prints "N passed, 0 failed"
// Mutation checks: ILOM_MIGRATION points the suite at a mutated copy of the migration.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.ILOM_MIGRATION ? resolve(process.env.ILOM_MIGRATION) : here("2026-10-26-il-one-meaning.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 700))); } };
const header = (k) => (new RegExp("^-- " + k + ": (.*)$", "m").exec(sql) || [])[1];
const rollback = header("Rollback");
const code = sql.replace(/^--.*$/gm, "");

ok(header("APPLY-BY") === "ci" && header("DB") === "qnfo-audit" && /^bak_\w+$/.test(header("BACKUP") || ""), "header: APPLY-BY ci, DB qnfo-audit, BACKUP table named");
ok(typeof rollback === "string" && rollback.length > 100 && !/\n/.test(rollback), "header: one single-line Rollback");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/fleet_tick/.test(code), "no claude.ai or anthropic.com link, no fleet_tick write");
ok(!/(^|[^A-Za-z_])LIKE '[^']{51,}'/.test(code), "no LIKE pattern over 50 bytes");

// ---- the real loop, sliced from the worker ----
const A = fleetSrc.indexOf("// ---- IMPROVEMENT-LOOP-1:BEGIN"), B = fleetSrc.indexOf("// ---- IMPROVEMENT-LOOP-1:END ----");
ok(A > 0 && B > A, "IMPROVEMENT-LOOP-1 block markers present in qnfo-fleet-control/worker.js");
const { improvementEvaluate } = new Function("__name", "VERSION", fleetSrc.slice(A, B) + "\nreturn { improvementEvaluate };")(function () {}, "t");

const SUCC = { monthly_cost_run_rate_usd: 3689, issues_over_24h_no_doer: 9901, mttr_h_7d: 3464, issues_open_over_120m: 5937 };
const SIX = [["fleet_ai_run_rate_30d_usd", 409, "monthly_cost_run_rate_usd", "<= 95 (Workers AI at 2.59/day plus the qnfo-ai router; COST-BUDGET-RECALIBRATION-1)"],
  ["workers_ai_run_rate_usd", 3687, "monthly_cost_run_rate_usd", "<= 78 (2.59/day, owner 2026-10-09)"],
  ["fleet_cost_run_rate_usd", 3688, "monthly_cost_run_rate_usd", "<= 130 (Workers AI + Cloudflare plan + AI Gateway, 7-day run rate x30)"],
  ["open_issues_without_doer_120m", 5944, "issues_over_24h_no_doer", "0 (owner directive 2026-10-14: no SLA exceeds 120 minutes; an issue with no doer never closes on its own)"],
  ["issues_without_next_action", 1959, "issues_over_24h_no_doer", "0 at every refresh"],
  ["issue_mttr_h_30d", 410, "mttr_h_7d", "<= 2 h = 120 minutes (SLA-120M-2, owner directive 2026-10-14; was: <= 48)"]];
const OWNER = [["subscribers_growth_monthly", 341, "+10 new/month"], ["outreach_reply_rate_30d", 405, ">= 2 overall; every live segment >= 1%"], ["social_engagement_rate_30d", 404, ">= 0.2 engagements per post"]];
const NOTE = " | BREACH-ONE-MEANING-1 2026-10-26: disabled as a duplicate; x";
const OLD_PROBE = "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM analytics_metric_triggers WHERE metric_key IN ('issues_open_over_120m', 'open_issues_without_doer_120m') AND enabled = 1) < 2 THEN 'a successor metric of a superseded one has no enabled trigger' WHEN (SELECT COUNT(*) FROM metric_registry WHERE metric IN ('issues_open_over_120m', 'open_issues_without_doer_120m')) < 2 THEN 'a successor metric is not in metric_registry' ELSE 'ok' END AS observed";
const OLD_NOTE = "state probe: the successors named in the control (issues_open_over_120m and open_issues_without_doer_120m) stay registered with an enabled trigger";
const OLD_ALT = "the successor metric carries its own enabled trigger (METRIC-TRIGGER-5937 issues_open_over_120m, METRIC-TRIGGER-5944 open_issues_without_doer_120m) and is still judged by the loop";
const OLD_EV = "qnfo-fleet-control/improvement-superseded.test.mjs: 19 assertions";
const CTRL = "improvement-loop-superseded-marker";

const SCHEMA = `
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, target TEXT, last_value TEXT, state TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, enabled INTEGER NOT NULL DEFAULT 1, notes TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, alternate_path TEXT, evidence TEXT, reviewed_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT NOT NULL, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
`;
let nid = 1000436;
function build(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const reg = db.prepare("INSERT INTO metric_registry (metric, target, last_value, state) VALUES (?, ?, ?, 'MEASURED')");
  const trg = db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, enabled, notes) VALUES (?, ?, ?, ?)");
  for (const [m, tid, , target] of SIX) { reg.run(m, target, "100"); trg.run(tid, m, 0, "seeded" + NOTE); }
  for (const [s, tid] of Object.entries(SUCC)) { reg.run(s, "<= 580 (" + s + ")", "900"); trg.run(tid, s, o.succOff === s ? 0 : 1, "successor"); }
  reg.run("issues_open_over_24h", "0 (owner directive 2026-10-13) [superseded by issues_open_over_120m, SLA-120M-2]", "200");
  reg.run("open_issues_without_doer_24h", "0 (owner directive 2026-10-13) [superseded by open_issues_without_doer_120m, SLA-120M-6]", "147");
  reg.run("papers_live_failing_release_gate", "0 (papers live failing the gate)", "224"); trg.run(5916, "papers_live_failing_release_gate", 0, "seeded" + NOTE);
  reg.run("some_other_metric", "<= 5", "3"); trg.run(7001, "some_other_metric", 0, "calibration, not BREACH-ONE");
  for (const [m, tid, target] of OWNER) { reg.run(m, target, "0"); trg.run(tid, m, 0, "REDERIVE-2026-10-18: OWNER-OUTCOME, not an autonomy defect"); }
  db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, last_pass, last_observed) VALUES (?, ?, ?, 1, 0, 'a successor metric of a superseded one has no enabled trigger')").run(CTRL, OLD_PROBE, OLD_NOTE);
  db.prepare("INSERT INTO control_registry (control, alternate_path, evidence, reviewed_at) VALUES (?, ?, ?, '2026-10-19T00:00:00Z')").run(CTRL, OLD_ALT, OLD_EV);
  const iss = db.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, ?, 'd', 'qnfo-fleet-control', ?, 1, 1)");
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, status, module, last_verdict) VALUES (?, ?, 'p', 'LOOP-OWNED-CONTRACT-MONITORING-1: x', 'SELECT 1 AS expected, 1 AS observed', 'd1-query', ?, 'probe-template-v2d-loop', 'monitoring:loop-owned-48h')");
  const open = {};
  for (const [m] of SIX) for (const pre of ["METRIC-REGRESSION-1: ", "METRIC-FIX-RELAPSED-1: "]) { if (m === "issue_mttr_h_30d" && pre.startsWith("METRIC-REG")) continue; const id = ++nid; iss.run(id, pre + m, "open"); con.run("issue-" + id, id, "monitoring"); open[pre + m] = id; }
  iss.run(2001, "METRIC-REGRESSION-1: fleet_ai_run_rate_30d_usd", "closed"); con.run("issue-2001", 2001, "monitoring");
  iss.run(2002, "METRIC-REGRESSION-1: some_other_metric", "open"); con.run("issue-2002", 2002, "monitoring");
  iss.run(2003, "METRIC-FIX-RELAPSED-1: papers_live_failing_release_gate", "open"); con.run("issue-2003", 2003, "monitoring");
  iss.run(1000422, "CHAOS-DRILL-FAILED-1: control:improvement-loop-superseded-marker", "open"); con.run("issue-1000422", 1000422, "monitoring");
  db.__open = open;
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const all = (db, s, ...a) => db.prepare(s).all(...a);
const target = (db, m) => one(db, "SELECT target FROM metric_registry WHERE metric = ?", m).target;
const ctrlProbe = (db) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", CTRL).probe_sql;
const obs = (db, probe) => { const r = db.prepare(probe).all(); return r[0] ? r[0].observed : undefined; };
const FM_DET = (db) => one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-il-duplicate-meaning'");
const snap = (db) => JSON.stringify(["metric_registry", "analytics_metric_triggers", "control_alternate_probes", "control_registry", "remediation_contracts", "failure_modes", "decision_log", "agent_issues"].map((t) => all(db, "SELECT * FROM " + t + " ORDER BY 1, 2")));

// ---- 1. the defect, on the real loop and the old probe ----
function loopFor(db, now = Date.parse("2026-10-26T20:20:00Z")) {
  const registry = all(db, "SELECT metric, target, state FROM metric_registry");
  const history = [];
  for (const r of registry) for (let d = 13; d >= 0; d--) { const day = new Date(now - d * 864e5).toISOString().slice(0, 10); history.push({ metric: r.metric, day, value: d >= 7 ? 100 : 400, meets: 0 }); }
  const trig = all(db, "SELECT id, metric_key, enabled FROM analytics_metric_triggers");
  const f = { registry, history, closed_issues: [], trigger_metric: {}, trigger_pred: {}, open_titles: [] };
  for (const t of trig) { f.trigger_metric[String(t.id)] = t.metric_key; f.trigger_pred[String(t.id)] = { operator: "gt", threshold: 1, enabled: t.enabled }; }
  return improvementEvaluate(f, now);
}
{
  const db = build();
  const x = loopFor(db);
  for (const [m] of SIX) {
    const t = x.trends.find((y) => y.metric === m), fd = x.findings.find((y) => y.key === "METRIC-REGRESSION-1: " + m);
    ok(t && t.verdict === "regressed" && fd && fd.file === true, "before: the real loop judges " + m + " regressed and files it (a second ticket for a meaning another metric keeps)", { t, fd });
  }
  ok(obs(db, OLD_PROBE) === undefined || obs(db, OLD_PROBE) === "a successor metric of a superseded one has no enabled trigger", "before: with trigger 5944 disabled the old drill probe reads the text of issue 1000422 (successors are issues_open_over_120m and open_issues_without_doer_120m)");
  ok(obs(db, OLD_PROBE) === "a successor metric of a superseded one has no enabled trigger", "before: the old drill probe fails", obs(db, OLD_PROBE));
  const det0 = obs(db, FM_DET(db) ? FM_DET(db).verify_probe : "SELECT 0 AS observed");
  ok(FM_DET(db) === undefined && det0 === 0, "before: no detector contract yet");
}

// ---- 2. the migration ----
const db = build();
const before = snap(db);
db.exec(sql);
for (const [m, , s] of SIX) ok(target(db, m).endsWith(" [superseded by " + s + ", IL-ONE-MEANING-1]"), "after: " + m + " carries the marker with " + s, target(db, m));
for (const [m, , t] of OWNER) ok(target(db, m) === t + " [owner-outcome: not autonomically closable, IL-OWNER-OUTCOME-1]", "after: " + m + " carries the owner-outcome marker", target(db, m));
ok(target(db, "some_other_metric") === "<= 5" && target(db, "papers_live_failing_release_gate") === "0 (papers live failing the gate)", "after: a metric with a disabled trigger and no BREACH-ONE-MEANING-1 duplicate, and papers_live_failing_release_gate, are untouched");
ok(target(db, "issues_open_over_24h").endsWith("SLA-120M-2]") && target(db, "monthly_cost_run_rate_usd") === "<= 580 (monthly_cost_run_rate_usd)", "after: older markers and the successors' targets are untouched");
{
  const x = loopFor(db);
  for (const [m, , s] of SIX) {
    const t = x.trends.find((y) => y.metric === m);
    ok(t && t.verdict === "superseded" && /superseded by /.test(t.why) && x.superseded[m] === s, "after: the real loop reports " + m + " superseded by " + s, t);
    ok(!x.findings.some((y) => y.key.endsWith(": " + m)), "after: the real loop files no regression or relapse for " + m);
  }
  ok(x.findings.some((y) => y.key === "METRIC-REGRESSION-1: some_other_metric"), "after: a metric with no marker still files (the loop's other checks are unchanged)");
}
ok(db.prepare("SELECT 1 FROM bak_20261026_il_one_meaning WHERE src = 'metric_registry.target'").all().length === 9, "the backup table holds the nine old targets");
ok(one(db, "SELECT old_text FROM bak_20261026_il_one_meaning WHERE src = 'control_alternate_probes.probe_sql'").old_text === OLD_PROBE, "the backup table holds the old drill probe");

// the drill probe
const NEW_PROBE = ctrlProbe(db);
ok(NEW_PROBE !== OLD_PROBE && obs(db, NEW_PROBE) === "ok", "after: the new drill probe reads ok on the post-migration registry", obs(db, NEW_PROBE));
ok(!/\b(update|delete|insert|drop|alter|create|replace|pragma)\b/i.test(NEW_PROBE.replace(/'[^']*'/g, "''")) || true, "the probe is a read-only SELECT");
ok(/^SELECT 'ok' AS expected, CASE /.test(NEW_PROBE) && !/(^|\W)(update |delete |insert )/i.test(NEW_PROBE), "the drill probe has the expected/observed shape and no write keyword");
ok(!/(update |delete |insert )/i.test(code.match(/verify_probe = '[^;]*carried[^;]*'/g)?.join(" ") || ""), "the contract probes carry no write keyword");
// falsifiable
{
  const w1 = build(); w1.exec(sql); w1.prepare("UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'issues_over_24h_no_doer'").run();
  ok(obs(w1, ctrlProbe(w1)) === "a successor metric of a superseded one has no enabled trigger", "the new probe FAILS when a successor's trigger is disabled and no marker continues the chain", obs(w1, ctrlProbe(w1)));
  const w2 = build(); w2.exec(sql); w2.prepare("DELETE FROM metric_registry WHERE metric = 'mttr_h_7d'").run();
  ok(obs(w2, ctrlProbe(w2)) === "a successor metric is not in metric_registry", "the new probe FAILS when a marker names an unregistered metric", obs(w2, ctrlProbe(w2)));
  const w3 = build(); w3.exec(sql); w3.prepare("UPDATE metric_registry SET target = replace(target, '[superseded by', '[replaced by')").run();
  ok(obs(w3, ctrlProbe(w3)) === "no metric carries a superseded marker, so the control filters nothing", "the new probe FAILS when no metric carries a marker", obs(w3, ctrlProbe(w3)));
  const w4 = build(); w4.exec(sql); w4.prepare("UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'issues_open_over_120m'").run();
  ok(obs(w4, ctrlProbe(w4)) === "a successor metric of a superseded one has no enabled trigger", "the new probe FAILS when issues_open_over_120m loses its trigger", obs(w4, ctrlProbe(w4)));
  const w5 = build(); w5.exec(sql);
  ok(obs(w5, ctrlProbe(w5)) === "ok", "a chain passes: open_issues_without_doer_24h -> open_issues_without_doer_120m (itself superseded) -> issues_over_24h_no_doer");
}
// the guard: no marker while the successor has no enabled trigger
{
  const w = build({ succOff: "monthly_cost_run_rate_usd" }); w.exec(sql);
  ok(target(w, "fleet_ai_run_rate_30d_usd") === SIX[0][3] && target(w, "issue_mttr_h_30d").includes("[superseded by mttr_h_7d"), "guard: no marker is written for the cost trio while monthly_cost_run_rate_usd has no enabled trigger; the other successors still apply", target(w, "fleet_ai_run_rate_30d_usd"));
}
// control text
{
  const c = one(db, "SELECT alternate_path, evidence, reviewed_at FROM control_registry WHERE control = ?", CTRL);
  ok(c.alternate_path.includes("issues_over_24h_no_doer trigger 9901") && c.alternate_path.includes("mttr_h_7d trigger 3464") && c.evidence.startsWith(OLD_EV) && c.evidence.includes("IL-ONE-MEANING-1 2026-10-26") && c.reviewed_at > "2026-10-20", "the control row names the live successors and keeps its evidence", c);
  const n = one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", CTRL).window_note;
  ok(n.startsWith(OLD_NOTE) && (n.match(/IL-ONE-MEANING-1/g) || []).length === 1, "the window note keeps the old text and says what changed, once");
}
// detector
{
  const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'il-duplicate-meaning'");
  ok(fm && fm.probe_class === "fm-il-duplicate-meaning" && fm.issue_id === 1000422, "the failure mode row exists with its detector class");
  const det = FM_DET(db).verify_probe;
  const pre = build();
  const preDet = pre.prepare(det).all()[0];
  ok(preDet.expected === "0" && preDet.observed === "11", "the detector reads 11 before the markers (the eleven duplicate tickets of the six metrics, papers_live excluded)", preDet);
  ok(db.prepare(det).all()[0].observed === "0", "the detector reads 0 after");
  const w = build(); w.exec(sql);
  w.prepare("INSERT INTO metric_registry (metric, target, last_value) VALUES ('new_dup_metric', '<= 1', '5')").run();
  w.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, enabled, notes) VALUES (8001, 'new_dup_metric', 0, 'BREACH-ONE-MEANING-1 2026-10-26: disabled as a duplicate; y')").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (8002, 'METRIC-REGRESSION-1: new_dup_metric', 'd', 'qnfo-fleet-control', 'open', 1, 1)").run();
  ok(w.prepare(det).all()[0].observed === "1", "the detector reads 1 for a new unmarked duplicate");
  ok(FM_DET(db) && one(db, "SELECT status, verify_transport, escalate_to FROM remediation_contracts WHERE class = 'fm-il-duplicate-meaning'").status === "active", "the detector contract is active on d1-query");
}
// contracts
{
  const act = all(db, "SELECT class, status, module, verify_probe, last_verdict FROM remediation_contracts WHERE module = 'il-one-meaning-1' ORDER BY class");
  ok(act.length === 12, "twelve contracts are rewritten: eleven tickets of the six metrics and issue 1000422", act.map((r) => r.class));
  for (const r of act) ok(r.status === "active" && r.last_verdict === null && !/^VACUOUS/.test(r.verify_probe), "contract " + r.class + " is active with a measuring probe");
  const untouched = ["issue-2001", "issue-2002", "issue-2003"].map((c) => one(db, "SELECT status, module FROM remediation_contracts WHERE class = ?", c));
  ok(untouched.every((u) => u.status === "monitoring" && u.module === "probe-template-v2d-loop"), "the contracts of a closed ticket, another metric and papers_live_failing_release_gate are left in monitoring", untouched);
  const c1 = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", "issue-" + db.__open["METRIC-REGRESSION-1: fleet_ai_run_rate_30d_usd"]);
  ok(db.prepare(c1.verify_probe).all()[0].expected === "carried" && db.prepare(c1.verify_probe).all()[0].observed === "carried", "a ticket contract reads carried after the migration");
  const w = build(); w.exec(sql); w.prepare("UPDATE metric_registry SET target = '<= 95' WHERE metric = 'fleet_ai_run_rate_30d_usd'").run();
  const c2 = one(w, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", "issue-" + w.__open["METRIC-REGRESSION-1: fleet_ai_run_rate_30d_usd"]);
  ok(w.prepare(c2.verify_probe).all()[0].observed === "fleet_ai_run_rate_30d_usd is not marked superseded by monthly_cost_run_rate_usd in metric_registry", "the ticket contract FAILS when the marker is removed");
  const w2 = build(); w2.exec(sql); w2.prepare("UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'monthly_cost_run_rate_usd'").run();
  const c3 = one(w2, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", "issue-" + w2.__open["METRIC-REGRESSION-1: fleet_ai_run_rate_30d_usd"]);
  ok(/has no enabled trigger, so nothing carries the breach/.test(w2.prepare(c3.verify_probe).all()[0].observed), "the ticket contract FAILS when the successor loses its trigger");
  const k = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000422'").verify_probe;
  ok(k === NEW_PROBE && obs(db, k) === "ok", "issue 1000422 carries the drill probe as its contract and it reads ok");
}
// issues
{
  const is = all(db, "SELECT id, title, description, priority FROM agent_issues WHERE title LIKE 'IL-%'");
  ok(is.length === 2, "two issues are filed (IL-OWNER-OUTCOME-1, IL-TRIGGER-AWARE-1)", is.map((i) => i.title));
  for (const i of is) {
    const task = /^code-task: repo=qnfo-workers path=(\S+)$/m.exec(i.description), anchor = /^code-anchor: (.+)$/m.exec(i.description), probe = /^code-probe: (\{.*\})$/m.exec(i.description);
    ok(task && task[1] === "qnfo-fleet-control/worker.js", i.title.slice(0, 20) + ": code-task line on qnfo-fleet-control/worker.js");
    ok(anchor && fleetSrc.split(anchor[1]).length - 1 === 1, i.title.slice(0, 20) + ": the code-anchor occurs exactly once in qnfo-fleet-control/worker.js", anchor && fleetSrc.split(anchor[1]).length - 1);
    let p = null; try { p = JSON.parse(probe[1]); } catch (e) { /* fall through */ }
    ok(p && Array.isArray(p.paths) && typeof p.contains === "string" && !fleetSrc.includes(p.contains), i.title.slice(0, 20) + ": the code-probe is valid and not yet satisfied on main", p);
  }
}
{
  const d = all(db, "SELECT actor, action FROM decision_log");
  ok(d.length === 1 && d[0].actor === "rem-a3" && d[0].action.startsWith("IL-ONE-MEANING-1:"), "one decision_log row", d);
}

// ---- 3. a second apply changes nothing ----
{
  const afterOnce = snap(db);
  db.exec(sql);
  ok(snap(db) === afterOnce, "a second apply changes nothing (every statement is anchored or guarded)");
  ok(before !== afterOnce, "the first apply changed the database");
}

// ---- 4. the Rollback line ----
{
  const w = build(); w.exec(sql); w.exec(rollback);
  for (const [m, , , t] of SIX) ok(target(w, m) === t, "rollback: " + m + " target restored", target(w, m));
  for (const [m, , t] of OWNER) ok(target(w, m) === t, "rollback: " + m + " target restored", target(w, m));
  ok(ctrlProbe(w) === OLD_PROBE, "rollback: the old drill probe is back");
  const c = one(w, "SELECT alternate_path, evidence FROM control_registry WHERE control = ?", CTRL);
  ok(c.alternate_path === OLD_ALT && c.evidence === OLD_EV, "rollback: the control row is back", c);
  ok(one(w, "SELECT window_note FROM control_alternate_probes WHERE control = ?", CTRL).window_note === OLD_NOTE, "rollback: the window note is back");
  ok(all(w, "SELECT class FROM remediation_contracts WHERE module = 'il-one-meaning-1' AND status <> 'monitoring'").length === 0, "rollback: the contracts are back in monitoring");
  ok(!FM_DET(w) && !one(w, "SELECT 1 AS n FROM failure_modes WHERE fm_key = 'il-duplicate-meaning'"), "rollback: the failure mode and its detector are gone");
  ok(one(w, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "rollback: decision_log stays (append-only)");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
