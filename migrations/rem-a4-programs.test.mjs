// REM-A4-PROGRAMS-1 offline suite: replays migrations/2026-10-26-rem-a4-programs.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs plus metric_history, deployment_history, transformation_levers, the live text of
// v_issue_family_throughput and code_tasks.merge_state.
// Proves: the header opts in and nothing is deleted or dropped; the five contracts (issue-100299, issue-100294, issue-100279, issue-100318,
// issue-100366) are active with a probe that reads its definition of done and that holds only when it holds and breaks on each missing clause;
// the three backfill twins are superseded; the pre-change rows are kept in bak_20261026_rem_a4_programs; the three dated notes and the one
// decision_log row are written once; a replay changes nothing; the Rollback line restores the old probes; no probe literal carries a write keyword.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-programs.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-programs.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const FAMILY_VIEW = `CREATE VIEW v_issue_family_throughput AS
WITH f AS (
  SELECT id, status, created_at, updated_at,
    CASE WHEN title LIKE 'METRIC-TRIGGER-%' THEN 'METRIC-TRIGGER'
         ELSE substr(title, 1, MIN(CASE WHEN instr(title, ' ') > 0 THEN instr(title, ' ') ELSE 999 END, CASE WHEN instr(title, ':') > 0 THEN instr(title, ':') ELSE 999 END) - 1)
    END AS family
  FROM agent_issues
), n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms)
SELECT family,
  SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS opened_24h,
  SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS closed_24h,
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_now,
  SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) - SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS net_inflow_24h,
  ROUND(1.0 * SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) / MAX(1, SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END)), 2) AS drain_ratio_24h,
  ROUND(MAX(CASE WHEN status = 'open' THEN (n.now_ms - created_at) / 3600000.0 END), 1) AS oldest_open_h
