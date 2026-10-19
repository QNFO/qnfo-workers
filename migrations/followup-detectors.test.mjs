// PR2603-FOLLOWUP-DETECTORS-1 offline suite: runs migrations/2026-10-19-followup-detectors.sql on SQLite. Proves: the old
// fm-code-publish-waits-for-push probe reads 0 (pass) while a task with the owner-qualified slug QNFO/qnfo-workers waits past 60 minutes
// (the blind spot) and the new probe reads it; a fresh task and a task already published are not counted; the fm-code-task-repo-slug
// contract gets module failure-mode; status, attempts and verdict are untouched; the backup holds the rows as they were and the Rollback
// header restores them; re-applying changes nothing.
// Run: node migrations/followup-detectors.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-followup-detectors.sql", import.meta.url), "utf8");
const orig = readFileSync(new URL("./2026-10-12-merge-side-root-causes.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, status TEXT, updated_at TEXT);`);
// The original probe, read from the migration that created it (the live row matched it on 2026-10-19).
const m = orig.match(/\('fm-code-publish-waits-for-push', NULL, 'PUBLISH-DISPATCH-1', 'failure-mode detector', '((?:[^']|'')*)'/);
ok(!!m, "the original detector is found in merge-side-root-causes.sql");
const oldProbe = m[1].replace(/''/g, "'");
const slugProbe = "SELECT '1' AS expected, 'x' AS observed";
const addRc = db.prepare("INSERT INTO remediation_contracts (class, verify_probe, status, last_verdict, module, next_due_at, attempts) VALUES (?,?,?,?,?,?,?)");
addRc.run("fm-code-publish-waits-for-push", oldProbe, "active", "pass", "failure-mode", "2026-10-19 05:58:51", 293);
addRc.run("fm-code-task-repo-slug", slugProbe, "active", "pass", null, "2026-10-19 05:53:44", 1);
const ct = db.prepare("INSERT INTO code_tasks VALUES (?,?,?,?)");
const old = "2026-10-18T14:49:00.000Z", fresh = new Date(Date.now() - 5 * 60000).toISOString();
ct.run("ct_qualified", "QNFO/qnfo-workers", "ready_to_publish", old);
const run = (c) => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(c).verify_probe).get();
const statements = (s) => s.split(/;\s*\n/).map((x) => x.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
let r = run("fm-code-publish-waits-for-push");
ok(r.expected === "0" && r.observed === "0", "BLIND SPOT before the apply: an owner-qualified task waiting 14 h reads 0 (pass)", r);
for (const st of statements(sql)) db.exec(st);
r = run("fm-code-publish-waits-for-push");
ok(r.expected === "0" && r.observed === "1", "after the apply the same task is counted", r);
ct.run("ct_bare", "qnfo-workers", "ready_to_publish", old);
ct.run("ct_fresh", "qnfo-workers", "ready_to_publish", fresh);
ct.run("ct_done", "QNFO/qnfo-workers", "published", old);
r = run("fm-code-publish-waits-for-push");
ok(r.observed === "2", "a bare slug counts too; a fresh task and a published task do not", r);
const row = (c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const w = row("fm-code-publish-waits-for-push");
ok(w.status === "active" && w.last_verdict === "pass" && w.attempts === 293 && w.module === "failure-mode" && w.next_due_at === null, "the detector stays active, keeps its attempts and verdict, and is due now", w);
ok(!/repo\s*=/.test(w.verify_probe), "the new probe has no repo predicate");
const s = row("fm-code-task-repo-slug");
ok(s.module === "failure-mode" && s.verify_probe === slugProbe && s.attempts === 1 && s.next_due_at === "2026-10-19 05:53:44", "the slug detector gets its module and nothing else changes", s);
const bak = db.prepare("SELECT * FROM bak_20261019_followup_detectors ORDER BY class").all();
ok(bak.length === 2 && bak[0].verify_probe === oldProbe && bak[1].module === null, "the backup holds both rows as they were", bak);
const snap = JSON.stringify(db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all());
for (const st of statements(sql)) db.exec(st);
ok(JSON.stringify(db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all()) === snap, "re-applying the file changes nothing");
const rb = sql.match(/^-- Rollback: (.*)$/m);
ok(!!rb, "the file has a Rollback line");
db.exec(rb[1]);
ok(row("fm-code-publish-waits-for-push").verify_probe === oldProbe && row("fm-code-publish-waits-for-push").next_due_at === "2026-10-19 05:58:51" && row("fm-code-task-repo-slug").module === null, "the Rollback line restores probe, module and due time");
console.log(`followup-detectors: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
