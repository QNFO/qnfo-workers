// REM-A4-PROGRAMS-3 offline suite: replays migrations/2026-10-26-rem-a4-programs.sql, -2.sql and -3.sql in order on node:sqlite over the live-shaped base schema
// of qnfo-fleet-control/breach-doctor.test.mjs plus deployment_history, transformation_levers, metric_registry and the live text of v_issue_family_throughput.
// Proves: the unmet messages of the probes of issue-100294, issue-100318, issue-100366 and the three unmet messages of issue-100279 read "unmet:" and every
// condition still reads as before; the 7-day follow-up of issue-100279 stays "pending:"; the consumer's rule (scripts/remediation_consumer.py is_deferred_read, mirrored
// here) treats every "unmet:" read as a failure and the 7-day read as a deferral; a replay changes nothing; the Rollback line restores the "pending:" texts byte for byte.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-programs-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql1 = readFileSync(here("./2026-10-26-rem-a4-programs.sql"), "utf8");
const sql2 = readFileSync(here("./2026-10-26-rem-a4-programs-2.sql"), "utf8");
const sql = readFileSync(here("./2026-10-26-rem-a4-programs-3.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const firstTest = readFileSync(here("./rem-a4-programs.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const v0 = firstTest.indexOf("const FAMILY_VIEW = `"), v1 = firstTest.indexOf("`;", v0);
ok(v0 > 0 && v1 > v0, "the first suite carries the live text of v_issue_family_throughput");
const FAMILY_VIEW = firstTest.slice(v0 + "const FAMILY_VIEW = `".length, v1);

// the consumer's rule, mirrored from scripts/remediation_consumer.py (is_deferral, is_measured_pending, is_deferred_read)
const isDeferral = (o) => /^pending/i.test(String(o ?? "").trim());
const isMeasuredPending = (o) => { const s = String(o ?? "").trim(); if (!/[0-9]/.test(s)) return false; const low = s.toLowerCase(); return ["ceiling", "target", "threshold", "limit", "fewer than", "more than"].some((x) => low.includes(x)) || [" <= ", " >= ", " < ", " > "].some((x) => s.includes(x)); };
const isDeferredRead = (o) => isDeferral(o) && !isMeasuredPending(o);
const verdictOf = (r) => (r.expected === r.observed ? "pass" : isDeferredRead(r.observed) ? "deferred" : "fail");

const CLASSES = ["issue-100299", "issue-100294", "issue-100279", "issue-100279-BACKFILL-1", "issue-100318", "issue-100318-BACKFILL-1", "issue-100366", "issue-100366-BACKFILL-1"];
function world(upTo = 3) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("ALTER TABLE code_tasks ADD COLUMN merge_state TEXT");
  w.exec("CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))");
  w.exec("CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT)");
  w.exec("CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER NOT NULL, n INTEGER NOT NULL, key TEXT, status TEXT NOT NULL DEFAULT 'pending', landed_at TEXT, UNIQUE(tp, n))");
  w.exec(FAMILY_VIEW);
  for (const id of [100299, 100293, 100294, 100279, 100318, 100366, 2008]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original text', 'qnfo-fleet-control', 'critical', 'open', 1, 1)").run(id, "ISSUE-" + id + ": a program issue");
  }
  const status = { "issue-100279": "monitoring", "issue-100318": "monitoring", "issue-100366": "monitoring", "issue-100318-BACKFILL-1": "probe-review-refused", "issue-100366-BACKFILL-1": "probe-review-refused" };
  for (const c of CLASSES) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES (?, ?, 'pre', 'old action VACUOUS-PROBE-V3-1', ?, 'd1-query', 3, 'qnfo-ops', ?, 'old-module', 7, 'fail')")
      .run(c, Number(/issue-(\d+)/.exec(c)[1]), "SELECT 'ok' AS expected, 'old probe of " + c + "' AS observed", status[c] || "active");
  }
  w.exec(sql1);
  w.exec(sql2);
  if (upTo >= 3) w.exec(sql);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const probeText = (w, cls) => q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p;
const probe = (w, cls) => w.prepare(probeText(w, cls)).get();
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19) + "Z";

