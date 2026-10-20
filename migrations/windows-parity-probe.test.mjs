// WINDOWS-PARITY-PROBE-1 offline suite (agent_issues 2832 WINDOWS-SUITE-PARITY-1 and its PROBE-NEEDED-1 issue 100266).
// Applies migrations/2026-10-19-windows-parity-probe.sql on SQLite (node:sqlite) over fixtures with the live column lists and the live triggers that fire on an UPDATE of remediation_contracts,
// the append-only decision_log and the live views v_issue_dead_end and v_issues_no_next_action, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log), and that the file replays as a no-op and leaves a contract that is not the retired one alone;
//   2. contract issue-2832 becomes an external-https probe that qnfo-fleet-control's own rtHttpSpec accepts (read from source), that never reads the status of its issue and carries none of the red-drain
//      markers, that observes success only for a run that concluded success and (absent) for an empty list, a rate-limited answer and a non-JSON body, and that its creation filter keeps the two runs of
//      2026-10-19 (the green-by-construction ones, the last concluded success with 576 passed and 4 failed on both legs) from passing it;
//   3. the closing probe of PROBE-NEEDED-1 issue 100266, taken from migrations/2026-10-19-reopen-live-path.sql, reads pending before the file and ok after, and issue 2832 leaves v_issue_dead_end and
//      v_issues_no_next_action (the REOPEN-LIVE-PATH-1 reading of a live path);
//   4. the failure mode windows-parity-green-by-construction, its code-read detector (run through the consumer's own parse_code_probe and run_code_probe: ok on the workflow file, missing-marker on the same file
//      without the step), the capability row and the one decision row;
//   5. the workflow file: the failing last step is the last step of the job, runs `if: always()`, keeps the continue-on-error run step and the summary, has colon-free step names, declares no schedule, and its
//      script (run in bash against fixtures) exits 1 for a non-zero runner exit code, for a failing suite with exit code 0 and for no exit code at all, and 0 for a clean run;
//   6. the Rollback restores the retired contract text (while its module is still ours), removes what the file added, leaves the decision row, and the file applies again afterwards.
// Run: node --no-warnings migrations/windows-parity-probe.test.mjs
//   WPP_SKIP_MIGRATION=1 runs the same checks without applying the file, WPP_WORKFLOW=<file> checks another copy of the workflow (the pre-change file), WPP_MIGRATION=<file> a mutated copy: each must fail.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const sql = norm(readFileSync(process.env.WPP_MIGRATION ? resolve(process.env.WPP_MIGRATION) : join(here, "2026-10-19-windows-parity-probe.sql"), "utf8"));
const WF_PATH = process.env.WPP_WORKFLOW ? resolve(process.env.WPP_WORKFLOW) : join(root, ".github", "workflows", "windows-suite-parity.yml");
const wf = norm(readFileSync(WF_PATH, "utf8"));
const fleetSrc = norm(readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8"));
const rlp = norm(readFileSync(join(here, "2026-10-19-reopen-live-path.sql"), "utf8"));
const SKIP = process.env.WPP_SKIP_MIGRATION === "1";
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
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 200, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(/module = 'windows-parity-probe-1'/.test(rollback), "the Rollback restores the contract only while its module is still windows-parity-probe-1, so a later hand edit is not clobbered");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql + wf) && !/skip[ -]ci/i.test(sql + wf), "no claude.ai or anthropic.com link and no skip-CI token in the migration or the workflow");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql + wf), "no duration is stated in hours or days");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 6 && /^CREATE TABLE IF NOT EXISTS bak_20261019_windows_parity_probe AS\b/.test(stmts[0]) && /^UPDATE remediation_contracts SET\b/.test(stmts[1]) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[2]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[3]) && /^INSERT OR IGNORE INTO capability_ledger\b/.test(stmts[4]) && /^INSERT INTO decision_log\b/.test(stmts[5]), "six statements: backup, one UPDATE, failure mode, detector contract, capability row, decision row", stmts.map((s) => s.slice(0, 40)));
ok(/\bWHERE class = 'issue-2832' AND issue_id = 2832 AND status = 'superseded' AND instr\(verify_probe, 'FROM agent_issues WHERE id = 2832'\) > 0$/.test(stmts[1] || ""), "the UPDATE is guarded on the retired contract of issue 2832, so a replay or a hand edit is a no-op");
ok(!stmts.some((t) => /^(INSERT( OR \w+)? INTO|UPDATE|DELETE FROM)\s+"?(agent_issues|issue_triage)\b/i.test(t)), "no statement writes agent_issues or issue_triage");
ok(/scripts\/direct-content-deploy-ledger/.test(sql) && /multi-file B5/.test(sql) && /no-eol/.test(sql) && /self-repair A4/.test(sql), "the header names the four suites that stay red on Windows as the measured remaining work");
ok(/576 passed, 4 failed/.test(sql) && /39285893274/.test(sql), "the header records the green-by-construction run: 576 passed, 4 failed, run 39285893274");

// ---- 2. fixture: the live shapes ----
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
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, linked_session TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT, close_evidence TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, created_at INTEGER);
CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, outcome TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, released_at TEXT, expires_at TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY, status TEXT, source TEXT);
CREATE VIEW v_issues_no_next_action AS
SELECT a.id, a.priority, a.category, a.title, a.source, t.owner, a.linked_session,
       CAST((CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.created_at) / 3600000 AS INTEGER) AS age_h,
       a.created_at, a.updated_at
FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id
WHERE a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding'))
  AND instr(COALESCE(a.description, ''), 'code-task:') = 0
  AND instr(COALESCE(a.description, ''), 'session-task:') = 0
  AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.status NOT IN ('merged', 'closed', 'failed', 'needs_human')
                  AND instr(COALESCE(k.goal, ''), '[issue #' || a.id || ']') > 0)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
                  AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.status NOT IN ('resolved', 'dismissed') AND h.source = 'issue:' || a.id);
CREATE VIEW v_issue_dead_end AS
SELECT y.*,
  CASE WHEN y.lane = 'task-in-flight' THEN 'qnfo-code-orchestrator' ELSE 'probe-author' END AS next_actor
FROM (
  SELECT x.*,
    CASE
      WHEN x.code_task_status IS NOT NULL AND x.code_task_status NOT IN ('merged', 'failed', 'closed', 'superseded', 'needs_human') THEN 'task-in-flight'
      WHEN x.code_task_status = 'merged' THEN 'doer-merged-dod-unmeasured'
      WHEN x.code_task_status IS NOT NULL THEN 'task-ended'
      WHEN x.planner_outcome = 'untrusted' THEN 'planner-untrusted'
      WHEN x.planner_outcome IS NOT NULL THEN 'planner-' || x.planner_outcome
      ELSE 'unplanned'
    END AS lane
  FROM (
    SELECT a.id AS issue_id, a.priority, a.source,
      CAST((CAST(strftime('%s', 'now') AS INTEGER) - a.created_at / 1000) / 60 AS INTEGER) AS age_min,
      c.class AS contract_class, c.status AS contract_status,
      CASE
        WHEN c.class IS NULL THEN 'no-contract'
        WHEN c.status = 'needs-machine-probe' THEN 'needs-machine-probe'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:probe-unusable') = 1 THEN 'probe-unusable'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:closure-observing') = 1 THEN 'closure-observing-probe'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:closure-superseded') = 1 THEN 'closure-superseded'
        ELSE COALESCE(c.status, 'unknown')
      END AS reason,
      CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 1 ELSE 0 END AS has_code_task_line,
      (SELECT t.status FROM code_tasks t WHERE t.goal LIKE '%issue #' || a.id || ' %' OR t.goal LIKE '%issue #' || a.id || ']%'
         ORDER BY t.created_at DESC LIMIT 1) AS code_task_status,
      (SELECT p.outcome FROM issue_plans p WHERE p.issue_id = a.id) AS planner_outcome
    FROM agent_issues a
    LEFT JOIN remediation_contracts c ON c.class = (SELECT c0.class FROM remediation_contracts c0 WHERE c0.issue_id = a.id ORDER BY c0.ts DESC, c0.class DESC LIMIT 1)
    WHERE a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%'
      AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
      AND NOT EXISTS (SELECT 1 FROM remediation_contracts k WHERE k.issue_id = a.id AND k.status IN ('active', 'holding'))
  ) x
) y;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
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
// the closing probe of PROBE-NEEDED-1 issue 100266, read from the REOPEN-LIVE-PATH-1 file (the guard that decides what counts as a probe of its own)
const closeBlock = rlp.split(/\n(?=UPDATE remediation_contracts SET)/).find((b) => b.includes("'PROBE-NEEDED-1: issue-2832'") && /verify_probe = '/.test(b)) || "";
const closeM = /verify_probe = '((?:[^']|'')*)'/.exec(closeBlock);
const CLOSING_PROBE = closeM ? closeM[1].replace(/''/g, "'") : "";
ok(CLOSING_PROBE.includes("c.issue_id = 2832") && CLOSING_PROBE.includes("c.status IN ('active', 'holding')") && CLOSING_PROBE.includes("'needs-machine' || '-probe'"), "the PROBE-NEEDED-1 closing probe for issue 2832 was read from migrations/2026-10-19-reopen-live-path.sql", CLOSING_PROBE.slice(0, 80));

