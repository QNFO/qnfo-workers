// BREACH-DOCTOR-1 offline suite: replays migrations/2026-10-26-breach-doctor.sql on node:sqlite over the live column lists.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, no trigger, no DELETE or DROP in the body); the file creates the three ledger tables, the
// current-diagnosis, owner and status views, the doctor switches (breach_doctor seeded on, breach_doctor_ai off, the age gate in minutes), five playbooks (playbook-gap in measure), five
// metrics with their triggers (no trigger action carries a code-task or code-anchor line: ACT-BRIDGE-1 is for one named edit in one file), the registries, the failure modes with working
// detector probes, the queue_sla row of the in-flight case and its fm- detector, the root-cause mapping of the five metrics (BREACH-ONE-MEANING-1: no new unmapped breach), the four follow-up issues (OWNER-NO-LOOSE-ENDS-1: a named doer, a closing probe that reads not-ok today and flips,
// the hold, the SPOF and the switch pointing at a live issue), one capability and one decision_log row whose
// prediction decision_predictions_parse turns into a scored prediction on an outcome the doctor has to earn (breaches_auto_remediated_24h, not the coverage metric); a second apply changes nothing; the Rollback line removes what the file added and keeps the ledger;
// every seed playbook passes the engine's own validators (bdValidateRule); and over fixtures each seed rule's trigger_sql names the issues the audit named, its per-issue
// action touches only the issue it is bound to, closes it through the live close-sync triggers with evidence and close_channel auto:triage-sync:breach-doctor, its
// revert_sql reopens it, and its verify_sql reads ok after the action and a reason before it.
// Run: node migrations/breach-doctor.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sql = readFileSync(new URL("./2026-10-26-breach-doctor.sql", import.meta.url), "utf8");
const workerSrc = readFileSync(process.env.BD_WORKER_PATH || new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- header
const header = sql.split("\n").filter((l) => l.startsWith("--"));
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/CREATE\s+TRIGGER/i.test(body) && !/\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+fleet_tick/i.test(body), "S7: no D1 trigger and no write to fleet_tick");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");

// ---- the engine block (validators come from the worker, so the seeds cannot drift from them)
const a = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:BEGIN ----"), b = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:END ----");
const kwLine = workerSrc.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m);
ok(a > 0 && b > a && kwLine, "the worker carries the BREACH-DOCTOR-1 block and the write-keyword list");
const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, isFinite, console: { error() {}, log() {} }, VERSION: "0.51.0-test", crypto: globalThis.crypto, TextEncoder, Uint8Array });
vm.runInContext(kwLine[0] + "\n" + workerSrc.slice(a, b) + "\nthis.api = { bdValidateRule, bdReadOnlyWhy, bdWriteWhy, bdFactsSafe };", cx);
const { bdValidateRule } = cx.api;

// ---- base schema: the live column lists (PRAGMA table_info 2026-10-26) and the live close triggers
const d = new DatabaseSync(":memory:");
const BASE_DDL = `
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues (lower(trim(title))) WHERE status = 'open';
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'read', attempts INTEGER NOT NULL DEFAULT 0, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, merged_by TEXT, merged_sha TEXT, merged_at TEXT);
CREATE TABLE code_task_pr_links (task_id TEXT PRIMARY KEY, pr_number INTEGER, pr_state TEXT, merged_at TEXT, head_sha TEXT, task_status TEXT, drift TEXT, synced_at TEXT, head_ref TEXT, task_ref TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE breach_causes (cause_key TEXT PRIMARY KEY, title TEXT NOT NULL, plain TEXT NOT NULL, lever TEXT NOT NULL, doer TEXT NOT NULL, needs_owner INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
INSERT INTO breach_causes (cause_key, title, plain, lever, doer) VALUES ('issue-backlog', 'Open issues pile up', 'p', 'l', 'd'), ('heartbeat', 'Scheduled loops miss runs', 'p', 'l', 'd');
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE spof_registry (component TEXT PRIMARY KEY, critical_path TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT NOT NULL, definition TEXT NOT NULL, cycle_min INTEGER NOT NULL, sla_min INTEGER NOT NULL, auto_fix TEXT NOT NULL, owner TEXT NOT NULL, summary_column TEXT NOT NULL, producer_cycle_min INTEGER);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('metric', 'issue')), subject TEXT NOT NULL, op TEXT NOT NULL CHECK (op IN ('<', '<=', '>', '>=', '=', 'between', 'closed')), value REAL, value2 REAL, due_at TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('parsed', 'seeded')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), scored_at TEXT, observed TEXT, matched INTEGER, UNIQUE (decision_id, subject, op));
CREATE TRIGGER decision_predictions_parse AFTER INSERT ON decision_log WHEN instr(COALESCE(NEW.predicted_outcome, ''), ' within ') > 0 BEGIN
  INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
    SELECT NEW.id, 'metric', t.tok1, t.tok2, CAST(t.tok3 AS REAL), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || CAST(t.after AS INTEGER) || CASE WHEN instr(t.after, ' d') > 0 THEN ' days' ELSE ' hours' END), 'parsed'
    FROM (SELECT u.tok1, u.tok2, CASE WHEN instr(u.rest2, ' ') > 0 THEN substr(u.rest2, 1, instr(u.rest2, ' ') - 1) ELSE u.rest2 END AS tok3, u.after
      FROM (SELECT v.tok1, CASE WHEN instr(v.rest1, ' ') > 0 THEN substr(v.rest1, 1, instr(v.rest1, ' ') - 1) ELSE v.rest1 END AS tok2, CASE WHEN instr(v.rest1, ' ') > 0 THEN ltrim(substr(v.rest1, instr(v.rest1, ' ') + 1)) ELSE '' END AS rest2, v.after
        FROM (SELECT substr(w.p, 1, instr(w.p, ' ') - 1) AS tok1, ltrim(substr(w.p, instr(w.p, ' ') + 1)) AS rest1, ltrim(substr(w.p, instr(w.p, ' within ') + 8)) AS after FROM (SELECT trim(NEW.predicted_outcome) AS p) w) v) u) t
    WHERE t.tok1 IN (SELECT metric FROM metric_registry) AND t.tok2 IN ('<', '<=', '>', '>=', '=') AND t.tok3 GLOB '[0-9]*' AND CAST(t.after AS INTEGER) > 0;
END;
CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') BEGIN
  SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;`;
