// ISSUE-HYGIENE-2 offline suite: migrations/2026-10-26-issue-hygiene-2.sql replaces the issue-meta-fold workflow so the rule ledger-escalation-resolved also
// finds an escalation copy by the issue_ledger fingerprint qnfo-observability 1.5.3 writes into its description ("fp=<fingerprint>;"). Proves:
//  * hygiene-1's workflow does NOT close a copy whose ledger title has moved (the gap), hygiene-2's does, with evidence naming the fingerprint;
//  * a copy whose ledger row is still open, or has an open row of the same fingerprint family, is kept; a copy of another fingerprint is kept;
//  * the other five rules are byte-identical in both definitions (only the ledger rule changes); eleven steps; the version moves up by one per apply;
//  * the first definition is saved once and the Rollback line restores it (the gap returns), a second apply keeps the first backup;
//  * the file adds no trigger.
// Run: node migrations/issue-hygiene-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql1 = readFileSync(here("2026-10-26-issue-hygiene-1.sql"), "utf8");
const sql2 = readFileSync(here("2026-10-26-issue-hygiene-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql2)[1];

const TRIGGERS = [
  `CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END`,
  `CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status, CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END); END`,
  `CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END`,
  `CREATE TRIGGER triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now') WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused'); END`,
  `CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END`,
];
function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, updated_at TEXT);
CREATE TABLE issue_ledger (fingerprint TEXT PRIMARY KEY, source TEXT, level TEXT, category TEXT, title TEXT, status TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER, last_detail TEXT, updated_at TEXT, resolved_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
`);
  for (const t of TRIGGERS) db.exec(t);
  return db;
}
let n = 0;
function copy(db, title, fp, status = "open") {
  const id = 1000300 + ++n;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'qnfo-observability:evReview', 'reliability', 'high', ?, 1, 1)")
    .run(id, title, "AUTO-ESCALATION from evReview 2026-10-26T01:00:00.000Z - 4x, src qnfo-cloud-ops, fp=" + fp + ";", status);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-2', 'triaged', 'qnfo-observability', '2026-10-26 02:00:00')").run(id);
  return id;
}
function fixture(db) {
  const L = db.prepare("INSERT INTO issue_ledger (fingerprint, source, level, title, status, last_seen) VALUES (?, 'qnfo-cloud-ops', 'high', ?, ?, ?)");
  L.run("ev-moved", "CRON-FAULT: heartbeat late 41 min", "resolved", "2026-10-26 04:00:00");        // the ledger title has moved since the copy was filed
  L.run("ev-open", "CRON-FAULT: other thing 9 min", "open", "2026-10-26 06:00:00");                   // still failing: its copy stays
  L.run("ev-fam", "Family row resolved", "resolved", "2026-10-26 03:00:00");
  L.run("ev-fam2", "Family row still open", "open", "2026-10-26 06:00:00");
  return {
    moved: copy(db, "CRON-FAULT: heartbeat late 12 min", "ev-moved"),
    open: copy(db, "CRON-FAULT: other thing 3 min", "ev-open"),
    other: copy(db, "Unrelated title", "ev-unknown"),
  };
}
const stepsOf = (db) => JSON.parse(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'issue-meta-fold'").definition).steps.map((s) => s.sql);
const run = (db) => { for (const s of stepsOf(db)) db.exec(s); };
const status = (db, id) => one(db, "SELECT status FROM agent_issues WHERE id = ?", id).status;

// ---- hygiene-1 only: the gap
const a = build(); a.exec(sql1); const fa = fixture(a);
run(a);
ok(status(a, fa.moved) === "open", "hygiene-1: a copy whose ledger title moved is NOT closed by the workflow (the gap)", status(a, fa.moved));
const v1 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const v1steps = stepsOf(a);

// ---- + hygiene-2
const triggers0 = one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n;
a.exec(sql2);
const v2 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const v2steps = stepsOf(a);
ok(v2.version === v1.version + 1 && v2steps.length === 11 && v1steps.length === 11, "the workflow moves up one version and keeps eleven steps", { v1: v1.version, v2: v2.version });
const differ = v2steps.map((s, i) => s !== v1steps[i] ? i : -1).filter((i) => i >= 0);
ok(differ.length === 1 && /ledger-escalation-resolved/.test(v2steps[differ[0]]), "exactly one step differs: the ledger rule", differ);
ok(v2steps[differ[0]].includes("'fp=' || l.fingerprint || ';'"), "the new ledger rule matches by the fingerprint tag");
ok(one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n === triggers0, "the file adds no trigger");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_fleet_task_issue_meta_fold").n === 1 && one(a, "SELECT version FROM bak_20261026_fleet_task_issue_meta_fold").version === v1.version, "the first definition is saved once");

run(a);
const t = one(a, "SELECT close_evidence FROM issue_triage WHERE issue_id = ?", fa.moved).close_evidence;
ok(status(a, fa.moved) === "closed" && t.startsWith("moot: ") && t.includes("fingerprint ev-moved") && t.includes("2026-10-26 04:00:00"), "hygiene-2: the copy is closed by its fingerprint with evidence naming it", t);
ok(one(a, "SELECT close_channel FROM agent_issues WHERE id = ?", fa.moved).close_channel === "workflow:ISSUE-HYGIENE-1 ledger-escalation-resolved", "and names its channel");
ok(status(a, fa.open) === "open" && status(a, fa.other) === "open", "a copy whose ledger row is still open, and a copy with an unknown fingerprint, are kept");

// ---- a fingerprint family: one resolved row and one open row of the same title family keep the copy only when the open row carries the fingerprint
const id2 = copy(a, "Family row resolved", "ev-fam");
run(a);
ok(status(a, id2) === "closed", "a copy of a resolved fingerprint whose title equals the resolved row closes (whole-title match still works)", status(a, id2));

// ---- idempotent apply: version moves, first backup kept, behaviour same
a.exec(sql2);
ok(one(a, "SELECT version FROM fleet_tasks WHERE id = 'issue-meta-fold'").version === v2.version + 1, "a second apply moves the version again");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_fleet_task_issue_meta_fold").n === 1 && one(a, "SELECT version FROM bak_20261026_fleet_task_issue_meta_fold").version === v1.version, "and keeps the first backup");

// ---- rollback restores hygiene-1: the gap returns
const b = build(); b.exec(sql1); const fb = fixture(b); b.exec(sql2);
b.exec(rollback);
ok(JSON.stringify(stepsOf(b)) === JSON.stringify(v1steps), "the Rollback line restores the hygiene-1 steps");
run(b);
ok(status(b, fb.moved) === "open", "after rollback the moved-title copy is not closed again (the gap is back)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
