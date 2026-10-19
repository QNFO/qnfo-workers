// TRIAGE-STATE-NORMALISE-1 offline suite: replays the live text of the agent_issues / issue_triage / remediation_contracts triggers that a reopen
// touches (read from qnfo-audit sqlite_master on 2026-10-19) on node:sqlite, then runs migrations/2026-10-19-issue-triage-state-normalise.sql.
// Proves:
//  * the defect on the pre-fix state: the live issue_refile_reopen reopens a refiled closed issue and leaves its issue_triage row closed (the shape
//    of agent_issues 2957), and the five open or monitoring issues with a closed triage row are the only ones the detector counts;
//  * the one-time normalise: those five rows go back to triaged with reopened_count + 1 and the closure text cleared (kept in the backup table),
//    their status and lifecycle are untouched;
//  * the structural fix: the recreated issue_refile_reopen differs from the live body by exactly one added statement; a refile now reopens the
//    issue WITH its triage row (open, wontfix and resolved closures alike); a reopen the open-twin guard skipped, a refile older than 24 h and a
//    plain new issue touch no triage row;
//  * the parked monitoring twins are NOT this file's business (migrations/2026-10-19-metric-twin-supersede.sql closes all 33): a monitoring row
//    with an open ticket of the same trigger keeps its status, its contract and its triage row, so the two files never handle one row; a
//    monitoring row whose open ticket has gone is normalised here;
//  * the contract of 2957 is re-armed with a probe that measures the open-issue trend and still fails on a rising trend;
//  * the detector reads 5 before and 0 after; applying the file twice changes nothing and keeps the first backup; the Rollback line restores the
//    old trigger text and every changed row (including 2957 back to open with a closed triage row, which needs the contract restored first);
//  * the trigger-depth model (the live agent_issues graph as of 2026-10-19): the deepest chain through INSERT agent_issues is the same with the
//    old and the new body, and the new issue_refile_reopen chain is no deeper than the standing agent_issues_autotriage2_ins chain.
// Run: node migrations/issue-triage-normalise.test.mjs
// Show it failing on the pre-fix state: TRIAGE_NEUTRALISE=1 node migrations/issue-triage-normalise.test.mjs  (the file body is replaced by a no-op)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = "2026-10-19-issue-triage-state-normalise.sql";
const real = readFileSync(here(FILE), "utf8");
const neutralised = process.env.TRIAGE_NEUTRALISE === "1";
const sql = neutralised ? "SELECT 1;" : real;
let pass = 0, fail = 0;
// with the file body neutralised the suite stops at the first read of an object the file would have created: that is the failure
if (neutralised) process.on("uncaughtException", (e) => { console.log("NEUTRALISED: the suite fails on the pre-fix state (" + pass + " passed, " + (fail + 1) + " failed before it stopped): " + e.message); process.exit(1); });
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const all = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

// "CREATE TRIGGER <name> ..." up to the line "END;" in a migration file (the standing text of a trigger a migration holds)
function ddl(file, name) {
  const t = readFileSync(here(file), "utf8");
  const at = t.search(new RegExp("^CREATE TRIGGER(?: IF NOT EXISTS)? " + name + "\\b", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  const end = t.indexOf("\nEND;", at);
  return t.slice(at, end + 5).replace(/CREATE TRIGGER IF NOT EXISTS/, "CREATE TRIGGER");
}

// ---- the live trigger texts (sqlite_master, qnfo-audit, 2026-10-19), verbatim
const OLD_REFILE = `CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1): the same title was filed again within 24 h of the close, by ' || COALESCE(NEW.source, '?') || '.'
  WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
    AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END`;
const LIVE = {
  issue_lifecycle_ai: `CREATE TRIGGER issue_lifecycle_ai AFTER INSERT ON agent_issues
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, to_status, has_evidence) VALUES (NEW.id, 'opened', NEW.status, NULL);
END`,
  issue_lifecycle_au: `CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END`,
  issue_lifecycle_no_update: `CREATE TRIGGER issue_lifecycle_no_update BEFORE UPDATE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END`,
  issue_lifecycle_no_delete: `CREATE TRIGGER issue_lifecycle_no_delete BEFORE DELETE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END`,
  decision_log_no_update: `CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END`,
  decision_log_no_delete: `CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END`,
  issue_close_evidence_required: `CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  -- CLOSE-BINDS-TO-PROBE-1 (2026-10-18): a claim that the defect is GONE must agree with the fleet's own probe.
  -- wontfix is deliberately exempt: declining to fix is a decision, not a claim of resolution.
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END`,
  agent_issues_superseded_contracts_upd: `CREATE TRIGGER agent_issues_superseded_contracts_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id
              AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
  agent_issues_autotriage2_ins: `CREATE TRIGGER agent_issues_autotriage2_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open'
BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id,
         CASE WHEN o.owner IS NULL THEN 'AUTOTRIAGE-1' ELSE 'AUTOTRIAGE-2' END,
         'triaged',
         COALESCE(o.owner, 'qnfo-ops'),
         datetime('now', '+120 minutes')
    FROM (SELECT COALESCE(
            (SELECT t.owner FROM analytics_metric_triggers t
              WHERE NEW.title LIKE 'METRIC-TRIGGER-%'
                AND t.id = CAST(substr(NEW.title, 16) AS INTEGER)
                AND t.owner IN (SELECT service FROM service_registry)),
            (SELECT s.service FROM service_registry s
              WHERE instr(COALESCE(NEW.description, ''), 'code-task: repo=qnfo-workers path=') > 0
                AND s.service = substr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), 1,
                                       instr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1))
          ) AS owner) o;
END`,
  triage_close_sync_issue_upd: `CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END`,
  triage_close_sync_issue_ins: `CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END`,
  triage_close_sync_resolved_upd: `CREATE TRIGGER triage_close_sync_resolved_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('resolved','resolved-refuted') BEGIN UPDATE agent_issues SET status='closed', close_channel='auto:triage-resolved-sync', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=NEW.issue_id AND status='open'; END`,
  issue_close_evidence_weak_predicate_upd: `CREATE TRIGGER issue_close_evidence_weak_predicate_upd BEFORE UPDATE OF close_evidence ON issue_triage WHEN NEW.close_evidence IS NOT NULL AND NEW.close_evidence LIKE '%present in%' AND NEW.close_evidence LIKE '%directory listing%' BEGIN SELECT RAISE(ABORT,'CLOSE-EVIDENCE-WEAK-PREDICATE-1: file presence is not defect resolution (issue 1698)'); END`,
  triage_superseded_contracts_upd: `CREATE TRIGGER triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
  triage_superseded_contracts_ins: `CREATE TRIGGER triage_superseded_contracts_ins AFTER INSERT ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
  remediation_probe_semicolon_upd: `CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  remediation_probe_edit_rerun: `CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END`,
  remediation_contracts_cadence_floor_au: `CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  sla_120_guard_contract_upd: `CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END`,
};

// the live table layouts (sqlite_master), reduced to what the suite reads
function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day));
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, owner TEXT);
CREATE TABLE service_registry (service TEXT PRIMARY KEY);`);
  db.exec(OLD_REFILE);
  db.exec(ddl("2026-10-18-agent-issues-reopen-twin-guard.sql", "agent_issues_reopen_open_twin_guard"));
  for (const t of Object.values(LIVE)) db.exec(t);
  return db;
}