d.exec(BASE_DDL);
d.exec(sql);
const q1 = (s, ...p) => d.prepare(s).get(...p);
const qa = (s, ...p) => d.prepare(s).all(...p);
const n = (t) => q1("SELECT COUNT(*) n FROM " + t).n;

// ---- what the file added
for (const t of ["breach_diagnoses", "breach_diagnosis_events", "breach_playbooks"]) ok(q1("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", t), "table " + t);
for (const v of ["v_breach_diagnosis_current", "v_breach_owner", "v_breach_doctor_status"]) ok(q1("SELECT name FROM sqlite_master WHERE type = 'view' AND name = ?", v), "view " + v);
ok(q1("SELECT name FROM sqlite_master WHERE name = 'uq_breach_diag_live'"), "one live case per issue is a unique partial index");
const cfg = (k) => (q1("SELECT value FROM ops_config WHERE key = ?", k) || {}).value;
ok(cfg("breach_doctor") === "on" && cfg("breach_doctor_ai") === "off" && cfg("breach_doctor_playbook_cooldown_min") === "30" && cfg("breach_doctor_min_age_min") === "120", "switches seeded: breach_doctor on, breach_doctor_ai off, cooldown 30, min age 120 minutes");
ok(cfg("breach_doctor_min_age_h") === undefined && qa("SELECT key FROM ops_config WHERE key LIKE 'breach_doctor%'").every((r) => !/_h$/.test(r.key)), "SLA-120M-1: no doctor threshold is stated in hours");
ok(Number(cfg("breach_doctor_min_age_min")) >= 10 && Number(cfg("breach_doctor_min_age_min")) <= 120 && Number(cfg("breach_doctor_playbook_cooldown_min")) <= 120, "SLA-120M-1: no doctor age or cooldown threshold exceeds 120 minutes");
for (const k of ["breach_doctor_max_cases", "breach_doctor_max_actions", "breach_doctor_budget_ms"]) ok(Number(cfg(k)) > 0, k + " is seeded");
ok(n("breach_playbooks") === 5 && qa("SELECT rule_id FROM breach_playbooks ORDER BY rule_id").map((r) => r.rule_id).join(",") === "CM-R1,CM-R2,CM-R3,CM-R5,playbook-gap", "five playbooks: CM-R1, CM-R2, CM-R3, CM-R5 and the generic playbook-gap");
ok(qa("SELECT rule_id FROM breach_playbooks WHERE enabled = 1 AND mode = 'on' ORDER BY rule_id").map((r) => r.rule_id).join(",") === "CM-R1,CM-R2,CM-R3,CM-R5", "the four per-issue playbooks are enabled and mode on (the engine holds each in measure for 30 minutes from created_at)");
ok(q1("SELECT enabled, mode FROM breach_playbooks WHERE rule_id = 'playbook-gap'").enabled === 1 && q1("SELECT mode FROM breach_playbooks WHERE rule_id = 'playbook-gap'").mode === "measure", "playbook-gap is seeded in measure (it files issues the planner records untrusted, so it is armed only with the trust entry)");
ok(/code_merge_trusted_sources/.test(q1("SELECT note FROM breach_playbooks WHERE rule_id = 'playbook-gap'").note) && /breach-doctor-gap-hold/.test(q1("SELECT note FROM breach_playbooks WHERE rule_id = 'playbook-gap'").note), "its note names the release condition and the control that records the hold");
ok(q1("SELECT action_kind FROM breach_playbooks WHERE rule_id = 'playbook-gap'").action_kind === "file-issue" && JSON.parse(q1("SELECT action_sql a FROM breach_playbooks WHERE rule_id = 'playbook-gap'").a).length === 0, "playbook-gap is the file-issue row with no SQL action");
const metrics = ["breaches_undiagnosed_over_60m", "breaches_auto_remediated_24h", "doctor_actions_failed_24h", "doctor_tick_age_min", "doctor_taint_violations_24h"];
ok(n("metric_registry") === 5 && n("analytics_metric_triggers") === 5, "five metrics and five triggers");
for (const m of metrics) ok(q1("SELECT 1 x FROM analytics_metric_triggers t JOIN metric_registry r ON r.metric = t.metric_key WHERE t.metric_key = ? AND t.enabled = 1", m), "metric " + m + " has its trigger");
const trig = (k) => q1("SELECT operator, threshold, cooldown_hours FROM analytics_metric_triggers WHERE metric_key = ?", k);
ok(trig("breaches_undiagnosed_over_60m").operator === "gt" && trig("breaches_undiagnosed_over_60m").threshold === 0 && trig("breaches_auto_remediated_24h").operator === "lt" && trig("breaches_auto_remediated_24h").threshold === 12 && trig("doctor_tick_age_min").operator === "gt" && trig("doctor_tick_age_min").threshold === 30, "targets: undiagnosed > 0, auto-remediated < 12, tick age > 30");
ok(qa("SELECT cooldown_hours c FROM analytics_metric_triggers").every((r) => r.c <= 2), "no trigger cooldown exceeds 120 minutes (SLA-120M-1)");
const handed = qa("SELECT metric_key FROM analytics_metric_triggers WHERE action LIKE '%code-task:%' OR action LIKE '%code-anchor:%'");
ok(handed.length === 0, "no trigger action hands the trusted code loop a code-task or code-anchor line (ACT-BRIDGE-1 is for one named edit in one file; these levers are switches, playbook rows and waiting)", handed);
ok(qa("SELECT action FROM analytics_metric_triggers").every((t) => /Read: /.test(t.action) && /Done when /.test(t.action)), "every trigger action still says what to read and when it is done");
ok(n("control_registry") === 8 && n("spof_registry") === 1 && n("belief_registry") === 1 && n("failure_modes") === 3 && n("capability_ledger") === 1, "registries: 8 controls, 1 spof, 1 belief, 3 failure modes, 1 capability");
ok(qa("SELECT control FROM control_registry WHERE kind IN ('hold', 'cap') ORDER BY control").map((r) => r.control).join(",") === "breach-doctor-caps,breach-doctor-gap-caps,breach-doctor-gap-hold,breach-doctor-strike-cap", "every hold and cap of the doctor is in control_registry (DOCTRINE-1), the three-strikes rate included");
// DOCTRINE-1 (review 2026-10-26): the two filters of the engine are registered with a reason, a disposition, a release or alternate path, evidence and a review date
{
  const og = q1("SELECT * FROM control_registry WHERE control = 'breach-doctor-own-issue-guard'"), sc = q1("SELECT * FROM control_registry WHERE control = 'breach-doctor-strike-cap'");
  ok(og && og.kind === "guard" && og.disposition === "keep" && /BREACH-DOCTOR-1:/.test(og.location) && /counted in breaches_undiagnosed_over_60m/.test(og.location) && /recursion/.test(og.guards_against + og.evidence) && /2026-11-02/.test(og.evidence) && og.alternate_path, "control breach-doctor-own-issue-guard: a keep guard with its reason, its alternate path and a review date", og);
  ok(sc && sc.kind === "cap" && sc.disposition === "demote" && sc.disposition_state === "applied" && /120\) minutes/.test(sc.location) && /never a stop/.test(sc.alternate_path) && /no window|for good/.test(sc.evidence) && /2026-11-02/.test(sc.evidence), "control breach-doctor-strike-cap: the permanent exclusion demoted to a 120-minute rate, with its release and a review date", sc);
  ok(/var BD_STRIKES = 3;/.test(workerSrc) && /var BD_STRIKE_RETRY_MIN = 120;/.test(workerSrc) && /var BD_RETRY_MIN = 60;/.test(workerSrc), "the registered numbers are the engine's constants (3 strikes, 120 and 60 minutes)");
  ok(/"BREACH-DOCTOR-1"/.test(workerSrc.match(/var BD_GAP_SKIP_FAMILIES = \[[^\]]*\];/)[0]) && /\["BREACH-DOCTOR-1:", "BREACH-DOCTOR-1"\]/.test(workerSrc), "the guard's other half is in the engine: family BREACH-DOCTOR-1 exists and is on the gap skip list");
  const fm = q1("SELECT formula FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m'").formula;
  ok(/cause_class other than unclassified/.test(fm) && /stays counted/.test(fm) && /titled BREACH-DOCTOR-1: are counted like any other/.test(fm) && !/BREACH-DOCTOR-1: (are )?(excluded|skipped|ignored)/.test(fm), "the metric formula states that unclassified stays counted and that the doctor's own issues are counted", fm);
}
ok(qa("SELECT class FROM remediation_contracts WHERE class NOT LIKE 'issue-%' ORDER BY class").map((r) => r.class).join(",") === "belief-doctor-structured-facts-suffice,fm-breach-doctor-case-age,fm-breach-doctor-rule-demoted,fm-breach-doctor-stalled", "detector and belief contracts");
// QUEUE-SLA-1: a loop that holds items has its queue_sla row, an automatic fix with its revert, and the age of the oldest item
const qs = q1("SELECT * FROM queue_sla WHERE stuck_type = 'breach-doctor-case-in-flight'");
ok(n("queue_sla") === 1 && qs && qs.queue === "breach_diagnoses" && qs.sla_min === 120 && qs.cycle_min === 10 && qs.owner === "qnfo-fleet-control", "queue_sla row breach-doctor-case-in-flight: cycle 10, SLA 120 minutes, owner qnfo-fleet-control", qs);
ok(/lease-expired/.test(qs.auto_fix) && /Revert: ops_config breach_doctor = off/.test(qs.auto_fix) && /fm-breach-doctor-case-age/.test(qs.summary_column), "it states the automatic fix and its revert, and names the age contract as its measurement", qs);
ok(q1("SELECT 1 x FROM failure_modes WHERE fm_key = 'breach-doctor-case-age' AND probe_class = 'fm-breach-doctor-case-age' AND issue_id = 1000266") && q1("SELECT 1 x FROM remediation_contracts WHERE class = 'fm-breach-doctor-case-age' AND status = 'active' AND verify_transport = 'd1-query'"), "the fm-breach-doctor-case-age failure mode and its active d1-query detector exist");
for (const c of qa("SELECT class, verify_probe FROM remediation_contracts WHERE class NOT LIKE 'issue-%'")) {
  const r = q1(c.verify_probe);
  ok(r && typeof r.expected === "string" && typeof r.observed === "string", "probe runs: " + c.class, r);
  if (c.class === "fm-breach-doctor-stalled") ok(r.observed === "1", "no tick event yet: the stalled detector reads 1", r);
  else ok(r.observed === "0", c.class + " reads 0 on an empty ledger", r);
}
ok(n("decision_log") === 1 && n("decision_predictions") === 1, "one decision_log row, parsed into one prediction");
const pred = q1("SELECT subject, op, value FROM decision_predictions");
ok(pred.subject === "breaches_auto_remediated_24h" && pred.op === ">=" && pred.value === 1, "the prediction is breaches_auto_remediated_24h >= 1 within 24 h: an outcome the doctor has to earn (a verified close), not coverage", pred);
ok(!/breaches_undiagnosed_over_60m/.test(q1("SELECT predicted_outcome p FROM decision_log").p) && q1("SELECT subject FROM decision_predictions").subject !== "breaches_undiagnosed_over_60m", "and it is not a prediction on the coverage metric, which classifying the backlog alone would satisfy");
ok(/S1.*S2.*S3.*S4.*S5.*S6.*S7/s.test(q1("SELECT action FROM decision_log").action), "the decision row records the S1 to S7 simplifications");

