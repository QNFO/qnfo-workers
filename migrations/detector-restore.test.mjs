// DETECTOR-RESTORE-1 offline suite: runs migrations/2026-10-19-detector-restore.sql on SQLite. Proves: every standing detector (issue_id
// NULL) that the 2026-10-18 rewrite superseded as contract-on-missing-issue is active again and due now, with its probe and attempts
// untouched; a contract superseded for another reason, an issue-NNNN contract with the same verdict, and an active one are unchanged;
// the backup holds the rows as they were and the Rollback header restores them; the new detector fails before the apply and passes
// after; re-applying the file changes nothing.
// Run: node migrations/detector-restore.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-detector-restore.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, ts TEXT DEFAULT CURRENT_TIMESTAMP);`);
const MISSING = "superseded:contract-on-missing-issue (issue_id points at no row; nothing to fix and nothing to verify)";
const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, next_due_at, attempts) VALUES (?,?,?,?,?,?,?,?)");
ins.run("fm-head-of-line", null, "SELECT '1' AS expected, '1' AS observed", "d1-query", "superseded", MISSING, "2026-10-18 12:00:00", 356);
ins.run("rt-page-fleet", null, "{\"url\": \"https://fleet.qnfo.org/\"}", "runner-https", "superseded", MISSING, "2026-10-18 12:00:00", 322);
ins.run("belief-loop-runs", null, "SELECT 1", "d1-query", "superseded", MISSING, "2026-10-18 12:00:00", 376);
ins.run("plane-living-paper-fresh", null, "SELECT 1", "d1-query@living-paper", "superseded", MISSING, "2026-10-18 12:00:00", 121);
ins.run("issue-2947", 2947, "SELECT 1", "d1-query", "superseded", MISSING, "2026-10-18 12:00:00", 4);
ins.run("fm-probe-unusable", null, "x", "d1-query", "superseded", "superseded:probe-unusable (no machine-executable probe)", "2026-10-18 22:36:42", 9);
ins.run("fm-still-active", 12, "SELECT 1", "d1-query", "active", "pass", "2026-10-19 04:29:12", 40);
const statements = (s) => s.split(/;\s*\n/).map((x) => x.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const detector = () => {
  const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-standing-detector-superseded'").get();
  const q = probe ? probe.verify_probe : "SELECT '1' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_contracts WHERE issue_id IS NULL AND status = 'superseded' AND last_verdict LIKE 'superseded:contract-on-missing-issue%') = 0 THEN '1' ELSE '0' END AS observed";
  const r = db.prepare(q).get(); return r.expected === r.observed;
};
ok(!detector(), "before the apply the detector condition fails");
for (const st of statements(sql)) db.exec(st);
const row = (c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
for (const c of ["fm-head-of-line", "rt-page-fleet", "belief-loop-runs", "plane-living-paper-fresh"]) {
  const r = row(c);
  ok(r.status === "active" && /^restored: DETECTOR-RESTORE-1/.test(r.last_verdict) && r.next_due_at > "2026-10-19", c + " is active again and due now", r);
}
ok(row("fm-head-of-line").attempts === 356 && row("fm-head-of-line").verify_probe === "SELECT '1' AS expected, '1' AS observed", "probe and attempts are untouched");
ok(row("issue-2947").status === "superseded" && row("issue-2947").last_verdict === MISSING, "an issue-NNNN contract on an absent issue is left to 2987");
ok(row("fm-probe-unusable").status === "superseded", "a contract superseded for another reason is unchanged");
ok(row("fm-still-active").status === "active" && row("fm-still-active").last_verdict === "pass", "an active contract is unchanged");
const bak = db.prepare("SELECT class, status, last_verdict FROM bak_20261019_detector_restore ORDER BY class").all();
ok(bak.length === 4 && bak.every((b) => b.status === "superseded" && b.last_verdict === MISSING), "the backup holds the four rows as they were", bak);
ok(detector(), "after the apply the new detector passes");
const fm = db.prepare("SELECT probe_class, issue_id FROM failure_modes WHERE fm_key = 'standing-detector-superseded'").get();
ok(fm && fm.probe_class === "fm-standing-detector-superseded" && fm.issue_id === 2987, "the failure mode names its detector and issue", fm);
ok(row("fm-standing-detector-superseded").status === "active" && row("fm-standing-detector-superseded").issue_id === null, "the detector is a standing contract");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DETECTOR-RESTORE-1:%'").get().n === 1, "one decision row");
const before = JSON.stringify(db.prepare("SELECT class, status, last_verdict FROM remediation_contracts ORDER BY class").all());
for (const st of statements(sql)) db.exec(st);
ok(JSON.stringify(db.prepare("SELECT class, status, last_verdict FROM remediation_contracts ORDER BY class").all()) === before && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "re-applying the file changes nothing");
const rollback = (sql.match(/^-- Rollback: (.*)$/m) || [])[1];
db.exec(rollback);
ok(["fm-head-of-line", "rt-page-fleet", "belief-loop-runs", "plane-living-paper-fresh"].every((c) => row(c).status === "superseded" && row(c).last_verdict === MISSING && row(c).next_due_at === "2026-10-18 12:00:00"), "the Rollback header restores the rows from the backup");
ok(row("fm-still-active").status === "active", "the rollback leaves other rows alone");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
