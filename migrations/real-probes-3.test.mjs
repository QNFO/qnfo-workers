// REAL-PROBES-3 offline suite (agent_issues 100293 MERGE-LANE-THROUGHPUT-1, 100308 CF-MODEL-EVAL-1, 100314 PROBE-NEEDED-1 for 100308, 100320 APPLIER-ROT-ERROR).
// Applies migrations/2026-10-20-real-probes-3.sql on SQLite (node:sqlite) over fixtures with the live column lists, the live triggers that fire on an UPDATE or an INSERT of remediation_contracts and the
// append-only decision_log, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log and restores only while module is still real-probes-3), the migration check, no duration in hours or days;
//   2. the four contracts (circular, born superseded; and the probe-review-refused one) become active contracts of module real-probes-3 with a probe that measures the definition of done, and a replay, a probe a doer
//      wrote by hand and a contract in another state are left alone;
//   3. issue-100293: the probe observes pending with the first failing clause and its number on fixtures shaped like 2026-10-20 (queue 279 minutes, merged 113 of 248), names each clause on its own, reads ok only when
//      queue, merged share, the same two figures for the window that ended 1440 minutes earlier and the issue throughput all hold, never reads the status of issue 100293, and is accepted by both executors;
//   4. issue-100308: pending for the state of today (ladder row active=1, catalog in_production, no canary row, no rejection), for the picture the notice painted (active=0) and for no row at all; ok only for a
//      recorded rejection, a retired or BLOCKED roadmap item, or an active ladder row with a canary agreement of 0.7 or more; another model's records do not count; it names no issue table;
//   5. issue-100314: pending while contract issue-100308 is absent, superseded, a placeholder or circular, or on another transport; ok once it holds an active or holding d1-query contract with a probe of its own;
//   6. issue-100320: a code-read probe, run through the consumer's own parse_code_probe and run_code_probe, that fails on the doctor report of today (present-marker) and on a report that names the script in any list,
//      and passes on a report without it; an emptied or replaced file cannot pass;
//   7. the failure mode applier-version-step-not-idempotent, its code-read detector (ok on the script on main, missing-marker without the branch) and the one decision row;
//   8. the Rollback restores the four contracts, removes what the file added and leaves the decision row; the file applies again afterwards.
// Run: node --no-warnings migrations/real-probes-3.test.mjs
//   RP3_SKIP_MIGRATION=1 runs the same checks without applying the file (the pre-change state): the contract checks must fail. RP3_MIGRATION=<file> checks a mutated copy.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const sql = norm(readFileSync(process.env.RP3_MIGRATION ? resolve(process.env.RP3_MIGRATION) : join(here, "2026-10-20-real-probes-3.sql"), "utf8"));
const fleetSrc = norm(readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8"));
const cloudSrc = norm(readFileSync(join(root, "qnfo-cloud-ops", "worker.js"), "utf8"));
const SCRIPT = join(root, "scripts", "checkin-scale-anchored-1-patch.py");
const SKIP = process.env.RP3_SKIP_MIGRATION === "1";
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
ok(/module = 'real-probes-3'/.test(rollback) && /bak_20261020_real_probes_3/.test(rollback), "the Rollback restores from the backup table only while module is still real-probes-3");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql), "no duration is stated in hours or days (minutes only, SLA-120M-1)");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 8 && /^CREATE TABLE IF NOT EXISTS bak_20261020_real_probes_3 AS\b/.test(stmts[0]) && [1, 2, 3, 4].every((i) => /^UPDATE remediation_contracts SET\b/.test(stmts[i])) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[5]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[6]) && /^INSERT INTO decision_log\b/.test(stmts[7]), "eight statements: backup, four guarded UPDATEs, failure mode, detector contract, decision row", stmts.map((s) => s.slice(0, 40)));
for (const [i, id] of [[1, 100293], [2, 100308], [3, 100314], [4, 100320]]) {
  const re = new RegExp("WHERE class = 'issue-" + id + "' AND issue_id = " + id + " AND status IN \\('superseded', 'probe-review-refused'\\) AND instr\\(verify_probe, '[^']+'\\) > 0$");
  ok(re.test(stmts[i] || ""), "UPDATE " + i + " is guarded on the retired state of issue " + id + " (status and the circular text still in the probe), so a replay or a hand edit is a no-op");
}
ok(!stmts.some((t) => /^(INSERT( OR \w+)? INTO|UPDATE|DELETE FROM)\s+"?(agent_issues|issue_triage)\b/i.test(t)), "no statement writes agent_issues or issue_triage");
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", process.env.RP3_MIGRATION ? resolve(process.env.RP3_MIGRATION) : join(here, "2026-10-20-real-probes-3.sql")], { encoding: "utf8" });
  ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
}

// ---- 2. the world: live column lists and triggers, and the four contracts as read on 2026-10-20 ----
const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
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
CREATE TRIGGER remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts
WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_contracts_cadence_floor_ai AFTER INSERT ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TRIGGER sla_120_guard_contract_ins AFTER INSERT ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END;
CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
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
const circ = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const OLD_100314 = "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = 100308 AND x.status = 'open') THEN 'ok' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 100308 AND c.status IN ('active', 'holding') AND instr(c.verify_probe, 'needs-machine' || '-probe') = 0 AND instr(c.verify_probe, 'SELECT status FROM agent_issues WHERE' || ' id =') = 0 AND instr(c.verify_probe, 'agent_issues WHERE id = 100308)') = 0) THEN 'ok' ELSE 'pending: issue 100308 has no probe of its own yet, a doer writes one' END AS observed";
const V3_VERDICT = "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)";
const V3_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const V3_PRE = "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)";
const COLS = "class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, last_attempt_at, last_verdict, module, next_due_at, attempts, deferred_since";
const world = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const ins = db.prepare("INSERT INTO remediation_contracts (" + COLS + ") VALUES (?, ?, ?, ?, ?, 'd1-query', 3, 'qnfo-fleet-control', 1, ?, ?, ?, ?, ?, ?, ?, ?)");
  ins.run("issue-100293", 100293, V3_PRE, V3_ACTION, circ(100293), "superseded", "2026-10-20 05:03:26", null, V3_VERDICT, "probe-template-v3-generic", "2026-10-20 05:03:26", 0, null);
  ins.run("issue-100308", 100308, V3_PRE, V3_ACTION, circ(100308), "superseded", "2026-10-20 06:21:19", null, V3_VERDICT, "probe-template-v3-generic", "2026-10-20 06:21:19", 0, null);
  ins.run("issue-100314", 100314, "issue 100308 is open and none of its contracts holds a probe that can judge it", "a doer writes the probe that measures issue 100308 and sets its contract active", OLD_100314, "probe-review-refused", "2026-10-20 07:21:21", "2026-10-20 07:25:57", "probe-review-refused", "reopen-live-path", "2026-10-20 07:31:05", 1, "2026-10-20 07:25:57");
  ins.run("issue-100320", 100320, V3_PRE, V3_ACTION, circ(100320), "superseded", "2026-10-20 08:23:23", null, V3_VERDICT, "probe-template-v3-generic", "2026-10-20 08:23:23", 0, null);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('issue-100266', 100266, 'p', 'a', '{\"paths\":[\"x.yml\"],\"contains\":\"y\"}', 'code-read', 'qnfo-fleet-control', 1, 'active', 'windows-parity-probe-1')").run();
  db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('windows-parity-green-by-construction', 'fm', 'rc', 'rem', 'det', 'fm-windows-parity-green-by-construction', '2026-10-19', 2832)").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'WINDOWS-PARITY-PROBE-1: an older decision', 'e', 'o', 'b', 'r')").run();
  for (const id of [100293, 100308, 100314, 100320]) db.prepare("INSERT INTO agent_issues (id, title, status, created_at, updated_at) VALUES (?, 't', 'open', 1, 1)").run(id);
  return db;
};
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
// a probe run: a probe that cannot run on the fixture (the pre-change state runs the circular text against tables it has not got) is a failed check, not a crash
const runProbe = (d, s) => { try { return d.prepare(s).get() || { expected: null, observed: null }; } catch (e) { return { expected: null, observed: "ERROR " + String(e.message).slice(0, 80) }; } };
const snap = (db) => JSON.stringify(["remediation_contracts", "failure_modes", "decision_log", "agent_issues"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const hasBak = (db) => q(db, "SELECT name FROM sqlite_master WHERE name = 'bak_20261020_real_probes_3'").length === 1;
const IDS = ["issue-100293", "issue-100308", "issue-100314", "issue-100320"];

const db = world();
const before = snap(db);
const start = Object.fromEntries(IDS.map((c) => [c, one(db, "SELECT * FROM remediation_contracts WHERE class = ?", c)]));
if (!SKIP) db.exec(sql);

// ---- 3. what the apply did to the four contracts ----
const row = (c) => one(db, "SELECT * FROM remediation_contracts WHERE class = ?", c) || {};
for (const c of IDS) {
  const r = row(c);
  ok(r.status === "active" && r.module === "real-probes-3" && r.last_verdict === null && r.attempts === 0 && r.deferred_since === null && r.max_attempts === 24 && r.expected_cadence_h === 1 && r.escalate_to === "qnfo-fleet-control", c + ": active, module real-probes-3, verdict and counters cleared, max_attempts 24, hourly, escalating to qnfo-fleet-control", r);
  ok(typeof r.next_due_at === "string" && r.next_due_at !== start[c].next_due_at && r.ts !== start[c].ts, c + ": due now and stamped now", [r.next_due_at, r.ts]);
  ok(/^REAL-PROBES-3: /.test(r.precondition || "") && /^(MEASURES|Owning)|MEASURES/.test((r.precondition || "") + " " + (r.action || "")), c + ": the precondition names REAL-PROBES-3 and the action says it MEASURES the defect", [r.precondition, (r.action || "").slice(0, 60)]);
  ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(r)), c + ": the contract states no duration in hours or days");
}
ok(IDS.slice(0, 3).every((c) => row(c).verify_transport === "d1-query") && row("issue-100320").verify_transport === "code-read", "three d1-query contracts and one code-read contract");
ok(hasBak(db) && q(db, "SELECT * FROM bak_20261020_real_probes_3 ORDER BY class").length === 4 && IDS.every((c) => { const b = one(db, "SELECT * FROM bak_20261020_real_probes_3 WHERE class = ?", c); return b && b.status === start[c].status && b.verify_probe === start[c].verify_probe && b.module === start[c].module && b.last_verdict === start[c].last_verdict; }), "the backup table holds the four contracts as they were (circular probe, superseded or refused)");
ok(IDS.every((c) => row(c).verify_probe !== start[c].verify_probe), "every verify_probe was replaced");
const P = Object.fromEntries(IDS.map((c) => [c, row(c).verify_probe || ""]));

