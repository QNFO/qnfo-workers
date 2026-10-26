// CLOSE-CHANNEL-GUARD-1 offline suite (agent_issues 100419 CLOSE-CHANNEL-REQUIRED-1, 1000189 REMEDIATION-CONSUMER-MERGE-DENIED-1, 1000183, 1000140; metric session_dependent_issues_open).
// Applies migrations/2026-10-22-close-channel-required.sql on SQLite (node:sqlite) over fixtures with the live column lists and the live triggers that fire on its statements
// (agent_issues_runtime_probe_upd and agent_issues_code_probe_upd read out of migrations/2026-10-12-probe-line-edit-only.sql, the remediation_contracts update triggers, the append-only
// decision_log), and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and python3 scripts/apply_migrations.py --check;
//   2. the metric's own predicate (description LIKE '%session-task' || ':%') counts the three issues before and 0 after, case-insensitively, and the file changes no status, triage row or
//      close_evidence, and re-derives no contract from a probe line (the first runtime-probe and code-probe lines are untouched);
//   3. the invariant probe of issue-1000189 is a literal SELECT the consumer accepts, has no semicolon, and returns the same count as qnfo-fleet-control's RED_DRAIN_ELIGIBLE_REMEDIATION_SQL
//      (the predicate of metric remediation_contracts_over_budget) on a bad, a mixed and a good state;
//   4. the file replays as a no-op, leaves a closed issue, a hand-edited issue and a hand-written probe alone, and the Rollback restores the descriptions and the contract.
// Run: node --no-warnings migrations/close-channel-required.test.mjs
//   CCR_SKIP_MIGRATION=1 runs the same checks without applying the file, CCR_MIGRATION=<file> checks a mutated copy of the migration: each must fail.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const MIGRATION = process.env.CCR_MIGRATION ? resolve(process.env.CCR_MIGRATION) : join(here, "2026-10-22-close-channel-required.sql");
const sql = norm(readFileSync(MIGRATION, "utf8"));
const probeUpd = norm(readFileSync(join(here, "2026-10-12-probe-line-edit-only.sql"), "utf8"));
const fleetControl = norm(readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8"));
const SKIP = process.env.CCR_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
ok(PY !== null, "a python 3 interpreter is available for the consumer's own functions and the migration check");

// ---- 1. header and vocabulary ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 400, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(/module = 'red-drain-invariant-v1'/.test(rollback), "the Rollback restores the contract only while its module is ours, so a later hand edit is not clobbered");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql), "no duration is stated in hours or days (windows are in minutes)");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 8, "eight statements: two backups, four description edits, one contract, one decision (found " + stmts.length + ")");
ok(stmts.slice(2, 6).every((s) => /^UPDATE agent_issues SET description\b/.test(s) && /\bstatus = 'open'/.test(s) && /instr\(COALESCE\(description, ''\), '/.test(s)), "each description edit is guarded on the issue being open and on its exact old text");
ok(!stmts.some((t) => /^(INSERT( OR \w+)? INTO|DELETE FROM)\s+"?(agent_issues|issue_triage)\b/i.test(t)) && !stmts.some((t) => /^UPDATE agent_issues SET (?!description\b)/i.test(t)) && !stmts.some((t) => /^UPDATE issue_triage/i.test(t)), "no agent_issues row is inserted or deleted, nothing but description is updated, and issue_triage is untouched (nothing closes)");
{
  const chk = PY ? spawnSync(PY, ["-I", join(root, "scripts", "apply_migrations.py"), "--check", MIGRATION], { encoding: "utf8", cwd: root }) : { status: 1, stdout: "", stderr: "no python" };
  let j = {}; try { j = JSON.parse(String(chk.stdout).trim().split("\n").pop()); } catch (e) { j = {}; }
  ok(chk.status === 0 && j.ok === true && j.db === "qnfo-audit" && j.statements === 8, "python3 scripts/apply_migrations.py --check accepts the file", [chk.status, j, String(chk.stderr).slice(0, 200)]);
}

// ---- 2. fixture: the live shapes ----
const cut = (name) => { const a = probeUpd.indexOf("CREATE TRIGGER IF NOT EXISTS " + name); return probeUpd.slice(a, probeUpd.indexOf("\nEND;", a) + 5).replace("IF NOT EXISTS ", ""); };
const RUNTIME_TRIGGER = cut("agent_issues_runtime_probe_upd");
const CODE_TRIGGER = cut("agent_issues_code_probe_upd");
ok(RUNTIME_TRIGGER.length > 1000 && CODE_TRIGGER.length > 1000, "both probe-line triggers were read out of migrations/2026-10-12-probe-line-edit-only.sql", [RUNTIME_TRIGGER.length, CODE_TRIGGER.length]);
const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, path TEXT, last_error TEXT);
${RUNTIME_TRIGGER}
${CODE_TRIGGER}
CREATE TABLE decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`;
const MARKER_100419 = "session-task: repo=qnfo-workers path=migrations/2026-10-22-close-channel-required.sql";
const MARKER_1000189 = "session-task: repo=qnfo-workers path=scripts/remediation_consumer.py";
const MARKER_1000140 = "session-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js";
const DESC_100419 = "Audit 2026-10-21 (deepchat-session): 449 of 900 agent_issues closes in 7d carry NULL close_channel. DoD: every UPDATE agent_issues SET status IN (closed,resolved,wontfix) path writes close_channel; probe: SELECT COUNT(*) ... = 0 over 48h.\n" + MARKER_100419 + "\n(MERGE-SCOPE-INTAKE-1 2026-10-21T11:36Z, qnfo-code-orchestrator: session task: path migrations/2026-10-22-close-channel-required.sql is outside the merge runner's auto-merge scope: the loop cannot ship a change to it, so it is a session task; no code task was built.)\n\nScope of this task: qnfo-pipeline-ops/worker.js, both sites.\ncode-task: repo=qnfo-workers path=qnfo-pipeline-ops/worker.js\n\nCANARY-AHEAD-PROBES-1 closing probe (migrations/2026-10-26-canary-ahead-probes.sql): the two script closes now write a channel.\ncode-probe: {\"paths\": [\"scripts/conflict_repair.py\"], \"contains\": \"auto:conflict-repair-settle\"}\ncode-probe: {\"paths\": [\"scripts/apply_migrations.py\"], \"contains\": \"auto:migration-apply-resolve\"}";
const DESC_1000189 = "MEASURED 2026-10-25T12:1xZ (qnfo-audit.code_tasks, qnfo-audit.remediation_contracts).\n\nThe fix for the never-escalate defect lives in scripts/remediation_consumer.py (issue 1000183 carries `" + MARKER_1000189 + "`). That handoff target is a DEAD PATH by construction:\n\n- 7 code_tasks exist for path scripts/remediation_consumer.py. ALL 7 are status=failed.\n\nDEFINITION OF DONE: over-budget contracts in status active/holding = 0 for non-exempt classes.\n\n" + MARKER_1000189 + "\n(MERGE-SCOPE-INTAKE-1 2026-10-25T11:14Z, qnfo-code-orchestrator: session task: scripts/remediation_consumer.py is outside the merge runner's auto-merge scope (CM_SCRIPT_DENY): the loop cannot ship a change to it, so it is a session task; no code task was built.)";
const DESC_1000140 = "Charter pillar: autonomy. User-directed outcome: implement and deploy the existing Cloudflare Agents SDK service.\nDefinition of done: the dependency/consumer and worker-cap conditions are evidenced.\nruntime-probe: {\"url\": \"https://qnfo-agent-ws.q08.workers.dev/health\", \"status\": 200, \"contains\": \"qnfo-agent-ws\", \"min_version\": \"2.1.0\"}\n" + MARKER_1000140 + "\ncode-anchor: const normalizedPath = \"/\" + path.split(\"/\").filter(Boolean).join(\"/\");\n(NEEDS-ANCHOR-ROUTE-1 2026-10-25T18:53Z, qnfo-code-orchestrator 0.27.1-codeagent: no code task can place qnfo-agent-ws/worker.js: a session names the anchor, or the issue is filed with a code-anchor line.)";
const DESC_1000183 = "Live measure 2026-10-25T11:0xZ: 2154 contracts with attempts > max_attempts.\nFIX: in the stamp block, when (COALESCE(attempts,0) + 1) >= max_attempts set status='escalated'.\ncode-task: repo=qnfo-workers path=scripts/remediation_consumer.py";
const OLD_1000189_PROBE = "WITH denied_hits AS ( SELECT COUNT(*) AS n FROM code_tasks WHERE path = 'scripts/remediation_consumer.py' AND status = 'failed' AND last_error LIKE '%CM_SCRIPT_DENY%' ) SELECT '0 failed merge-denied tasks for scripts/remediation_consumer.py' AS expected, CASE WHEN n = 0 THEN '0 failed merge-denied tasks for scripts/remediation_consumer.py' ELSE n || ' failed merge-denied tasks for scripts/remediation_consumer.py' END AS observed FROM denied_hits";
const METRIC = "SELECT COUNT(*) AS n FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open' AND (a.description LIKE '%session-task' || ':%' OR t.owner LIKE 'session%')";
const nowMs = () => Date.now();
const world = (opts = {}) => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const old = nowMs() - 3 * 86400000;
  const mkIssue = (id, title, description, status) => db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'qnfo-ops', 'reliability', 'high', ?, ?, ?)").run(id, title, description, status, old, old);
  mkIssue(100419, "CLOSE-CHANNEL-REQUIRED-1: 449/900 issue closes in 7d have NULL close_channel", opts.desc100419 || DESC_100419, opts.status100419 || "open");
  mkIssue(1000189, "REMEDIATION-CONSUMER-MERGE-DENIED-1: the code loop structurally cannot merge scripts/remediation_consumer.py", DESC_1000189, opts.status1000189 || "open");
  mkIssue(1000140, "AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws", DESC_1000140, "open");
  mkIssue(1000183, "REMEDIATION-ESCALATE-DEAD-1: escalate_to is selected and never acted on", DESC_1000183, "open");
  db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'qnfo-ops', datetime('now'))").run(100419);
  for (const id of [1000189, 1000140, 1000183]) db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'qnfo-ops', datetime('now'))").run(id);
  const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, last_verdict, module, attempts, next_due_at) VALUES (?, ?, 'p', 'a', ?, ?, ?, 'qnfo-fleet-control', 1, ?, ?, ?, ?, '2026-10-26 10:00:00')");
  ins.run("issue-1000189", 1000189, opts.probe1000189 || OLD_1000189_PROBE, "d1-query", 3, "active", "fail", opts.module1000189 || "probe-template-v3-generic", 10);
  ins.run("issue-100419", 100419, "SELECT '0' AS expected, '4' AS observed /* canary-ahead-probes-1 */", "d1-query", 60, "active", "fail", "canary-ahead-probes-1", 11);
  ins.run("issue-1000140", 1000140, "{\"url\": \"https://qnfo-agent-ws.q08.workers.dev/health\", \"status\": 200, \"contains\": \"qnfo-agent-ws\", \"min_version\": \"2.1.0\"}", "runner-https", 3, "active", "fail", "runtime-probe-line-v2", 55);
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'HIGH-ISSUE-PROBES-1: an older decision', 'e', 'o', 'b', 'r')").run();
  return db;
};
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const snap = (db) => JSON.stringify(["remediation_contracts", "decision_log", "agent_issues", "issue_triage"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const metric = (db) => one(db, METRIC).n;
const desc = (db, id) => one(db, "SELECT description FROM agent_issues WHERE id = ?", id).description;
const contract = (db, cls) => one(db, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const literal = (probeText) => {
  if (!PY) return { ok: false, why: "no python" };
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; ok, why = rc.is_literal_select(sys.argv[2]); print(json.dumps({'ok': ok, 'why': why}))", join(root, "scripts"), probeText], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { ok: false, why: "no output" }; }
};
const apply = (db) => { if (!SKIP) db.exec(sql); };

// ---- 3. the metric before and after ----
const db = world();
const before = snap(db);
ok(metric(db) === 3, "before the file the metric counts the three session-task issues (100419, 1000189 with two markers, 1000140)", metric(db));
ok(one(db, "SELECT COUNT(*) n FROM agent_issues WHERE description LIKE '%session-task' || ':%'").n === 3 && (DESC_1000189.match(/session-task:/g) || []).length === 2, "1000189 carries the marker twice, in prose and on its own line, and 1000183 never");
const c140Before = JSON.stringify(contract(db, "issue-1000140")), c419Before = JSON.stringify(contract(db, "issue-100419"));
apply(db);
ok(metric(db) === 0, "after the file the metric counts 0", metric(db));
ok(q(db, "SELECT id FROM agent_issues WHERE lower(description) LIKE '%session-task:%'").length === 0, "no description holds the marker in any case, so no other spelling keeps the issue in the metric");
ok(JSON.stringify(q(db, "SELECT id, status, close_channel, updated_at FROM agent_issues ORDER BY id")) === JSON.stringify(JSON.parse(before)[2].map((r) => ({ id: r.id, status: r.status, close_channel: r.close_channel, updated_at: r.updated_at }))), "no status, close_channel or updated_at changed: nothing closes");
ok(JSON.stringify(q(db, "SELECT * FROM issue_triage ORDER BY 1")) === JSON.stringify(JSON.parse(before)[3]), "issue_triage is untouched (no close_evidence written)");
ok(JSON.stringify(contract(db, "issue-1000140")) === c140Before, "the runtime-probe contract of 1000140 is untouched: the first runtime-probe line did not change, so agent_issues_runtime_probe_upd stayed quiet");
ok(JSON.stringify(contract(db, "issue-100419")) === c419Before, "the d1-query contract of 100419 is untouched: the first code-probe line did not change, so agent_issues_code_probe_upd stayed quiet");
ok(/CLOSE-CHANNEL-GUARD-1/.test(desc(db, 100419)) && /session step is done/.test(desc(db, 100419)) && desc(db, 100419).includes("code-task: repo=qnfo-workers path=qnfo-pipeline-ops/worker.js") && desc(db, 100419).includes("code-probe: {\"paths\": [\"scripts/conflict_repair.py\"]"), "100419 keeps its other lines (code-task, code-probe) and gains the record");
ok(/DECISION \(CLOSE-CHANNEL-GUARD-1/.test(desc(db, 1000189)) && desc(db, 1000189).includes("(issue 1000183 carries a code-task line naming scripts/remediation_consumer.py)") && desc(db, 1000189).includes("(MERGE-SCOPE-INTAKE-1 2026-10-25T11:14Z"), "1000189 gains the decision, its prose mention is made accurate and the merge-scope note stays");
ok(desc(db, 1000183).startsWith(DESC_1000183) && /DECISION \(CLOSE-CHANNEL-GUARD-1/.test(desc(db, 1000183)) && desc(db, 1000183).includes("code-task: repo=qnfo-workers path=scripts/remediation_consumer.py"), "1000183 only gains an appended block and keeps every line it had");
ok(/BLOCKED \(CLOSE-CHANNEL-GUARD-1/.test(desc(db, 1000140)) && desc(db, 1000140).includes("runtime-probe: {\"url\": \"https://qnfo-agent-ws.q08.workers.dev/health\"") && desc(db, 1000140).includes("\ncode-anchor: const normalizedPath"), "1000140 keeps its runtime-probe line and its code-anchor line");
ok(one(db, "SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('bak_20261026_session_dep_issues', 'bak_20261026_session_dep_contract')").n === (SKIP ? 0 : 2), "both backup tables exist");
ok(SKIP ? false : one(db, "SELECT COUNT(*) n FROM bak_20261026_session_dep_issues").n === 4, "the issue backup holds the four rows as they were");
ok(q(db, "SELECT * FROM decision_log WHERE instr(action, 'CLOSE-CHANNEL-GUARD-1:') = 1").length === (SKIP ? 0 : 1) && one(db, "SELECT COUNT(*) n FROM decision_log").n === (SKIP ? 1 : 2), "one decision row is added and the older one is untouched");

// ---- 4. the invariant probe ----
const c = contract(db, "issue-1000189");
ok(c.module === "red-drain-invariant-v1" && c.verify_transport === "d1-query" && c.status === "active" && c.attempts === 0 && c.last_verdict === null, "the contract of 1000189 is the invariant probe, active, with its counters reset", c);
ok(!/;/.test(c.verify_probe) && /^SELECT '0' AS expected, CAST\(\(SELECT COUNT\(\*\) FROM remediation_contracts r WHERE /.test(c.verify_probe), "the probe has no semicolon (remediation_probe_semicolon_upd would rewrite one) and states expected 0 and an observed count");
ok(literal(c.verify_probe).ok === true, "the consumer's is_literal_select accepts the probe", literal(c.verify_probe));
const m = fleetControl.match(/var RED_DRAIN_ELIGIBLE_REMEDIATION_SQL =\s*([\s\S]*?);\nasync function redDrainEligibleRemediationCount/);
ok(!!m, "RED_DRAIN_ELIGIBLE_REMEDIATION_SQL was found in qnfo-fleet-control/worker.js");
const FLEET_SQL = m ? new Function("return " + m[1])() : "SELECT -1 AS n";
const seed = (d) => {
  const issue = (id, status, title) => d.prepare("INSERT OR IGNORE INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, ?, 'd', 'x', ?, 1, 1)").run(id, title || "T" + id, status);
  const ctr = (cls, iid, status, verdict, attempts, max) => d.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, last_verdict, attempts) VALUES (?, ?, 'p', 'a', 'x', 'd1-query', ?, 'q', ?, ?, ?)").run(cls, iid, max, status, verdict, attempts);
  issue(9001, "closed"); ctr("issue-9001", 9001, "active", "fail", 20, 3);             // eligible: failing, past 5x, issue closed
  issue(9002, "open"); ctr("issue-9002", 9002, "active", "pass", 900, 3);              // a passing contract in its hold window: never counted
  ctr("fm-standing", null, "active", "fail", 900, 3);                                  // standing detector: exempt
  ctr("belief-standing", null, "active", "fail", 900, 3);                              // standing detector: exempt
  issue(9003, "open"); ctr("issue-9003", 9003, "active", "fail", 40, 3);               // code task in flight: excluded
  d.prepare("INSERT INTO code_tasks (id, goal, status) VALUES ('ct_1', 'x -- issue #9003 (RED-DRAIN-1 dispatch)', 'open')").run();
  issue(9004, "open"); ctr("issue-9004", 9004, "active", "fail", 40, 3);               // sole live probe of an open issue: excluded
  issue(9005, "open"); ctr("issue-9005", 9005, "active", "fail", 40, 3); ctr("issue-9005-b", 9005, "active", "pass", 1, 3); // another live probe exists: eligible
  issue(9006, "closed"); ctr("issue-9006", 9006, "active", "fail", 10, 3);             // 10 is not past 5 x 3
  issue(9007, "closed"); ctr("issue-9007", 9007, "holding", "fail", 100, 3);           // holding counts: eligible
  issue(9008, "open", "METRIC-TRIGGER-1-X"); ctr("issue-9008", 9008, "active", "fail", 100, 3); // a metric ticket is not protected by the sole-probe clause: eligible
};
const bad = new DatabaseSync(":memory:"); bad.exec(DDL); seed(bad);
const fleetCount = (d) => Number(one(d, FLEET_SQL).n);
const expectedBad = 4;
// the probe is evaluated through the SQL text of the contract written by the migration, run against the seeded state
const probeAgainst = (d) => { const r = one(d, c.verify_probe); return { expected: r.expected, observed: r.observed }; };
ok(fleetCount(bad) === expectedBad, "fixture: qnfo-fleet-control's predicate counts the four eligible contracts of the mixed state (9001, 9005, 9007, 9008)", fleetCount(bad));
const pBad = probeAgainst(bad);
ok(pBad.expected === "0" && pBad.observed === String(expectedBad), "the probe observes the same 4 on the mixed state and fails against expected 0", pBad);
const exact = (d) => probeAgainst(d).observed === String(fleetCount(d));
ok(exact(bad), "probe and fleet-control predicate agree on the mixed state");
bad.exec("UPDATE remediation_contracts SET status = 'escalated' WHERE class IN ('issue-9001', 'issue-9005', 'issue-9007', 'issue-9008')");
ok(probeAgainst(bad).observed === "0" && exact(bad), "once red-drain parks the eligible contracts the probe reads 0 and still agrees with the predicate", probeAgainst(bad));
ok(probeAgainst(bad).expected === probeAgainst(bad).observed, "the good state passes: expected equals observed");
const only = new DatabaseSync(":memory:"); only.exec(DDL); seed(only);
only.exec("UPDATE remediation_contracts SET last_verdict = 'pass'");
ok(exact(only) && probeAgainst(only).observed === "0", "passing contracts are never counted, whatever their attempts", probeAgainst(only));
only.exec("UPDATE remediation_contracts SET last_verdict = 'fail', attempts = 900 WHERE class = 'issue-9001'");
ok(exact(only) && probeAgainst(only).observed === "1", "a failing, non-exempt, unexcluded contract is the only one counted", probeAgainst(only));

// ---- 5. replay, guards, rollback ----
if (!SKIP) {
  const once = snap(db);
  db.exec(sql);
  ok(snap(db) === once, "a second run changes nothing (every statement is guarded, the decision is inserted once)");
  const closed = world({ status1000189: "closed" });
  const cb = snap(closed); closed.exec(sql);
  ok(desc(closed, 1000189) === DESC_1000189 && contract(closed, "issue-1000189").module === "probe-template-v3-generic", "a closed 1000189 keeps its description and its contract");
  ok(desc(closed, 100419).includes("CLOSE-CHANNEL-GUARD-1"), "while the open 100419 beside it is still processed");
  const edited = world({ desc100419: DESC_100419.replace(MARKER_100419, MARKER_100419 + " (hand edited)") });
  edited.exec(sql);
  ok(desc(edited, 100419).includes("CLOSE-CHANNEL-GUARD-1") && desc(edited, 100419).includes(" (hand edited)"), "an edited line still holding the exact old text is replaced and the edit after it survives");
  const gone = world({ desc100419: DESC_100419.replace(MARKER_100419, "session-task: repo=qnfo-workers path=somewhere/else.sql") });
  gone.exec(sql);
  ok(!desc(gone, 100419).includes("CLOSE-CHANNEL-GUARD-1") && one(gone, "SELECT COUNT(*) n FROM agent_issues WHERE id = 100419 AND description LIKE '%session-task' || ':%'").n === 1, "a description that no longer holds the exact old text is left alone and still counts: only a recorded reason removes a marker");
  const mine = world({ probe1000189: "SELECT '1' AS expected, '1' AS observed", module1000189: "hand-written" });
  mine.exec(sql);
  ok(contract(mine, "issue-1000189").verify_probe === "SELECT '1' AS expected, '1' AS observed" && contract(mine, "issue-1000189").module === "hand-written", "a probe a doer wrote by hand is not replaced");
  const rb = world();
  const orig = JSON.stringify([100419, 1000189, 1000140, 1000183].map((id) => desc(rb, id)));
  const origC = JSON.stringify(contract(rb, "issue-1000189"));
  rb.exec(sql);
  rb.exec(rollback);
  ok(JSON.stringify([100419, 1000189, 1000140, 1000183].map((id) => desc(rb, id))) === orig, "the Rollback restores the four descriptions byte for byte");
  const rc = contract(rb, "issue-1000189"), oc = JSON.parse(origC);
  ok(["status", "verify_probe", "verify_transport", "last_verdict", "attempts", "max_attempts", "module", "precondition", "action"].every((k) => rc[k] === oc[k]), "and the contract of 1000189 field by field", rc);
  ok(metric(rb) === 3, "and the metric counts three again");
}

console.log(fail === 0 ? "close-channel-required: " + pass + " checks passed" : "close-channel-required: " + fail + " FAILED, " + pass + " passed");
process.exit(fail === 0 ? 0 : 1);
