// REM-A4-CLOSING-MACHINERY-1 offline suite: replays migrations/2026-10-26-rem-a4-closing-machinery.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs (issue_triage, the live close-sync triggers, issue_close_evidence_required, remediation_contracts, code_tasks, decision_log)
// plus fleet_tasks, process_contracts, research_queue, control_alternate_probes and the live texts of v_process_contract_dod_worklist, v_sla_compliance, v_path_coverage_gaps and
// v_path_coverage_violations (read from qnfo-audit 2026-10-26 19:30Z).
// Proves: the header opts in; 1000183 is closed as superseded by 1000189, through the live close-sync trigger and with numbers in its evidence, only while red-drain is enabled with its
// escalated:over-retried step, more than 49 contracts are escalated, at most 10 failing non-exempt contracts past 5 times max_attempts are unparked and 1000189 is open (each guard alone keeps it
// open); the contracts of 1000182, 2826 and 2827 become active measuring probes (module rem-a4-closing-v1, no VACUOUS text, attempts 0, verdict NULL) and a replay does not reset them; each
// probe reads what it claims on fixtures (1000182: a critical issue older than 72 hours counts when it has no contract, a closure-observing contract, the generic closed-with-evidence alias or a
// loop-owned monitoring contract, and does not count with a real probe, a metric-condition monitoring contract, a probe that reads close_evidence of other issues, a young, non-critical or closed
// issue; 2826: untested alternates; 2827: worklist and the code-task-merge SLA), passes the consumer's literal-SELECT gate (no write keyword, no semicolon), and the Rollback line restores the
// parked state and reopens 1000183.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-closing-machinery.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-closing-machinery.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bUPDATE\s+(agent_issues|decision_log|issue_lifecycle)\b/i.test(body) && !/\bUPDATE\s+fleet_tasks\b|\bUPDATE\s+fleet_crons\b|\bINSERT\s+[A-Z ]*INTO\s+fleet_(tasks|crons)\b/i.test(body), "no direct write to agent_issues status, fleet_tasks or fleet_crons: closing goes through issue_triage");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const VIEWS = `
CREATE TABLE process_contracts (process TEXT PRIMARY KEY, owner TEXT NOT NULL, sla_min INTEGER NOT NULL, definition_of_done TEXT NOT NULL, paths_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), cadence_min INTEGER);
CREATE TABLE research_queue (published_at TEXT, created_at TEXT, claimed_at TEXT);
CREATE TABLE control_alternate_probes (control TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, version INTEGER, enabled INTEGER DEFAULT 1, definition TEXT);
CREATE VIEW v_process_contract_dod_worklist AS
SELECT process, owner, sla_min, substr(definition_of_done, 1, 160) AS dod_prefix
FROM process_contracts
WHERE definition_of_done LIKE '[seeded from worker_schedules purpose%';
CREATE VIEW v_sla_compliance AS
SELECT
  'research-publish' AS process,
  COUNT(*) AS finished_7d,
  ROUND(AVG((julianday(published_at) - julianday(created_at)) * 1440), 1) AS queue_minutes,
  ROUND(AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440), 1) AS step_minutes,
  MAX(CAST((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440 AS INTEGER)) AS worst_step_minutes,
  120 AS sla_min,
  CASE WHEN AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS state,
  CASE WHEN AVG((julianday(published_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS queue_state,
  'measured' AS measurement,
  ROUND(AVG((julianday(COALESCE(claimed_at, created_at)) - julianday(created_at)) * 1440), 1) AS propose_wait_minutes,
  ROUND(AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440), 1) AS work_minutes,
  ROUND(AVG(CASE WHEN julianday(published_at) > julianday('now', '-1 day') THEN (julianday(published_at) - julianday(created_at)) * 1440 END), 1) AS recent_24h_minutes
FROM research_queue
WHERE published_at IS NOT NULL AND created_at IS NOT NULL AND published_at > datetime('now', '-7 days')
UNION ALL
SELECT
  'code-task-merge',
  COUNT(*),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  MAX(CAST((julianday(merged_at) - julianday(created_at)) * 1440 AS INTEGER)),
  120,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  'measured (no claim timestamp on code_tasks, so step and queue are the same clock)',
  ROUND(AVG((julianday(pr_opened_at) - julianday(created_at)) * 1440), 1),
  ROUND(AVG((julianday(merged_at) - julianday(pr_opened_at)) * 1440), 1),
  ROUND(AVG(CASE WHEN julianday(merged_at) > julianday('now', '-1 day') THEN (julianday(merged_at) - julianday(created_at)) * 1440 END), 1)
FROM code_tasks
WHERE merged_at IS NOT NULL AND created_at IS NOT NULL AND merged_at > datetime('now', '-7 days');
CREATE VIEW v_path_coverage_gaps AS
SELECT
  'control_registry' AS source,
  control AS process,
  kind AS path_kind,
  CASE
    WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate'
    WHEN alternate_tested_at IS NULL AND evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' AND NOT EXISTS (SELECT 1 FROM control_alternate_probes p WHERE p.control = control_registry.control) THEN 'alternate-not-exercisable'
    WHEN alternate_tested_at IS NULL THEN 'alternate-untested'
    ELSE 'ok'
  END AS path_state,
  alternate_path AS alternate,
  alternate_tested_at
FROM control_registry
UNION ALL
SELECT
  'process_contracts' AS source,
  process,
  'contract-paths' AS path_kind,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare'
    ELSE 'ok'
  END AS path_state,
  NULL AS alternate,
  NULL AS alternate_tested_at
FROM process_contracts;
CREATE VIEW v_path_coverage_violations AS
SELECT source, process, path_kind, path_state, alternate, alternate_tested_at
FROM v_path_coverage_gaps
WHERE path_state NOT IN ('ok', 'alternate-not-exercisable');
`;

const RED_DRAIN_DEF = '{"steps":[{"type":"sql","db":"AUDIT","sql":"UPDATE remediation_contracts SET status=\'escalated\', last_verdict=\'escalated:over-retried (probe re-ran past 5x max_attempts)\'"}]}';
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19).replace("T", " ");
const ms = (minAgo) => Date.now() - minAgo * 60000;

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("ALTER TABLE code_tasks ADD COLUMN pr_opened_at TEXT");
  w.exec(VIEWS);
  const issue = (id, title, status, priority, created) => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-control', ?, ?, ?, 1)").run(id, title, priority, status, created);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  const contract = (cls, issueId, status, probe, extra = {}) => {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict, attempts, max_attempts) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-fleet-control', ?, ?, ?, ?, ?)")
      .run(cls, issueId, extra.action ?? "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded", probe, status, extra.module ?? null, extra.verdict ?? null, extra.attempts ?? 0, extra.max ?? 3);
  };
  const closure = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
  issue(1000183, "REMEDIATION-ESCALATE-DEAD-1: escalate_to is selected and never acted on", o.status183 ?? "open", "high", ms(3000));
  contract("issue-1000183", 1000183, "superseded", closure(1000183), { module: "probe-template-v3-generic", verdict: "superseded:closure-observing-probe-at-birth" });
  issue(1000189, "REMEDIATION-CONSUMER-MERGE-DENIED-1: the code loop cannot merge scripts/remediation_consumer.py", o.status189 ?? "open", "critical", ms(3000));
  contract("issue-1000189", 1000189, "active", "SELECT '0' AS expected, '0' AS observed", { verdict: "fail" });
  issue(1000182, "REMEDIATION-CONTRACT-DEAD-PATH-1: superseded contracts leave critical issues with no doer", "open", "high", ms(3000));
  contract("issue-1000182", 1000182, "superseded", closure(1000182), { module: "probe-template-v3-generic", verdict: "superseded:closure-observing-probe-at-birth" });
  issue(2826, "PATHS-UNTESTED-1: controls declare an alternate path that has never been exercised", "open", "high", ms(13000));
  contract("issue-2826", 2826, "monitoring", "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2826) <> 'open' THEN 'ok' ELSE 'stale' END AS observed", { module: "probe-template-v2d-loop", verdict: "monitoring:loop-owned-48h", action: "LOOP-OWNED-CONTRACT-MONITORING-1: parked" });
  issue(2827, "DOD-CHECKABLE-1: process contracts still define done as intent", "open", "high", ms(13000));
  contract("issue-2827", 2827, "monitoring", "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2827) <> 'open' THEN 'ok' ELSE 'stale' END AS observed", { module: "probe-template-v2d-loop", verdict: "monitoring:loop-owned-48h", action: "LOOP-OWNED-CONTRACT-MONITORING-1: parked" });
  if (o.red === undefined || o.red) w.prepare("INSERT INTO fleet_tasks (id, version, enabled, definition) VALUES ('red-drain', 7, ?, ?)").run(o.redEnabled ?? 1, o.redDef ?? RED_DRAIN_DEF);
  const esc = o.escalated ?? 56;
  for (let i = 0; i < esc; i++) w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, max_attempts) VALUES (?, NULL, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-ops', 'escalated', 'escalated:over-retried (probe re-ran past 5x max_attempts)', 40, 3)").run("goal-esc-" + i);
  for (let i = 0; i < (o.unparked ?? 8); i++) w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, max_attempts) VALUES (?, NULL, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-ops', 'active', 'fail', 100, 3)").run("goal-live-" + i);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const probe = (w, cls) => { const c = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls); return w.prepare(c.p).get(); };
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);

// ---- 1000183: closes as superseded by 1000189 while the evidence of the decision holds
{
  const w = world();
  w.exec(sql);
  ok(st(w, 1000183) === "closed", "1000183 is closed through the live close-sync trigger");
  const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000183");
  ok(t.triage_state === "closed" && t.rc === "closing-machinery:superseded-by-1000189" && /^superseded by 1000189/.test(t.close_evidence), "the triage row names the successor", t.close_evidence);
  ok(/RED-DRAIN-1 version 7, enabled/.test(t.close_evidence) && /56 contracts are escalated:over-retried \(49 when this issue was filed\)/.test(t.close_evidence) && /8 failing non-exempt contracts past 5 times max_attempts are not parked yet/.test(t.close_evidence), "the evidence carries the measured red-drain version and the live counts", t.close_evidence);
  ok(/withdrawn/.test(t.close_evidence) && /closing probe of 1000189/.test(t.close_evidence) && !/wontfix/i.test(t.close_evidence), "the evidence states the withdrawal decision and the strict probe that stays with 1000189, not wontfix");
  ok(q1(w, "SELECT COUNT(*) n FROM issue_triage WHERE issue_id = 1000183").n === 1, "the existing triage row was updated, not duplicated");
  ok(q1(w, "SELECT close_channel c FROM agent_issues WHERE id = 1000183").c === "auto:triage-sync:qnfo-fleet-control", "close_channel is written by the sync trigger (CLOSE-CHANNEL-REQUIRED-1)");
  ok(st(w, 1000189) === "open" && st(w, 1000182) === "open" && st(w, 2826) === "open" && st(w, 2827) === "open", "the other four issues stay open: they close through their probes, never by this file");
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000183'").s === "superseded", "the superseded contract of 1000183 is left as it is");
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing (no reset of attempts, no second decision_log row, no second close)");
}
const guards = [
  ["escalated 49 (not above the 49 of the filing)", { escalated: 49 }],
  ["no escalated contract", { escalated: 0 }],
  ["11 unparked failing contracts past 5 times max_attempts", { unparked: 11 }],
  ["red-drain disabled", { redEnabled: 0 }],
  ["red-drain without its escalated:over-retried step", { redDef: '{"steps":[]}' }],
  ["no red-drain task", { red: false }],
  ["1000189 already closed", { status189: "closed" }],
  ["1000183 already closed", { status183: "closed" }],
];
for (const [name, o] of guards) {
  const w = world(o);
  const before = JSON.stringify(qa(w, "SELECT * FROM issue_triage WHERE issue_id = 1000183"));
  w.exec(sql);
  if (o.status183 === "closed") ok(JSON.stringify(qa(w, "SELECT * FROM issue_triage WHERE issue_id = 1000183")) === before, "guard: " + name + ": an already closed issue gets no new triage text");
  else ok(st(w, 1000183) === "open" && JSON.stringify(qa(w, "SELECT * FROM issue_triage WHERE issue_id = 1000183")) === before, "guard: " + name + ": 1000183 stays open and its triage row is untouched");
  ok(q1(w, "SELECT module m FROM remediation_contracts WHERE class = 'issue-2827'").m === "rem-a4-closing-v1", "guard: " + name + ": the three contracts are still replaced (their rewrite does not depend on the close)");
}
{
  const w = world({ unparked: 10 });
  w.exec(sql);
  ok(st(w, 1000183) === "closed", "10 unparked is the limit that still closes");
  const w2 = world({ escalated: 50 });
  w2.exec(sql);
  ok(st(w2, 1000183) === "closed", "50 escalated (above the 49 of the filing) is the limit that still closes");
  const w3 = world();
  w3.prepare("UPDATE remediation_contracts SET issue_id = 1000300 WHERE class = 'goal-live-0'").run();
  w3.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (1000300, 'SOME-ISSUE: x', 't', 's', 'high', 'open', 1, 1)").run();
  w3.exec(sql);
  ok(st(w3, 1000183) === "closed", "a failing contract that is the sole live probe of an open non-METRIC-TRIGGER issue is excluded from the unparked count, like red-drain step 2");
}

// ---- the three contracts
const CLS = ["issue-1000182", "issue-2826", "issue-2827"];
{
  const w = world();
  w.exec(sql);
  for (const cls of CLS) {
    const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
    ok(c.status === "active" && c.module === "rem-a4-closing-v1" && c.verify_transport === "d1-query" && c.last_verdict === null && c.attempts === 0 && c.deferred_since === null && c.next_due_at !== null, cls + ": active measuring contract, attempts 0, verdict NULL, due now", c);
    ok(!/VACUOUS|LOOP-OWNED/.test(c.action) && /^MEASURES/.test(c.action), cls + ": the action text is honest (MEASURES ..., no VACUOUS or LOOP-OWNED text)");
    ok(c.module !== "probe-template-v2d-loop" && c.verify_probe.indexOf("SELECT status FROM agent_issues WHERE id =") < 0, cls + ": red-drain step 7 (ownership-template text in a loop module) can never park it again");
    ok(/^select\b/i.test(c.verify_probe.trim()) && !/;/.test(c.verify_probe) && !/insert into|update |delete from|drop table|drop index|alter table|create table|create index|create trigger|attach |detach |pragma |replace into|vacuum/i.test(c.verify_probe), cls + ": passes the consumer's literal-SELECT gate (is_literal_select)");
    const r = w.prepare(c.verify_probe).get();
    ok(r && typeof r.expected === "string" && r.observed !== null && r.observed !== undefined, cls + ": the probe returns an expected/observed pair", r);
  }
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-CLOSING-MACHINERY-1:%'").n === 1, "one decision_log row");
  // a replay must not reset a contract that has been probed since
  w.prepare("UPDATE remediation_contracts SET attempts = 5, last_verdict = 'fail' WHERE class = 'issue-2827'").run();
  w.exec(sql);
  const c = q1(w, "SELECT attempts a, last_verdict v FROM remediation_contracts WHERE class = 'issue-2827'");
  ok(c.a === 5 && c.v === "fail", "a replay does not reset a probed contract");
}
{
  // a contract of an issue that is not open is not rewritten
  const w = world();
  w.prepare("UPDATE issue_triage SET close_evidence = 'fixture evidence' WHERE issue_id = 2826").run();
  w.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 2826").run();
  w.exec(sql);
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-2826'").s === "monitoring", "a closed issue keeps its parked contract");
}

// ---- 2826 probe: untested alternates
{
  const w = world();
  w.exec(sql);
  const ctl = (name, alt, tested, evidence = "e") => w.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, alternate_path, alternate_tested_at, evidence) VALUES (?, 'x', 'guard', 0, 'keep', ?, ?, ?)").run(name, alt, tested, evidence);
  let r = probe(w, "issue-2826");
  ok(r.expected === "0" && r.observed === "0", "2826 probe: no control rows reads 0", r);
  ctl("c-untested-1", "route b", null);
  ctl("c-untested-2", "route c", null);
  ctl("c-tested", "route d", "2026-10-25T00:00:00Z");
  ctl("c-none", null, null);
  ctl("c-not-exercisable", "route e", null, "reason ALTERNATE-NOT-EXERCISABLE: a kill switch");
  r = probe(w, "issue-2826");
  ok(r.observed === "2", "2826 probe: two untested alternates read 2 (a tested one, a control with no alternate and a recorded not-exercisable one do not count)", r);
  w.prepare("INSERT INTO control_alternate_probes (control) VALUES ('c-not-exercisable')").run();
  r = probe(w, "issue-2826");
  ok(r.observed === "3", "2826 probe: a not-exercisable row that has an alternate probe is untested again", r);
  w.prepare("UPDATE control_registry SET alternate_tested_at = '2026-10-26T00:00:00Z' WHERE alternate_tested_at IS NULL AND alternate_path IS NOT NULL").run();
  r = probe(w, "issue-2826");
  ok(r.observed === "0" && r.expected === r.observed, "2826 probe: every alternate exercised reads 0 = expected", r);
}

// ---- 2827 probe: worklist and the code-task-merge SLA
{
  const w = world();
  w.exec(sql);
  const merge = (id, createdAgoMin, mergedAgoMin) => w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, created_at, updated_at, merged_at) VALUES (?, 'r', 'p', 'g', 'merged', ?, ?, ?)").run(id, iso(createdAgoMin), iso(mergedAgoMin), iso(mergedAgoMin));
  let r = probe(w, "issue-2827");
  ok(r.expected === "ok" && r.observed === "no-merges-in-window", "2827 probe: no merged task in the window reads a reason, not ok", r);
  merge("m1", 300, 270); merge("m2", 200, 170);
  r = probe(w, "issue-2827");
  ok(r.observed === "ok", "2827 probe: merges at 30 minutes read ok", r);
  w.prepare("INSERT INTO process_contracts (process, owner, sla_min, definition_of_done, paths_json) VALUES ('p1', 'o', 120, '[seeded from worker_schedules purpose: x]', '[\"a\",\"b\",\"c\"]')").run();
  r = probe(w, "issue-2827");
  ok(r.observed === "dod-worklist-nonzero:1", "2827 probe: a process contract that defines done as intent reads the worklist count", r);
  w.prepare("DELETE FROM process_contracts").run();
  w.prepare("INSERT INTO process_contracts (process, owner, sla_min, definition_of_done, paths_json) VALUES ('p1', 'o', 120, 'A cloud_ops_events row exists within 120 minutes', '[\"a\",\"b\",\"c\"]')").run();
  merge("m3", 3000, 100);
  r = probe(w, "issue-2827");
  ok(/^code-task-merge breach\/breach \d+(\.\d+)? min vs 120, finished_7d 3, last 24h /.test(r.observed) && r.observed !== r.expected, "2827 probe: one slow merge puts the mean over 120 minutes and the observed text names the SLA numbers", r);
}

// ---- 1000182 probe: critical issues older than 72 hours with no live closing path
{
  const w = world();
  w.exec(sql);
  const old = ms(80 * 60), young = ms(10 * 60);
  const crit = (id, title, o = {}) => w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 't', 's', ?, ?, ?, 1)").run(id, title, o.priority ?? "critical", o.status ?? "open", o.created ?? old);
  const c = (cls, id, status, probeSql, verdict = null) => w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'qnfo-ops', ?, ?)").run(cls, id, probeSql, status, verdict);
  let r = probe(w, "issue-1000182");
  ok(r.expected === "0" && r.observed === "0", "1000182 probe: no critical issue reads 0", r);
  crit(5001, "C-NO-CONTRACT: nothing");
  crit(5002, "C-CIRCULAR: only the born-superseded template"); c("issue-5002", 5002, "superseded", "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 5002) AS observed", "superseded:closure-observing-probe-at-birth");
  crit(5003, "C-ALIAS: active generic BACKFILL alias"); c("issue-5003-BACKFILL-1", 5003, "active", "SELECT 'closed-with-evidence' AS expected, CASE WHEN a.status='closed' AND COALESCE(t.close_evidence,'')<>'' THEN 'closed-with-evidence' ELSE 'pending' END AS actual FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id=a.id WHERE a.id=5003", "deferred");
  crit(5004, "C-LOOP: loop-owned monitoring"); c("issue-5004", 5004, "monitoring", "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 5004) <> 'open' THEN 'ok' ELSE 'stale' END AS observed", "monitoring:loop-owned-48h (the filing loop closes it)");
  r = probe(w, "issue-1000182");
  ok(r.observed === "4", "1000182 probe: no contract, a closure-observing contract, the generic alias and a loop-owned monitoring contract are four dead paths", r);
  crit(5010, "C-REAL-ACTIVE: measures the family"); c("issue-5010", 5010, "active", "SELECT '1' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.id = 5010 AND a.created_at < 1 AND NOT EXISTS (SELECT 1 FROM issue_lifecycle l WHERE l.issue_id = 5010)) AS TEXT) AS observed", "fail");
  crit(5011, "C-METRIC: metric-condition monitoring"); c("issue-5011", 5011, "monitoring", "SELECT 'ok' AS expected, 'pending' AS observed", "monitoring:metric-condition (the probe reads a live metric)");
  crit(5012, "C-OTHERS-EVIDENCE: reads close_evidence of other issues"); c("issue-5012", 5012, "active", "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.close_channel IS NULL AND t.close_evidence LIKE 'X:%') AS TEXT) AS observed", "fail");
  crit(5013, "C-ESCALATED: escalated real probe"); c("issue-5013", 5013, "escalated", "SELECT '0' AS expected, '1' AS observed", "escalated:over-retried");
  crit(5014, "C-HOLDING: holding real probe"); c("issue-5014", 5014, "holding", "SELECT '0' AS expected, '1' AS observed", "fail");
  crit(5020, "C-YOUNG: ten hours old", { created: young });
  crit(5021, "H-HIGH: not critical", { priority: "high" });
  crit(5022, "C-CLOSED: closed", { status: "closed" });
  r = probe(w, "issue-1000182");
  ok(r.observed === "4", "1000182 probe: a real active probe, a metric-condition monitoring contract, a probe that reads close_evidence of other issues, an escalated and a holding contract are live paths; a young, a non-critical and a closed issue do not count", r);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-5001', 5001, 'p', 'a', 'SELECT ''0'' AS expected, ''1'' AS observed', 'd1-query', 'qnfo-ops', 'active', 'fail')").run();
  w.prepare("UPDATE remediation_contracts SET status = 'active', verify_probe = 'SELECT ''0'' AS expected, ''0'' AS observed' WHERE class = 'issue-5002'").run();
  w.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, ''0'' AS observed' WHERE class = 'issue-5003-BACKFILL-1'").run();
  w.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'monitoring:metric-condition (x)', verify_probe = 'SELECT ''ok'' AS expected, ''pending'' AS observed' WHERE class = 'issue-5004'").run();
  r = probe(w, "issue-1000182");
  ok(r.observed === "0" && r.expected === r.observed, "1000182 probe: every critical issue older than 72 hours has a live path reads 0 = expected", r);
  const own = q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE id = 1000182 AND priority = 'critical'").n;
  ok(own === 0, "fixture: 1000182 itself is high priority, so its own probe never counts itself");
}

// ---- the Rollback line restores the parked state and reopens 1000183
{
  const w = world();
  w.exec(sql);
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  w.exec(rb.split("; ").join(";\n"));
  ok(st(w, 1000183) === "open" && q1(w, "SELECT triage_state s FROM issue_triage WHERE issue_id = 1000183").s === "triaged", "Rollback reopens 1000183 and returns its triage row to triaged");
  ok(CLS.every((cls) => q1(w, "SELECT status s FROM remediation_contracts WHERE class = ?", cls).s === "superseded"), "Rollback returns the three contracts to superseded (nothing probes a superseded contract)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
