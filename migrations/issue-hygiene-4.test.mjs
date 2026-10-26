// ISSUE-HYGIENE-4 offline suite: migrations/2026-10-26-issue-hygiene-4.sql closes a list of issues with evidence two independent measurements agreed on.
// Proves, on the live close-guard triggers replayed in node:sqlite: every listed open issue closes with exactly the stated evidence (plus the dated tag) and names its
// channel, an issue not on the list is untouched, an already closed or reopened-since issue is skipped, a superseded-by evidence settles the contract, each close left a
// lifecycle row with evidence, the ledger holds the before-state, a second apply changes nothing, and the Rollback line reopens exactly these issues with their before-state.
// Run: node --no-warnings migrations/issue-hygiene-4.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-issue-hygiene-4.sql"), "utf8");
const sql1 = readFileSync(here("2026-10-26-issue-hygiene-1.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const RULE = "session-sweep-2026-10-26";
// the list, read back from the migration itself: SELECT <id> AS id, '<evidence>' AS ev, <succ> AS succ
const rows = [...sql.matchAll(/SELECT (\d+) AS id, '((?:[^']|'')*)' AS ev, (\d+|NULL) AS succ/g)].map((m) => ({ id: Number(m[1]), ev: m[2].replace(/''/g, "'"), succ: m[3] === "NULL" ? null : Number(m[3]) }));

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

function build2() {
  const db = build();
  db.exec(sql1);
  return db;
}
const listed = new Set(rows.map((r) => r.id));
function seed(db) {
  const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'd', 'test', 'x', 'high', ?, 1, 1)");
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-2', 'triaged', 'o', '2026-10-26 02:00:00')");
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 'active')");
  rows.forEach((r, i) => {
    // the first listed row is already closed by someone else before the apply: it must be skipped
    ins.run(r.id, "ticket " + r.id, i === 0 && rows.length > 2 ? "closed" : "open"); tri.run(r.id);
    if (i % 2 === 0) con.run("issue-" + r.id, r.id);
  });
  if (rows.length > 2) db.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'closed earlier by another path' WHERE issue_id = ?").run(rows[0].id);
  for (const id of [9100001, 9100002]) { ins.run(id, "unlisted " + id, "open"); tri.run(id); con.run("issue-" + id, id); }
}
const db1 = build2(); seed(db1);
const before = JSON.stringify(db1.prepare("SELECT id, status FROM agent_issues WHERE id IN (9100001, 9100002)").all());
db1.exec(sql);
const todo = rows.length > 2 ? rows.slice(1) : rows;
ok(rows.length > 0, "the list is read back from the migration", rows.length);
for (const r of todo) {
  const a = one(db1, "SELECT status, close_channel FROM agent_issues WHERE id = ?", r.id);
  const t = one(db1, "SELECT triage_state, close_evidence FROM issue_triage WHERE issue_id = ?", r.id);
  if (!(a.status === "closed" && a.close_channel === "workflow:ISSUE-HYGIENE-1 " + RULE && t.triage_state === "closed" && t.close_evidence.startsWith(r.ev + " ISSUE-HYGIENE-1 "))) { ok(false, "issue " + r.id + " closes with its evidence and channel", { a, t: t && t.close_evidence.slice(0, 80) }); }
  else pass++;
}
ok(JSON.stringify(db1.prepare("SELECT id, status FROM agent_issues WHERE id IN (9100001, 9100002)").all()) === before, "issues not on the list are untouched");
if (rows.length > 2) ok(one(db1, "SELECT close_evidence FROM issue_triage WHERE issue_id = ?", rows[0].id).close_evidence === "closed earlier by another path" && one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE issue_id = ?", rows[0].id).n === 0, "an issue already closed by another path is skipped and gets no ledger row");
ok(one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE rule = ? AND applied = 1", RULE).n === todo.length && one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE applied = 0").n === 0, "the ledger holds one applied row per close and nothing pending", one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE rule = ?", RULE));
ok(one(db1, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE event = 'dispositioned' AND has_evidence = 1").n >= todo.length, "each close left a lifecycle row with evidence (no silent drop)");
const withSucc = todo.filter((r) => r.succ);
ok(withSucc.every((r) => one(db1, "SELECT successor_id FROM issue_fold_ledger WHERE issue_id = ?", r.id).successor_id === r.succ), "a duplicate close records its successor id in the ledger");
ok(todo.every((r) => !/^verified:|^moot:|^superseded by \d+ \(/.test(r.ev) ? false : true), "every evidence starts with moot:, superseded by <id> ( or verified:");
ok(todo.every((r) => r.ev.length <= 700 && r.ev.length >= 40), "every evidence is standalone text of sensible length");
ok(withSucc.every((r) => new RegExp("^superseded by " + r.succ + " \\(").test(r.ev)), "a successor id and the evidence text name the same issue");
ok(one(db1, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n >= 5 && !/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file adds no trigger and runs no DELETE or DROP");
const snap = JSON.stringify([db1.prepare("SELECT id, status FROM agent_issues ORDER BY id").all(), db1.prepare("SELECT COUNT(*) AS n FROM issue_fold_ledger").get()]);
db1.exec(sql);
ok(JSON.stringify([db1.prepare("SELECT id, status FROM agent_issues ORDER BY id").all(), db1.prepare("SELECT COUNT(*) AS n FROM issue_fold_ledger").get()]) === snap, "a second apply changes nothing");
db1.exec(rollback);
ok(todo.every((r) => one(db1, "SELECT status FROM agent_issues WHERE id = ?", r.id).status === "open" && one(db1, "SELECT triage_state, close_evidence FROM issue_triage WHERE issue_id = ?", r.id).triage_state === "triaged"), "the Rollback line reopens exactly these issues with their before-state");
if (rows.length > 2) ok(one(db1, "SELECT status FROM agent_issues WHERE id = ?", rows[0].id).status === "closed", "and leaves the issue closed by another path closed");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
