// REVISE-GUARD-MEASURE-1 offline suite (agent_issues 99913 RESEARCH-REVISE-LOOP-1).
// Applies migrations/2026-10-20-revise-guard-measure.sql on SQLite (node:sqlite) over fixtures with the live column lists, the append-only decision_log triggers and a cloud_ops_events table, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and that apply_migrations.py --check accepts the file;
//   2. ops_config research_revise_shrink_guard becomes "measure" (absent key, a different value), is left alone when already measure, and the worker source reads exactly that key and compares it to measure;
//   3. the detector contract fm-revise-refs-refusal-waste (d1-query, no semicolon) reads 0 for events of the guard in measure mode and for older events, and the count for a revise-noop that names the clause;
//   4. the control research-revise-refs-floor is registered as demote/applied, off the critical path, with an alternate probe that reads ok until the floor extension is switched off;
//   5. one decision row, a replay that changes nothing, and a Rollback that removes everything but the decision row.
// Run: node --no-warnings migrations/revise-guard-measure.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const FILE = process.env.RGM_MIGRATION ? resolve(process.env.RGM_MIGRATION) : join(here, "2026-10-20-revise-guard-measure.sql");
const sql = norm(readFileSync(FILE, "utf8"));
const worker = norm(readFileSync(join(root, "qnfo-research-exec", "worker.js"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");

const PY = ["python3", "python"].find((c) => { const r = spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }); return r.status === 0; });
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" });
  ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr));
}

// the worker reads the key and compares it to "measure"
ok(/floorFlag\(env, "research_revise_shrink_guard"\)\) === "measure"/.test(worker), "the worker applies a refused patch when ops_config research_revise_shrink_guard is measure");