// the probes name no status of their own issue
ok(!/100293|agent_issues x|x\.status|WHERE id\s*=/.test(P["issue-100293"]), "issue-100293: the probe names no issue id and reads no row of the issue by id");
ok(!/agent_issues|100308/.test(P["issue-100308"]) && !/needs-machine/.test(P["issue-100308"]), "issue-100308: the probe reads no issue table and names no issue id");
ok(!P["issue-100314"].includes("agent_issues") && !P["issue-100314"].includes("needs-machine-probe") && !P["issue-100314"].includes("100314") && P["issue-100314"].includes("'needs-machine' || '-probe'") && P["issue-100314"].includes("'agent_' || 'issues'") && !/FROM (?!remediation_contracts)\w+/.test(P["issue-100314"]), "issue-100314: the probe reads remediation_contracts only, names no issue id of its own, and tests the two markers as two literals so its own text matches neither");
ok(!P["issue-100314"].includes("SELECT status FROM agent_issues WHERE"), "issue-100314: it carries neither marker the circular-probe detectors match");
for (const c of IDS.slice(0, 3)) ok(!P[c].includes(";") && /^(SELECT|WITH) /.test(P[c]), c + ": a single SELECT or WITH statement, no semicolon");
let jc = null; try { jc = JSON.parse(P["issue-100320"]); } catch (e) { jc = null; }
ok(jc !== null && JSON.stringify(Object.keys(jc).sort()) === '["absent","contains","paths"]' && JSON.stringify(jc.paths) === '["ci-status/applier-doctor.json"]', "issue-100320: a code-read spec with paths, contains and absent", P["issue-100320"]);