const OLD_PROBE = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 2832) AS observed";
const OLD_VERDICT = "superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)";
const OLD_ACTION = "VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect); passes once the issue is closed with issue_triage.close_evidence. A doer that knows the defect replaces this probe with one that measures it.";
const OLD_PRE = "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)";
const world = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const old = Date.now() - 3 * 86400000;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (2832, 'WINDOWS-SUITE-PARITY-1: 124 suites fail on the owner Windows box and pass on the ubuntu runner', 'Measured 2026-10-17', 'chatbox-closeout-20261017', 'reliability', 'medium', 'open', ?, ?)").run(old, old);
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (100266, 'PROBE-NEEDED-1: issue-2832', 'The probe to write', 'qnfo-fleet-control', 'reliability', 'medium', 'open', ?, ?)").run(old, old);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, last_attempt_at, last_verdict, module, next_due_at, attempts, deferred_since) VALUES ('issue-2832', 2832, ?, ?, ?, 'd1-query', 3, 'qnfo-fleet-control', 1, 'superseded', '2026-10-17 17:01:08', '2026-10-18 12:19:15', ?, 'probe-template-v3-generic', '2026-10-18 12:18:05', 32, NULL)").run(OLD_PRE, OLD_ACTION, OLD_PROBE, OLD_VERDICT);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, last_verdict, module, next_due_at, attempts, deferred_since) VALUES ('issue-100266', 100266, 'issue 2832 is open and none of its contracts holds a probe that can judge it', 'a doer writes the probe that measures issue 2832 and sets its contract active', ?, 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', '2026-10-19 21:49:17', 'deferred', 'reopen-live-path', '2026-10-20 04:49:04', 18, '2026-10-19 22:16:12')").run(CLOSING_PROBE);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('issue-2830', 2830, 'p', 'a', '{\"paths\":[\"x.yml\"],\"contains\":\"y\"}', 'code-read', 'qnfo-fleet-control', 1, 'active', 'measuring-probe-high-issues-1')").run();
  db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('reopen-without-live-path', 'fm', 'rc', 'rem', 'det', 'fm-reopen-without-live-path', '2026-10-19', 2954)").run();
  db.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('reopen-live-path', 'p', '2026-10-19T00:00:00Z', 'e')").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'HIGH-ISSUE-PROBES-1: an older decision', 'e', 'o', 'b', 'r')").run();
  return db;
};
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const snap = (db) => JSON.stringify(["remediation_contracts", "failure_modes", "capability_ledger", "decision_log", "agent_issues", "issue_triage"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const hasBak = (db) => q(db, "SELECT name FROM sqlite_master WHERE name = 'bak_20261019_windows_parity_probe'").length === 1;

const db = world();
const before = snap(db);
const startRow = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'");
const deadBefore = q(db, "SELECT issue_id FROM v_issue_dead_end").map((r) => r.issue_id);
const noNextBefore = q(db, "SELECT id FROM v_issues_no_next_action").map((r) => r.id);
const closingBefore = one(db, CLOSING_PROBE);
ok(deadBefore.includes(2832) && noNextBefore.includes(2832), "before the file: issue 2832 stands in v_issue_dead_end and in v_issues_no_next_action (the fixture is the live state)", { deadBefore, noNextBefore });
ok(closingBefore.expected === "ok" && /^pending: issue 2832 has no probe of its own yet/.test(closingBefore.observed), "before the file: the closing probe of PROBE-NEEDED-1 issue 100266 reads pending", closingBefore);
if (!SKIP) db.exec(sql);

// ---- 3. what the apply did to the contract ----
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'");
ok(c.status === "active" && c.verify_transport === "external-https" && c.issue_id === 2832, "issue-2832 is active on the external-https transport", [c.status, c.verify_transport]);
ok(c.last_verdict === null && c.attempts === 0 && c.deferred_since === null && c.max_attempts === 24 && c.expected_cadence_h === 1 && c.escalate_to === "qnfo-fleet-control" && c.module === "windows-parity-probe-1", "verdict, attempts and deferral cleared, max_attempts 24, hourly, escalating to qnfo-fleet-control, module windows-parity-probe-1", c);
ok(typeof c.next_due_at === "string" && c.next_due_at >= "2026" && c.next_due_at !== startRow.next_due_at, "it is due now", c.next_due_at);
ok(/^WINDOWS-PARITY-PROBE-1: /.test(c.precondition || "") && /^MEASURES the defect/.test(c.action || "") && /never from the status of the issue/.test(c.precondition || ""), "precondition and action say what is measured", [c.precondition, (c.action || "").slice(0, 40)]);
ok(/scripts\/direct-content-deploy-ledger/.test(c.action || "") && /multi-file B5/.test(c.action || "") && /4 failed of 580/.test(c.action || "") && /dispatch it/.test(c.action || ""), "the action names the remaining work, the 2026-10-19 figures and how to re-measure", c.action);
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(c)), "the contract states no duration in hours or days");
ok(hasBak(db) && q(db, "SELECT * FROM bak_20261019_windows_parity_probe").length === 1 && one(db, "SELECT status, verify_probe, last_verdict, module, attempts, max_attempts FROM bak_20261019_windows_parity_probe").verify_probe === OLD_PROBE, "the backup table holds the retired contract as it was");

// ---- 4. the probe, through qnfo-fleet-control's own executor functions ----
const a = fleetSrc.indexOf("var RT_TRANSPORTS"), b = fleetSrc.indexOf("async function rtHttpProbe");
ok(a > 0 && b > a, "the executor functions were found in qnfo-fleet-control/worker.js");
const rt = a > 0 && b > a ? new Function(fleetSrc.slice(a, b) + "; return { rtHttpSpec, rtHttpObserve, rtHttpFleetHost, RT_HTTP_HOSTS, RT_FLEET_HOSTS };")() : null;
let spec = null, raw = {};
try { raw = JSON.parse(c.verify_probe); } catch (e) { raw = {}; }
ok(JSON.stringify(Object.keys(raw).sort()) === '["check","expected","method","url"]', "the probe is a JSON object with url, method, check and expected", Object.keys(raw));
spec = rt ? rt.rtHttpSpec(c.verify_probe) : { ok: false };
ok(spec.ok === true && spec.method === "GET" && spec.check === "json:workflow_runs.0.conclusion" && spec.expected === "success", "rtHttpSpec accepts it: GET, json:workflow_runs.0.conclusion, expected success", spec);
ok(rt && !rt.rtHttpFleetHost(c.verify_probe), "api.github.com is not a fleet host (no same-account artifact: the fleet-control tick runs it, the consumer skips it)");
const U = new URL(raw.url || "https://invalid.example/");
ok(U.protocol === "https:" && U.hostname === "api.github.com" && U.pathname === "/repos/QNFO/qnfo-workers/actions/workflows/windows-suite-parity.yml/runs" && existsSync(join(root, ".github", "workflows", "windows-suite-parity.yml")), "it reads the runs of the workflow file that exists in the repository", [U.hostname, U.pathname]);
ok(U.searchParams.get("per_page") === "1" && U.searchParams.get("status") === "completed" && U.searchParams.get("branch") === "main" && U.searchParams.get("created") === ">=2026-10-20T00:00:00Z", "one run, completed, on main, created on or after 2026-10-20T00:00:00Z", Object.fromEntries(U.searchParams));
ok(!/\b(agent_issues|SELECT|status FROM)\b/.test(c.verify_probe) && !c.verify_probe.includes("needs-machine-probe") && !c.verify_probe.includes(";"), "the probe does not read the status of its issue, is not needs-machine-probe and carries no semicolon");
ok(spec.ok === true && new URL(spec.url).searchParams.get("created") === ">=2026-10-20T00:00:00Z" && new URL(spec.url).searchParams.get("per_page") === "1", "the executor's normalised URL keeps the creation filter and the page size", spec.url);

