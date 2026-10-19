// REOPEN-LIVE-PATH-1 offline suite: applies 2026-10-19-reopen-live-path.sql on SQLite to a fixture of the live qnfo-audit shapes (agent_issues with
// the triggers that reopen, birth and close an issue, remediation_contracts with its birth templates and guards, issue_lifecycle, issue_triage),
// read from sqlite_master on 2026-10-19 at 18:1xZ. Measured then: 14 open issues with no contract in a live status (9 at 17:26Z, 20 at 19:45Z): six
// were reopened after the 2026-10-18 supersede sweep, three hold a vacuous probe. Proves, each against the pre-change state first:
//   1. the defect: an issue whose contract the sweep superseded stays without a live contract after it is reopened, by UPDATE and by the
//      INSERT path (issue_refile_reopen ends in RAISE(IGNORE) and reopens the old row by an UPDATE of its own);
//   2. the trigger: revive (superseded:contract-on-closed-issue, closed) and park (circular loop-owned probe), each ending with exactly one live
//      contract, attempts reset; and the case the review made explicit, NO PLACEHOLDER: an issue whose retired contract no probe can judge
//      (probe-unusable, closure-observing, any other retired contract, no contract row) keeps exactly what it had, so the older measures
//      (fm-open-issue-no-doer, issues_without_next_action) keep counting it until a probe is written;
//   3. what it must not do: fire on a close, an insert or an open-to-open update, touch an issue that already has a live contract (holding,
//      monitoring, escalated), touch any other issue, write any table but remediation_contracts, file an issue (D1's trigger depth);
//   4. the live sweeps (red-drain steps 0, 1, 2, 6 and 7) leave the revived and parked contracts as they are, and leave an unjudgeable issue's
//      retired contract superseded; the spec's escalated:probe-needed would not survive (step 6 re-arms it, the vacuous probe is then
//      superseded again by step 0);
//   5. the backfill is set-based (by state, never by an id list): every open issue whose retired contract can be judged ends with exactly one
//      live contract, the audit's and the ones that appeared after the audit read alike, and the end state is the one the trigger gives the
//      same issue; no placeholder row is made for an issue; four PROBE-NEEDED-1 issues exist once (also after a second apply), each with a
//      closing probe that is a measurement of the target; a closed issue and an issue with a live contract do not move; the backup table holds
//      the pre-state of exactly the rows the backfill can change;
//   6. the effect on the older measures: fm-open-issue-no-doer and issues_without_next_action lose exactly the revived and parked issues
//      and no issue through a constant; the 2954 closing probe and fm-reopen-without-live-path read what they claim: no live contract after
//      60 minutes (T1), a long deferral (T2, the probe of 2954 only), and the two false counts of the old probe;
//   7. REOPEN-LIVE-PATH-2 and REOPEN-LIVE-PATH-3 are filed once with probes that measure their own definition of done. REOPEN-LIVE-PATH-2 maps only the
//      labels whose loop is verified to close its own issue (chaos-drill, fleet-journeys): cf-model-eval and the [ai-cal] rows have no verified closer, so
//      they are in neither its mapping nor its probe, and the issue says they need a closer or a PROBE-NEEDED-1 issue first. REOPEN-LIVE-PATH-3 names its
//      order against REOPEN-LIVE-PATH-2 and its skips, and the skip rule it states is run on a fixture of loop-filed orphans (nothing spurious is filed
//      for a verified loop's issue, an issue with no closer is);
//   8. DOCTRINE-1: the control_registry row loop-owned-contract-park gets the new park path in its location and evidence, once, with reviewed_at set, and the
//      Rollback takes the text out again; REOPEN-LIVE-PATH-3 requires its switch and bounds to be registered in the same PR;
//   9. a second apply changes nothing; the Rollback header runs and restores; the file passes scripts/apply_migrations.py --check.
// Run: node migrations/reopen-live-path.test.mjs     (REOPEN_LIVE_PATH_SQL=<file> runs the same checks against another file; with a copy of the
// migration that lacks the trigger, the checks of 1 to 3 and 5 fail, which is how the suite was shown to fail before the change)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const MIG_PATH = process.env.REOPEN_LIVE_PATH_SQL ? resolve(process.env.REOPEN_LIVE_PATH_SQL) : fileURLToPath(new URL("./2026-10-19-reopen-live-path.sql", import.meta.url));
const mig = readFileSync(MIG_PATH, "utf8");
const loopOwned = readFileSync(new URL("./2026-10-19-loop-owned-contract-monitoring.sql", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const all = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e && e.message); } };
const hoursAgo = (h) => Date.now() - Math.round(h * 3600e3);
const isoAgo = (min) => new Date(Date.now() - min * 60e3).toISOString().replace(/\.\d+Z$/, "Z");

const LIVE = ["active", "holding", "monitoring", "escalated"];
const LV_LOOP = "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)";
const NINE = [2047, 2215, 2455, 2522, 2655, 2695, 2832, 100140, 100151];
// open issues in the same state that the audit read did not name: two reopened after it (revive), 2925 (probe-unusable) and 100247 (born 10 minutes ago)
const EXTRA = [2450, 2607, 2925, 100247];
// two more fixture issues: one with no contract row at all, one with two contracts the closure retired
const ROWLESS = 3001, TWOSWEPT = 3002;
const SET = NINE.concat(EXTRA, [ROWLESS, TWOSWEPT]);
const NOLIVE = "SELECT a.id FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated')) ORDER BY a.id";
const OLD_2954_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c WHERE c.status='active' AND c.last_verdict LIKE 'deferred%' AND c.ts<datetime('now','-7 days') AND NOT EXISTS (SELECT 1 FROM agent_issues i WHERE i.title='VERIFICATION-DEFERRED-7D-1: '||c.class)) AS TEXT) AS observed";

// ---- live shapes (qnfo-audit sqlite_master, 2026-10-19 18:1xZ) -----------------------------------------------------------------------
const DDL = `
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE agent_issue_refiles (issue_id INTEGER PRIMARY KEY, refiles INTEGER NOT NULL DEFAULT 0, first_at TEXT, last_at TEXT, last_source TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE issue_source_hosts (source TEXT PRIMARY KEY, host TEXT NOT NULL, note TEXT, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
`;
// the registered hold as live on 2026-10-19 (control_registry, read from qnfo-audit): the row this file names a second producer on
const PARK_LOC = "D1 trigger contract_probe_templates_loop_merged (contract born monitoring), red-drain last step and the PARKED-REARM-1 carve-out, detector fm-parked-contract-unprobed";
const PARK_EVIDENCE = "Reason and expiry recorded 2026-10-19: 27 active circular contracts on open issues at 12:26Z (30 at 14:5xZ), 24 reading fail, blocked close-while-contract-fails for 2694, 2826, 2880 and 2881. The park ends when the issue closes. Replaces an active contract that could never pass while the issue was open. Issue age, issues_open_over_120m and the 120-minute escalation still report the issue.";
const PARK_REVIEWED = "2026-10-19T18:00:34.187Z";

// remediation_contracts triggers other than the two birth templates this suite takes from the main migration file, in live creation order
const RC_TRIGGERS = [
  `CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts
WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_floor_ai AFTER INSERT ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER sla_120_guard_contract_ins AFTER INSERT ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END`,
  `CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END`,
];
// the two birth templates as live after migrations/2026-10-19-loop-owned-contract-monitoring.sql (merged to main and applied ok 16:03Z)
const LOOP_MERGED = /^CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT[\s\S]*?\nEND;/m.exec(loopOwned)[0].slice(0, -1);
const V3_GENERIC = /^CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT[\s\S]*?\nEND;/m.exec(loopOwned)[0].slice(0, -1);
const AI_TRIGGERS = [
  `CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END`,
  `CREATE TRIGGER agent_issues_reopen_open_twin_guard
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status = 'open'
  AND COALESCE(OLD.status, '') <> 'open'
  AND EXISTS (SELECT 1 FROM agent_issues o
               WHERE o.id <> NEW.id
                 AND o.status = 'open'
                 AND lower(trim(o.title)) = lower(trim(NEW.title)))
BEGIN
  SELECT RAISE(IGNORE);
END`,
  `CREATE TRIGGER issue_lifecycle_ai AFTER INSERT ON agent_issues
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, to_status, has_evidence) VALUES (NEW.id, 'opened', NEW.status, NULL);
END`,
  `CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END`,
  `CREATE TRIGGER agent_issues_open_dup_annotate BEFORE INSERT ON agent_issues
WHEN COALESCE(NEW.status, 'open') = 'open'
  AND EXISTS (SELECT 1 FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)))
BEGIN
  INSERT OR IGNORE INTO agent_issue_refiles (issue_id, refiles, first_at)
    SELECT x.id, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM agent_issues x
    WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)) ORDER BY x.id LIMIT 1;
  UPDATE agent_issue_refiles SET refiles = refiles + 1, last_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_source = substr(COALESCE(NEW.source, '?'), 1, 200)
  WHERE issue_id = (SELECT x.id FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title))
                    ORDER BY x.id LIMIT 1);
  SELECT RAISE(IGNORE);
END`,
  `CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1): the same title was filed again within 24 h of the close, by ' || COALESCE(NEW.source, '?') || '.'
  WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
    AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT r.id FROM agent_issues r WHERE r.title = NEW.title AND r.status = 'open'
    AND instr(COALESCE(r.description, ''), 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1)') > 0);
  SELECT RAISE(IGNORE);
END`,
  `CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END`,
  `CREATE TRIGGER agent_issues_superseded_contracts_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id
              AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
];

// red-drain steps 0, 1, 2, 6 and 7 exactly as live in fleet_tasks on 2026-10-19 18:1xZ (the repository export docs/fleet-tasks-canonical.json lags them)
const RED_DRAIN = {
  0: `UPDATE remediation_contracts SET status='superseded',
        last_verdict='superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)',
        last_attempt_at=datetime('now')
      WHERE status IN ('active','holding')
        AND (verify_probe LIKE '%needs-machine-probe%' OR COALESCE(last_verdict,'') IN ('vacuous-probe-result','probe-not-machine-executable','probe-error'))
        AND substr(class,1,3) <> 'fm-' AND substr(class,1,7) <> 'belief-'`,
  1: `UPDATE remediation_contracts SET status='monitoring',
        last_verdict='monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)',
        last_attempt_at=datetime('now')
      WHERE status IN ('active','holding')
        AND (verify_probe LIKE '%metric_registry%' OR verify_probe LIKE '%v_metric_trigger_state%' OR verify_probe LIKE '%v_metric%')
        AND substr(class,1,3) <> 'fm-' AND substr(class,1,7) <> 'belief-'
        AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')`,
  2: `UPDATE remediation_contracts SET status='escalated',
        last_verdict='escalated:over-retried (probe re-ran past 5x max_attempts with no code task in flight; parked for RED-DRAIN while the issue stays open)',
        last_attempt_at=datetime('now')
      WHERE status IN ('active','holding') AND last_verdict='fail' AND attempts > 5*COALESCE(max_attempts,3)
        AND substr(class,1,3) <> 'fm-' AND substr(class,1,7) <> 'belief-'
        AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN ('closed','superseded') AND ct.goal LIKE '%#' || remediation_contracts.issue_id || ' %')
        AND NOT (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.class <> remediation_contracts.class AND c2.status IN ('active','holding')))
        /* PARKED-REARM-2 */`,
  6: `UPDATE remediation_contracts SET status='active', next_due_at=datetime('now'),
        last_verdict='rearmed: PARKED-REARM-1 (was ' || substr(COALESCE(last_verdict,'?'),1,60) || '; an open issue and a standing detector keep an hourly probe)'
      WHERE status IN ('escalated','monitoring')
        AND NOT (COALESCE(module, '') LIKE 'probe-template-v2%-loop' AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0) /* LOOP-OWNED-CONTRACT-MONITORING-1 */
        AND (substr(class,1,3) = 'fm-' OR substr(class,1,7) = 'belief-'
             OR (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.status IN ('active','holding'))
                 AND COALESCE((SELECT replace(substr(MAX(v.verified_at),1,19),'T',' ') FROM remediation_verifications v WHERE v.class = remediation_contracts.class), '1970-01-01 00:00:00') <= datetime('now','-50 minutes')))`,
  7: `UPDATE remediation_contracts SET status = 'monitoring', last_verdict = '${LV_LOOP}', next_due_at = NULL WHERE status IN ('active', 'holding') AND issue_id IS NOT NULL
       AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0
       AND COALESCE(module, '') LIKE 'probe-template-v2%-loop'
       AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open') /* LOOP-OWNED-CONTRACT-MONITORING-1 */`,
};
const REMEDIATION_VERIFICATIONS = "CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT)";
const runRedDrain = (db, steps) => { for (const s of steps) db.exec(RED_DRAIN[s]); };

