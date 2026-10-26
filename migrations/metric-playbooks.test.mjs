// METRIC-PLAYBOOKS-1 offline suite (agent_issues 1000266, BREACH-DOCTOR-1 family METRIC): replays migrations/2026-10-26-metric-playbooks.sql on node:sqlite over the live column lists,
// the live close-sync and supersede triggers, the live v_metric_trigger_state view, the live remediation_verification_autoclose_ins trigger and migrations/2026-10-26-breach-doctor.sql, and runs the REAL
// breachDoctorTick of qnfo-fleet-control/worker.js (sliced out by its markers) against it. The file is data only: no worker change, no new engine table.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped in the body); the file adds metric_deps and three playbooks that pass the engine's own validators
// (bdValidateRule) against the unchanged engine allowlist, whose statements all bind ?1; MD-1 keeps the issue that bears the title evaluateMetricTriggers looks up, so the evaluator's own lookup never reopens
// the closed loser, and acts only when the survivor is at least as urgent; the one-time closes (99937, 2570 and 100225 superseded to the parent's issue, 99949 closed MOOT) touch only the issues the engine reads
// as owned by a line or task that has ended, leave an issue with a code task in flight alone, and leave exactly 3015, 99914 and 99915 to the doctor; over fixtures shaped like live qnfo-audit 2026-10-26 each rule's
// trigger_sql names the issues the audit named and not the look-alikes, its per-issue action changes only the issue it is bound to, closes it with evidence built from ids, counts and enum codes, its verify_sql
// reads a reason before and ok after, and its revert_sql restores the previous state; a claimed issue and an issue with a failing contract are not touched; the lever issues carry a code-probe each, an outcome
// contract only where it fails while the defect exists and is gated on the code part, and, with the live autoclose trigger installed, none closes before its code-read contract passes; end to end through
// breachDoctorTick every rule runs in measure for 30 minutes, then acts, verifies twice and settles as verified, with decision_log rows and breach_diagnosis_events, no taint drop and no failed case; a second
// apply of the file changes nothing; the Rollback line disables the playbooks and reopens what the file closed.
// Output MUST contain "0 failed" on success.   node migrations/metric-playbooks.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const here = (p) => new URL(p, import.meta.url);
const workerPath = process.env.BD_WORKER_PATH || here("../qnfo-fleet-control/worker.js");
const src = readFileSync(workerPath, "utf8");
const sql = readFileSync(here("./2026-10-26-metric-playbooks.sql"), "utf8");
const doctor = readFileSync(here("./2026-10-26-breach-doctor.sql"), "utf8");
const doctorFix = readFileSync(here("./2026-10-26-breach-doctor-fix.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

// ---- header and body
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/CREATE\s+TRIGGER/i.test(body) && !/\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+fleet_tick/i.test(body), "S7: no D1 trigger and no write to fleet_tick");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\[skip ci\]/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log and issue_lifecycle are only inserted into");
ok(!/\b(secret|credential|password|api[ _-]?key|private key|rotate|revoke|drop table)\b/i.test(body.split("INSERT INTO agent_issues").slice(1).join("")), "no issue text trips the code orchestrator PLAN_DENY_TEXT words");

// ---- the engine block, from the worker under test
const A = "// ---- BREACH-DOCTOR-1:BEGIN ----", B = "// ---- BREACH-DOCTOR-1:END ----";
const a = src.indexOf(A), b = src.indexOf(B);
const kw = src.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m);
ok(a > 0 && b > a && kw, "the worker carries the BREACH-DOCTOR-1 block and the write-keyword list");
if (!(a > 0 && b > a && kw)) { console.log(pass + " passed, " + fail + " failed"); process.exit(1); }
const verM = src.match(/^var VERSION = "([^"]*)"/m);
const loadApi = () => {
  const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, Error, Promise, isFinite, console: process.env.BD_DEBUG ? console : { error() {}, log() {} }, VERSION: verM ? verM[1] : "0.0.0", crypto: globalThis.crypto, TextEncoder, Uint8Array });
  vm.runInContext(kw[0] + "\n" + src.slice(a, b) + "\nthis.api = { breachDoctorTick, bdValidateRule, bdWriteWhy, bdFactsSafe };", cx);
  return cx.api;
};
const api = loadApi();
const allow = (src.match(/^var BD_WRITE_TABLES = (\[[^\]]*\]);$/m) || [])[1];
const tables = allow ? JSON.parse(allow) : [];
ok(["issue_triage", "agent_issues", "remediation_contracts", "issue_plans"].every((t) => tables.includes(t)) && !["metric_dispositions", "metric_registry", "analytics_metric_triggers", "ops_config", "human_actions"].some((t) => tables.includes(t)), "the engine allowlist is untouched by this file (the playbooks write issue_triage only; no kill switch, no trust list, no metric registry, no disposition table)", tables);
ok(!/metric_dispositions|metric-playbook-time-gate/.test(body), "the file builds no disposition table and no time-gate control (MD-7 is not built)");

// ---- the world: live column lists, live close and supersede triggers, the live view, the doctor migration
const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL this file extends");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const EXTRA_DDL = `
CREATE TABLE analytics_action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, fired_at TEXT DEFAULT (datetime('now')), metric_value REAL, action TEXT, queue_target TEXT, status TEXT DEFAULT 'fired', notes TEXT);
CREATE INDEX idx_aal_trigger_id ON analytics_action_log(trigger_id, id);
CREATE INDEX idx_aal_trigger_fired ON analytics_action_log(trigger_id, fired_at);
CREATE TABLE analytics_dash_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE analytics_dash_records (metric TEXT PRIMARY KEY, value TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title,
    CASE trim(t.operator) WHEN '>' THEN 'gt' WHEN '>=' THEN 'gte' WHEN '<' THEN 'lt' WHEN '<=' THEN 'lte' WHEN '=' THEN 'eq' WHEN '==' THEN 'eq' ELSE t.operator END AS operator,
    t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;
CREATE TRIGGER triage_superseded_contracts_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now') WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused'); END;
CREATE TRIGGER triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now') WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused'); END;
CREATE TRIGGER agent_issues_open_dup_annotate BEFORE INSERT ON agent_issues WHEN COALESCE(NEW.status, 'open') = 'open' AND EXISTS (SELECT 1 FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title))) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
`;
// the live trigger, verbatim from qnfo-audit sqlite_master (read 2026-10-26): it closes an issue when a pass=1 verification lands and no other active contract of the issue has a failing latest verification
const AUTOCLOSE_DDL = `CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND (lower(trim(v2.observed)) NOT LIKE 'pending%' OR (v2.observed GLOB '*[0-9]*' AND (v2.observed LIKE '%ceiling%' OR lower(v2.observed) LIKE '%target%' OR lower(v2.observed) LIKE '%threshold%' OR lower(v2.observed) LIKE '%limit%' OR lower(v2.observed) LIKE '%fewer than%' OR lower(v2.observed) LIKE '%more than%' OR v2.observed LIKE '% <= %' OR v2.observed LIKE '% >= %' OR v2.observed LIKE '% < %' OR v2.observed LIKE '% > %'))) ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND (lower(trim(v3.observed)) NOT LIKE 'pending%' OR (v3.observed GLOB '*[0-9]*' AND (v3.observed LIKE '%ceiling%' OR lower(v3.observed) LIKE '%target%' OR lower(v3.observed) LIKE '%threshold%' OR lower(v3.observed) LIKE '%limit%' OR lower(v3.observed) LIKE '%fewer than%' OR lower(v3.observed) LIKE '%more than%' OR v3.observed LIKE '% <= %' OR v3.observed LIKE '% >= %' OR v3.observed LIKE '% < %' OR v3.observed LIKE '% > %'))) ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host')) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'
    AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'));
