// CANARY-AHEAD-PROBES-1 offline suite (agent_issues 1000171 CONTROL-PLANE-REVERTED-1 and 100419 CLOSE-CHANNEL-REQUIRED-1).
// Applies migrations/2026-10-26-canary-ahead-probes.sql on SQLite (node:sqlite) over fixtures with the live column lists and the live triggers that fire on its statements
// (agent_issues_code_probe_upd read out of migrations/2026-10-12-probe-line-edit-only.sql, whose 3079 characters equal the live sqlite_master text on 2026-10-26; the four
// remediation_contracts update triggers; the append-only decision_log), and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and python3 scripts/apply_migrations.py --check;
//   2. 1000171: the description gains one block with the code-probe line, the trigger makes it the closing contract (code-read, active), the consumer's own parse_code_probe and
//      run_code_probe read it as missing-marker on a scripts/canary_revert.py without CANARY-AHEAD-1 and ok on the file in this repository;
//   3. 100419: the description gains the block and two code-probe lines, the contract the trigger wrote from the first of them is replaced by the d1-query probe, which the consumer's
//      is_literal_select accepts and which reads 2 on a bad state (two script closes with a NULL close_channel), 0 on the good state (the same rows with their channel), and does not
//      count a session close of a duplicate pull request (1000254), owner-chat session SQL, a close older than 2880 minutes or an open issue; keyed on the title it would have counted 1000254;
//   4. the file replays as a no-op, leaves a closed issue and a contract that is not the born one alone, and the Rollback restores both issues and both contracts and removes what was added;
//   5. the failure mode canary-false-revert-when-ahead, its code-read detector (ok on scripts/canary_revert.py in this repository, missing-marker on a copy whose tuple lacks "ahead")
//      and the one decision row.
// Run: node --no-warnings migrations/canary-ahead-probes.test.mjs
//   CAP_SKIP_MIGRATION=1 runs the same checks without applying the file, CAP_MIGRATION=<file> checks a mutated copy of the migration, CAP_CANARY=<file> a copy of scripts/canary_revert.py: each must fail.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const MIGRATION = process.env.CAP_MIGRATION ? resolve(process.env.CAP_MIGRATION) : join(here, "2026-10-26-canary-ahead-probes.sql");
const sql = norm(readFileSync(MIGRATION, "utf8"));
const canarySrc = norm(readFileSync(process.env.CAP_CANARY ? resolve(process.env.CAP_CANARY) : join(root, "scripts", "canary_revert.py"), "utf8"));
const conflictSrc = norm(readFileSync(join(root, "scripts", "conflict_repair.py"), "utf8"));
const applySrc = norm(readFileSync(join(root, "scripts", "apply_migrations.py"), "utf8"));
const probeUpd = norm(readFileSync(join(here, "2026-10-12-probe-line-edit-only.sql"), "utf8"));
const SKIP = process.env.CAP_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

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
ok(/module IN \('canary-ahead-probes-1', 'code-probe-line-v1'\)/.test(rollback), "the Rollback restores a contract only while its module is ours or the trigger's, so a later hand edit is not clobbered");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql), "no duration is stated in hours or days (the window is 2880 minutes)");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 7 && /^CREATE TABLE IF NOT EXISTS bak_20261026_canary_ahead_probes AS\b/.test(stmts[0]) && /^UPDATE agent_issues SET description\b/.test(stmts[1]) && /^UPDATE agent_issues SET description\b/.test(stmts[2]) && /^UPDATE remediation_contracts SET\b/.test(stmts[3]) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[4]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[5]) && /^INSERT INTO decision_log\b/.test(stmts[6]), "seven statements: backup, two description blocks, one contract UPDATE, failure mode, detector contract, decision row", stmts.map((s) => s.slice(0, 40)));
ok(stmts.slice(1, 3).every((s) => /\bstatus = 'open' AND instr\(COALESCE\(description, ''\), 'CANARY-AHEAD-PROBES-1 closing probe'\) = 0\b/.test(s)), "both description blocks are guarded on the issue being open and on the block not being there yet");
ok(stmts.slice(1, 3).every((s) => /AND EXISTS \(SELECT 1 FROM remediation_contracts WHERE class = 'issue-\d+' AND module = 'probe-template-v3-generic'\)$/.test(s)), "and on the contract still being the born one, so a probe a doer wrote is not replaced by the trigger");
ok(/\bWHERE class = 'issue-100419' AND issue_id = 100419 AND module IN \('probe-template-v3-generic', 'code-probe-line-v1'\)\s+AND instr\(verify_probe, 'CONFLICT-REPAIR-SETTLE-1:'\) = 0\s+AND EXISTS \(SELECT 1 FROM agent_issues WHERE id = 100419 AND status = 'open'\)$/.test(stmts[3] || ""), "the contract UPDATE is guarded on the born or trigger-written contract, on the probe not being ours yet and on the issue being open");
ok(!stmts.some((t) => /^(INSERT( OR \w+)? INTO|DELETE FROM)\s+"?(agent_issues|issue_triage)\b/i.test(t)) && !stmts.some((t) => /^UPDATE agent_issues SET (?!description\b)/i.test(t)) && !stmts.some((t) => /issue_triage/i.test(t.split("\n")[0])), "no statement writes issue_triage or a column of agent_issues other than description (status and close_evidence stay with the probes)");
{
  const chk = PY ? spawnSync(PY, ["-I", join(root, "scripts", "apply_migrations.py"), "--check", MIGRATION], { encoding: "utf8", cwd: root }) : { status: 1, stdout: "", stderr: "no python" };
  let j = {}; try { j = JSON.parse(String(chk.stdout).trim().split("\n").pop()); } catch (e) { j = {}; }
  ok(chk.status === 0 && j.ok === true && j.db === "qnfo-audit" && j.statements === 7, "python3 scripts/apply_migrations.py --check accepts the file", [chk.status, j, String(chk.stderr).slice(0, 200)]);
}

// ---- 2. fixture: the live shapes ----
const trigStart = probeUpd.indexOf("CREATE TRIGGER IF NOT EXISTS agent_issues_code_probe_upd");
const CODE_PROBE_TRIGGER = probeUpd.slice(trigStart, probeUpd.indexOf("\nEND;", trigStart) + 5);
ok(trigStart > 0 && CODE_PROBE_TRIGGER.replace("IF NOT EXISTS ", "").length - 1 === 3079,"agent_issues_code_probe_upd was read out of migrations/2026-10-12-probe-line-edit-only.sql and has the length of the live trigger (3079)", CODE_PROBE_TRIGGER.replace("IF NOT EXISTS ", "").length - 1);
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
${CODE_PROBE_TRIGGER}
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
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
const OLD_PROBE = (id) => `SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = ${id}) AS observed`;
const OLD_VERDICT = "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)";
const OLD_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const OLD_PRE = "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)";
const DESC_1000171 = "Charter pillar: autonomy. canonical-deploy.yml canary (scripts/canary_revert.py, CONTROL-PLANE-CANARY-1) on push 7a9d2935424f8ce69eb5f7e774930ccf27a5163d: qnfo-gateway wanted 3.31.2-seo-index-8, saw 3.31.3-seo-index-9 after 25 polls. Outcome: {\"sha\": \"3595289a3ff1823103d39de55c92b0c950671a39\", \"bumped\": [[\"qnfo-gateway\", \"3.31.2-seo-index-8\", \"3.31.3-revert-7a9d293\"]]}. session-task: read the canonical-deploy run for this push, reproduce the /health failure locally, open a corrected pull request.";
const DESC_100419 = "Audit 2026-10-21 (deepchat-session): 449 of 900 agent_issues closes in 7d carry NULL close_channel. DoD: every UPDATE agent_issues SET status IN (closed,resolved,wontfix) path writes close_channel.\ncode-task: repo=qnfo-workers path=qnfo-pipeline-ops/worker.js\n\nPROBE-REVIEW-1 2026-10-21T15:40Z (qnfo-cloud-ops): the closing probe of contract issue-100419-BACKFILL-1 was judged self-confirming.\nRED-GATE-1: escalated to critical - open red with no update for 48h and no code task referencing it.";
const nowMs = () => Date.now();
const world = (opts = {}) => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const old = nowMs() - 3 * 86400000;
  const mkIssue = (id, title, description, status) => db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'qnfo-fleet-control', 'reliability', 'high', ?, ?, ?)").run(id, title, description, status, old, old);
  mkIssue(1000171, "CONTROL-PLANE-REVERTED-1: push 7a9d293 reverted, qnfo-gateway never reached the pushed VERSION", DESC_1000171, opts.status1000171 || "open");
  mkIssue(100419, "CLOSE-CHANNEL-REQUIRED-1: 449/900 issue closes in 7d have NULL close_channel", DESC_100419, opts.status100419 || "open");
  const born = (cls, id, mod) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, last_verdict, module, next_due_at, attempts) VALUES (?, ?, ?, ?, ?, 'd1-query', 3, 'qnfo-fleet-control', 1, 'superseded', '2026-10-21 10:34:59', ?, ?, '2026-10-21 10:34:59', 0)").run(cls, id, OLD_PRE, OLD_ACTION, OLD_PROBE(id), OLD_VERDICT, mod);
  born("issue-1000171", 1000171, opts.module1000171 || "probe-template-v3-generic");
  born("issue-100419", 100419, opts.module100419 || "probe-template-v3-generic");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, last_verdict, module, next_due_at, attempts) VALUES ('issue-100419-BACKFILL-1', 100419, 'CONTRACT-BACKFILL-1', 're-probe', 'SELECT 1', 'd1-query', 3, 'qnfo-ops', 1, 'probe-review-refused', '2026-10-21T13:39:11Z', 'probe-review-refused', NULL, '2026-10-21 15:41:16', 4)").run();
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('issue-2830', 2830, 'p', 'a', '{\"paths\":[\"x.yml\"],\"contains\":\"y\"}', 'code-read', 'qnfo-fleet-control', 1, 'active', 'measuring-probe-high-issues-1')").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'HIGH-ISSUE-PROBES-1: an older decision', 'e', 'o', 'b', 'r')").run();
  return db;
};
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const snap = (db) => JSON.stringify(["remediation_contracts", "failure_modes", "decision_log", "agent_issues", "issue_triage"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const hasBak = (db) => q(db, "SELECT name FROM sqlite_master WHERE name = 'bak_20261026_canary_ahead_probes'").length === 1;
const judge = (probeText, rootDir) => {
  if (!PY) return { err: "no python", observed: null };
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(root, "scripts"), probeText, rootDir], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: r.stderr }; }
};
const literal = (probeText) => {
  if (!PY) return { ok: false, why: "no python" };
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; ok, why = rc.is_literal_select(sys.argv[2]); print(json.dumps({'ok': ok, 'why': why}))", join(root, "scripts"), probeText], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { ok: false, why: "no output" }; }
};
const tmp = mkdtempSync(join(tmpdir(), "cap-"));
const tree = (name, files) => { const dir = join(tmp, name); for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); } return dir; };
const lineOf = (desc, n = 0) => desc.split("\n").filter((l) => l.startsWith("code-probe: {"))[n];

