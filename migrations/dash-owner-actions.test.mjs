// DASH-OWNER-ACTIONS-1 offline suite: replays migrations/2026-10-26-dash-owner-actions.sql on SQLite (node:sqlite).
// Proves: the failure mode and its fm- detector are written once and a replay changes nothing; the detector reads 0 on a clean cmd_log and
// counts a verb-first line of kind ai (approve, decline, diagnose, retry, resolve) that arrived after the migration ran, in any status; it ignores
// the same lines before the migration ran, older than 24 hours, of another kind (data, action, tool) and ordinary questions; it reads 0 while
// the migration has no ok row in migration_runs; the probe is one read with none of the write keywords the runners refuse and no LIKE literal
// over D1's 50 byte limit; the decision_log row is appended once and the Rollback line removes the failure-mode and contract rows only.
// Run: node migrations/dash-owner-actions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = "2026-10-26-dash-owner-actions.sql";
const sql = readFileSync(here(FILE), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const FIXTURE = `
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE cmd_log (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), text TEXT, from_url TEXT, kind TEXT, status TEXT, answer TEXT, actions_json TEXT, model TEXT, error TEXT, owner INTEGER DEFAULT 0, visitor TEXT, done_ms INTEGER, retries INTEGER);
CREATE TABLE migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, sha256 TEXT, commit_sha TEXT, db TEXT, status TEXT, statements INTEGER, error TEXT, applied_by TEXT, applied_at TEXT);
`;
const CLS = "fm-cmd-owner-verb-unparsed";
const db = new DatabaseSync(":memory:");
db.exec(FIXTURE);
db.exec(sql);

// header
const head = sql.split("\n").slice(0, 3);
ok(head[0] === "-- APPLY-BY: ci" && head[1] === "-- DB: qnfo-audit" && /^-- Rollback: .+$/.test(head[2]) && !/\n.*-- Rollback:/.test(sql.slice(sql.indexOf("\n", sql.indexOf("-- Rollback:")))), "the file opts in with APPLY-BY, DB and ONE Rollback line", head);
ok(!/\bDELETE\b|\bDROP\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the body runs no DELETE or DROP (so no BACKUP line is needed)");

// rows
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'cmd-owner-verb-unparsed'").get();
ok(fm && fm.probe_class === CLS && fm.issue_id === 100360 && fm.root_cause && fm.remediation && fm.symptom && fm.blast_radius, "the failure mode names its detector, issue, cause, remedy, symptom and blast radius");
const c = db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(CLS);
ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.expected_cadence_h === 1 && c.max_attempts === 3 && c.issue_id === null, "one active hourly d1-query failure-mode detector", c && { t: c.verify_transport, s: c.status });
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1:%'").get().n === 1, "one decision_log row");
const dl = db.prepare("SELECT * FROM decision_log").get();
ok(dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.rollback_path, "the decision row carries capability_gain, predicted_outcome, surfaces_tested and a rollback path");

// the probe is one read, free of the write keywords, with short LIKE literals
const probe = c.verify_probe;
const low = " " + probe.toLowerCase().replace(/\s+/g, " ") + " ";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
ok(/^ (select|with) /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1) && !/\breplace\b/.test(low), "the probe is one literal read free of the write keywords of the consumer and the runtime guard");
const likes = [...probe.matchAll(/LIKE '([^']*)'/g)].map((m) => Buffer.byteLength(m[1]));
ok(likes.length === 5 && likes.every((n) => n <= 50), "five LIKE literals, each under D1's 50 byte limit", likes);

// behaviour
const read = () => { const r = db.prepare(probe).get(); return { expected: String(r.expected), observed: String(r.observed) }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ts = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().slice(0, 19).replace("T", " ");
const addLog = (n, text, kind = "ai", status = "fallback", minAgo = 5) => db.prepare("INSERT INTO cmd_log (id, ts, text, kind, status) VALUES (?, ?, ?, ?, ?)").run("c" + n, ts(minAgo), text, kind, status);
let n = 0;
ok(same(read(), { expected: "0", observed: "0" }), "reads 0 on a clean cmd_log", read());
addLog(++n, "Approve UIA-SOURCE-FIDELITY-1");
ok(read().observed === "0", "reads 0 while the migration has no ok row in migration_runs (no floor yet)", read());
db.prepare("INSERT INTO migration_runs (file, db, status, applied_at) VALUES (?, 'qnfo-audit', 'ok', ?)").run("migrations/" + FILE, new Date(Date.now() - 60 * 6e4).toISOString().slice(0, 19) + "Z");
ok(read().observed === "1", "counts a verb-first ai line that arrived after the migration ran", read());
for (const v of ["Decline 100140", "diagnose 100140", "retry", "Resolve the card"]) addLog(++n, v, "ai", n % 2 ? "fallback" : "answered");
ok(read().observed === "5", "counts each of the five verbs, in any status", read());
addLog(++n, "Approve of the new design", "ai", "fallback", 120);
ok(read().observed === "5", "ignores a line from before the migration ran (120 minutes ago against a run 60 minutes ago)", read());
addLog(++n, "approve 100140", "action", "done");
addLog(++n, "approve 100140", "data", "answered");
addLog(++n, "approve 100140", "tool", "done");
addLog(++n, "what is the state of the fleet", "ai", "fallback");
addLog(++n, "please approve 100140", "ai", "fallback");
ok(read().observed === "5", "ignores kinds other than ai and lines that do not start with a verb", read());
db.prepare("UPDATE migration_runs SET applied_at = ?").run(new Date(Date.now() - 3 * 24 * 36e5).toISOString().slice(0, 19) + "Z");
addLog(++n, "approve 100140", "ai", "fallback", 25 * 60);
ok(read().observed === "6", "with the migration run moved back three days the 120-minute line counts (6) and the 25-hour line does not", read());
db.prepare("UPDATE migration_runs SET status = 'failed'").run();
ok(read().observed === "0", "reads 0 when the only migration_runs row is not ok", read());

// replay: no duplicates, no overwrite of a later edit
db.prepare("UPDATE remediation_contracts SET max_attempts = 7 WHERE class = ?").run(CLS);
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && db.prepare("SELECT max_attempts FROM remediation_contracts WHERE class = ?").get(CLS).max_attempts === 7, "a replay is a no-op and does not overwrite a later edit");

// rollback: the failure-mode and contract rows go; decision_log stays
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rb);
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && !/decision_log/i.test(rb), "the Rollback line removes the failure mode and the contract and never touches decision_log");

console.log("dash-owner-actions: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
