// REM-A4-PROGRAMS-2 offline suite: replays migrations/2026-10-26-rem-a4-programs.sql and then migrations/2026-10-26-rem-a4-programs-2.sql on node:sqlite
// over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs. Proves: the header opts in and nothing is deleted or dropped; the
// correction notes land once on 100293, 100294 and 100299 after the first file's notes, the dated notes once on 100279, 100318, 100366 and 2008; the action text of
// contract issue-100318 is corrected (only that phrase); the probe of issue-100279 gets the clause "a code task from a METRIC-TRIGGER issue is merged and verified on a
// control-plane worker" and still reads every earlier clause; an issue that is not open gets no note; no status changes; one decision_log row; a replay changes
// nothing; the Rollback line restores the first file's probe and the previous action texts.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-programs-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql1 = readFileSync(here("./2026-10-26-rem-a4-programs.sql"), "utf8");
const sql = readFileSync(here("./2026-10-26-rem-a4-programs-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
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

const CLASSES = ["issue-100299", "issue-100294", "issue-100279", "issue-100279-BACKFILL-1", "issue-100318", "issue-100318-BACKFILL-1", "issue-100366", "issue-100366-BACKFILL-1"];
const ISSUES = [100299, 100293, 100294, 100279, 100318, 100366, 2008];
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("ALTER TABLE code_tasks ADD COLUMN merge_state TEXT");
  w.exec("CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER NOT NULL, n INTEGER NOT NULL, key TEXT, status TEXT NOT NULL DEFAULT 'pending', landed_at TEXT, UNIQUE(tp, n))");
  for (const id of ISSUES) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original text', 'qnfo-fleet-control', 'critical', ?, 1, 1)").run(id, "ISSUE-" + id + ": a program issue", o.closed === id ? "closed" : "open");
  }
  const status = { "issue-100279": "monitoring", "issue-100318": "monitoring", "issue-100366": "monitoring", "issue-100318-BACKFILL-1": "probe-review-refused", "issue-100366-BACKFILL-1": "probe-review-refused" };
  for (const c of CLASSES) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES (?, ?, 'pre', 'old action VACUOUS-PROBE-V3-1', ?, 'd1-query', 3, 'qnfo-ops', ?, 'old-module', 7, 'fail')")
      .run(c, Number(/issue-(\d+)/.exec(c)[1]), "SELECT 'ok' AS expected, 'old probe of " + c + "' AS observed", status[c] || "active");
  }
  w.exec(sql1);
  if (!o.skip2) w.exec(sql);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const desc = (w, id) => q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
const count = (s, m) => s.split(m).length - 1;
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19) + "Z";