function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  db.exec(REMEDIATION_VERIFICATIONS);
  for (const t of RC_TRIGGERS) db.exec(t);
  db.exec(LOOP_MERGED);   // newer than the guards, older than v3_generic, as live
  db.exec(V3_GENERIC);    // newest rc trigger, so it fires first
  for (const t of AI_TRIGGERS) db.exec(t);
  db.prepare("INSERT INTO service_registry (service, state) VALUES ('qnfo-fleet-control', 'live')").run();
  db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES ('loop-owned-contract-park', ?, 'hold', 'a loop-filed issue whose birth contract reads the status of its own issue as a failing verdict', 0, 'replace', 'applied', 'the hourly red-drain park and the detector fm-loop-owned-contract-circular', ?, ?, NULL, ?)").run(PARK_LOC, PARK_REVIEWED, PARK_EVIDENCE, PARK_REVIEWED);
  return db;
}

// ---- helpers ------------------------------------------------------------------------------------------------------------------------
const nextId = { n: 5000 };
function issue(db, title, o = {}) {
  const id = o.id || ++nextId.n;
  const t = hoursAgo(o.ageH == null ? 3 : o.ageH);
  db.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)").run(id, title, o.desc || "", o.source || "session-test", t, t);
  return id;
}
const contracts = (db, id) => all(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", id);
const liveOf = (db, id) => all(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? AND status IN ('active','holding','monitoring','escalated')", id);
const setC = (db, cls, patch) => {
  const keys = Object.keys(patch);
  db.prepare("UPDATE remediation_contracts SET " + keys.map((k) => k + " = ?").join(", ") + " WHERE class = ?").run(...keys.map((k) => patch[k]), cls);
};
const V1H = (n) => "SELECT '1' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = " + n + ") = 0 THEN '1' ELSE '0' END AS observed";
const SWEPT = "superseded:contract-on-closed-issue (issue already closed/resolved/wontfix; no doer, no definition of done)";
const circularProbe = (id) => "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = " + id + ") <> 'open' THEN 'ok' WHEN (SELECT created_at FROM agent_issues WHERE id = " + id + ") > (CAST(strftime('%s', 'now') AS INTEGER) - 172800) * 1000 THEN 'pending: filed by x, which owns it for 48h' ELSE 'stale: the filing loop x did not close it within 48h' END AS observed";
const closureObserving = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const close = (db, id) => {
  db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'fleet', 'x', 'live read shows the condition gone') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence").run(id);
  return throws(() => db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id));
};
const reopen = (db, id) => throws(() => db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = ?").run(id));
const near = (v, minutesAgo = 0, tolMin = 2) => typeof v === "string" && Math.abs(Date.parse(v.replace(" ", "T") + "Z") - (Date.now() - minutesAgo * 60e3)) < tolMin * 60e3;
// the measured-pending shape the consumer and the D1 relapse trigger still count as a failure (scripts/remediation_consumer.py is_measured_pending)
const measuredPending = (o) => { const low = String(o).toLowerCase(); return ["ceiling", "target", "threshold", "limit", "fewer than", "more than"].some((w) => low.includes(w)) || [" <= ", " >= ", " < ", " > "].some((op) => (" " + low + " ").includes(op)); };
const snap = (db, q, ...p) => JSON.stringify(all(db, q, ...p));
const triggerSql = (db, name) => (one(db, "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", name) || {}).sql;
const TRIG = "agent_issues_reopen_live_path_upd";

// ---- 0. static facts about the file ---------------------------------------------------------------------------------------------------
{
  ok(!/#\d/.test(mig) && !/claude\.ai|anthropic\.com/i.test(mig), "no bare #123 reference and no claude.ai link in the file");
  ok(!/\[skip ci\]|\[ci skip\]|skip-ci/i.test(mig), "no skip-CI token in the file");
  const hdr = mig.split("\n").filter((l) => l.startsWith("--"));
  ok(hdr.some((l) => l === "-- APPLY-BY: ci") && hdr.some((l) => l === "-- DB: qnfo-audit") && hdr.filter((l) => /^-- Rollback: /.test(l)).length === 1 && hdr.some((l) => l === "-- BACKUP: bak_20261019_reopen_live_path"), "the header opts in, names the database, one Rollback line and the backup table");
  // the backfill and the backup select by state, never by an id list (a review found ten same-state issues outside the audit's nine, and every
  // issue reopened between the audit and the apply would have been a new orphan)
  const body0 = mig.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  ok(!/\b(?:issue_id|[a-z]\.id|id)\s+IN\s*\(\s*\d/i.test(body0), "no explicit id list anywhere in the statements: the backfill and the backup are set-based", body0.match(/\b(?:issue_id|[a-z]\.id|id)\s+IN\s*\(\s*\d[^)]*\)/i));
  ok(body0.split(" WHERE issue_id IN (SELECT o.id FROM agent_issues o WHERE o.status = 'open')\n").length === 3, "the two backfill UPDATEs (revive, park) select by the open status of their issue");
  // NO PLACEHOLDER (review of 2026-10-19): no statement makes a contract row for an issue, and no contract is given a probe that is a constant reading pending
  ok(!/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+remediation_contracts\s*\([^)]*\)\s*SELECT/i.test(body0), "no INSERT .. SELECT into remediation_contracts: no row is made for an issue (no placeholder)");
  ok(!/has no machine-executable probe yet/.test(mig) && !/a placeholder that reads pending/.test(body0), "no statement writes a placeholder probe (a constant that reads pending)");
  ok(/CREATE TABLE IF NOT EXISTS bak_20261019_reopen_live_path AS\n\s+SELECT \* FROM remediation_contracts\n\s+WHERE class = 'issue-2954'\n\s+OR issue_id IN \(SELECT a\.id FROM agent_issues a WHERE a\.status = 'open'\n\s+AND NOT EXISTS \(SELECT 1 FROM remediation_contracts c WHERE c\.issue_id = a\.id AND c\.status IN \('active', 'holding', 'monitoring', 'escalated'\)\)\);/.test(body0), "the backup holds the rows of every open issue with no live contract, read before any change");
  ok(body0.indexOf("CREATE TABLE IF NOT EXISTS bak_20261019_reopen_live_path") < body0.indexOf("CREATE TRIGGER IF NOT EXISTS agent_issues_reopen_live_path_upd") && body0.indexOf("CREATE TRIGGER IF NOT EXISTS agent_issues_reopen_live_path_upd") < body0.indexOf("UPDATE remediation_contracts\n   SET status = 'active', last_verdict = NULL"), "the backup is taken before the trigger and the first statement that changes a contract");
  const bm = /^CREATE TRIGGER IF NOT EXISTS agent_issues_reopen_live_path_upd[\s\S]*?\nEND;/m.exec(mig);
  ok(!!bm, "the file creates the trigger agent_issues_reopen_live_path_upd");
  const body = bm ? bm[0] : "";
  const targets = [...new Set([...body.slice(body.indexOf("\nBEGIN\n")).matchAll(/(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE(?:\s+OR\s+\w+)?)\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))];
  ok(targets.length === 1 && targets[0] === "remediation_contracts", "the trigger writes only remediation_contracts (no INSERT into agent_issues: D1 refuses that shape in a deep trigger chain)", targets);
  const bodyStmts = body.slice(body.indexOf("\nBEGIN\n"));
  ok((bodyStmts.match(/\bUPDATE\s+remediation_contracts/gi) || []).length === 2 && !/\bINSERT\b/i.test(bodyStmts), "the trigger has exactly two statements, a revive and a park (both UPDATE), and no INSERT: it cannot make a row for an issue");
  ok(/AFTER UPDATE OF status ON agent_issues\nWHEN NEW\.status = 'open' AND COALESCE\(OLD\.status, ''\) <> 'open'/.test(body) && /NOT EXISTS \(SELECT 1 FROM remediation_contracts c WHERE c\.issue_id = NEW\.id AND c\.status IN \('active', 'holding', 'monitoring', 'escalated'\)\)\nBEGIN/.test(body), "it fires only when an issue goes to open and has no live contract");
  ok(!/\bDELETE\s+FROM\b|\bDROP\b/i.test(mig.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the body deletes and drops nothing");
  // DOCTRINE-1: the registered hold gets the new park path, once (guarded on its own text), with reviewed_at set, and the Rollback line takes it out again
  const cr = body0.match(/UPDATE control_registry\n[\s\S]*?;\n/g) || [];
  ok(cr.length === 1 && /WHERE control = 'loop-owned-contract-park'\n\s+AND instr\(location, 'agent_issues_reopen_live_path_upd'\) = 0;/.test(cr[0]) && /reviewed_at = strftime\('%Y-%m-%dT%H:%M:%SZ', 'now'\)/.test(cr[0]) && /location = location \|\| '/.test(cr[0]) && /evidence = evidence \|\| '/.test(cr[0]) && !/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+control_registry/i.test(body0), "(DOCTRINE-1) exactly one guarded UPDATE of control_registry for the row loop-owned-contract-park: it appends to location and evidence, sets reviewed_at, and is a no-op once the trigger is named in the location", cr.length);
  const rbl = (/^-- Rollback: (.*)$/m.exec(mig) || [])[1] || "";
  ok(/UPDATE control_registry SET location = replace\(location, '[^']*', ''\), evidence = replace\(evidence, '[^']*', ''\) WHERE control = 'loop-owned-contract-park'/.test(rbl), "(DOCTRINE-1) the one Rollback line reverts the appended control_registry text with replace()");
}

// ---- 1. the defect, on the state before the file ---------------------------------------------------------------------------------------
{
  const db = fresh();
  const a = issue(db, "METRIC-TRIGGER-9001-X: reach gap", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + a, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9001), attempts: 236 });
  ok(close(db, a) === null, "setup: an issue with a superseded contract closes with evidence");
  ok(reopen(db, a) === null && one(db, "SELECT status FROM agent_issues WHERE id = ?", a).status === "open", "the issue reopens by UPDATE");
  ok(liveOf(db, a).length === 0, "BEFORE the file: the reopened issue has no live contract (superseded:contract-on-closed-issue stays)", contracts(db, a).map((c) => c.status));
  // the INSERT path: the birth trigger never sees a refile, issue_refile_reopen ends in RAISE(IGNORE)
  const b = issue(db, "METRIC-TRIGGER-9002-Y: reach gap", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + b, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9002) });
  close(db, b);
  const before = one(db, "SELECT COUNT(*) AS n FROM agent_issues").n;
  db.prepare("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES ('METRIC-TRIGGER-9002-Y: reach gap', 'again', 'qnfo-fleet-control', 'open', ?, ?)").run(Date.now(), Date.now());
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === before && one(db, "SELECT status FROM agent_issues WHERE id = ?", b).status === "open", "a refile INSERT adds no row: issue_refile_reopen reopens the old row (RAISE(IGNORE))");
  ok(liveOf(db, b).length === 0 && contracts(db, b).length === 1, "BEFORE the file: and the refile path leaves it with no live contract, no new contract row");
  ok(/RAISE\(IGNORE\)\s*;?\s*END$/.test(triggerSql(db, "issue_refile_reopen").replace(/\s+/g, " ")), "the fixture's issue_refile_reopen ends in RAISE(IGNORE), as live");
}

