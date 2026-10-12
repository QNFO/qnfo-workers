// RESEARCH-EXEC-0-13 migration suite (node:sqlite, synthetic rows). Proves that migrations/2026-10-12-research-exec-0-13.sql
// re-arms only rows parked on the two corrected defects, once, with a backup; that its Rollback line restores them; that the
// control and failure-mode rows satisfy the live CHECK constraints; and that every detector probe is one runnable SELECT
// that stays quiet until the first 0.13.0 event exists.
// Run: node qnfo-research-exec/rearm-migration.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../migrations/2026-10-12-research-exec-0-13.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, context TEXT, claimed_at TEXT, created_at TEXT, published_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h REAL, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT);
INSERT INTO control_registry (control, location, kind, disposition, evidence) VALUES ('research-single-flight-lease', 'x', 'lease', 'replace', 'old');`);
const ins = db.prepare("INSERT INTO research_queue (id, status, stage, error, recover_count, terminal_rearms, created_at, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const P = "PARKED-POISON-1: recover_count exhausted (3); last error: ";
ins.run("ground", "wontfix", "parked", P + "ground: bibliography 4 < 5 entries (gate-refcount cannot pass); arxiv_http_errors=2", 3, 0, "2026-10-09T08:00:00Z", null);
ins.run("verify", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=", 3, 0, "2026-10-10T08:00:00Z", '{"cycles":2}');
ins.run("verify-gate", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=gate-length", 3, 0, "2026-10-08T08:00:00Z", null);
ins.run("already", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=", 3, 1, "2026-10-10T08:00:00Z", null);
ins.run("old", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=", 3, 0, "2026-09-14T08:00:00Z", null);
ins.run("other", "wontfix", "parked", P + "revise: output too short (0 chars after retry)", 3, 0, "2026-10-10T08:00:00Z", null);
ins.run("math", "wontfix", "parked", "PARKED-MATH-LATEX-2: 5 plain-text math tokens remain after the rewrite", 0, 0, "2026-10-10T08:00:00Z", null);
ins.run("live", "researching", "verify", "verify: unresolved after revision - mismatch=true gates=", 1, 0, "2026-10-11T08:00:00Z", null);
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
const before = Object.fromEntries(["ground", "verify", "verify-gate", "already", "old", "other", "math", "live"].map((id) => [id, JSON.stringify(get(id))]));

db.exec(sql);
ok(["ground", "verify", "verify-gate"].every((id) => { const r = get(id); return r.status === "queued" && r.stage === null && r.recover_count === 0 && r.terminal_rearms === 1 && r.context === null && /^REARMED 2026-10-12 .*Was: PARKED-POISON-1/.test(r.error); }), "rows parked on the two defects are queued again, counters reset, the prior error kept", get("verify"));
ok(["already", "old", "other", "math", "live"].every((id) => JSON.stringify(get(id)) === before[id]), "a row re-armed before, an older row, another failure, a math park and a live row are untouched");
ok(db.prepare("SELECT count(*) n FROM bak_20261012_research_rearm").get().n === 3 && db.prepare("SELECT error FROM bak_20261012_research_rearm WHERE id = 'ground'").get().error.startsWith(P), "the prior state of each re-armed row is in the backup table");
db.exec(sql);
ok(get("verify").terminal_rearms === 1 && db.prepare("SELECT count(*) n FROM bak_20261012_research_rearm").get().n === 3, "applying the file twice re-arms nothing twice");
ok(db.prepare("SELECT count(*) n FROM control_registry WHERE disposition_state = 'applied'").get().n === 5 && db.prepare("SELECT count(*) n FROM failure_modes").get().n === 5, "four new controls, the lease row updated, five failure modes");

// Detector probes: one SELECT each, no semicolon, quiet before the first 0.13.0 event, loud on a recurrence after it.
const probes = db.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all();
ok(probes.length === 4 && probes.every((p) => p.verify_probe.indexOf(";") < 0 && /^SELECT '1' AS expected/.test(p.verify_probe)), "four detector contracts, each one statement");
const run = (cls) => db.prepare(probes.find((p) => p.class === cls).verify_probe).get();
const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, ?, ?, 'qnfo-research-exec', ?)");
const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
for (let i = 0; i < 5; i++) { ev.run("o" + i, ago(600 + i), "done", '{"ok":false,"stage":"verify"}', "error"); ev.run("g" + i, ago(600 + i), "done", '{"ok":false,"stage":"ground","bibCount":4,"arxivErrors":2}', "error"); }
ok(probes.every((p) => run(p.class).observed === "1"), "failures from before the deploy do not trip a detector", probes.map((p) => run(p.class)));
ev.run("m", ago(300), "verify-adjudication", "row=x claims=8 mismatches=0 script_no=6", "ok");
ok(run("fm-verify-comparator-stricter-than-stated").observed === "1" && run("fm-grounding-single-source-refused").observed === "1", "still quiet after the deploy marker while nothing recurs");
for (let i = 0; i < 3; i++) { ev.run("n" + i, ago(100 + i), "done", '{"ok":false,"stage":"verify"}', "error"); ev.run("h" + i, ago(100 + i), "done", '{"ok":false,"stage":"ground","bibCount":3,"arxivErrors":1}', "error"); }
ok(run("fm-verify-comparator-stricter-than-stated").observed === "0" && run("fm-grounding-single-source-refused").observed === "0", "three recurrences after the deploy trip the detector");
ev.run("w", ago(200), "done", '{"ok":false,"stage":"verify","withheld":"verify-unresolved","mismatches":2,"gate":""}', "warn");
ok(run("fm-verify-comparator-stricter-than-stated").observed === "0", "a withheld paper (warn) is not what the detector counts");
const t0 = ago(50);
ev.run("c1", t0, "citation-gate", "abcdef12 CITATION-EXISTENCE-GATE-1: no failures | unverified: 2601.01000", "warn");
ok(run("fm-unconfirmed-citation-published").observed === "1", "a warn with no publish is quiet");
db.prepare("INSERT INTO research_queue (id, status, stage, published_at, created_at) VALUES ('abcdef12-0000', 'published', 'done', ?, ?)").run(new Date(Date.parse(t0) + 20e3).toISOString(), t0);
ok(run("fm-unconfirmed-citation-published").observed === "0", "a publish seconds after its own unverified warn trips the detector");
ev.run("r1", ago(40), "review-unresolved", "row=x hard=2 ids=H1,H2 cycle=2 mode=enforce", "warn");
ok(run("fm-review-hard-findings-advanced").observed === "1", "enforce mode is quiet");
ev.run("r2", ago(30), "review-unresolved", "row=y hard=2 ids=H1,H2 cycle=2 mode=measure", "warn");
ok(run("fm-review-hard-findings-advanced").observed === "0", "measure mode advancing HARD findings trips the detector");

// Rollback line restores the parked rows and removes what the file added.
const rb = (sql.match(/^-- Rollback: (.+)$/m) || [])[1];
db.exec(rb);
ok(["ground", "verify", "verify-gate"].every((id) => JSON.stringify(get(id)) === before[id]), "the Rollback line restores every re-armed row exactly", get("verify-gate"));
ok(db.prepare("SELECT count(*) n FROM control_registry").get().n === 1 && db.prepare("SELECT count(*) n FROM failure_modes").get().n === 0 && db.prepare("SELECT count(*) n FROM remediation_contracts").get().n === 0, "and removes the registry, failure-mode and detector rows");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