// ---- BREACH-ONE-MEANING-1: every doctor metric has a root cause, so the file adds no unmapped breach (fm-breach-unmapped)
{
  const unmapped = qa("SELECT r.metric FROM metric_registry r LEFT JOIN metric_breach_cause m ON m.metric_key = r.metric LEFT JOIN breach_causes c ON c.cause_key = m.cause_key WHERE c.cause_key IS NULL");
  ok(unmapped.length === 0, "all five metrics map to a breach_causes row that exists", unmapped);
  const mp = Object.fromEntries(qa("SELECT metric_key k, cause_key c FROM metric_breach_cause WHERE note = 'BREACH-DOCTOR-1'").map((r) => [r.k, r.c]));
  ok(Object.keys(mp).length === 5 && mp.breaches_undiagnosed_over_60m === "issue-backlog" && mp.breaches_auto_remediated_24h === "issue-backlog" && mp.doctor_tick_age_min === "heartbeat" && mp.doctor_actions_failed_24h === "breach-doctor" && mp.doctor_taint_violations_24h === "breach-doctor", "the backlog and outcome metrics map to issue-backlog, the tick age to heartbeat, the two guards to the new breach-doctor cause", mp);
  const bc = q1("SELECT * FROM breach_causes WHERE cause_key = 'breach-doctor'");
  ok(bc && bc.title && bc.plain.length > 60 && /breach_playbooks/.test(bc.lever) && /qnfo-fleet-control/.test(bc.doer) && bc.needs_owner === 0, "the new cause has plain words, a lever, a doer and needs no owner", bc);
  // the file stands alone: on a database where BREACH-ONE-MEANING-1 has not run, it creates the two tables with the live column lists and still maps the five
  const lines = BASE_DDL.split("\n").filter((l) => !/^CREATE TABLE (breach_causes|metric_breach_cause) /.test(l) && !/^INSERT INTO breach_causes /.test(l));
  const d2 = new DatabaseSync(":memory:");
  d2.exec(lines.join("\n"));
  ok(!d2.prepare("SELECT 1 x FROM sqlite_master WHERE name IN ('breach_causes', 'metric_breach_cause')").get(), "(fixture without the two tables)");
  d2.exec(sql);
  ok(d2.prepare("SELECT COUNT(*) n FROM metric_breach_cause").get().n === 5 && d2.prepare("SELECT COUNT(*) n FROM breach_causes").get().n === 1, "without BREACH-ONE-MEANING-1 the file creates the tables and maps the five metrics (file-name order applies it first)");
  // a mapping a later migration changed is not overwritten by a replay
  d.exec("UPDATE metric_breach_cause SET cause_key = 'heartbeat', note = 'LATER' WHERE metric_key = 'doctor_taint_violations_24h'");
  d.exec(sql);
  ok(q1("SELECT cause_key c, note n FROM metric_breach_cause WHERE metric_key = 'doctor_taint_violations_24h'").c === "heartbeat", "INSERT OR IGNORE: a replay leaves a mapping a later migration changed");
  d.exec("UPDATE metric_breach_cause SET cause_key = 'breach-doctor', note = 'BREACH-DOCTOR-1' WHERE metric_key = 'doctor_taint_violations_24h'");
}

