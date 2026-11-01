// FOLDED-TARGET-REVERT-1 offline suite: migrations/2026-10-26-folded-target-revert.sql settles the records of PR 4620 (code task ct_im1000417), which is reverted in the repository.
// Proves, on the live close-guard triggers replayed in node:sqlite: issue 1000417 closes as moot with exactly the stated evidence (plus the dated tag) and names its channel, its contract leaves
// the closing path, an issue not on the list is untouched, the ledger holds the before-state, a lifecycle row with evidence is left, the waiting code task is marked superseded and only
// that one, the roadmap proposal is rejected with its reason and only that one, the follow-up issue is filed once with a doer and a parsable closing probe, a decision row is written once,
// the file adds no trigger and runs no DELETE or DROP, a second apply changes nothing, and the Rollback line restores the before-state. A second part proves the repository revert:
// qnfo-backlog-exec is line-identical to its host again (qnfo-lifecycle/backlog-fold.test.mjs passes) and its mirror is identical.
// Run: node --no-warnings migrations/folded-target-revert.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-folded-target-revert.sql"), "utf8");
const sql1 = readFileSync(here("2026-10-26-issue-hygiene-1.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const RULE = "session-folded-revert-2026-10-26";
const ID = 1000417;
const EV = /SELECT 1000417 AS id, '((?:[^']|'')*)' AS ev/.exec(sql)[1].replace(/''/g, "'");

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
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, path TEXT, goal TEXT, status TEXT, merge_state TEXT, merge_note TEXT, updated_at TEXT);
CREATE TABLE roadmap_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, program_code TEXT NOT NULL, title TEXT, task_id TEXT, issue_id INTEGER, status TEXT NOT NULL DEFAULT 'proposed', outcome TEXT, updated_at TEXT);
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
function seed(db) {
  const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'd', 'test', 'x', 'high', 'open', 1, 1)");
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-2', 'triaged', 'o', '2026-10-26 02:00:00')");
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 'active')");
  for (const id of [ID, 9100001]) { ins.run(id, "ticket " + id); tri.run(id); con.run("issue-" + id, id); }
  const ct = db.prepare("INSERT INTO code_tasks (id, path, goal, status, merge_state) VALUES (?, ?, 'g', 'merged', ?)");
  ct.run("ct_im1000417", "qnfo-backlog-exec/worker.js", "deploying"); ct.run("ct_im1000418", "qnfo-infra/worker.js", "deploying"); ct.run("ct_other", "x/worker.js", "verified");
  const rp = db.prepare("INSERT INTO roadmap_proposals (id, program_code, title, task_id, issue_id, status, outcome) VALUES (?, 'QNFO.OPS', 't', ?, ?, 'building', 'queued')");
  rp.run(1, "ct_im1000417", ID); rp.run(2, "ct_im1000418", 1000418);
}
const db1 = build2(); seed(db1);
// production gives every new issue a triage row on arrival (agent_issues_autotriage2_ins)
db1.exec("CREATE TRIGGER autotriage_sim AFTER INSERT ON agent_issues BEGIN INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (NEW.id, 'AUTOTRIAGE-2', 'triaged', 'o', '2026-10-26 02:00:00'); END;");
db1.exec(sql);
const a = one(db1, "SELECT status, close_channel FROM agent_issues WHERE id = ?", ID);
const t = one(db1, "SELECT triage_state, close_evidence FROM issue_triage WHERE issue_id = ?", ID);
ok(a.status === "closed" && a.close_channel === "workflow:ISSUE-HYGIENE-1 " + RULE, "issue 1000417 closes and names its channel", a);
ok(t.triage_state === "closed" && t.close_evidence.startsWith(EV + " ISSUE-HYGIENE-1 "), "its triage row carries exactly the stated evidence plus the dated tag", t.close_evidence.slice(0, 120));
ok(/^moot: /.test(EV) && EV.length >= 40 && EV.length <= 700, "the evidence starts with moot: and is standalone text of sensible length", EV.length);
ok(/FOLDED/.test(EV) && /4620/.test(EV) && /334 of 334/.test(EV) && /v_issues_no_next_action/.test(EV), "the evidence names the folded directory, the pull request, the measured count and the metric");
ok(one(db1, "SELECT status, last_verdict FROM remediation_contracts WHERE class = 'issue-1000417'").status === "superseded", "its contract leaves the closing path");
ok(one(db1, "SELECT status FROM agent_issues WHERE id = 9100001").status === "open" && one(db1, "SELECT status FROM remediation_contracts WHERE class = 'issue-9100001'").status === "active", "an issue not on the list is untouched");
ok(one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE rule = ? AND applied = 1 AND issue_id = ?", RULE, ID).n === 1 && one(db1, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE applied = 0").n === 0, "the ledger holds one applied row and nothing pending");
ok(one(db1, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE issue_id = ? AND event = 'dispositioned' AND has_evidence = 1", ID).n === 1, "the close left a lifecycle row with evidence (no silent drop)");
ok(one(db1, "SELECT merge_state, merge_note FROM code_tasks WHERE id = 'ct_im1000417'").merge_state === "superseded" && /^FOLDED-TARGET-REVERT-1:/.test(one(db1, "SELECT merge_note FROM code_tasks WHERE id = 'ct_im1000417'").merge_note), "the waiting code task is marked superseded with the reason");
ok(one(db1, "SELECT merge_state FROM code_tasks WHERE id = 'ct_im1000418'").merge_state === "deploying" && one(db1, "SELECT merge_state FROM code_tasks WHERE id = 'ct_other'").merge_state === "verified", "no other code task is touched");
ok(one(db1, "SELECT status, outcome FROM roadmap_proposals WHERE id = 1").status === "rejected" && /^reverted: /.test(one(db1, "SELECT outcome FROM roadmap_proposals WHERE id = 1").outcome) && one(db1, "SELECT status FROM roadmap_proposals WHERE id = 2").status === "building", "the roadmap proposal is rejected with its reason and only that one");
const fu = db1.prepare("SELECT * FROM agent_issues WHERE title LIKE 'FOLDED-TARGET-AT-READ-1:%'").all();
ok(fu.length === 1 && fu[0].status === "open" && fu[0].priority === "high" && /Doer: qnfo-code-orchestrator/.test(fu[0].description), "the follow-up is filed once, open, with a doer");
const d = fu[0].description;
ok(/^code-task: repo=qnfo-workers path=qnfo-code-orchestrator\/worker\.js$/m.test(d) && /^code-anchor: const scopeWhy = mergeScopeWhy\(task\.repo, task\.path\);$/m.test(d), "it carries a code-task line and a verbatim code-anchor");
const cp = /^code-probe: (\{.*\})$/m.exec(d);
let probe = null; try { probe = JSON.parse(cp && cp[1]); } catch (e) { probe = null; }
ok(probe && probe.paths[0] === "qnfo-code-orchestrator/worker.js" && probe.contains === "FOLDED-TARGET-AT-READ-1" && !("absent" in probe), "its closing code-probe parses and names the marker the change must add", cp && cp[1]);
const orch = readFileSync(here("../qnfo-code-orchestrator/worker.js"), "utf8");
ok(orch.split("const scopeWhy = mergeScopeWhy(task.repo, task.path);").length === 2 || /FOLDED-TARGET-AT-READ-1/.test(orch), "the anchor occurs once in the orchestrator (or the change is already in)");
ok(one(db1, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'FOLDED-TARGET-REVERT-1:') = 1").n === 1, "one decision row is written");
ok(one(db1, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n >= 5 && !/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file adds no trigger and runs no DELETE or DROP");
const snap = JSON.stringify([db1.prepare("SELECT id, status FROM agent_issues ORDER BY id").all(), db1.prepare("SELECT COUNT(*) AS n FROM issue_fold_ledger").get(), db1.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), db1.prepare("SELECT id, merge_state FROM code_tasks ORDER BY id").all()]);
db1.exec(sql);
ok(JSON.stringify([db1.prepare("SELECT id, status FROM agent_issues ORDER BY id").all(), db1.prepare("SELECT COUNT(*) AS n FROM issue_fold_ledger").get(), db1.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), db1.prepare("SELECT id, merge_state FROM code_tasks ORDER BY id").all()]) === snap, "a second apply changes nothing");
db1.exec(rollback);
ok(one(db1, "SELECT status FROM agent_issues WHERE id = ?", ID).status === "open" && one(db1, "SELECT triage_state FROM issue_triage WHERE issue_id = ?", ID).triage_state === "triaged" && one(db1, "SELECT status FROM remediation_contracts WHERE class = 'issue-1000417'").status === "active", "the Rollback line reopens the issue with its before-state and restores its contract");
ok(one(db1, "SELECT merge_state FROM code_tasks WHERE id = 'ct_im1000417'").merge_state === "deploying" && one(db1, "SELECT status FROM roadmap_proposals WHERE id = 1").status === "building" && one(db1, "SELECT status FROM agent_issues WHERE title LIKE 'FOLDED-TARGET-AT-READ-1:%'").status === "closed", "and restores the code task and the proposal and closes the follow-up (an issue is never deleted)");

// The repository revert: the folded member is line-identical to its host again, and its mirror is identical.
const guest = readFileSync(here("../qnfo-backlog-exec/worker.js"), "utf8");
const mirror = readFileSync(here("../qnfo-backlog-exec/deployed-current.worker.js"), "utf8");
const host = readFileSync(here("../qnfo-lifecycle/worker.js"), "utf8");
const missing = guest.split("\n").filter((l) => l.trim() && !host.includes(l.trim()));
ok(missing.every((l) => /^var VERSION = |^export \{|^  worker_default as default$|^\/\/# sourceMappingURL/.test(l)), "every qnfo-backlog-exec line is in the host except its VERSION line and its export", missing.map((l) => l.slice(0, 60)));
ok(!/INSERT OR IGNORE INTO issue_triage/.test(guest) && !/Auto.attach a doer/.test(guest), "the empty auto-attach insert is gone from the folded member");
ok(guest === mirror, "qnfo-backlog-exec/deployed-current.worker.js is identical to worker.js");
const r = spawnSync(process.execPath, ["--no-warnings", fileURLToPath(new URL("../qnfo-lifecycle/backlog-fold.test.mjs", import.meta.url))], { encoding: "utf8" });
ok(r.status === 0 && /0 failed/.test(r.stdout), "qnfo-lifecycle/backlog-fold.test.mjs passes", (r.stdout || "").slice(-200));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
