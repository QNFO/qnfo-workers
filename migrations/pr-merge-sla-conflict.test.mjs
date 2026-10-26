// PR-MERGE-SLA-10M-1 (conflict half) migration suite. Applies migrations/2026-10-26-pr-merge-sla-10m-conflict.sql on SQLite over fixtures with the live column lists and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log), no DELETE or DROP in the body, no claude.ai link, no skip-CI token;
//   2. two failure modes with two code-read detector contracts (class fm-<key>, probe_class equal to the class, cadence 1), two control_registry rows, one decision row, and a replay that is a no-op;
//   3. each detector, run through the consumer's own parse_code_probe and run_code_probe, reads `ok` on the files of this repository and goes red when the fix is taken out, so a regression
//      (a draft skipped again, an unknown pull request counted as clean) shows up as a recurrence;
//   4. the Rollback removes what the file added, leaves the decision row, and the file applies again afterwards;
//   5. the file passes scripts/apply_migrations.py --check.
// Run: node --no-warnings migrations/pr-merge-sla-conflict.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sql = readFileSync(join(here, "2026-10-26-pr-merge-sla-10m-conflict.sql"), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
ok(PY !== null, "a python 3 interpreter is available for the consumer's own functions and the migration check");

// ---- 1. header and vocabulary
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\[skip|skip[ -]ci|skip-checks/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 4 && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[0]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[1]) && /^INSERT OR REPLACE INTO control_registry\b/.test(stmts[2]) && /^INSERT INTO decision_log\b/.test(stmts[3]) && /WHERE NOT EXISTS/.test(stmts[3]), "four statements: failure modes, contracts, controls, and a guarded decision row", stmts.map((s) => s.slice(0, 40)));

// ---- 2. fixture: the live shapes
const DDL = `
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class; END;
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`;
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec(DDL); return d; };
const all = (db, q, ...a) => db.prepare(q).all(...a);
const one = (db, q, ...a) => db.prepare(q).get(...a);
const counts = (db) => ({ fm: one(db, "SELECT COUNT(*) n FROM failure_modes").n, rc: one(db, "SELECT COUNT(*) n FROM remediation_contracts").n, cr: one(db, "SELECT COUNT(*) n FROM control_registry").n, dl: one(db, "SELECT COUNT(*) n FROM decision_log").n });
const db = fresh();
db.exec(sql);
ok(JSON.stringify(counts(db)) === JSON.stringify({ fm: 2, rc: 2, cr: 2, dl: 1 }), "two failure modes, two contracts, two controls and one decision row", counts(db));
const KEYS = ["conflict-draft-skipped", "conflict-probe-skips-unknown"];
const fms = all(db, "SELECT * FROM failure_modes ORDER BY fm_key");
const rcs = all(db, "SELECT * FROM remediation_contracts ORDER BY class");
ok(fms.map((f) => f.fm_key).sort().join() === [...KEYS].sort().join() && fms.every((r) => r.probe_class === "fm-" + r.fm_key && r.first_seen === "2026-10-26" && r.issue_id === 1000291 && [r.failure_mode, r.root_cause, r.remediation, r.detector, r.trigger_condition, r.symptom, r.blast_radius].every((t) => t && t.length > 20)), "each failure mode names its root cause, remediation, detector and issue, with probe_class fm-<key>");
ok(rcs.every((r) => r.verify_transport === "code-read" && r.expected_cadence_h === 1 && r.status === "active" && r.class === "fm-" + KEYS.find((k) => "fm-" + k === r.class)), "each contract is an active code-read probe at cadence 1, class fm-<key>", rcs.map((r) => r.class));
const ctl = Object.fromEntries(all(db, "SELECT * FROM control_registry").map((c) => [c.control, c]));
ok(ctl["conflict-repair-draft-skip"]?.disposition === "replace" && ctl["conflict-repair-quiet-window"]?.disposition === "demote" && Object.values(ctl).every((c) => c.disposition_state === "applied" && c.issue_id === 1000291 && c.alternate_path && c.evidence), "the draft skip is replaced and the quiet window demoted, each with an alternate path and evidence", ctl);
const dl = one(db, "SELECT * FROM decision_log");
ok(dl.actor.startsWith("session_") && dl.action.startsWith("PR-MERGE-SLA-10M-1 conflict half:") && dl.rollback_path.length > 20 && dl.capability_gain.length > 20 && dl.blast_radius.length > 20, "the decision row names the change, its rollback, its gain and its blast radius", dl);
const before = JSON.stringify(counts(db));
db.exec(sql);
ok(JSON.stringify(counts(db)) === before, "applying twice adds nothing");

// ---- 3. the detectors, judged by the consumer's own functions
const judge = (probeText, rootDir) => {
  if (!PY) return { err: "no python", observed: null };
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(root, "scripts"), probeText, rootDir], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: r.stderr }; }
};
const probeOf = (key) => rcs.find((r) => r.class === "fm-" + key).verify_probe;
const read = (rel) => readFileSync(join(root, rel), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "pmsc-"));
const variant = (name, rel, edit) => { const d = join(tmp, name); mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), edit(read(rel))); return d; };
for (const key of KEYS) {
  const j = judge(probeOf(key), root);
  ok(j.err === null && j.observed === "ok", "detector fm-" + key + " reads ok on the files of this repository", j);
}
const cases = [
  ["conflict-draft-skipped", "scripts/conflict_repair.py", (t) => t.replace("DRAFTS = (os.environ.get(", "DRAFTS_GONE = (os.environ.get("), "missing-marker:scripts/conflict_repair.py"],
  ["conflict-draft-skipped", "scripts/conflict_repair.py", (t) => t + '\n# regression\nif not n or p.get("draft") or ref.startswith("repair/"):\n    pass\n', "present-marker:scripts/conflict_repair.py"],
  ["conflict-probe-skips-unknown", ".github/workflows/conflict-repair.yml", (t) => t.replace("dirty=$((dirty+unknown))", "true"), "missing-marker:.github/workflows/conflict-repair.yml"],
];
cases.forEach(([key, rel, edit, want], i) => {
  const j = judge(probeOf(key), variant("v" + i, rel, edit));
  ok(j.err === null && j.observed === want, "detector fm-" + key + " goes red (" + want.split(":")[0] + ") when the fix is taken out of " + rel, j);
});

// ---- 4. rollback
const rb = fresh();
rb.exec(sql);
rb.exec(rollback);
ok(JSON.stringify(counts(rb)) === JSON.stringify({ fm: 0, rc: 0, cr: 0, dl: 1 }), "the Rollback removes the failure modes, contracts and controls and leaves the decision row", counts(rb));
rb.exec(sql);
ok(JSON.stringify(counts(rb)) === JSON.stringify({ fm: 2, rc: 2, cr: 2, dl: 1 }), "the file applies again after the Rollback and adds no second decision row", counts(rb));

// ---- 5. the migration check
if (PY) {
  const r = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", "--history", join(here, "2026-10-26-pr-merge-sla-10m-conflict.sql")], { encoding: "utf8", cwd: root });
  ok(r.status === 0 && /"ok": true/.test(r.stdout), "scripts/apply_migrations.py --check passes", String(r.stdout || r.stderr).slice(0, 300));
}
console.log(`pr-merge-sla-conflict: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