// ---- the loose ends (OWNER-NO-LOOSE-ENDS-1, ANTIFRAGILE-1): four follow-up issues with a named doer and a closing probe, and registry rows that point at them
const dashSrc = readFileSync(new URL("../qnfo-fleet-dashboard/worker.js", import.meta.url), "utf8");
const FU = { ARM: "BREACH-DOCTOR-ARM-1:", WATCH: "BREACH-DOCTOR-WATCH-1:", WATCHMAKER: "BREACH-DOCTOR-WATCHMAKER-1:", RETIRE: "BREACH-DOCTOR-RETIRE-1:" };
const fu = (k) => q1("SELECT id, title, description, source, status, priority, category FROM agent_issues WHERE title LIKE ?", FU[k] + "%");
const contract = (k) => q1("SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + fu(k).id);
ok(n("agent_issues") === 4 && Object.keys(FU).every((k) => fu(k) && fu(k).status === "open" && fu(k).source === "session" && fu(k).category === "autonomy"), "four follow-up issues are filed open, source session (on code_merge_trusted_sources), category autonomy");
ok(!/CAUSE-1/.test(sql) && n("metric_breach_cause") === 5, "no BREACH-DOCTOR-CAUSE-1 issue: the root-cause mapping is made in this file, not left to a session");
ok(Object.keys(FU).every((k) => /\nDoer: /.test(fu(k).description) && /\nDefinition of done: /.test(fu(k).description)), "each names its doer and its definition of done");
ok(["ARM", "WATCH", "RETIRE"].every((k) => !/code-task:|code-anchor:/.test(fu(k).description)), "the three issues whose lever is a design or a migration carry no code-task line (a session is the doer)");
const wm = fu("WATCHMAKER").description;
ok(wm.split("\n").filter((l) => l.startsWith("code-task: ")).join() === "code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js" && wm.split("\n").filter((l) => l.startsWith("code-anchor: ")).length === 1, "BREACH-DOCTOR-WATCHMAKER-1 hands the code loop one edit in one file");
const wmAnchor = wm.split("\n").find((l) => l.startsWith("code-anchor: ")).slice(13);
ok(dashSrc.split(wmAnchor).length === 2, "its code-anchor occurs exactly once in qnfo-fleet-dashboard/worker.js", wmAnchor);
const wmProbeLine = wm.split("\n").find((l) => l.startsWith("code-probe: ")).slice(12), wmProbe = JSON.parse(wmProbeLine);
ok(wmProbe.paths.join() === "qnfo-fleet-dashboard/worker.js" && wmProbe.contains === 'key: "breach-doctor"' && !dashSrc.includes(wmProbe.contains), "its code-probe names a text main does not hold yet (the probe cannot already pass), and not a Diagnose panel that merely reads the ledger");
const cWm = contract("WATCHMAKER");
ok(cWm.verify_transport === "code-read" && cWm.verify_probe === wmProbeLine && cWm.status === "active" && cWm.module === "code-probe-line-v1", "its contract is the code-read contract the code-probe trigger would write, and equals the description line", cWm);
const kw = cx.__RT_WRITE_KW;
ok(Array.isArray(kw) && kw.length >= 10, "the worker's write-keyword list was read");
for (const k of ["ARM", "WATCH", "RETIRE"]) {
  const c = contract(k), p = String(c.verify_probe).toLowerCase();
  ok(c.verify_transport === "d1-query" && c.status === "active" && c.verify_probe !== "needs-machine-probe" && !kw.some((w) => p.includes(w)), k + ": the contract is an active d1-query probe that the runners' write-keyword guard accepts", c);
}
const probeOf = (k) => q1(contract(k).verify_probe);
ok(probeOf("ARM").expected === "ok" && /does not list/.test(probeOf("ARM").observed), "ARM: reads not-ok while the trust entry is missing", probeOf("ARM"));
ok(probeOf("WATCH").expected === "ok" && /no breach-doctor-watch/.test(probeOf("WATCH").observed), "WATCH: reads not-ok while no breach-doctor-watch job-run event exists", probeOf("WATCH"));
// the flips run inside a savepoint so the fixture below sees the file as applied
d.exec("SAVEPOINT flips");
d.exec("INSERT INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', 'session,qnfo-fleet-control|BREACH-DOCTOR-1:,session*')");
ok(/playbook-gap is not on/.test(probeOf("ARM").observed), "ARM: the trust entry alone is not enough, playbook-gap must read on", probeOf("ARM"));
d.exec("UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'playbook-gap'");
ok(probeOf("ARM").observed === "ok", "ARM: reads ok with the entry in the middle of the list and playbook-gap on", probeOf("ARM"));
d.exec("UPDATE ops_config SET value = 'session,qnfo-fleet-control|BREACH-DOCTOR-1:extra,session*' WHERE key = 'code_merge_trusted_sources'");
ok(/does not list/.test(probeOf("ARM").observed), "ARM: a longer prefix is not the entry", probeOf("ARM"));
d.exec("UPDATE ops_config SET value = 'session,qnfo-fleet-control|BREACH-DOCTOR-1:' WHERE key = 'code_merge_trusted_sources'");
ok(probeOf("ARM").observed === "ok", "ARM: reads ok with the entry last in the list", probeOf("ARM"));
d.exec("INSERT INTO cloud_ops_events (id, ts, kind, job, status) VALUES ('old', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-181 minutes'), 'job-run', 'breach-doctor-watch', 'ok')");
ok(/no breach-doctor-watch/.test(probeOf("WATCH").observed), "WATCH: an event older than 120 minutes does not count", probeOf("WATCH"));
d.exec("INSERT INTO cloud_ops_events (id, ts, kind, job, status) VALUES ('new', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'), 'job-run', 'breach-doctor-watch', 'ok')");
ok(probeOf("WATCH").observed === "ok", "WATCH: a job-run event 5 minutes old reads ok", probeOf("WATCH"));
ok(probeOf("RETIRE").observed === "ok", "RETIRE: reads ok once neither writer is installed", probeOf("RETIRE"));
d.exec("CREATE TABLE fleet_tick (x); CREATE TABLE fleet_tick_heavy (x); CREATE TABLE t_sink (x); CREATE TRIGGER deploy_merge_age_tick AFTER INSERT ON fleet_tick BEGIN SELECT 1; END; CREATE TRIGGER breach_selfheal_heavy_tick AFTER INSERT ON fleet_tick_heavy BEGIN SELECT 1; END;");
ok(/^still installed: /.test(probeOf("RETIRE").observed) && /deploy_merge_age_tick/.test(probeOf("RETIRE").observed) && /breach_selfheal_heavy_tick/.test(probeOf("RETIRE").observed), "RETIRE: reads not-ok and names both writers while they are installed (live qnfo-audit, 2026-10-26)", probeOf("RETIRE"));
d.exec("DROP TRIGGER deploy_merge_age_tick");
ok(/^still installed: breach_selfheal_heavy_tick$/.test(probeOf("RETIRE").observed), "RETIRE: one writer left is still not ok", probeOf("RETIRE"));
d.exec("DROP TRIGGER breach_selfheal_heavy_tick"); d.exec("CREATE TRIGGER deploy_merge_age_tick AFTER INSERT ON fleet_tick BEGIN SELECT 1; END");
ok(/^still installed: deploy_merge_age_tick$/.test(probeOf("RETIRE").observed), "RETIRE: the other writer alone is still not ok", probeOf("RETIRE"));
d.exec("ROLLBACK TO flips"); d.exec("RELEASE flips");
ok(probeOf("ARM").expected === "ok" && probeOf("ARM").observed !== "ok" && cfg("code_merge_trusted_sources") === undefined && q1("SELECT mode FROM breach_playbooks WHERE rule_id = 'playbook-gap'").mode === "measure" && n("cloud_ops_events") === 0 && n("metric_breach_cause") === 5, "the savepoint restored the applied file", probeOf("ARM"));
// the registry rows that wait on a follow-up point at it, and the hold carries a dated expiry
const ctlIssue = (c) => (q1("SELECT issue_id FROM control_registry WHERE control = ?", c) || {}).issue_id;
ok(ctlIssue("breach-doctor-gap-hold") === fu("ARM").id && ctlIssue("breach-doctor-switch") === fu("WATCH").id && q1("SELECT issue_id FROM spof_registry").issue_id === fu("WATCH").id, "the gap hold points at the ARM issue; the SPOF and the switch's alternate path at the WATCH issue");
ok(qa("SELECT control FROM control_registry WHERE kind IN ('hold', 'filter', 'pause') AND issue_id IS NULL").length === 0, "every hold of the doctor has a live issue that releases it");
ok(/expiry 2026-10-27T00:00:00Z/.test(q1("SELECT evidence FROM control_registry WHERE control = 'breach-doctor-gap-hold'").evidence) && /Expiry: the hold lapses at 2026-10-27T00:00:00Z/.test(fu("ARM").description), "the hold records a dated expiry, in the registry and in the issue that releases it");
ok(/breach_selfheal_heavy_tick/.test(fu("RETIRE").description) && /deploy_merge_age_tick/.test(fu("RETIRE").description) && /BACKUP/.test(fu("RETIRE").description), "the retirement issue names the two writers and the BACKUP the migration needs");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(Object.keys(FU).map((k) => fu(k).description).join("\n")), "no issue text spells out a DELETE or DROP statement (the migration body is scanned for them)");