// ---- 2. the trigger ---------------------------------------------------------------------------------------------------------------------
{
  const db = fresh();
  db.exec(mig);
  ok(!!triggerSql(db, TRIG), "the trigger exists after the file");

  // (a) revive: superseded:contract-on-closed-issue
  const a = issue(db, "METRIC-TRIGGER-9001-X: reach gap", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + a, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9001), attempts: 236, deferred_since: "2026-10-01 00:00:00", next_due_at: "2026-10-18 12:28:30" });
  close(db, a);
  ok(liveOf(db, a).length === 0, "closed with the contract still superseded");
  ok(reopen(db, a) === null, "reopen by UPDATE");
  const ca = contracts(db, a);
  ok(ca.length === 1 && ca[0].status === "active" && ca[0].attempts === 0 && ca[0].last_verdict === null && ca[0].deferred_since === null && near(ca[0].next_due_at, 0), "(a) the superseded contract is active again: attempts 0, no verdict, no deferral start, due now", ca[0]);
  ok(ca[0].verify_probe === V1H(9001) && ca[0].module === "probe-template-v1h", "(a) its probe and module are the ones it had");
  ok(one(db, "SELECT COUNT(*) AS n FROM issue_lifecycle WHERE issue_id = ? AND event = 'reopened'", a).n === 1, "the reopened event is recorded once");

  // (a2) status closed, verdict pass (2215)
  const a2 = issue(db, "METRIC-TRIGGER-9003-Z: doctrine breach", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + a2, { status: "closed", last_verdict: "pass", module: "probe-template-v1h", verify_probe: V1H(9003), attempts: 12 });
  close(db, a2); reopen(db, a2);
  const c2 = contracts(db, a2);
  ok(c2.length === 1 && c2[0].status === "active" && c2[0].attempts === 0 && c2[0].last_verdict === null, "(a) a contract in status closed (verdict pass) is revived too", c2[0]);

  // (a3) two closure-superseded contracts of one issue are the inverse of the sweep: both come back
  const a3 = issue(db, "MULTI-1: two sub-contracts", { source: "session-test" });
  setC(db, "issue-" + a3, { status: "superseded", last_verdict: "superseded:closure-superseded", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed" });
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'd1-query', 'x', 1, 'superseded', 'superseded:issue-wontfix')").run("issue-" + a3 + "-b", a3);
  close(db, a3); reopen(db, a3);
  ok(contracts(db, a3).every((c) => c.status === "active"), "(a) every contract the closure retired comes back (closure-superseded and issue-wontfix verdicts)", contracts(db, a3).map((c) => c.status));

  // (b) circular loop-owned contract is parked, never revived
  const b = issue(db, "METRIC-REGRESSION-1: companion_hours_since_last_piece", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + b, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v2d-loop", verify_probe: circularProbe(b), attempts: 76 });
  close(db, b); reopen(db, b);
  const cb = contracts(db, b);
  ok(cb.length === 1 && cb[0].status === "monitoring" && cb[0].last_verdict === LV_LOOP && cb[0].next_due_at === null && cb[0].verify_probe === circularProbe(b), "(b) a circular loop-owned contract is parked as monitoring with the LOOP-OWNED verdict, its probe unchanged", cb[0]);
  ok(close(db, b) === null, "(b) and the parked issue can be closed again with evidence (the park cannot block the close)");

  // (c) NO PLACEHOLDER: probe-unusable / closure-observing / any other retired contract that no probe can judge is left exactly as it was
  for (const [label, verdict] of [["probe-unusable", "superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)"], ["closure-observing", "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: x)"], ["open-twin", "superseded:open-twin"]]) {
    const c = issue(db, "WORK-1: " + label, { source: "session-test" });
    setC(db, "issue-" + c, { status: "superseded", last_verdict: verdict, module: "probe-template-v3-generic", verify_probe: closureObserving(c), attempts: 32 });
    close(db, c);
    const s0 = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", c);
    ok(reopen(db, c) === null && one(db, "SELECT status FROM agent_issues WHERE id = ?", c).status === "open", "(c) " + label + ": the issue reopens");
    ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", c) === s0, "(c) " + label + ": its contract rows are byte for byte what they were (no placeholder, no new row, no changed column)");
    ok(liveOf(db, c).length === 0 && all(db, NOLIVE).some((r) => r.id === c), "(c) " + label + ": it still has no live contract, so the dead-end view, issues_without_next_action and T1 keep counting it until a probe is written");
    ok(!contracts(db, c).some((r) => r.module === "reopen-live-path" || /pending/.test(r.verify_probe)), "(c) " + label + ": nothing reading pending was written");
    ok(close(db, c) === null && reopen(db, c) === null && snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", c) === s0, "(c) " + label + ": a close and a second reopen change nothing either");
  }
  // a retired contract whose verdict names the closure but whose probe reads the issue's own status (a closure-observing probe) cannot judge either: it is not revived
  {
    const c = issue(db, "WORK-2: swept but circular", { source: "session-test" });
    setC(db, "issue-" + c, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v3-generic", verify_probe: closureObserving(c) });
    close(db, c); reopen(db, c);
    ok(liveOf(db, c).length === 0 && contracts(db, c)[0].status === "superseded", "(c) a contract-on-closed-issue verdict with a closure-observing probe is not revived (the probe cannot pass while the issue is open)", contracts(db, c)[0].status);
    const n = issue(db, "WORK-3: swept but unprobed", { source: "session-test" });
    setC(db, "issue-" + n, { status: "superseded", last_verdict: SWEPT, verify_probe: "needs-machine-probe" });
    close(db, n); reopen(db, n);
    ok(liveOf(db, n).length === 0, "(c) a contract-on-closed-issue verdict with the needs-machine-probe text is not revived either");
  }
  // one revivable and one unjudgeable contract on the same issue: only the revivable one comes back
  {
    const m = issue(db, "MIXED-1: two retired contracts", { source: "session-test" });
    setC(db, "issue-" + m, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9009) });
    db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'x', 1, 'superseded', 'superseded:probe-unusable (x)', 'probe-template-v3-generic')").run("issue-" + m + "-b", m, closureObserving(m));
    close(db, m); reopen(db, m);
    const cm = contracts(db, m);
    ok(cm.length === 2 && cm.find((r) => r.class === "issue-" + m).status === "active" && cm.find((r) => r.class === "issue-" + m + "-b").status === "superseded", "(c) of two retired contracts only the judgeable one is revived", cm.map((r) => r.class + ":" + r.status));
  }
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'PROBE-NEEDED-1:%'").n === 4 && one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-2:%'").n === 1 && one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-3:%'").n === 1, "the trigger files no issue: only the four PROBE-NEEDED-1 issues and the two follow-ups of the file exist (a trigger INSERT into agent_issues is what D1's depth refuses)");

  // (a4) the other closed statuses: resolved and wontfix reopen the same way
  for (const st of ["resolved", "wontfix"]) {
    const r = issue(db, "STATUS-1: " + st, { source: "session-test" });
    setC(db, "issue-" + r, { status: "superseded", last_verdict: "superseded:issue-wontfix", module: "probe-template-v1h", verify_probe: V1H(r), attempts: 5 });
    db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'o', 'x', 'declined or done')").run(r);
    db.prepare("UPDATE agent_issues SET status = ? WHERE id = ?").run(st, r);
    reopen(db, r);
    ok(contracts(db, r).length === 1 && contracts(db, r)[0].status === "active" && contracts(db, r)[0].attempts === 0, "(a) an issue reopened from " + st + " gets its contract back", contracts(db, r)[0]);
  }
}

// ---- the dedupe of PROBE-NEEDED-1: an open issue of the title, or one closed within a day, is reused ------------------------------------------
{
  const db = fresh();
  issue(db, "WINDOWS-SUITE-PARITY-1: target of the first", { id: 2832, source: "chatbox-closeout-20261017" });
  const open = issue(db, "PROBE-NEEDED-1: issue-2832", { source: "qnfo-fleet-control" });
  const closed = issue(db, "PROBE-NEEDED-1: issue-100140", { source: "qnfo-fleet-control" });
  close(db, closed);
  const before = one(db, "SELECT COUNT(*) AS n FROM agent_issues").n;
  db.exec(mig);
  const titles = all(db, "SELECT id, title, status FROM agent_issues WHERE title LIKE 'PROBE-NEEDED-1:%' ORDER BY title");
  ok(titles.length === 4, "an open PROBE-NEEDED-1 issue and one closed within a day are reused: four issues in all, never a second of a title", titles);
  ok(titles.find((r) => r.title.endsWith("2832")).id === open && titles.find((r) => r.title.endsWith("100140")).id === closed && titles.every((r) => r.status === "open"), "the existing ids are kept and the closed one is open again", titles);
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === before + 2 + 2, "only the other two PROBE-NEEDED-1 issues and the two REOPEN-LIVE-PATH follow-ups are new rows");
  ok(contracts(db, open)[0].module === "reopen-live-path" && /^pending: issue \d+ has no probe of its own yet/.test(one(db, contracts(db, open)[0].verify_probe).observed), "and the reused issue carries the closing probe");
  ok(all(db, "SELECT class FROM remediation_contracts WHERE module = 'reopen-live-path' ORDER BY class").length === 6, "and the only contracts the file touches by module are the closing contracts of the four PROBE-NEEDED-1 issues and of the two follow-ups (none for a target issue)");
}

{
  const db = fresh(); db.exec(mig);
  // (d) an issue with a live contract is untouched, whatever else it holds
  for (const st of ["holding", "monitoring", "escalated", "active"]) {
    const d = issue(db, "LIVE-1: " + st, { source: "session-test" });
    setC(db, "issue-" + d, { status: st, last_verdict: "x", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed", attempts: 9, module: "m" });
    db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'x', 1, 'superseded', ?)").run("issue-" + d + "-old", d, V1H(d), SWEPT);
    close(db, d);
    const s0 = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", d);
    reopen(db, d);
    ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", d) === s0, "(d) a " + st + " contract is live: reopening changes no contract row of the issue, the superseded sibling included");
  }

  // (e) the INSERT path: issue_refile_reopen reopens by an UPDATE inside its own body and the trigger still fires
  const e = issue(db, "METRIC-TRIGGER-9002-Y: reach gap", { source: "qnfo-fleet-control" });
  setC(db, "issue-" + e, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9002), attempts: 148 });
  close(db, e);
  const n0 = one(db, "SELECT COUNT(*) AS n FROM agent_issues").n, k0 = one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n;
  db.prepare("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES ('METRIC-TRIGGER-9002-Y: reach gap', 'again', 'qnfo-fleet-control', 'open', ?, ?)").run(Date.now(), Date.now());
  const ce = contracts(db, e);
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === n0 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n === k0, "(e) the refile INSERT adds neither an issue nor a contract row");
  ok(ce.length === 1 && ce[0].status === "active" && ce[0].attempts === 0 && ce[0].last_verdict === null, "(e) and the contract is revived: the trigger fires on the reopen the RAISE(IGNORE) trigger makes", ce[0]);
  ok(one(db, "SELECT reopened_count FROM issue_triage WHERE issue_id = ?", e).reopened_count === 1 || one(db, "SELECT COUNT(*) AS n FROM issue_triage WHERE issue_id = ?", e).n === 1, "(e) issue_refile_reopen ran its other statements as before");

  // (f) an issue with no contract row at all: the trigger makes none (no placeholder); T1 counts it and REOPEN-LIVE-PATH-3 files its PROBE-NEEDED-1 issue
  const f = issue(db, "ROWLESS-1: no contract", { source: "session-test" });
  db.prepare("DELETE FROM remediation_contracts WHERE issue_id = ?").run(f);
  close(db, f); reopen(db, f);
  ok(contracts(db, f).length === 0, "(f) an issue with no contract row gets none: no placeholder row is made for it", contracts(db, f));

  // (g) several retired contracts that no probe can judge: none is touched, none becomes a placeholder
  const g = issue(db, "SUBS-1: three retired", { source: "session-test" });
  setC(db, "issue-" + g, { status: "superseded", last_verdict: "superseded:probe-unusable (x)", verify_probe: closureObserving(g) });
  for (const k of ["a", "b"]) db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 1, 'superseded', 'superseded:open-twin')").run("issue-" + g + "-" + k, g);
  const sg = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", g);
  close(db, g); reopen(db, g);
  ok(liveOf(db, g).length === 0 && snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", g) === sg, "(g) of three retired contracts none is changed and none is live", contracts(db, g).map((c) => c.class + ":" + c.status));

  // (i) what must not fire the trigger
  const i = issue(db, "NOFIRE-1: stays", { source: "session-test" });
  setC(db, "issue-" + i, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(1) });
  const s0 = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", i);
  db.prepare("UPDATE agent_issues SET status = 'open', priority = 'high' WHERE id = ?").run(i);
  db.prepare("UPDATE agent_issues SET description = 'x' WHERE id = ?").run(i);
  ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", i) === s0, "(i) an open-to-open update and an edit of another column do not fire it");
  close(db, i);
  ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", i) === s0, "(i) a close does not fire it (a closed issue keeps its superseded contract)");
  const j = issue(db, "NOFIRE-2: twin", { source: "session-test" });
  setC(db, "issue-" + j, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(2) });
  close(db, j);
  issue(db, "nofire-2: TWIN", { source: "session-test" });   // an open twin: same title ignoring case (a byte-equal title would be a refile and reopen j)
  const s1 = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", j);
  reopen(db, j);
  ok(one(db, "SELECT status FROM agent_issues WHERE id = ?", j).status === "closed" && snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", j) === s1, "(i) a reopen the open-twin guard ignores fires nothing: the closed issue keeps its contract");
  const k = issue(db, "NOFIRE-3: other issue", { source: "session-test" });
  setC(db, "issue-" + k, { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(3) });
  close(db, k);
  const others = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id <> ? AND issue_id IS NOT NULL ORDER BY class", e);
  reopen(db, e);   // already open: no-op; then close and reopen e and compare every other issue
  close(db, e); reopen(db, e);
  ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id <> ? AND issue_id IS NOT NULL ORDER BY class", e) === others, "(j) no contract of any other issue moves when one issue reopens (no fan-out)");
}

