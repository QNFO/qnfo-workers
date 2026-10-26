// ISSUE-HYGIENE-3 offline suite: migrations/2026-10-26-issue-hygiene-3.sql adds the rule model-eval-promote-withdrawn to the hourly workflow issue-meta-fold and runs it once.
// A CF-MODEL-EVAL-1 "promote <model> on the <lane> battery" ticket closes, with the fact that withdrew it, when the evaluator's own catalog no longer says recommended or
// in_production and the model has no row in model_ladder_models (the state qnfo-model-eval leaves when a newer winner supersedes it or the canary gate holds it back).
// Proves, on the live close-guard triggers replayed in node:sqlite:
//  * before the file the workflow does not close such a ticket (the gap), the file closes the withdrawn ones on apply with evidence naming the model, the catalog status and note;
//  * a ticket whose model is recommended, in production, still on the ladder, has no catalog row, belongs to another source or is another CF-MODEL-EVAL-1 kind is kept;
//  * after the file the hourly workflow closes a later withdrawn ticket and keeps one whose model is promoted again;
//  * the workflow moves up one version, holds twelve statements of which exactly the new insert is added, the first definition is saved, a second apply keeps the first backup,
//    the Rollback line restores the hygiene-2 steps, and the file adds no trigger and no DELETE or DROP.
// Run: node --no-warnings migrations/issue-hygiene-3.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql1 = readFileSync(here("2026-10-26-issue-hygiene-1.sql"), "utf8");
const sql2 = readFileSync(here("2026-10-26-issue-hygiene-2.sql"), "utf8");
const sql3 = readFileSync(here("2026-10-26-issue-hygiene-3.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql3)[1];

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
function build3() {
  const db = build();
  db.exec("CREATE TABLE cf_model_catalog (model_id TEXT PRIMARY KEY, status TEXT, notes TEXT); CREATE TABLE model_ladder_models (id TEXT PRIMARY KEY, active INTEGER, notes TEXT);");
  return db;
}
let k = 0;
function promote(db, model, o = {}) {
  const id = 1000400 + ++k;
  const lane = o.lane ?? "decision";
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'Automatic evaluation (cfmb-2) produced a promotion reason', ?, 'optimization', 'medium', 'open', 1, 1)")
    .run(id, o.title ?? "CF-MODEL-EVAL-1: promote " + model + " on the " + lane + " battery", o.source ?? "cf-model-eval");
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-2', 'triaged', 'qnfo-model-eval', '2026-10-26 02:00:00')").run(id);
  return id;
}
const cat = (db, model, status, notes = "") => db.prepare("INSERT OR REPLACE INTO cf_model_catalog (model_id, status, notes) VALUES (?, ?, ?)").run(model, status, notes);
const ladder = (db, model) => db.prepare("INSERT OR REPLACE INTO model_ladder_models (id, active, notes) VALUES (?, 0, 'auto-eval promote cfmb-2 (cf-model-eval)')").run(model);
function fixture(db) {
  cat(db, "@cf/cloudflare/clef-omni", "passed", "superseded by decision-battery winner @cf/cloudflare/clef-flash");
  cat(db, "@cf/cloudflare/clef-flash", "candidate", "canary gate: real-data agreement 0.2917 < 0.7 (category 0.0833) -- the model answers the batch");
  cat(db, "@cf/x/live", "recommended", "last verdict: promote"); ladder(db, "@cf/x/live");
  cat(db, "@cf/x/prod", "in_production", "routed");
  cat(db, "@cf/x/onladder", "passed", "kept on the ladder"); ladder(db, "@cf/x/onladder");
  cat(db, "@cf/x/rejected", "rejected", "last verdict: reject (below the control)");
  return {
    omni: promote(db, "@cf/cloudflare/clef-omni"),
    flash: promote(db, "@cf/cloudflare/clef-flash"),
    rejected: promote(db, "@cf/x/rejected", { lane: "chat" }),
    live: promote(db, "@cf/x/live"),
    prod: promote(db, "@cf/x/prod"),
    onladder: promote(db, "@cf/x/onladder"),
    nocat: promote(db, "@cf/x/unknown"),
    otherSource: promote(db, "@cf/cloudflare/clef-omni", { source: "session" }),
    harness: promote(db, "@cf/cloudflare/clef-omni", { title: "CF-MODEL-EVAL-1: harness cannot run @cf/cloudflare/clef-omni" }),
    winner: promote(db, "@cf/cloudflare/clef-omni", { title: "CF-MODEL-EVAL-1: decision-model winner is @cf/cloudflare/clef-omni" }),
  };
}
const stepsOf = (db) => JSON.parse(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'issue-meta-fold'").definition).steps.map((s) => s.sql);
const run = (db) => { for (const s of stepsOf(db)) db.exec(s); };
const status = (db, id) => one(db, "SELECT status FROM agent_issues WHERE id = ?", id).status;

// ---- hygiene-1 and -2 only: the gap
const a = build3(); a.exec(sql1); a.exec(sql2);
const f = fixture(a);
run(a);
ok(status(a, f.omni) === "open" && status(a, f.flash) === "open" && status(a, f.rejected) === "open", "before hygiene-3 the workflow does not close a withdrawn promote ticket (the gap)");
const v2 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const v2steps = stepsOf(a);
const triggers0 = one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n;

// ---- apply hygiene-3: the rule runs once inside the file
a.exec(sql3);
for (const [key, label] of [["omni", "superseded by the winner"], ["flash", "held back by the canary gate"], ["rejected", "rejected"]]) {
  ok(status(a, f[key]) === "closed", "the withdrawn promote ticket closes on apply (" + label + ")", status(a, f[key]));
}
for (const [key, label] of [["live", "recommended and on the ladder"], ["prod", "in production"], ["onladder", "passed but still on the ladder"], ["nocat", "no catalog row"], ["otherSource", "another source"], ["harness", "the harness-cannot-run kind"], ["winner", "the decision-model-winner kind"]]) {
  ok(status(a, f[key]) === "open", "a ticket is kept: " + label, status(a, f[key]));
}
const ev = one(a, "SELECT close_evidence FROM issue_triage WHERE issue_id = ?", f.flash).close_evidence;
ok(ev.startsWith("moot: ") && ev.includes("@cf/cloudflare/clef-flash") && ev.includes("is candidate") && ev.includes("canary gate: real-data agreement 0.2917 < 0.7") && ev.includes("no row in model_ladder_models") && /ISSUE-HYGIENE-1 \d{4}-\d{2}-\d{2}$/.test(ev), "the evidence names the model, the catalog status and note and the empty ladder", ev);
ok(one(a, "SELECT close_channel FROM agent_issues WHERE id = ?", f.omni).close_channel === "workflow:ISSUE-HYGIENE-1 model-eval-promote-withdrawn", "the close names its channel");
ok(one(a, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE rule = 'model-eval-promote-withdrawn' AND applied = 1") .n === 3 && one(a, "SELECT COUNT(*) AS n FROM issue_fold_ledger WHERE applied = 0").n === 0, "the ledger holds three applied rows of the rule and nothing pending");
ok(one(a, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE event = 'dispositioned' AND has_evidence = 1 AND issue_id IN (?, ?, ?)", f.omni, f.flash, f.rejected).n === 3, "each close left a lifecycle row with evidence (no silent drop)");

// ---- the workflow
const v3 = one(a, "SELECT version, definition FROM fleet_tasks WHERE id = 'issue-meta-fold'");
const v3steps = stepsOf(a);
ok(v3.version === v2.version + 1 && v3steps.length === 12 && v2steps.length === 11, "the workflow moves up one version and holds twelve statements", { v2: v2.version, v3: v3.version, n: v3steps.length });
const added = v3steps.filter((s) => !v2steps.includes(s));
ok(added.length === 1 && /model-eval-promote-withdrawn/.test(added[0]) && v2steps.every((s) => v3steps.includes(s)), "exactly one statement is added and the eleven others are unchanged", added.length);
ok(v3steps.indexOf(added[0]) === 6, "the new rule sits after the six rules and before the five settle statements", v3steps.indexOf(added[0]));
ok(one(a, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n === triggers0, "the file adds no trigger");
ok(!/^\s*(DELETE|DROP)\b/im.test(sql3.replace(/^--.*$/gm, "")), "the file runs no DELETE or DROP");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_fleet_task_issue_meta_fold_h2").n === 1 && one(a, "SELECT version FROM bak_20261026_fleet_task_issue_meta_fold_h2").version === v2.version, "the hygiene-2 definition is saved once");

// ---- later: a newly withdrawn ticket closes on the next hourly run, a re-promoted one stays
const later = promote(a, "@cf/x/later");
cat(a, "@cf/x/later", "rejected", "canary gate: agreement below 0.7");
const again = promote(a, "@cf/x/again");
cat(a, "@cf/x/again", "candidate", "canary gate"); 
run(a);
ok(status(a, later) === "closed" && status(a, again) === "closed", "the hourly run closes a ticket withdrawn after the apply", { later: status(a, later), again: status(a, again) });
const re = promote(a, "@cf/x/repromoted");
cat(a, "@cf/x/repromoted", "recommended", "last verdict: promote"); ladder(a, "@cf/x/repromoted");
run(a);
ok(status(a, re) === "open", "a ticket whose model is promoted again stays open");
ok(status(a, f.live) === "open" && status(a, f.prod) === "open" && status(a, f.onladder) === "open", "and the kept tickets are still open after another run");

// ---- idempotent apply, first backup kept
a.exec(sql3);
ok(one(a, "SELECT version FROM fleet_tasks WHERE id = 'issue-meta-fold'").version === v3.version + 1, "a second apply moves the version again");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_fleet_task_issue_meta_fold_h2").n === 1 && one(a, "SELECT version FROM bak_20261026_fleet_task_issue_meta_fold_h2").version === v2.version, "and keeps the first backup");

// ---- rollback restores hygiene-2
const b = build3(); b.exec(sql1); b.exec(sql2);
const fb = fixture(b);
b.exec(sql3);
b.exec(rollback);
ok(JSON.stringify(stepsOf(b)) === JSON.stringify(v2steps), "the Rollback line restores the hygiene-2 steps");
const lateB = promote(b, "@cf/x/after-rollback");
cat(b, "@cf/x/after-rollback", "rejected", "canary gate");
run(b);
ok(status(b, lateB) === "open" && status(b, fb.omni) === "closed", "after rollback a new withdrawn ticket is not closed (the gap is back) and the earlier closes stay closed");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