// ---- every seed playbook passes the engine's validators
for (const r of qa("SELECT * FROM breach_playbooks")) {
  const v = bdValidateRule(r);
  ok(v && v.ok === true, "seed playbook " + r.rule_id + " passes bdValidateRule", v);
  if (r.action_kind === "sql") {
    const act = JSON.parse(r.action_sql), rev = JSON.parse(r.revert_sql);
    ok(act.length >= 1 && act.length <= 6 && rev.length >= 1 && act.concat(rev).every((s) => s.includes("?1") && !s.includes(";")), r.rule_id + ": 1 to 6 per-issue statements, a revert, every one binds ?1 and has no semicolon");
  }
}

// ---- idempotence
const counts = () => ["agent_issues", "breach_causes", "metric_breach_cause", "queue_sla", "breach_diagnoses", "breach_diagnosis_events", "breach_playbooks", "ops_config", "metric_registry", "analytics_metric_triggers", "control_registry", "spof_registry", "belief_registry", "failure_modes", "remediation_contracts", "capability_ledger", "decision_log", "decision_predictions"].map((t) => n(t)).join(",");
const snap = () => JSON.stringify(["breach_playbooks", "agent_issues", "remediation_contracts", "control_registry", "spof_registry", "breach_causes", "metric_breach_cause"].map((t) => qa("SELECT * FROM " + t)));
const before = counts(), beforeRows = snap();
d.exec(sql);
ok(before === counts() && beforeRows === snap(), "a second apply changes nothing (counts and the rows of the playbooks, issues, contracts and registries)", [before, counts()]);