// ---- 3. the revived and parked contracts against the live sweeps (anti-flap), and the unjudgeable issue's retired contract ---------------------------
{
  const db = fresh(); db.exec(mig);
  const mk = (title, extra) => { const id = issue(db, title, { source: "session-test" }); setC(db, "issue-" + id, extra); close(db, id); reopen(db, id); return id; };
  const ph = mk("WORK-2: nothing can judge it", { status: "superseded", last_verdict: "superseded:probe-unusable (x)", module: "probe-template-v3-generic", verify_probe: closureObserving(0) });
  const mt = mk("METRIC-TRIGGER-9004-W: m", { status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(9004) });
  const lo = mk("METRIC-REGRESSION-1: x2", { status: "superseded", last_verdict: SWEPT, module: "probe-template-v2d-loop", verify_probe: circularProbe(0) });
  setC(db, "issue-" + lo, { verify_probe: circularProbe(lo) });
  const st = () => ({ ph: contracts(db, ph)[0].status, mt: contracts(db, mt)[0].status, lo: contracts(db, lo)[0].status });
  ok(st().ph === "superseded" && st().mt === "active" && st().lo === "monitoring", "setup: the unjudgeable issue keeps its superseded contract, the metric contract is active, the circular contract monitoring", st());
  // an hour passes: nothing verified for 50 minutes
  const phRow = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", ph);
  runRedDrain(db, [0, 1, 2, 6, 7]);
  const after = st();
  ok(after.ph === "superseded" && snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", ph).replace(/"last_attempt_at":[^,}]*/g, "") === phRow.replace(/"last_attempt_at":[^,}]*/g, ""), "red-drain steps 0, 1, 2, 6 and 7 leave the unjudgeable issue's retired contract alone (it stays superseded, not live)", after);
  ok(liveOf(db, ph).length === 0, "and it is still counted as an issue with no live contract");
  ok(after.mt === "monitoring" && liveOf(db, mt).length === 1, "step 1 parks the revived metric contract as monitoring, which is a live status for the measure", after);
  ok(after.lo === "monitoring" && contracts(db, lo)[0].last_verdict === LV_LOOP, "step 6 does not re-arm the parked circular contract (the LOOP-OWNED carve-out)", contracts(db, lo)[0].last_verdict);
  // the spec's alternative: an escalated contract of a probe-unusable issue is re-armed by step 6, read as vacuous, and superseded again by step 0
  const sp = issue(db, "SPEC-ALT-1: escalated:probe-needed", { source: "session-test" });
  setC(db, "issue-" + sp, { status: "escalated", last_verdict: "escalated:probe-needed", verify_probe: closureObserving(sp), module: "probe-template-v3-generic" });
  runRedDrain(db, [6]);
  ok(contracts(db, sp)[0].status === "active", "(why not escalated) red-drain step 6 re-arms an escalated:probe-needed contract of an open issue within the hour", contracts(db, sp)[0].status);
  setC(db, "issue-" + sp, { last_verdict: "vacuous-probe-result" });   // what the tick writes for the closure-observing probe
  runRedDrain(db, [0]);
  ok(liveOf(db, sp).length === 0, "(why not escalated) and step 0 supersedes it again: no live path, which is the defect", contracts(db, sp)[0].status);
}

// ---- 4. the backfill ---------------------------------------------------------------------------------------------------------------------
function seedNine(db) {
  const idsOf = {};
  const mk = (id, title, source, c, ageMin = 600) => { idsOf[id] = issue(db, title, { id, source, ageH: ageMin / 60 }); setC(db, "issue-" + id, c); db.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(isoAgo(ageMin), id); };
  const sweptMetric = (n) => ({ status: "superseded", last_verdict: SWEPT, module: "probe-template-v1h", verify_probe: V1H(n), attempts: 100 + n % 7, next_due_at: "2026-10-18 12:28:30" });
  mk(2047, "METRIC-TRIGGER-1238-IDEA-TOPIC-CONCENTRATION-30D: Intake diversity", "qnfo-fleet-control", sweptMetric(1238));
  mk(2215, "METRIC-TRIGGER-3394-BLOCKER-SURFACE-COVERAGE-7D: Doctrine breach", "qnfo-fleet-control", { status: "closed", last_verdict: "pass", module: "probe-template-v1h", verify_probe: V1H(3394), attempts: 12 });
  mk(2455, "METRIC-TRIGGER-5182-SPOF-ALTERNATES-UNTESTED-24H: Chaos drill", "qnfo-fleet-control", sweptMetric(5182));
  mk(2522, "METRIC-TRIGGER-3060-ISSUES-UNPROBED-60M: Issue SLA breach", "qnfo-fleet-control", sweptMetric(3060));
  mk(2655, "METRIC-TRIGGER-369-REFERRAL-30D: Reach gap", "qnfo-fleet-control", sweptMetric(369));
  mk(2695, "METRIC-REGRESSION-1: companion_hours_since_last_piece", "qnfo-fleet-control", { status: "superseded", last_verdict: SWEPT, module: "probe-template-v2d-loop", verify_probe: circularProbe(2695), attempts: 76 });
  mk(2832, "WINDOWS-SUITE-PARITY-1: 124 suites fail on the owner Windows box", "chatbox-closeout-20261017", { status: "superseded", last_verdict: "superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)", module: "probe-template-v3-generic", verify_probe: closureObserving(2832), attempts: 32 });
  mk(100140, "UIA-SOURCE-FIDELITY-1: fix factual inconsistencies in the Ignorance Audit papers", "claude-session-iocph2026-poster", { status: "superseded", last_verdict: "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: x)", module: "probe-template-v3-generic", verify_probe: closureObserving(100140) });
  mk(100151, "MODEL-DEGRADED kimi-k2.6,gpt-oss-120b", "qnfo-fleet-advisor", { status: "superseded", last_verdict: "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: x)", module: "probe-template-v3-generic", verify_probe: closureObserving(100151) });
  // issues in the same state that the audit read did not name (a review found them on live D1: 2450 and 2607 were reopened after the audit read,
  // 2925 and 100247 were born with a vacuous probe). The set-based backfill fixes them with the same statements.
  mk(2450, "METRIC-TRIGGER-1821-CONTINUATION-PAGEVIEWS-7D: Reach gap", "qnfo-fleet-control", sweptMetric(1821), 200);
  mk(2607, "METRIC-TRIGGER-1820-EXTERNAL-REFERRED-PAGEVIEWS-7D: Reach gap", "qnfo-fleet-control", sweptMetric(1820), 190);
  mk(2925, "INTEG-MASTODON-VERIFY-1: verified profile link", "session-deepchat-20261018-integrations", { status: "superseded", last_verdict: "superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)", module: "probe-template-v3-generic", verify_probe: closureObserving(2925), attempts: 24 }, 1500);
  mk(100247, "CHAOS-DRILL-FAILED-1: control:cf-obs-nested-too-deep-pin", "chaos-drill", { status: "superseded", last_verdict: "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: x)", module: "probe-template-v3-generic", verify_probe: closureObserving(100247) }, 10);
  // an open issue with no contract row at all, and an open issue whose two contracts the closure retired (both come back)
  issue(db, "ROWLESS-2: no contract row", { id: ROWLESS, source: "session-test", ageH: 0.5 });
  db.prepare("DELETE FROM remediation_contracts WHERE issue_id = ?").run(ROWLESS);
  db.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(isoAgo(30), ROWLESS);
  mk(TWOSWEPT, "TWOSWEPT-1: two retired contracts", "session-test", sweptMetric(3002), 400);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'x', 1, 'superseded', 'superseded:closure-superseded', 'probe-template-v1h')").run("issue-" + TWOSWEPT + "-b", TWOSWEPT, V1H(3003));
  // a closed issue with a superseded contract, and an open issue with a live one (plus a superseded sibling): neither moves
  const cl = issue(db, "CLOSED-1: long closed", { id: 2381, source: "session-test", ageH: 300 }); setC(db, "issue-2381", { status: "superseded", last_verdict: SWEPT, verify_probe: V1H(7) }); close(db, 2381);
  mk(2954, "VERIFICATION-DEFERRAL-STALL-1: 431 contracts defer forever with no escalation and no owner", "session-test", { status: "active", last_verdict: "fail", module: "circular-probe-deprecated", verify_probe: OLD_2954_PROBE, attempts: 7 }, 1200);
  mk(2954 + 1, "LIVE-OTHER-1: has a live contract", "session-test", { status: "holding", last_verdict: "pass", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed" }, 900);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-2955-old', 2955, 'p', 'a', ?, 'd1-query', 'x', 1, 'superseded', ?, 'probe-template-v1h')").run(V1H(8), SWEPT);
  return idsOf;
}
const liveCount = (db, id) => liveOf(db, id).length;
const WRITE_KW = [...readFileSync(new URL("../scripts/remediation_consumer.py", import.meta.url), "utf8").match(/WRITE_KW = \(([\s\S]*?)\n\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const AUDIT_UNJUDGEABLE = [2832, 2925, 100140, 100151, 100247];   // a retired contract no probe can judge: the file leaves each exactly as it was
const REVIVED = [2047, 2215, 2455, 2522, 2655, 2450, 2607];
const PARKED = [2695];
{
  const db = fresh(); seedNine(db);
  ok(WRITE_KW.length >= 8 && WRITE_KW.includes("update "), "the consumer's write-keyword list was read from scripts/remediation_consumer.py", WRITE_KW);
  const sortedSet = SET.slice().sort((a, b) => a - b);
  const gapsBefore = all(db, NOLIVE).map((r) => r.id);
  ok(JSON.stringify(gapsBefore) === JSON.stringify(sortedSet), "BEFORE the file: the nine named issues, the four the audit read did not name and the two fixture issues, and no other, have no live contract", gapsBefore);
  const rowsBefore = snap(db, "SELECT * FROM remediation_contracts ORDER BY class");
  const decoyBefore = snap(db, "SELECT * FROM remediation_contracts WHERE issue_id IN (2381, 2955) ORDER BY class");
  const unjudgedBefore = Object.fromEntries(AUDIT_UNJUDGEABLE.map((id) => [id, snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", id)]));
  // the older measures, read on the same fixture before the file: the dead-end detector (DEAD-END-DOER-1) and the issues-without-next-action guard
  const deadEnd = () => all(db, "SELECT a.id FROM agent_issues a WHERE a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%' AND a.created_at < ? AND NOT EXISTS (SELECT 1 FROM remediation_contracts k WHERE k.issue_id = a.id AND k.status IN ('active', 'holding')) AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'monitoring' AND instr(COALESCE(c.last_verdict, ''), 'monitoring:loop-owned-48h') = 1 AND c.class = (SELECT c0.class FROM remediation_contracts c0 WHERE c0.issue_id = a.id ORDER BY c0.ts DESC, c0.class DESC LIMIT 1)) ORDER BY a.id", Date.now() - 7200e3).map((r) => r.id);
  const noNext = () => all(db, "SELECT a.id FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')) ORDER BY a.id").map((r) => r.id);
  const deadBefore = deadEnd(), noNextBefore = noNext();
  db.exec(mig);

  // revive and park only: every open issue whose retired contract can be judged ends with one live contract; the rest keep what they had
  const stillNoLive = all(db, NOLIVE).map((r) => r.id);
  const wantNoLive = [2832, 2925, ROWLESS, 100140, 100151, 100247].sort((a, b) => a - b);
  ok(JSON.stringify(stillNoLive) === JSON.stringify(wantNoLive), "AFTER the file: exactly the issues no probe can judge (2832, 2925, 100140, 100151, 100247 and the row-less issue) have no live contract; every other one has: the backfill is by state, so the issues the audit did not name are fixed with the nine", stillNoLive);
  for (const id of REVIVED.concat(PARKED)) ok(liveCount(db, id) === 1, "issue " + id + " ends with exactly one live contract", contracts(db, id).map((c) => c.status));
  for (const id of REVIVED) {
    const c = contracts(db, id)[0];
    ok(c.status === "active" && c.attempts === 0 && c.last_verdict === null && c.deferred_since === null && near(c.next_due_at, 0) && c.module === "probe-template-v1h" && /v_metric_trigger_state/.test(c.verify_probe), "issue " + id + ": revived to active with its own metric probe", c);
  }
  const c95 = contracts(db, 2695)[0];
  ok(c95.status === "monitoring" && c95.last_verdict === LV_LOOP && c95.verify_probe === circularProbe(2695), "issue 2695 (circular probe): parked as monitoring", c95);
  for (const id of AUDIT_UNJUDGEABLE) ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id = ? ORDER BY class", id) === unjudgedBefore[id] && contracts(db, id)[0].status === "superseded", "issue " + id + ": its superseded contract is exactly what it was (no placeholder, no changed column)", contracts(db, id)[0].status);
  const ct = contracts(db, TWOSWEPT);
  ok(ct.length === 2 && ct.every((c) => c.status === "active" && c.attempts === 0 && c.last_verdict === null), "an open issue whose two contracts the closure retired gets both back (the backfill reads the state before it writes)", ct.map((c) => c.class + ":" + c.status));
  ok(contracts(db, ROWLESS).length === 0, "an open issue with no contract row gets none (no placeholder row)", contracts(db, ROWLESS));
  ok(!all(db, "SELECT module, verify_probe FROM remediation_contracts").some((r) => /pending: issue \d+ has no machine-executable probe/.test(r.verify_probe)), "no contract anywhere carries a constant placeholder probe");
  ok(snap(db, "SELECT * FROM remediation_contracts WHERE issue_id IN (2381, 2955) ORDER BY class") === decoyBefore && contracts(db, 2955).find((c) => c.class === "issue-2955-old").status === "superseded", "(j) a closed issue and an open issue with a live contract (its superseded sibling included) do not move");

  // the older measures lose exactly the revived and parked issues: nothing leaves the dead-end view or issues_without_next_action through a constant
  const deadAfter = deadEnd(), noNextAfter = noNext();
  ok(JSON.stringify(deadAfter) === JSON.stringify(deadBefore.filter((id) => !REVIVED.includes(id) && !PARKED.includes(id) && id !== TWOSWEPT)), "fm-open-issue-no-doer's view loses exactly the revived and parked issues (it never loses one for a placeholder)", { before: deadBefore, after: deadAfter });
  ok(AUDIT_UNJUDGEABLE.filter((id) => id !== 100247).every((id) => deadAfter.includes(id)) && AUDIT_UNJUDGEABLE.every((id) => noNextAfter.includes(id)), "2832, 2925, 100140 and 100151 stay in the dead-end view and all five stay in issues_without_next_action: they are the issues a probe author must take", { deadAfter, noNextAfter });
  ok(JSON.stringify(noNextAfter) === JSON.stringify(noNextBefore.filter((id) => !REVIVED.includes(id) && id !== TWOSWEPT)), "issues_without_next_action loses exactly the revived issues (a park leaves it: the view counts only active and holding contracts)", { before: noNextBefore, after: noNextAfter });

  // parity: the end state of every backfilled issue is the one the trigger gives the same issue on a reopen (trigger first, then the same seed)
  {
    const dbB = fresh(); dbB.exec(mig); seedNine(dbB);
    for (const id of all(dbB, NOLIVE).map((r) => r.id)) { close(dbB, id); reopen(dbB, id); }
    const state = (d) => SET.map((id) => all(d, "SELECT class, status, module, attempts, last_verdict, deferred_since, precondition, action, verify_probe, verify_transport FROM remediation_contracts WHERE issue_id = ? ORDER BY class", id));
    const A = state(db), B = state(dbB);
    ok(JSON.stringify(A) === JSON.stringify(B), "parity: the backfill leaves each of the 15 issues in the state the trigger gives it on a reopen", SET.filter((id, i) => JSON.stringify(A[i]) !== JSON.stringify(B[i])));
  }

  // PROBE-NEEDED-1: exactly one per issue the dead-end view names and that stands without a probe, each with a closing probe that measures its target
  const pn = all(db, "SELECT id, title, status, source, priority, description FROM agent_issues WHERE title LIKE 'PROBE-NEEDED-1:%' ORDER BY title");
  ok(pn.length === 4 && pn.map((r) => r.title).join("|") === ["PROBE-NEEDED-1: issue-100140", "PROBE-NEEDED-1: issue-100151", "PROBE-NEEDED-1: issue-2832", "PROBE-NEEDED-1: issue-2925"].join("|") && pn.every((r) => r.status === "open"), "exactly one open PROBE-NEEDED-1 issue per issue that stands without a probe and that the dead-end view already names (2832, 2925, 100140, 100151)", pn.map((r) => r.title));
  ok(pn.every((r) => /Charter pillar: autonomy/.test(r.description) && /The probe to write:/.test(r.description) && /Doer:/.test(r.description) && /Definition of done:/.test(r.description)), "each names the charter pillar, the probe to write, the doer and the definition of done");
  ok(pn.every((r) => /on purpose/.test(r.description) && /fm-open-issue-no-doer/.test(r.description) && !/placeholder probe/i.test(r.description) && /status = 'active'/.test(r.description)), "each says the contract is left as it is on purpose, which measures it still counts in, and tells the doer to set the contract active with its probe");
  for (const r of pn) {
    const target = Number(/issue-(\d+)$/.exec(r.title)[1]);
    const pc = contracts(db, r.id);
    ok(pc.length === 1 && pc[0].status === "active" && pc[0].module === "reopen-live-path" && pc[0].verify_transport === "d1-query", "PROBE-NEEDED-1 " + target + ": the issue's own contract is active", pc.map((c) => c.status + "/" + c.module));
    const read = () => one(db, pc[0].verify_probe);
    ok(read().expected === "ok" && /^pending: issue \d+ has no probe of its own yet/.test(read().observed) && !measuredPending(read().observed), "PROBE-NEEDED-1 " + target + ": reads pending while the target's contract is the retired one", read());
    ok(!pc[0].verify_probe.includes("SELECT status FROM agent_issues WHERE id =") && !pc[0].verify_probe.includes("needs-machine-probe") && !pc[0].verify_probe.includes(";") && !WRITE_KW.some((k) => pc[0].verify_probe.toLowerCase().includes(k)), "PROBE-NEEDED-1 " + target + ": its probe is a read-only SELECT and carries none of the markers the sweeps and detectors match", WRITE_KW.filter((k) => pc[0].verify_probe.toLowerCase().includes(k)));
    runRedDrain(db, [0, 1, 2, 6, 7]);
    ok(contracts(db, r.id)[0].status === "active", "PROBE-NEEDED-1 " + target + ": red-drain leaves its contract active");
    const tc = "issue-" + target;
    const was = contracts(db, target)[0];
    const restore = () => setC(db, tc, { status: was.status, verify_probe: was.verify_probe, last_verdict: was.last_verdict });
    // a doer writes a real probe and sets the contract active (or holding): the closing probe passes
    setC(db, tc, { status: "active", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed" });
    ok(read().observed === "ok", "PROBE-NEEDED-1 " + target + ": reads ok once the target holds an active contract with a probe of its own", read());
    setC(db, tc, { status: "holding" });
    ok(read().observed === "ok", "PROBE-NEEDED-1 " + target + ": and once it holds a holding one", read());
    // what does not count
    setC(db, tc, { status: "active", verify_probe: "SELECT 'ok' AS expected, (SELECT status FROM agent_issues WHERE id = " + target + ") AS observed" });
    ok(/^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": a probe that reads the issue's own status does not count", read());
    setC(db, tc, { status: "active", verify_probe: closureObserving(target) });
    ok(/^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": the closure-observing probe, even active, does not count", read());
    setC(db, tc, { status: "active", verify_probe: "needs-machine-probe" });
    ok(/^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": the needs-machine-probe text does not count", read());
    setC(db, tc, { status: "monitoring", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed" });
    ok(/^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": a parked (monitoring) contract is not a probe of its own", read());
    restore();
    ok(/^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": and it reads pending again with the retired contract back", read());
    db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'o', 'x', 'declined') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = 'declined'").run(target);
    db.prepare("UPDATE agent_issues SET status = 'wontfix' WHERE id = ?").run(target);
    ok(read().observed === "ok", "PROBE-NEEDED-1 " + target + ": reads ok when the target is no longer open", read());
    db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = ?").run(target);   // back to open: the retired contract stays retired (no verdict of the whitelist)
    ok(liveCount(db, target) === 0 && /^pending/.test(read().observed), "PROBE-NEEDED-1 " + target + ": the target reopens still without a live contract (the trigger finds nothing it can judge)");
  }

  // the corrected closing probe of 2954 and the backup
  const c54 = contracts(db, 2954)[0];
  ok(c54.status === "active" && c54.last_verdict === null && c54.attempts === 0 && c54.module === "verification-path" && /live verification path/.test(c54.precondition) && c54.verify_probe !== OLD_2954_PROBE && c54.verify_probe.includes("deferred_since") && !c54.verify_probe.includes("c.ts<"), "the issue-2954 contract has the corrected probe (deferred_since, not the contract's birth)", c54.verify_probe.slice(0, 80));
  const was = JSON.parse(rowsBefore);
  const gapSet = new Set(gapsBefore);
  const wantBak = was.filter((r) => r.class === "issue-2954" || gapSet.has(r.issue_id)).map((r) => r.class).sort();
  const bak = all(db, "SELECT * FROM bak_20261019_reopen_live_path ORDER BY class");
  ok(JSON.stringify(bak.map((b) => b.class).sort()) === JSON.stringify(wantBak) && wantBak.length === 16, "the backup holds every contract row of the open issues that had no live contract (the nine, the four, the two-contract fixture; the row-less one has none) and the old 2954 contract", [bak.length, wantBak.length]);
  ok(NINE.concat(EXTRA, [TWOSWEPT]).every((id) => bak.some((b) => b.issue_id === id)) && bak.some((b) => b.class === "issue-2954" && b.verify_probe === OLD_2954_PROBE), "including 2450, 2607, 2925 and 100247, which no id list of the audit covered");
  ok(!bak.some((b) => b.issue_id === 2381 || b.issue_id === 2955), "and no row of a closed issue or of an issue with a live contract");
  ok(bak.every((b) => JSON.stringify(b) === JSON.stringify(was.find((w) => w.class === b.class))), "and holds them as they were before the file");

  // decision, failure mode, detector, capability
  const dl = one(db, "SELECT * FROM decision_log WHERE instr(action, 'REOPEN-LIVE-PATH-1:') = 1");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REOPEN-LIVE-PATH-1:') = 1").n === 1 && dl.capability_gain.length > 20, "one decision_log row with a capability gain and a prediction");
  ok(/fm-open-issue-no-doer/.test(dl.predicted_outcome) && /issues_without_next_action/.test(dl.predicted_outcome) && /12 to 10/.test(dl.predicted_outcome) && /70 to 64/.test(dl.predicted_outcome) && /constant/.test(dl.evidence) && /pending/.test(dl.assumption), "the decision row says what the apply does to the two older measures (12 to 10 and 70 to 64, real contracts only) and why no constant stands in for a probe");
  const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'reopen-without-live-path'");
  ok(fm && fm.probe_class === "fm-reopen-without-live-path" && fm.issue_id === 2954 && fm.first_seen === "2026-10-19" && fm.root_cause.length > 60 && fm.remediation.length > 60, "the failure mode names its root cause, remediation and detector class", fm && fm.probe_class);
  ok(fm && /constant that reads pending/.test(fm.root_cause) && /fm-open-issue-no-doer/.test(fm.remediation) && /issues_without_next_action/.test(fm.remediation) && /12 to 10/.test(fm.remediation) && /70 to 64/.test(fm.remediation) && /60 minutes/.test(fm.detector) && /REOPEN-LIVE-PATH-3/.test(fm.remediation) && !/120 minutes/.test(fm.detector), "and says why no stand-in contract is made, what the apply does to the two older measures, the 60-minute term and who files the PROBE-NEEDED-1 issue for a later orphan");
  const det = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-reopen-without-live-path'");
  ok(det && det.status === "active" && det.module === "failure-mode" && det.verify_transport === "d1-query" && det.issue_id === null, "the detector is an active failure-mode contract", det && det.status);
  ok(one(db, "SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'reopen-live-path'").n === 1, "the capability is in the ledger");
  // DOCTRINE-1: the registered hold loop-owned-contract-park names the new park path (the trigger and the backfill) once, with its evidence and a fresh reviewed_at
  const cr1 = one(db, "SELECT * FROM control_registry WHERE control = 'loop-owned-contract-park'");
  ok(cr1.location === PARK_LOC + ", D1 trigger agent_issues_reopen_live_path_upd and the REOPEN-LIVE-PATH-1 backfill (a reopened or open issue gets the same park)", "(DOCTRINE-1) the control_registry location names the trigger and the backfill after the old text", cr1.location);
  ok(cr1.evidence.startsWith(PARK_EVIDENCE + " REOPEN-LIVE-PATH-1 (2026-10-19): a second producer of the same state.") && /fm-reopen-without-live-path counts those after 60 minutes\)\.$/.test(cr1.evidence) && cr1.evidence.split("REOPEN-LIVE-PATH-1 (2026-10-19)").length === 2, "(DOCTRINE-1) its evidence keeps the old text and adds one dated line that says what is parked and what is left visible", cr1.evidence.slice(-200));
  ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(cr1.reviewed_at) && Date.parse(cr1.reviewed_at) > Date.now() - 300e3 && cr1.reviewed_at !== PARK_REVIEWED, "(DOCTRINE-1) reviewed_at is set at the apply", cr1.reviewed_at);
  ok(cr1.kind === "hold" && cr1.disposition === "replace" && cr1.disposition_state === "applied" && cr1.critical_path === 0 && cr1.alternate_tested_at === PARK_REVIEWED && /hourly red-drain park/.test(cr1.alternate_path) && one(db, "SELECT COUNT(*) AS n FROM control_registry").n === 1, "(DOCTRINE-1) and nothing else about the row or the registry changes: it stays a hold, disposition replace, applied, with its tested alternate; no row is added (a second producer of a registered hold, not a new control)");

  // the detector (T1) and the 2954 probe (T1, T2)
  const detRead = () => one(db, det.verify_probe);
  const probe54 = () => one(db, contracts(db, 2954)[0].verify_probe);
  const p54 = contracts(db, 2954)[0].verify_probe;
  for (const [name, probe] of [["detector", det.verify_probe], ["2954 probe", p54]]) {
    ok(/^SELECT /.test(probe) && !probe.includes(";") && !WRITE_KW.some((k) => probe.toLowerCase().includes(k)), "(l) the " + name + " is one literal read-only SELECT: no semicolon, none of the consumer's write keywords", WRITE_KW.filter((k) => probe.toLowerCase().includes(k)));
    ok(!/placeholder|no machine-executable probe yet/.test(probe), "(l) the " + name + " has no placeholder term: a path that measures nothing is not a path, so there is nothing to recognise");
  }
  const age = (id, min) => db.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(isoAgo(min), id);
  for (const id of [2832, 100140, 100151]) age(id, 600);
  age(2925, 1500); age(100247, 10); age(ROWLESS, 30);
  const r0 = detRead();
  ok(r0.expected === "0" && r0.observed === "4", "(l) T1: the detector counts the four open issues that stand over 60 minutes without a live contract (2832, 2925, 100140, 100151); 100247 and the row-less issue are inside the window, and the revived, parked and live-contract issues (2954 itself, open for 1200 minutes) are not counted", r0);
  ok(probe54().expected === "0" && probe54().observed === "4", "(l) the 2954 closing probe counts the same four (its first term)", probe54());
  age(100247, 59);
  ok(detRead().observed === "4", "(l) T1: 59 minutes is inside the 60-minute window");
  age(100247, 61);
  ok(detRead().observed === "5" && probe54().observed === "5", "(l) T1: an orphan older than 60 minutes is counted, by both probes", [detRead(), probe54()]);
  age(ROWLESS, 61);
  ok(detRead().observed === "6", "(l) T1: an open issue with no contract row at all is counted too", detRead());
  age(ROWLESS, 30); age(100247, 10);
  ok(detRead().observed === "4", "(l) and both are back inside the window", detRead());
  // a probe written by a doer ends the count; so does a park; so does a second real contract
  const w140 = contracts(db, 100140)[0];
  setC(db, "issue-100140", { status: "active", verify_probe: "SELECT 'ok' AS expected, 'ok' AS observed" });
  ok(detRead().observed === "3" && probe54().observed === "3", "(l) T1: the real probe of a doer, set active, ends the count for that issue", [detRead(), probe54()]);
  setC(db, "issue-100140", { status: w140.status, verify_probe: w140.verify_probe });
  ok(detRead().observed === "4", "(l) and it is counted again when the retired contract is back", detRead());
  setC(db, "issue-100151", { status: "monitoring" });
  ok(detRead().observed === "3", "(l) T1: a parked (monitoring) contract is a live status and ends the count", detRead());
  setC(db, "issue-100151", { status: "superseded" });
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status) VALUES ('issue-2832-real', 2832, 'p', 'a', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'd1-query', 'x', 1, 'active')").run();
  ok(detRead().observed === "3", "(l) T1: a second, real live contract of the same issue ends the count", detRead());
  db.prepare("DELETE FROM remediation_contracts WHERE class = 'issue-2832-real'").run();
  ok(detRead().observed === "4", "(l) and it is counted again when only the retired contract is left", detRead());
  // the PROBE-NEEDED-1 issues have a live (pending) contract: they are never counted, however old
  for (const r of pn) age(r.id, 900);
  ok(detRead().observed === "4", "(l) the PROBE-NEEDED-1 issues' own contracts are live, so those issues are never counted when old", detRead());
  // T1 for an issue retired and not revived, at the window edge
  const gap = issue(db, "GAP-1: retired and not revived", { source: "session-test" });
  setC(db, "issue-" + gap, { status: "superseded", last_verdict: SWEPT, verify_probe: V1H(5) });
  age(gap, 59);
  ok(detRead().observed === "4", "(l) T1: an open issue without a live contract is inside the 60-minute window at 59 minutes", detRead());
  age(gap, 61);
  ok(detRead().observed === "5" && probe54().observed === "5", "(l) T1: and counted at 61 minutes, by both probes", [detRead(), probe54()]);
  setC(db, "issue-" + gap, { status: "active" });
  ok(detRead().observed === "4", "(l) T1: a live contract ends it", detRead());
  const base = Number(probe54().observed);
  ok(base === 4 && Number(detRead().observed) === 4, "(l) baseline for the deferral term", [base, detRead()]);
  // T2 (the 2954 probe only): an active contract deferred past 10110 minutes with no escalation issue
  const dq = issue(db, "DEFER-1: long deferred", { source: "session-test", ageH: 300 });
  setC(db, "issue-" + dq, { status: "active", last_verdict: "deferred", deferred_since: new Date(Date.now() - (10110 + 5) * 60e3).toISOString().replace("T", " ").slice(0, 19), verify_probe: "SELECT 'ok' AS expected, 'pending: x' AS observed" });
  ok(Number(probe54().observed) === base + 1 && Number(detRead().observed) === base, "(l) T2: a contract deferred over 10110 minutes with no escalation issue adds one to the 2954 probe and not to the detector", [probe54(), detRead()]);
  setC(db, "issue-" + dq, { deferred_since: new Date(Date.now() - (10110 - 60) * 60e3).toISOString().replace("T", " ").slice(0, 19) });
  ok(Number(probe54().observed) === base, "(l) T2: a deferral still inside the 10110 minutes does not (the old probe anchored on the contract's birth)", probe54());
  setC(db, "issue-" + dq, { deferred_since: new Date(Date.now() - (10110 + 5) * 60e3).toISOString().replace("T", " ").slice(0, 19) });
  const esc = issue(db, "VERIFICATION-DEFERRED-7D-1: issue-" + dq, { source: "qnfo-fleet-control" });
  ok(Number(probe54().observed) === base, "(l) T2: an open VERIFICATION-DEFERRED-7D-1 issue for the class removes it", probe54());
  setC(db, "issue-" + esc, { status: "active", last_verdict: "deferred", deferred_since: new Date(Date.now() - 20000 * 60e3).toISOString().replace("T", " ").slice(0, 19), verify_probe: "SELECT 'cleared' AS expected, 'pending: x' AS observed" });
  ok(Number(probe54().observed) === base, "(l) T2: the escalation issue's own deferred contract is not counted (it would otherwise count for ever)", probe54());
  // the two false counts of the old probe (issue-2068 and issue-2381 on 2026-10-19 17:26Z)
  const old = db.prepare(OLD_2954_PROBE.replace("'issue-2954'", "'issue-2954'"));
  const c68 = issue(db, "FALSE-1: contract born long ago, deferral restarted today", { source: "session-test", ageH: 300 });
  setC(db, "issue-" + c68, { status: "active", last_verdict: "deferred", ts: "2026-10-06 10:00:00", deferred_since: new Date(Date.now() - 3 * 3600e3).toISOString().replace("T", " ").slice(0, 19), verify_probe: "SELECT 'ok' AS expected, 'pending: x' AS observed" });
  ok(Number(old.get().observed) >= 1 && Number(probe54().observed) === base, "(l) the old probe counted a contract born long ago whose deferral restarted 3 hours ago, the new one does not", [old.get().observed, probe54().observed]);

  // the follow-up for the birth path: one open issue; its closing probe measures the births of the labels whose loop closes its own issue, the mapping of those
  // labels and the live text of the v3 template. Review of 2026-10-19: a loop-owned park is true only where the filing loop closes the issue itself, so
  // cf-model-eval (qnfo-model-eval has no code that closes an issue) and the [ai-cal] rows of agent_issues (no closer shown) are in neither its mapping nor its probe.
  const f2 = all(db, "SELECT id, title, priority, status, description FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-2:%'");
  ok(f2.length === 1 && f2[0].status === "open" && f2[0].priority === "high" && /Charter pillar: autonomy/.test(f2[0].description) && /Definition of done:/.test(f2[0].description) && /Doer:/.test(f2[0].description), "REOPEN-LIVE-PATH-2 is filed once, open, with a pillar, a doer and a definition of done", f2.map((r) => r.title));
  const d2 = f2.length ? f2[0].description : "";
  ok(/issue_source_hosts/.test(d2) && /monitoring:loop-owned-48h/.test(d2) && /loop-owned/.test(d2) && /no contract of any kind on purpose/.test(d2) && /constant that reads pending/.test(d2) && !/placeholder/i.test(d2) && /100161/.test(d2) && /100166/.test(d2) && /100238 to 100241/.test(d2) && /100250/.test(d2) && /\[ai-cal\]/.test(d2), "its lever maps the verified loop labels and parks their births as loop-owned monitoring (no placeholder birth), and it names the ten issues of the read");
  const mapStep = (/\(1\) insert into issue_source_hosts (.*?); \(2\)/.exec(d2) || [])[1] || "";
  ok(/chaos-drill and fleet-journeys/.test(mapStep) && !/cf-model-eval/.test(mapStep) && !/\[ai-cal\]/.test(mapStep) && /\(3\) one guarded UPDATE that parks the standing v3-superseded contracts of the open issues filed under a mapped label/.test(d2), "REOPEN-LIVE-PATH-2 maps chaos-drill and fleet-journeys and no other label: neither cf-model-eval nor an [ai-cal] title is in its mapping step or in the contracts it parks", mapStep);
  ok(/WHICH LABELS THIS ISSUE MAPS: only a label whose loop is verified to close its own issue/.test(d2) && /NOT verified, so neither mapped nor parked by this issue: cf-model-eval/.test(d2) && /has no code that closes one/.test(d2) && /all ten closed cf-model-eval issues were closed by a session or a sweep/.test(d2) && /acts on issue_ledger/.test(d2) && /NOT in this edit, because each needs a closer or a probe first/.test(d2) && /PROBE-NEEDED-1 issue is the fallback, and REOPEN-LIVE-PATH-3 files it/.test(d2) && /Any other label is treated the same until its closer is read in code or shown on a closed row/.test(d2), "and it says why: cf-model-eval and the [ai-cal] rows have no verified closer, so they need a closer or a PROBE-NEEDED-1 issue first and are not parked");
  ok(/update the control_registry row loop-owned-contract-park in the same migration/.test(d2), "and it tells its doer to update the control_registry row in the same migration (the v3 change is a filter)");
  ok(/cf-model-eval and the \[ai-cal\] rows are outside the probe on purpose: they are not parked, so this issue cannot be closed by hiding them/.test(d2), "and its definition of done leaves the two unverified labels outside the probe");
  // the closers the issue relies on exist in code on main (a loop-owned park on a label nobody closes would hide the issue)
  {
    const fcSrc = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
    const journeysPy = readFileSync(new URL("../scripts/fleet_journeys.py", import.meta.url), "utf8");
    ok(/CHAOS-DRILL-1 /.test(fcSrc) && /UPDATE agent_issues SET status = 'closed'[^`"]*"\)\s*\.bind\(row\.id/.test(fcSrc), "the chaos drill pass of qnfo-fleet-control closes its CHAOS-DRILL-FAILED-1 issue with close evidence (the closer REOPEN-LIVE-PATH-2 relies on for chaos-drill)");
    ok(/close_channel = 'auto-recovery'/.test(journeysPy) && /close_channel = 'auto-recovery'/.test(fcSrc), "fleet-journeys closes its issue with close_channel auto-recovery in both of its runners, scripts/fleet_journeys.py and journeyTick (the closer it relies on for fleet-journeys)");
  }
  const c2 = f2.length ? contracts(db, f2[0].id)[0] : null;
  const read2 = () => one(db, c2.verify_probe);
  ok(c2 && c2.status === "active" && c2.verify_transport === "d1-query" && read2().expected === "0" && !c2.verify_probe.includes(";") && !WRITE_KW.some((k) => c2.verify_probe.toLowerCase().includes(k)), "its contract is an active read-only d1-query probe, expected 0", c2 && WRITE_KW.filter((k) => c2.verify_probe.toLowerCase().includes(k)));
  ok(c2 && !/cf-model-eval|\[ai-cal\]/.test(c2.verify_probe) && /'chaos-drill', 'fleet-journeys'/.test(c2.verify_probe), "its probe names chaos-drill and fleet-journeys and neither cf-model-eval nor [ai-cal]");
  // fixture: 100151 (qnfo-fleet-advisor) and 100247 (chaos-drill) were born through v3; no label mapped; the v3 text does not read issue_source_hosts
  ok(read2().observed === "4", "its probe reads 4 on the fixture: one chaos-drill birth, the two unmapped verified labels, the v3 template that does not read issue_source_hosts", read2());
  db.prepare("INSERT INTO issue_source_hosts (source, host, note) VALUES ('qnfo-fleet-advisor', 'qnfo-fleet-control', 'x')").run();
  ok(read2().observed === "5", "a label mapped to a live host whose issue still holds a v3-superseded contract is counted (100151, mapped yet still claimed by v3)", read2());
  for (const [src, host] of [["chaos-drill", "qnfo-fleet-control"], ["fleet-journeys", "qnfo-fleet-control"]]) db.prepare("INSERT INTO issue_source_hosts (source, host, note) VALUES (?, ?, 'x')").run(src, host);
  ok(read2().observed === "3", "mapping the two verified loop labels removes the second term", read2());
  // the lever's v3: leave a label mapped to a live host to the loop-owned template
  const V3_MAPPED = V3_GENERIC.replace("\nBEGIN\n", "\n  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = NEW.issue_id)\nBEGIN\n");
  db.exec("DROP TRIGGER contract_probe_templates_v3_generic");
  db.exec(V3_MAPPED);
  ok(read2().observed === "2", "and the live text of contract_probe_templates_v3_generic reading issue_source_hosts removes the third term", read2());
  const born = issue(db, "CHAOS-DRILL-FAILED-1: control:a-new-one", { source: "chaos-drill" });
  ok(contracts(db, born).length === 1 && contracts(db, born)[0].status === "monitoring" && contracts(db, born)[0].last_verdict === LV_LOOP && contracts(db, born)[0].module === "probe-template-v2c-loop", "with the mapping and that v3 text an issue filed by chaos-drill is born monitoring:loop-owned-48h, which the dead-end detector skips (the lever of the follow-up works on the fixture)", contracts(db, born)[0]);
  const born1 = issue(db, "FLEET-JOURNEYS-1: deploy-coherence (1 of 1 steps failing)", { source: "fleet-journeys" });
  ok(contracts(db, born1).length === 1 && contracts(db, born1)[0].status === "monitoring" && contracts(db, born1)[0].last_verdict === LV_LOOP, "and so is an issue filed by fleet-journeys", contracts(db, born1)[0]);
  const born2 = issue(db, "UNMAPPED-LOOP-1: a label nobody mapped", { source: "unmapped-loop" });
  ok(contracts(db, born2)[0].status === "superseded" && contracts(db, born2)[0].module === "probe-template-v3-generic", "while an unmapped label is still claimed by v3 (the mapping is the lever)", contracts(db, born2)[0]);
  setC(db, "issue-100151", { status: "monitoring", last_verdict: LV_LOOP });
  setC(db, "issue-100247", { status: "monitoring", last_verdict: LV_LOOP });
  ok(read2().observed === "0", "the standing v3-superseded contracts of the verified loops' issues parked as loop-owned monitoring end the first term: the probe reads 0", read2());
  // review of 2026-10-19: the two labels with no verified closer are neither mapped nor parked, and they are not hidden by the lever either
  const cfm = issue(db, "CF-MODEL-EVAL-1: harness cannot run @cf/cloudflare/clairic", { source: "cf-model-eval" });
  const aiId = ++nextId.n;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, '[ai-cal] model probe failing: x', '', NULL, 'open', ?, ?)").run(aiId, hoursAgo(3), hoursAgo(3));
  ok(contracts(db, cfm)[0].status === "superseded" && contracts(db, cfm)[0].module === "probe-template-v3-generic" && contracts(db, aiId)[0].status === "superseded" && contracts(db, aiId)[0].module === "probe-template-v3-generic", "a cf-model-eval issue and an [ai-cal] row with no source are still born superseded by v3 after the lever: nothing maps or parks them", [contracts(db, cfm)[0].status, contracts(db, aiId)[0].status]);
  ok(read2().observed === "0" && !all(db, "SELECT 1 FROM issue_source_hosts WHERE source IN ('cf-model-eval')").length, "and neither is in the probe of REOPEN-LIVE-PATH-2 nor in issue_source_hosts: the probe reads 0 without them, so this issue closes by its own work and not by hiding them", read2());
  const detBefore = Number(detRead().observed), p54Before = Number(probe54().observed);
  age(cfm, 61); age(aiId, 61);
  ok(Number(detRead().observed) === detBefore + 2 && Number(probe54().observed) === p54Before + 2, "they stay counted by the first term of fm-reopen-without-live-path and of the issue-2954 probe once they pass 60 minutes: both rise by two", [detBefore, detRead().observed, p54Before, probe54().observed]);
  ok(deadEnd().includes(cfm) && deadEnd().includes(aiId) && noNext().includes(cfm) && noNext().includes(aiId), "and they stay in the dead-end view (fm-open-issue-no-doer) and in issues_without_next_action: no measure loses them to a label");
  ok(c2 && !c2.verify_probe.includes("needs-machine-probe") && !c2.verify_probe.includes("SELECT status FROM agent_issues WHERE id ="), "it carries none of the markers the sweeps and detectors match");
  runRedDrain(db, [0, 1, 2, 6, 7]);
  ok(contracts(db, f2[0].id)[0].status === "active", "red-drain leaves it active");

  // the follow-up for the standing filer: a code task for the code loop, with its anchor and its code-read closing contract
  const f3 = all(db, "SELECT id, title, priority, status, description FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-3:%'");
  ok(f3.length === 1 && f3[0].status === "open" && f3[0].priority === "high" && /Charter pillar: autonomy/.test(f3[0].description) && /Definition of done:/.test(f3[0].description) && /Doer:/.test(f3[0].description), "REOPEN-LIVE-PATH-3 is filed once, open, with a pillar, a doer and a definition of done", f3.map((r) => r.title));
  const dl3 = f3.length ? f3[0].description.split("\n") : [];
  const kv = (k) => (dl3.find((l) => l.startsWith(k + ": ")) || "").slice(k.length + 2);
  ok(kv("code-task") === "repo=qnfo-workers path=qnfo-fleet-control/worker.js", "REOPEN-LIVE-PATH-3 carries its code-task line (ACT-BRIDGE-1)", kv("code-task"));
  const workerText = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
  const anchor = kv("code-anchor");
  ok(anchor.length > 20 && (workerText.split(anchor).length - 1 === 1 || workerText.includes("async function rtEnsureLivePath")), "its code-anchor occurs exactly once in qnfo-fleet-control/worker.js (or the edit it asks for has landed)", anchor);
  let cp = null; try { cp = JSON.parse(kv("code-probe")); } catch (e) { cp = null; }
  ok(cp && JSON.stringify(cp.paths) === JSON.stringify(["qnfo-fleet-control/worker.js"]) && cp.contains === "async function rtEnsureLivePath", "and a code-probe line that is valid JSON and names the function the edit adds", kv("code-probe"));
  const c3 = f3.length ? contracts(db, f3[0].id)[0] : null;
  ok(c3 && c3.status === "active" && c3.verify_transport === "code-read" && c3.module === "reopen-live-path" && cp && JSON.stringify(JSON.parse(c3.verify_probe)) === JSON.stringify(cp), "its contract is the same code-read probe, active", c3 && c3.verify_probe);
  const d3 = f3.length ? f3[0].description : "";
  ok(f3.length === 1 && /probe_needed_filed/.test(d3) && /PROBE-NEEDED-1: issue-<id>/.test(d3) && /60 minutes/.test(d3) && /1440 minutes/.test(d3) && !/24 hours/.test(d3) && /VERSION-MINOR-CAPABILITY-1/.test(d3) && /never a probe that only reads pending/.test(d3) && !/placeholder/i.test(d3), "and the edit it asks for is specified: one PROBE-NEEDED-1 issue per orphan older than 60 minutes, bounded per tick and per 1440 minutes, no contract for the target, the output counter and the minor bump");
  // review of 2026-10-19: the order against REOPEN-LIVE-PATH-2 and the skips (up to 3 per tick would otherwise open about ten spurious issues for loops that close their own)
  ok(/SKIPS, AND THE ORDER AGAINST REOPEN-LIVE-PATH-2/.test(d3) && /Depends on: REOPEN-LIVE-PATH-2/.test(d3) && /While an open issue titled 'REOPEN-LIVE-PATH-2:%' exists/.test(d3) && /\(a\) whose source is mapped in issue_source_hosts to a live host/.test(d3) && /\(b\) whose source is chaos-drill or fleet-journeys/.test(d3) && /\(c\) whose title starts with '\[ai-cal\] '/.test(d3), "REOPEN-LIVE-PATH-3 depends on REOPEN-LIVE-PATH-2 and states the skips: while a REOPEN-LIVE-PATH-2 issue is open it skips a mapped source, chaos-drill, fleet-journeys and an [ai-cal] title");
  ok(/never skips a cf-model-eval orphan or an orphan of any label with no verified closer/.test(d3) && /Once REOPEN-LIVE-PATH-2 is closed no skip is needed for \(a\) and \(b\)/.test(d3) && /nine open loop-filed issues had no contract of any kind/.test(d3) && /100250/.test(d3), "and the skip is not a hide: a cf-model-eval orphan and any label with no closer is filed for, and the skips end with REOPEN-LIVE-PATH-2");
  ok(/control_registry \(DOCTRINE-1\): the same PR registers the off switch ops_config rt_ensure_live_path and the two bounds \(3 issues per tick, 12 per 1440 minutes\)/.test(d3) && /kill-switch and cap/.test(d3), "and it requires the off switch and the two bounds to be registered in control_registry in the same PR (DOCTRINE-1)");
  ok(/the skips hold: while a REOPEN-LIVE-PATH-2 issue is open an orphan with a mapped source, a chaos-drill or fleet-journeys source or an \[ai-cal\] title files none, a cf-model-eval orphan older than 60 minutes files one, and once that issue is closed an \[ai-cal\] orphan files one/.test(d3), "and the test it asks for covers the skips");
  // the skip rule exactly as the issue states it, run on a fixture of loop-filed orphans: this is the check that the rule does what the review wanted, not a test of the
  // doer's code (which is the doer's). Nothing is filed for the issues of a loop that closes its own, an issue with no closer is.
  {
    const dbS = fresh(); dbS.exec(mig);
    const mkOrphan = (title, source) => {
      let id;
      if (source === null) { id = ++nextId.n; dbS.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, ?, '', NULL, 'open', ?, ?)").run(id, title, hoursAgo(3), hoursAgo(3)); }
      else id = issue(dbS, title, { source, ageH: 3 });
      dbS.prepare("DELETE FROM remediation_contracts WHERE issue_id = ?").run(id);
      dbS.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(isoAgo(120), id);
      return id;
    };
    dbS.prepare("INSERT INTO issue_source_hosts (source, host, note) VALUES ('qnfo-fleet-advisor', 'qnfo-fleet-control', 'x')").run();
    const o = {
      advisor: mkOrphan("MODEL-DEGRADED kimi-k2.6,gpt-oss-120b", "qnfo-fleet-advisor"),
      chaos: mkOrphan("CHAOS-DRILL-FAILED-1: control:x", "chaos-drill"),
      journeys: mkOrphan("FLEET-JOURNEYS-1: binding-census (3 of 3 steps failing)", "fleet-journeys"),
      aiCal: mkOrphan("[ai-cal] model probe failing: glm-5.3", null),
      cfModelEval: mkOrphan("CF-MODEL-EVAL-1: harness cannot run @cf/cloudflare/clairic", "cf-model-eval"),
      session: mkOrphan("SESSION-FILED-1: something nobody probes", "session-x"),
    };
    const toFile = () => all(dbS, "SELECT a.id FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated')) AND COALESCE((SELECT MAX(l.ts) FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('opened', 'reopened')), strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at / 1000, 'unixepoch')) < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes') AND NOT EXISTS (SELECT 1 FROM agent_issues p WHERE p.status = 'open' AND p.title = 'PROBE-NEEDED-1: issue-' || a.id) AND NOT (EXISTS (SELECT 1 FROM agent_issues r WHERE r.status = 'open' AND r.title LIKE 'REOPEN-LIVE-PATH-2:%') AND (a.source IN (SELECT m.source FROM issue_source_hosts m JOIN service_registry s ON s.service = m.host AND s.state = 'live') OR a.source IN ('chaos-drill', 'fleet-journeys') OR a.title LIKE '[ai-cal] %')) AND a.id IN (" + Object.values(o).join(",") + ") ORDER BY a.id").map((r) => r.id);
    const idsOfKeys = (keys) => keys.map((k) => o[k]).sort((a, b) => a - b);
    ok(JSON.stringify(toFile()) === JSON.stringify(idsOfKeys(["cfModelEval", "session"])), "(skips) while REOPEN-LIVE-PATH-2 is open the rule files for the cf-model-eval orphan and the session orphan, and for none of the mapped, chaos-drill, fleet-journeys or [ai-cal] orphans (6 orphans, 2 filed, no spurious issue)", toFile());
    // REOPEN-LIVE-PATH-2 lands: the issues of the verified loops are parked (monitoring is live), the issue is closed, and the [ai-cal] orphan is now filed for
    for (const k of ["advisor", "chaos", "journeys"]) dbS.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES (?, ?, 'p', 'a', 'x', 'd1-query', 'x', 1, 'monitoring', ?, 'probe-template-v2c-loop')").run("issue-" + o[k], o[k], LV_LOOP);
    const rlp2S = one(dbS, "SELECT id FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-2:%' AND status = 'open'").id;
    ok(close(dbS, rlp2S) === null && one(dbS, "SELECT status FROM agent_issues WHERE id = ?", rlp2S).status === "closed", "(skips) setup: REOPEN-LIVE-PATH-2 closes");
    ok(JSON.stringify(toFile()) === JSON.stringify(idsOfKeys(["aiCal", "cfModelEval", "session"])), "(skips) once it is closed the skips end: the parked issues are not orphans, and the [ai-cal], cf-model-eval and session orphans are filed for (3 of 6)", toFile());
  }
  runRedDrain(db, [0, 1, 2, 6, 7]);
  ok(contracts(db, f3[0].id)[0].status === "active", "red-drain leaves it active");

  // a second apply: no new rows, no changed rows
  const s = () => JSON.stringify([all(db, "SELECT * FROM remediation_contracts ORDER BY class").map((r) => ({ ...r, next_due_at: r.next_due_at && r.next_due_at.slice(0, 16) })), all(db, "SELECT id, title, status FROM agent_issues ORDER BY id"), all(db, "SELECT * FROM failure_modes"), all(db, "SELECT * FROM capability_ledger"), all(db, "SELECT COUNT(*) AS n FROM decision_log"), all(db, "SELECT sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name"), all(db, "SELECT COUNT(*) AS n FROM bak_20261019_reopen_live_path"), all(db, "SELECT * FROM control_registry")]);
  const s1 = s();
  db.exec(mig);
  ok(s() === s1, "(8) a second apply changes nothing: contracts, issues (still four PROBE-NEEDED-1), registries (control_registry included, so the text is appended once and reviewed_at stays), triggers, backup");
  ok(one(db, "SELECT evidence FROM control_registry WHERE control = 'loop-owned-contract-park'").evidence.split("REOPEN-LIVE-PATH-1 (2026-10-19)").length === 2 && one(db, "SELECT location FROM control_registry WHERE control = 'loop-owned-contract-park'").location.split("agent_issues_reopen_live_path_upd").length === 2, "(8) and the control_registry text is in the row exactly once after the second apply");
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'PROBE-NEEDED-1:%' AND status = 'open'").n === 4, "(c) exactly four PROBE-NEEDED-1 issues exist after a second apply");
  // a reopen of an issue with a PROBE-NEEDED-1 issue files nothing more
  const t = 2832;
  db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'o', 'x', 'moved') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = 'moved'").run(t);
  db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(t);
  reopen(db, t);
  ok(liveCount(db, t) === 0 && one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'PROBE-NEEDED-1:%'").n === 4, "(c) closing and reopening 2832 leaves its retired contract as it was and files no second PROBE-NEEDED-1 issue");
}

// ---- 5. rollback ---------------------------------------------------------------------------------------------------------------------------
{
  const db = fresh(); seedNine(db);
  const pre = snap(db, "SELECT * FROM remediation_contracts ORDER BY class");
  const idset = all(db, NOLIVE).map((r) => r.id).concat([2954]);
  db.exec(mig);
  ok(contracts(db, ROWLESS).length === 0, "setup: the apply made no row for the issue that had none");
  const rb = /^-- Rollback: (.*)$/m.exec(mig);
  ok(rb && rb[1].indexOf("\n") === -1, "the Rollback header is one line");
  const err = throws(() => db.exec(rb[1]));
  ok(err === null, "the Rollback line runs", err);
  ok(!triggerSql(db, TRIG), "the Rollback drops the trigger");
  const back = JSON.parse(snap(db, "SELECT * FROM remediation_contracts WHERE class NOT LIKE 'fm-%' AND issue_id IN (" + idset.join(",") + ") ORDER BY class"));
  const want = JSON.parse(pre).filter((r) => idset.includes(r.issue_id));
  const strip = (rows) => JSON.stringify(rows.map((r) => ({ ...r, next_due_at: null })));
  ok(want.length === 16 && strip(back) === strip(want), "the Rollback restores the sixteen backed-up contract rows (status, verdict, attempts, probe, module, text) and the file made no row for an issue that had none, so the Rollback has none to remove", back.filter((r, i) => strip([r]) !== strip([want[i]])).slice(0, 1));
  ok(contracts(db, ROWLESS).length === 0 && !all(db, "SELECT class FROM remediation_contracts WHERE precondition LIKE '%REOPEN-LIVE-PATH-1%' AND class NOT LIKE 'fm-%'").length, "the Rollback has no placeholder row to remove: the file made none, and none carries the file's name");
  const mine = "(title LIKE 'PROBE-NEEDED-1:%' OR title LIKE 'REOPEN-LIVE-PATH-2:%' OR title LIKE 'REOPEN-LIVE-PATH-3:%')";
  ok(all(db, "SELECT status FROM agent_issues WHERE " + mine).every((r) => r.status === "superseded") && all(db, "SELECT status FROM agent_issues WHERE " + mine).length === 6, "it supersedes the four PROBE-NEEDED-1 issues and the two follow-ups instead of deleting them");
  ok(one(db, "SELECT COUNT(*) AS n FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE (a.title LIKE 'PROBE-NEEDED-1:%' OR a.title LIKE 'REOPEN-LIVE-PATH-2:%' OR a.title LIKE 'REOPEN-LIVE-PATH-3:%') AND c.status IN ('active','holding','monitoring','escalated')").n === 0, "and parks their contracts");
  ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 0 && one(db, "SELECT COUNT(*) AS n FROM capability_ledger").n === 0 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-reopen-without-live-path'").n === 0, "it removes the failure mode, the capability and the detector");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the append-only decision row stays");
  const crb = one(db, "SELECT location, evidence FROM control_registry WHERE control = 'loop-owned-contract-park'");
  ok(crb.location === PARK_LOC && crb.evidence === PARK_EVIDENCE, "(DOCTRINE-1) the Rollback takes the appended text out of the control_registry row again: location and evidence are what they were before the file", [crb.location.length, crb.evidence.length]);
}

// ---- 6. the runner's own check ------------------------------------------------------------------------------------------------------
{
  const py = spawnSync("python3", ["--version"]);
  if (py.status !== 0) { console.log("python3 not found: skipping scripts/apply_migrations.py --check"); }
  else {
    const script = fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url));
    const r = spawnSync("python3", [script, "--check", MIG_PATH], { encoding: "utf8" });
    ok(r.status === 0, "scripts/apply_migrations.py --check accepts the file", (r.stdout + r.stderr).slice(0, 600));
  }
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