const w = world();
const before = world(2);

for (const c of ["issue-100294", "issue-100318", "issue-100366"]) {
  const p = probeText(w, c), p0 = probeText(before, c);
  ok(!p.includes("'pending: ") && p.includes("'unmet: ") && p.replace(/'unmet: /g, "'pending: ") === p0, c + ": every pending message became unmet and nothing else changed");
}
{
  const p = probeText(w, "issue-100279"), p0 = probeText(before, "issue-100279");
  ok(p.includes("'pending: the 7-day follow-up after the lever landed (") && !p.includes("'pending: lever TP-1.23") && !p.includes("'pending: no control-plane code task") && !p.includes("'pending: no code task from a METRIC-TRIGGER"), "100279: the three unmet messages changed, the 7-day follow-up stays pending");
  ok(p.replace(/'unmet: /g, "'pending: ") === p0, "100279: nothing else changed");
}
ok(q1(w, "SELECT COUNT(*) n FROM remediation_contracts WHERE status = 'active' AND class IN ('issue-100279', 'issue-100294', 'issue-100299', 'issue-100318', 'issue-100366')").n === 5, "the five contracts stay active");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-PROGRAMS-3:%'").n === 1, "one decision_log row for this file");

// ---- the reads, and what the consumer makes of them
{
  const ratio = (v) => w.prepare("INSERT OR REPLACE INTO metric_registry (metric, layer, kind, last_value) VALUES ('issue_drain_ratio_24h', 'operational', 'target', ?)").run(String(v));
  const issue = (title, status, ageMin) => w.prepare("INSERT INTO agent_issues (title, description, source, priority, status, created_at, updated_at) VALUES (?, 't', 'x', 'medium', ?, ?, ?)").run(title, status, Date.now() - ageMin * 60000, Date.now() - ageMin * 60000);
  ratio(1.6);
  for (let i = 0; i < 4; i++) issue("FAMX-1: item " + i, "open", 30);
  let r = probe(w, "issue-100294");
  ok(/^unmet: 1 families have net inflow above 0 with three or more open, largest FAMX-1 \+4$/.test(r.observed) && verdictOf(r) === "fail", "100294: a leaking family is an unmet read and a failure", r);
  w.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT id, 'x', 'closed', 'o', '2026-10-01', 'evidence' FROM agent_issues WHERE title LIKE 'FAMX-1:%'");
  ratio(1.2);
  r = probe(w, "issue-100294");
  ok(/^unmet: issue_drain_ratio_24h 1\.2 is below 1\.5$/.test(r.observed) && verdictOf(r) === "fail", "100294: the ratio clause is an unmet read and a failure", r);
  ratio(1.6);
  r = probe(w, "issue-100294");
  ok(r.expected === "ok" && r.observed === "ok" && verdictOf(r) === "pass", "100294: both clauses hold: pass", r);

  r = probe(w, "issue-100318");
  ok(/^unmet: 0 of 4 staged deploy rows/.test(r.observed) && verdictOf(r) === "fail", "100318: no staged rows is an unmet read and a failure", r);
  for (const n of ["qnfo-ai", "qnfo-gateway"]) for (const a of ["staged-promote", "staged-rollback"]) w.prepare("INSERT INTO deployment_history (resource_type, resource_name, action) VALUES ('worker', ?, ?)").run(n, a);
  r = probe(w, "issue-100318");
  ok(/^unmet: the staged rows exist but lever TP-1\.17 is not landed/.test(r.observed) && verdictOf(r) === "fail", "100318: the lever clause", r);
  w.prepare("INSERT INTO transformation_levers (tp, n, key, status, landed_at) VALUES (1, 17, 'staged-rollout-ai-gateway', 'landed', ?)").run(new Date().toISOString());
  r = probe(w, "issue-100318");
  ok(/^unmet: no code task on qnfo-gateway merged by the runner$/.test(r.observed) && verdictOf(r) === "fail", "100318: the gateway merge clause", r);
  w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at, merged_at, merge_state) VALUES ('ct_g', 'qnfo-workers', 'qnfo-gateway/worker.js', 'g', 'merged', 'done', 1, ?, ?, ?, 'verified')").run(iso(300), iso(200), iso(200));
  r = probe(w, "issue-100318");
  ok(r.observed === "ok" && verdictOf(r) === "pass", "100318: all clauses hold: pass", r);

  r = probe(w, "issue-100366");
  ok(/^unmet: metric worker_requests_nonpublic_per_day is not registered/.test(r.observed) && verdictOf(r) === "fail", "100366: an unregistered metric is an unmet read and a failure", r);
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('worker_requests_nonpublic_per_day', 'operational', 'target', '3500')").run();
  ok(/^unmet: worker_requests_nonpublic_per_day 3500 is not under 3000$/.test(probe(w, "issue-100366").observed), "100366: over 3000 is unmet");
  w.prepare("UPDATE metric_registry SET last_value = '2500' WHERE metric = 'worker_requests_nonpublic_per_day'").run();
  ok(/^unmet: the metric is under 3000 but lever TP-2\.3 is not landed$/.test(probe(w, "issue-100366").observed), "100366: the lever clause");
  w.prepare("INSERT INTO transformation_levers (tp, n, key, status, landed_at) VALUES (2, 3, 'one-probe-pass', 'verified', ?)").run(new Date().toISOString());
  ok(probe(w, "issue-100366").observed === "ok", "100366: metric and lever hold: ok");

  const lever = (days) => w.prepare("INSERT OR REPLACE INTO transformation_levers (tp, n, key, status, landed_at) VALUES (1, 23, 'code-loop-control-plane', 'verified', ?)").run(new Date(Date.now() - days * 86400000).toISOString());
  const task = (id, path, state, goal) => w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at, merged_at, merged_sha, merge_state) VALUES (?, 'qnfo-workers', ?, ?, 'merged', 'done', 1, ?, ?, ?, 'abcdef0123456', ?)").run(id, path, goal, iso(3000), iso(2900), iso(2900), state);
  r = probe(w, "issue-100279");
  ok(/^unmet: lever TP-1\.23 is not landed$/.test(r.observed) && verdictOf(r) === "fail", "100279: lever not landed is unmet and a failure", r);
  lever(8);
  r = probe(w, "issue-100279");
  ok(/^unmet: no control-plane code task merged by the runner and verified by the canary$/.test(r.observed) && verdictOf(r) === "fail", "100279: no verified merge is unmet", r);
  task("ct_cp", "qnfo-fleet-control/worker.js", "verified", "[issue #100344] IL-CLOSE-VS-PROBE-1: x");
  r = probe(w, "issue-100279");
  ok(/^unmet: no code task from a METRIC-TRIGGER issue/.test(r.observed) && verdictOf(r) === "fail", "100279: no METRIC-TRIGGER origin task is unmet", r);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (99940, 'METRIC-TRIGGER-4982-X: kernel', 'x', 'qnfo-fleet-control', 'high', 'open', 1, 1)").run();
  task("ct_im99940", "qnfo-ai/worker.js", "verified", "METRIC-TRIGGER-4982-X: kernel");
  r = probe(w, "issue-100279");
  ok(r.observed === "ok" && verdictOf(r) === "pass", "100279: every clause holds: pass", r);
  lever(2);
  r = probe(w, "issue-100279");
  ok(/^pending: the 7-day follow-up after the lever landed \(/.test(r.observed) && verdictOf(r) === "deferred", "100279: the 7-day time gate is still a deferral", r);
}

// ---- replay and rollback
{
  const w2 = world();
  const snap = () => JSON.stringify([w2.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w2.prepare("SELECT action FROM decision_log").all()]);
  const s = snap();
  w2.exec(sql);
  ok(snap() === s, "a replay changes nothing");
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; UPDATE ").map((x, i) => (i ? "UPDATE " + x : x)).join(";\n"));
  for (const c of ["issue-100294", "issue-100318", "issue-100366", "issue-100279"]) ok(probeText(w2, c) === probeText(before, c), "Rollback restores the pending texts of " + c + " byte for byte");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