// ---- the seed rules over fixtures
const MS = 3600000, ageMs = (h) => Date.now() - h * MS;
let seq = 0;
const issue = (id, title, o = {}) => {
  d.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, close_channel, created_at, updated_at) VALUES (?, ?, ?, 'qnfo-fleet-control', ?, ?, ?, ?, ?)").run(id, title, o.desc ?? null, o.priority ?? "critical", o.status ?? "open", o.cc ?? null, ageMs(o.ageH ?? 30), Date.now());
  d.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01', ?)").run(id, o.evidence ?? null);
};
const task = (id, goal, status, o = {}) => d.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, pr_url, created_at, updated_at, merged_at, merged_sha, merged_by) VALUES (?, 'qnfo-workers', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  .run(id, o.path ?? "x/worker.js", goal, status, o.step ?? "propose", o.attempts ?? 9, o.pr ?? null, o.created ?? "2026-10-20T10:00:00.000Z", "2026-10-26T00:00:00Z", o.merged_at ?? null, o.sha ?? null, o.by ?? null);
const link = (t, pr, st, at) => d.prepare("INSERT INTO code_task_pr_links (task_id, pr_number, pr_state, merged_at) VALUES (?, ?, ?, ?)").run(t, pr, st, at);
// CM-R1: two issues whose task merged, one whose task failed, one blocked by a failing contract, one with a live claim
issue(100500, "CODE-MERGE-REFUSED-1: code task ct_im100444 (qnfo-backlog-exec/worker.js)");
task("ct_im100444", "CLOSE-CHANNEL -- issue #100444 (RED-DRAIN-1 dispatch).", "merged", { step: "done", attempts: 2, path: "qnfo-backlog-exec/worker.js", merged_at: "2026-10-22T03:44:53Z", sha: "cba81643221403b6f71e184204b33ec7b241bc06", pr: "https://github.com/QNFO/qnfo-workers/pull/3583", by: "github:rwnq8" });
link("ct_im100444", 3583, "merged", "2026-10-22T03:44:53Z");
issue(100501, "CODE-MERGE-REFUSED-1: code task ct_im100445 (qnfo-lifecycle/worker.js)");
task("ct_im100445", "X -- issue #100445 (RED-DRAIN-1 dispatch).", "merged", { step: "done", attempts: 1, merged_at: "2026-10-22T05:00:00Z", sha: "0123456789abcdef", pr: "https://github.com/QNFO/qnfo-workers/pull/3590", by: "github:rwnq8" });
issue(100999, "CODE-MERGE-REFUSED-1: code task ct_imfailed (x/worker.js)"); task("ct_imfailed", "g", "failed", { step: "done", attempts: 2 });
issue(100998, "CODE-MERGE-REFUSED-1: code task ct_imblocked (x/worker.js)"); task("ct_imblocked", "g", "merged", { step: "done", attempts: 2, merged_at: "2026-10-22T03:44:53Z", sha: "abcdef0123", pr: "https://github.com/QNFO/qnfo-workers/pull/1", by: "github:rwnq8" });
d.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-100998', 100998, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 'active', 'fail')").run();
issue(100997, "CODE-MERGE-REFUSED-1: code task ct_imclaimed (x/worker.js)"); task("ct_imclaimed", "g", "merged", { step: "done", attempts: 2, merged_at: "2026-10-22T03:44:53Z", sha: "abcdef0123", pr: "https://github.com/QNFO/qnfo-workers/pull/2", by: "github:rwnq8" });
d.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:100997', 'x', 'session_x', 100997, '2099-01-01T00:00:00Z')").run();
// CM-R2: the source issue closed with evidence closes the exhausted issue; a parent closed without evidence does not
issue(2047, "METRIC-TRIGGER-1238-X", { status: "closed", cc: "auto:verified-remediation-trigger", evidence: "remediation_verifications#171577 pass=1 class=issue-2047 transport=code-read" });
issue(100321, "CODE-LOOP-EXHAUSTED-1: ct_im2047 qnfo-cloud-ops/worker.js"); task("ct_im2047", "METRIC-TRIGGER-1238 -- issue #2047 (RED-DRAIN-1 dispatch).", "failed", { path: "qnfo-cloud-ops/worker.js" });
issue(555, "P no evidence", { status: "closed", cc: "session:evidence" });
issue(100777, "CODE-LOOP-EXHAUSTED-1: ct_im555 a/worker.js"); task("ct_im555", "x -- issue #555 (RED-DRAIN-1 dispatch).", "failed", { path: "a/worker.js" });
// CM-R3: twins on one source issue
issue(100355, "IL-CLOSE-VS-PROBE-2");
issue(100382, "CODE-LOOP-EXHAUSTED-1: ct_32n3q37l31e9h5 qnfo-fleet-control/worker.js"); task("ct_32n3q37l31e9h5", "[issue #100355] IL-CLOSE-VS-PROBE-2", "failed", { step: "verify" });
issue(100392, "CODE-LOOP-EXHAUSTED-1: ct_206b76jubryohp qnfo-fleet-control/worker.js"); task("ct_206b76jubryohp", "[issue #100355] [retry 2] IL-CLOSE-VS-PROBE-2", "failed", { step: "verify" });
// CM-R5: a sibling task merged after this one began
issue(100211, "RESEARCH-MODEL-COST-1");
issue(100549, "CODE-LOOP-EXHAUSTED-1: ct_k52qxgs3r3hswg qnfo-research-exec/worker.js"); task("ct_k52qxgs3r3hswg", "[issue #100211] [retry 1] RESEARCH-MODEL-COST-1", "failed", { created: "2026-10-23T02:22:52.048Z", path: "qnfo-research-exec/worker.js" });
task("ct_eg8bpejxuqc1qt", "[issue #100211] RESEARCH-MODEL-COST-1", "merged", { step: "done", attempts: 7, created: "2026-10-22T02:02:43.541Z", path: "qnfo-research-exec/worker.js", merged_at: "2026-10-23T13:52:56Z", sha: "8e4b2c1d99", pr: "https://github.com/QNFO/qnfo-workers/pull/3659", by: "github:rwnq8" });
link("ct_eg8bpejxuqc1qt", 3659, "merged", "2026-10-23T13:52:56Z");
// untouched: an exhausted issue whose source is open and has no sibling
issue(1000179, "DASH-API-405"); issue(1000242, "CODE-LOOP-EXHAUSTED-1: ct_im1000179 qnfo-fleet-dashboard/worker.js"); task("ct_im1000179", "DASH -- issue #1000179 (RED-DRAIN-1 dispatch).", "failed", { path: "qnfo-fleet-dashboard/worker.js" });
issue(77, "TOOL-FAILURE: git_clone [error]", { priority: "medium" });

const hits = (rid) => qa("SELECT * FROM (" + q1("SELECT trigger_sql t FROM breach_playbooks WHERE rule_id = ?", rid).t + ")");
const ids = (rid) => hits(rid).map((h) => h.issue_id).sort((x, y) => x - y);
ok(JSON.stringify(ids("CM-R1")) === "[100500,100501]", "CM-R1 names the two merged-after-refusal issues, not the failed task, the failing contract or the claimed issue", ids("CM-R1"));
ok(JSON.stringify(ids("CM-R2")) === "[100321]", "CM-R2 names the exhausted issue whose source closed with evidence (not the one closed without)", ids("CM-R2"));
ok(JSON.stringify(ids("CM-R3")) === "[100382]", "CM-R3 names the older twin", ids("CM-R3"));
ok(JSON.stringify(ids("CM-R5")) === "[100549]", "CM-R5 names the retry with a merged sibling", ids("CM-R5"));
for (const rid of ["CM-R1", "CM-R2", "CM-R3", "CM-R5"]) {
  const h = hits(rid)[0], keys = Object.keys(h).sort().join(",");
  ok(keys === "facts_json,issue_id,subject", rid + ": trigger_sql returns issue_id, subject, facts_json", keys);
  const f = JSON.parse(h.facts_json);
  ok(cx.api.bdFactsSafe(f) && /^[a-z0-9-]+$/.test(h.subject), rid + ": facts hold only numbers, ids and enum codes", f);
}
ok(hits("CM-R3")[0].facts_json.includes("\"successor_issue\":100392"), "CM-R3 facts name the successor");

const status = (id) => q1("SELECT status, close_channel FROM agent_issues WHERE id = ?", id);
const apply = (rid, id) => { let ch = 0; for (const s of JSON.parse(q1("SELECT action_sql a FROM breach_playbooks WHERE rule_id = ?", rid).a)) ch += Number(d.prepare(s).run(id).changes); return ch; };
const verify = (rid, id) => d.prepare(q1("SELECT verify_sql v FROM breach_playbooks WHERE rule_id = ?", rid).v).get(id);
const openIds = () => qa("SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id).join(",");
for (const [rid, id] of [["CM-R1", 100500], ["CM-R2", 100321], ["CM-R3", 100382], ["CM-R5", 100549]]) {
  const openBefore = openIds();
  ok(verify(rid, id).observed !== "ok", rid + ": verify_sql reads a reason before the action", verify(rid, id));
  ok(apply(rid, id) === 1, rid + ": the per-issue action changes one row", rid);
  const after = openIds();
  ok(openBefore.split(",").filter((x) => !after.split(",").includes(x)).join(",") === String(id), rid + ": it closed only issue " + id, [openBefore, after]);
  ok(status(id).status === "closed" && status(id).close_channel === "auto:triage-sync:breach-doctor", rid + ": closed through the live close-sync trigger as breach-doctor", status(id));
  const ev = q1("SELECT close_evidence e, rc FROM issue_triage WHERE issue_id = ?", id);
  ok(ev.rc === "breach-doctor:" + rid && ev.e.length > 80 && ev.e.includes("Closed by breach-doctor rule " + rid), rid + ": the close carries evidence naming the rule", ev);
  ok(!ev.e.includes(";"), rid + ": evidence holds no semicolon");
  const v = verify(rid, id);
  ok(v.expected === "ok" && v.observed === "ok", rid + ": verify_sql reads ok after the action", v);
  ok(apply(rid, id) === 0, rid + ": a second run of the action changes nothing");
}
ok(q1("SELECT close_evidence e FROM issue_triage WHERE issue_id = 100382").e.startsWith("SUPERSEDED BY #100392"), "CM-R3 supersedes with the successor's id first (doctrine section 6)");
ok(status(100392).status === "open" && status(1000179).status === "open" && status(100777).status === "open" && status(100999).status === "open" && status(100998).status === "open" && status(100997).status === "open" && status(100501).status === "open", "every issue the actions were not bound to stayed open");
ok(q1("SELECT COUNT(*) n FROM issue_triage WHERE rc LIKE 'breach-doctor:%'").n === 4, "exactly four issue_triage rows were written");
// revert: reopens and clears the evidence
for (const s of JSON.parse(q1("SELECT revert_sql r FROM breach_playbooks WHERE rule_id = 'CM-R1'").r)) d.prepare(s).run(100500);
ok(status(100500).status === "open" && status(100500).close_channel === null && q1("SELECT close_evidence e FROM issue_triage WHERE issue_id = 100500").e === null, "CM-R1 revert_sql reopens the issue and clears the evidence", status(100500));
ok(verify("CM-R1", 100500).observed === "issue-reopened", "and verify_sql then reads issue-reopened");
// a closing contract that fails blocks the close (the statement changes no row, it never aborts)
ok(apply("CM-R1", 100998) === 0 && status(100998).status === "open", "CM-R1 skips an issue whose active contract last failed");
ok(apply("CM-R1", 100997) === 0 && status(100997).status === "open", "CM-R1 skips an issue under a live work claim");
ok(apply("CM-R1", 100999) === 0, "CM-R1 skips an issue whose task did not merge");

// ---- v_breach_owner
const owner = (id) => (q1("SELECT owner_kind k FROM v_breach_owner WHERE issue_id = ?", id) || {}).k;
issue(900, "OWNED-1: code-task line", { desc: "x\ncode-task: repo=qnfo-workers path=a/worker.js" });
issue(901, "OWNED-2: live code task"); task("ct_a", "[issue #901] fix", "queued");
issue(902, "OWNED-3: live work claim"); d.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:902', 'x', 's', 902, '2099-01-01T00:00:00Z')").run();
issue(903, "OWNED-4: doctor lease"); issue(904, "OWNED-5: expired doctor lease"); issue(905, "OWNED-6: measure-mode case"); issue(906, "OWNED-7: owner card"); issue(907, "UNOWNED-1");
const iso = (agoMin) => new Date(Date.now() - agoMin * 60000).toISOString().slice(0, 19) + "Z";
const dg = (issue_id, state, o) => d.prepare("INSERT INTO breach_diagnoses (issue_id, case_key, family, rule_id, cause_class, facts_json, evidence_hash, action_kind, action_ref, state, mode, lease_until, last_progress_at) VALUES (?, 'k', 'f', 'r', 'c', '{}', 'h', ?, ?, ?, ?, ?, ?)")
  .run(issue_id, o.kind ?? "sql", o.ref === undefined ? "dl1" : o.ref, state, o.mode ?? "on", o.lease === undefined ? iso(-20) : o.lease, o.progress ?? iso(1));
dg(903, "applied", {});
dg(904, "applied", { lease: iso(5) });
dg(905, "applied", { mode: "measure" });
dg(906, "handed-owner", { kind: "owner-card", ref: "breach-doctor-r-906", lease: null });
d.prepare("INSERT INTO human_actions (slug, title, why) VALUES ('breach-doctor-r-906', 't', 'IDENTITY-BOUND: credential')").run();
ok(owner(900) === "code-task line" && owner(901) === "live code task" && owner(902) === "live work claim", "v_breach_owner keeps the three existing doer kinds");
ok(owner(903) === "breach doctor", "a live, progressing, backed doctor lease is an owner");
ok(owner(904) === null && owner(905) === null && owner(907) === null, "an expired lease, a measure-mode case and an unowned issue are not owners");
ok(owner(906) === "owner card (identity-bound)", "an open identity-bound card is an owner, reported apart");
const caseAge = () => q1(q1("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-breach-doctor-case-age'").p);
ok(caseAge().expected === "0" && caseAge().observed === "0", "fm-breach-doctor-case-age reads 0 while every in-flight case progressed within 120 minutes", caseAge());
d.prepare("UPDATE breach_diagnoses SET last_progress_at = ? WHERE issue_id = 903").run(iso(130));
ok(owner(903) === null, "a lease without progress in 120 minutes stops counting");
ok(Number(caseAge().observed) >= 130 && Number(caseAge().observed) < 140, "and fm-breach-doctor-case-age then reads the age in minutes of the oldest in-flight case", caseAge());
d.prepare("UPDATE breach_diagnoses SET state = 'failed' WHERE issue_id = 903").run();
ok(caseAge().observed === "0", "a settled (failed) case is not in flight: the detector reads 0 again", caseAge());
d.prepare("UPDATE human_actions SET status = 'resolved' WHERE slug = 'breach-doctor-r-906'").run();
ok(owner(906) === null, "a resolved card is no owner");

// ---- Rollback
const rollback = sql.match(/^-- Rollback: (.*)$/m)[1].replace(/; the three breach_\* tables stay.*$/, ";");
d.exec(rollback);
ok(!qa("SELECT name FROM sqlite_master WHERE type = 'view' AND name LIKE 'v_breach_%' AND name <> 'v_breach_selfheal'").length, "Rollback drops the three views");
ok(n("metric_registry") === 0 && n("analytics_metric_triggers") === 0 && n("control_registry") === 0 && n("spof_registry") === 0 && n("belief_registry") === 0 && n("failure_modes") === 0 && n("capability_ledger") === 0 && n("queue_sla") === 0 && n("remediation_contracts") === 5, "Rollback removes the metrics, triggers, registries, failure modes, queue_sla row and capability (the fixture's own contract and the four issue contracts stay)", [n("metric_registry"), n("remediation_contracts"), n("queue_sla")]);
ok(n("metric_breach_cause") === 0 && !q1("SELECT 1 x FROM breach_causes WHERE cause_key = 'breach-doctor'") && n("breach_causes") === 2, "Rollback removes the five mappings and the cause it added, and leaves the causes BREACH-ONE-MEANING-1 made");
ok(q1("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-%-1:%' AND status = 'open' AND source = 'session'").n === 4, "Rollback leaves the four follow-up issues open (an issue is closed only with close_evidence)");
ok(cfg("breach_doctor") === "off" && !cfg("breach_doctor_ai") && q1("SELECT COUNT(*) n FROM breach_playbooks WHERE enabled = 1").n === 0, "Rollback leaves breach_doctor = off (the engine stops) and disables every playbook");
ok(q1("SELECT name FROM sqlite_master WHERE name = 'breach_diagnoses'") && n("decision_log") === 1, "the ledger tables and the decision_log row stay");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