// GitHub's runs filter as the probe uses it (checked live on 2026-10-20: with the created filter {"total_count":0,"workflow_runs":[]}, without it run 2 concluding success)
const run = (id, n, event, status, conclusion, created, branch = "main") => ({ id, name: "windows-suite-parity", head_branch: branch, head_sha: "3e2e1427eafd09ff0c33cda5792fc6b42d12f111", path: ".github/workflows/windows-suite-parity.yml", run_number: n, event, status, conclusion, workflow_id: 389622998, created_at: created, updated_at: created });
const RUN1 = run(39285859359, 1, "push", "completed", "cancelled", "2026-10-19T16:29:39Z");
const RUN2 = run(39285893274, 2, "workflow_dispatch", "completed", "success", "2026-10-19T16:29:55Z");
const ghRuns = (url, runs) => {
  const p = new URL(url).searchParams;
  let r = runs.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
  if (p.get("status") === "completed") r = r.filter((x) => x.status === "completed");
  if (p.get("branch")) r = r.filter((x) => x.head_branch === p.get("branch"));
  const cr = p.get("created");
  if (cr && cr.startsWith(">=")) r = r.filter((x) => x.created_at >= cr.slice(2));
  return JSON.stringify({ total_count: r.length, workflow_runs: r.slice(0, Number(p.get("per_page") || 30)) });
};
const get = () => null;
const observe = (body, status = 200) => rt.rtHttpObserve(spec, status, get, body);
if (rt && spec.ok) {
  ok(observe(ghRuns(spec.url, [RUN1, RUN2])) === "(absent)", "the two runs of 2026-10-19 (cancelled, and the green-by-construction success with 576 passed, 4 failed) leave the list empty: the probe observes (absent), not success", observe(ghRuns(spec.url, [RUN1, RUN2])));
  const noFilter = spec.url.replace(/&created=[^&]*/, "");
  ok(noFilter !== spec.url && observe(ghRuns(noFilter, [RUN1, RUN2])) === "success", "without the creation filter the same probe passes on run 2, which is the false green the filter removes", observe(ghRuns(noFilter, [RUN1, RUN2])));
  const red = run(39400000001, 3, "push", "completed", "failure", "2026-10-20T05:12:00Z");
  const green = run(39400000002, 4, "workflow_dispatch", "completed", "success", "2026-10-20T09:30:00Z");
  ok(observe(ghRuns(spec.url, [RUN1, RUN2, red])) === "failure" && observe(ghRuns(spec.url, [RUN1, RUN2, red])) !== spec.expected, "a red run of the changed workflow reads failure: the defect stands", observe(ghRuns(spec.url, [RUN1, RUN2, red])));
  ok(observe(ghRuns(spec.url, [RUN1, RUN2, red, green])) === spec.expected, "a later green run reads success: the probe passes", observe(ghRuns(spec.url, [RUN1, RUN2, red, green])));
  const going = run(39400000003, 5, "push", "in_progress", null, "2026-10-20T10:00:00Z");
  ok(observe(ghRuns(spec.url, [RUN1, RUN2, red, green, going])) === "success", "a run that is still going is left out (status=completed): the last finished run is read", observe(ghRuns(spec.url, [RUN1, RUN2, red, green, going])));
  const other = run(39400000004, 6, "workflow_dispatch", "completed", "success", "2026-10-20T11:00:00Z", "a-branch");
  ok(observe(ghRuns(spec.url, [RUN1, RUN2, red, other])) === "failure", "a green dispatch on another branch does not pass it (branch=main)", observe(ghRuns(spec.url, [RUN1, RUN2, red, other])));
  const cancelled = run(39400000005, 7, "push", "completed", "cancelled", "2026-10-20T12:00:00Z");
  ok(observe(ghRuns(spec.url, [RUN1, RUN2, green, cancelled])) === "cancelled", "a cancelled latest run reads cancelled, not success", observe(ghRuns(spec.url, [RUN1, RUN2, green, cancelled])));
  const timedOut = run(39400000006, 8, "push", "completed", "timed_out", "2026-10-20T13:00:00Z");
  ok(observe(ghRuns(spec.url, [green, timedOut])) === "timed_out", "a timed-out latest run reads timed_out", observe(ghRuns(spec.url, [green, timedOut])));
  ok(observe(JSON.stringify({ total_count: 0, workflow_runs: [] })) === "(absent)", "an empty list observes (absent)");
  ok(observe(JSON.stringify({ message: "API rate limit exceeded for 1.2.3.4.", documentation_url: "https://docs.github.com/rest" }), 403) === "(absent)", "a rate-limited answer (403 with a message) observes (absent)");
  ok(observe("<html>Bad gateway</html>", 502) === "(not json)", "a non-JSON body observes (not json)");
  ok(observe(JSON.stringify({ workflow_runs: [{ conclusion: null }] })) === "null", "a run with no conclusion yet observes null");
  ok(["failure", "cancelled", "timed_out", "skipped", "neutral", "action_required", "stale", "(absent)", "(not json)", "null"].every((x) => x !== spec.expected), "success is the only value that equals expected");
}