// ---- 4. executors accept the d1-query probes ----
const aRT = fleetSrc.indexOf("var __RT_WRITE_KW"), bRT = fleetSrc.indexOf("\n", aRT);
const cRT = fleetSrc.indexOf("var RT_MEASURED_WORDS"), dRT = fleetSrc.indexOf("\n", fleetSrc.indexOf("function rtIsDeferral("));
ok(aRT > 0 && cRT > 0 && dRT > cRT, "the executor's write-keyword list and its measured-pending functions were found in qnfo-fleet-control/worker.js");
const rt = aRT > 0 && cRT > 0 && dRT > cRT ? new Function(fleetSrc.slice(aRT, bRT) + "\n" + fleetSrc.slice(cRT, dRT) + "\nreturn { kw: __RT_WRITE_KW, rtIsMeasuredPending, rtIsDeferral };")() : null;
const fleetLiteral = (probe) => { const t = String(probe).trim(); const ql = " " + t.toLowerCase().replace(/\s+/g, " ") + " "; return /^(select|with) /.test(t.toLowerCase()) && t.indexOf(";") === -1 && !rt.kw.some((k) => ql.indexOf(" " + k) !== -1); };
const D1_JUDGE = "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; s = sys.argv[2]; o = sys.argv[3]; print(json.dumps({'literal': list(rc.is_literal_select(s)), 'deferral': rc.is_deferral(o), 'measured': rc.is_measured_pending(o), 'classify': list(rc.classify('ok', o))}))";
const CODE_JUDGE = "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))";
const py = (code, ...args) => { if (!PY) return { err: "no python" }; const r = spawnSync(PY, ["-I", "-c", code, join(root, "scripts"), ...args], { encoding: "utf8" }); try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", stderr: String(r.stderr).slice(-300) }; } };
const judgeCode = (probeText, rootDir) => py(CODE_JUDGE, probeText, rootDir);
const d1Judge = (probe, observed) => py(D1_JUDGE, probe, observed);

// ---- 5. issue-100293: the lane figures ----
const PDDL = `
CREATE TABLE research_queue (created_at TEXT, claimed_at TEXT, published_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, merged_at TEXT, pr_opened_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
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
`;
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
// Three zones of code tasks by creation time (minutes before now): A only in the window that ended 1440 minutes ago, B in both, C only in the 7-day window.
// Each zone is [tasks, merged, queue minutes of the merged ones]. Zone A always has queue 60: its merges can fall on the boundary day of the view's string comparison.
const lane = (o = {}) => {
  const z = Object.assign({ A: [20, 16, 60], B: [60, 48, 60], C: [20, 16, 60], opened: 40, closed: 60, self: "open" }, o);
  const d = new DatabaseSync(":memory:");
  d.exec(PDDL);
  let n = 0;
  const task = d.prepare("INSERT INTO code_tasks (id, status, created_at, merged_at) VALUES (?, ?, ?, ?)");
  const zone = ([cnt, merged, qm], lo, hi) => { for (let i = 0; i < cnt; i++) { const created = lo + Math.floor((hi - lo) * (i + 0.5) / cnt); const m = i < merged; task.run("t" + (++n), m ? "merged" : "failed", iso(created), m ? iso(created - qm) : null); } };
  zone(z.A, 11000, 11300); zone(z.B, 2000, 9900); zone(z.C, 200, 1300);
  const iss = d.prepare("INSERT INTO agent_issues (id, title, status, created_at, updated_at) VALUES (?, 't', ?, ?, ?)");
  let k = 1000;
  for (let i = 0; i < z.opened; i++) iss.run(++k, "open", Date.now() - 100 * 60000, Date.now() - 100 * 60000);
  for (let i = 0; i < z.closed; i++) iss.run(++k, "closed", Date.now() - 40 * 86400000, Date.now() - 100 * 60000);
  if (z.self) iss.run(100293, z.self, Date.now() - 100 * 60000, Date.now() - 100 * 60000);
  return d;
};
const obs293 = (d) => String(runProbe(d, P["issue-100293"]).observed);
const exp293 = (d) => runProbe(d, P["issue-100293"]).expected;
const DONE = {};
{
  const d = lane(DONE);
  ok(exp293(d) === "ok" && obs293(d) === "ok", "issue-100293: queue 60 minutes, merged share 0.8 in both windows and closed above opened read ok", obs293(d));
  const view = one(d, "SELECT queue_minutes FROM v_sla_compliance WHERE process = 'code-task-merge'");
  ok(view.queue_minutes <= 120, "the fixture's view reads a queue at or under the SLA (the probe reads the live view, not a copy)", view);
}
{
  // shaped like 2026-10-20 08:52Z: 113 merged of 248 in the 7-day window, 71 of 181 in the earlier window, queue about 279 minutes, closed 959 against opened 943
  const d = lane({ A: [40, 10, 60], B: [141, 61, 300], C: [107, 52, 250], opened: 943, closed: 959 });
  const v = one(d, "SELECT queue_minutes FROM v_sla_compliance WHERE process = 'code-task-merge'").queue_minutes;
  ok(v > 120, "the today-shaped fixture reads a breached queue through v_sla_compliance", v);
  ok(obs293(d) === "pending: code-task-merge queue " + v.toFixed(1) + " min > 120 min SLA", "issue-100293 on today's shape: pending with the first failing clause and its number", obs293(d));
  const s = lane({ A: [40, 10, 60], B: [141, 61, 60], C: [107, 52, 60], opened: 943, closed: 959 });
  ok(/^pending: merged share 0\.456 < 0\.70 \(113 merged of 248 code tasks created in the 7-day window\)$/.test(obs293(s)), "with the queue in SLA the next clause is named: merged share 0.456 < 0.70 (113 of 248)", obs293(s));
  // the probe does not read the status of its own issue: the same observation with the issue open, closed and absent
  const open = obs293(lane({ A: [40, 10, 60], B: [141, 61, 300], C: [107, 52, 250], opened: 943, closed: 959, self: "open" })), closed = obs293(lane({ A: [40, 10, 60], B: [141, 61, 300], C: [107, 52, 250], opened: 943, closed: 959, self: "closed" })), absent = obs293(lane({ A: [40, 10, 60], B: [141, 61, 300], C: [107, 52, 250], opened: 943, closed: 959, self: null }));
  ok(open === closed && closed === absent, "the observation is the same whether issue 100293 is open, closed or absent", [open, closed, absent]);
  const okOpen = obs293(lane({ self: "open" })), okClosed = obs293(lane({ self: "closed" })), okAbsent = obs293(lane({ self: null }));
  ok(okOpen === "ok" && okClosed === "ok" && okAbsent === "ok", "and ok is reached with the issue open, closed or absent", [okOpen, okClosed, okAbsent]);
  const j = d1Judge(P["issue-100293"], obs293(d));
  ok(j.err === undefined && j.literal && j.literal[0] === true && fleetLiteral(P["issue-100293"]), "both executors accept it as a single literal read-only statement", j);
  ok(j.deferral === true && j.measured === true && j.classify && j.classify[0] === 0 && rt && rt.rtIsMeasuredPending(obs293(d)) === true && rt.rtIsDeferral(obs293(d)) === false, "today's reading is a measurement off its bound (the consumer's carve-out of a pending read that carries a number and a comparison, fleet-control's rtIsDeferral false): a failure in both executors, not a deferral", j);
}
{
  const clause = (o, re, msg) => { const r = obs293(lane(o)); ok(re.test(r), "issue-100293 " + msg, r); return r; };
  clause({ B: [60, 48, 300] }, /^pending: code-task-merge queue \d+\.\d min > 120 min SLA$/, "queue over 120 minutes");
  clause({ B: [60, 20, 60], C: [20, 16, 60] }, /^pending: merged share 0\.4\d\d < 0\.70 \(36 merged of 80 code tasks created in the 7-day window\)$/, "merged share of the 7-day window under 0.70 (36 of 80 -> 0.450)");
  clause({ A: [80, 8, 60] }, /^pending: merged share of the window that ended 1440 minutes ago 0\.400 < 0\.70 \(56 merged of 140\)$/, "merged share of the earlier window under 0.70 while the current window holds");
  clause({ A: [0, 0, 60], B: [20, 20, 300], C: [200, 200, 5] }, /^pending: queue of the window that ended 1440 minutes ago 300\.0 min > 120 min SLA$/, "queue of the earlier window over 120 minutes while the current queue holds");
  clause({ B: [5, 5, 60], C: [5, 5, 60] }, /^pending: 10 code tasks created in the 7-day window, a share needs 20 or more$/, "a quiet lane (10 tasks) reads pending, not ok");
  clause({ A: [3, 3, 60], B: [20, 20, 60], C: [40, 40, 60] }, /^ok$/, "(control) 60 tasks in the window and 23 in the earlier one read ok");
  clause({ A: [0, 0, 60], B: [5, 5, 60], C: [30, 30, 60] }, /^pending: 5 code tasks created in the window that ended 1440 minutes ago, a share needs 20 or more$/, "a quiet earlier window (5 tasks) reads pending");
  clause({ opened: 100, closed: 100 }, /^pending: issues closed 100 <= opened 101 in the 7-day window$/, "closed under opened by one over 7 days (the open issue itself counts as opened in the fixture)");
  clause({ opened: 100, closed: 50, self: null }, /^pending: issues closed 50 <= opened 100 in the 7-day window$/, "closed under opened over 7 days");
  clause({ A: [20, 0, 60], B: [60, 0, 60], C: [20, 0, 60] }, /^pending: v_sla_compliance has no code-task-merge row because no code task merged in the 7-day window$/, "no merged task at all (the view's average is NULL)");
  const empty = new DatabaseSync(":memory:"); empty.exec(PDDL);
  ok(/^pending: v_sla_compliance has no code-task-merge row/.test(String(runProbe(empty, P["issue-100293"]).observed)), "empty tables read pending, never ok (NULL cannot reach the ok branch)", runProbe(empty, P["issue-100293"]));
}

// ---- 6. issue-100308: the decision records for the model ----
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MDDL = `
CREATE TABLE model_ladder_models (id TEXT PRIMARY KEY, tier INTEGER, family TEXT, provider TEXT, price_in REAL, price_out REAL, cache_in REAL, quality INTEGER, ctx INTEGER, notes TEXT, active INTEGER DEFAULT 1);
CREATE TABLE cf_model_catalog (slug TEXT PRIMARY KEY, model_id TEXT, name TEXT, author TEXT, task_type TEXT, description TEXT, ctx INTEGER, price_in REAL, price_out REAL, vision INTEGER DEFAULT 0, modality TEXT, status TEXT DEFAULT 'new', first_seen TEXT DEFAULT (datetime('now')), last_seen TEXT, last_eval_ts TEXT, best_score REAL, notes TEXT);
CREATE TABLE cf_model_canary (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), model_id TEXT, battery_version TEXT, n INTEGER, agree INTEGER, agreement REAL, mean_latency_ms INTEGER, detail TEXT);
CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, artifact_type TEXT NOT NULL, artifact_ref TEXT, status TEXT NOT NULL, evidence TEXT, verified_at TEXT, created_at TEXT DEFAULT (datetime('now')));
`;
// the state read live on 2026-10-20: an older tier 1 ladder row (active=1), catalog in_production, the roadmap item open, no canary row, no rejection
const models = (o = {}) => {
  const d = new DatabaseSync(":memory:");
  d.exec(MDDL);
  const s = Object.assign({ ladder: 1, catalog: "in_production", roadmap: ["open", "cfmb-2: quality at control 1 at 67% of the control's input price -> cost win"], canary: [], other: true }, o);
  if (s.ladder !== null) d.prepare("INSERT INTO model_ladder_models (id, tier, family, provider, price_in, price_out, cache_in, quality, ctx, notes, active) VALUES (?, 1, 'gemma', 'workers-ai', 0.1, 0.3, 0, 62, 131072, 'instruction following; free neurons', ?)").run(MODEL, s.ladder);
  if (s.catalog !== null) d.prepare("INSERT INTO cf_model_catalog (slug, model_id, status, best_score, notes) VALUES ('gemma-4-26b-a4b-it', ?, ?, 1, 'last verdict: promote')").run(MODEL, s.catalog);
  if (s.roadmap !== null) d.prepare("INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) VALUES (?, 'cf-model-eval', 'Adopt the model in the chat lane', 'model', ?, ?, ?)").run("MODEL-" + MODEL, MODEL, s.roadmap[0], s.roadmap[1]);
  for (const a of s.canary) d.prepare("INSERT INTO cf_model_canary (model_id, battery_version, n, agree, agreement) VALUES (?, 'cfmb-2', 12, 0, ?)").run(MODEL, a);
  if (s.other) {
    // records of other models never count: a rejected, a retired and a canary-agreed neighbour
    d.prepare("INSERT INTO cf_model_catalog (slug, model_id, status) VALUES ('clef', '@cf/cloudflare/clef', 'rejected')").run();
    d.prepare("INSERT INTO roadmap_implementation (item, source, title, artifact_type, status, evidence) VALUES ('MODEL-@cf/cloudflare/clef-flash', 'cf-model-eval', 't', 'model', 'retired', 'BLOCKED: canary gate 0.2917 < 0.7')").run();
    d.prepare("INSERT INTO cf_model_canary (model_id, battery_version, n, agree, agreement) VALUES ('@cf/cloudflare/clef-omni', 'cfmb-2', 12, 10, 0.91)").run();
    d.prepare("INSERT INTO model_ladder_models (id, tier, active) VALUES ('@cf/other/model', 1, 1)").run();
  }
  return d;
};
const obs308 = (o) => { const r = runProbe(models(o), P["issue-100308"]); return [r.expected, String(r.observed)]; };
{
  const [e, today] = obs308({});
  ok(e === "ok" && today === "pending: the model is active in model_ladder_models but cf_model_canary holds no agreement of 0.7 or more for it and no rejection is recorded (catalog status in_production)", "issue-100308 on today's state (ladder active=1, catalog in_production, no canary row, no rejection, roadmap item open): pending and says what is missing", today);
  ok(/^pending: the model is inactive in model_ladder_models, cf_model_canary holds no agreement of 0\.7 or more for it and no rejection is recorded \(catalog status recommended\)$/.test(obs308({ ladder: 0, catalog: "recommended" })[1]), "the picture the notice painted (registered with active=0, catalog recommended) is pending too", obs308({ ladder: 0, catalog: "recommended" }));
  ok(/^pending: model_ladder_models has no row for the model, /.test(obs308({ ladder: null, catalog: null, roadmap: null })[1]), "no ladder row at all is pending", obs308({ ladder: null, catalog: null, roadmap: null }));
  ok(obs308({ canary: [0.5] })[1].startsWith("pending: the model is active"), "active with a canary agreement of 0.5 is pending", obs308({ canary: [0.5] }));
  ok(obs308({ canary: [0.7] })[1] === "ok" && obs308({ canary: [0.2917, 0.75] })[1] === "ok", "active with a canary agreement of 0.7 or more (the latest row) is ok", obs308({ canary: [0.2917, 0.75] }));
  ok(obs308({ canary: [0.9, 0.3] })[1].startsWith("pending: the model is active"), "the latest canary row decides: 0.9 then 0.3 is pending", obs308({ canary: [0.9, 0.3] }));
  ok(obs308({ ladder: 0, canary: [0.9] })[1].startsWith("pending: the model is inactive"), "a canary agreement does not pass an inactive ladder row (the flip is part of the definition of done)", obs308({ ladder: 0, canary: [0.9] }));
  ok(obs308({ catalog: "rejected" })[1] === "ok" && obs308({ ladder: 0, catalog: "rejected" })[1] === "ok", "a catalog status rejected is a recorded decision: ok", obs308({ catalog: "rejected" }));
  ok(obs308({ roadmap: ["retired", "withdrawn"] })[1] === "ok", "a retired roadmap item is a recorded decision: ok");
  ok(obs308({ ladder: 0, catalog: "candidate", roadmap: ["open", "BLOCKED: canary gate: real-data agreement 0.29 < 0.7"] })[1] === "ok", "a roadmap item with evidence that starts with BLOCKED: (a withdrawn promotion) is a recorded decision: ok");
  ok(obs308({ roadmap: ["open", "verified later: not BLOCKED: in the middle"] })[1].startsWith("pending"), "BLOCKED: in the middle of the evidence is not a decision", obs308({ roadmap: ["open", "x BLOCKED: y"] }));
  ok(obs308({ other: false })[1].startsWith("pending") && obs308({})[1].startsWith("pending"), "the rejected, retired and canary-agreed records of other models do not count");
  ok(obs308({ catalog: "passed" })[1].startsWith("pending") && obs308({ catalog: "candidate" })[1].startsWith("pending") && obs308({ catalog: "recommended" })[1].startsWith("pending"), "catalog statuses passed, candidate and recommended are not decisions");
  const j = d1Judge(P["issue-100308"], today);
  ok(j.literal && j.literal[0] === true && fleetLiteral(P["issue-100308"]), "both executors accept it as a single literal read-only statement", j);
  ok(j.deferral === true && j.measured === false && rt && rt.rtIsDeferral(today) === true && rt.rtIsMeasuredPending(today) === false && j.classify[0] === 0, "its pending read is a deferral (waiting for a decision), not a failure, in both executors", j);
}
ok(/cf-model-eval/.test(row("issue-100308").precondition + row("issue-100308").action) && /qnfo-model-eval/.test(row("issue-100308").precondition) && /no automatic path/.test(row("issue-100308").action) && /MODEL-FLOOR-1/.test(row("issue-100308").action) && /INSERT OR IGNORE/.test(row("issue-100308").action) && /status rejected/.test(row("issue-100308").action), "issue-100308: the contract text names the owning loop, says the fleet has no automatic path for the decision, and names the records that close it", row("issue-100308").action);
ok(/no automatic path that records this decision/.test(sql) && /FINDING THAT CHANGES THE PREMISE/.test(sql) && /active=1/.test(sql), "the header says the fleet has no automatic path and records the finding that the model was already active");

// ---- 7. issue-100314: a live contract with a probe of its own on issue 100308 ----
{
  const w = world();
  const probe = P["issue-100314"];
  const read = (d) => runProbe(d, probe);
  const today = read(w);
  ok(today.expected === "ok" && /^pending: the contract of issue 100308 is not active or holding on the d1-query transport with a probe of its own/.test(today.observed), "before the file: contract issue-100308 is superseded and issue-100314 reads pending", today);
  const set = (d, patch) => { const cols = Object.keys(patch); d.prepare("UPDATE remediation_contracts SET " + cols.map((c) => c + " = ?").join(", ") + " WHERE class = 'issue-100308'").run(...cols.map((c) => patch[c])); };
  const REAL = "SELECT 'ok' AS expected, 'ok' AS observed FROM cf_model_catalog";
  set(w, { status: "active", verify_probe: REAL });
  ok(read(w).observed === "ok", "an active d1-query contract with a probe of its own reads ok", read(w));
  set(w, { status: "holding" });
  ok(read(w).observed === "ok", "a holding one reads ok too", read(w));
  set(w, { status: "superseded" });
  ok(/^pending/.test(read(w).observed), "superseded reads pending", read(w));
  set(w, { status: "needs-machine-probe" });
  ok(/^pending/.test(read(w).observed), "a needs-machine-probe contract reads pending", read(w));
  set(w, { status: "active", verify_probe: "needs-machine" + "-probe" });
  ok(/^pending/.test(read(w).observed), "an active contract whose probe is the placeholder reads pending", read(w));
  set(w, { status: "active", verify_probe: circ(100308) });
  ok(/^pending/.test(read(w).observed), "an active contract whose probe is the circular read of its own issue reads pending", read(w));
  set(w, { status: "active", verify_probe: "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM agent_" + "issues WHERE id = 1) THEN 'ok' END AS observed" });
  ok(/^pending/.test(read(w).observed), "an active contract that reads the issue table reads pending", read(w));
  set(w, { status: "active", verify_probe: '{"url": "https://example.org/x", "check": "status", "expected": "200"}', verify_transport: "external-https" });
  ok(/^pending/.test(read(w).observed), "a contract on another transport reads pending", read(w));
  w.prepare("DELETE FROM remediation_contracts WHERE issue_id = 100308").run();
  ok(read(w).expected === "ok" && read(w).observed === "pending: issue 100308 has no contract at all, a doer writes one", "an absent contract is pending, never ok", read(w));
  // the old probe of issue-100314 read ok in two states where nothing measured the outcome
  const o = world();
  o.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100308").run();
  ok(one(o, OLD_100314).observed === "ok", "(control) the retired probe read ok as soon as issue 100308 was closed, whatever its contract held");
  ok(String(runProbe(o, probe).observed).startsWith("pending"), "and the new probe does not read the issue at all: it stays pending", runProbe(o, probe));
}
ok(!SKIP && runProbe(db, P["issue-100314"]).observed === "ok", "after the file: contract issue-100308 is active with a probe of its own, so the issue-100314 probe reads ok on the migrated world", SKIP ? "skipped" : runProbe(db, P["issue-100314"]));
{
  const j = d1Judge(P["issue-100314"], "ok");
  ok(j.literal && j.literal[0] === true && fleetLiteral(P["issue-100314"]), "both executors accept it as a single literal read-only statement", j);
  // PROBE-REVIEW-1 (qnfo-cloud-ops) selects d1-query contracts on open issues whose probe starts with SELECT or WITH and whose module is not a template: it re-judges the rewritten text
  const sel = /var PROBE_REVIEW_SELECT = "([^"]*)"/.exec(cloudSrc);
  ok(sel !== null && /LIKE 'SELECT%'/.test(cloudSrc.slice(cloudSrc.indexOf("var PROBE_REVIEW_SELECT"), cloudSrc.indexOf("function probeReviewPrompt"))) && IDS.slice(0, 3).every((c) => /^(SELECT|WITH)/i.test(P[c].trim()) && !/^probe-template/.test(row(c).module || "")), "PROBE-REVIEW-1 selects the three d1-query contracts for a fresh judgement (SELECT or WITH, module not a template)");
}

