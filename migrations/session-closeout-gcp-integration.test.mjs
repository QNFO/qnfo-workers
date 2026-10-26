// SESSION-CLOSEOUT-20261026-GCP-INTEGRATION offline suite: replays migrations/2026-10-26-session-closeout-gcp-integration.sql on node:sqlite.
// Proves: ASCII only, opted in (APPLY-BY ci, DB qnfo-audit, one Rollback line), nothing deleted or dropped in the body, decision_log only inserted into,
// one session record with honest counts and one decision row, a replay changes nothing, and the Rollback line removes the record.
// Output MUST contain "0 failed" on success.   node migrations/session-closeout-gcp-integration.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-session-closeout-gcp-integration.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link in the file");
const likeLits = [...sql.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
ok(likeLits.every((n) => n <= 50), "no LIKE or GLOB pattern above 50 bytes (D1 limit)", likeLits);

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  return w;
}
const count = (w, t) => w.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;
const w = world();
w.exec(sql);
const rec = w.prepare("SELECT * FROM session_records WHERE session_id = 'session-gcp-integration-1026'").get();
ok(rec && rec.total_tasks === 5 && rec.completed_tasks === 4 && Math.abs(rec.execution_ratio - 0.8) < 1e-9, "one record with honest counts (4 of 5)", rec && [rec.total_tasks, rec.completed_tasks]);
ok(rec && /NOT stored/.test(rec.infrastructure_changes) && /OPEN/.test(rec.handoff_notes), "the record states the open secret step");
ok(count(w, "decision_log") === 1, "one decision row");
w.exec(sql);
ok(count(w, "session_records") === 1 && count(w, "decision_log") === 1, "a replay changes nothing");
w.exec(header.find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
ok(count(w, "session_records") === 0, "the Rollback line deletes the record");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