// ---- 5. the REOPEN-LIVE-PATH-1 reading of a live path ----
const closingAfter = one(db, CLOSING_PROBE);
ok(closingAfter.expected === "ok" && closingAfter.observed === "ok", "after the file: the closing probe of PROBE-NEEDED-1 issue 100266 reads ok (an active contract with a probe of its own that is neither needs-machine-probe nor a read of the issue's own status)", closingAfter);
const deadAfter = q(db, "SELECT issue_id FROM v_issue_dead_end").map((r) => r.issue_id);
const noNextAfter = q(db, "SELECT id FROM v_issues_no_next_action").map((r) => r.id);
ok(!deadAfter.includes(2832) && !noNextAfter.includes(2832), "after the file: issue 2832 leaves v_issue_dead_end and v_issues_no_next_action", { deadAfter, noNextAfter });
ok(one(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE issue_id = 2832 AND status IN ('active', 'holding')").n === 1, "issue 2832 holds exactly one live contract");
{
  // what does not count as a probe of its own still reads pending, so the reading is not a constant
  const w = world();
  w.prepare("UPDATE remediation_contracts SET status = 'active', verify_probe = ? WHERE class = 'issue-2832'").run(OLD_PROBE);
  ok(/^pending/.test(one(w, CLOSING_PROBE).observed), "the retired probe, even set active, still reads pending (the reading is not a constant)", one(w, CLOSING_PROBE));
}
// red-drain and the loop-owned detectors match these two literals in an active probe: the new probe contains neither
ok(!c.verify_probe.includes("needs-machine" + "-probe") && !c.verify_probe.includes("SELECT status FROM agent_issues WHERE" + " id ="), "the probe carries neither marker the dead-end and circular-probe detectors match");

// ---- 6. the file touches nothing else ----
ok(JSON.stringify(q(db, "SELECT * FROM agent_issues ORDER BY id")) === JSON.stringify(JSON.parse(before)[4]) && q(db, "SELECT * FROM issue_triage").length === 0, "agent_issues and issue_triage are exactly as they were");
ok(JSON.stringify(q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100266'")) === JSON.stringify(JSON.parse(before)[0].filter((r) => r.class === "issue-100266")) && JSON.stringify(q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-2830'")) === JSON.stringify(JSON.parse(before)[0].filter((r) => r.class === "issue-2830")), "the contracts of other issues, the PROBE-NEEDED-1 one included, are exactly as they were");
ok(q(db, "SELECT class FROM remediation_contracts ORDER BY class").map((r) => r.class).join(",") === "fm-windows-parity-green-by-construction,issue-100266,issue-2830,issue-2832", "one contract added, the detector", q(db, "SELECT class FROM remediation_contracts ORDER BY class"));

// ---- 7. the failure mode, its detector, the capability row ----
const FM = "windows-parity-green-by-construction";
const MARKER = "- name: Fail the run when a suite is red on Windows\n        if: always()";
const fmr = q(db, "SELECT * FROM failure_modes WHERE fm_key = ?", FM);
ok(fmr.length === 1, "one failure_modes row for " + FM, fmr.length);
const fr = fmr[0] || {};
ok(fr.probe_class === "fm-" + FM && fr.first_seen === "2026-10-19" && fr.issue_id === 2832, "its probe_class is fm- plus the key, first_seen 2026-10-19, issue 2832", fr);
ok(["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof fr[k] === "string" && fr[k].length > 40), "every failure_modes text column is filled", Object.keys(fr).filter((k) => fr[k] == null));
ok(/continue-on-error/.test(fr.root_cause || "") && /576 passed, 4 failed/.test(fr.root_cause || "") && /100266/.test(fr.root_cause || "") && /if: always\(\)/.test(fr.remediation || "") && /2026-10-20T00:00:00Z/.test(fr.remediation || "") && /fm-windows-parity-green-by-construction/.test(fr.detector || ""), "root cause, remediation and detector state the mechanism, the step, the creation date and the contract", fr);
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(fr)), "the failure mode states no duration in hours or days");
const dc = q(db, "SELECT * FROM remediation_contracts WHERE class = ?", "fm-" + FM);
ok(dc.length === 1, "one detector contract", dc.length);
const dr0 = dc[0] || {};
ok(dr0.class === fr.probe_class && dr0.verify_transport === "code-read" && dr0.status === "active" && dr0.issue_id === null && dr0.max_attempts === 3 && dr0.escalate_to === "qnfo-fleet-control" && dr0.expected_cadence_h === 1 && dr0.precondition === "WINDOWS-PARITY-PROBE-1" && dr0.action === "failure-mode detector" && dr0.module === "failure-mode" && dr0.budget_ms === 45000 && dr0.max_items === 5 && dr0.requires_container === 0 && typeof dr0.next_due_at === "string", "the detector is an active hourly code-read contract with the shape of the sibling detectors", dr0);
{
  const dspec = (() => { try { return JSON.parse(dr0.verify_probe || ""); } catch (e) { return {}; } })();
  ok(JSON.stringify(Object.keys(dspec).sort()) === '["contains","paths"]' && JSON.stringify(dspec.paths) === '[".github/workflows/windows-suite-parity.yml"]' && dspec.contains === MARKER, "it reads the workflow file for the failing step and its if: always()", dr0.verify_probe);
  ok(wf.split(MARKER).length - 1 === 1, "that marker occurs exactly once in the workflow file (not in a header comment)", wf.split(MARKER).length - 1);
  const judge = (probeText, rootDir) => {
    if (!PY) return { err: "no python", observed: null };
    const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(root, "scripts"), probeText, rootDir], { encoding: "utf8" });
    try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: r.stderr }; }
  };
  const tmp = mkdtempSync(join(tmpdir(), "wpp-"));
  const put = (dir, text) => { mkdirSync(join(dir, ".github", "workflows"), { recursive: true }); writeFileSync(join(dir, ".github", "workflows", "windows-suite-parity.yml"), text); };
  const withStep = join(tmp, "with"), without = join(tmp, "without"), commentOnly = join(tmp, "comment");
  put(withStep, wf);
  const cut = wf.indexOf(MARKER) >= 0 ? wf.slice(0, wf.lastIndexOf("      - name: Fail the run when a suite is red on Windows")) : wf;
  put(without, cut);
  put(commentOnly, cut + "# - name: Fail the run when a suite is red on Windows\n#   if: always()\n");
  const j1 = judge(dr0.verify_probe || "{}", withStep), j2 = judge(dr0.verify_probe || "{}", without), j3 = judge(dr0.verify_probe || "{}", commentOnly);
  ok(j1.err === null && j1.observed === "ok", "the consumer parses the detector and judges it ok on the workflow file", j1);
  ok(j2.err === null && j2.observed === "missing-marker:.github/workflows/windows-suite-parity.yml", "the same detector fails (missing-marker) on the workflow without the step", j2);
  ok(j3.err === null && j3.observed === "missing-marker:.github/workflows/windows-suite-parity.yml", "a commented-out copy of the step is not the step", j3);
}
const cap = q(db, "SELECT * FROM capability_ledger WHERE capability = 'windows-parity-measured'");
ok(cap.length === 1 && /2026-10-19-windows-parity-probe\.sql/.test(cap[0].provenance) && /windows-latest/.test(cap[0].prerequisites) && /issue-2832/.test(cap[0].reliability) && /fm-windows-parity-green-by-construction/.test(cap[0].reliability) && /39285893274/.test(cap[0].evidence) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(cap[0].acquired_at) && cap[0].last_exercised_at === null, "one capability_ledger row names the migration, the runner, the contract, the detector and the evidence", cap);