// ---- 8. issue-100320: the doctor report on main, through the consumer's own code-read functions ----
const TODAY_DOCTOR = '{"counts": {"already-applied": 73, "error": 1, "undetermined": 3}, "errored": ["scripts/checkin-scale-anchored-1-patch.py"], "marker": "APPLIER-DOCTOR-2", "never_landed": [], "stale_anchor": [], "superseded": [], "total": 77, "ts": "2026-10-20T08:23:21.882Z", "undetermined": ["scripts/dashboard-agissue-undercount-patch.py", "scripts/math-sym-escape-patch.py", "scripts/outreach-cap-status-1-patch.py"]}';
const ser = (obj) => { const r = spawnSync(PY || "python3", ["-I", "-c", "import json, sys; print(json.dumps(json.loads(sys.argv[1]), sort_keys=True), end='')", JSON.stringify(obj)], { encoding: "utf8" }); return String(r.stdout); };
const tmpRoot = mkdtempSync(join(tmpdir(), "rp3-"));
const put = (name, text, file = join("ci-status", "applier-doctor.json")) => { const dir = join(tmpRoot, name); mkdirSync(join(dir, "ci-status"), { recursive: true }); if (text !== null) writeFileSync(join(dir, file), text); return dir; };
{
  const doc = JSON.parse(TODAY_DOCTOR);
  if (PY) ok(ser(doc) === TODAY_DOCTOR, "the fixture is the exact text applier-doctor.py writes (json.dumps with sorted keys and default separators), so the probe's texts occur as written", ser(doc).slice(0, 120));
  const fixed = Object.assign({}, doc, { errored: [], counts: { "already-applied": 74, undetermined: 3 } });
  const FIXED_DOCTOR = ser(fixed);
  const spec = P["issue-100320"];
  const j = (name, text) => judgeCode(spec, put(name, text));
  const today = j("today", TODAY_DOCTOR);
  ok(today.err === null && today.observed === "present-marker:ci-status/applier-doctor.json", "issue-100320 on the report of today (errored names the script): present-marker, the probe fails", today);
  const done = j("done", FIXED_DOCTOR);
  ok(done.err === null && done.observed === "ok", "on a report with errored emptied and the script in no list: ok", done);
  const early = j("early", ser(Object.assign({}, doc, { errored: ["scripts/applier-artifact-collision-patch.py", "scripts/checkin-scale-anchored-1-patch.py"] })));
  ok(early.observed === "present-marker:ci-status/applier-doctor.json", "a script that sorts before it in the same list does not hide it (the longer text that starts at errored would pass here)", early);
  const sup = j("sup", ser(Object.assign({}, doc, { errored: [], superseded: ["scripts/checkin-scale-anchored-1-patch.py"] })));
  ok(sup.observed === "present-marker:ci-status/applier-doctor.json", "naming the script in another list (superseded) still reads present-marker until the next report", sup);
  const otherErr = j("other", ser(Object.assign({}, doc, { errored: ["scripts/zz-other-patch.py"] })));
  ok(otherErr.observed === "ok", "another applier erroring is not this defect: ok", otherErr);
  ok(j("empty", "").observed === "missing-marker:ci-status/applier-doctor.json", "an empty file cannot pass (the doctor marker is required)", j("empty", ""));
  ok(j("replaced", '{"errored": []}').observed === "missing-marker:ci-status/applier-doctor.json", "a replaced file without the doctor marker cannot pass", j("replaced", '{"errored": []}'));
  ok(j("gone", null).observed === "missing:ci-status/applier-doctor.json", "a missing file reads missing, never ok", j("gone", null));
  ok(today.observed !== "ok" && !/agent_issues/.test(spec) && !/100320/.test(spec), "the probe reads the file only: no issue table and no issue id");
}