const db = world();
const before = snap(db);
const startRows = Object.fromEntries(q(db, "SELECT * FROM remediation_contracts").map((r) => [r.class, r]));
ok(!/code-probe: \{/.test(DESC_1000171 + DESC_100419) && q(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE verify_transport = 'code-read' AND issue_id IN (1000171, 100419)")[0].n === 0, "the fixture is the live state: neither issue carries a code-probe line and neither has a code-read contract");
if (!SKIP) db.exec(sql);

// ---- 3. 1000171 ----
const d1 = one(db, "SELECT description, status FROM agent_issues WHERE id = 1000171");
const line1 = lineOf(d1.description);
ok(d1.status === "open" && d1.description.startsWith(DESC_1000171 + "\nCANARY-AHEAD-PROBES-1 closing probe (migrations/2026-10-26-canary-ahead-probes.sql): ") && line1 === 'code-probe: {"paths": ["scripts/canary_revert.py"], "contains": "CANARY-AHEAD-1"}' && d1.description.split("\n").filter((l) => l.startsWith("code-probe: {")).length === 1, "1000171: the description keeps its text, gains the block and exactly one code-probe line, and stays open", d1.description.slice(-300));
const c1 = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000171'");
ok(c1.status === "active" && c1.verify_transport === "code-read" && c1.module === "code-probe-line-v1" && c1.issue_id === 1000171 && c1.verify_probe === '{"paths": ["scripts/canary_revert.py"], "contains": "CANARY-AHEAD-1"}' && c1.attempts === 0 && c1.last_verdict === null, "1000171: the trigger made the code-probe line its closing contract (code-read, active, due now)", c1);
{
  const bad = tree("bad-canary", { "scripts/canary_revert.py": canarySrc.split("CANARY-AHEAD-1").join("CANARY-AHEAD-X").split("CANARY_SATISFIED").join("CANARY_SATISFIED") });
  const good = tree("good-canary", { "scripts/canary_revert.py": canarySrc });
  const jb = judge(c1.verify_probe, bad), jg = judge(c1.verify_probe, root);
  ok(jb.err === null && jb.observed === "missing-marker:scripts/canary_revert.py", "1000171: the consumer's parse_code_probe and run_code_probe fail it on a canary_revert.py without CANARY-AHEAD-1 (the state of main before the fix)", jb);
  ok(jg.err === null && jg.observed === "ok", "1000171: and pass it on the file in this repository", jg);
  ok(judge(c1.verify_probe, good).observed === "ok" && (canarySrc.match(/CANARY-AHEAD-1/g) || []).length >= 3, "the marker is in the code, the log line and the comments of scripts/canary_revert.py", (canarySrc.match(/CANARY-AHEAD-1/g) || []).length);
}

// ---- 4. 100419 ----
const d2 = one(db, "SELECT description, status FROM agent_issues WHERE id = 100419");
const l2a = lineOf(d2.description, 0), l2b = lineOf(d2.description, 1);
ok(d2.status === "open" && d2.description.startsWith(DESC_100419 + "\nCANARY-AHEAD-PROBES-1 closing probe (migrations/2026-10-26-canary-ahead-probes.sql): ") && l2a === 'code-probe: {"paths": ["scripts/conflict_repair.py"], "contains": "auto:conflict-repair-settle"}' && l2b === 'code-probe: {"paths": ["scripts/apply_migrations.py"], "contains": "auto:migration-apply-resolve"}' && d2.description.split("\n").filter((l) => l.startsWith("code-probe: {")).length === 2, "100419: the description keeps its text, gains the block and the two code-probe lines, and stays open", d2.description.slice(-400));
ok(/1000254, a session close of a duplicate pull request/.test(d2.description) && /owner-chat session SQL closes \(100612, 1000011, 100630, 100631, 100619, 100621\)/.test(d2.description), "100419: the block says which closes the probe does not count (1000254 was a session close, not the script's)");
const c2 = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100419'");
ok(c2.status === "active" && c2.verify_transport === "d1-query" && c2.module === "canary-ahead-probes-1" && c2.issue_id === 100419 && c2.max_attempts === 60 && c2.expected_cadence_h === 1 && c2.escalate_to === "qnfo-fleet-control" && c2.attempts === 0 && c2.last_verdict === null && c2.deferred_since === null, "100419: the contract is the d1-query probe, not the code-read one the trigger wrote from the first line, active, hourly, 60 attempts, verdict and attempts cleared", c2);
ok(typeof c2.next_due_at === "string" && c2.next_due_at >= "2026" && c2.next_due_at !== startRows["issue-100419"].next_due_at, "100419: it is due now", c2.next_due_at);
ok(!/;/.test(c2.verify_probe) && !c2.verify_probe.includes("FROM agent_issues WHERE id = 100419") && !c2.verify_probe.includes("needs-machine" + "-probe"), "100419: the probe carries no semicolon, does not read the status of its issue and is not needs-machine-probe");
ok(literal(c2.verify_probe).ok === true, "100419: the consumer's is_literal_select accepts it as a single literal read-only SELECT", literal(c2.verify_probe));
ok(/CONFLICT-REPAIR-SETTLE-1:%/.test(c2.verify_probe) && /migration_runs ok for %/.test(c2.verify_probe) && /2880 \* 60/.test(c2.verify_probe) && !/title/i.test(c2.verify_probe), "100419: it is keyed on the two producers' close_evidence and a 2880-minute window, never on a title");
ok(/^CANARY-AHEAD-PROBES-1: /.test(c2.precondition) && /^MEASURES the defect/.test(c2.action) && /never from the status of the issue/.test(c2.precondition) && /reads 4 on 2026-10-26/.test(c2.action), "100419: precondition and action say what is measured and what it read", [c2.precondition.slice(0, 60), c2.action.slice(0, 40)]);
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify([c1, c2])), "the contracts state no duration in hours or days");
ok(JSON.stringify(q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100419-BACKFILL-1'")) === JSON.stringify(JSON.parse(before)[0].filter((r) => r.class === "issue-100419-BACKFILL-1")), "100419: the other contract of the issue (probe-review-refused) is exactly as it was");

// the probe on a bad state, a good state and the states it must not count
const mkClose = (dbx, id, title, source, evidence, channel, minutesAgo, status = "closed") => {
  const t = nowMs() - minutesAgo * 60000;
  dbx.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at, close_channel) VALUES (?, ?, 'd', ?, ?, ?, ?, ?)").run(id, title, source, status, t - 3600000, t, channel);
  dbx.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'AUTOTRIAGE-1', 'qnfo-ops', '2026-10-26 00:00:00', ?)").run(id, evidence);
};
const SETTLE_EV = (pr) => "CONFLICT-REPAIR-SETTLE-1: GitHub reads PR #" + pr + " merged at 2026-10-26T09:06:27Z, so there is no conflict left to repair.";
const MIG_EV = "migration_runs ok for migrations/2026-10-25-session-closeout-katex.sql (sha256 f66c6eeb273b, 1 statements, ci:apply-migrations)";
const probeAt = (dbx) => one(dbx, c2.verify_probe);
const fresh = () => { const w = new DatabaseSync(":memory:"); w.exec(DDL); return w; };
{
  const empty = fresh();
  const r0 = probeAt(empty);
  ok(r0.expected === "0" && r0.observed === "0", "100419 probe: an empty world reads 0 (the probe is a count, and a missing table would throw, not pass)", r0);
  // the live state of 2026-10-26: four script closes without a channel, and the rows that must not count
  const live = fresh();
  mkClose(live, 1000365, "STALE-PR-CONFLICT-REPAIR-1 PR 4475: merge conflicts with main on a quiet session", "qnfo-fleet-control", SETTLE_EV(4475), null, 200);
  mkClose(live, 1000270, "STALE-PR-CONFLICT-REPAIR-1 PR 4284: merge conflicts with main on a quiet session", "qnfo-fleet-control", SETTLE_EV(4284), null, 700);
  mkClose(live, 1000256, "STALE-PR-CONFLICT-REPAIR-1 PR 4259: merge conflicts with main on a quiet session", "qnfo-fleet-control", SETTLE_EV(4259), null, 710);
  mkClose(live, 1000212, "MIGRATION-APPLY-FAILED-1: 2026-10-25-session-closeout-katex.sql", "ci:apply-migrations", MIG_EV, null, 1000);
  mkClose(live, 1000254, "STALE-PR-CONFLICT-REPAIR-1 PR 4254: merge conflicts with main on a quiet session", "qnfo-fleet-control", "PR 4254 closed as duplicate 2026-10-26T04:22Z: its sign-in fix merged via PR 4256. No conflict left to repair.", null, 930);
  mkClose(live, 100612, "MERGE-BOUNDARY-GATE-1 worker load gate reds on any Workers API", "owner-chat", "2026-10-24 qnfo-ops live probe: node scripts/worker-load-gate.mjs returned 98 of 98 worker entries load", null, 1500);
  mkClose(live, 100422, "STALE-PR-CONFLICT-REPAIR-1 PR 3445: merge conflicts with main on a quiet session", "qnfo-fleet-control", SETTLE_EV(3445), null, 3000);
  mkClose(live, 900001, "STALE-PR-CONFLICT-REPAIR-1 PR 1: merge conflicts", "qnfo-fleet-control", SETTLE_EV(1), "auto:conflict-repair-settle", 100);
  mkClose(live, 900002, "MIGRATION-APPLY-FAILED-1: ok.sql", "ci:apply-migrations", MIG_EV, "auto:migration-apply-resolve", 100);
  live.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (900003, 'STALE-PR-CONFLICT-REPAIR-1 PR 2: open', 'd', 'qnfo-fleet-control', 'open', ?, ?)").run(nowMs(), nowMs());
  live.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (900003, 'AUTOTRIAGE-1', 'qnfo-ops', '2026-10-26 00:00:00', 'CONFLICT-REPAIR-SETTLE-1: staged')").run();
  const rl = probeAt(live);
  ok(rl.expected === "0" && rl.observed === "4", "100419 probe: on the live state it observes 4 (1000365, 1000270, 1000256, 1000212) against expected 0, so it fails today", rl);
  const titleKeyed = one(live, "SELECT COUNT(*) AS n FROM agent_issues WHERE status IN ('closed','resolved','wontfix') AND close_channel IS NULL AND updated_at > (strftime('%s','now') - 2880 * 60) * 1000 AND (title LIKE 'STALE-PR-CONFLICT-REPAIR-1 PR %' OR title LIKE 'MIGRATION-APPLY-FAILED-1:%')").n;
  ok(titleKeyed === 5 && rl.observed === "4", "the title-keyed read of the first proposal counts the session close 1000254 as well (5); the evidence-keyed probe does not", titleKeyed);
  // bad: two script closes without a channel. good: the same rows with the channels the scripts now write.
  const bad = fresh();
  mkClose(bad, 11, "STALE-PR-CONFLICT-REPAIR-1 PR 5: merge conflicts", "qnfo-fleet-control", SETTLE_EV(5), null, 30);
  mkClose(bad, 12, "MIGRATION-APPLY-FAILED-1: b.sql", "ci:apply-migrations", MIG_EV, null, 30);
  const good = fresh();
  mkClose(good, 11, "STALE-PR-CONFLICT-REPAIR-1 PR 5: merge conflicts", "qnfo-fleet-control", SETTLE_EV(5), "auto:conflict-repair-settle", 30);
  mkClose(good, 12, "MIGRATION-APPLY-FAILED-1: b.sql", "ci:apply-migrations", MIG_EV, "auto:migration-apply-resolve", 30);
  const rb = probeAt(bad), rg = probeAt(good);
  ok(rb.observed === "2" && rb.observed !== rb.expected, "100419 probe: two unchannelled script closes read 2 and fail", rb);
  ok(rg.observed === "0" && rg.observed === rg.expected, "100419 probe: the same two closes with their channels read 0 and pass", rg);
  const mixed = fresh();
  mkClose(mixed, 11, "STALE-PR-CONFLICT-REPAIR-1 PR 5: merge conflicts", "qnfo-fleet-control", SETTLE_EV(5), "auto:conflict-repair-settle", 30);
  mkClose(mixed, 12, "MIGRATION-APPLY-FAILED-1: b.sql", "ci:apply-migrations", MIG_EV, null, 30, "resolved");
  ok(probeAt(mixed).observed === "1", "100419 probe: a resolved row counts like a closed one, a channelled row does not");
  const stale = fresh();
  mkClose(stale, 11, "STALE-PR-CONFLICT-REPAIR-1 PR 5: merge conflicts", "qnfo-fleet-control", SETTLE_EV(5), null, 2881);
  ok(probeAt(stale).observed === "0", "100419 probe: a close just outside the 2880-minute window leaves it (the probe passes when the last unchannelled script close ages out)");
}

// the two code-probe lines of 100419, run through the consumer on the state before and after the scripts
{
  const noChan = tree("no-channel", { "scripts/conflict_repair.py": conflictSrc.split("auto:conflict-repair-settle").join("auto:x"), "scripts/apply_migrations.py": applySrc.split("auto:migration-apply-resolve").join("auto:y") });
  for (const [ln, rel] of [[l2a, "scripts/conflict_repair.py"], [l2b, "scripts/apply_migrations.py"]]) {
    const spec = ln ? ln.slice("code-probe: ".length) : "{}";
    const jb = judge(spec, noChan), jg = judge(spec, root);
    ok(jb.err === null && jb.observed === "missing-marker:" + rel, "100419 code-probe on " + rel + ": missing-marker on the script without the channel (the state of main before the fix)", jb);
    ok(jg.err === null && jg.observed === "ok", "100419 code-probe on " + rel + ": ok on the file in this repository", jg);
  }
}

// ---- 5. nothing else changed ----
const stripped = (rows) => rows.filter((r) => !["issue-1000171", "issue-100419", "fm-canary-false-revert-when-ahead"].includes(r.class));
ok(JSON.stringify(stripped(q(db, "SELECT * FROM remediation_contracts ORDER BY class"))) === JSON.stringify(stripped(JSON.parse(before)[0])), "the contracts of other issues are exactly as they were");
ok(q(db, "SELECT COUNT(*) AS n FROM issue_triage")[0].n === 0 && JSON.stringify(q(db, "SELECT id, title, status, close_channel, updated_at, priority FROM agent_issues ORDER BY id")) === JSON.stringify(JSON.parse(before)[3].map((r) => ({ id: r.id, title: r.title, status: r.status, close_channel: r.close_channel, updated_at: r.updated_at, priority: r.priority }))), "issue_triage is untouched, and both issues keep their status, channel, priority and updated_at");
ok(hasBak(db) && q(db, "SELECT class FROM bak_20261026_canary_ahead_probes ORDER BY class").map((r) => r.class).join(",") === "issue-1000171,issue-100419", "the backup table holds the two retired contracts");
ok(q(db, "SELECT verify_probe, module, status FROM bak_20261026_canary_ahead_probes WHERE class = 'issue-100419'")[0].verify_probe === OLD_PROBE(100419) && q(db, "SELECT module FROM bak_20261026_canary_ahead_probes WHERE class = 'issue-1000171'")[0].module === "probe-template-v3-generic", "as they were before the file (the circular probe and the born module), not as the trigger left them");

// ---- 6. replay, closed issues, hand-written probes ----
{
  const once = snap(db);
  db.exec(sql);
  db.exec(sql);
  ok(snap(db) === once, "a second and third apply change nothing (descriptions, contracts, failure mode, detector, decision row)");
  const closed = world({ status1000171: "closed", status100419: "closed" });
  const closedBefore = snap(closed);
  closed.exec(sql);
  ok(q(closed, "SELECT description FROM agent_issues ORDER BY id").every((r) => !r.description.includes("CANARY-AHEAD-PROBES-1")) && JSON.stringify(q(closed, "SELECT * FROM remediation_contracts WHERE class IN ('issue-1000171', 'issue-100419') ORDER BY class")) === JSON.stringify(JSON.parse(closedBefore)[0].filter((r) => ["issue-1000171", "issue-100419"].includes(r.class))), "a closed issue gets no block and its contract is left alone (only while the issue is open)");
  ok(q(closed, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'canary-false-revert-when-ahead'")[0].n === 1, "the failure mode is still recorded");
  const hand = world({ module1000171: "hand-1000171", module100419: "hand-100419" });
  hand.prepare("UPDATE remediation_contracts SET status = 'active', verify_probe = 'SELECT ''1'' AS expected, ''1'' AS observed' WHERE class = 'issue-100419'").run();
  const handBefore = JSON.stringify(q(hand, "SELECT * FROM remediation_contracts WHERE class IN ('issue-1000171', 'issue-100419') ORDER BY class"));
  hand.exec(sql);
  ok(JSON.stringify(q(hand, "SELECT * FROM remediation_contracts WHERE class IN ('issue-1000171', 'issue-100419') ORDER BY class")) === handBefore && q(hand, "SELECT description FROM agent_issues ORDER BY id").every((r) => !r.description.includes("CANARY-AHEAD-PROBES-1")), "a contract a doer wrote (another module) is left alone, and so are the descriptions: the trigger would have replaced it");
}

// ---- 7. the failure mode, its detector, the decision row ----
const FM = "canary-false-revert-when-ahead";
const MARKER = 'CANARY_SATISFIED = ("ok", "ahead")';
const fmr = q(db, "SELECT * FROM failure_modes WHERE fm_key = ?", FM);
ok(fmr.length === 1, "one failure_modes row for " + FM, fmr.length);
const fr = fmr[0] || {};
ok(fr.probe_class === "fm-" + FM && fr.first_seen === "2026-10-25" && fr.issue_id === 1000171, "its probe_class is fm- plus the key, first_seen 2026-10-25, issue 1000171", fr);
ok(["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof fr[k] === "string" && fr[k].length > 40), "every failure_modes text column is filled", Object.keys(fr).filter((k) => fr[k] == null));
ok(/judge\(\) accepted only seen == want/.test(fr.root_cause || "") && /7a9d293/.test(fr.root_cause || "") && /3\.31\.3-seo-index-9/.test(fr.root_cause || "") && /3595289a/.test(fr.root_cause || "") && /CANARY-AHEAD-1/.test(fr.remediation || "") && /canary-ahead/.test(fr.remediation || "") && /fm-canary-false-revert-when-ahead/.test(fr.detector || ""), "root cause, remediation and detector state the mechanism, the incident, the rule, the ledger row and the contract", fr);
const dc = q(db, "SELECT * FROM remediation_contracts WHERE class = ?", "fm-" + FM);
ok(dc.length === 1, "one detector contract", dc.length);
const dr0 = dc[0] || {};
ok(dr0.class === fr.probe_class && dr0.verify_transport === "code-read" && dr0.status === "active" && dr0.issue_id === null && dr0.max_attempts === 3 && dr0.escalate_to === "qnfo-fleet-control" && dr0.expected_cadence_h === 1 && dr0.precondition === "CANARY-AHEAD-PROBES-1" && dr0.action === "failure-mode detector" && dr0.module === "failure-mode" && dr0.budget_ms === 45000 && dr0.max_items === 5 && dr0.requires_container === 0 && typeof dr0.next_due_at === "string", "the detector is an active hourly code-read contract with no issue (it can never close one) and the shape of the sibling detectors", dr0);
{
  const dspec = (() => { try { return JSON.parse(dr0.verify_probe || ""); } catch (e) { return {}; } })();
  ok(JSON.stringify(Object.keys(dspec).sort()) === '["contains","paths"]' && JSON.stringify(dspec.paths) === '["scripts/canary_revert.py"]' && dspec.contains === MARKER, "it reads scripts/canary_revert.py for the CANARY_SATISFIED tuple", dr0.verify_probe);
  ok(canarySrc.split("\n").filter((l) => l === MARKER).length === 1, "that marker is the single assignment line in scripts/canary_revert.py", canarySrc.split("\n").filter((l) => l.includes("CANARY_SATISFIED =")));
  const without = tree("no-ahead", { "scripts/canary_revert.py": canarySrc.split(MARKER).join('CANARY_SATISFIED = ("ok",)') });
  const j1 = judge(dr0.verify_probe || "{}", root), j2 = judge(dr0.verify_probe || "{}", without);
  ok(j1.err === null && j1.observed === "ok", "the consumer judges the detector ok on scripts/canary_revert.py", j1);
  ok(j2.err === null && j2.observed === "missing-marker:scripts/canary_revert.py", "and missing-marker on a copy whose tuple does not let an ahead worker through", j2);
}
const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'CANARY-AHEAD-PROBES-1:') = 1");
ok(dl.length === 1, "one decision_log row for CANARY-AHEAD-PROBES-1 (and still one after the replays)", dl.length);
const d = dl[0] || {};
ok(d.actor === "session_015kWmGuAq2fNuvzu4MrD7x3", "the actor is the session", d.actor);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof d[k] === "string" && d[k].length > 3), "every doctrine column is filled (capability_gain, predicted_outcome, reach_gain, surfaces_tested included)", Object.keys(d).filter((k) => d[k] == null));
ok(!/ within /.test(d.predicted_outcome || "") && /issue-1000171/.test(d.predicted_outcome || "") && /issue-100419/.test(d.predicted_outcome || "") && /4/.test(d.predicted_outcome || ""), "the prediction is prose (no ' within ' for decision_predictions_parse) and names both contracts and the first read of 100419", d.predicted_outcome);
ok(/bak_20261026_canary_ahead_probes/.test(d.rollback_path || "") && /append-only/.test(d.rollback_path || "") && /1000254/.test(d.evidence || "") && /3079/.test(d.evidence || ""), "the rollback path names the backup table and the append-only note; the evidence records 1000254 and the trigger length it read");
ok(d.outcome_matched === null, "outcome_matched is left for the result to set");

// ---- 8. the Rollback ----
{
  const r = world();
  r.exec(sql);
  const applied = JSON.stringify(q(r, "SELECT class, status, module, verify_transport FROM remediation_contracts ORDER BY class"));
  r.exec(rollback);
  const back = JSON.stringify(q(r, "SELECT * FROM remediation_contracts WHERE class IN ('issue-1000171', 'issue-100419') ORDER BY class").map((x) => ({ ...x, ts: undefined, next_due_at: undefined })));
  const orig = JSON.stringify(JSON.parse(before)[0].filter((x) => ["issue-1000171", "issue-100419"].includes(x.class)).map((x) => ({ ...x, ts: undefined, next_due_at: undefined })));
  ok(applied.includes("canary-ahead-probes-1") && back === orig, "the Rollback restores both contracts to the born ones (status, module, probe, verdict, attempts)", back.slice(0, 200));
  ok(q(r, "SELECT description FROM agent_issues WHERE id IN (1000171, 100419) ORDER BY id").map((x) => x.description).join("|") === DESC_100419 + "|" + DESC_1000171, "the Rollback strips the appended blocks and leaves each description as it was");
  ok(q(r, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = ?", FM)[0].n === 0 && q(r, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = ?", "fm-" + FM)[0].n === 0, "and removes the failure mode and the detector contract");
  ok(q(r, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CANARY-AHEAD-PROBES-1:') = 1")[0].n === 1, "the append-only decision row stays");
  r.exec(sql);
  ok(one(r, "SELECT module, verify_transport FROM remediation_contracts WHERE class = 'issue-100419'").module === "canary-ahead-probes-1" && one(r, "SELECT module FROM remediation_contracts WHERE class = 'issue-1000171'").module === "code-probe-line-v1" && q(r, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CANARY-AHEAD-PROBES-1:') = 1")[0].n === 1, "and the file applies again after its rollback without a second decision row");
  const hand = world();
  hand.exec(sql);
  hand.prepare("UPDATE remediation_contracts SET module = 'doer-wrote-this', verify_probe = 'SELECT ''1'' AS expected, ''1'' AS observed' WHERE class = 'issue-100419'").run();
  hand.exec(rollback);
  ok(one(hand, "SELECT module FROM remediation_contracts WHERE class = 'issue-100419'").module === "doer-wrote-this", "the Rollback leaves a contract a doer has since rewritten alone");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
