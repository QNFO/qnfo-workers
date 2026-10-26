// VERIFICATION-DEFERRAL-HONEST-2 offline suite: replays migrations/2026-10-26-verification-deferral-honest-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the DoD text of the eight measured goals (copied from live qnfo-audit on 2026-10-26) says unmet instead
// of pending for a measured unmet condition and nothing else changes in it (a true wait, TP-6 'metric not measured yet', stays pending; TP-9, a 30-day window, is untouched); each new probe runs, reads 'unmet: ...'
// while the bound is missed and still reads its expected value when the bound is met; the contracts take the probe through the LIVE v_goal_dod text and are due; the VERIFICATION-DEFERRED-7D-1 closing probe of
// qnfo-fleet-control (RT_STILL_DEFERRED_SQL, read from worker.js) reads pending before and cleared after the verdict; issue-100064 is parked as monitoring only while it is open and deferred; a replay changes
// nothing; the decision is logged once; the Rollback line puts it all back.
// Run: node migrations/verification-deferral-honest-2.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-verification-deferral-honest-2.sql", import.meta.url), "utf8");
const fc = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 700))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");

// ---- the eight DoD texts as read from live qnfo-audit on 2026-10-26, and TP-9 (left alone)
const DOD = {
  "CONNECTION-ENGAGEMENT-1": "Done when this query reads its expected value: SELECT 'answered' AS expected, CASE WHEN (SELECT COUNT(*) FROM owner_questions WHERE kind='after-event' AND sent_at IS NOT NULL) >= 6 AND (SELECT last_value FROM metric_registry WHERE metric='owner_question_answer_rate_14d') GLOB '[0-9]*' AND CAST((SELECT last_value FROM metric_registry WHERE metric='owner_question_answer_rate_14d') AS REAL) >= 0.3 THEN 'answered' ELSE 'pending' END AS observed",
  "CONNECTION-LEDGER-1": "Done when this query reads its expected value: SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM calendar_feedback WHERE action = 'went' AND length(COALESCE(met, '')) > 0) THEN 'pending: no went answer with a name in calendar_feedback yet (owner action)' WHEN COALESCE((SELECT enabled FROM analytics_metric_triggers WHERE metric_key = 'ledger_people_seen_twice'), 0) = 1 AND EXISTS (SELECT 1 FROM owner_questions WHERE kind = 'follow-up') THEN '1' ELSE '0' END AS observed",
  "RADAR-TASTE-LEARN-1": "Done when this query reads its expected value: SELECT 'learning' AS expected, CASE WHEN (SELECT COUNT(*) FROM calendar_feedback) >= 5 AND (SELECT report FROM personal_radar ORDER BY scanned_at DESC LIMIT 1) LIKE '%- feedback rows used:%' AND ((SELECT report FROM personal_radar ORDER BY scanned_at DESC LIMIT 1) LIKE '%score -%' OR (SELECT report FROM personal_radar ORDER BY scanned_at DESC LIMIT 1) GLOB '*score [1-9]*') AND (SELECT MIN(ts) FROM calendar_feedback) <= datetime('now','-14 days') AND COALESCE((SELECT AVG(action='nope') FROM calendar_feedback WHERE ts >= datetime('now','-14 days')),0) <= COALESCE((SELECT AVG(action='nope') FROM calendar_feedback WHERE ts < datetime('now','-14 days')),1) AND (SELECT COUNT(*) FROM calendar WHERE plane='personal' AND source='personal-radar' AND created >= datetime('now','-7 days')) >= 1 THEN 'learning' ELSE 'pending' END AS observed",
  "TP-5-MEASURE-TO-ACT-1": "Done when this query reads ok or 1: SELECT 'ok' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='breach_code_task_pct') AS REAL) >= 30 AND (SELECT COUNT(*) FROM remediation_contracts WHERE status='needs-machine-'||'probe') = 0 THEN 'ok' ELSE 'pending: breach_code_task_pct ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric='breach_code_task_pct'),'?') || ', needs-machine probe contracts ' || (SELECT COUNT(*) FROM remediation_contracts WHERE status='needs-machine-'||'probe') END AS observed",
  "TP-6-DURABLE-EXECUTION-1": "Done when this query reads ok or 1: SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM metric_registry WHERE metric='ops_tool_budget_bail_7d' AND last_value IS NOT NULL) THEN 'pending: metric ops_tool_budget_bail_7d not measured yet (migrations/2026-10-12-ops-budget-bail-metric.sql, PR 942)' WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='ops_tool_budget_bail_7d') AS REAL) > 0 THEN 'pending: ops_tool_budget_bail_7d ' || (SELECT last_value FROM metric_registry WHERE metric='ops_tool_budget_bail_7d') WHEN COALESCE((SELECT current FROM fleet_budget WHERE node_class='cron_schedules'), 999) > 40 THEN 'pending: cron_schedules ' || COALESCE((SELECT current FROM fleet_budget WHERE node_class='cron_schedules'), 'unread') || ' (needs <= 40, TP-6 levers 2-4)' ELSE 'ok' END AS observed",
  "TP-7-REACH-SURVIVES-REVIEW-GATE-1": "Done when this query reads ok or 1: SELECT 'ok' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='subscribers_growth_monthly') AS REAL) >= 10 OR CAST((SELECT last_value FROM metric_registry WHERE metric='credibility_events_90d') AS REAL) >= 2 THEN 'ok' ELSE 'pending: subscribers_growth_monthly ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric='subscribers_growth_monthly'),'?') || ', credibility_events_90d ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric='credibility_events_90d'),'?') END AS observed",
  "GH-WEBHOOK-REGISTER-1": "Done when this query reads ok: SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'gh-webhook' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) > 0 THEN 'ok' ELSE 'pending: no gh-webhook delivery recorded in the last 120 minutes' END AS observed",
  "GH-APP-FLEET-2-CONVERSIONS-0": "Done when this query reads ok: SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(DISTINCT json_extract(meta, '$.caller')) FROM cloud_ops_events WHERE kind = 'gh-app-broker' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) >= 13 THEN 'ok' ELSE 'pending: workers served by the App broker in 24 hours: ' || (SELECT COUNT(DISTINCT json_extract(meta, '$.caller')) FROM cloud_ops_events WHERE kind = 'gh-app-broker' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) || ' of 13' END AS observed",
  "TP-9-DEPLOY-PATH-NO-LOCKOUT-1": "Done when this query reads ok or 1: SELECT '1' AS expected, CASE WHEN EXISTS (SELECT 1 FROM deployment_history WHERE status = 'failed' AND deployed_at >= '2026-10-06T06:30' AND (COALESCE(notes,'') LIKE '%10143%' OR COALESCE(notes,'') LIKE '%10144%')) THEN '0' WHEN datetime('now') < datetime('2026-11-05 06:30:00') THEN 'pending: 30-day window from 2026-10-06T06:30Z still open' WHEN COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'dangling_bindings'), '') <> '0' THEN 'pending: dangling_bindings census (T9.4) not registered or not 0' ELSE '1' END AS observed",
};
const CHANGED = Object.keys(DOD).filter((k) => k !== "TP-9-DEPLOY-PATH-NO-LOCKOUT-1");
const VIEW = `CREATE VIEW v_goal_dod AS
SELECT g.id, g.goal_key, g.status, g.goal_type, g.program_code, g.owner, g.priority,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN 'code-read'
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0 THEN 'd1-query'
  END AS transport,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN trim(substr(g.dod, instr(g.dod, '{"paths"')))
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0
         THEN replace(rtrim(trim(substr(g.dod, instr(g.dod, 'SELECT '))), ';'), ';', ',')
  END AS probe
FROM goals g
WHERE g.goal_type <> 'objective-revision'`;
const probeOf = (dod) => replace(dod);
function replace(dod) { return dod.slice(dod.indexOf("SELECT ")).trim().replace(/;+$/, "").replace(/;/g, ","); }

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', status TEXT NOT NULL DEFAULT 'adopted', dod TEXT, owner TEXT, priority INTEGER DEFAULT 0, program_code TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL DEFAULT 'a', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, transport TEXT NOT NULL DEFAULT 'd1-query', expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE VIEW v_remediation_evidence_all AS SELECT * FROM remediation_verifications;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open');
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, sent_at TEXT);
CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, met TEXT, ts TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, enabled INTEGER);
CREATE TABLE personal_radar (id INTEGER PRIMARY KEY AUTOINCREMENT, report TEXT, scanned_at TEXT);
CREATE TABLE calendar (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT, source TEXT, created TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, current INTEGER);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, deployed_at TEXT, notes TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, meta TEXT);`);
  w.exec(VIEW);
  const g = w.prepare("INSERT INTO goals (goal_key, statement, dod) VALUES (?, ?, ?)");
  const c = w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, module, last_verdict, deferred_since, attempts, next_due_at, escalate_to) VALUES (?, ?, ?, 'active', 'goal-dod-v1', 'deferred', '2026-10-19 06:34:03', 371, '2026-10-26 20:00:00', 'owner')");
  for (const [k, dod] of Object.entries(DOD)) { g.run(k, k + ": statement", dod); c.run("goal-" + k, null, probeOf(dod)); }
  w.prepare("INSERT INTO agent_issues (id, title, status) VALUES (100064, 'COMPANION-PUBLISH-STALL-AUTO-1: x', 'open')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, module, last_verdict, deferred_since, attempts, escalate_to, action) VALUES ('issue-100064', 100064, 'SELECT ''ok'' AS expected, ''pending: no two-piece recovery'' AS observed', 'active', 'probe-template-v2d-loop', 'deferred', '2026-10-19 10:43:07', 383, 'qnfo-fleet-control', 'the loop closes it')").run();
  // live-like measured state
  const m = w.prepare("INSERT INTO metric_registry (metric, last_value) VALUES (?, ?)");
  m.run("breach_code_task_pct", "8.1"); m.run("ops_tool_budget_bail_7d", "207"); m.run("subscribers_growth_monthly", "0"); m.run("credibility_events_90d", "n/a"); m.run("owner_question_answer_rate_14d", "n/a");
  w.prepare("INSERT INTO fleet_budget (node_class, current) VALUES ('cron_schedules', 47)").run();
  for (let i = 0; i < 4; i++) w.prepare("INSERT INTO owner_questions (kind, sent_at) VALUES ('after-event', '2026-10-20')").run();
  for (let i = 0; i < 3; i++) w.prepare("INSERT INTO calendar_feedback (action, met, ts) VALUES ('nope', '', '2026-10-16 06:22:20')").run();
  for (let i = 0; i < 34; i++) w.prepare("INSERT INTO remediation_contracts (class, verify_probe, status) VALUES (?, 'x', 'needs-machine-probe')").run("nmp-" + i);
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const dodOf = (w, k) => one(w, "SELECT dod FROM goals WHERE goal_key = ?", k).dod;
const contractOf = (w, cls) => one(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);

const w = world();
const before = Object.fromEntries(Object.keys(DOD).map((k) => [k, dodOf(w, k)]));
const contractsBefore = Object.fromEntries(all(w, "SELECT * FROM remediation_contracts WHERE class LIKE 'goal-%' OR class = 'issue-100064'").map((r) => [r.class, r]));
w.exec(sql);
w.exec(sql);   // a replay changes nothing

// ---- the DoD texts
for (const k of CHANGED) {
  const d = dodOf(w, k);
  ok(d !== before[k], `${k}: the DoD text changed`);
  ok(/unmet/.test(d), `${k}: it now says unmet`);
}
ok(dodOf(w, "TP-6-DURABLE-EXECUTION-1").includes("'pending: metric ops_tool_budget_bail_7d not measured yet"), "TP-6: the true wait (metric not measured yet) is still pending");
ok(!/'pending: (ops_tool_budget_bail_7d|cron_schedules) /.test(dodOf(w, "TP-6-DURABLE-EXECUTION-1")), "TP-6: both measured branches say unmet");
ok(dodOf(w, "TP-9-DEPLOY-PATH-NO-LOCKOUT-1") === before["TP-9-DEPLOY-PATH-NO-LOCKOUT-1"], "TP-9, a 30-day window, is untouched");
for (const k of CHANGED) {
  // only the labels moved: undo them and the original comes back
  const d = dodOf(w, k).replace(/unmet: /g, "pending: ");
  const bare = k === "CONNECTION-ENGAGEMENT-1" || k === "RADAR-TASTE-LEARN-1";
  ok(bare || d === before[k], `${k}: nothing but the label changed`);
}
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_vdh2_goals").n === 8 && all(w, "SELECT goal_key, dod FROM bak_20261026_vdh2_goals").every((r) => r.dod === before[r.goal_key]), "the goals backup holds the eight DoD texts as they were");

// ---- the contracts took the probe through the live view text and are due
for (const k of CHANGED) {
  const c = contractOf(w, "goal-" + k);
  ok(c.verify_probe === one(w, "SELECT probe FROM v_goal_dod WHERE goal_key = ?", k).probe && c.verify_probe !== contractsBefore["goal-" + k].verify_probe, `${k}: the contract probe is the view's probe of the new DoD`);
  ok(c.next_due_at !== "2026-10-26 20:00:00" && c.status === "active" && c.module === "goal-dod-v1", `${k}: due now, still active`, c.next_due_at);
  ok(!/;/.test(c.verify_probe) && !/\b(insert|update|delete|drop|alter|create|replace)\b/i.test(c.verify_probe), `${k}: the probe has no semicolon and no write keyword`);
}
ok(contractOf(w, "goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1").verify_probe === contractsBefore["goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1"].verify_probe, "the TP-9 contract is untouched");
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_vdh2_contracts").n === 9, "the contracts backup holds the eight goal contracts and issue-100064");

