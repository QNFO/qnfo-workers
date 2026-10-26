// REENTRY-BIND-LIMIT-1 offline suite (agent_issues 1000244 CHAOS-DRILL-FAILED-1, control idea-triaged-hold-owner-and-reentry).
// Applies migrations/2026-10-26-reentry-bind-limit.sql on SQLite (node:sqlite) over fixtures with the live column lists of failure_modes, remediation_contracts and the
// append-only decision_log, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log, no DELETE or DROP in the body, so no BACKUP) and that the runner's own --check passes;
//   2. the file replays as a no-op: two failure modes, two detector contracts, one decision row, and a second apply changes nothing;
//   3. both failure modes carry every text column, the key-derived probe_class, first_seen and issue 1000244, and the decision row every doctrine column with a prose prediction (no " within ");
//   4. both detectors are active hourly code-read contracts shaped like their siblings, and the consumer's own parse_code_probe and run_code_probe judge them: ok on the real idea-hub/worker.js,
//      present-marker when the removed bind form comes back, missing-marker when the backpressure exclusion is cut;
//   5. the markers match the worker: the removed bind form occurs nowhere in idea-hub/worker.js or its mirror, the exclusion clause occurs exactly once in the worker and is the one the five producer counts share;
//   6. the Rollback removes what the file added, leaves the decision row, and the file applies again afterwards.
// Run: node --no-warnings migrations/reentry-bind-limit.test.mjs
//   RBL_MIGRATION=<file> checks a mutated copy of the migration, RBL_WORKER=<file> a mutated copy of idea-hub/worker.js (the detectors are judged on it): each must fail.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const MIG = process.env.RBL_MIGRATION ? resolve(process.env.RBL_MIGRATION) : join(here, "2026-10-26-reentry-bind-limit.sql");
const sql = norm(readFileSync(MIG, "utf8"));
const WORKER = process.env.RBL_WORKER ? resolve(process.env.RBL_WORKER) : join(root, "idea-hub", "worker.js");
const worker = norm(readFileSync(WORKER, "utf8"));
const mirror = norm(readFileSync(join(root, "idea-hub", "deployed-current.worker.js"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
ok(PY !== null, "a python 3 interpreter is available for the consumer's own functions and the migration check");

// ---- 1. header ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link in the migration");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
// no semicolon inside a string literal (the runner splits statements, and a test of ours must not rely on how)
{
  let inq = false, hits = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'") { if (inq && body[i + 1] === "'") { i++; continue; } inq = !inq; } else if (c === ";" && inq) hits++;
  }
  ok(hits === 0, "no semicolon inside a string literal", hits);
}
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 5 && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[0]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[1]) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[2]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[3]) && /^INSERT INTO decision_log\b/.test(stmts[4]), "five statements: two failure modes, each with its detector contract, and the decision row", stmts.map((s) => s.slice(0, 40)));
ok(/WHERE NOT EXISTS \(SELECT 1 FROM decision_log WHERE instr\(action, 'REENTRY-BIND-LIMIT-1:'\) = 1\)$/.test(stmts[4] || ""), "the decision insert is guarded so a replay adds no row");
ok(!stmts.some((t) => /^(INSERT( OR \w+)? INTO|UPDATE|DELETE FROM)\s+"?(agent_issues|issue_triage)\b/i.test(t)), "no statement writes agent_issues or issue_triage");
if (PY) {
  const r = spawnSync(PY, ["-I", join(root, "scripts", "apply_migrations.py"), "--check", MIG], { encoding: "utf8" });
  let j = {}; try { j = JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { j = { raw: r.stdout, err: r.stderr }; }
  ok(r.status === 0 && j.ok === true && j.statements === 5 && j.destructive === 0 && j.parse_lint === "ok", "scripts/apply_migrations.py --check passes the file (5 statements, none destructive, parse-lint ok)", j);
}

// ---- 2. fixture: the live shapes ----
const DDL = `
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_predictions_parse_stub AFTER INSERT ON decision_log WHEN instr(COALESCE(NEW.predicted_outcome, ''), ' within ') > 0 BEGIN SELECT RAISE(ABORT, 'a registered metric prediction is parsed from this text'); END;
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = () => { const d = new DatabaseSync(":memory:"); d.exec(DDL); return d; };
const db = world();
const SKIP = process.env.RBL_SKIP_MIGRATION === "1";
if (!SKIP) db.exec(sql);
const dump = (d) => JSON.stringify([q(d, "SELECT * FROM failure_modes ORDER BY fm_key"), q(d, "SELECT * FROM remediation_contracts ORDER BY class"), q(d, "SELECT id, actor, action FROM decision_log ORDER BY id")]);
const after1 = dump(db);
if (!SKIP) db.exec(sql);
ok(dump(db) === after1, "a second apply changes nothing (a replay is a no-op)");
const FMS = ["reentry-in-list-over-bind-limit", "producer-backpressure-counts-cooling-rows"];
ok(one(db, "SELECT COUNT(*) n FROM failure_modes").n === 2 && one(db, "SELECT COUNT(*) n FROM remediation_contracts").n === 2 && one(db, "SELECT COUNT(*) n FROM decision_log").n === 1, "two failure modes, two detector contracts, one decision row");

// ---- 3. the failure modes and the decision row ----
for (const key of FMS) {
  const r = one(db, "SELECT * FROM failure_modes WHERE fm_key = ?", key) || {};
  ok(r.probe_class === "fm-" + key && /^\d{4}-\d\d-\d\d$/.test(r.first_seen || "") && r.issue_id === 1000244, key + ": probe_class is fm- plus the key, first_seen is a date, issue 1000244", r);
  ok(["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof r[k] === "string" && r[k].length > 40), key + ": every text column is filled", Object.keys(r).filter((k) => r[k] == null));
  ok(r.detector.includes("fm-" + key), key + ": the detector column names its contract", r.detector);
}
const f1 = one(db, "SELECT * FROM failure_modes WHERE fm_key = ?", FMS[0]) || {};
ok(/too many SQL variables/.test(f1.root_cause) && /99 DOIs/.test(f1.root_cause) && /2026-10-19 00:25Z/.test(f1.root_cause) && /json_each\(\?\)/.test(f1.remediation) && /idea-reentry/.test(f1.remediation) && /100 bound parameters/.test(f1.trigger_condition), "the bind-limit mode states the mechanism, the date, the fix and the D1 limit", f1);
const f2 = one(db, "SELECT * FROM failure_modes WHERE fm_key = ?", FMS[1]) || {};
ok(/PROPOSAL_BACKPRESSURE/.test(f2.root_cause) && /33 new rows/.test(f2.root_cause) && /24 of the 33/.test(f2.root_cause) && /PROPOSAL_PENDING_WHERE/.test(f2.remediation), "the backpressure mode states the live counts, the limit and the shared clause", f2);
const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'REENTRY-BIND-LIMIT-1:') = 1");
const d = dl[0] || {};
ok(dl.length === 1 && d.actor === "session_015kWmGuAq2fNuvzu4MrD7x3", "one decision_log row for REENTRY-BIND-LIMIT-1, actor the session", dl.length);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof d[k] === "string" && d[k].length > 3), "every doctrine column is filled (capability_gain, predicted_outcome, reach_gain, surfaces_tested included)", Object.keys(d).filter((k) => d[k] == null));
ok(!/ within /.test(d.predicted_outcome || "") && /idea-reentry/.test(d.predicted_outcome || "") && /1000244/.test(d.predicted_outcome || ""), "the prediction is prose (no ' within ' for decision_predictions_parse), names the event row and the issue", d.predicted_outcome);
ok(/append-only/.test(d.rollback_path || "") && /canonical path/.test(d.rollback_path || ""), "the rollback path names the canonical path and the append-only note");
ok(d.outcome_matched === null, "outcome_matched is left for the result to set");

// ---- 4. the detector contracts, judged by the consumer's own functions ----
const MARK_ABSENT = "bind(...REENTRY_OWNER_TYPES, ...ownDois)";
const MARK_CONTAINS = "COALESCE(rationale, '') NOT LIKE '%[scoring-error%'";
const contracts = { "fm-reentry-in-list-over-bind-limit": { key: "absent", text: MARK_ABSENT }, "fm-producer-backpressure-counts-cooling-rows": { key: "contains", text: MARK_CONTAINS } };
const SHAPE = (c) => c.verify_transport === "code-read" && c.status === "active" && c.issue_id === null && c.max_attempts === 3 && c.escalate_to === "qnfo-fleet-control" && c.expected_cadence_h === 1 && c.precondition === "REENTRY-BIND-LIMIT-1" && c.action === "failure-mode detector" && c.module === "failure-mode" && c.budget_ms === 45000 && c.max_items === 5 && c.requires_container === 0 && typeof c.next_due_at === "string";
const judge = (probeText, rootDir) => {
  if (!PY) return { err: "no python", observed: null };
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(root, "scripts"), probeText, rootDir], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: r.stderr }; }
};
const tmp = mkdtempSync(join(tmpdir(), "rbl-"));
const put = (name, text) => { const dir = join(tmp, name); mkdirSync(join(dir, "idea-hub"), { recursive: true }); writeFileSync(join(dir, "idea-hub", "worker.js"), text); return dir; };
const realRoot = put("real", worker);
const reintroduced = put("reintroduced", worker + "\nvar q = env.LIVING_PAPER.prepare(sql).bind(...REENTRY_OWNER_TYPES, ...ownDois);\n");
const cutClause = put("cut", worker.split(MARK_CONTAINS).join("status IN ('new', 'deferred_budget')"));
for (const [cls, m] of Object.entries(contracts)) {
  const c = one(db, "SELECT * FROM remediation_contracts WHERE class = ?", cls) || {};
  ok(SHAPE(c), cls + ": an active hourly code-read contract with the shape of the sibling detectors", c);
  const spec = (() => { try { return JSON.parse(c.verify_probe || ""); } catch (e) { return {}; } })();
  ok(JSON.stringify(Object.keys(spec).sort()) === JSON.stringify([m.key, "paths"]) && JSON.stringify(spec.paths) === '["idea-hub/worker.js"]' && spec[m.key] === m.text, cls + ": it reads idea-hub/worker.js for the " + m.key + " marker", c.verify_probe);
  const j = judge(c.verify_probe || "{}", realRoot);
  ok(j.err === null && j.observed === "ok", cls + ": the consumer parses the detector and judges it ok on the idea-hub/worker.js of this change", j);
}
{
  const a = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-reentry-in-list-over-bind-limit'").verify_probe;
  const c = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-producer-backpressure-counts-cooling-rows'").verify_probe;
  const j1 = judge(a, reintroduced);
  ok(j1.err === null && j1.observed === "present-marker:idea-hub/worker.js", "the bind-limit detector fails (present-marker) when the removed bind form comes back", j1);
  const j2 = judge(c, cutClause);
  ok(j2.err === null && j2.observed === "missing-marker:idea-hub/worker.js", "the backpressure detector fails (missing-marker) when the exclusion is cut from the clause", j2);
}

// ---- 5. the markers against the worker ----
ok(worker.split(MARK_ABSENT).length - 1 === 0 && mirror.split(MARK_ABSENT).length - 1 === 0, "the removed bind form occurs nowhere in idea-hub/worker.js or deployed-current.worker.js", [worker.split(MARK_ABSENT).length - 1, mirror.split(MARK_ABSENT).length - 1]);
ok(worker.split(MARK_CONTAINS).length - 1 === 1, "the exclusion clause occurs exactly once in idea-hub/worker.js (its definition)", worker.split(MARK_CONTAINS).length - 1);
ok(/var PROPOSAL_PENDING_WHERE = "status IN \('new', 'deferred_budget'\) AND COALESCE\(rationale, ''\) NOT LIKE '%\[scoring-error%'";/.test(worker) && (worker.match(/FROM idea_proposals WHERE " \+ PROPOSAL_PENDING_WHERE/g) || []).length === 5, "the clause is PROPOSAL_PENDING_WHERE and five producer counts use it");
ok(/json_each\(\?\)/.test(worker) && /REENTRY_OWNER_DOI_MAX/.test(worker) && /recordReentryEvent\(env, r\.reentry\)/.test(worker), "the worker binds the DOIs as json_each(?) and writes the idea-reentry event");
ok(mirror === worker || process.env.RBL_WORKER, "deployed-current.worker.js is identical to worker.js");

// ---- 6. the Rollback ----
{
  const w = world();
  w.exec(sql);
  const dlBefore = JSON.stringify(q(w, "SELECT * FROM decision_log"));
  w.exec(rollback);
  ok(one(w, "SELECT COUNT(*) n FROM failure_modes").n === 0 && one(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 0, "the Rollback removes both failure modes and both detector contracts");
  ok(JSON.stringify(q(w, "SELECT * FROM decision_log")) === dlBefore && one(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "the Rollback leaves the decision row (append-only)");
  w.exec(sql);
  ok(one(w, "SELECT COUNT(*) n FROM failure_modes").n === 2 && one(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 2 && one(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "the file applies again after a Rollback and adds no second decision row");
  let refused = null;
  try { w.exec("UPDATE decision_log SET outcome = 'x'"); } catch (e) { refused = String(e && e.message || e); }
  ok(/append-only/.test(refused || ""), "the fixture's decision_log refuses an update (the same trigger as live)", refused);
}

console.log("reentry-bind-limit: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
