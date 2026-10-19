// REARM-THIN-DRAFT-1 and PATCH-CAP-VERSION-LINE-1 migration suite (node:sqlite, synthetic rows).
// Proves migrations/2026-10-19-rearm-thin-draft-row.sql re-arms only research_queue db5dc635, once, with a backup, and that its Rollback
// line restores it; and that migrations/2026-10-19-code-task-patch-cap.sql is idempotent and files its failure mode, detector, control,
// decision and one open follow-up issue.
// Run: node migrations/rearm-thin-draft-row.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const rd = (n) => readFileSync(new URL("./" + n, import.meta.url), "utf8");
const DL = "CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER)";

// ---- re-arm ----
{
  const sql = rd("2026-10-19-rearm-thin-draft-row.sql");
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261019_thin_draft_rearm$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "rearm file opts in with APPLY-BY, DB, BACKUP and Rollback");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, context TEXT, claimed_at TEXT)");
  db.exec(DL);
  const ins = db.prepare("INSERT INTO research_queue (id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const P = "PARKED-POISON-1: recover_count exhausted (3); last error: ";
  const R = "reconcile: invalid paper contract: missing: Introduction, Background, Methods";
  const target = "db5dc635-d7d5-471a-aae7-fd2e5bba318d";
  ins.run(target, "wontfix", "parked", P + R, 3, 0, 1, '{"cycles":3}', "2026-10-19T05:00:00Z");
  ins.run("other-reconcile", "wontfix", "parked", P + R, 3, 0, 1, null, null);
  ins.run("other-floor", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=gate-length", 3, 0, 1, null, null);
  ins.run("live", "researching", "review", "none", 1, 0, 1, null, null);
  const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
  const others = ["other-reconcile", "other-floor", "live"];
  const before = Object.fromEntries(others.map((i) => [i, JSON.stringify(get(i))]));
  const beforeT = get(target);
  db.exec(sql);
  const t = get(target);
  ok(t.status === "queued" && t.stage === null && t.recover_count === 0 && t.attempt === 0 && t.terminal_rearms === 1 && t.context === null && t.claimed_at === null && t.error.startsWith("REARMED 2026-10-19 (REARM-THIN-DRAFT-1") && t.error.includes("reconcile: invalid paper contract"), "the named row returns to the queue once, with a note that keeps the prior error", t);
  ok(others.every((i) => JSON.stringify(get(i)) === before[i]), "another reconcile park, a floor park and a live row are untouched");
  ok(db.prepare("SELECT count(*) n FROM bak_20261019_thin_draft_rearm").get().n === 1 && db.prepare("SELECT status, stage, terminal_rearms FROM bak_20261019_thin_draft_rearm").get().stage === "parked", "the backup holds the row as it was");
  db.exec(sql);
  ok(get(target).terminal_rearms === 1 && db.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "applying twice re-arms once and logs one decision");
  db.prepare("UPDATE research_queue SET status = 'wontfix', stage = 'parked', recover_count = 3 WHERE id = ?").run(target);
  db.exec(sql);
  ok(get(target).status === "wontfix" && get(target).terminal_rearms === 1, "a row that parks again is not re-armed a second time");
  db.exec(/^-- Rollback: (.+)$/m.exec(sql)[1]);
  const r = get(target);
  ok(r.status === beforeT.status && r.stage === beforeT.stage && r.error === beforeT.error && r.recover_count === beforeT.recover_count && r.terminal_rearms === 0 && r.context === beforeT.context && r.claimed_at === beforeT.claimed_at, "the Rollback line restores the prior state", r);
}

// ---- patch cap ----
{
  const sql = rd("2026-10-19-code-task-patch-cap.sql");
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "cap file opts in with APPLY-BY, DB and Rollback");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT)");
  db.exec("CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT)");
  db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT)");
  db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)");
  db.exec("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, last_error TEXT, updated_at TEXT)");
  db.exec(DL);
  db.exec(sql); db.exec(sql);
  ok(db.prepare("SELECT count(*) n FROM control_registry WHERE control = 'code-task-publish-patch-cap'").get().n === 1, "one control row after two applies");
  ok(db.prepare("SELECT count(*) n FROM failure_modes").get().n === 1 && db.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "one failure mode and one decision after two applies");
  ok(db.prepare("SELECT count(*) n FROM agent_issues WHERE title LIKE 'VERSION-LINE-SPLIT-1:%' AND status = 'open'").get().n === 1, "one open follow-up issue after two applies");
  const probe = db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-code-patch-version-line-over-cap'").get().p;
  const q = () => db.prepare(probe).get();
  ok(q().expected === "0" && q().observed === "0", "the detector passes on an empty window", q());
  db.prepare("INSERT INTO code_tasks VALUES ('ct1', 'publish_failed', 'publish: patch larger than 200000 chars', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").run();
  ok(q().observed === "1", "the detector fails on a fresh patch-too-large publish failure", q());
  db.prepare("UPDATE code_tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 days')").run();
  ok(q().observed === "0", "an old failure leaves the 24 h window", q());
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