// ---- what each new probe reads: unmet while the bound is missed, the expected value when it is met
const run = (k) => one(w, contractOf(w, "goal-" + k).verify_probe);
const unmetState = {
  "TP-5-MEASURE-TO-ACT-1": /^unmet: breach_code_task_pct 8\.1, needs-machine probe contracts 34$/,
  "TP-6-DURABLE-EXECUTION-1": /^unmet: ops_tool_budget_bail_7d 207$/,
  "TP-7-REACH-SURVIVES-REVIEW-GATE-1": /^unmet: subscribers_growth_monthly 0, credibility_events_90d n\/a$/,
  "CONNECTION-ENGAGEMENT-1": /^unmet: after-event questions sent 4 of 6 needed, answer rate 14d n\/a \(needs 0\.3\)$/,
  "CONNECTION-LEDGER-1": /^unmet: no went answer with a name in calendar_feedback yet \(owner action\)$/,
  "RADAR-TASTE-LEARN-1": /^unmet: calendar_feedback rows 3 \(needs 5 and a radar report that used them\)$/,
  "GH-WEBHOOK-REGISTER-1": /^unmet: no gh-webhook delivery recorded in the last 120 minutes$/,
  "GH-APP-FLEET-2-CONVERSIONS-0": /^unmet: workers served by the App broker in 24 hours: 0 of 13$/,
};
for (const k of CHANGED) {
  const r = run(k);
  ok(unmetState[k].test(r.observed) && r.observed !== r.expected, `${k}: unmet reads its reason, not pending`, r);
  ok(!/^pending/i.test(r.observed), `${k}: the unmet read does not start with pending (so it is a verdict, not a deferral)`);
}
// the pass path is unchanged
w.prepare("UPDATE metric_registry SET last_value = '30' WHERE metric = 'breach_code_task_pct'").run();
w.prepare("DELETE FROM remediation_contracts WHERE status = 'needs-machine-probe'").run();
ok(run("TP-5-MEASURE-TO-ACT-1").observed === "ok", "TP-5: met reads ok");
w.prepare("UPDATE metric_registry SET last_value = '0' WHERE metric = 'ops_tool_budget_bail_7d'").run();
ok(/^unmet: cron_schedules 47 \(needs <= 40, TP-6 levers 2-4\)$/.test(run("TP-6-DURABLE-EXECUTION-1").observed), "TP-6: the second measured branch reads unmet too");
w.prepare("UPDATE fleet_budget SET current = 40").run();
ok(run("TP-6-DURABLE-EXECUTION-1").observed === "ok", "TP-6: met reads ok");
w.prepare("DELETE FROM metric_registry WHERE metric = 'ops_tool_budget_bail_7d'").run();
ok(/^pending: metric ops_tool_budget_bail_7d not measured yet/.test(run("TP-6-DURABLE-EXECUTION-1").observed), "TP-6: an unmeasured metric is still a true wait: pending");
w.prepare("UPDATE metric_registry SET last_value = '12' WHERE metric = 'subscribers_growth_monthly'").run();
ok(run("TP-7-REACH-SURVIVES-REVIEW-GATE-1").observed === "ok", "TP-7: met reads ok");
for (let i = 0; i < 2; i++) w.prepare("INSERT INTO owner_questions (kind, sent_at) VALUES ('after-event', '2026-10-21')").run();
w.prepare("UPDATE metric_registry SET last_value = '0.4' WHERE metric = 'owner_question_answer_rate_14d'").run();
ok(run("CONNECTION-ENGAGEMENT-1").observed === "answered", "CONNECTION-ENGAGEMENT-1: met reads answered");
w.prepare("INSERT INTO calendar_feedback (action, met, ts) VALUES ('went', 'Alex', datetime('now'))").run();
w.prepare("INSERT INTO analytics_metric_triggers (metric_key, enabled) VALUES ('ledger_people_seen_twice', 1)").run();
w.prepare("INSERT INTO owner_questions (kind, sent_at) VALUES ('follow-up', datetime('now'))").run();
ok(run("CONNECTION-LEDGER-1").observed === "1", "CONNECTION-LEDGER-1: met reads 1");
w.prepare("INSERT INTO cloud_ops_events (ts, kind, meta) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'gh-webhook', '{}')").run();
ok(run("GH-WEBHOOK-REGISTER-1").observed === "ok", "GH-WEBHOOK-REGISTER-1: met reads ok");
for (let i = 0; i < 13; i++) w.prepare("INSERT INTO cloud_ops_events (ts, kind, meta) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'gh-app-broker', ?)").run(JSON.stringify({ caller: "w" + i }));
ok(run("GH-APP-FLEET-2-CONVERSIONS-0").observed === "ok", "GH-APP-FLEET-2-CONVERSIONS-0: met reads ok");
for (let i = 0; i < 2; i++) w.prepare("INSERT INTO calendar_feedback (action, met, ts) VALUES ('nope', '', datetime('now'))").run();
w.prepare("INSERT INTO personal_radar (report, scanned_at) VALUES ('x\n- feedback rows used: 5\nscore -2', datetime('now'))").run();
w.prepare("UPDATE calendar_feedback SET ts = datetime('now', '-20 days') WHERE id = 1").run();
w.prepare("INSERT INTO calendar (plane, source, created) VALUES ('personal', 'personal-radar', datetime('now'))").run();
ok(run("RADAR-TASTE-LEARN-1").observed === "learning", "RADAR-TASTE-LEARN-1: met reads learning");