END`;
const MS = 3600000, H = MS;
const iso = (agoMin) => new Date(Date.now() - agoMin * 60000).toISOString().slice(0, 19) + "Z";
const sqlTs = (agoMin) => new Date(Date.now() - agoMin * 60000).toISOString().slice(0, 19).replace("T", " ");
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);

function fixtures(raw, o = {}) {
  const issue = (id, title, x = {}) => {
    raw.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'qnfo-fleet-control', ?, ?, ?, ?)").run(id, title, x.desc ?? null, x.priority ?? "medium", x.status ?? "open", Date.now() - (x.ageH ?? 30) * H, Date.now());
    raw.prepare("INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  const trig = (id, key, en, op, thr, val, x = {}) => {
    raw.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled, notes) VALUES (?, ?, ?, 'registry', ?, ?, 5, 'a', 'qnfo-fleet-control', ?, ?, ?)").run(id, key, x.title ?? key + " title", op, thr, x.target ?? "agent_issues", en, x.notes ?? null);
    raw.prepare("INSERT OR REPLACE INTO metric_registry (metric, layer, kind, last_value, last_refreshed, state, refresh_cadence) VALUES (?, 'operational', 'target', ?, ?, 'MEASURED', ?)").run(key, val === null ? null : String(val), iso(2), x.cadence ?? "hourly");
  };
  const task = (id, goal, status) => raw.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at) VALUES (?, 'qnfo-workers', 'x/worker.js', ?, ?, 'done', 1, '2026-10-19T10:00:00.000Z', '2026-10-20T00:00:00Z')").run(id, goal, status);
  const CT = "x\ncode-task: repo=qnfo-workers path=qnfo-research-exec/worker.js";
  // --- stranded children (live 2026-10-26): disabled triggers whose meaning moved to a parent metric, with a stale code-task line
  trig(3689, "monthly_cost_run_rate_usd", 1, "gt", 95, 700); issue(99938, "METRIC-TRIGGER-3689-MONTHLY-COST-RUN-RATE-USD: Cost: all-billing", { priority: "medium" });
  trig(9901, "issues_over_24h_no_doer", 1, "gt", 0, 289); issue(100301, "METRIC-TRIGGER-9901-ISSUES-OVER-24H-NO-DOER: Open issues older than 24 h", { priority: "medium" });
  trig(3464, "mttr_h_7d", 1, "gt", 2, 48.8); issue(99935, "METRIC-TRIGGER-3464-MTTR-H-7D: Doctrine breach: repair time", { priority: "medium" });
  trig(3687, "workers_ai_run_rate_usd", 0, "gt", 95, 660); issue(99937, "METRIC-TRIGGER-3687-WORKERS-AI-RUN-RATE-USD: Cost: Workers AI", { desc: CT, priority: "medium" });
  task("ct_7i753c8gmtb38z", "[issue #99937] METRIC-TRIGGER-3687-WORKERS-AI-RUN-RATE-USD: x", "merged"); task("ct_im99937", "METRIC-TRIGGER-3687-WORKERS-AI-RUN-RATE-USD: x", "merged");
  trig(5944, "open_issues_without_doer_120m", 0, "gt", 190, 278); issue(2570, "METRIC-TRIGGER-5944-OPEN-ISSUES-WITHOUT-DOER-120M: Self-heal", { desc: CT, priority: "medium" });
  task("ct_im2570", "METRIC-TRIGGER-5944-OPEN-ISSUES-WITHOUT-DOER-120M: x", "closed");
  trig(5916, "papers_live_failing_release_gate", 0, "gt", 0, 246); issue(99949, "METRIC-TRIGGER-5916-PAPERS-LIVE-FAILING-RELEASE-GATE: Content", { desc: CT, priority: "medium" });
  task("ct_cl1domo3wy60p9", "[issue #99949] METRIC-TRIGGER-5916-PAPERS-LIVE-FAILING-RELEASE-GATE: x", "merged"); task("ct_im99949", "METRIC-TRIGGER-5916-PAPERS-LIVE-FAILING-RELEASE-GATE: x", "merged");
  // 99915 has no code-task line and no code task on live (live_ct = 0): the doctor reaches it. In the inflight world a covered child with a code task still in flight must be left alone by the one-time close.
  trig(1959, "issues_without_next_action", 0, "gt", 0, 144); issue(99915, "METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: Autonomy gap", { desc: o.inflight ? CT : null, priority: "high" });
  if (o.inflight) task("ct_live99915", "[issue #99915] METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: x", "queued");
  // --- covered children the doctor reaches (no code-task line): present when the file is applied, so it raises their parents once (99938 to critical)
  // 100225 has no code-task line either, but its planner task merged: bdLoadState reads any code_tasks row [issue #N] outside failed/closed/superseded/needs_human as a live code task (live: ct_f1fd327k5oyfkr, status merged)
  trig(409, "fleet_ai_run_rate_30d_usd", 0, "gt", 95, 752.87); issue(100225, "METRIC-TRIGGER-409-FLEET-AI-RUN-RATE-30D-USD: Fleet AI run-rate", { priority: "critical" });
  task("ct_f1fd327k5oyfkr", "[issue #100225] METRIC-TRIGGER-409-FLEET-AI-RUN-RATE-30D-USD: Fleet AI run-rate above $95/30d (the fleet's own live spend)\nIn the three-element WRITER_FALLBACK_MODELS array ...", "merged");
  if (o.inflight) task("ct_live100225", "[issue #100225] METRIC-TRIGGER-409-FLEET-AI-RUN-RATE-30D-USD: a second task", "queued");
  trig(3688, "fleet_cost_run_rate_usd", 0, "gt", 160, 694.95); issue(3015, "METRIC-TRIGGER-3688-FLEET-COST-RUN-RATE-USD: Cost: Cloudflare", { priority: "medium" });
  trig(410, "issue_mttr_h_30d", 0, "gt", 2, 12.99); issue(99914, "METRIC-TRIGGER-410-ISSUE-MTTR-H-30D: Autonomy gap: the median", { priority: "medium" });
  if (o.stop === "stranded") return;
  // look-alikes: a child more urgent than its parent that nobody raised (the playbook cannot raise it, so the child stays open)
  trig(7005, "urgent_child_metric", 0, "gt", 1, 5); issue(7105, "METRIC-TRIGGER-7005-URGENT-CHILD-METRIC: critical child", { priority: "critical" });
  trig(7006, "lowprio_parent_metric", 1, "gt", 1, 5); issue(7106, "METRIC-TRIGGER-7006-LOWPRIO-PARENT-METRIC: low parent", { priority: "low" });
  raw.prepare("INSERT INTO metric_deps (child_metric, parent_metric, relation, note) VALUES ('urgent_child_metric', 'lowprio_parent_metric', 'disabled-duplicate', 'fixture')").run();
  // more look-alikes: a disabled trigger with no dep, an ENABLED trigger with a dep row, a covered child whose parent has no open issue
  trig(7001, "orphan_no_dep_metric", 0, "gt", 1, 5); issue(7101, "METRIC-TRIGGER-7001-ORPHAN-NO-DEP-METRIC: no parent", { priority: "medium" });
  trig(7002, "parentless_child_metric", 0, "gt", 1, 5); issue(7102, "METRIC-TRIGGER-7002-PARENTLESS-CHILD-METRIC: parent has no issue", { priority: "medium" });
  trig(7003, "parent_without_issue_metric", 1, "gt", 1, 0);
  raw.prepare("INSERT INTO metric_deps (child_metric, parent_metric, relation, note) VALUES ('parentless_child_metric', 'parent_without_issue_metric', 'disabled-duplicate', 'fixture')").run();
  trig(7004, "enabled_child_metric", 1, "gt", 1, 5); issue(7103, "METRIC-TRIGGER-7004-ENABLED-CHILD-METRIC: enabled child", { priority: "medium" });
  raw.prepare("INSERT INTO metric_deps (child_metric, parent_metric, relation, note) VALUES ('enabled_child_metric', 'monthly_cost_run_rate_usd', 'disabled-duplicate', 'fixture')").run();
  // --- MD-1 duplicates. evaluateMetricTriggers looks the issue up by lower(trim(title)) = its current title over open, monitoring AND closed, and reopens a closed match: the survivor must be the issue that bears the current title.
  // trigger 354 has the live title below; 100226 bears it, 99924 has the old title, both critical (equal priority: the lowest id used to survive, which was the wrong one).
  const T354 = "Cost gap: Workers AI cost over $95/30d (target $78 = 2.59/day, owner 2026-10-09)";
  trig(354, "workers_ai_cost_30d_usd", 1, "gt", 95, 298, { title: T354 }); issue(99924, "METRIC-TRIGGER-354-WORKERS-AI-COST-30D-USD: Cost gap: Workers AI spend over $10", { priority: "critical" }); issue(100226, "METRIC-TRIGGER-354-WORKERS-AI-COST-30D-USD: " + T354, { priority: "critical" });
  trig(7777, "dup_priority_metric", 1, "gt", 1, 5, { title: "new title" }); issue(5001, "METRIC-TRIGGER-7777-DUP-PRIORITY-METRIC: old title", { priority: "low" }); issue(5002, "METRIC-TRIGGER-7777-DUP-PRIORITY-METRIC: new title", { priority: "critical" });
  trig(8888, "breaches_without_ticket", 1, "gt", 0, 0); issue(100088, "METRIC-TRIGGER-8888-BREACHES-WITHOUT-TICKET: Breaches with no ticket", { priority: "high" }); issue(1000015, "METRIC-TRIGGER: breaches_without_ticket", { priority: "high" });
  trig(7778, "dup_blocked_metric", 1, "gt", 1, 5); issue(5003, "METRIC-TRIGGER-7778-DUP-BLOCKED-METRIC: a", { priority: "medium" }); issue(5004, "METRIC-TRIGGER-7778-DUP-BLOCKED-METRIC: b", { priority: "medium" });
  raw.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail', verify_probe = 'SELECT 1' WHERE issue_id = 5004").run();
  trig(7779, "dup_claimed_metric", 1, "gt", 1, 5); issue(5005, "METRIC-TRIGGER-7779-DUP-CLAIMED-METRIC: a", { priority: "medium" }); issue(5006, "METRIC-TRIGGER-7779-DUP-CLAIMED-METRIC: b", { priority: "medium" });
  raw.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:5006', 'x', 'session_x', 5006, '2099-01-01T00:00:00Z')").run();
  trig(7780, "single_metric", 1, "gt", 1, 5); issue(5007, "METRIC-TRIGGER-7780-SINGLE-METRIC: only one", { priority: "medium" });
  // the issue with the old title is MORE urgent than the one with the current title: the survivor would be less urgent than the loser, so the playbook leaves the pair alone (it cannot raise a priority)
  trig(7781, "urgent_old_metric", 1, "gt", 1, 5, { title: "current title" }); issue(5008, "METRIC-TRIGGER-7781-URGENT-OLD-METRIC: old title", { priority: "critical" }); issue(5009, "METRIC-TRIGGER-7781-URGENT-OLD-METRIC: current title", { priority: "medium" });
  // equal priority and the LOWEST id bears the current title: it survives, the later old-title issue goes
  trig(7782, "low_id_current_metric", 1, "gt", 1, 5, { title: "current title" }); issue(5010, "METRIC-TRIGGER-7782-LOW-ID-CURRENT-METRIC: current title", { priority: "medium" }); issue(5011, "METRIC-TRIGGER-7782-LOW-ID-CURRENT-METRIC: old title", { priority: "medium" });
  // --- MD-4 recovered but open: a streak of 200 minutes (hit), 30 minutes (young), reset by a relapse, a queue target that is not agent_issues, a metric that is hit again
  const log = (tid, status, agoMin) => raw.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, metric_value, action, queue_target, status) VALUES (?, ?, 1, 'a', 'agent_issues', ?)").run(tid, sqlTs(agoMin), status);
  trig(6001, "recovered_old_metric", 1, "gt", 10, 4); issue(6101, "METRIC-TRIGGER-6001-RECOVERED-OLD-METRIC: was high", { priority: "high" }); log(6001, "dispatched", 500); log(6001, "recovering", 200);
  trig(6002, "recovered_young_metric", 1, "gt", 10, 4); issue(6102, "METRIC-TRIGGER-6002-RECOVERED-YOUNG-METRIC: was high", { priority: "high" }); log(6002, "dispatched", 500); log(6002, "recovering", 30);
  trig(6003, "recovered_relapsed_metric", 1, "gt", 10, 4); issue(6103, "METRIC-TRIGGER-6003-RECOVERED-RELAPSED-METRIC: was high", { priority: "high" }); log(6003, "dispatched", 500); log(6003, "recovering", 300); log(6003, "relapsed", 250);
  trig(6004, "recovered_alert_metric", 1, "gt", 10, 4, { target: "alerts" }); issue(6104, "METRIC-TRIGGER-6004-RECOVERED-ALERT-METRIC: was high", { priority: "high" }); log(6004, "dispatched", 500); log(6004, "recovering", 200);
  trig(6005, "hit_again_metric", 1, "gt", 10, 40); issue(6105, "METRIC-TRIGGER-6005-HIT-AGAIN-METRIC: still high", { priority: "high" }); log(6005, "dispatched", 500); log(6005, "recovering", 200);
  trig(6006, "recovered_claimed_metric", 1, "gt", 10, 4); issue(6106, "METRIC-TRIGGER-6006-RECOVERED-CLAIMED-METRIC: was high", { priority: "high" }); log(6006, "dispatched", 500); log(6006, "recovering", 200);
  raw.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:6106', 'x', 'session_x', 6106, '2099-01-01T00:00:00Z')").run();
  // --- other families the playbooks must not touch
  issue(900, "TOOL-FAILURE: git_clone [error]", { priority: "medium" });
}

function world(o = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(BASE_DDL);
  raw.exec(EXTRA_DDL);
  raw.exec(doctor);
  raw.exec(doctorFix);
  fixtures(raw, { ...o, stop: "stranded" });
  raw.exec(sql);
  if (o.autoclose) raw.exec(AUTOCLOSE_DDL);
  if (!o.stranded) fixtures2(raw, o);
  return raw;
}
// the fixtures of the doctor-reachable rules go in after the file is applied (the one-time closes must see only the stranded set)
function fixtures2(raw, o) {
  // run the same fixture function but skip what already exists: insert the second half by re-running with INSERT OR IGNORE semantics through a tiny wrapper
  const orig = raw.prepare.bind(raw);
  const wrapped = { prepare: (s) => orig(s.replace(/^INSERT INTO (agent_issues|analytics_metric_triggers|code_tasks|work_claims|remediation_contracts|analytics_action_log|fleet_tick|metric_deps) /, "INSERT OR IGNORE INTO $1 ")), exec: raw.exec.bind(raw) };
  fixtures(wrapped, o);
}

const raw = world();
const d = raw;
const n = (t) => q1(d, "SELECT COUNT(*) n FROM " + t).n;
const status = (id) => q1(d, "SELECT status, close_channel FROM agent_issues WHERE id = ?", id);
const evidence = (id) => (q1(d, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id) || {}).e;
const pb = (rid) => q1(d, "SELECT * FROM breach_playbooks WHERE rule_id = ?", rid);

// bdLoadState's reading of an owned issue, on the fixture: a code-task line in an open issue, or a code_tasks row whose goal starts with [issue #N] and whose status is outside failed/closed/superseded/needs_human
const ownedSet = (db) => {
  const o = new Set(qa(db, "SELECT id FROM agent_issues WHERE status = 'open' AND instr(COALESCE(description, ''), 'code-task:') > 0").map((r) => r.id));
  for (const r of qa(db, "SELECT goal FROM code_tasks WHERE status NOT IN ('failed', 'closed', 'superseded', 'needs_human')")) { const m = /^\[issue #(\d+)\]/i.exec(String(r.goal || "")); if (m) o.add(Number(m[1])); }
  return o;
};

// ---- what the file added
ok(q1(d, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'metric_deps'"), "table metric_deps");
ok(!q1(d, "SELECT name FROM sqlite_master WHERE name = 'metric_dispositions'"), "no metric_dispositions table: MD-7 is not built");
ok(qa(d, "SELECT rule_id FROM breach_playbooks ORDER BY rule_id").map((r) => r.rule_id).join(",") === "CM-R1,CM-R2,CM-R3,CM-R5,MD-1,MD-4,MD-6,playbook-gap", "three playbooks added beside the doctor's five: MD-1, MD-4, MD-6");
ok(qa(d, "SELECT rule_id FROM breach_playbooks WHERE rule_id LIKE 'MD-%' AND enabled = 1 AND mode = 'on' AND action_kind = 'sql' AND family = 'METRIC-TRIGGER'").length === 3, "all three are enabled, mode on (the engine holds each in measure for 30 minutes), sql, family METRIC-TRIGGER");
ok(qa(d, "SELECT child_metric FROM metric_deps WHERE note LIKE 'BREACH-ONE-MEANING-1:%' AND relation = 'disabled-duplicate' AND child_metric IN ('fleet_ai_run_rate_30d_usd','workers_ai_run_rate_usd','fleet_cost_run_rate_usd','issue_mttr_h_30d','issues_without_next_action','open_issues_without_doer_120m')").length === 6 && qa(d, "SELECT child_metric FROM metric_deps WHERE note NOT LIKE 'BREACH-ONE-MEANING-1:%' AND note <> 'fixture'").length === 0 && qa(d, "SELECT child_metric FROM metric_deps WHERE relation <> 'disabled-duplicate'").length === 0, "metric_deps holds the six children BREACH-ONE-MEANING-1 disabled and nothing else from the file (no heartbeat relation)");
for (const r of qa(d, "SELECT * FROM breach_playbooks WHERE rule_id LIKE 'MD-%'")) {
  const v = api.bdValidateRule(r);
  ok(v && v.ok === true, "playbook " + r.rule_id + " passes the engine's bdValidateRule", v);
  const act = JSON.parse(r.action_sql), rev = JSON.parse(r.revert_sql);
  ok(act.length >= 1 && act.length <= 6 && rev.length >= 1 && act.concat(rev).every((s) => s.includes("?1") && !s.includes(";")), r.rule_id + ": 1 to 6 per-issue statements, a revert, every one binds ?1 and has no semicolon");
  ok(r.max_per_tick <= 6 && r.max_per_day <= 24 && r.note.length > 200, r.rule_id + ": per-tick and per-day caps, a note with the live measurement");
  ok(!/\b(update|insert|replace|delete|drop|create|alter) /i.test(r.trigger_sql.replace(/'(?:[^']|'')*'/g, "''")) && !/\b(update|insert|replace|delete|drop|create|alter) /i.test(r.verify_sql.replace(/'(?:[^']|'')*'/g, "''")), r.rule_id + ": trigger_sql and verify_sql hold no write keyword outside a literal");
}
// the validator is the real one and its allowlist is unchanged: the same MD-6 row pointed at a table outside it is refused
{
  const row = pb("MD-6"), swapped = { ...row, action_sql: row.action_sql.replace(/issue_triage/g, "metric_registry") };
  ok(api.bdValidateRule(swapped).ok === false && /table-not-allowed/.test(api.bdValidateRule(swapped).why), "a write to metric_registry is still refused (table-not-allowed)", api.bdValidateRule(swapped));
}

// ---- the one-time closes (the file was applied over the stranded set only)
ok(status(99937).status === "closed" && evidence(99937).startsWith("SUPERSEDED BY #99938: metric trigger 3687 is disabled (enabled=0)"), "99937 (covered child, stale code-task line, merged tasks) is superseded to the parent's issue 99938", evidence(99937));
ok(status(2570).status === "closed" && evidence(2570).startsWith("SUPERSEDED BY #100301: metric trigger 5944 is disabled"), "2570 (covered child, closed task) is superseded to the parent's issue 100301", evidence(2570));
ok(status(100225).status === "closed" && evidence(100225).startsWith("SUPERSEDED BY #99938: metric trigger 409 is disabled (enabled=0) and metric_deps relation disabled-duplicate names metric monthly_cost_run_rate_usd") && /Closed once by migration 2026-10-26-metric-playbooks/.test(evidence(100225)), "100225 (covered child with NO code-task line whose code task ct_f1fd327k5oyfkr merged, which the engine reads as a live code task) is superseded to 99938", evidence(100225));
ok(status(99949).status === "closed" && evidence(99949).startsWith("MOOT: metric trigger 5916") && /ct_cl1domo3wy60p9 and ct_im99949/.test(evidence(99949)), "99949 (disabled trigger with no parent, tasks merged) is closed MOOT with the trigger and task ids", evidence(99949));
ok(status(3015).status === "open" && status(99914).status === "open" && status(99915).status === "open", "the three covered children the doctor does reach (3015, 99914, 99915) are left to it");
ok(status(99938).status === "open" && status(100301).status === "open" && status(99935).status === "open", "the parents' issues stay open");
{
  const pr = (id) => q1(d, "SELECT priority p FROM agent_issues WHERE id = ?", id).p;
  ok(pr(99938) === "critical" && pr(100301) === "high" && pr(99935) === "medium", "the parents carry the urgency of their children once: 99938 critical (child 100225, which this file supersedes into it), 100301 high (child 99915), 99935 medium (child 99914)", [pr(99938), pr(100301), pr(99935)]);
  const bak = qa(d, "SELECT id, priority FROM bak_20261026_metric_playbooks_priority ORDER BY id");
  ok(JSON.stringify(bak) === JSON.stringify([{ id: 99935, priority: "medium" }, { id: 99938, priority: "medium" }, { id: 100301, priority: "medium" }]), "bak_20261026_metric_playbooks_priority keeps the previous priorities of the three parents", bak);
  ok(pr(100225) === "critical" && pr(99915) === "high", "the children keep their own priority");
}
ok(/Closed once by migration 2026-10-26-metric-playbooks/.test(evidence(99937)) && !/\bdescription\b/i.test(evidence(99937)), "the one-time evidence names the migration and holds no issue text");
ok(qa(d, "SELECT issue_id FROM issue_triage WHERE rc = 'breach-doctor:MD-6:migration' ORDER BY issue_id").map((r) => r.issue_id).join(",") === "2570,99937,99949,100225", "exactly four issue_triage rows carry the migration marker: 2570, 99937, 99949, 100225");
{
  // nothing the doctor cannot reach is left stranded: no open covered child is owned in bdLoadState's reading, and the owned set holds none of the three the doctor must reach
  const owned = ownedSet(d);
  const covered = qa(d, "SELECT a.id FROM agent_issues a JOIN analytics_metric_triggers t ON a.title LIKE 'METRIC-TRIGGER-' || t.id || '-%' AND t.enabled = 0 JOIN metric_deps m ON m.child_metric = t.metric_key AND m.active = 1 AND m.relation = 'disabled-duplicate' WHERE a.status = 'open'").map((r) => r.id);
  ok(covered.length >= 3 && covered.every((i) => !owned.has(i)), "after the file no open covered child is one the engine reads as owned (a stale line or a merged task)", covered.filter((i) => owned.has(i)));
}
{
  // a code task still in flight keeps a covered child out of the one-time close, whatever else has ended
  const wi = world({ inflight: true });
  const st = (id) => q1(wi, "SELECT status FROM agent_issues WHERE id = ?", id).status;
  ok(st(99915) === "open" && st(100225) === "open", "a covered child with a code task in flight (a queued task and a line on 99915, a queued task beside the merged one on 100225) is left alone by the one-time close");
  ok(st(99937) === "closed" && st(2570) === "closed" && st(99949) === "closed", "and the stranded issues without one are still closed");
}

// ---- idempotence
const SNAP_T = ["breach_playbooks", "metric_deps", "agent_issues", "issue_triage", "remediation_contracts", "control_registry", "failure_modes", "capability_ledger", "decision_log", "bak_20261026_metric_playbooks_priority"];
const snapOf = () => Object.fromEntries(SNAP_T.map((t) => [t, JSON.stringify(qa(d, "SELECT * FROM " + t))]));
{
  // replay on a world that holds only what the file saw when it was first applied (a child filed in between would, by design, get its parent raised by a replay)
  const w1 = world({ stranded: true });
  const snapW = () => Object.fromEntries(SNAP_T.map((t) => [t, JSON.stringify(qa(w1, "SELECT * FROM " + t))]));
  const before = snapW();
  w1.exec(sql);
  const after = snapW();
  ok(SNAP_T.every((t) => before[t] === after[t]), "a second apply changes nothing (playbooks, deps, issues, triage, contracts, registries, decision_log, the priority backup)", SNAP_T.filter((t) => before[t] !== after[t]));
  ok(JSON.parse(before.agent_issues).length > 10 && JSON.parse(before.decision_log).length >= 2, "and the replay world is not empty");
}

// ---- the lever issues, contracts, registries
const wsrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
const count = (t) => { let c = 0, i = 0; while ((i = t.length ? wsrc.indexOf(t, i) : -1) >= 0) { c++; i += t.length; } return c; };
{
  const lev = qa(d, "SELECT id, title, description, source, priority FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-1: MD-P%' ORDER BY id");
  const keyOf = (r) => r.title.replace(/^BREACH-DOCTOR-1: (MD-P\w+) .*/, "$1");
  ok(lev.length === 5 && lev.every((r) => r.source === "qnfo-fleet-control" && r.priority !== "critical"), "five lever issues, source qnfo-fleet-control (the trusted pair BREACH-DOCTOR-1:), none critical", lev.map((r) => r.title.slice(0, 50)));
  ok(lev.map(keyOf).join(",") === "MD-P1a,MD-P1b,MD-P1c,MD-P2,MD-P4", "MD-P1a, MD-P1b, MD-P1c, MD-P2, MD-P4", lev.map(keyOf));
  const byKey = Object.fromEntries(lev.map((r) => [keyOf(r), r]));
  const line = (r, pfx) => ((r.description + "\n").split("\n").find((l) => l.startsWith(pfx)) || "").slice(pfx.length);
  const contract = (r, suffix = "") => q1(d, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + r.id + suffix);
  // OWNER-NO-LOOSE-ENDS-1 / NO-CLAUDE-RUNTIME-DEPENDENCY-1: every lever has a fleet doer (a code-task line for the code loop), none is handed to a session
  ok(lev.every((r) => /^code-task: repo=qnfo-workers path=\S+$/m.test(r.description) && /^code-probe: \{/m.test(r.description)) && !lev.some((r) => /Doer: a session|a session doer/i.test(r.description)), "every lever carries a code-task line and a code-probe line and none names a session as its doer");
  const wcode = lev.filter((r) => line(r, "code-task: ") === "repo=qnfo-workers path=qnfo-fleet-control/worker.js");
  ok(wcode.length === 4 && wcode.every((r) => /^code-anchor: /m.test(r.description)), "four levers edit qnfo-fleet-control/worker.js with a code-anchor each", wcode.length);
  for (const r of wcode) {
    const anchor = line(r, "code-anchor: "), probe = JSON.parse(line(r, "code-probe: "));
    const k = probe.contains !== undefined ? "contains" : "absent", text = probe[k];
    const lands = k === "contains" ? count(text) >= 1 : count(text) === 0;
    ok(anchor.length > 15 && text.length >= 8, keyOf(r) + ": the anchor is a real line and the probe text is not trivial");
    // the lever is open: the anchor is one line of the file. Once the code loop lands the edit the probe passes and the anchor may have moved, and this suite must stay green on that merge.
    if (!process.env.BD_WORKER_PATH) ok(count(anchor) === 1 || lands, keyOf(r) + ": the code-anchor occurs exactly once in qnfo-fleet-control/worker.js (or the lever has landed and its probe passes)", count(anchor));
    const c = contract(r);
    ok(c && c.verify_transport === "code-read" && c.status === "active" && JSON.stringify(JSON.parse(c.verify_probe)) === JSON.stringify(probe), keyOf(r) + ": the code-read contract carries the probe of the issue text and is the closing probe of the code part", c);
  }
  // MD-P1a / MD-P1b: the symptom checks read ok at birth, so they are NOT contracts (an outcome that passes at birth lets the live autoclose trigger close the issue before any code change)
  ok(!contract(byKey["MD-P1a"], "-outcome") && !contract(byKey["MD-P1b"], "-outcome"), "MD-P1a and MD-P1b carry the code-read contract alone: no d1 outcome contract that already reads ok");
  ok(/closing probe of this issue and the only contract it carries/.test(byKey["MD-P1a"].description) && /closing probe of this issue and the only contract it carries/.test(byKey["MD-P1b"].description), "and their text says the code-probe is the closing probe");
  for (const kk of ["MD-P1c", "MD-P2", "MD-P4"]) {
    const o = contract(byKey[kk], "-outcome"), res = o && d.prepare(o.verify_probe).get();
    ok(o && o.verify_transport === "d1-query" && o.status === "active" && res && res.expected === "ok" && typeof res.observed === "string" && res.observed !== "ok", kk + ": a d1 outcome contract that reads a reason in the fresh state (it cannot pass at birth)", res);
  }
  // MD-P4: a new migration file, a fleet doer, no threshold lowered
  const p4 = byKey["MD-P4"], probe4 = JSON.parse(line(p4, "code-probe: "));
  ok(line(p4, "code-task: ") === "repo=qnfo-workers path=migrations/2026-10-26-tick-sequence-cap.sql" && !/^code-anchor: /m.test(p4.description), "MD-P4: a code-task line for a new migration file (no anchor: the file does not exist yet), not a session doer");
  ok(probe4.paths.join() === "migrations/2026-10-26-tick-sequence-cap.sql" && probe4.contains === "MIN(1", "MD-P4: the code-probe reads that file for the MIN(1 cap", probe4);
  const mf = here("./2026-10-26-tick-sequence-cap.sql");
  ok(!existsSync(mf) || readFileSync(mf, "utf8").includes("MIN(1"), "MD-P4: the probe fails while the file is absent and passes only with the cap in it");
  ok(/over-counted ratio/.test(p4.description) && /1\.042/.test(p4.description) && /lowers? no threshold|no threshold is lowered/.test(p4.description) && /INTEGRITY-GUARDS-1/.test(p4.description), "MD-P4 says it corrects an over-counted ratio and lowers no threshold (INTEGRITY-GUARDS-1)");
  // MD-P1c measures what the lever changes
  ok(/within 60 minutes of the close/.test(byKey["MD-P1c"].description) && /36 of 166, 22 percent/.test(byKey["MD-P1c"].description) && !/29 percent/.test(byKey["MD-P1c"].description), "MD-P1c states the 22 percent the lever can avoid and measures closes reopened within 60 minutes of the close");
  // MD-P2 says only what is true about triggers
  const p2 = byKey["MD-P2"];
  ok(/improvement_rate_7d 387, fix_hold_rate_30d 388, open_agent_issues 362/.test(p2.description) && /NO trigger row \(metric_regressions_7d, metrics_in_breach, fix_target_hold_rate_30d\)/.test(p2.description) && !/the metric has its own trigger/.test(p2.description) && /IL_SELF_SET = \{ improvement_rate_7d: 1, fix_hold_rate_30d: 1, open_agent_issues: 1 \}/.test(p2.description) && /ilHasOwnTrigger/.test(p2.description), "MD-P2 limits the set to the three metrics with an enabled trigger and names the three without one as judged as before");
}
{
  // outcome probes in a world of their own (no autoclose trigger): each reads a reason until the code part has a passing verification
  const wp = world({ stranded: true });
  const idOf = (k) => q1(wp, "SELECT id FROM agent_issues WHERE title LIKE ?", "BREACH-DOCTOR-1: " + k + " %").id;
  const outP = (k) => wp.prepare(q1(wp, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + idOf(k) + "-outcome").p).get();
  const codePass = (k) => wp.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier) VALUES (?, ?, 'code-read', 'ok', 'ok', 1, 'test')").run(idOf(k), "issue-" + idOf(k));
  const GATE = "the code part of this issue has no passing verification yet";
  // MD-P1c: closes reopened within 60 minutes of the close in 24 h
  ok(outP("MD-P1c").observed === GATE, "MD-P1c outcome reads the gate reason while the code part has no passing verification, even with no churn at all");
  codePass("MD-P1c");
  ok(outP("MD-P1c").observed === "ok", "and ok once the code part passes and there is no churn");
  const quick = (gapMin, agoMin) => { wp.prepare("INSERT INTO issue_lifecycle (issue_id, event, to_status, ts) VALUES (99938, 'closed', 'closed', ?)").run(iso(agoMin + gapMin)); wp.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (99938, 'reopened', 'closed', 'open', ?)").run(iso(agoMin)); };
  for (let i = 0; i < 5; i++) quick(30, 100 + i * 10);
  for (let i = 0; i < 4; i++) quick(90, 400 + i * 10);
  for (let i = 0; i < 3; i++) quick(30, 1500 + i * 10);
  ok(outP("MD-P1c").observed === "ok", "MD-P1c: 5 closes reopened within 60 minutes pass; reopens after a 90 minute gap and reopens older than 24 h are not counted");
  quick(30, 20);
  ok(/^more than 5 METRIC-TRIGGER closes were reopened within 60 minutes of the close in 24 hours$/.test(outP("MD-P1c").observed), "and a sixth reads the reason", outP("MD-P1c"));
  // MD-P2: a regression issue for a metric that has an enabled trigger of its own
  ok(outP("MD-P2").observed === GATE, "MD-P2 outcome reads the gate reason while the code part has no passing verification");
  codePass("MD-P2");
  ok(outP("MD-P2").observed === "ok", "and ok once the code part passes and no such issue is open");
  wp.exec("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (387, 'improvement_rate_7d', 'Improvement gap', 'registry', 'lt', 0.3, 5, 'a', 'qnfo-fleet-control', 'agent_issues', 1)");
  wp.exec("INSERT INTO agent_issues (id, title, source, priority, status, created_at, updated_at) VALUES (8001, 'METRIC-REGRESSION-1: improvement_rate_7d', 'qnfo-fleet-control', 'high', 'open', 1, 1), (8002, 'METRIC-REGRESSION-1: metrics_in_breach', 'qnfo-fleet-control', 'medium', 'open', 1, 1)");
  ok(/^a METRIC-REGRESSION-1 issue is open for a metric that has an enabled trigger of its own$/.test(outP("MD-P2").observed), "MD-P2: an open regression issue for improvement_rate_7d (enabled trigger 387) reads the reason", outP("MD-P2"));
  wp.exec("DELETE FROM agent_issues WHERE id = 8001");
  ok(outP("MD-P2").observed === "ok", "MD-P2: the open regression issue for metrics_in_breach (no trigger row) does not count, because it stays judged as before");
  wp.exec("INSERT INTO agent_issues (id, title, source, priority, status, created_at, updated_at) VALUES (8001, 'METRIC-REGRESSION-1: improvement_rate_7d', 'qnfo-fleet-control', 'high', 'open', 1, 1)");
  wp.exec("UPDATE analytics_metric_triggers SET enabled = 0 WHERE id = 387");
  ok(outP("MD-P2").observed === "ok", "and a metric whose trigger is disabled does not count either");
  // MD-P4: the stored trigger text
  ok(outP("MD-P4").observed === "the tick_sequence ratio is not capped at 1.0", "MD-P4 outcome reads a reason while the trigger text has no MIN(1 cap");
  wp.exec("CREATE TABLE tick_probe_src (x INTEGER); CREATE TRIGGER tick_driver_roster_tick AFTER INSERT ON tick_probe_src BEGIN SELECT MIN(1.0, 2.0); END");
  ok(outP("MD-P4").observed === "ok", "and ok once the stored trigger text carries the cap");
}
{
  // the reviewer's repro, with the live autoclose trigger installed: no lever issue closes before its code-read contract passes
  const wa = world({ stranded: true, autoclose: true });
  const idOf = (k) => q1(wa, "SELECT id FROM agent_issues WHERE title LIKE ?", "BREACH-DOCTOR-1: " + k + " %").id;
  const st = (k) => q1(wa, "SELECT status FROM agent_issues WHERE id = ?", idOf(k)).status;
  const rec = (k, cls, transport, expected, observed, passed) => wa.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier) VALUES (?, ?, ?, ?, ?, ?, 'test')").run(idOf(k), cls, transport, expected, observed, passed);
  const runOutcome = (k) => { const cls = "issue-" + idOf(k) + "-outcome", c = q1(wa, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls); if (!c) return null; const r = wa.prepare(c.p).get(); rec(k, cls, "d1-query", String(r.expected), String(r.observed), String(r.expected) === String(r.observed) ? 1 : 0); return r; };
  const runCode = (k, passed) => rec(k, "issue-" + idOf(k), "code-read", "ok", passed ? "ok" : "missing-marker:qnfo-fleet-control/worker.js", passed ? 1 : 0);
  const KEYS = ["MD-P1a", "MD-P1b", "MD-P1c", "MD-P2", "MD-P4"];
  ok(q1(wa, "SELECT name FROM sqlite_master WHERE name = 'remediation_verification_autoclose_ins'"), "the world carries the live autoclose trigger");
  for (const k of KEYS) { runOutcome(k); runCode(k, false); }
  ok(KEYS.every((k) => st(k) === "open"), "first consumer pass: every d1 contract is read and every code-read contract fails, and no lever issue is closed", KEYS.map((k) => k + ":" + st(k)));
  // P4's outcome turns true by hand (the migration applied under another file name): the failing code-read contract still keeps it open
  wa.exec("CREATE TABLE tick_probe_src (x INTEGER); CREATE TRIGGER tick_driver_roster_tick AFTER INSERT ON tick_probe_src BEGIN SELECT MIN(1.0, 2.0); END");
  ok(runOutcome("MD-P4").observed === "ok" && st("MD-P4") === "open", "MD-P4: the outcome passing alone does not close the issue (its code-read contract has a failing latest verification)");
  runCode("MD-P4", true);
  ok(st("MD-P4") === "closed", "MD-P4: it closes once both pass");
  // P1a / P1b: the code-read pass is the closing probe
  runCode("MD-P1a", true); runCode("MD-P1b", true);
  ok(st("MD-P1a") === "closed" && st("MD-P1b") === "closed", "MD-P1a and MD-P1b close when their code-read contract passes (and not before)");
  // P1c: the code-read pass alone leaves the issue open while the outcome still reads its last reason; the outcome then needs the churn to be low
  runCode("MD-P1c", true);
  ok(st("MD-P1c") === "open", "MD-P1c: the code-read pass alone does not close it while the outcome contract's latest verification fails");
  for (let i = 0; i < 6; i++) { wa.prepare("INSERT INTO issue_lifecycle (issue_id, event, to_status, ts) VALUES (99938, 'closed', 'closed', ?)").run(iso(120 + i)); wa.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (99938, 'reopened', 'closed', 'open', ?)").run(iso(100 + i)); }
  ok(runOutcome("MD-P1c").observed !== "ok" && st("MD-P1c") === "open", "MD-P1c: six quick reopens keep it open");
  wa.exec("DELETE FROM issue_lifecycle");
  ok(runOutcome("MD-P1c").observed === "ok" && st("MD-P1c") === "closed", "MD-P1c: it closes when the code part has passed and the churn is within the target");
  // P2
  runCode("MD-P2", true);
  ok(st("MD-P2") === "open", "MD-P2: the code-read pass alone does not close it");
  wa.exec("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (387, 'improvement_rate_7d', 'Improvement gap', 'registry', 'lt', 0.3, 5, 'a', 'qnfo-fleet-control', 'agent_issues', 1)");
  wa.exec("INSERT INTO agent_issues (id, title, source, priority, status, created_at, updated_at) VALUES (8001, 'METRIC-REGRESSION-1: improvement_rate_7d', 'qnfo-fleet-control', 'high', 'open', 1, 1)");
  ok(runOutcome("MD-P2").observed !== "ok" && st("MD-P2") === "open", "MD-P2: an open regression issue for a trigger-owned metric keeps it open");
  wa.exec("DELETE FROM agent_issues WHERE id = 8001");
  ok(runOutcome("MD-P2").observed === "ok" && st("MD-P2") === "closed", "MD-P2: it closes when the code part has passed and that regression issue is gone");
}
{
  // control: the SHAPE the first draft shipped (a standing-guard d1 outcome that already reads ok) does close the issue on the live trigger with the code unchanged, so the fixture reproduces the defect
  const wc = world({ stranded: true, autoclose: true });
  const id = q1(wc, "SELECT id FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-1: MD-P1a %'").id;
  wc.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 1000, 'qnfo-fleet-control', 1, 'active', 'metric-playbooks')").run("issue-" + id + "-outcome", id, "SELECT 'ok' AS expected, 'ok' AS observed");
  wc.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier) VALUES (?, ?, 'd1-query', 'ok', 'ok', 1, 'test')").run(id, "issue-" + id + "-outcome");
  ok(q1(wc, "SELECT status FROM agent_issues WHERE id = ?", id).status === "closed", "control: an outcome contract that already reads ok closes MD-P1a on the live autoclose trigger with the code unchanged (the defect the file no longer has)");
}
{
  const cr = qa(d, "SELECT control, kind, disposition, critical_path, evidence FROM control_registry WHERE control LIKE 'metric-playbook-%' ORDER BY control");
  ok(cr.length === 1 && cr[0].control === "metric-playbook-recovery-hold" && cr[0].disposition === "keep" && cr[0].critical_path === 0 && /review by 2026-11-02/.test(cr[0].evidence), "one control registered (the recovery gate) with a reason and a dated review", cr);
  const fm = qa(d, "SELECT fm_key FROM failure_modes WHERE fm_key LIKE 'metric-%' ORDER BY fm_key").map((r) => r.fm_key);
  ok(fm.join(",") === "metric-trigger-disabled-issue-open", "one failure mode with a detector", fm);
  ok(!q1(d, "SELECT class FROM remediation_contracts WHERE class = 'fm-metric-disposition-expired'"), "no disposition detector (MD-7 is not built)");
  const res = d.prepare(q1(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-metric-trigger-disabled-issue-open'").p).get();
  ok(res.expected === "0", "fm-metric-trigger-disabled-issue-open: the detector runs", res);
  const dl = q1(d, "SELECT predicted_outcome p, action a, assumption s FROM decision_log WHERE action LIKE 'METRIC-PLAYBOOKS-1:%'");
  ok(n("decision_log") >= 2 && dl && /^breaches_auto_remediated_24h >= 3 within 24 h/.test(dl.p) && !/>= 6/.test(dl.p) && !/resolves metric-time-gated/.test(dl.a) && /nor is one whose verify reads its own record \(MD-7\)/.test(dl.s) && q1(d, "SELECT capability FROM capability_ledger WHERE capability = 'breach-doctor:metric-trigger-playbooks'"), "one decision_log row whose prediction is the 3 cases the doctor can reach (not the 6 of the first draft), and the capability row", dl);
}

// ---- the rules over fixtures shaped like live qnfo-audit
const hits = (rid) => qa(d, "SELECT * FROM (" + pb(rid).trigger_sql + ") LIMIT 120");
const ids = (rid) => hits(rid).map((h) => h.issue_id).sort((x, y) => x - y);
const apply = (rid, id) => { let ch = 0; for (const s of JSON.parse(pb(rid).action_sql)) ch += Number(d.prepare(s).run(id).changes); return ch; };
const revert = (rid, id) => { for (const s of JSON.parse(pb(rid).revert_sql)) d.prepare(s).run(id); };
const verify = (rid, id) => d.prepare(pb(rid).verify_sql).get(id);
// evaluateMetricTriggers' own title and lookup, from the worker under test
const curTitle = (t) => "METRIC-TRIGGER-" + t.id + "-" + String(t.metric_key).toUpperCase().replace(/[^A-Z0-9]+/g, "-") + ": " + String(t.title || t.action || "").slice(0, 80);
const lookupSql = (src.match(/SELECT id, status FROM agent_issues WHERE lower\(trim\(title\)\) = lower\(trim\(\?1\)\) AND status IN \('open','monitoring','closed'\) ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END LIMIT 1/) || [])[0];
ok(!!lookupSql || !/lower\(trim\(title\)\) = lower\(trim\(\?1\)\) AND status IN \('open','monitoring','closed'\)/.test(src), "the evaluator's lookup is the whole-title lookup this suite replays, or MD-P1a has replaced it (then it cannot reopen a parked twin of another title)");
ok(JSON.stringify(ids("MD-1")) === JSON.stringify([5001, 5006, 5011, 99924, 1000015]), "MD-1 names the losers: the OLD-title issue 99924 at equal priority (not the current-title 100226), the lower priority (5001), the old-title issue 5011 above the lower-id current-title 5010, the hand-filed twin (1000015) and 5006 (a live claim is the engine's check, read once a tick); the failing-contract loser 5004 and the pair whose survivor is less urgent (5008, 5009) are not named", ids("MD-1"));
for (const h of hits("MD-1")) { const f = JSON.parse(h.facts_json); ok(Object.keys(h).sort().join(",") === "facts_json,issue_id,subject" && api.bdFactsSafe(f) && /^[a-z0-9-]+$/.test(h.subject), "MD-1 hit " + h.issue_id + ": issue_id, subject, facts_json; facts hold numbers and ids only", f); }
{
  const sv = (id) => JSON.parse(hits("MD-1").find((h) => h.issue_id === id).facts_json).survivor_issue;
  ok(sv(99924) === 100226 && sv(5001) === 5002 && sv(5011) === 5010 && sv(1000015) === 100088, "survivors: the issue that bears the evaluator's current title (100226 over the lower id 99924, 5002, 5010), and by priority then id when neither does (100088 over the hand-filed twin)");
  // the invariant behind it: no hit names the issue whose title is the one evaluateMetricTriggers looks up for its trigger
  for (const h of hits("MD-1")) {
    const a = q1(d, "SELECT title FROM agent_issues WHERE id = ?", h.issue_id), m = /^METRIC-TRIGGER-(\d+)-/.exec(a.title), t = m && q1(d, "SELECT * FROM analytics_metric_triggers WHERE id = ?", Number(m[1]));
    if (t) ok(a.title.trim().toLowerCase() !== curTitle(t).trim().toLowerCase(), "MD-1 never names the issue that bears the current title of its trigger: " + h.issue_id);
  }
  ok(q1(d, "SELECT title FROM agent_issues WHERE id = 100226").title.toLowerCase() === curTitle(q1(d, "SELECT * FROM analytics_metric_triggers WHERE id = 354")).toLowerCase(), "the fixture's 100226 bears exactly the live-shaped current title of trigger 354 (the title the evaluator builds)");
  ok(!ids("MD-1").includes(5008) && !ids("MD-1").includes(5009), "MD-1 leaves a pair alone when the current-title survivor (5009, medium) is less urgent than the old-title issue (5008, critical): a playbook cannot raise a priority and urgency is never dropped");
}
ok(ids("MD-6").join(",") === "3015,99914,99915", "MD-6 names the covered children (3688, 410 and 1959); not the enabled child, not the child whose parent has no open issue, not the child more urgent than its parent, not the disabled trigger with no dep, not the stranded ones the file closed (100225 included)", ids("MD-6"));
{
  // the doctor-reachable set: named by trigger_sql and not owned in bdLoadState's reading (a code-task line, or a code task outside failed/closed/superseded/needs_human, merged included)
  const owned = ownedSet(d), reach = ids("MD-6").filter((i) => !owned.has(i));
  ok(reach.join(",") === "3015,99914,99915", "MD-6's doctor-reachable set is exactly 3015, 99914 and 99915", [reach, [...owned]]);
  ok(owned.has(100225) && qa(d, "SELECT id FROM code_tasks WHERE goal LIKE '[issue #100225]%' AND status = 'merged'").length === 1 && status(100225).status === "closed", "the engine reads 100225 as owned only through its merged code task ct_f1fd327k5oyfkr (no code-task line), which is why the file closes it once and MD-6 does not name it");
  const f = JSON.parse(hits("MD-6").find((h) => h.issue_id === 99915).facts_json);
  ok(f.child_trigger === 1959 && f.parent_trigger === 9901 && f.parent_issue === 100301 && f.parent_priority === "high" && f.child_priority === "high" && api.bdFactsSafe(f), "MD-6 facts: child and parent trigger, parent issue, both priorities", f);
}
ok(ids("MD-4").join(",") === "6101,6106", "MD-4 names the recovered-but-open issues with a 200 minute streak (not 30 minutes, not reset by a relapse, not an alert target, not hit again); the claimed 6106 is named too and skipped by the engine", ids("MD-4"));
{
  const f = JSON.parse(hits("MD-4").find((h) => h.issue_id === 6101).facts_json);
  ok(f.trigger_id === 6001 && f.value === 4 && f.threshold === 10 && f.clear_min >= 199 && f.clear_min <= 202 && api.bdFactsSafe(f), "MD-4 facts: trigger, value, threshold, clear minutes", f);
}

// MD-1 actions
{
  const t354 = q1(d, "SELECT * FROM analytics_metric_triggers WHERE id = 354");
  ok(verify("MD-1", 99924).observed !== "ok", "MD-1: verify_sql reads a reason before the action", verify("MD-1", 99924));
  const openBefore = qa(d, "SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id);
  ok(apply("MD-1", 99924) === 1, "MD-1: the action changes one row");
  const openAfter = qa(d, "SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id);
  ok(openBefore.filter((x) => !openAfter.includes(x)).join(",") === "99924", "MD-1: it closed only issue 99924", [openBefore.length, openAfter.length]);
  ok(status(99924).status === "closed" && status(99924).close_channel === "auto:triage-sync:breach-doctor" && evidence(99924).startsWith("SUPERSEDED BY #100226: both issues are open for metric trigger 354") && /Closed by breach-doctor rule MD-1/.test(evidence(99924)) && !evidence(99924).includes(";"), "MD-1: closed through the live close-sync trigger with SUPERSEDED BY #100226 and no semicolon", evidence(99924));
  ok(verify("MD-1", 99924).observed === "ok", "MD-1: verify_sql reads ok after the action", verify("MD-1", 99924));
  if (lookupSql) {
    // the flap the first draft caused: the evaluator looks the issue up by its current title over open, monitoring AND closed, and reopens a closed match
    const row = d.prepare(lookupSql).get(curTitle(t354));
    ok(row && row.id === 100226 && row.status === "open", "the evaluator's own lookup, run with the live-shaped current title of trigger 354 after MD-1 closed 99924, finds the OPEN survivor 100226: nothing is reopened, nothing flaps", row);
    const oldTitle = q1(d, "SELECT title FROM agent_issues WHERE id = 99924").title, mini = new DatabaseSync(":memory:");
    mini.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT)");
    mini.prepare("INSERT INTO agent_issues VALUES (99924, ?, 'open'), (100226, ?, 'closed')").run(oldTitle, curTitle(t354));
    const ctl = mini.prepare(lookupSql).get(curTitle(t354));
    ok(ctl && ctl.id === 100226 && ctl.status === "closed", "control: had MD-1 kept the lowest id and closed the current-title issue 100226, the same lookup returns the CLOSED 100226 and the evaluator reopens it: the close/reopen flap the survivor rule prevents", ctl);
  }
  ok(apply("MD-1", 99924) === 0, "MD-1: a second run changes nothing");
  ok(status(100226).status === "open", "MD-1: the survivor stays open");
  revert("MD-1", 99924);
  ok(status(99924).status === "open" && evidence(99924) === null && verify("MD-1", 99924).observed === "issue-reopened", "MD-1: revert_sql reopens the loser and clears the evidence");
  ok(apply("MD-1", 5004) === 0 && status(5004).status === "open", "MD-1: an issue with a failing contract is not closed (the statement changes no row)");
  ok(apply("MD-1", 5006) === 0 && status(5006).status === "open", "MD-1: an issue under a live work claim is not closed");
  ok(apply("MD-1", 5005) === 0 && apply("MD-1", 5007) === 0 && apply("MD-1", 100226) === 0 && apply("MD-1", 5002) === 0 && apply("MD-1", 5010) === 0, "MD-1: a survivor and a single issue are not closed, nor is the current-title issue of a pair");
  ok(apply("MD-1", 5008) === 0 && apply("MD-1", 5009) === 0 && status(5008).status === "open" && status(5009).status === "open", "MD-1: the pair whose survivor (5009) is less urgent than the old-title issue (5008) is left alone");
  ok(apply("MD-1", 5001) === 1 && evidence(5001).startsWith("SUPERSEDED BY #5002") && apply("MD-1", 1000015) === 1 && evidence(1000015).startsWith("SUPERSEDED BY #100088") && apply("MD-1", 5011) === 1 && evidence(5011).startsWith("SUPERSEDED BY #5010"), "MD-1: the lower priority, the hand-filed twin and the later old-title issue are superseded to 5002, 100088 and 5010");
  revert("MD-1", 5001); revert("MD-1", 1000015); revert("MD-1", 5011);
}
// MD-6 actions
{
  ok(verify("MD-6", 3015).observed !== "ok", "MD-6: verify_sql reads a reason before the action");
  const rows = apply("MD-6", 3015);
  ok(rows === 1, "MD-6: the action changes one row (the child's triage row)", rows);
  ok(status(3015).status === "closed" && evidence(3015).startsWith("SUPERSEDED BY #99938: metric trigger 3688 is disabled (enabled=0) and metric_deps relation disabled-duplicate names metric monthly_cost_run_rate_usd") && !evidence(3015).includes(";") && /Closed by breach-doctor rule MD-6/.test(evidence(3015)), "MD-6: the child is closed with SUPERSEDED BY the parent's issue and the metric names", evidence(3015));
  ok(q1(d, "SELECT priority p FROM agent_issues WHERE id = 99938").p === "critical" && status(99938).status === "open", "MD-6: the parent's issue is already as urgent as any child (raised once by the file) and stays open; the action does not touch it");
  ok(verify("MD-6", 3015).observed === "ok", "MD-6: verify_sql reads ok");
  ok(status(99914).status === "open" && status(99915).status === "open", "MD-6: the other covered children are untouched");
  ok(apply("MD-6", 3015) === 0, "MD-6: a second run changes nothing");
  revert("MD-6", 3015);
  ok(status(3015).status === "open" && evidence(3015) === null && verify("MD-6", 3015).observed === "issue-reopened", "MD-6: revert_sql reopens the child and clears the evidence");
  ok(apply("MD-6", 99914) === 1 && evidence(99914).startsWith("SUPERSEDED BY #99935"), "MD-6: equal priority is enough; the child goes to 99935");
  ok(apply("MD-6", 99915) === 1 && evidence(99915).startsWith("SUPERSEDED BY #100301"), "MD-6: 99915 (high) goes to 100301, which the file raised to high");
  ok(apply("MD-6", 7101) === 0 && apply("MD-6", 7102) === 0 && apply("MD-6", 7103) === 0 && apply("MD-6", 99938) === 0, "MD-6: no dep row, a parent with no open issue, an enabled child and a parent issue are all refused");
  ok(apply("MD-6", 100225) === 0 && apply("MD-6", 99937) === 0 && apply("MD-6", 2570) === 0, "MD-6: the stranded issues the file already closed are not named again");
  ok(apply("MD-6", 7105) === 0 && status(7105).status === "open" && !ids("MD-6").includes(7105), "MD-6: a critical child whose parent issue is only low priority stays open (the playbook cannot raise a parent, and urgency is never dropped)");
  revert("MD-6", 99914); revert("MD-6", 99915);
}
// MD-4 actions
{
  ok(verify("MD-4", 6101).observed !== "ok", "MD-4: verify_sql reads a reason before the action");
  ok(apply("MD-4", 6101) === 1, "MD-4: the action changes one row");
  ok(status(6101).status === "closed" && status(6101).close_channel === "auto:triage-sync:breach-doctor" && /^TRIGGER-RECOVERY-1 second path: metric trigger 6001 reads clear, value 4.0 against threshold 10.0, for 20\d minutes/.test(evidence(6101)) && !evidence(6101).includes(";"), "MD-4: closed with the reading, the threshold and the streak length", evidence(6101));
  ok(verify("MD-4", 6101).observed === "ok", "MD-4: verify_sql reads ok");
  d.prepare("UPDATE analytics_metric_triggers SET threshold = 1 WHERE id = 6001").run();
  ok(verify("MD-4", 6101).observed === "metric-hit-again", "MD-4: verify_sql reads metric-hit-again if the metric is hit again after the close");
  d.prepare("UPDATE analytics_metric_triggers SET threshold = 10 WHERE id = 6001").run();
  revert("MD-4", 6101);
  ok(status(6101).status === "open" && evidence(6101) === null, "MD-4: revert_sql reopens");
  ok(apply("MD-4", 6102) === 0 && apply("MD-4", 6103) === 0 && apply("MD-4", 6104) === 0 && apply("MD-4", 6105) === 0 && apply("MD-4", 6106) === 0, "MD-4: a young streak, a relapse, an alert target, a hit metric and a claimed issue are refused");
}
// ---- end to end through the real breachDoctorTick
function mkDb(rawdb) {
  const log = { n: 0, rows: 0 };
  const stmt = (sqlText) => {
    let args = [];
    const self = {
      sql: sqlText, bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { log.n++; return { results: rawdb.prepare(sqlText).all(...args) }; },
      async first() { log.n++; return rawdb.prepare(sqlText).get(...args) ?? null; },
      async run() { log.n++; const r = rawdb.prepare(sqlText).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return self;
  };
  return { prepare: stmt, log, async batch(stmts) { rawdb.exec("BEGIN"); try { const out = []; for (const s of stmts) out.push(await s.run()); rawdb.exec("COMMIT"); return out; } catch (e) { rawdb.exec("ROLLBACK"); throw e; } } };
}
const tick = async (rawdb) => { const r = await loadApi().breachDoctorTick({ AUDIT_DB: mkDb(rawdb) }, {}); return r; };
{
  const w = world();
  w.prepare("UPDATE breach_playbooks SET created_at = ?").run(iso(120));
  const det = (db) => db.prepare(q1(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-metric-trigger-disabled-issue-open'").p).get();
  // measure period: a playbook younger than 30 minutes acts on nothing
  const young = world();
  const r0 = await tick(young);
  ok(r0.ok === true && r0.acted === 0 && qa(young, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'closed' AND id IN (3015, 99914, 99915, 5001, 5011, 99924, 1000015, 6101)")[0].n === 0, "a playbook younger than 30 minutes runs in measure: the tick diagnoses and changes nothing", { acted: r0.acted });
  ok(qa(young, "SELECT rule_id FROM breach_diagnoses WHERE rule_id LIKE 'MD-%'").length >= 8, "and the measure tick records the would-do cases (found causes, not unclassified)", qa(young, "SELECT rule_id, issue_id FROM breach_diagnoses WHERE rule_id LIKE 'MD-%'"));
  ok(det(w).observed === "6", "before the doctor acts the failure-mode detector reads 6: the three covered children it must clear and the three look-alikes a rule deliberately leaves (7101 no dep, 7102 parent without an issue, 7105 child more urgent than its parent)", det(w));
  const results = [];
  for (let i = 0; i < 8; i++) results.push(await tick(w));
  ok(results.every((r) => r.ok === true && !r.error && r.taint_dropped === 0 && r.failed === 0), "eight ticks succeed with no taint drop and no failed case", results.map((r) => ({ ok: r.ok, err: r.error, taint: r.taint_dropped, failed: r.failed })));
  const cases = qa(w, "SELECT issue_id, rule_id, state, cause_class, error_code, verify_passes FROM breach_diagnoses WHERE rule_id LIKE 'MD-%' ORDER BY issue_id");
  const byRule = (r) => cases.filter((c) => c.rule_id === r && c.state === "verified").map((c) => c.issue_id).sort((x, y) => x - y).join(",");
  ok(byRule("MD-6") === "3015,99914,99915", "MD-6 verified the three covered children the doctor can reach", cases.filter((c) => c.rule_id === "MD-6"));
  ok(byRule("MD-4") === "6101", "MD-4 verified the recovered issue (the claimed 6106 was skipped)", cases.filter((c) => c.rule_id === "MD-4"));
  ok(byRule("MD-1") === "5001,5011,99924,1000015", "MD-1 verified the four superseded duplicates (5004 has a failing contract, 5006 a live claim, 5008 and 5009 a survivor less urgent than the loser)", cases.filter((c) => c.rule_id === "MD-1"));
  ok(!cases.some((c) => c.rule_id === "MD-7"), "no MD-7 case exists: the heartbeat issues are left to their own triggers");
  ok(cases.every((c) => c.state === "verified" || c.state === "diagnosed"), "no MD case failed, reverted or hangs in flight", cases.filter((c) => c.state !== "verified" && c.state !== "diagnosed"));
  const w2 = (id) => (q1(w, "SELECT status FROM agent_issues WHERE id = ?", id) || {}).status;
  ok([3015, 99914, 99915, 5001, 5011, 99924, 1000015, 6101].every((i) => w2(i) === "closed") && [6106, 5004, 5006, 7105, 100226, 5002, 100088, 5010, 5008, 5009].every((i) => w2(i) === "open"), "the issues are closed as the playbooks say and the guarded ones (claimed, failing contract, a child more urgent than its parent, the survivors, the pair whose survivor is less urgent) stay open", [3015, 99914, 99915, 5001, 5011, 99924, 1000015, 6101, 6106, 5004, 5006, 7105, 100226, 5002, 100088, 5010, 5008, 5009].map((i) => i + ":" + w2(i)));
  ok(w2(100225) === "closed" && w2(3015) === "closed" && q1(w, "SELECT priority p FROM agent_issues WHERE id = 99938").p === "critical", "end to end: the parent 99938 carries the highest child priority (critical) and 100225 was closed once by the file");
  // the evaluator's lookup after the doctor ran: the current-title issue of trigger 354 is the one it finds
  if (lookupSql) { const row = w.prepare(lookupSql).get(curTitle(q1(w, "SELECT * FROM analytics_metric_triggers WHERE id = 354"))); ok(row && row.id === 100226 && row.status === "open", "end to end: after the doctor closed 99924 the evaluator's lookup finds the open 100226", row); }
  ok(det(w).observed === "3", "after the doctor the failure-mode detector reads only the three look-alikes: it is not red by construction", det(w));
  ok(qa(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'qnfo-fleet-control:breach-doctor'")[0].n === 8, "a decision_log row for every applied action (4 MD-1, 3 MD-6, 1 MD-4)", qa(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'qnfo-fleet-control:breach-doctor'"));
  ok(qa(w, "SELECT COUNT(*) n FROM breach_diagnosis_events WHERE event = 'taint-drop'")[0].n === 0, "no taint-drop event");
  const bd = q1(w, "SELECT revert_sql r FROM breach_diagnoses WHERE issue_id = 3015 AND rule_id = 'MD-6' ORDER BY id DESC LIMIT 1");
  ok(bd && JSON.parse(bd.r).length === 2, "the case stores the two revert statements (reopen the triage row, reopen the issue)", bd);
  const m = (k) => (q1(w, "SELECT last_value v FROM metric_registry WHERE metric = ?", k) || {}).v;
  ok(Number(m("breaches_auto_remediated_24h")) === 8, "breaches_auto_remediated_24h counts the eight verified cases, every one of them a real remediation (an issue closed with a successor or a reading), none the doctor's own record", m("breaches_auto_remediated_24h"));
  // the other family is untouched
  ok(w2(900) === "open", "a TOOL-FAILURE issue is untouched");
}

// ---- Rollback
{
  const w = world();
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  w.exec(rb);
  ok(qa(w, "SELECT rule_id FROM breach_playbooks WHERE rule_id LIKE 'MD-%' AND (enabled <> 0 OR mode <> 'measure')").length === 0, "Rollback disables the three playbooks and puts them in measure");
  const st = (id) => q1(w, "SELECT status FROM agent_issues WHERE id = ?", id).status;
  ok(st(99937) === "open" && st(2570) === "open" && st(99949) === "open" && st(100225) === "open" && q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100225").e === null, "Rollback reopens the four issues the file closed (99937, 2570, 99949, 100225) and clears their evidence");
  ok(q1(w, "SELECT COUNT(*) n FROM metric_deps WHERE active = 1").n === 0, "Rollback deactivates metric_deps");
  const pr = (id) => q1(w, "SELECT priority p FROM agent_issues WHERE id = ?", id).p;
  ok(pr(99938) === "medium" && pr(100301) === "medium" && pr(99935) === "medium" && pr(100225) === "critical", "Rollback restores the three parent priorities from the backup table and leaves the children alone");
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-1: MD-P%' AND status = 'open'").n === 5 && q1(w, "SELECT COUNT(*) n FROM decision_log").n >= 2, "Rollback leaves the five lever issues open (an issue is closed only with close_evidence) and the decision_log row");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
