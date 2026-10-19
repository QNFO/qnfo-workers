// FM-PROBE-LIKE-LIMIT-1 offline suite: replays migrations/2026-10-19-code-loop-edit-reliability.sql and then 2026-10-19-fm-empty-reply-glm-instr.sql on SQLite.
// Proves: the base detector of fm-code-task-empty-reply-glm holds an 86 byte LIKE pattern (D1 refuses over 50 bytes, agent_issues 100254 and 100260) and this migration
// restates it with instr() and no LIKE at all; the restated probe counts the same rows as the old one (same message, same 15:00Z floor, same 24 h window, same threshold of 14);
// the new detector fm-probe-like-pattern-over-limit reads 0 on the live shape, counts a contract whose probe holds a LIKE literal over 50 bytes (the old probe, any number of them,
// a literal of 51 bytes and one of 50 bytes at the edge), ignores short literals, retired contracts and non-d1 transports, and never counts itself; re-applying changes nothing and
// does not overwrite a later edit; the Rollback line restores the old probe byte for byte and removes the detector rows.
// Run: node migrations/fm-empty-reply-glm-instr.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const base = readFileSync(here("2026-10-19-code-loop-edit-reliability.sql"), "utf8");
const sql = readFileSync(here("2026-10-19-fm-empty-reply-glm-instr.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const FIXTURE = `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT);
`;
const fresh = (withSql) => { const d = new DatabaseSync(":memory:"); d.exec(FIXTURE); d.exec(base); if (withSql) d.exec(sql); return d; };

const CLS = "fm-code-task-empty-reply-glm";
const MSG = "@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty";
const GLM = "ct_x propose: model " + MSG;
const iso = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19) + "Z";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const probeOf = (d, cls) => d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls).verify_probe;
const run = (d, cls) => { const r = d.prepare(probeOf(d, cls)).get(); return { expected: String(r.expected), observed: String(r.observed) }; };
const evOf = (d) => (ts, kind, text, job = "qnfo-code-orchestrator") => d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, ?, ?, ?, 'retry')").run("e" + Math.random(), ts, kind, text, job);
const likeLiterals = (p) => [...p.matchAll(/LIKE '([^']*)'/g)].map((m) => Buffer.byteLength(m[1]));

// The same events in the same order against the base migration (old probe) and against the new one.
const script = [
  ["empty", () => {}],
  ["14 matching events", (ev) => { for (let i = 0; i < 14; i++) ev(iso(1 + i / 10), "code-task.fail", GLM); }],
  ["15 matching events", (ev) => ev(iso(0.5), "code-task.fail", GLM)],
  ["noise (other model, other kind, other job)", (ev) => { ev(iso(0.5), "code-task.fail", "ct_x propose: model @cf/moonshotai/kimi-k2.7-code: no SEARCH/REPLACE block found in the reply (140 chars)"); ev(iso(0.5), "code-task.retry", GLM); ev(iso(0.5), "code-task.fail", GLM, "some-other-worker"); }],
  ["an event older than 24 h", (ev) => ev(iso(30), "code-task.fail", GLM)],
];
const replay = (d) => { const ev = evOf(d); return script.map(([label, fn]) => { fn(ev); return [label, run(d, CLS)]; }); };
const oldDb = fresh(false), OLD = probeOf(oldDb, CLS);
ok(likeLiterals(OLD).some((n) => n > 50), "the base migration leaves a LIKE literal over D1's 50 byte limit in the glm detector", likeLiterals(OLD));
ok(Buffer.byteLength("%" + MSG + "%") === 86, "that literal is 86 bytes (the figure in the issues)");
const before = replay(oldDb);
ok(before[1][1].observed === "0" && before[2][1].observed === "15", "the old probe reads 0 at 14 matches and 15 above the threshold", before.map((b) => [b[0], b[1].observed]));

const db = fresh(true);
const nw = db.prepare("SELECT verify_probe, verify_transport, status, module, last_verdict, attempts, next_due_at, max_attempts, expected_cadence_h, escalate_to FROM remediation_contracts WHERE class = ?").get(CLS);
ok(!/LIKE/i.test(nw.verify_probe) && nw.verify_probe.includes("instr(text, '" + MSG + "') > 0"), "the restated probe holds no LIKE and matches the message with instr()", nw.verify_probe.slice(0, 200));
ok(nw.verify_transport === "d1-query" && nw.status === "active" && nw.module === "failure-mode" && nw.max_attempts === 3 && nw.expected_cadence_h === 1 && nw.escalate_to === "qnfo-code-orchestrator", "the contract keeps transport, status, module, attempts bound, cadence and escalation", nw);
ok(nw.last_verdict === null && nw.attempts === 0 && nw.next_due_at === null, "the verdict and attempt count are cleared so the next run reads it fresh", nw);
ok(nw.verify_probe.includes("<= 14") && nw.verify_probe.includes("max('2026-10-19T15:00:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))") && nw.verify_probe.includes("job = 'qnfo-code-orchestrator'") && nw.verify_probe.includes("kind = 'code-task.fail'"), "same threshold, floor, window, job and kind", nw.verify_probe);
const after = replay(db);
for (let i = 0; i < script.length; i++) ok(same(after[i][1], before[i][1]), "the restated probe reads what the old one read: " + script[i][0], [after[i][1], before[i][1]]);
ok(after[1][1].observed === "0" && after[2][1].observed === "15", "0 at the threshold, the count above it");
// instr is exact where LIKE was case-blind; the worker writes the message verbatim, so an upper-case copy is not a case the probe needs.
evOf(db)(iso(0.2), "code-task.fail", GLM.toUpperCase());
ok(run(db, CLS).observed === after[4][1].observed, "an upper-case copy of the message is not counted (instr is exact)", run(db, CLS));

// The detector.
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-probe-like-pattern-over-limit'").get();
ok(det && det.verify_transport === "d1-query" && det.status === "active" && det.module === "failure-mode" && det.expected_cadence_h === 1, "one active d1-query failure-mode detector", det && { t: det.verify_transport, s: det.status });
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'probe-like-pattern-over-limit'").get();
ok(fm && fm.probe_class === "fm-probe-like-pattern-over-limit" && fm.issue_id === 100254 && fm.root_cause && fm.remediation && fm.symptom && fm.blast_radius, "the failure mode names its detector, issue, cause, remedy, symptom and blast radius");
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
for (const cls of [CLS, "fm-probe-like-pattern-over-limit"]) {
  const low = " " + probeOf(db, cls).toLowerCase().replace(/\s+/g, " ") + " ";
  ok(/^ (select|with) /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1), cls + ": one literal read, free of the write keywords of the consumer and the runtime guard");
}
const dread = () => run(db, "fm-probe-like-pattern-over-limit");
ok(same(dread(), { expected: "0", observed: "0" }), "reads 0 once the glm probe is restated and every other contract's LIKE literal is short", dread());
const add = (cls, probe, transport = "d1-query", status = "active") => db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES (?, NULL, 'p', 'a', ?, ?, 3, 'x', 1, ?, 'failure-mode')").run(cls, probe, transport, status);
const lit = (n) => "%" + "a".repeat(n - 2) + "%";
const wrap = (where) => "SELECT '0' AS expected, (SELECT COUNT(*) FROM cloud_ops_events WHERE " + where + ") AS observed";
add("t-short", wrap("text LIKE '%needs an anchor%'"));
add("t-edge-50", wrap("text LIKE '" + lit(50) + "'"));
ok(same(dread(), { expected: "0", observed: "0" }), "a 17 byte literal and a literal of exactly 50 bytes are not counted", dread());
add("t-51", wrap("text LIKE '" + lit(51) + "'"));
ok(same(dread(), { expected: "0", observed: "1" }), "a 51 byte literal is counted", dread());
add("t-two-literals", wrap("text LIKE '%x%' AND kind LIKE '" + lit(80) + "' AND job LIKE '" + lit(90) + "'"));
ok(same(dread(), { expected: "0", observed: "2" }), "a contract is counted once however many long literals it holds; a short literal before a long one does not hide it", dread());
add("t-retired", wrap("text LIKE '" + lit(70) + "'"), "d1-query", "superseded");
add("t-https", wrap("text LIKE '" + lit(70) + "'"), "runner-https", "active");
ok(same(dread(), { expected: "0", observed: "2" }), "a superseded contract and a runner-https contract are not counted", dread());
add("t-multibyte", wrap("text LIKE '%" + "é".repeat(25) + "%'"));
ok(same(dread(), { expected: "0", observed: "3" }), "a literal is measured in bytes: 25 two-byte characters plus two wildcards is 52 bytes", dread());
db.prepare("UPDATE remediation_contracts SET status = 'monitoring' WHERE class = 't-retired'").run();
ok(same(dread(), { expected: "0", observed: "4" }), "a monitoring contract is counted", dread());
db.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = ?").run(OLD, CLS);
ok(same(dread(), { expected: "0", observed: "5" }), "the base migration's probe is found again: that is the defect the detector exists for", dread());
db.prepare("DELETE FROM remediation_contracts WHERE class LIKE 't-%'").run();
ok(same(dread(), { expected: "0", observed: "1" }), "with the test contracts gone only the old glm probe is counted", dread());

// Replay, later edit, Rollback.
const state = (d) => JSON.stringify([d.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), d.prepare("SELECT * FROM failure_modes ORDER BY fm_key").all(), d.prepare("SELECT COUNT(*) AS n FROM decision_log").get()]);
const dbR = fresh(true);
const s1 = state(dbR);
dbR.exec(sql);
ok(s1 === state(dbR), "re-applying changes nothing (no second decision_log row, no second detector, the probe is not rewritten)");
const dl = dbR.prepare("SELECT action, predicted_outcome FROM decision_log WHERE action LIKE 'FM-PROBE-LIKE-LIMIT-1:%'").all();
ok(dl.length === 1 && /^[a-z_0-9]+ <= 0 within 12 h$/.test(dl[0].predicted_outcome) && dl[0].action.length > 40, "one decision_log row with a prediction in the parsed form", dl);
dbR.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, ''0'' AS observed', last_verdict = 'pass' WHERE class = ?").run(CLS);
dbR.exec(sql);
const later = dbR.prepare("SELECT verify_probe, last_verdict FROM remediation_contracts WHERE class = ?").get(CLS);
ok(later.last_verdict === "pass" && later.verify_probe.startsWith("SELECT '0' AS expected, '0'"), "a later edit of the probe is left alone on replay", later);

const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
const dbB = fresh(true);
dbB.exec(rb);
ok(probeOf(dbB, CLS) === OLD, "the Rollback line restores the old probe byte for byte");
ok(dbB.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-probe-like-pattern-over-limit'").get().n === 0 && dbB.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'probe-like-pattern-over-limit'").get().n === 0, "the Rollback line removes the detector and the failure mode");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the migration opts in to CI apply on qnfo-audit");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