const DDL = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT, text TEXT, job TEXT, meta TEXT);
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = () => { const db = new DatabaseSync(":memory:"); db.exec(DDL); return db; };
const snap = (db) => JSON.stringify(["ops_config", "remediation_contracts", "failure_modes", "control_registry", "control_alternate_probes", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const now = () => new Date().toISOString();
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

// ---- apply on an empty key ----
const db = world();
db.exec(sql);
ok(one(db, "SELECT value FROM ops_config WHERE key = 'research_revise_shrink_guard'").value === "measure", "ops_config research_revise_shrink_guard is measure after the file");
ok(q(db, "SELECT * FROM ops_config").length === 1, "and it is the only ops_config row the file writes");
ok(q(db, "SELECT * FROM failure_modes WHERE fm_key = 'revise-refs-refusal-waste'").length === 1 && one(db, "SELECT issue_id FROM failure_modes").issue_id === 99913, "one failure mode, filed on issue 99913");
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-revise-refs-refusal-waste'");
ok(c && c.verify_transport === "d1-query" && c.status === "active" && !/;/.test(c.verify_probe) && c.module === "failure-mode", "the detector is an active d1-query contract without a semicolon", c && c.verify_probe);
ok(!/\b(update|insert|delete|drop|alter)\b /i.test(c.verify_probe), "the detector holds none of the write keywords the runners scan for");
const dp = (d) => one(d, c.verify_probe);
ok(dp(db).expected === "0" && dp(db).observed === "0", "the detector reads 0 with no event");
const ev = (kind, text, min) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?, ?, ?, 'warn', ?, 'qnfo-research-exec')").run(kind + text.length + min + Math.random(), ago(min), kind, text);
ev("revise-shrink-refused", "row=a model=m applied=5 chars 10->9: drops the cited references 8 -> 6 under the floor of 8 (mode=measure, applied)", 5);
ev("revise-noop", "row=b no applicable patch edit (proposed=2, raw=10 chars, fixes=1); the paper does not advance unrevised", 5);
ok(dp(db).observed === "0", "measure mode (refusal logged and applied) and a noop without the clause read 0");
ev("revise-noop", "row=c no applicable patch edit (proposed=8); shrink refused: drops the cited references 8 -> 6 under the floor of 8; the paper does not advance unrevised", 90);
ok(dp(db).observed === "0", "a refusal older than 60 minutes reads 0");
ev("revise-noop", "row=d no applicable patch edit (proposed=8); shrink refused: drops the cited references 8 -> 7 under the floor of 8; the paper does not advance unrevised", 10);
ev("revise-noop", "row=e no applicable patch edit (proposed=3); shrink refused: drops the cited references 9 -> 7 under the floor of 8; the paper does not advance unrevised", 20);
ok(dp(db).observed === "2", "two recent revise-noop events that name the clause read 2");

// ---- the control and its alternate ----
const ctl = one(db, "SELECT * FROM control_registry WHERE control = 'research-revise-refs-floor'");
ok(ctl && ctl.kind === "guard" && ctl.disposition === "demote" && ctl.disposition_state === "applied" && ctl.critical_path === 0 && ctl.alternate_tested_at === null, "the control is registered as a demoted guard off the critical path with no hand stamp", ctl);
const ap = one(db, "SELECT * FROM control_alternate_probes WHERE control = 'research-revise-refs-floor'");
ok(ap && ap.enabled === 1 && !/;/.test(ap.probe_sql), "and it has an enabled alternate probe without a semicolon");
ok(one(db, ap.probe_sql).observed === "ok", "the alternate reads ok while the floor extension is on (key absent)");
db.prepare("INSERT INTO ops_config (key, value) VALUES ('research_floor_extend', 'off')").run();
ok(one(db, ap.probe_sql).observed !== "ok" && one(db, ap.probe_sql).expected === "ok", "and fails with the reason when the floor extension is switched off");
db.prepare("DELETE FROM ops_config WHERE key = 'research_floor_extend'").run();

// ---- the decision, replay, other starting values ----
ok(q(db, "SELECT * FROM decision_log").length === 1 && /^REVISE-GUARD-MEASURE-1:/.test(one(db, "SELECT action FROM decision_log").action), "one decision row");
const once = snap(db);
db.exec(sql);
ok(snap(db) === once, "a replay changes nothing (config, contract, failure mode, control, probe, decision)");

const db2 = world();
db2.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_revise_shrink_guard', 'enforce', 'old')").run();
db2.exec(sql);
ok(one(db2, "SELECT value FROM ops_config WHERE key = 'research_revise_shrink_guard'").value === "measure", "a different existing value is overwritten with measure");
ok(/REVISE-GUARD-MEASURE-1/.test(one(db2, "SELECT note FROM ops_config WHERE key = 'research_revise_shrink_guard'").note), "and the note says why and how to revert");

const db3 = world();
db3.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_revise_shrink_guard', 'measure', 'kept', '2026-10-01 00:00:00')").run();
db3.exec(sql);
const kept = one(db3, "SELECT note, updated_at FROM ops_config WHERE key = 'research_revise_shrink_guard'");
ok(kept.note === "kept" && kept.updated_at === "2026-10-01 00:00:00", "a row that already says measure is left alone", kept);

// ---- the Rollback ----
for (const stmt of rollback.split(/;\s*/).filter(Boolean)) db.exec(stmt);
ok(q(db, "SELECT * FROM ops_config WHERE key = 'research_revise_shrink_guard'").length === 0, "the Rollback removes the lever");
ok(q(db, "SELECT * FROM failure_modes").length === 0 && q(db, "SELECT * FROM remediation_contracts").length === 0 && q(db, "SELECT * FROM control_registry").length === 0 && q(db, "SELECT * FROM control_alternate_probes").length === 0, "the failure mode, the detector, the control and its probe");
ok(q(db, "SELECT * FROM decision_log").length === 1, "and leaves the decision row");
db.exec(sql);
ok(one(db, "SELECT value FROM ops_config WHERE key = 'research_revise_shrink_guard'").value === "measure" && q(db, "SELECT * FROM decision_log").length === 1, "the file applies again after the Rollback and adds no second decision");

console.log("revise-guard-measure: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