// ---- 9. the failure mode, its detector and the decision row ----
if (!SKIP) {
  const FM = "applier-version-step-not-idempotent";
  const fr = one(db, "SELECT * FROM failure_modes WHERE fm_key = ?", FM) || {};
  ok(fr.fm_key === FM && fr.probe_class === "fm-" + FM && fr.first_seen === "2026-10-20" && fr.issue_id === 100320, "one failure_modes row: probe_class is fm- plus the key, first_seen 2026-10-20, issue 100320", fr);
  ok(["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof fr[k] === "string" && fr[k].length > 40), "every failure_modes text column is filled", Object.keys(fr).filter((k) => fr[k] == null));
  ok(/FAIL-CLOSED/.test(fr.failure_mode) && /1\.37\.2/.test(fr.root_cause) && /SCALE-ANCHORED-1/.test(fr.remediation) && /fm-applier-version-step-not-idempotent/.test(fr.detector) && !/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(fr)), "root cause, remediation and detector state the mechanism and the marker, with no duration in hours or days");
  const dc = one(db, "SELECT * FROM remediation_contracts WHERE class = ?", "fm-" + FM) || {};
  ok(dc.verify_transport === "code-read" && dc.status === "active" && dc.issue_id === null && dc.max_attempts === 3 && dc.escalate_to === "qnfo-fleet-control" && dc.expected_cadence_h === 1 && dc.action === "failure-mode detector" && dc.module === "failure-mode" && dc.budget_ms === 45000 && dc.max_items === 5 && dc.requires_container === 0 && typeof dc.next_due_at === "string", "the detector is an active code-read standing contract of module failure-mode, like the other fm- detectors", dc);
  const spec = (() => { try { return JSON.parse(dc.verify_probe || ""); } catch (e) { return {}; } })();
  ok(JSON.stringify(Object.keys(spec).sort()) === '["contains","paths"]' && JSON.stringify(spec.paths) === '["scripts/checkin-scale-anchored-1-patch.py"]' && spec.contains === "elif MARK in wsrc:", "it reads the script for the marker branch", dc.verify_probe);
  const script = norm(readFileSync(SCRIPT, "utf8"));
  ok(script.split("elif MARK in wsrc:").length - 1 === 1, "the marker branch occurs exactly once in the script on main");
  const mk = (name, text) => { const dir = join(tmpRoot, name); mkdirSync(join(dir, "scripts"), { recursive: true }); writeFileSync(join(dir, "scripts", "checkin-scale-anchored-1-patch.py"), text); return dir; };
  const withBranch = judgeCode(dc.verify_probe, mk("det-with", script)), without = judgeCode(dc.verify_probe, mk("det-without", script.replace("elif MARK in wsrc:", "elif False:")));
  ok(withBranch.err === null && withBranch.observed === "ok", "the consumer judges the detector ok on the script as it is on main", withBranch);
  ok(without.err === null && without.observed === "missing-marker:scripts/checkin-scale-anchored-1-patch.py", "and missing-marker on the script without the branch", without);
  const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1");
  ok(dl.length === 1, "one decision_log row for REAL-PROBES-3", dl.length);
  const d = dl[0] || {};
  ok(d.actor === "session_01QpQv19uh1padRwZ3u1r766", "the actor is the session", d.actor);
  ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof d[k] === "string" && d[k].length > 3), "every doctrine column is filled (capability_gain, predicted_outcome, reach_gain, surfaces_tested included)", Object.keys(d).filter((k) => d[k] == null));
  ok(!/ within /.test(d.predicted_outcome || "") && /issue-100293/.test(d.predicted_outcome) && /279\.1/.test(d.predicted_outcome) && /issue-100314/.test(d.predicted_outcome) && /issue-100320/.test(d.predicted_outcome), "the prediction is prose (no ' within ' for decision_predictions_parse) and names each contract and its first reading", d.predicted_outcome);
  ok(/bak_20261020_real_probes_3/.test(d.rollback_path || "") && /append-only/.test(d.rollback_path || ""), "the rollback path names the backup table and the append-only note");
  ok(d.outcome_matched === null, "outcome_matched is left for the result to set");
}

