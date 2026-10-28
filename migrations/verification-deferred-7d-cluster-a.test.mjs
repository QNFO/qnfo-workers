// VERIFICATION-DEFERRED-7D-1 cluster A offline suite: replays migrations/2026-10-28-verification-deferred-7d-cluster-a.sql on node:sqlite.
// Proves: header opts in; no DELETE/DROP; BACKFILL-1 contracts of open issues get a real-verdict probe (never a bare pending) that reads closed-with-evidence only when the issue is closed with evidence;
// contracts on closed issues are superseded; TP-9 is parked as holding; an issue-closed BACKFILL contract and a non-deferring one are left alone; a replay changes nothing; one decision row.
// Run: node migrations/verification-deferred-7d-cluster-a.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-verification-deferred-7d-cluster-a.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 700))); } };
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "one Rollback line");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "no delete or drop");
ok(!/\b(UPDATE|DELETE\s+FROM)\s+decision_log\b/i.test(body), "decision_log only inserted into");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "LIKE patterns <= 50 bytes");

const OLD = (n) => `SELECT 'closed-with-evidence' AS expected, CASE WHEN a.status='closed' AND COALESCE(t.close_evidence,'')<>'' THEN 'closed-with-evidence' ELSE 'pending' END AS actual FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id=a.id WHERE a.id=${n}`;
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, close_evidence TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT NOT NULL, escalate_to TEXT, status TEXT, last_verdict TEXT, deferred_since TEXT, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
const iss = (id, st) => w.prepare("INSERT INTO agent_issues VALUES (?,?,?)").run(id, "t" + id, st);
const con = (cls, id, probe, st, v, ds) => w.prepare("INSERT INTO remediation_contracts VALUES (?,?,?,?,?,?,?,?)").run(cls, id, probe, "qnfo-ops", st, v, ds, "2026-10-28 18:00:00");
iss(100281, "open"); iss(1838, "open"); iss(3015, "closed"); iss(100314, "closed"); iss(100205, "closed"); iss(5, "open");
con("issue-100281-BACKFILL-1", 100281, OLD(100281), "active", "deferred", "2026-10-21 16:51:21");
con("issue-1838-BACKFILL-1", 1838, OLD(1838), "active", "deferred", "2026-10-21 17:16:16");
con("issue-3015-BACKFILL-1", 3015, OLD(3015), "active", "deferred", "2026-10-21 17:16:16");
con("issue-5-BACKFILL-1", 5, OLD(5), "active", "pass", null);
con("issue-100314", 100314, "SELECT 1", "active", "deferred", "2026-10-20 12:11:03");
con("research-terminal-rem-0039", 100205, "SELECT 1", "active", "deferred", "2026-10-20 06:26:00");
con("goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1", null, "SELECT 'pending: x'", "active", "deferred", "2026-10-19 17:46:05");
w.exec(sql); w.exec(sql);
const c = (k) => w.prepare("SELECT * FROM remediation_contracts WHERE class=?").get(k);
for (const [k, n] of [["issue-100281-BACKFILL-1", 100281], ["issue-1838-BACKFILL-1", 1838]]) {
  const r = c(k);
  ok(r.deferred_since === null && r.status === "active" && !/ELSE 'pending'/.test(r.verify_probe), k + " gets a real-verdict probe and no deferral", r);
  const obs = () => w.prepare(r.verify_probe).get().observed;
  ok(obs() === `open: issue ${n} is not closed with close_evidence yet (doer: qnfo-ops)` && !/^pending/.test(obs()), k + " open reads a non-pending open: verdict", obs());
  w.prepare("UPDATE agent_issues SET status='closed' WHERE id=?").run(n);
  ok(obs() === "closed-with-evidence" === false, k + " closed without evidence still not passing");
  w.prepare("INSERT OR REPLACE INTO issue_triage VALUES (?, 'evidence')").run(n);
  ok(obs() === "closed-with-evidence", k + " closed with evidence passes");
}
ok(c("issue-3015-BACKFILL-1").verify_probe === OLD(3015) && c("issue-3015-BACKFILL-1").deferred_since !== null, "BACKFILL contract of a closed issue is left alone");
ok(c("issue-5-BACKFILL-1").verify_probe === OLD(5), "non-deferring contract left alone");
for (const k of ["issue-100314", "research-terminal-rem-0039"]) ok(c(k).status === "superseded" && /^superseded:contract-on-closed-issue/.test(c(k).last_verdict) && c(k).deferred_since === null, k + " superseded");
ok(c("goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1").status === "holding" && c("goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1").verify_probe === "SELECT 'pending: x'", "TP-9 parked as holding, probe unchanged");
ok(w.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "one decision row after a replay");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