const w = world();
const w1 = world({ skip2: true });
const probe1 = q1(w1, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100279'").p;
const action1_318 = q1(w1, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a;
const action1_279 = q1(w1, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100279'").a;

// ---- notes
for (const id of [100299, 100293, 100294]) {
  const d = desc(w, id);
  ok(d.startsWith("original text\n") && count(d, "REM-A4-PROGRAMS 2026-10-26") === 1 && count(d, "REM-A4-PROGRAMS-2 correction") === 1 && d.indexOf("REM-A4-PROGRAMS 2026-10-26") < d.indexOf("REM-A4-PROGRAMS-2 correction"), "issue " + id + " keeps the first note and gets one correction after it", d.slice(0, 80));
}
for (const id of [100279, 100318, 100366, 2008]) {
  const d = desc(w, id);
  ok(d.startsWith("original text\n") && count(d, "REM-A4-PROGRAMS-2 2026-10-26") === 1, "issue " + id + " gets one dated note after its original text", d.slice(0, 80));
}
ok(/ct_im1000430c/.test(desc(w, 100294)) && /PR 4736 belongs to BREACH-DOCTOR-WATCHMAKER-1/.test(desc(w, 100294)), "the 100294 correction names the merged tasks and the family of PR 4736");
ok(/95 merged tasks/.test(desc(w, 100293)) && /withdrawn/.test(desc(w, 100293)), "the 100293 correction states the recount and withdraws the unmeasured claims");
ok(/mislabel/.test(desc(w, 100293)) && /mislabel/.test(desc(w, 100294)) && /about 19:30Z/.test(desc(w, 100299)), "the three corrections state the real time of the reads");
ok(/2026-11-08T09:31Z/.test(desc(w, 2008)) && /MERGE-STREAMLINE-1/.test(desc(w, 2008)), "the 2008 note states the clear date and the gate change");
ok(/2026-10-27T04:00Z/.test(desc(w, 100279)) && /1000171/.test(desc(w, 100279)) && /ct_im99940/.test(desc(w, 100279)), "the 100279 note states the time gate, the one revert issue and the METRIC-TRIGGER task");

// ---- contract texts
ok(/12 on qnfo-ai in 7 days/.test(action1_318) && !/12 merged \(8 verified\)/.test(action1_318), "migration 1 left the phrase to correct");
{
  const a = q1(w, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a;
  ok(a === action1_318.replace("12 on qnfo-ai in 7 days", "12 merged (8 verified) on qnfo-ai in 7 days"), "the action phrase of issue-100318 is corrected and the rest of the text is kept");
  const a279 = q1(w, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100279'").a;
  ok(/at least one code task whose origin is a METRIC-TRIGGER issue is merged and verified/.test(a279) && a279.length > action1_279.length, "the action of issue-100279 names the METRIC-TRIGGER clause");
}
ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'").n === 7, "no issue status is changed");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A4-PROGRAMS-2:%'").n === 1, "one decision_log row for this file");
{
  const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100279'").p;
  ok(p.includes("METRIC-TRIGGER-%") && p.length > probe1.length && !/;/.test(p) && !/\b(update|delete|insert|drop|alter)\s/i.test(p), "the probe of issue-100279 carries the new clause, no semicolon, no write keyword");
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100279'").s === "active", "the contract stays active");
}

// ---- the 100279 probe, clause by clause, on top of both files
{
  const p = () => w.prepare(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100279'").p).get();
  const lever = (days) => w.prepare("INSERT OR REPLACE INTO transformation_levers (tp, n, key, status, landed_at) VALUES (1, 23, 'code-loop-control-plane', 'verified', ?)").run(new Date(Date.now() - days * 86400000).toISOString());
  const task = (id, path, state, goal) => w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at, merged_at, merged_sha, merge_state) VALUES (?, 'qnfo-workers', ?, ?, 'merged', 'done', 1, ?, ?, ?, ?, ?)").run(id, path, goal, iso(3000), iso(2900), iso(2900), "abcdef0123456", state);
  let r = p();
  ok(/^pending: lever TP-1\.23 is not landed$/.test(r.observed), "100279: no lever row is pending", r);
  lever(8);
  r = p();
  ok(/^pending: no control-plane code task merged by the runner and verified by the canary$/.test(r.observed), "100279: a landed lever with no verified merge is pending", r);
  task("ct_cp", "qnfo-fleet-control/worker.js", "verified", "[issue #100344] IL-CLOSE-VS-PROBE-1: x");
  r = p();
  ok(/^pending: no code task from a METRIC-TRIGGER issue has been merged by the runner and verified on a control-plane worker$/.test(r.observed), "100279: a verified control-plane merge with no METRIC-TRIGGER origin is pending", r);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (99940, 'METRIC-TRIGGER-4982-FALSE-STOPS-7D: kernel recognition', 'x', 'qnfo-fleet-control', 'high', 'open', 1, 1)").run();
  task("ct_off", "q08-signal-engine/worker.js", "verified", "[issue #99940] METRIC-TRIGGER-4982-FALSE-STOPS-7D: x");
  r = p();
  ok(/^pending: no code task from a METRIC-TRIGGER issue/.test(r.observed), "100279: a METRIC-TRIGGER task on a worker outside the six does not count", r);
  task("ct_im99940", "qnfo-ai/worker.js", "verified", "METRIC-TRIGGER-4982-FALSE-STOPS-7D: kernel recognition");
  r = p();
  ok(r.expected === "ok" && r.observed === "ok", "100279: a verified METRIC-TRIGGER task on qnfo-ai (id ct_im<issue>) completes the clause: ok", r);
  w.prepare("DELETE FROM code_tasks WHERE id = 'ct_im99940'").run();
  task("ct_prefix", "qnfo-gateway/worker.js", "verified", "[issue #99940] METRIC-TRIGGER-4982-FALSE-STOPS-7D: kernel recognition");
  ok(p().observed === "ok", "100279: the goal-prefix form of the task also counts");
  w.prepare("UPDATE code_tasks SET merge_state = 'revert-failed' WHERE id = 'ct_prefix'").run();
  ok(/^pending: no code task from a METRIC-TRIGGER issue/.test(p().observed), "100279: an unverified METRIC-TRIGGER task does not count");
  w.prepare("UPDATE code_tasks SET merge_state = 'verified' WHERE id = 'ct_prefix'").run();
  lever(2);
  ok(/^pending: the 7-day follow-up after the lever landed/.test(p().observed), "100279: the 7-day clause still holds");
  lever(8);
  task("ct_rev", "qnfo-ops/worker.js", "revert-failed", "[issue #1] x");
  ok(/^fail: a code-loop merge on a control-plane worker ended reverted in the last 7 days$/.test(p().observed), "100279: a reverted loop merge still fails it");
}

// ---- replay and rollback
{
  const w2 = world();
  const snap = () => JSON.stringify([w2.prepare("SELECT id, description, updated_at FROM agent_issues ORDER BY id").all(), w2.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w2.prepare("SELECT action FROM decision_log").all()]);
  const s1 = snap();
  w2.exec(sql1);
  w2.exec(sql);
  ok(snap() === s1, "a replay of both files changes nothing");
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(q1(w2, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100279'").p === probe1, "Rollback restores the first file's probe of issue-100279 byte for byte");
  ok(q1(w2, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100279'").a === action1_279, "Rollback restores the first file's action of issue-100279");
  ok(q1(w2, "SELECT action a FROM remediation_contracts WHERE class = 'issue-100318'").a === action1_318, "Rollback restores the previous action phrase of issue-100318");
}
{
  const w3 = world({ closed: 2008 });
  ok(desc(w3, 2008) === "original text", "an issue that is not open gets no note");
  ok(desc(w3, 100279).includes("REM-A4-PROGRAMS-2"), "the open ones still do");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