// ---- 8. the decision row ----
const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1");
ok(dl.length === 1, "one decision_log row for WINDOWS-PARITY-PROBE-1", dl.length);
const d = dl[0] || {};
ok(d.actor === "session_01QpQv19uh1padRwZ3u1r766", "the actor is the session", d.actor);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof d[k] === "string" && d[k].length > 3), "every doctrine column is filled (capability_gain, predicted_outcome, reach_gain, surfaces_tested included)", Object.keys(d).filter((k) => d[k] == null));
ok(!/ within /.test(d.predicted_outcome || "") && /issue-2832/.test(d.predicted_outcome || "") && /\(absent\)/.test(d.predicted_outcome || "") && /4 failed of 580/.test(d.predicted_outcome || ""), "the prediction is prose (no registered metric fits, and no ' within ' for decision_predictions_parse), names the contract, its first read and the 2026-10-19 figures", d.predicted_outcome);
ok(/bak_20261019_windows_parity_probe/.test(d.rollback_path || "") && /append-only/.test(d.rollback_path || ""), "the rollback path names the backup table and the append-only note");
ok(d.outcome_matched === null, "outcome_matched is left for the result to set");

// ---- 9. the workflow file ----
{
  const wl = wf.split("\n");
  const stepsAt = wl.findIndex((l) => /^    steps:\s*$/.test(l));
  ok(stepsAt > 0, "the job has a steps list");
  const steps = [];
  for (let i = stepsAt + 1; i < wl.length; i++) {
    if (/^      - /.test(wl[i])) steps.push({ at: i, lines: [wl[i]] });
    else if (steps.length && (/^        /.test(wl[i]) || wl[i].trim() === "")) steps[steps.length - 1].lines.push(wl[i]);
    else if (steps.length && wl[i].trim() !== "") break;
  }
  const text = (s) => s.lines.join("\n");
  const nameOf = (s) => ((/^      - name: (.*)$/m.exec(text(s)) || [])[1] || "").trim();
  const names = steps.map(nameOf);
  ok(steps.length === 5 && names[2] === "Run every offline suite" && names[3] === "Report the failing suites" && names[4] === "Fail the run when a suite is red on Windows", "five steps in order: checkout, setup-node, run, report, and the failing last step", names);
  const last = steps[steps.length - 1] || { lines: [] };
  ok(last && nameOf(last) === "Fail the run when a suite is red on Windows" && last.at === Math.max(...steps.map((s) => s.at)), "the failing step is the last step of the job");
  ok(/^        if: always\(\)$/m.test(text(last)), "the failing step runs `if: always()`");
  ok(/\bexit 1\b/.test(text(last)) && /steps\.suites\.outputs\.exit_code/.test(text(last)) && /\[ "\$rc" != "0" \]/.test(text(last)) && /grep -c '\^FAIL '/.test(text(last)) && /-gt 0/.test(text(last)), "it exits 1 when the runner exit code is not 0 or the failing count is above 0, from the same exit_code output and FAIL lines the report step reads");
  const run3 = steps[2] ? text(steps[2]) : "", rep = steps[3] ? text(steps[3]) : "";
  ok(/^        id: suites$/m.test(run3) && /^        continue-on-error: true$/m.test(run3) && /echo "exit_code=\$rc" >> "\$GITHUB_OUTPUT"/.test(run3) && /node scripts\/run-suites\.mjs --all --jobs 4/.test(run3), "the run step keeps its id, continue-on-error and the exit_code output");
  ok(/^        if: always\(\)$/m.test(rep) && /GITHUB_STEP_SUMMARY/.test(rep) && /failing suites:/.test(rep), "the report step and the job summary are kept");
  ok(names.every((n) => !/: /.test(n)) && /^name: windows-suite-parity$/m.test(wf), "every step name is colon-free (WORKFLOW-YAML-LINT-1) and the workflow keeps its name");
  ok(!/^\s*schedule:/m.test(wf) && !/\bcron:/.test(wf) && /^  workflow_dispatch:$/m.test(wf) && /branches: \[main\]/.test(wf) && /"scripts\/run-suites\.mjs"/.test(wf) && /"\.github\/workflows\/windows-suite-parity\.yml"/.test(wf), "triggers are unchanged: dispatch and a push to main on the runner or the file, no schedule");
  ok(/^permissions:\n  contents: read$/m.test(wf) && /runs-on: windows-latest/.test(wf) && /node: \["22", "24"\]/.test(wf) && /fail-fast: false/.test(wf) && /timeout-minutes: 45/.test(wf), "permissions, runner, the two node legs, fail-fast false and the timeout are unchanged");
  ok(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/.test(wf) && /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7\.1\.0/.test(wf), "the action pins are unchanged");
  ok(/advisory for merging/.test(wf) && /not a required check/.test(wf) && /deploy-gate\.yml/.test(wf) && /CONCLUSION now reports parity/.test(wf) && /issue-2832/.test(wf), "the header says the run stays advisory for merging and that its conclusion now reports parity");

  // the script of the failing step, run in bash against fixtures (skipped when no bash is on PATH)
  const script = (() => { const m = /^        run: \|\n((?:          .*\n?|\n)+)/m.exec(text(last) + "\n"); return m ? m[1].split("\n").map((l) => l.replace(/^          /, "")).join("\n") : ""; })();
  ok(script.length > 100, "the script of the failing step was read");
  const probeBash = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
  if (probeBash.status !== 0) console.log("NOTE no bash on PATH: the failing step's script is checked statically only");
  else if (script) {
    const exec = (rc, report) => {
      const dir = mkdtempSync(join(tmpdir(), "wpp-run-"));
      if (report !== null) writeFileSync(join(dir, "suite-report.txt"), report);
      const s = script.replace(/\$\{\{ steps\.suites\.outputs\.exit_code \}\}/g, rc).replace(/\$\{\{ matrix\.node \}\}/g, "22");
      const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", s], { cwd: dir, encoding: "utf8" });
      return { code: r.status, out: String(r.stdout) };
    };
    const OKS = "SUITE-RUNNER-1: 3 of 3 suites (all)\nok      12 ms  a/a.test.mjs\nok      15 ms  b/b.test.mjs\n\nSUITE-RUNNER-1: 2 passed, 0 failed\n";
    const BAD = "ok      12 ms  a/a.test.mjs\nFAIL    15 ms  b/b.test.mjs\n\nSUITE-RUNNER-1: 1 passed, 1 failed\n";
    const g = exec("0", OKS);
    ok(g.code === 0 && /green on node 22/.test(g.out), "exit code 0 and no failing suite: the step passes", g);
    const r1 = exec("1", BAD);
    ok(r1.code === 1 && /red on node 22/.test(r1.out) && /1 failing suites/.test(r1.out), "exit code 1 and one failing suite: the step fails and says so", r1);
    ok(exec("0", BAD).code === 1, "exit code 0 with a FAIL line in the report: the step still fails");
    ok(exec("1", OKS).code === 1, "exit code 1 with no FAIL line (a quarantine problem or a crash): the step fails");
    ok(exec("", OKS).code === 1 && /exit code none/.test(exec("", OKS).out), "no exit code at all (the run step never reached its output): the step fails");
    ok(exec("1", null).code === 1, "a non-zero exit code and no report file: the step fails");
    ok(exec("2", "").code === 1, "an empty report and exit code 2 (usage error): the step fails");
  }
}