FROM f, n
WHERE family <> ''
GROUP BY family
HAVING open_now > 0 OR opened_24h > 0 OR closed_24h > 0`;

const CLASSES = ["issue-100299", "issue-100294", "issue-100279", "issue-100279-BACKFILL-1", "issue-100318", "issue-100318-BACKFILL-1", "issue-100366", "issue-100366-BACKFILL-1"];
const OLD_PROBE = (c) => "SELECT 'ok' AS expected, 'old probe of " + c + "' AS observed";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("ALTER TABLE code_tasks ADD COLUMN merge_state TEXT");
  w.exec("CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))");
  w.exec("CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT)");
  w.exec("CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER NOT NULL, n INTEGER NOT NULL, key TEXT, status TEXT NOT NULL DEFAULT 'pending', landed_at TEXT, UNIQUE(tp, n))");
  w.exec(FAMILY_VIEW);
  for (const id of [100299, 100294, 100293, 100279, 100318, 100366]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original text', 'qnfo-fleet-control', 'critical', 'open', 1, 1)").run(id, "PROGRAM-" + id + ": a program issue");
  }
  const status = { "issue-100279": "monitoring", "issue-100318": "monitoring", "issue-100366": "monitoring", "issue-100318-BACKFILL-1": "probe-review-refused", "issue-100366-BACKFILL-1": "probe-review-refused" };
  for (const c of CLASSES) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES (?, ?, 'pre', 'old action VACUOUS-PROBE-V3-1', ?, 'd1-query', 3, 'qnfo-ops', ?, 'old-module', 7, 'fail')")
      .run(c, Number(/issue-(\d+)/.exec(c)[1]), OLD_PROBE(c), status[c] || "active");
  }
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const probe = (w, cls) => { const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p; return w.prepare(p).get(); };
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19) + "Z";
const day = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

const w = world();
w.exec(sql);

// ---- structure
ok(CLASSES.length === 8 && q1(w, "SELECT COUNT(*) n FROM bak_20261026_rem_a4_programs").n === 8, "the backup keeps the eight pre-change rows");
for (const c of ["issue-100299", "issue-100294", "issue-100279", "issue-100318", "issue-100366"]) {
  const r = q1(w, "SELECT status, module, max_attempts, attempts, last_verdict, next_due_at, action FROM remediation_contracts WHERE class = ?", c);
  ok(r.status === "active" && r.module === "rem-a4-programs" && r.max_attempts === 1000 && r.attempts === 0 && r.last_verdict === null && r.next_due_at, c + " is active, module rem-a4-programs, attempts reset, due now", r);
  ok(!/VACUOUS-PROBE-V3-1/.test(r.action) && /MEASURES the defect/.test(r.action), c + " carries an honest action text");
  const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", c).p;
  ok(!/\b(update|delete|insert|drop|alter)\s/i.test(p), c + " probe literals carry no write keyword");
  ok(/^SELECT '(ok|7)' AS expected/.test(p), c + " probe returns expected and observed");
}
for (const c of ["issue-100279-BACKFILL-1", "issue-100318-BACKFILL-1", "issue-100366-BACKFILL-1"]) {
  const r = q1(w, "SELECT status, last_verdict FROM remediation_contracts WHERE class = ?", c);
  ok(r.status === "superseded" && /REM-A4-PROGRAMS-1/.test(r.last_verdict), c + " is superseded by the contract on the issue's own class", r);
}
ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100279-BACKFILL-1'").s === "superseded", "backfill twin of 100279 superseded");
for (const id of [100299, 100294, 100293]) {
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
  ok(d.startsWith("original text") && d.split("REM-A4-PROGRAMS 2026-10-26").length === 2, "issue " + id + " gets one dated note after its original text");
}
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 100318").d === "original text", "issues 100318 and 100366 carry their note in the contract action only");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-PROGRAMS-1:%'").n === 1, "one decision_log row");
ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100299").s === "open", "no issue status is changed");

// ---- 100299: seven consecutive daily reads at 0
{
  const p = (db) => probe(db, "issue-100299");
  let r = p(w);
  ok(r.expected === "7" && r.observed === "0 of the last 7 daily reads are 0 (latest read none)", "100299: no daily reads is not 7", r);
  const ins = (db, d, v) => db.prepare("INSERT OR REPLACE INTO metric_history (metric, day, value, meets) VALUES ('issues_over_24h_no_doer', ?, ?, ?)").run(d, v, v === 0 ? 1 : 0);
  for (let i = 0; i <= 6; i++) ins(w, day(i), i === 3 ? 122 : 0);
  r = p(w);
  ok(r.observed === "6 of the last 7 daily reads are 0 (latest read 0)", "100299: six zero days and one 122 read 6 of 7", r);
  ins(w, day(3), 0);
  r = p(w);
  ok(r.expected === "7" && r.observed === "7", "100299: seven zero days pass", r);
  ins(w, day(7), 50); ins(w, day(8), 50);
  ok(p(w).observed === "7", "100299: reads older than 7 days do not count against it");
  ins(w, day(0), 4);
  r = p(w);
  ok(r.observed === "6 of the last 7 daily reads are 0 (latest read 4)", "100299: today's read of 4 breaks it again", r);
}

// ---- 100294: families and the drain ratio
{
  const p = () => probe(w, "issue-100294");
  const issue = (title, status, ageMin, updMin) => w.prepare("INSERT INTO agent_issues (title, description, source, priority, status, created_at, updated_at) VALUES (?, 't', 'x', 'medium', ?, ?, ?)").run(title, status, Date.now() - ageMin * 60000, Date.now() - updMin * 60000);
  const ratio = (v) => w.prepare("INSERT OR REPLACE INTO metric_registry (metric, layer, kind, last_value) VALUES ('issue_drain_ratio_24h', 'operational', 'target', ?)").run(String(v));
  ratio(1.6);
  for (let i = 0; i < 4; i++) issue("FAMX-1: item " + i, "open", 30, 30);
  let r = p();
  ok(r.expected === "ok" && /^pending: 1 families have net inflow above 0 with three or more open, largest FAMX-1 \+4$/.test(r.observed), "100294: a family with 4 opened, 0 closed and 4 open is named", r);
  w.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT id, 'x', 'closed', 'o', '2026-10-01', 'evidence' FROM agent_issues WHERE title LIKE 'FAMX-1:%'");
  w.prepare("UPDATE agent_issues SET updated_at = ? WHERE title LIKE 'FAMX-1:%'").run(Date.now() - 5 * 60000);
  r = p();
  ok(r.observed === "ok", "100294: the family drained, ratio 1.6: ok", r);
  ratio(1.2);
  r = p();
  ok(/^pending: issue_drain_ratio_24h 1\.2 is below 1\.5$/.test(r.observed), "100294: no family leaking but the ratio 1.2 is below 1.5", r);
  w.prepare("DELETE FROM metric_registry WHERE metric = 'issue_drain_ratio_24h'").run();
  r = p();
  ok(/unmeasured/.test(r.observed), "100294: an unmeasured ratio is pending, not ok", r);
}

// ---- 100279: the loop's control-plane merges
{
  const p = () => probe(w, "issue-100279");
  const lever = (landedDaysAgo, status = "verified") => w.prepare("INSERT OR REPLACE INTO transformation_levers (tp, n, key, status, landed_at) VALUES (1, 23, 'code-loop-control-plane', ?, ?)").run(status, new Date(Date.now() - landedDaysAgo * 86400000).toISOString());
  const task = (id, path, state, mergedMinAgo, sha) => w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at, merged_at, merged_sha, merge_state) VALUES (?, 'qnfo-workers', ?, 'g', 'merged', 'done', 1, ?, ?, ?, ?, ?)").run(id, path, iso(mergedMinAgo + 5), iso(mergedMinAgo), iso(mergedMinAgo), sha || null, state);
  let r = p();
  ok(/^pending: lever TP-1\.23 is not landed$/.test(r.observed), "100279: no lever row is pending", r);
  lever(8);
  r = p();
  ok(/^pending: no control-plane code task merged by the runner and verified by the canary$/.test(r.observed), "100279: a landed lever with no verified merge is pending", r);
  task("ct_a", "qnfo-fleet-control/worker.js", "verified", 60 * 24 * 3, "aaaaaaa1111111");
  lever(2);
  r = p();
  ok(/^pending: the 7-day follow-up after the lever landed \(/.test(r.observed), "100279: a lever landed 2 days ago has not had its 7 days", r);
  lever(8);
  r = p();
  ok(r.expected === "ok" && r.observed === "ok", "100279: lever landed 8 days ago, one verified merge, no revert: ok", r);
  lever(8, "pending");
  ok(/not landed/.test(p().observed), "100279: a pending lever is not landed");
  lever(8);
  task("ct_b", "qnfo-ai/worker.js", "revert-failed", 60 * 24 * 2, "bbbbbbb2222222");
  r = p();
  ok(/^fail: a code-loop merge on a control-plane worker ended reverted in the last 7 days$/.test(r.observed), "100279: a revert-failed loop merge in the window fails it", r);
  w.prepare("UPDATE code_tasks SET merged_at = ? WHERE id = 'ct_b'").run(iso(60 * 24 * 9));
  ok(p().observed === "ok", "100279: a revert older than 7 days is outside the window");
  const rev = (sha) => w.prepare("INSERT INTO agent_issues (title, description, source, priority, status, created_at, updated_at) VALUES (?, 't', 'x', 'high', 'open', ?, ?)").run("CONTROL-PLANE-REVERTED-1: push " + sha + " reverted, qnfo-gateway never reached the pushed VERSION", Date.now() - 3600000, Date.now() - 3600000);
  rev("9999999");
  ok(p().observed === "ok", "100279: a revert of a push no code task carries (a session push) does not fail it");
  rev("aaaaaaa");
  r = p();
  ok(/^fail: a CONTROL-PLANE-REVERTED-1 issue of the last 7 days names the push of a code-task merge$/.test(r.observed), "100279: a revert issue naming a code-task merge sha fails it", r);
}

// ---- 100318: the staged ledger, the lever and the gateway merge
{
  const p = () => probe(w, "issue-100318");
  const row = (name, action, status = "success") => w.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, status) VALUES ('worker', ?, ?, ?)").run(name, action, status);
  let r = p();
  ok(/^pending: 0 of 4 staged deploy rows/.test(r.observed), "100318: plain deploys are not staged rows", r);
  row("qnfo-ai", "deploy"); row("qnfo-ai", "staged-promote"); row("qnfo-ai", "staged-rollback"); row("qnfo-gateway", "staged-promote");
  r = p();
  ok(/^pending: 3 of 4 staged deploy rows/.test(r.observed), "100318: three of four rows", r);
  row("qnfo-gateway", "staged-rollback", "failure");
  ok(/^pending: 3 of 4/.test(p().observed), "100318: a failed rollback row is not counted");
  row("qnfo-gateway", "staged-rollback"); row("qnfo-gateway", "staged-rollback");
  r = p();
  ok(/^pending: the staged rows exist but lever TP-1\.17 is not landed/.test(r.observed), "100318: four distinct rows (duplicates collapsed) but the lever is not landed", r);
  w.prepare("INSERT INTO transformation_levers (tp, n, key, status, landed_at) VALUES (1, 17, 'staged-rollout-ai-gateway', 'landed', ?)").run(new Date().toISOString());
  r = p();
  ok(/^pending: no code task on qnfo-gateway merged by the runner$/.test(r.observed), "100318: the gateway merge clause", r);
  w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at, merged_at, merge_state) VALUES ('ct_g', 'qnfo-workers', 'qnfo-gateway/worker.js', 'g', 'merged', 'done', 1, ?, ?, ?, 'verified')").run(iso(300), iso(200), iso(200));
  r = p();
  ok(r.expected === "ok" && r.observed === "ok", "100318: all three clauses hold: ok", r);
}

// ---- 100366: the metric of the definition of done
{
  const p = () => probe(w, "issue-100366");
  const metric = (v) => w.prepare("INSERT OR REPLACE INTO metric_registry (metric, layer, kind, last_value) VALUES ('worker_requests_nonpublic_per_day', 'operational', 'target', ?)").run(v);
  let r = p();
  ok(/^pending: metric worker_requests_nonpublic_per_day is not registered/.test(r.observed), "100366: an unregistered metric cannot grade the lever", r);
  metric("3500");
  ok(/^pending: worker_requests_nonpublic_per_day 3500 is not under 3000$/.test(p().observed), "100366: 3500 a day is over");
  metric("2500");
  ok(/^pending: the metric is under 3000 but lever TP-2\.3 is not landed$/.test(p().observed), "100366: under 3000 but the lever is not landed");
  w.prepare("INSERT INTO transformation_levers (tp, n, key, status, landed_at) VALUES (2, 3, 'one-probe-pass', 'verified', ?)").run(new Date().toISOString());
  r = p();
  ok(r.expected === "ok" && r.observed === "ok", "100366: metric 2500 and the lever verified: ok", r);
  w.prepare("INSERT OR REPLACE INTO metric_registry (metric, layer, kind, last_value) VALUES ('worker_requests_nonpublic_per_day', 'operational', 'target', NULL)").run();
  ok(/has no value/.test(p().observed), "100366: a registered metric with no value is pending");
}

// ---- replay and rollback
{
  const w2 = world();
  w2.exec(sql);
  const snap = () => JSON.stringify([w2.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w2.prepare("SELECT id, description, updated_at FROM agent_issues ORDER BY id").all(), w2.prepare("SELECT action FROM decision_log").all()]);
  const s1 = snap();
  w2.exec(sql);
  ok(snap() === s1, "a replay changes nothing");
  ok(q1(w2, "SELECT COUNT(*) n FROM bak_20261026_rem_a4_programs").n === 8, "the backup is not re-taken on a replay");
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  for (const c of CLASSES) {
    const r = q1(w2, "SELECT verify_probe, status, module, max_attempts, last_verdict FROM remediation_contracts WHERE class = ?", c);
    ok(r.verify_probe === OLD_PROBE(c) && r.module === "old-module" && r.max_attempts === 3 && r.last_verdict === "fail", "Rollback restores " + c, r);
  }
  ok(q1(w2, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100279'").s === "monitoring" && q1(w2, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100279-BACKFILL-1'").s === "active", "Rollback restores the stub as monitoring and the twin as active");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