// ---- 10. what else the file touches ----
if (!SKIP) {
  const now = JSON.parse(snap(db)), was = JSON.parse(before);
  ok(JSON.stringify(now[3]) === JSON.stringify(was[3]), "agent_issues is exactly as it was (the issues close only through their own contracts)");
  ok(JSON.stringify(q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100266'")) === JSON.stringify(was[0].filter((r) => r.class === "issue-100266")), "the contract of another issue is exactly as it was");
  ok(q(db, "SELECT class FROM remediation_contracts ORDER BY class").map((r) => r.class).join(",") === "fm-applier-version-step-not-idempotent,issue-100266,issue-100293,issue-100308,issue-100314,issue-100320", "one contract added, the detector", q(db, "SELECT class FROM remediation_contracts ORDER BY class"));
  ok(JSON.stringify(q(db, "SELECT * FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'")) === JSON.stringify(was[1].filter((r) => r.fm_key === "windows-parity-green-by-construction")), "the other failure modes are as they were");
}

// ---- 11. replay, hand edits, rollback ----
if (!SKIP) {
  const once = snap(db);
  db.exec(sql);
  ok(snap(db) === once, "a replay changes nothing (contracts, failure modes, decisions, issues)");
  ok(q(db, "SELECT * FROM bak_20261020_real_probes_3").length === 4 && IDS.every((c) => one(db, "SELECT verify_probe FROM bak_20261020_real_probes_3 WHERE class = ?", c).verify_probe === start[c].verify_probe), "and the replay leaves the backup holding the originals");

  for (const c of IDS) {
    const hand = world();
    hand.prepare("UPDATE remediation_contracts SET status = 'active', module = 'a-doer', verify_probe = ? WHERE class = ?").run(c === "issue-100320" ? '{"paths":["x"],"contains":"y"}' : "SELECT 'ok' AS expected, 'ok' AS observed", c);
    const handRow = JSON.stringify(one(hand, "SELECT * FROM remediation_contracts WHERE class = ?", c));
    hand.exec(sql);
    ok(JSON.stringify(one(hand, "SELECT * FROM remediation_contracts WHERE class = ?", c)) === handRow, c + ": a contract a doer already set active with a probe of their own is left alone");
    const parked = world();
    parked.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'monitoring:loop-owned' WHERE class = ?").run(c);
    const parkedRow = JSON.stringify(one(parked, "SELECT * FROM remediation_contracts WHERE class = ?", c));
    parked.exec(sql);
    ok(JSON.stringify(one(parked, "SELECT * FROM remediation_contracts WHERE class = ?", c)) === parkedRow, c + ": a contract in another state than the retired one is left alone");
  }
  {
    const hand = world();
    hand.prepare("UPDATE remediation_contracts SET status = 'active', module = 'a-doer', verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE class = 'issue-100293'").run();
    hand.exec(sql);
    ok(one(hand, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1").n === 1 && one(hand, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent'").n === 1 && one(hand, "SELECT status FROM remediation_contracts WHERE class = 'issue-100308'").status === "active", "the other contracts, the failure mode and the decision row are still added when one contract is left alone");
    const pre = world();
    pre.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'REAL-PROBES-3: written by hand', 'e', 'o', 'b', 'r')").run();
    pre.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('applier-version-step-not-idempotent', 'theirs', 'theirs', 'theirs', 'theirs', 'fm-applier-version-step-not-idempotent', '2026-10-18', 1)").run();
    pre.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('fm-applier-version-step-not-idempotent', 'theirs', 'theirs', '{\"paths\":[\"x\"],\"contains\":\"y\"}', 'code-read', 'someone', 'paused')").run();
    const pb = JSON.stringify([q(pre, "SELECT * FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent'"), q(pre, "SELECT * FROM remediation_contracts WHERE class = 'fm-applier-version-step-not-idempotent'"), q(pre, "SELECT COUNT(*) AS n FROM decision_log")]);
    pre.exec(sql);
    ok(JSON.stringify([q(pre, "SELECT * FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent'"), q(pre, "SELECT * FROM remediation_contracts WHERE class = 'fm-applier-version-step-not-idempotent'"), q(pre, "SELECT COUNT(*) AS n FROM decision_log")]) === pb, "a failure mode, detector contract or decision row that already exists is not overwritten or doubled");
  }

  // Rollback
  db.exec(rollback);
  for (const c of IDS) {
    const back = row(c);
    const keys = Object.keys(start[c]).filter((k) => k !== "next_due_at");   // remediation_probe_edit_rerun stamps next_due_at = now on any probe change, as live
    ok(keys.every((k) => back[k] === start[c][k]), c + ": the Rollback restores status, probe, transport, verdict, module, text, counters, deferral and ts", keys.filter((k) => back[k] !== start[c][k]).map((k) => [k, back[k], start[c][k]]));
  }
  ok(row("issue-100314").status === "probe-review-refused" && row("issue-100293").status === "superseded" && row("issue-100320").verify_probe === start["issue-100320"].verify_probe, "and the refused and superseded states are back");
  ok(q(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-applier-version-step-not-idempotent'")[0].n === 0 && q(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent'")[0].n === 0, "the Rollback removes the detector contract and the failure mode");
  ok(q(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'")[0].n === 1 && q(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'issue-100266'")[0].n === 1, "and nothing of the sibling rows");
  ok(q(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1")[0].n === 1, "the Rollback leaves the decision row");
  let refused = false;
  try { db.exec("DELETE FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1"); } catch (e) { refused = /append-only/.test(String(e.message)); }
  ok(refused, "the fixture's append-only trigger refuses a DELETE of the decision row, which is why the Rollback does not try");
  db.exec(sql);
  ok(IDS.every((c) => row(c).status === "active" && row(c).module === "real-probes-3") && one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent'").n === 1 && one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1").n === 1 && q(db, "SELECT * FROM bak_20261020_real_probes_3").length === 4, "the file applies again after a Rollback: the four contracts are active again, one decision row, the backup untouched");
  const edited = world();
  edited.exec(sql);
  edited.prepare("UPDATE remediation_contracts SET module = 'a-doer', verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE class = 'issue-100293'").run();
  edited.exec(rollback);
  ok(one(edited, "SELECT module FROM remediation_contracts WHERE class = 'issue-100293'").module === "a-doer" && one(edited, "SELECT status FROM remediation_contracts WHERE class = 'issue-100293'").status === "active" && one(edited, "SELECT status FROM remediation_contracts WHERE class = 'issue-100308'").status === "superseded", "a doer's later edit of a contract is not clobbered by the Rollback, while the untouched ones go back");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