// ---- the VERIFICATION-DEFERRED-7D-1 closing probe of qnfo-fleet-control, read from the worker text
const stillDeferred = /var RT_STILL_DEFERRED_SQL = "([^"]*)";/.exec(fc);
ok(stillDeferred && stillDeferred[1].includes("c.deferred_since IS NOT NULL"), "RT_STILL_DEFERRED_SQL is found in qnfo-fleet-control/worker.js");
const closer = (cls) => `SELECT 'cleared' AS expected, CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = '${cls}' AND ${stillDeferred[1]}) THEN 'pending: contract ${cls} still defers' ELSE 'cleared' END AS observed`;
const x = world();
ok(one(x, closer("goal-TP-5-MEASURE-TO-ACT-1")).observed.startsWith("pending"), "before: the 7D-1 closing probe of a deferring goal contract reads pending");
x.exec(sql);
// what the tick and the consumer then write: a verdict fail and an evidence row with the new observed text
for (const k of CHANGED) {
  const cls = "goal-" + k, r = one(x, contractOf(x, cls).verify_probe);
  x.prepare("INSERT INTO remediation_verifications (issue_id, class, expected, observed, pass) VALUES (NULL, ?, ?, ?, 0)").run(cls, r.expected, r.observed);
  x.prepare("UPDATE remediation_contracts SET last_verdict = 'fail', attempts = attempts + 1 WHERE class = ?").run(cls);
}
for (const k of CHANGED) ok(one(x, closer("goal-" + k)).observed === "cleared", `after: the 7D-1 closing probe of ${k} reads cleared (a fail on an unmet evidence row is a verdict, not a deferral)`);
// a bare pending evidence row with verdict fail (the old consumer shape) is still a deferral: the rule is not loosened
x.prepare("INSERT INTO remediation_verifications (class, expected, observed, pass) VALUES ('goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1', '1', 'pending: 30-day window from 2026-10-06T06:30Z still open', 0)").run();
x.prepare("UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1'").run();
ok(one(x, closer("goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1")).observed.startsWith("pending"), "TP-9, a true wait, still reads as deferring: the 7D-1 rule is not loosened");