// ---- helpers that write the way the live flows do
let nextAuto = 7000;
function addIssue(db, o) {
  const id = o.id || nextAuto++;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'x', 'medium', 'open', ?, ?)")
    .run(id, o.title, o.desc || "", o.source || "qnfo-fleet-control", Date.now(), Date.now());
  return id;
}
function closeIssue(db, id, evidence) { db.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = ? WHERE issue_id = ?").run(evidence, id); }
function refile(db, title, source) {
  return db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, 'filed again', ?, 'x', 'medium', 'open', ?, ?)")
    .run(title, source || "qnfo-fleet-control", Date.now(), Date.now());
}
function addContract(db, id, status, verdict, probe) {
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'qnfo-fleet-control', 1, ?, ?)")
    .run("issue-" + id, id, probe || "SELECT 1 AS expected, 1 AS observed", status, verdict || null);
}
const MON = "monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)";
const tri = (db, id) => one(db, "SELECT triage_state, close_evidence, reopened_count FROM issue_triage WHERE issue_id = ?", id);
const stat = (db, id) => one(db, "SELECT status FROM agent_issues WHERE id = ?", id).status;
const lifeN = (db, id) => one(db, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE issue_id = ?", id).n;
const contract = (db, id) => one(db, "SELECT status, last_verdict, module, verify_probe FROM remediation_contracts WHERE class = ?", "issue-" + id);

// the six pairs (twin, successor, title) and the stale monitoring four (twin, successor, title), real ids and title labels
const PAIRS = [
  [2665, 2244, "METRIC-TRIGGER-371-REMEDY-EFFICACY-30D: Autonomy gap: fleet remedies are not moving their metrics"],
  [1796, 99909, "METRIC-TRIGGER-357-WATCHMAKER-INDEX: Autonomy gap: recurring operations still need a person or a stalled runner"],
  [1834, 99925, "METRIC-TRIGGER-378-CODE-TASK-SUCCESS-RATE-30D: Autonomy gap: the code loop finishes under half of its tasks"],
  [1978, 99927, "METRIC-TRIGGER-388-FIX-HOLD-RATE-30D: Fix durability gap: metric issues are closing but the metrics relapse"],
  [2228, 99934, "METRIC-TRIGGER-3454-OWNER-DISPATCH-7D: Owner dispatch: more than 5 cards in 7 days asked the owner to act"],
  [2875, 2600, "METRIC-TRIGGER-3452-TICK-COMPLETION-24H: Heartbeat gap: under 95% of ten-minute slots in 24h carry a fleet tick"],
];
const STALE_MON = [
  [2167, 99916, "METRIC-TRIGGER-2934-SESSION-DEPENDENT-ISSUES-OPEN: Autonomy-first gap: open issues still wait on a session"],
  [2193, 2971, "METRIC-TRIGGER-3059-STUCK-ITEMS-OVER-SLA: Queue SLA breach: an item is stuck past its SLA (minutes)"],
  [2487, 99943, "METRIC-TRIGGER-5394-RESEARCH-DEFERRED-POOL: Research intake outruns throughput: the deferred pool is above 120"],
  [2816, 99915, "METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: Autonomy gap: an open issue has no owner action"],
];
const T2957 = "METRIC-REGRESSION-1: open_agent_issues";
const CIRCULAR = "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2957) <> 'open' THEN 'ok' ELSE 'stale' END AS observed";

// The live state of 2026-10-19, built the way production built it: with the live (old) issue_refile_reopen.
function liveShape(db, v) {
  v = v || {};
  // 2957: closed as superseded by 1798, refiled 13 h later, reopened by the trigger
  const i2957 = addIssue(db, { id: 2957, title: T2957 });
  addContract(db, 2957, "active", null, CIRCULAR);
  closeIssue(db, 2957, "superseded by 1798 (METRIC-TRIGGER-362-OPEN-AGENT-ISSUES: Autonomy gap: more than 20 open agent issues, open): that issue carries open_agent_issues");
  db.prepare("UPDATE remediation_contracts SET module = 'circular-probe-deprecated' WHERE class = 'issue-2957'").run();
  refile(db, T2957, "qnfo-fleet-control");
  // the four parked METRIC-TRIGGER copies: closed by recovery, refiled, reopened by the trigger, parked as monitoring beside an open successor
  for (const [id, succ, title] of STALE_MON) {
    addIssue(db, { id, title });
    addContract(db, id, "active", null);
    closeIssue(db, id, "TRIGGER-RECOVERY-1 2026-10-16T09:41:18.454Z: the metric no longer breaches since 2026-10-16 08:41:11 (60 min or more)");
    refile(db, title, "qnfo-fleet-control");
    db.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = ? WHERE class = ?").run(MON, "issue-" + id);
    db.prepare("UPDATE agent_issues SET status = 'monitoring' WHERE id = ?").run(id);
    addIssue(db, { id: succ, title });
  }
  // the six parked monitoring twins of an open successor
  for (const [twin, succ, title] of PAIRS) {
    addIssue(db, { id: twin, title });
    addContract(db, twin, "monitoring", MON);
    db.prepare("UPDATE agent_issues SET status = 'monitoring' WHERE id = ?").run(twin);
    addIssue(db, { id: succ, title });
  }
  db.prepare("UPDATE issue_triage SET close_evidence = 'remediation_verifications#125335 pass=1 class=issue-2875 transport=d1-query verified_at=2026-10-18 00:10:18' WHERE issue_id = 2875").run();
  // rows the file must leave alone
  addIssue(db, { id: 5001, title: "plain open issue" });
  addIssue(db, { id: 5002, title: "METRIC-TRIGGER-1-OTHER: a twin that is not on the list" });
  addContract(db, 5002, "monitoring", MON);
  db.prepare("UPDATE agent_issues SET status = 'monitoring' WHERE id = 5002").run();
  addIssue(db, { id: 5003, title: "METRIC-TRIGGER-1-OTHER: a twin that is not on the list" });
  addIssue(db, { id: 5004, title: "a closed issue with a closed triage row" });
  closeIssue(db, 5004, "fixed and verified live");
  if (v.preclose2665) { // another migration (REMEDY-EFFICACY-PER-TRIGGER-1) supersedes 2665 first
    db.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by 2244 (by the other migration): same trigger' WHERE issue_id = 2665").run();
    db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 2665").run();
  }
  if (v.closeSucc99909) closeIssue(db, 99909, "the metric recovered");
  if (v.relabel99925) db.prepare("UPDATE agent_issues SET title = 'METRIC-TRIGGER-999-OTHER: a different trigger' WHERE id = 99925").run();
  // the metric history the 2957 probe reads: a rising open-issue count (recent week 180, week before 130)
  for (let d = 0; d < 14; d++) db.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('open_agent_issues', date('now', ?), ?)").run("-" + d + " days", d < 7 ? 180 : 130);
}
const snapshot = (db) => ({
  agent: all(db, "SELECT id, status FROM agent_issues ORDER BY id"),
  triage: all(db, "SELECT issue_id, triage_state, close_evidence, reopened_count FROM issue_triage ORDER BY issue_id"),
  contracts: all(db, "SELECT class, status, last_verdict, module, verify_probe FROM remediation_contracts ORDER BY class"),
  life: all(db, "SELECT issue_id, event, from_status, to_status, has_evidence FROM issue_lifecycle ORDER BY id"),
});

const STALE_IDS = [2957, 2167, 2193, 2487, 2816];
const CLOSED_SET = "('closed', 'closed-refuted', 'closed-by-classification', 'closed-verified-fixed', 'resolved', 'resolved-refuted', 'wontfix')";
const STALE_SQL = "SELECT COUNT(*) AS n FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN ('open', 'monitoring') AND t.triage_state IN " + CLOSED_SET;
const staleIds = (db) => all(db, "SELECT a.id FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN ('open', 'monitoring') AND t.triage_state IN " + CLOSED_SET + " ORDER BY a.id").map((r) => r.id);

// ================= base: the defect on the pre-fix state =================
const base = build(); liveShape(base);
ok(JSON.stringify(staleIds(base)) === JSON.stringify([2167, 2193, 2487, 2816, 2957]), "base: exactly the five rows (2957 open, 2167/2193/2487/2816 monitoring) read open or monitoring with a closed triage row", staleIds(base));
ok(stat(base, 2957) === "open" && tri(base, 2957).triage_state === "closed" && /^superseded by 1798/.test(tri(base, 2957).close_evidence) && tri(base, 2957).reopened_count === 0, "base: 2957 is open with a closed triage row, the stale 'superseded by 1798' text and reopened_count 0 (the defect, reproduced by the live trigger)", tri(base, 2957));
ok(contract(base, 2957).status === "superseded" && contract(base, 2957).last_verdict === "superseded:closure-superseded", "base: the stale closure left the contract of 2957 superseded (no probe watches the open issue)", contract(base, 2957));
for (const [twin, succ] of PAIRS) ok(stat(base, twin) === "monitoring" && stat(base, succ) === "open", "base: twin " + twin + " is monitoring beside open " + succ);
// the live trigger, replayed: a closed issue refiled inside 24 h is reopened and its triage row stays closed
{
  const t = build(); const id = addIssue(t, { title: "METRIC-REGRESSION-1: some_metric" });
  closeIssue(t, id, "superseded by 1 (x, open): carried there");
  const r = refile(t, "METRIC-REGRESSION-1: some_metric");
  ok(r.changes === 0 && stat(t, id) === "open" && tri(t, id).triage_state === "closed" && tri(t, id).close_evidence !== null, "base: the live issue_refile_reopen ignores the insert, reopens the row and leaves triage_state closed with its closure text", [r.changes, stat(t, id), tri(t, id)]);
}

// ================= with the file =================
const before = snapshot(base);
const detector = (() => { const x = build(); x.exec(real); return one(x, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-refile-reopen-leaves-triage-closed'").verify_probe; })();
ok(one(base, detector).observed === "5" && one(base, detector).expected === "0", "base: the fm detector probe reads 5 on the pre-fix state", one(base, detector));

const db = build(); liveShape(db); db.exec(sql);

// ---- 1. the one-time normalise
ok(JSON.stringify(staleIds(db)) === JSON.stringify([2167, 2193, 2487, 2816]) && one(db, detector).observed === "4", "only the open stale row (2957) is normalised; the four monitoring twins of an open ticket are left to the twin migration, so the detector reads 4 until it has run", [staleIds(db), one(db, detector)]);
for (const id of [2957]) {
  const t = tri(db, id), b = before.triage.find((r) => r.issue_id === id);
  ok(t.triage_state === "triaged" && t.close_evidence === null && t.reopened_count === b.reopened_count + 1, "issue " + id + ": triaged, closure text cleared, reopened_count + 1", [t, b]);
  ok(stat(db, id) === (id === 2957 ? "open" : "monitoring"), "issue " + id + ": status untouched", stat(db, id));
  ok(lifeN(db, id) === before.life.filter((l) => l.issue_id === id).length, "issue " + id + ": no lifecycle row added (nothing changed disposition)");
  const bak = one(db, "SELECT triage_state, close_evidence, reopened_count, agent_status FROM bak_20261019_triage_state_rows WHERE step = 'stale-open' AND issue_id = ?", id);
  ok(bak && bak.triage_state === "closed" && bak.close_evidence === b.close_evidence && bak.reopened_count === b.reopened_count, "issue " + id + ": the old triage row and closure text are in the backup table", bak);
}
ok(one(db, "SELECT COUNT(*) AS n FROM bak_20261019_triage_state_rows WHERE step = 'stale-open'").n === 1, "the backup holds exactly the one stale row this file handles");
for (const id of [2167, 2193, 2487, 2816]) {
  ok(JSON.stringify(tri(db, id)) === JSON.stringify((({ triage_state, close_evidence, reopened_count }) => ({ triage_state, close_evidence, reopened_count }))(before.triage.find((r) => r.issue_id === id))) && tri(db, id).triage_state === "closed", "monitoring twin " + id + ": its closed triage row is left to the twin migration", tri(db, id));
  ok(stat(db, id) === "monitoring" && contract(db, id).status === before.contracts.find((r) => r.class === "issue-" + id).status, "monitoring twin " + id + ": status and contract untouched");
}
// every other row of the fixture: untouched
for (const id of [5001, 5002, 5003, 5004]) ok(JSON.stringify(tri(db, id)) === JSON.stringify(before.triage.find((r) => r.issue_id === id) && (({ triage_state, close_evidence, reopened_count }) => ({ triage_state, close_evidence, reopened_count }))(before.triage.find((r) => r.issue_id === id))), "unrelated issue " + id + " keeps its triage row", tri(db, id));
ok(stat(db, 5004) === "closed" && tri(db, 5004).triage_state === "closed", "a genuinely closed issue keeps its closed triage row");

// ---- 2. the parked monitoring twins are not written by this file
for (const [twin, succ] of PAIRS) {
  ok(stat(db, twin) === "monitoring" && stat(db, succ) === "open", "twin " + twin + " stays monitoring beside open " + succ);
  ok(JSON.stringify(tri(db, twin)) === JSON.stringify(before.triage.find((r) => r.issue_id === twin) && (({ triage_state, close_evidence, reopened_count }) => ({ triage_state, close_evidence, reopened_count }))(before.triage.find((r) => r.issue_id === twin))) && contract(db, twin).status === "monitoring" && lifeN(db, twin) === before.life.filter((l) => l.issue_id === twin).length, "twin " + twin + ": triage row, contract and lifecycle untouched");
}
ok(stat(db, 5002) === "monitoring" && contract(db, 5002).status === "monitoring", "a monitoring twin that is not on the list is left alone");
ok(all(db, "SELECT 1 FROM bak_20261019_triage_state_rows WHERE step <> 'stale-open'").length === 0 && !all(db, "SELECT name FROM sqlite_master WHERE name = 'bak_20261019_triage_state_pairs'").length, "no twin step and no pair table exist any more");
ok(all(db, "SELECT 1 FROM issue_lifecycle WHERE event = 'dispositioned' AND has_evidence = 0").length === 0, "no disposition without evidence anywhere (no silent drop)");
ok(all(db, "SELECT 1 FROM agent_issues WHERE status = 'wontfix'").length === 0, "no wontfix");
ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === before.agent.length, "no issue row added or deleted");

// ---- 3. the contract of 2957
{
  const c = contract(db, 2957);
  ok(c.status === "active" && c.last_verdict === null && c.module === "triage-state-normalise-1" && !/;/.test(c.verify_probe), "the contract of 2957 is active again with a probe of its own (no semicolon for the live semicolon trigger to rewrite)", c);
  const p = one(db, c.verify_probe);
  ok(p.expected === "1" && p.observed === "0", "the 2957 probe fails on a rising open-issue trend (180 against 130), so fixing the triage row cannot close the regression", p);
  const flat = build(); flat.exec("INSERT INTO agent_issues (id, title, status, created_at, updated_at) VALUES (2957, 'x', 'open', 1, 1)");
  for (let d = 0; d < 14; d++) flat.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('open_agent_issues', date('now', ?), 150)").run("-" + d + " days");
  ok(one(flat, c.verify_probe).observed === "1", "the probe passes on a flat trend");
  const thin = build();
  ok(one(thin, c.verify_probe).observed === "unmeasured", "the probe reads unmeasured, not passing, without enough history");
  const bak = one(db, "SELECT status, last_verdict, module, verify_probe FROM bak_20261019_triage_state_contracts WHERE step = 'rearm' AND class = 'issue-2957'");
  ok(bak && bak.status === "superseded" && bak.module === "circular-probe-deprecated" && bak.verify_probe === CIRCULAR, "the old circular contract is in the backup", bak);
}

// ---- 4. registry rows, decision
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'refile-reopen-leaves-triage-closed' AND probe_class = 'fm-refile-reopen-leaves-triage-closed' AND issue_id = 2957").n === 1, "failure mode refile-reopen-leaves-triage-closed is registered with its probe class");
{
  const c = one(db, "SELECT class, verify_transport, status, module, issue_id, expected_cadence_h FROM remediation_contracts WHERE class = 'fm-refile-reopen-leaves-triage-closed'");
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.issue_id === null && c.expected_cadence_h === 1, "the fm- detector contract is d1-query, active, hourly", c);
}
ok(one(db, "SELECT COUNT(*) AS n FROM control_registry WHERE control = 'issue_refile_reopen' AND kind = 'guard' AND disposition = 'keep' AND disposition_state = 'applied'").n === 1, "control_registry names the trigger (the spof-review answer)");
ok(one(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'issue-triage-follows-refile-reopen'").n === 1, "capability_ledger records the capability");
{
  const d = all(db, "SELECT actor, capability_gain, predicted_outcome, reach_gain, surfaces_tested FROM decision_log WHERE instr(action, 'TRIAGE-STATE-NORMALISE-1:') = 1");
  ok(d.length === 1 && d[0].capability_gain && d[0].predicted_outcome && d[0].reach_gain === "none" && d[0].surfaces_tested, "one decision_log row with capability_gain, predicted_outcome, reach_gain and surfaces_tested", d);
}

// ---- 5. the structural fix: the new body is the live body plus one statement
const newSql = one(db, "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'issue_refile_reopen'").sql;
{
  const a = newSql.indexOf("  UPDATE issue_triage"), b = newSql.indexOf("  SELECT RAISE(IGNORE);");
  const added = a >= 0 && b > a ? newSql.slice(a, b) : "";
  ok(a > 0 && b > a && newSql.slice(0, a) + newSql.slice(b) === OLD_REFILE, "the new body equals the live body byte for byte once the added statement is removed");
  ok(/^ {2}UPDATE issue_triage SET reopened_count = COALESCE\(reopened_count, 0\) \+ 1, triage_state = 'triaged', close_evidence = NULL\n/.test(added) && added.split(";").length === 2 && added.trimEnd().endsWith(";"), "the added text is one UPDATE issue_triage statement that resets the triage row like the other reopen writers", added);
  ok(newSql.indexOf("  UPDATE agent_issues SET status = 'open'") < a && b === newSql.indexOf("  SELECT RAISE(IGNORE);") && newSql.trimEnd().endsWith("END"), "the added statement runs after the reopen and before the final RAISE(IGNORE)");
}
ok(one(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'agent_issues'").n === one(base, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'agent_issues'").n, "the number of triggers on agent_issues did not grow (replace in place)");

// refile through the new trigger: the issue comes back with its triage row
function refileCase(closeAs, stateBefore) {
  const t = build(); t.exec(sql);
  const id = addIssue(t, { title: "METRIC-REGRESSION-1: m_" + closeAs });
  if (closeAs === "closed") closeIssue(t, id, "superseded by 1 (x, open): carried there");
  else { // evidence first, then the status, the way a closer without a triage state change does it
    t.prepare("UPDATE issue_triage SET close_evidence = 'done' WHERE issue_id = ?").run(id);
    t.prepare("UPDATE agent_issues SET status = ?, updated_at = ? WHERE id = ?").run(closeAs, Date.now(), id);
  }
  const n0 = one(t, "SELECT COUNT(*) AS n FROM agent_issues").n, l0 = lifeN(t, id);
  const r = refile(t, "METRIC-REGRESSION-1: m_" + closeAs);
  return { t, id, r, n0, l0 };
}
for (const closeAs of ["closed", "resolved", "wontfix"]) {
  const { t, id, r, n0, l0 } = refileCase(closeAs);
  const tr = tri(t, id);
  ok(r.changes === 0 && one(t, "SELECT COUNT(*) AS n FROM agent_issues").n === n0, closeAs + ": the refile insert is still ignored (no duplicate row)", r);
  ok(stat(t, id) === "open" && tr.triage_state === "triaged" && tr.close_evidence === null && tr.reopened_count === 1, closeAs + ": the issue is reopened together with its triage row (triaged, closure text cleared, reopened_count 1)", [stat(t, id), tr]);
  ok(/REOPENED \d{4}-\d\d-\d\dT[\d:]{8}Z by issue_refile_reopen \(DOCTRINE-1\)/.test(one(t, "SELECT description FROM agent_issues WHERE id = ?", id).description) && lifeN(t, id) === l0 + 1 && one(t, "SELECT event FROM issue_lifecycle WHERE issue_id = ? ORDER BY id DESC LIMIT 1", id).event === "reopened", closeAs + ": the REOPENED note and one lifecycle row 'reopened' are written as before");
  ok(staleIds(t).length === 0, closeAs + ": the detector stays at 0 after the refile");
}
{ // the reopened issue closes again on the normal path (evidence is required anew, the cleared text is not reused)
  const { t, id } = refileCase("closed");
  let err = null;
  try { t.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id); } catch (e) { err = String(e.message); }
  ok(err && /close-without-evidence/.test(err), "a reopened issue cannot be closed on the cleared text: issue_close_evidence_required asks for new evidence", err);
  closeIssue(t, id, "fixed again, verified live");
  ok(stat(t, id) === "closed", "it closes through the live path once new evidence is recorded");
}
{ // the open-twin guard skips the reopen: nothing is reset, the open twin keeps its own triage row
  const t = build(); t.exec(sql);
  const closed = addIssue(t, { title: "Same Title" });
  closeIssue(t, closed, "fixed, verified live");
  const twin = addIssue(t, { title: " same title" }); // differs in case and space only: not an exact-title refile, so it is a new open row
  t.prepare("UPDATE issue_triage SET close_evidence = 'carries its own text', reopened_count = 4 WHERE issue_id = ?").run(twin);
  const before2 = [tri(t, closed), tri(t, twin), stat(t, closed), stat(t, twin)];
  const r = refile(t, "Same Title");
  ok(r.changes === 0 && stat(t, closed) === "closed" && JSON.stringify([tri(t, closed), tri(t, twin), stat(t, closed), stat(t, twin)]) === JSON.stringify(before2), "a reopen the open-twin guard skipped changes nothing: the closed row keeps its closure, the open twin keeps its triage row", [tri(t, closed), tri(t, twin)]);
}
{ // a refile older than 24 h does not match the trigger: the old row is untouched and the new issue is triaged normally
  const t = build(); t.exec(sql);
  const old = addIssue(t, { title: "an old title" });
  closeIssue(t, old, "fixed, verified live");
  t.prepare("UPDATE agent_issues SET updated_at = ? WHERE id = ?").run(Date.now() - 25 * 3600 * 1000, old);
  const r = refile(t, "an old title");
  ok(r.changes === 1 && stat(t, old) === "closed" && tri(t, old).triage_state === "closed" && tri(t, old).close_evidence === "fixed, verified live" && tri(t, Number(r.lastInsertRowid)).triage_state === "triaged", "a refile outside the 24 h window is an ordinary new issue; the old closure is untouched", [r.changes, tri(t, old)]);
}
{ // a brand-new title: no reopen, the autotriage trigger still writes the triage row
  const t = build(); t.exec(sql);
  const id = addIssue(t, { title: "a brand new title" });
  ok(tri(t, id).triage_state === "triaged" && tri(t, id).reopened_count === 0 && stat(t, id) === "open", "a new issue is triaged by agent_issues_autotriage2_ins as before");
}

// ---- 6. idempotency: the second application changes nothing and the first backup stays
{
  const snap1 = snapshot(db);
  const counts = (x) => ["bak_20261019_triage_state_rows", "bak_20261019_triage_state_contracts", "bak_20261019_refile_reopen_trigger", "decision_log", "failure_modes", "control_registry", "capability_ledger"].map((n) => one(x, "SELECT COUNT(*) AS n FROM " + n).n);
  const c1 = counts(db), bakTrg1 = one(db, "SELECT sql FROM bak_20261019_refile_reopen_trigger").sql;
  db.exec(sql);
  const snap2 = snapshot(db);
  ok(JSON.stringify(snap1) === JSON.stringify(snap2), "applying the file twice leaves agent_issues, issue_triage, the contracts and the lifecycle exactly as after the first run");
  ok(JSON.stringify(counts(db)) === JSON.stringify(c1), "the second run adds no backup row, no decision, no registry row", [c1, counts(db)]);
  ok(one(db, "SELECT sql FROM bak_20261019_refile_reopen_trigger").sql === OLD_REFILE && bakTrg1 === OLD_REFILE, "the backup still holds the live (old) trigger text after the second run");
  ok(one(db, "SELECT sql FROM sqlite_master WHERE name = 'issue_refile_reopen'").sql === newSql, "the trigger text is unchanged by the second run");
  ok(tri(db, 2957).reopened_count === before.triage.find((r) => r.issue_id === 2957).reopened_count + 1, "reopened_count was added once, not twice");
}

// ---- 7. disjointness from the twin migration: a monitoring row is a twin only while an open ticket of its trigger exists
{
  const s = build(); liveShape(s);
  closeIssue(s, 99916, "the metric recovered"); // 2167 is a monitoring row whose open successor has gone: no twin, so this file normalises it
  const b4 = snapshot(s);
  s.exec(sql);
  ok(stat(s, 2167) === "monitoring" && tri(s, 2167).triage_state === "triaged" && tri(s, 2167).close_evidence === null && tri(s, 2167).reopened_count === b4.triage.find((r) => r.issue_id === 2167).reopened_count + 1, "2167: no open ticket of its trigger is left, so it is not a twin and is normalised here", tri(s, 2167));
  ok(tri(s, 2193).triage_state === "closed" && tri(s, 2487).triage_state === "closed" && tri(s, 2816).triage_state === "closed", "2193, 2487 and 2816 still have an open ticket of their trigger and stay with the twin migration");
  ok(tri(s, 2957).triage_state === "triaged", "2957 is normalised as before");
  const snap1 = JSON.stringify(snapshot(s));
  s.exec(sql);
  ok(JSON.stringify(snapshot(s)) === snap1, "re-applying with a closed successor is stable");
}
{ // a trigger id that is a prefix of another is not the same trigger: 37 is not 371
  const s = build();
  addIssue(s, { id: 6001, title: "METRIC-TRIGGER-37-A: one" }); s.prepare("UPDATE agent_issues SET status = 'monitoring' WHERE id = 6001").run();
  addIssue(s, { id: 6002, title: "METRIC-TRIGGER-371-B: another trigger" });
  s.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'old closure' WHERE issue_id = 6001").run();
  s.exec(sql);
  ok(tri(s, 6001).triage_state === "triaged", "METRIC-TRIGGER-37 is not a twin of METRIC-TRIGGER-371 (the id is compared whole)", tri(s, 6001));
}

// ---- 8. the Rollback line, executed as written
{
  const rb = /^-- Rollback: (.*)$/m.exec(real)[1];
  ok(rb.length > 500 && !rb.includes("\n"), "the Rollback header is one line of SQL");
  const x = build(); liveShape(x); const snapBefore = snapshot(x);
  x.exec(real);
  // the live consumer verifies the re-armed contract and records a failing verdict: the rollback must still work (it restores contracts first)
  x.prepare("UPDATE remediation_contracts SET last_verdict = 'fail', last_attempt_at = datetime('now') WHERE class = 'issue-2957'").run();
  x.exec(rb);
  ok(norm(one(x, "SELECT sql FROM sqlite_master WHERE name = 'issue_refile_reopen'").sql) === norm(OLD_REFILE), "after the Rollback line issue_refile_reopen has the live (old) text again");
  ok(one(x, "SELECT COUNT(*) AS n FROM failure_modes").n === 0 && one(x, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-refile-reopen-leaves-triage-closed'").n === 0 && one(x, "SELECT COUNT(*) AS n FROM control_registry").n === 0 && one(x, "SELECT COUNT(*) AS n FROM capability_ledger").n === 0, "the Rollback line removes the registry rows");
  ok(one(x, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the decision row stays (decision_log is append-only)");
  const after = snapshot(x);
  ok(JSON.stringify(after.agent) === JSON.stringify(snapBefore.agent), "every issue status is restored (2957 open, the twins monitoring)", after.agent.filter((r, i) => r.status !== snapBefore.agent[i].status));
  ok(JSON.stringify(after.triage) === JSON.stringify(snapBefore.triage), "every triage row is restored (state, closure text, reopened_count)", after.triage.filter((r, i) => JSON.stringify(r) !== JSON.stringify(snapBefore.triage[i])));
  ok(JSON.stringify(after.contracts) === JSON.stringify(snapBefore.contracts), "every contract row is restored", after.contracts.filter((r, i) => JSON.stringify(r) !== JSON.stringify(snapBefore.contracts[i])));
  ok(staleIds(x).length === 5 && one(x, detector).observed === "5", "the pre-fix state is back: the detector probe reads 5 again");
  // the pre-fix defect is back too: a refile leaves the triage row closed
  const id = addIssue(x, { title: "METRIC-REGRESSION-1: after_rollback" });
  closeIssue(x, id, "x"); refile(x, "METRIC-REGRESSION-1: after_rollback");
  ok(tri(x, id).triage_state === "closed" && stat(x, id) === "open", "after the Rollback line the refile leaves the triage row closed again (the old behaviour)");
}

// ---- 9. the file's shape
const header = real.split("\n").filter((l) => l.startsWith("--")).join("\n");
const body = real.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(/^-- APPLY-BY: ci$/m.test(real) && /^-- DB: qnfo-audit$/m.test(real) && /^-- BACKUP: bak_20261019_refile_reopen_trigger$/m.test(real), "headers: APPLY-BY ci, DB qnfo-audit, BACKUP names the trigger backup");
ok(body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261019_refile_reopen_trigger AS") >= 0 && body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261019_refile_reopen_trigger AS") < body.indexOf("DROP TRIGGER IF EXISTS issue_refile_reopen;"), "the BACKUP table is created before the first destructive statement");
ok(!/\bDELETE\s+FROM\b/i.test(body) && (body.match(/\bDROP\s+TRIGGER\b/gi) || []).length === 1 && (body.match(/\bCREATE\s+TRIGGER\b/gi) || []).length === 1, "the file deletes no row and replaces exactly one trigger");
ok(!/(UPDATE|DELETE\s+FROM)\s+(issue_lifecycle|decision_log)\b/i.test(body), "the file never updates the append-only tables");
ok(!/wontfix'\s*,?\s*updated_at|status\s*=\s*'wontfix'/i.test(body), "the file never sets wontfix");
ok(!/claude\.ai|anthropic\.com/i.test(real), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
ok(!/(^|[^A-Za-z0-9&])#\d+/.test(real), "no bare #123 reference");
ok(/^-- spof-review: .{12,}/m.test(real), "a spof-review answer is in the header (SPOF-REVIEW-GATE-1)");
ok(!/\bLIKE\s+'[^']{51,}'/i.test(body), "no LIKE pattern over 50 bytes (D1 rejects it)");

// ---- 10. trigger depth: the live agent_issues graph as a model (distinct triggers on a path; recursive triggers are off on D1)
// [name, table, event, UPDATE OF columns or null, writes] -- the writes of each trigger read from its body in sqlite_master on 2026-10-19
const U = (t, ...c) => ({ table: t, event: "UPDATE", cols: c.length ? c : null });
const I = (t) => ({ table: t, event: "INSERT" });
const RC_COLS = ["status", "last_verdict", "last_attempt_at", "verify_transport", "verify_probe", "module", "attempts", "next_due_at", "expected_cadence_h", "max_attempts", "precondition", "action"];
const MODEL = [
  ["agent_issues_open_dup_annotate", "agent_issues", "INSERT", null, [I("agent_issue_refiles"), U("agent_issue_refiles", "refiles", "last_at", "last_source")]],
  ["issue_close_evidence_required_ins", "agent_issues", "INSERT", null, []],
  ["agent_issues_autotriage2_ins", "agent_issues", "INSERT", null, [I("issue_triage")]],
  ["agent_issues_birth_contract_ins", "agent_issues", "INSERT", null, [I("remediation_contracts")]],
  ["agent_issues_predicate_default_ins", "agent_issues", "INSERT", null, [U("agent_issues", "predicate_id")]],
  ["agent_issues_directive_newline_ai", "agent_issues", "INSERT", null, [U("agent_issues", "description")]],
  ["agent_issues_ts_norm_ins", "agent_issues", "INSERT", null, [U("agent_issues", "created_at", "updated_at")]],
  ["agent_issues_evidence_annotate_ai", "agent_issues", "INSERT", null, [U("agent_issues", "description")]],
  ["tool_error_triage_mark_filed_ins", "agent_issues", "INSERT", null, [U("tool_error_triage", "filed")]],
  ["tool_error_triage_mark_filed_rate_ins", "agent_issues", "INSERT", null, [U("tool_error_triage", "filed")]],
  ["issue_lifecycle_ai", "agent_issues", "INSERT", null, [I("issue_lifecycle")]],
  ["agent_issues_code_probe_upd", "agent_issues", "UPDATE", ["description"], [I("remediation_contracts"), U("remediation_contracts", ...RC_COLS)]],
  ["agent_issues_runtime_probe_upd", "agent_issues", "UPDATE", ["description"], [I("remediation_contracts"), U("remediation_contracts", ...RC_COLS)]],
  ["agent_issues_recheck_count_upd", "agent_issues", "UPDATE", ["updated_at"], [U("agent_issues", "recheck_count")]],
  ["agent_issues_superseded_contracts_upd", "agent_issues", "UPDATE", ["status"], [U("remediation_contracts", "status", "last_verdict", "last_attempt_at")]],
  ["agent_issues_ts_norm_upd", "agent_issues", "UPDATE", ["created_at", "updated_at"], [U("agent_issues", "created_at", "updated_at")]],
  ["issue_close_evidence_required", "agent_issues", "UPDATE", ["status"], []],
  ["issue_lifecycle_au", "agent_issues", "UPDATE", ["status"], [I("issue_lifecycle")]],
  ["owner_request_requires_card", "agent_issues", "UPDATE", ["status"], [I("human_actions")]],
  ["agent_issues_reopen_open_twin_guard", "agent_issues", "UPDATE", ["status"], []],
  ["issue_lifecycle_bd", "agent_issues", "DELETE", null, [I("agent_issues_tombstone"), I("issue_lifecycle")]],
  ["issue_close_evidence_weak_predicate_ins", "issue_triage", "INSERT", null, []],
  ["triage_close_sync_issue_ins", "issue_triage", "INSERT", null, [U("agent_issues", "status", "updated_at")]],
  ["triage_superseded_contracts_ins", "issue_triage", "INSERT", null, [U("remediation_contracts", "status", "last_verdict", "last_attempt_at")]],
  ["issue_close_evidence_weak_predicate_upd", "issue_triage", "UPDATE", ["close_evidence"], []],
  ["triage_close_sync_issue_upd", "issue_triage", "UPDATE", ["triage_state"], [U("agent_issues", "status", "updated_at")]],
  ["triage_close_sync_resolved_upd", "issue_triage", "UPDATE", ["triage_state"], [U("agent_issues", "status", "close_channel", "updated_at")]],
  ["triage_superseded_contracts_upd", "issue_triage", "UPDATE", ["triage_state", "close_evidence"], [U("remediation_contracts", "status", "last_verdict", "last_attempt_at")]],
  ["remediation_probe_semicolon_ins", "remediation_contracts", "INSERT", null, [U("remediation_contracts", "verify_probe")]],
  ["remediation_contracts_cadence_1h_ai", "remediation_contracts", "INSERT", null, [U("remediation_contracts", "expected_cadence_h")]],
  ["remediation_contracts_cadence_floor_ai", "remediation_contracts", "INSERT", null, [U("remediation_contracts", "expected_cadence_h")]],
  ["sla_120_guard_contract_ins", "remediation_contracts", "INSERT", null, [U("remediation_contracts", "expected_cadence_h")]],
  ["contract_probe_templates_v1", "remediation_contracts", "INSERT", null, [U("remediation_contracts", ...RC_COLS)]],
  ["contract_probe_templates_loop_merged", "remediation_contracts", "INSERT", null, [U("remediation_contracts", ...RC_COLS)]],
  ["contract_probe_templates_v3_generic", "remediation_contracts", "INSERT", null, [U("remediation_contracts", ...RC_COLS)]],
  ["remediation_probe_semicolon_upd", "remediation_contracts", "UPDATE", ["verify_probe", "verify_transport"], [U("remediation_contracts", "verify_probe")]],
  ["remediation_probe_edit_rerun", "remediation_contracts", "UPDATE", ["verify_probe", "verify_transport"], [U("remediation_contracts", "next_due_at")]],
  ["remediation_contracts_cadence_floor_au", "remediation_contracts", "UPDATE", ["expected_cadence_h", "status"], [U("remediation_contracts", "expected_cadence_h")]],
  ["sla_120_guard_contract_upd", "remediation_contracts", "UPDATE", ["expected_cadence_h", "status"], [U("remediation_contracts", "expected_cadence_h")]],
  ["human_actions_default_adopt_ai", "human_actions", "INSERT", null, [U("human_actions", "status", "resolved_at", "updated_at", "resolution"), I("decision_log")]],
  ["human_actions_autonomy_first_ai", "human_actions", "INSERT", null, [I("autonomy_reroute_queue"), U("human_actions", "status", "resolved_at", "updated_at", "resolution")]],
  ["human_actions_default_approve_ai", "human_actions", "INSERT", null, [I("autonomy_reroute_queue"), U("human_actions", "status", "resolved_at", "updated_at", "default_in_effect", "resolution"), I("decision_log")]],
  ["human_actions_no_claude_upd", "human_actions", "UPDATE", ["action", "why", "default_in_effect", "title", "url"], []],
  ["decision_predictions_parse", "decision_log", "INSERT", null, [I("decision_predictions")]],
  ["tool_error_triage_secret_guard_ins", "tool_error_triage", "INSERT", null, [U("tool_error_triage", "err_head")]],
  ["tool_error_triage_secret_guard_upd", "tool_error_triage", "UPDATE", ["err_head"], [U("tool_error_triage", "err_head")]],
].map(([name, table, event, of, writes]) => ({ name, table, event, of, writes }));

// the writes of a trigger parsed from its own text (used for the old and the new issue_refile_reopen)
function writesOf(triggerSql) {
  const b = triggerSql.indexOf("BEGIN"), e = triggerSql.lastIndexOf("END");
  const stmts = []; let cur = "", q = false;
  for (const ch of triggerSql.slice(b + 5, e)) { if (ch === "'") q = !q; if (ch === ";" && !q) { stmts.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) stmts.push(cur.trim());
  const w = [];
  for (const s of stmts) {
    let m;
    if ((m = /^INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)/i.exec(s))) w.push(I(m[1]));
    else if ((m = /^UPDATE\s+(\w+)\s+SET\s+/i.exec(s))) {
      const rest = s.slice(m[0].length), cols = []; let depth = 0, qq = false, piece = "";
      const flush = () => { const c = /^\s*(\w+)\s*=/.exec(piece); if (c) cols.push(c[1]); piece = ""; };
      for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === "'") qq = !qq;
        if (!qq) {
          if (ch === "(") depth++; else if (ch === ")") depth--;
          else if (depth === 0 && ch === ",") { flush(); continue; }
          else if (depth === 0 && /\sWHERE\s/i.test(rest.slice(i - 1, i + 7)) && /\s/.test(rest[i - 1]) && rest.slice(i, i + 5).toUpperCase() === "WHERE") break;
        }
        piece += ch;
      }
      flush(); w.push(U(m[1], ...cols));
    } else if ((m = /^DELETE\s+FROM\s+(\w+)/i.exec(s))) w.push({ table: m[1], event: "DELETE" });
  }
  return w;
}
function depth(model, table, event, cols, path) {
  path = path || []; let best = 0;
  for (const t of model) {
    if (t.table !== table || t.event !== event || path.includes(t.name)) continue;
    if (event === "UPDATE" && t.of && cols && !t.of.some((c) => cols.includes(c))) continue;
    let d = 1;
    for (const w of t.writes) d = Math.max(d, 1 + depth(model, w.table, w.event, w.cols, path.concat(t.name)));
    best = Math.max(best, d);
  }
  return best;
}
const refileModel = (text) => ({ name: "issue_refile_reopen", table: "agent_issues", event: "INSERT", of: null, writes: writesOf(text) });
const wOld = refileModel(OLD_REFILE).writes, wNew = refileModel(newSql).writes;
ok(wOld.length === 1 && wOld[0].table === "agent_issues" && wOld[0].cols.join() === "status,updated_at,description", "model: the old trigger writes agent_issues (status, updated_at, description) only", wOld);
ok(wNew.length === 2 && wNew[1].table === "issue_triage" && wNew[1].cols.join() === "reopened_count,triage_state,close_evidence", "model: the new trigger adds one write to issue_triage (reopened_count, triage_state, close_evidence)", wNew);
{
  const mOld = MODEL.concat(refileModel(OLD_REFILE)), mNew = MODEL.concat(refileModel(newSql));
  const roots = [...new Set(MODEL.map((t) => t.table + "|" + t.event))].map((r) => r.split("|"));
  const diffs = roots.filter(([t, e]) => depth(mOld, t, e) !== depth(mNew, t, e));
  const insOld = depth(mOld, "agent_issues", "INSERT"), insNew = depth(mNew, "agent_issues", "INSERT");
  ok(diffs.length === 0, "model: no write root (table, event) gets a deeper trigger chain with the new body", diffs.map(([t, e]) => [t, e, depth(mOld, t, e), depth(mNew, t, e)]));
  ok(insOld === insNew && insNew <= 10, "model: the deepest chain through INSERT agent_issues is " + insOld + " with the old body and " + insNew + " with the new one (limit 10)", [insOld, insNew]);
  // the new refile chain against the standing chain that has the same shape: AFTER INSERT autotriage -> INSERT issue_triage -> sync -> UPDATE agent_issues
  const own = (m, name) => { const t = m.find((x) => x.name === name); let d = 1; for (const w of t.writes) d = Math.max(d, 1 + depth(m, w.table, w.event, w.cols, [name])); return d; };
  const dRefileOld = own(mOld, "issue_refile_reopen"), dRefileNew = own(mNew, "issue_refile_reopen"), dAuto = own(mNew, "agent_issues_autotriage2_ins");
  // the added statement on its own: level 1 (the trigger) + the chain below UPDATE issue_triage
  const dAdded = 1 + depth(mNew, "issue_triage", "UPDATE", wNew[1].cols, ["issue_refile_reopen"]);
  ok(dRefileNew === dRefileOld, "model: the whole issue_refile_reopen chain is as deep with the added statement (" + dRefileNew + ") as without it (" + dRefileOld + ")", [dRefileOld, dRefileNew]);
  ok(dAdded === dAuto, "model: the added statement's chain (" + dAdded + ": refile -> UPDATE issue_triage -> sync -> UPDATE agent_issues) is exactly as deep as the standing agent_issues_autotriage2_ins chain (" + dAuto + ": INSERT issue_triage -> sync -> UPDATE agent_issues)", [dAdded, dAuto]);
  ok(dRefileNew <= Math.max(...MODEL.filter((t) => t.table === "agent_issues" && t.event === "INSERT").map((t) => own(mNew, t.name))), "model: and no deeper than the deepest standing INSERT trigger on agent_issues");
  console.log("trigger-depth model: INSERT agent_issues " + insOld + " -> " + insNew + "; refile chain " + dRefileOld + " -> " + dRefileNew + "; added statement " + dAdded + "; autotriage chain " + dAuto);
}

console.log((neutralised ? "NEUTRALISED " : "") + "issue-triage-normalise: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
