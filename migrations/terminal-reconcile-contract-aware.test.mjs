// TERMINAL-RECONCILE-CONTRACT-AWARE-1 offline suite: applies 2026-10-19-terminal-reconcile-contract-aware.sql on SQLite to the
// code-loop-terminal-reconcile definition exported in docs/fleet-tasks-canonical.json (v1) and runs its step with the two live close
// triggers. Proves: before the apply, ONE exhausted issue whose code task merged but whose contract reads fail makes the whole step abort
// with close-while-contract-fails (the CRON-FAULT-1 issue 100152 shape) and nothing else is closed; after it, that issue stays open
// with its triage row untouched while the others close; a re-apply changes nothing; the canonical row follows; the detector reads 0 and
// the Rollback header restores the v1 definition. Run: node migrations/terminal-reconcile-contract-aware.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("./2026-10-19-terminal-reconcile-contract-aware.sql", import.meta.url), "utf8");
const canon = JSON.parse(readFileSync(new URL("../docs/fleet-tasks-canonical.json", import.meta.url), "utf8")).tasks["code-loop-terminal-reconcile"];
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const sqlBody = mig.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const stmts = sqlBody.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const rollback = (/^-- Rollback: (.*)$/m.exec(mig) || [])[1] || "";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, close_channel TEXT, updated_at INTEGER, description TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, last_verdict TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, pr_url TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT);
CREATE TABLE fleet_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, status TEXT, error TEXT, started_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;
CREATE TRIGGER triage_close_sync_resolved_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('resolved','resolved-refuted') BEGIN UPDATE agent_issues SET status='closed', close_channel='auto:triage-resolved-sync', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=NEW.issue_id AND status='open'; END;`);
db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('code-loop-terminal-reconcile', 'CODE-LOOP-TERMINAL-RECONCILE-1', 'workflow', ?, 1, 1, 'x')").run(canon.definition);
db.prepare("INSERT INTO fleet_tasks_canonical VALUES ('code-loop-terminal-reconcile', ?, 'x', 'x')").run(canon.definition);
const ct = db.prepare("INSERT INTO code_tasks (id, status, pr_url) VALUES (?, ?, ?)");
ct.run("ct_a", "merged", "https://github.com/QNFO/qnfo-workers/pull/1"); ct.run("ct_b", "merged", "https://github.com/QNFO/qnfo-workers/pull/2"); ct.run("ct_c", "merged", null); ct.run("ct_d", "failed", null);
const seed = (id, title, ctrState) => {
  db.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, 'open')").run(id, title);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, close_evidence) VALUES (?, 'seed', 'triaged', 'x', NULL)").run(id);
  if (ctrState) db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES (?, ?, 'active', ?)").run("issue-" + id, id, ctrState);
};
seed(1, "CODE-LOOP-EXHAUSTED-1: ct_a qnfo-research-exec/worker.js", "fail");   // merged task, contract fails: the abort shape
seed(2, "CODE-LOOP-EXHAUSTED-1: ct_b qnfo-x/worker.js", "pass");                // merged task, contract passes
seed(3, "CODE-LOOP-EXHAUSTED-1: ct_c qnfo-y/worker.js", null);                 // merged task, no contract
seed(4, "CODE-LOOP-EXHAUSTED-1: ct_d qnfo-z/worker.js", null);                 // task not merged
const step = () => db.exec(JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().definition).steps[0].sql);
const status = () => Object.fromEntries(db.prepare("SELECT id, status FROM agent_issues ORDER BY id").all().map((r) => [r.id, r.status]));

let err = null; try { step(); } catch (e) { err = String(e.message || e); }
ok(err && /close-while-contract-fails/.test(err), "before: one issue with a failing contract aborts the whole step", err);
ok(JSON.stringify(status()) === JSON.stringify({ 1: "open", 2: "open", 3: "open", 4: "open" }), "before: nothing is closed, the abort unwound the batch", status());

for (const s of stmts) db.exec(s);
const after = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().definition);
ok(db.prepare("SELECT version FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().version === 2 && after.steps.length === 1 && /TERMINAL-RECONCILE-CONTRACT-AWARE-1/.test(after.steps[0].sql), "the migration edits the single step and bumps the version to 2");
err = null; try { step(); } catch (e) { err = String(e.message || e); }
ok(err === null, "after: the step runs without an abort", err);
ok(JSON.stringify(status()) === JSON.stringify({ 1: "open", 2: "closed", 3: "closed", 4: "open" }), "after: the issue with a failing contract stays open, the passing one and the contract-less one close, the unmerged one stays open", status());
const t1 = db.prepare("SELECT triage_state, close_evidence FROM issue_triage WHERE issue_id = 1").get();
ok(t1.triage_state === "triaged" && t1.close_evidence === null, "after: the skipped issue's triage row is untouched", t1);
ok(/DoD met: code task ct_b reached merged/.test(db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id = 2").get().close_evidence), "after: the closed issue carries the same evidence text as before");
const snap = JSON.stringify([db.prepare("SELECT * FROM fleet_tasks").all(), db.prepare("SELECT * FROM fleet_tasks_canonical").all()]);
for (const s of stmts) db.exec(s);
ok(JSON.stringify([db.prepare("SELECT * FROM fleet_tasks").all(), db.prepare("SELECT * FROM fleet_tasks_canonical").all()]) === snap, "a re-apply changes nothing (version stays 2)");
ok(db.prepare("SELECT definition FROM fleet_tasks_canonical WHERE id = 'code-loop-terminal-reconcile'").get().definition === db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().definition, "the canonical row follows the task");
db.prepare("INSERT INTO fleet_runs (task_id, status, error, started_at) VALUES ('code-loop-terminal-reconcile', 'ok', NULL, strftime('%Y-%m-%dT%H:%M:%SZ','now'))").run();
const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-terminal-reconcile-contract-abort'").get();
ok(!!probe && db.prepare(probe.verify_probe).get().observed === "0", "the detector probe reads 0 while the task runs clean", probe);
db.prepare("INSERT INTO fleet_runs (task_id, status, error, started_at) VALUES ('code-loop-terminal-reconcile', 'failed', 'D1_ERROR: close-while-contract-fails: SQLITE_CONSTRAINT', strftime('%Y-%m-%dT%H:%M:%SZ','now'))").run();
ok(db.prepare(probe.verify_probe).get().observed === "1", "the detector probe reads 1 after a run fails that way");
for (const s of rollback.split(/;\s+/).map((x) => x.trim()).filter(Boolean)) db.exec(s);
ok(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().definition === canon.definition && db.prepare("SELECT version FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile'").get().version === 1, "the Rollback header restores the v1 definition and version");
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