// ---- issue-100064
const c64 = contractOf(w, "issue-100064");
ok(c64.status === "monitoring" && c64.next_due_at === null && c64.deferred_since === null && /^monitoring:loop-owned-48h/.test(c64.last_verdict) && /decision_log names issue-100064/.test(c64.action), "issue-100064: parked as monitoring with a recorded decision", c64);
ok(one(w, closer("issue-100064")).observed === "cleared", "issue-100064: the 7D-1 closing probe reads cleared (not active)");
const y = world();
y.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100064").run();
y.exec(sql);
ok(contractOf(y, "issue-100064").status === "active", "a closed issue-100064 is not parked by this file (the guard reads the issue)");
const z = world();
z.prepare("UPDATE remediation_contracts SET last_verdict = 'pass', deferred_since = NULL WHERE class = 'issue-100064'").run();
z.exec(sql);
ok(contractOf(z, "issue-100064").status === "active", "an issue-100064 contract that no longer defers is left alone");

// ---- the decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-2') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-2') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "goal-probe-judges-not-defers", "the decision names its actor, rollback, prediction and capability gain");
ok(["goal-TP-5-MEASURE-TO-ACT-1", "goal-TP-6-DURABLE-EXECUTION-1", "goal-CONNECTION-ENGAGEMENT-1", "goal-CONNECTION-LEDGER-1", "goal-RADAR-TASTE-LEARN-1", "issue-100064"].every((s) => dl.action.includes(s)), "the decision names the classes (the 7D-1 issue asks for a decision_log row that names the contract)");

// ---- the Rollback puts it back
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 2, "the Rollback is two statements", down.length);
for (const s of down) w.exec(s);
for (const k of Object.keys(DOD)) ok(dodOf(w, k) === before[k], `Rollback: ${k} DoD text restored`);
for (const [cls, b] of Object.entries(contractsBefore)) {
  const c = contractOf(w, cls);
  ok(c.verify_probe === b.verify_probe && c.status === b.status && c.last_verdict === b.last_verdict && c.action === b.action && c.next_due_at === b.next_due_at, `Rollback: contract ${cls} restored`);
}
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-2') > 0").n === 1, "decision_log keeps its row (append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
