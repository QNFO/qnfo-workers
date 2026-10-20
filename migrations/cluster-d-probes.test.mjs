// CLUSTER-D-PROBES-1 offline suite: applies migrations/2026-10-20-cluster-d-probes.sql on SQLite (node:sqlite) over fixtures of the objects its probes read.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback) and never writes alternate_tested_at; it is re-runnable; its Rollback restores the pre-state text for text;
// the model-health-sweep probe is one read-only SELECT (no semicolon, no write keyword) that returns ok in a world where the alternate is in place and FAILS with a reason on each broken
// world (detector missing, switch garbled, daily member silent, detector silent) and on an empty world, judged by the real chaosJudge sliced from qnfo-fleet-control/worker.js;
// the restated issue-2067 probe stays pending under 8 finished tasks, ignores a CODE-TASK-REROUTE-1 refusal, a publish: patch larger than failure and a row before the preflight went live,
// and FAILS on a raw "anchor occurs 0" or "file larger than" task that reached the propose step and on an engine success rate under 0.45.
// Run: node migrations/cluster-d-probes.test.mjs        (CD_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-20-cluster-d-probes.sql"), "utf8");
const workerSrc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.CD_SKIP_MIGRATION === "1";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- the real judge ----
const BEGIN = "// ---- CHAOS-DRILL-1:BEGIN", END = "// ---- CHAOS-DRILL-1:END ----";
const a = workerSrc.indexOf(BEGIN), b = workerSrc.indexOf(END);
ok(a > 0 && b > a, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = workerSrc.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});

