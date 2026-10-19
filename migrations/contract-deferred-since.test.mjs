// VERIFICATION-PATH-1 migration suite (migrations/2026-10-19-contract-deferred-since.sql, qnfo-fleet-control 0.38.0): runs the file on
// SQLite against the live shapes of remediation_contracts, v_remediation_evidence_all, issue_lifecycle and agent_issues, and proves:
//   the column is added and backfilled from the trailing run of pending reads (the earliest pending row after the last real
//   verdict; a contract that never had a real verdict starts at its birth; one with real rows and no pending row after them stays
//   NULL; a contract that is not deferred is untouched), the B-path evidence table counts, the two failure modes, their detector
//   contracts, the control and capability rows and the decision are written once, the VERIFICATION-PATH-2 follow-up is filed with a
//   closing probe, both detectors read what they claim (including the 1-row start: a deferral past the threshold with no issue),
//   re-applying the file changes nothing, and the Rollback header runs and removes the column and the rows.
// Run: node --no-warnings migrations/contract-deferred-since.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-19-contract-deferred-since.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
const ago = (h) => fmt(new Date(Date.now() - h * 3600e3));
const agoIso = (h) => ago(h).replace(" ", "T") + "Z";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT NOT NULL, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;`);

const contract = (cls, verdict, ts, status = "active", issueId = null) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, ts, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 1, ?, ?, ?)").run(cls, issueId, status, ts, verdict);
const row = (cls, observed, pass, h, table = "remediation_verifications", at = null) => db.prepare("INSERT INTO " + table + " (class, transport, expected, observed, pass, verified_at) VALUES (?, 'd1-query', 'ok', ?, ?, ?)").run(cls, observed, pass, at || ago(h));

// dA: real rows, then a run of pending rows: starts at the earliest pending row after the last real verdict
contract("dA", "deferred", ago(500)); row("dA", "broken", 0, 300); row("dA", "ok", 1, 250); row("dA", "pending: first", 0, 200); row("dA", "pending: second", 0, 100); row("dA", "pending", 0, 10);
// dB: only pending rows
contract("dB", "deferred", ago(500)); row("dB", "pending: x", 0, 90); row("dB", "pending: y", 0, 40);
// dC: no rows at all: the deferral started at birth
contract("dC", "deferred", ago(30));
// dD: real rows and no pending row after them (the tick wrote no row): start unknown, stays NULL
contract("dD", "deferred", ago(500)); row("dD", "ok", 1, 100);
// dE: not deferred: untouched even with pending rows
contract("dE", "pass", ago(500)); row("dE", "pending: z", 0, 50);
// dF: pending rows only in the B-path evidence table, ISO timestamps with T
contract("dF", "deferred", ago(500)); row("dF", "pending: b", 0, 0, "remediation_evidence", agoIso(70));
// dG: a vacuous (empty-observed) failure row between two pending runs is neither real nor pending
contract("dG", "deferred", ago(500)); row("dG", "pending: a", 0, 400); row("dG", "", 0, 300); row("dG", "pending: b", 0, 200);
// dH: a 'pending' with a measured value is a pending read here too (the tick's rtIsDeferral is a prefix test)
contract("dH", "deferred", ago(500)); row("dH", "Pending: 398.8 min vs 120", 0, 60);
// dI: stamped fail by the consumer on a pending read (active, newest row pending, in the last 24 h): the same deferral, backfilled
contract("dI", "fail", ago(500)); row("dI", "ok", 1, 400); row("dI", "pending: consumer 1", 0, 300); row("dI", "pending: consumer 2", 0, 100); row("dI", "pending: consumer 3", 0, 2);
// dJ: fail with a pending newest row older than 24 h: not currently deferring, untouched
contract("dJ", "fail", ago(500)); row("dJ", "pending: stale", 0, 60);
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'dJ'").run(ago(30));
// dK: fail on a real newest row after pending rows: a real failure, untouched
contract("dK", "fail", ago(500)); row("dK", "pending: before", 0, 100); row("dK", "broken", 0, 1);
// dL: not active (monitoring) with a pending newest row: untouched
contract("dL", "fail", ago(500), "monitoring"); row("dL", "pending: parked", 0, 1);

db.exec(sql);

const cols = db.prepare("PRAGMA table_info(remediation_contracts)").all().map((r) => r.name);
ok(cols.includes("deferred_since"), "the deferred_since column is added", cols);
const ds = (c) => db.prepare("SELECT deferred_since AS d FROM remediation_contracts WHERE class = ?").get(c).d;
const near = (v, h) => typeof v === "string" && Math.abs(Date.parse(v.replace(" ", "T") + "Z") - (Date.now() - h * 3600e3)) < 5000;
ok(near(ds("dA"), 200), "dA starts at the earliest pending row after its last real verdict", ds("dA"));
ok(near(ds("dB"), 90), "dB (only pending rows) starts at the earliest", ds("dB"));
ok(near(ds("dC"), 30), "dC (never judged) starts at its birth", ds("dC"));
ok(ds("dD") === null, "dD (real rows, no pending row after them) stays NULL for the tick to stamp", ds("dD"));
ok(ds("dE") === null, "a contract that is not deferred is untouched", ds("dE"));
ok(near(ds("dF"), 70), "pending rows in the B-path evidence table count, T timestamps are normalised", ds("dF"));
ok(near(ds("dG"), 400), "an empty-observed row does not break the pending run", ds("dG"));
ok(near(ds("dH"), 60), "a pending read with a measured value is a deferral too", ds("dH"));
ok(near(ds("dI"), 300), "a contract the consumer stamped fail on a pending newest row is backfilled from its trailing pending run", ds("dI"));
ok(ds("dJ") === null && ds("dK") === null && ds("dL") === null, "fail with a stale pending row, fail on a real newest row and a parked contract are untouched", [ds("dJ"), ds("dK"), ds("dL")]);

const one = (q, ...a) => db.prepare(q).get(...a);
ok(one("SELECT COUNT(*) n FROM failure_modes WHERE fm_key IN ('relapse-window-updated-at-anchor', 'verification-deferral-unaged')").n === 2, "both failure modes are recorded");
const det = (cls) => one("SELECT status, verify_transport, verify_probe, escalate_to, module, issue_id FROM remediation_contracts WHERE class = ?", cls);
ok(det("fm-verification-deferral-unaged") && det("fm-verification-deferral-unaged").status === "active" && det("fm-verification-deferral-unaged").module === "failure-mode" && det("fm-relapse-window-close-anchor") && det("fm-relapse-window-close-anchor").verify_transport === "d1-query", "both detector contracts are active d1-query failure-mode rows");
ok(one("SELECT COUNT(*) n FROM failure_modes f JOIN remediation_contracts c ON c.class = f.probe_class WHERE f.fm_key IN ('relapse-window-updated-at-anchor', 'verification-deferral-unaged')").n === 2, "each failure mode's probe_class names its detector contract");
ok(one("SELECT COUNT(*) n FROM control_registry WHERE control IN ('relapse-reopen-window', 'verification-deferral-escalation') AND disposition_state = 'applied' AND critical_path = 0").n === 2, "both controls are registered, applied, off the critical path");
ok(one("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'verification-deferral-escalation'").n === 1, "the capability is in the ledger");
const dl = one("SELECT actor, action, predicted_outcome, surfaces_tested FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-1:') = 1");
ok(dl && dl.actor === "session_01JADz8uHqYt9eUMBTwbbBE6" && /^failure_modes_recurring <= 12 within 6 h$/.test(dl.predicted_outcome) && dl.surfaces_tested, "the decision is logged with a prediction and surfaces", dl);
// no bare issue reference and no claude.ai link in the text the file writes
ok(!/#\d/.test(sql) && !/claude\.ai/i.test(sql), "no bare #123 reference and no claude.ai link in the file");

// the follow-up issue and its closing probe
const fu = one("SELECT id, status, priority, source FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-2:%'");
ok(fu && fu.status === "open" && fu.source === "qnfo-fleet-control", "VERIFICATION-PATH-2 is filed open", fu);
const fc = fu && one("SELECT status, verify_probe, verify_transport, module FROM remediation_contracts WHERE class = ?", "issue-" + fu.id);
ok(fc && fc.status === "active" && fc.verify_transport === "d1-query" && fc.module === "verification-path" && /sqlite_master/.test(fc.verify_probe), "its born contract carries the closing probe", fc);
const fcProbe = () => one(fc.verify_probe);
ok(fc && fcProbe().expected === "2" && fcProbe().observed === "0", "the probe reads 0 of 2 while the twins keep the old anchor", fc && fcProbe());
db.exec("CREATE TRIGGER remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications BEGIN SELECT 1 FROM issue_lifecycle; END; CREATE VIEW v_closure_relapses AS SELECT issue_id FROM issue_lifecycle");
ok(fc && fcProbe().observed === "2", "the probe passes once both objects read issue_lifecycle", fc && fcProbe());

// fm-verification-deferral-unaged: a deferral past 10080 + 30 minutes with no open issue for its class
const dprobe = det("fm-verification-deferral-unaged").verify_probe;
const reads = (p) => one(p);
let r = reads(dprobe);
// dA (200 h), dG (400 h) and dI (300 h, stamped fail by the consumer) are deferring past the threshold with no issue; dD has no start
// recorded yet (the tick stamps it) and is not counted.
ok(r.expected === "0" && r.observed === "3", "the deferral detector counts dA, dG and the consumer-stamped dI, not dD (no start yet)", r);
// a later deferral of dG and dI starts a new run: only dA is left
db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class IN ('dG', 'dI')").run(ago(1));
r = reads(dprobe);
ok(r.expected === "0" && r.observed === "1", "the deferral detector reads 1: dA (deferred 200 h) has no escalation issue", r);
db.prepare("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES ('VERIFICATION-DEFERRED-7D-1: dA', 'd', 'qnfo-fleet-control', 'open', 1, 1)").run();
r = reads(dprobe);
ok(r.observed === "0", "the deferral detector reads 0 once the class has an open escalation issue", r);
db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'dB'").run(ago(24 * 7 + 0.3));
r = reads(dprobe);
ok(r.observed === "0", "inside the 30-minute grace after the threshold the detector reads 0", r);
db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'dB'").run(ago(24 * 7 + 1));
r = reads(dprobe);
ok(r.observed === "1", "past the grace without an issue the detector reads 1 again", r);
db.prepare("UPDATE remediation_contracts SET status = 'monitoring' WHERE class = 'dB'").run();
r = reads(dprobe);
ok(r.observed === "0", "a parked contract (status away from active) is not a finding", r);
// the escalation issue's own contract never counts
const esc = one("SELECT id FROM agent_issues WHERE title = 'VERIFICATION-DEFERRED-7D-1: dA'");
db.prepare("UPDATE remediation_contracts SET deferred_since = ?, last_verdict = 'deferred', status = 'active' WHERE class = ?").run(ago(24 * 9), "issue-" + esc.id);
r = reads(dprobe);
ok(r.observed === "0", "the escalation issue's own deferred contract is not a finding", r);

// fm-relapse-window-close-anchor: a closed issue, 3 real failures since the close event, touched after the failures
const aprobe = det("fm-relapse-window-close-anchor").verify_probe;
r = reads(aprobe);
ok(r.expected === "0" && r.observed === "0", "the anchor detector reads 0 on a database with no relapse", r);
db.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (500, 'closed, failing, touched', 'd', 's', 'closed', 1, ?)").run(Date.now() - 3600e3);
db.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (500, 'dispositioned', 'open', 'closed', ?)").run(agoIso(48));
db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, max_attempts) VALUES ('issue-500', 500, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 1, 'holding', 3)").run();
row("issue-500", "broken", 0, 40); row("issue-500", "broken", 0, 30); row("issue-500", "broken", 0, 20);
r = reads(aprobe);
ok(r.observed === "1", "the anchor detector reads 1: three failures since the close event, updated_at touched after them", r);
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 500").run();
ok(reads(aprobe).observed === "0", "a reopened issue is not a finding");
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 500").run();
row("issue-500", "ok", 1, 10);
ok(reads(aprobe).observed === "0", "a pass after the failures resets the count");
db.prepare("DELETE FROM remediation_verifications WHERE class = 'issue-500' AND pass = 1").run();
db.prepare("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES ('closed, failing, touched', 'd', 's', 'open', 1, 1)").run();
ok(reads(aprobe).observed === "0", "an open twin of the same title is not a finding (the twin carries the live defect)");

// re-applying the file (without the ALTER, which SQLite cannot repeat; the runner treats a duplicate column as done) changes nothing
const snap = () => JSON.stringify([
  db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM failure_modes ORDER BY fm_key").all(), db.prepare("SELECT * FROM control_registry ORDER BY control").all(),
  db.prepare("SELECT * FROM capability_ledger").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").all(), db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-2:%'").all()]);
const before = snap();
try { db.exec(sql); ok(false, "the duplicate ALTER is refused by SQLite"); } catch (e) { ok(/duplicate column name/.test(String(e.message)), "the only error on re-apply is the duplicate column the runner accepts", e.message); }
db.exec(sql.replace("ALTER TABLE remediation_contracts ADD COLUMN deferred_since TEXT;", ""));
ok(snap() === before, "re-applying the rest of the file changes nothing");

// the Rollback header is runnable and removes what the file added
const rb = /^-- Rollback: (.*)$/m.exec(sql);
ok(rb && rb[1].indexOf("\n") === -1, "the Rollback header is one line");
db.exec("DROP VIEW v_closure_relapses; DROP TRIGGER remediation_reopen_on_relapse_d1");
db.exec(rb[1]);
const cols2 = db.prepare("PRAGMA table_info(remediation_contracts)").all().map((c) => c.name);
ok(!cols2.includes("deferred_since"), "the Rollback drops the column");
ok(one("SELECT COUNT(*) n FROM failure_modes WHERE fm_key IN ('relapse-window-updated-at-anchor', 'verification-deferral-unaged')").n === 0 && one("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'").n === 0 && one("SELECT COUNT(*) n FROM control_registry").n === 0 && one("SELECT COUNT(*) n FROM capability_ledger").n === 0 && one("SELECT COUNT(*) n FROM decision_log").n === 0, "the Rollback deletes the rows the file added");
ok(one("SELECT status FROM agent_issues WHERE id = ?", fu.id).status === "superseded", "the Rollback supersedes the follow-up issue instead of deleting it");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