// ---- 10. replay, a contract that is not the retired one, rollback ----
if (!SKIP) {
  const once = snap(db);
  db.exec(sql);
  ok(snap(db) === once, "a replay changes nothing (contracts, failure modes, capability, decisions)");
  ok(q(db, "SELECT * FROM bak_20261019_windows_parity_probe").length === 1 && one(db, "SELECT verify_probe FROM bak_20261019_windows_parity_probe").verify_probe === OLD_PROBE, "and the replay leaves the backup holding the original row");

  const hand = world();
  hand.prepare("UPDATE remediation_contracts SET status = 'active', verify_transport = 'runner-https', verify_probe = '{\"url\": \"https://qnfo.org/x\", \"status\": 200}', module = 'a-doer' WHERE class = 'issue-2832'").run();
  const handRow = JSON.stringify(one(hand, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'"));
  hand.exec(sql);
  ok(JSON.stringify(one(hand, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'")) === handRow, "a contract a doer already set active with a probe of their own is left alone");
  const parked = world();
  parked.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'monitoring:loop-owned-48h' WHERE class = 'issue-2832'").run();
  const parkedRow = JSON.stringify(one(parked, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'"));
  parked.exec(sql);
  ok(JSON.stringify(one(parked, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'")) === parkedRow, "a contract in another state than the retired one is left alone");
  ok(one(hand, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1").n === 1 && one(hand, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'").n === 1, "the failure mode and the decision row are still added when the contract is left alone");
  const pre = world();
  pre.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('windows-parity-green-by-construction', 'theirs', 'theirs', 'theirs', 'theirs', 'fm-windows-parity-green-by-construction', '2026-10-18', 1)").run();
  pre.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('windows-parity-measured', 'theirs', '2026-10-18T00:00:00Z', 'theirs')").run();
  pre.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'WINDOWS-PARITY-PROBE-1: written by hand', 'e', 'o', 'b', 'r')").run();
  pre.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('fm-windows-parity-green-by-construction', 'theirs', 'theirs', '{\"paths\":[\"x\"],\"contains\":\"y\"}', 'code-read', 'someone', 'paused')").run();
  const fmBefore = JSON.stringify([q(pre, "SELECT * FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'"), q(pre, "SELECT * FROM capability_ledger WHERE capability = 'windows-parity-measured'"), q(pre, "SELECT * FROM remediation_contracts WHERE class = 'fm-windows-parity-green-by-construction'"), q(pre, "SELECT COUNT(*) AS n FROM decision_log")]);
  pre.exec(sql);
  ok(JSON.stringify([q(pre, "SELECT * FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'"), q(pre, "SELECT * FROM capability_ledger WHERE capability = 'windows-parity-measured'"), q(pre, "SELECT * FROM remediation_contracts WHERE class = 'fm-windows-parity-green-by-construction'"), q(pre, "SELECT COUNT(*) AS n FROM decision_log")]) === fmBefore, "a failure mode, capability row, detector contract and decision row that already exist are not overwritten or duplicated");

  // Rollback
  db.exec(rollback);
  const back = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-2832'");
  const keys = Object.keys(startRow).filter((k) => k !== "next_due_at");   // remediation_probe_edit_rerun stamps next_due_at = now on any probe change, as live
  ok(keys.every((k) => back[k] === startRow[k]), "the Rollback restores the retired contract: status, probe, transport, verdict, module, text, attempts, max_attempts, deferral and ts", keys.filter((k) => back[k] !== startRow[k]).map((k) => [k, back[k], startRow[k]]));
  ok(back.status === "superseded" && back.verify_probe === OLD_PROBE && back.verify_transport === "d1-query" && back.max_attempts === 3 && back.attempts === 32 && back.last_verdict === OLD_VERDICT, "and the starting probe text, transport, verdict and counters are back", back);
  ok(q(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-windows-parity-green-by-construction'")[0].n === 0 && q(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'")[0].n === 0 && q(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'windows-parity-measured'")[0].n === 0, "the Rollback removes the detector contract, the failure mode and the capability row");
  ok(q(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'reopen-without-live-path'")[0].n === 1 && q(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'reopen-live-path'")[0].n === 1 && q(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class IN ('issue-100266', 'issue-2830')")[0].n === 2, "and nothing of the sibling rows");
  ok(q(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1")[0].n === 1, "the Rollback leaves the decision row");
  let refused = false;
  try { db.exec("DELETE FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1"); } catch (e) { refused = /append-only/.test(String(e.message)); }
  ok(refused, "the fixture's append-only trigger refuses a DELETE of the decision row, which is why the Rollback does not try");
  ok(deadBefore.includes(2832) && q(db, "SELECT issue_id FROM v_issue_dead_end").map((r) => r.issue_id).includes(2832), "after the Rollback issue 2832 is back in v_issue_dead_end, as before the file");
  db.exec(sql);
  ok(one(db, "SELECT status, module FROM remediation_contracts WHERE class = 'issue-2832'").status === "active" && one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'").n === 1 && one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1").n === 1 && q(db, "SELECT * FROM bak_20261019_windows_parity_probe").length === 1, "the file applies again after a Rollback: contract, failure mode and detector are back, one decision row, one backup row");
  // a hand edit after the apply is not clobbered by the Rollback
  const edited = world();
  edited.exec(sql);
  edited.prepare("UPDATE remediation_contracts SET module = 'a-doer', verify_probe = '{\"url\": \"https://api.github.com/x\", \"check\": \"status\", \"expected\": \"200\"}' WHERE class = 'issue-2832'").run();
  edited.exec(rollback);
  ok(one(edited, "SELECT module FROM remediation_contracts WHERE class = 'issue-2832'").module === "a-doer" && one(edited, "SELECT status FROM remediation_contracts WHERE class = 'issue-2832'").status === "active", "a doer's later edit of the contract is not clobbered by the Rollback");

  if (PY) {
    const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", join(here, "2026-10-19-windows-parity-probe.sql")], { encoding: "utf8" });
    ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
  }
} else {
  ok(snap(db) !== before, "(skip mode) the file changed the world");
}

console.log(`windows-parity-probe: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