// ---- static ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 500 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing (so no BACKUP header is owed)");
ok(!/SET\s+alternate_tested_at/i.test(body) && !/SET\s+reviewed_at/i.test(body), "the file never writes alternate_tested_at or reviewed_at (only a passing drill stamps)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?|h)\b/i.test(body.replace(/(inside|in|last|within|-|before) ?(14|28) days|14 days (before|from)/g, "")), "no window, cadence or SLA is stated in hours or days other than the issues' own 14-day windows (and the 28-day edge of the previous window)");

// ---- fixture ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const sqlt = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace("T", " ").slice(0, 19);
function world(opt = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT, last_attempt_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, created_at TEXT, last_error TEXT, merge_note TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  w.prepare("INSERT INTO control_registry VALUES ('model-health-sweep','none needed: off returns to the daily backlog member',NULL,'Reason and expiry recorded 2026-10-19')").run();
  w.prepare("INSERT INTO remediation_contracts VALUES ('issue-2067',2067,'SELECT 1',?, NULL)").run("active");
  w.prepare("INSERT INTO remediation_contracts VALUES ('issue-2007',2007,'SELECT 1','active', NULL)").run();
  if (opt.old) { w.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'issue-2067'").run(opt.old); w.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'issue-2007'").run(OLD2007); }
  return w;
}
const OLD = "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime('%Y-%m-%dT%H:%M','now','-14 days') AND status IN ('merged','closed','failed','needs_human')) < 8 THEN 'pending: ' || (SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime('%Y-%m-%dT%H:%M','now','-14 days') AND status IN ('merged','closed','failed','needs_human')) || ' of 8 finished tasks in the last 14 days' WHEN (SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime('%Y-%m-%dT%H:%M','now','-14 days') AND (COALESCE(last_error,'') || COALESCE(merge_note,'')) LIKE '%larger than%') + (SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime('%Y-%m-%dT%H:%M','now','-14 days') AND (COALESCE(last_error,'') || COALESCE(merge_note,'')) LIKE '%anchor occurs 0%') = 0 THEN 'ok' ELSE 'dead-on-arrival tasks were created in the last 14 days: ' || (SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime('%Y-%m-%dT%H:%M','now','-14 days') AND ((COALESCE(last_error,'') || COALESCE(merge_note,'')) LIKE '%larger than%' OR (COALESCE(last_error,'') || COALESCE(merge_note,'')) LIKE '%anchor occurs 0%')) END AS observed";
const OLD2007 = "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'code-task.anchor-located' AND status = 'ok' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days')) = 0 THEN 'defect: no anchor-located event in 14 days' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'code-task.fail' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days') AND instr(lower(text), 'anchor') > 0) > 0 THEN 'defect: ' || (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'code-task.fail' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days') AND instr(lower(text), 'anchor') > 0) || ' task read-steps failed on an anchor in the last 14 days' ELSE 'ok' END AS observed /* ANCHOR-PROBE-REACHABLE-1 */";
const applied = () => { const w = world({ old: OLD }); if (!SKIP) w.exec(body); return w; };
const mhProbe = (w) => (w.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = 'model-health-sweep'").get() || {}).probe_sql;
const p2067 = (w) => w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2067'").get().verify_probe;
const judge = (w, p) => chaosJudge(w.prepare(p).all());

// ---- the model-health-sweep probe ----
{
  const w = applied();
  const p = mhProbe(w);
  ok(typeof p === "string" && p.length > 100, "model-health-sweep has a control_alternate_probes row");
  if (p) {
    ok(!/;/.test(p) && /^SELECT /.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the probe is one read-only SELECT with no write keyword");
    ok(/'-\d+ minutes'/.test(p) && !/'-\d+ (hours?|days?)'/.test(p), "windows are in minutes");
    const row = w.prepare("SELECT enabled, window_note FROM control_alternate_probes WHERE control = 'model-health-sweep'").get();
    ok(row.enabled === 1 && row.window_note.startsWith("1560 minutes for the daily backlog member"), "enabled, with the window note the Rollback keys on", row);
    const good = (x) => {
      x.prepare("INSERT OR REPLACE INTO remediation_contracts VALUES ('fm-model-health-issue-stale',NULL,'SELECT 0','active',?)").run(sqlt(10));
      x.prepare("INSERT INTO cloud_ops_events VALUES ('e1',?,'job-run','backlog-exec {}','qnfo-backlog-exec','ok')").run(iso(200));
    };
    good(w);
    let v = judge(w, p);
    ok(v.pass && v.observed === "ok", "ok when the detector is active and recent, the switch is unset and the daily member ran 200 minutes ago", v);
    w.prepare("INSERT INTO ops_config VALUES ('model_health_sweep','off')").run();
    ok(judge(w, p).pass, "off is a valid switch value (the alternate is then the only path)");
    w.prepare("UPDATE ops_config SET value = 'maybe'").run();
    v = judge(w, p); ok(!v.pass && /model_health_sweep reads maybe/.test(v.observed), "a garbled switch fails with its value", v);
    w.prepare("DELETE FROM ops_config").run();
    w.prepare("UPDATE remediation_contracts SET status = 'closed' WHERE class = 'fm-model-health-issue-stale'").run();
    v = judge(w, p); ok(!v.pass && /missing or not active/.test(v.observed), "an inactive detector fails", v);
    w.prepare("UPDATE remediation_contracts SET status = 'active', last_attempt_at = ? WHERE class = 'fm-model-health-issue-stale'").run(sqlt(300));
    v = judge(w, p); ok(!v.pass && /did not run in 120 minutes/.test(v.observed), "a detector silent for 300 minutes fails", v);
    w.prepare("UPDATE remediation_contracts SET last_attempt_at = ? WHERE class = 'fm-model-health-issue-stale'").run(sqlt(5));
    w.prepare("UPDATE cloud_ops_events SET ts = ?").run(iso(1561));
    v = judge(w, p); ok(!v.pass && /daily backlog member did not run in 1560 minutes/.test(v.observed), "a daily member silent for 1561 minutes fails", v);
    w.prepare("UPDATE cloud_ops_events SET ts = ?").run(iso(1559));
    ok(judge(w, p).pass, "a daily member that ran 1559 minutes ago still passes (the edge)");
    w.prepare("UPDATE cloud_ops_events SET job = 'someone-else'").run();
    v = judge(w, p); ok(!v.pass, "another job's event does not stand in for the daily member", v);
    const e = world(); if (!SKIP) e.exec(body);
    v = judge(e, p); ok(!v.pass, "an empty world fails (no probe passes by absence)", v);
    // the drill's stamp is earned by a pass only: this file wrote no date
    ok(e.prepare("SELECT alternate_tested_at FROM control_registry WHERE control = 'model-health-sweep'").get().alternate_tested_at === null, "alternate_tested_at is still NULL after the file (the drill stamps)");
  }
  ok(/CLUSTER-D-PROBES-1 2026-10-20/.test(w.prepare("SELECT evidence FROM control_registry WHERE control = 'model-health-sweep'").get().evidence), "evidence names the probe on the control row");
}

// ---- the issue-2067 probe ----
{
  const w = applied();
  const p = p2067(w);
  ok(/since the intake preflight went live/.test(p), "the issue-2067 contract carries the restated probe");
  if (/since the intake preflight went live/.test(p)) {
    ok(!/;/.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the restated probe is one read-only SELECT with no write keyword");
    ok(!/LIKE '%[a-z ]{40,}/.test(p), "no LIKE literal over D1's 50-byte limit");
    const add = (id, status, ageMin, err) => w.prepare("INSERT INTO code_tasks VALUES (?,?,?,?,NULL)").run(id, status, iso(ageMin), err);
    let v = judge(w, p); ok(!v.pass && /pending: 0 of 8/.test(v.observed), "pending with no finished tasks", v);
    for (let i = 0; i < 8; i++) add("m" + i, "merged", 600 + i, null);
    v = judge(w, p); ok(v.pass, "ok with 8 merged tasks and no dead-on-arrival one", v);
    add("r1", "failed", 700, "CODE-TASK-REROUTE-1: rerouted to agent_issues; file larger than 60000 chars needs an anchor");
    add("pf1", "publish_failed", 700, "publish: patch larger than 200000 chars");
    add("sup", "closed", 700, "superseded: landed as PR 719 before this task ran");
    // CI-TEST-CLOCKS-1 (2026-10-20): "older than 14 days" was 20000 minutes, which is 13.9 days. It only read as old while the probe's own preflight bound
    // (2026-10-12T18:00) also excluded it; from 2026-10-26 that row sat inside both windows and the three assertions below counted it. 15 days is old on any day.
    add("old", "failed", 15 * 1440, "anchor occurs 0 times in the file");
    w.prepare("INSERT INTO code_tasks VALUES ('pre','failed','2026-10-10T10:00','anchor occurs 0 times in the file',NULL)").run();
    v = judge(w, p); ok(v.pass, "a REROUTE-1 refusal, a publish-size failure, a superseded close, a row older than 14 days and a row before the preflight do not read as dead-on-arrival", v);
    add("bad1", "failed", 100, "anchor occurs 0 times in the file; it must occur exactly once");
    v = judge(w, p); ok(!v.pass && /dead-on-arrival tasks reached the propose step in the last 14 days: 1/.test(v.observed), "a raw anchor-occurs-0 task fails", v);
    w.prepare("DELETE FROM code_tasks WHERE id = 'bad1'").run();
    add("bad2", "needs_human", 90, "file larger than 900000 chars, too large for the loop");
    v = judge(w, p); ok(!v.pass && /dead-on-arrival/.test(v.observed), "a raw file-larger-than task fails", v);
    w.prepare("DELETE FROM code_tasks WHERE id = 'bad2'").run();
    for (let i = 0; i < 12; i++) add("f" + i, "failed", 500 + i, "patch rejected on review");
    v = judge(w, p); ok(!v.pass && /under 0\.45: 8 of 22/.test(v.observed), "a success rate under 0.45 fails with the counts", v);
  }
  // the old probe would have failed on the same fixture of refusals (the defect the restatement removes)
  const o = world({ old: OLD });
  o.prepare("INSERT INTO code_tasks VALUES ('r1','failed',?,'CODE-TASK-REROUTE-1: rerouted to agent_issues; file larger than 60000 chars needs an anchor',NULL)").run(iso(100));
  for (let i = 0; i < 8; i++) o.prepare("INSERT INTO code_tasks VALUES (?,'merged',?,NULL,NULL)").run("m" + i, iso(100 + i));
  ok(!judge(o, OLD).pass, "the old probe reads a preflight refusal as a defect (this is what the file fixes)");
}

// ---- the issue-2007 probe ----
{
  const w = applied();
  const p = w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2007'").get().verify_probe;
  ok(/ended needs_human on an anchor/.test(p), "the issue-2007 contract carries the restated probe");
  if (/ended needs_human on an anchor/.test(p)) {
    ok(!/;/.test(p) && !/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(p), "the restated probe is one read-only SELECT with no write keyword");
    const task = (id, status, ageMin, err) => w.prepare("INSERT INTO code_tasks VALUES (?,?,?,?,NULL)").run(id, status, iso(ageMin), err);
    let v = judge(w, p); ok(!v.pass && /no anchor-located event/.test(v.observed), "fails when the repair is not running (no anchor-located event)", v);
    w.prepare("INSERT INTO cloud_ops_events VALUES ('al1',?,'code-task.anchor-located','x','qnfo-code-orchestrator','ok')").run(iso(100));
    for (let i = 0; i < 5; i++) task("p" + i, "merged", 20160 + 100 + i, null);       // the previous 14 days
    for (let i = 0; i < 6; i++) task("c" + i, "merged", 600 + i, null);                // the last 14 days
    v = judge(w, p); ok(v.pass, "ok: repair running, no needs_human on an anchor, the task count rose", v);
    task("fr", "failed", 700, "CODE-TASK-REROUTE-1: rerouted to agent_issues; file larger than 60000 chars needs an anchor");
    w.prepare("INSERT INTO cloud_ops_events VALUES ('f1',?,'code-task.fail','ct_x read: file larger than 60000 chars needs an anchor','qnfo-code-orchestrator','error')").run(iso(60));
    v = judge(w, p); ok(v.pass, "a rerouted (failed) task and its code-task.fail event are the intended end state and do not read as the defect", v);
    task("old1", "needs_human", 30000, "anchor occurs 0 times in the file");
    ok(judge(w, p).pass, "a needs_human anchor task older than 14 days does not count");
    task("nh", "needs_human", 300, "anchor occurs 2 times in the file; it must occur exactly once");
    v = judge(w, p); ok(!v.pass && /1 tasks ended needs_human on an anchor/.test(v.observed), "a needs_human task with an anchor error inside 14 days fails", v);
    w.prepare("DELETE FROM code_tasks WHERE id = 'nh'").run();
    for (let i = 0; i < 20; i++) task("q" + i, "merged", 20160 + 200 + i, null);       // the previous window grows past the current one
    v = judge(w, p); ok(!v.pass && /lower than the 14 days before/.test(v.observed), "a task count that fell against the previous 14 days fails", v);
  }
  const o = world({ old: OLD });
  o.prepare("INSERT INTO cloud_ops_events VALUES ('al1',?,'code-task.anchor-located','x','j','ok')").run(iso(100));
  o.prepare("INSERT INTO cloud_ops_events VALUES ('f1',?,'code-task.fail','ct_x read: file larger than 60000 chars needs an anchor','j','error')").run(iso(60));
  ok(!judge(o, OLD2007).pass, "the old probe reads a rerouted anchor refusal as a defect (this is what the file fixes)");
}

// ---- re-run and rollback ----
if (!SKIP) {
  const w = applied();
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM control_alternate_probes").all(), w.prepare("SELECT * FROM control_registry").all(), w.prepare("SELECT * FROM remediation_contracts").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
  const once = snap();
  w.exec(body);
  ok(snap() === once, "a second apply changes nothing");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "one decision_log row");
  const pre = world({ old: OLD });
  const preSnap = JSON.stringify([pre.prepare("SELECT * FROM control_registry").all(), pre.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all()]);
  w.exec(rollback);
  ok(JSON.stringify([w.prepare("SELECT * FROM control_registry").all(), w.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all()]) === preSnap, "the Rollback restores the evidence text and the old issue-2067 and issue-2007 probe texts for text");
  ok(w.prepare("SELECT COUNT(*) n FROM control_alternate_probes").get().n === 0, "the Rollback removes the probe row");
}

console.log(`cluster-d-probes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
