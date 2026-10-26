// METRIC-PLAYBOOKS-1 offline suite (agent_issues 1000266, BREACH-DOCTOR-1 family METRIC): replays migrations/2026-10-26-metric-playbooks.sql on node:sqlite over the live column lists,
// the live close-sync and supersede triggers, the live v_metric_trigger_state view and migrations/2026-10-26-breach-doctor.sql, and runs the REAL breachDoctorTick of qnfo-fleet-control/worker.js
// (sliced out by its markers) against it.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped in the body); the file adds metric_deps, metric_dispositions and four playbooks that pass the
// engine's own validators (bdValidateRule), whose statements all bind ?1, and the engine allowlist gains metric_dispositions and nothing else; the one-time closes (99937 and 2570 superseded to the
// parent's issue, 99949 closed MOOT) touch only the stranded issues and leave an issue with a live code task alone; over fixtures shaped like live qnfo-audit 2026-10-26 each rule's trigger_sql names the
// issues the audit named and not the look-alikes, its per-issue action changes only the issue it is bound to, closes or dates it with evidence built from ids, counts and enum codes, its verify_sql reads a
// reason before and ok after, and its revert_sql restores the previous state (the parent's priority comes back from the ledger facts); a claimed issue and an issue with a failing contract are not touched;
// end to end through breachDoctorTick every rule runs in measure for 30 minutes, then acts, verifies twice and settles as verified, with decision_log rows and breach_diagnosis_events, no taint drop
// and no failed case; a second apply of the file changes nothing; the Rollback line disables the playbooks and reopens what the file closed.
// Output MUST contain "0 failed" on success.   node migrations/metric-playbooks.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
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
ok(tables.includes("metric_dispositions") && ["issue_triage", "agent_issues", "remediation_contracts", "issue_plans"].every((t) => tables.includes(t)) && !["metric_registry", "analytics_metric_triggers", "ops_config", "human_actions"].some((t) => tables.includes(t)) && tables.length === 5, "BD_WRITE_TABLES gains metric_dispositions and nothing else (the four of 0.53.0 stay; no kill switch, no trust list, no metric registry)", tables);
{
  const v = (verM ? verM[1] : "").split("-")[0].split(".").map(Number);
  ok(v[0] > 0 || v[1] > 53 || (v[1] === 53 && v[2] >= 1), "VERSION is at least 0.53.1 (a patch above BREACH-DOCTOR-FIX-1)", verM && verM[1]);
}

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
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE INDEX idx_fleet_tick_ts ON fleet_tick (ts);
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
    raw.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled, notes) VALUES (?, ?, ?, 'registry', ?, ?, 5, 'a', 'qnfo-fleet-control', ?, ?, ?)").run(id, key, key + " title", op, thr, x.target ?? "agent_issues", en, x.notes ?? null);
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
  // a covered child whose code task is still live is left alone by the one-time close
  trig(1959, "issues_without_next_action", 0, "gt", 0, 144); issue(99915, "METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: Autonomy gap", { desc: CT, priority: "high" });
  task("ct_live99915", "[issue #99915] METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: x", "queued");
  // --- covered children the doctor reaches (no code-task line): present when the file is applied, so it raises their parents once (99938 to critical)
  trig(409, "fleet_ai_run_rate_30d_usd", 0, "gt", 95, 752.87); issue(100225, "METRIC-TRIGGER-409-FLEET-AI-RUN-RATE-30D-USD: Fleet AI run-rate", { priority: "critical" });
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
  // --- MD-1 duplicates: equal priority (lowest id survives), different priority (highest priority survives), a hand-filed twin, a loser with a failing contract, a loser with a live claim
  trig(354, "workers_ai_cost_30d_usd", 1, "gt", 95, 298); issue(99924, "METRIC-TRIGGER-354-WORKERS-AI-COST-30D-USD: Cost gap: Workers AI spend over $10", { priority: "critical" }); issue(100226, "METRIC-TRIGGER-354-WORKERS-AI-COST-30D-USD: Cost gap: Workers AI spend over $95", { priority: "critical" });
  trig(7777, "dup_priority_metric", 1, "gt", 1, 5); issue(5001, "METRIC-TRIGGER-7777-DUP-PRIORITY-METRIC: old title", { priority: "low" }); issue(5002, "METRIC-TRIGGER-7777-DUP-PRIORITY-METRIC: new title", { priority: "critical" });
  trig(8888, "breaches_without_ticket", 1, "gt", 0, 0); issue(100088, "METRIC-TRIGGER-8888-BREACHES-WITHOUT-TICKET: Breaches with no ticket", { priority: "high" }); issue(1000015, "METRIC-TRIGGER: breaches_without_ticket", { priority: "high" });
  trig(7778, "dup_blocked_metric", 1, "gt", 1, 5); issue(5003, "METRIC-TRIGGER-7778-DUP-BLOCKED-METRIC: a", { priority: "medium" }); issue(5004, "METRIC-TRIGGER-7778-DUP-BLOCKED-METRIC: b", { priority: "medium" });
  raw.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail', verify_probe = 'SELECT 1' WHERE issue_id = 5004").run();
  trig(7779, "dup_claimed_metric", 1, "gt", 1, 5); issue(5005, "METRIC-TRIGGER-7779-DUP-CLAIMED-METRIC: a", { priority: "medium" }); issue(5006, "METRIC-TRIGGER-7779-DUP-CLAIMED-METRIC: b", { priority: "medium" });
  raw.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:5006', 'x', 'session_x', 5006, '2099-01-01T00:00:00Z')").run();
  trig(7780, "single_metric", 1, "gt", 1, 5); issue(5007, "METRIC-TRIGGER-7780-SINGLE-METRIC: only one", { priority: "medium" });
  // --- MD-4 recovered but open: a streak of 200 minutes (hit), 30 minutes (young), reset by a relapse, a queue target that is not agent_issues, a metric that is hit again
  const log = (tid, status, agoMin) => raw.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, metric_value, action, queue_target, status) VALUES (?, ?, 1, 'a', 'agent_issues', ?)").run(tid, sqlTs(agoMin), status);
  trig(6001, "recovered_old_metric", 1, "gt", 10, 4); issue(6101, "METRIC-TRIGGER-6001-RECOVERED-OLD-METRIC: was high", { priority: "high" }); log(6001, "dispatched", 500); log(6001, "recovering", 200);
  trig(6002, "recovered_young_metric", 1, "gt", 10, 4); issue(6102, "METRIC-TRIGGER-6002-RECOVERED-YOUNG-METRIC: was high", { priority: "high" }); log(6002, "dispatched", 500); log(6002, "recovering", 30);
  trig(6003, "recovered_relapsed_metric", 1, "gt", 10, 4); issue(6103, "METRIC-TRIGGER-6003-RECOVERED-RELAPSED-METRIC: was high", { priority: "high" }); log(6003, "dispatched", 500); log(6003, "recovering", 300); log(6003, "relapsed", 250);
  trig(6004, "recovered_alert_metric", 1, "gt", 10, 4, { target: "alerts" }); issue(6104, "METRIC-TRIGGER-6004-RECOVERED-ALERT-METRIC: was high", { priority: "high" }); log(6004, "dispatched", 500); log(6004, "recovering", 200);
  trig(6005, "hit_again_metric", 1, "gt", 10, 40); issue(6105, "METRIC-TRIGGER-6005-HIT-AGAIN-METRIC: still high", { priority: "high" }); log(6005, "dispatched", 500); log(6005, "recovering", 200);
  trig(6006, "recovered_claimed_metric", 1, "gt", 10, 4); issue(6106, "METRIC-TRIGGER-6006-RECOVERED-CLAIMED-METRIC: was high", { priority: "high" }); log(6006, "dispatched", 500); log(6006, "recovering", 200);
  raw.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, expires_at) VALUES ('issue:6106', 'x', 'session_x', 6106, '2099-01-01T00:00:00Z')").run();
  // --- MD-7 the heartbeat: a tick every 10 minutes for 27 h with one gap of 90 minutes that ended 6.5 h ago
  if (o.heartbeat !== "none") {
    const gapStart = o.gapStartMin ?? 8 * 60, gapEnd = o.gapEndMin ?? 6.5 * 60;
    const ins = raw.prepare("INSERT INTO fleet_tick (ts, source) VALUES (?, 'cron:*/10')");
    for (let m = 27 * 60 - 5; m >= (o.lastTickMin ?? 5); m -= 10) { if (m < gapStart && m > gapEnd) continue; ins.run(iso(m)); }
  }
  trig(3452, "tick_completion_24h", 1, "lt", 95, 93.8); issue(2875, "METRIC-TRIGGER-3452-TICK-COMPLETION-24H: Heartbeat gap", { priority: "high" });
  trig(3528, "tick_slot_coverage_24h", 1, "lt", 0.95, 0.937); issue(99936, "METRIC-TRIGGER-3528-TICK-SLOT-COVERAGE-24H: Heartbeat gap", { priority: "medium" });
  trig(4989, "tick_sequence_completion_24h", 1, "lt", 0.9, 0.792); issue(2861, "METRIC-TRIGGER-4989-TICK-SEQUENCE-COMPLETION-24H: Tick sequence", { priority: "medium" });
  trig(3453, "tick_other_24h", 1, "lt", 95, 99.9); issue(2876, "METRIC-TRIGGER-3453-TICK-OTHER-24H: clear now", { priority: "medium" });
  raw.prepare("INSERT INTO metric_deps (child_metric, parent_metric, relation, note) VALUES ('tick_other_24h', 'fleet_tick', 'window-of-fleet-tick', 'fixture')").run();
  trig(7010, "unrelated_24h_metric", 1, "lt", 95, 50); issue(7110, "METRIC-TRIGGER-7010-UNRELATED-24H-METRIC: no dep row", { priority: "medium" });
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

// ---- what the file added
for (const t of ["metric_deps", "metric_dispositions"]) ok(q1(d, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", t), "table " + t);
ok(qa(d, "SELECT rule_id FROM breach_playbooks ORDER BY rule_id").map((r) => r.rule_id).join(",") === "CM-R1,CM-R2,CM-R3,CM-R5,MD-1,MD-4,MD-6,MD-7,playbook-gap", "four playbooks added beside the doctor's five: MD-1, MD-4, MD-6, MD-7");
ok(qa(d, "SELECT rule_id FROM breach_playbooks WHERE rule_id LIKE 'MD-%' AND enabled = 1 AND mode = 'on' AND action_kind = 'sql' AND family = 'METRIC-TRIGGER'").length === 4, "all four are enabled, mode on (the engine holds each in measure for 30 minutes), sql, family METRIC-TRIGGER");
ok(n("metric_deps") >= 9 && qa(d, "SELECT child_metric FROM metric_deps WHERE relation = 'window-of-fleet-tick' AND parent_metric = 'fleet_tick' AND child_metric IN ('tick_completion_24h', 'tick_slot_coverage_24h', 'tick_sequence_completion_24h')").length === 3, "metric_deps: the six BREACH-ONE-MEANING-1 duplicates and the three heartbeat metrics");
ok(qa(d, "SELECT child_metric FROM metric_deps WHERE relation = 'disabled-duplicate' AND child_metric IN ('fleet_ai_run_rate_30d_usd','workers_ai_run_rate_usd','fleet_cost_run_rate_usd','issue_mttr_h_30d','issues_without_next_action','open_issues_without_doer_120m')").length === 6, "the six disabled-duplicate rows name the children BREACH-ONE-MEANING-1 disabled");
for (const r of qa(d, "SELECT * FROM breach_playbooks WHERE rule_id LIKE 'MD-%'")) {
  const v = api.bdValidateRule(r);
  ok(v && v.ok === true, "playbook " + r.rule_id + " passes the engine's bdValidateRule", v);
  const act = JSON.parse(r.action_sql), rev = JSON.parse(r.revert_sql);
  ok(act.length >= 1 && act.length <= 6 && rev.length >= 1 && act.concat(rev).every((s) => s.includes("?1") && !s.includes(";")), r.rule_id + ": 1 to 6 per-issue statements, a revert, every one binds ?1 and has no semicolon");
  ok(r.max_per_tick <= 6 && r.max_per_day <= 24 && r.note.length > 200, r.rule_id + ": per-tick and per-day caps, a note with the live measurement");
  ok(!/\b(update|insert|replace|delete|drop|create|alter) /i.test(r.trigger_sql.replace(/'(?:[^']|'')*'/g, "''")) && !/\b(update|insert|replace|delete|drop|create|alter) /i.test(r.verify_sql.replace(/'(?:[^']|'')*'/g, "''")), r.rule_id + ": trigger_sql and verify_sql hold no write keyword outside a literal");
}
// the engine allowlist is what makes MD-7 valid: the same row against an allowlist without metric_dispositions is refused
{
  const row = pb("MD-7"), swapped = { ...row, action_sql: row.action_sql.replace(/metric_dispositions/g, "metric_registry") };
  ok(api.bdValidateRule(swapped).ok === false && /table-not-allowed/.test(api.bdValidateRule(swapped).why), "a write to metric_registry is still refused (table-not-allowed)", api.bdValidateRule(swapped));
}

// ---- the one-time closes (the file was applied over the stranded set only)
ok(status(99937).status === "closed" && evidence(99937).startsWith("SUPERSEDED BY #99938: metric trigger 3687 is disabled (enabled=0)"), "99937 (covered child, stale code-task line, merged tasks) is superseded to the parent's issue 99938", evidence(99937));
ok(status(2570).status === "closed" && evidence(2570).startsWith("SUPERSEDED BY #100301: metric trigger 5944 is disabled"), "2570 (covered child, closed task) is superseded to the parent's issue 100301", evidence(2570));
ok(status(99949).status === "closed" && evidence(99949).startsWith("MOOT: metric trigger 5916") && /ct_cl1domo3wy60p9 and ct_im99949/.test(evidence(99949)), "99949 (disabled trigger with no parent, tasks merged) is closed MOOT with the trigger and task ids", evidence(99949));
ok(status(99915).status === "open", "a covered child with a live code task (99915) is left alone");
ok(status(99938).status === "open" && status(100301).status === "open" && status(99935).status === "open", "the parents' issues stay open");
{
  const pr = (id) => q1(d, "SELECT priority p FROM agent_issues WHERE id = ?", id).p;
  ok(pr(99938) === "critical" && pr(100301) === "high" && pr(99935) === "medium", "the parents carry the urgency of their children once: 99938 critical (child 100225), 100301 high (child 99915), 99935 medium (child 99914)", [pr(99938), pr(100301), pr(99935)]);
  const bak = qa(d, "SELECT id, priority FROM bak_20261026_metric_playbooks_priority ORDER BY id");
  ok(JSON.stringify(bak) === JSON.stringify([{ id: 99935, priority: "medium" }, { id: 99938, priority: "medium" }, { id: 100301, priority: "medium" }]), "bak_20261026_metric_playbooks_priority keeps the previous priorities of the three parents", bak);
  ok(pr(100225) === "critical" && pr(99915) === "high", "the children keep their own priority");
}
ok(/Closed once by migration 2026-10-26-metric-playbooks/.test(evidence(99937)) && !/\bdescription\b/i.test(evidence(99937)), "the one-time evidence names the migration and holds no issue text");
ok(qa(d, "SELECT issue_id FROM issue_triage WHERE rc = 'breach-doctor:MD-6:migration' ORDER BY issue_id").map((r) => r.issue_id).join(",") === "2570,99937,99949", "exactly three issue_triage rows carry the migration marker");

// ---- idempotence
const SNAP_T = ["breach_playbooks", "metric_deps", "metric_dispositions", "agent_issues", "issue_triage", "remediation_contracts", "control_registry", "failure_modes", "capability_ledger", "decision_log", "bak_20261026_metric_playbooks_priority"];
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
{
  const lev = qa(d, "SELECT id, title, description, source, priority FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-1: MD-P%' ORDER BY id");
  ok(lev.length === 5 && lev.every((r) => r.source === "qnfo-fleet-control" && r.priority !== "critical"), "five lever issues, source qnfo-fleet-control (the trusted pair BREACH-DOCTOR-1:), none critical", lev.map((r) => r.title.slice(0, 50)));
  const keys = lev.map((r) => r.title.replace(/^BREACH-DOCTOR-1: (MD-P\w+) .*/, "$1")).join(",");
  ok(keys === "MD-P1a,MD-P1b,MD-P1c,MD-P2,MD-P4", "MD-P1a, MD-P1b, MD-P1c, MD-P2, MD-P4", keys);
  const code = lev.filter((r) => /\ncode-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js\ncode-anchor: /.test(r.description));
  ok(code.length === 4, "four of them carry a code-task, a code-anchor and a code-probe line (MD-P4 is a D1 trigger and names a session doer)", code.length);
  const wsrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
  const count = (t) => { let c = 0, i = 0; while ((i = t.length ? wsrc.indexOf(t, i) : -1) >= 0) { c++; i += t.length; } return c; };
  for (const r of code) {
    const anchor = r.description.split("\n").find((l) => l.startsWith("code-anchor: ")).slice("code-anchor: ".length);
    const probe = JSON.parse(r.description.split("\n").find((l) => l.startsWith("code-probe: ")).slice("code-probe: ".length));
    ok(anchor.length > 15, r.title.slice(0, 30) + ": the anchor is a real line");
    if (!process.env.BD_WORKER_PATH) ok(count(anchor) === 1, r.title.slice(0, 30) + ": the code-anchor occurs exactly once in qnfo-fleet-control/worker.js on this checkout", count(anchor));
    const key = probe.contains !== undefined ? "contains" : "absent", text = probe[key];
    if (!process.env.BD_WORKER_PATH) ok(key === "contains" ? count(text) === 0 : count(text) >= 1, r.title.slice(0, 30) + ": the code-probe fails on this checkout (" + key + ")", count(text));
    const c = q1(d, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + r.id), o = q1(d, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + r.id + "-outcome");
    ok(c && c.verify_transport === "code-read" && c.status === "active" && JSON.parse(c.verify_probe).paths[0] === "qnfo-fleet-control/worker.js", r.title.slice(0, 30) + ": the code-read contract carries the probe", c);
    ok(o && o.verify_transport === "d1-query" && o.status === "active", r.title.slice(0, 30) + ": a d1 outcome contract is read in addition", o);
    const res = d.prepare(o.verify_probe).get();
    ok(res && res.expected === "ok" && typeof res.observed === "string", r.title.slice(0, 30) + ": the outcome probe runs and returns expected and observed", res);
  }
  const p4 = lev.find((r) => /MD-P4/.test(r.title)), c4 = q1(d, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + p4.id);
  ok(c4 && c4.verify_transport === "d1-query" && d.prepare(c4.verify_probe).get().observed !== "ok", "MD-P4: the closing probe reads a reason while the trigger has no cap");
  ok(!/\ncode-task:/.test(p4.description) && /Doer: a session/.test(p4.description), "MD-P4 names a session doer and no code-task line");
  // the outcome probes that must fail today on live shape: P2 (open regression issues for self-set metrics) and P1c (lifecycle churn)
  const out = (k, db = d) => db.prepare(q1(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE ?) || '-outcome'", "BREACH-DOCTOR-1: " + k + " %").p).get();
  ok(out("MD-P1a").observed === "a metric trigger has two open issues", "MD-P1a outcome contract reads a reason while two open issues exist for one trigger (the fixture has pairs)", out("MD-P1a"));
  const w0 = world({ stranded: true });
  ok(out("MD-P1a", w0).observed === "ok" && out("MD-P1b", w0).observed === "ok", "MD-P1a and MD-P1b outcome contracts are the standing guards: ok while no duplicate pair and no odd operator exists");
  w0.exec("UPDATE analytics_metric_triggers SET operator = '!=' WHERE id = 3689");
  ok(out("MD-P1b", w0).observed === "an enabled trigger has an operator outside the evaluator set", "and MD-P1b reads a reason for an operator outside the set", out("MD-P1b", w0));
  d.exec("INSERT INTO agent_issues (id, title, source, priority, status, created_at, updated_at) VALUES (8001, 'METRIC-REGRESSION-1: metrics_in_breach', 'qnfo-fleet-control', 'medium', 'open', 1, 1)");
  ok(out("MD-P2").observed !== "ok", "MD-P2 outcome probe reads a reason while a METRIC-REGRESSION-1 issue for a self-set metric is open");
  d.exec("DELETE FROM agent_issues WHERE id = 8001");
  ok(out("MD-P2").observed === "ok", "and ok once it is closed");
  for (let i = 0; i < 41; i++) d.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (100225, 'reopened', ?)").run(iso(60));
  ok(out("MD-P1c").observed !== "ok", "MD-P1c outcome probe reads a reason above 40 reopened METRIC-TRIGGER events in 24 h");
  d.exec("DELETE FROM issue_lifecycle");
  ok(out("MD-P1c").observed === "ok", "and ok at or below 40");
}
{
  const cr = qa(d, "SELECT control, kind, disposition, critical_path, evidence FROM control_registry WHERE control LIKE 'metric-playbook-%' ORDER BY control");
  ok(cr.length === 2 && cr.every((r) => r.disposition === "keep" && r.critical_path === 0 && /review by 2026-11-02/.test(r.evidence)), "two controls registered (recovery gate, time-gate filter) with a reason and a dated review", cr);
  const fm = qa(d, "SELECT fm_key FROM failure_modes WHERE fm_key LIKE 'metric-%' ORDER BY fm_key").map((r) => r.fm_key);
  ok(fm.join(",") === "metric-disposition-expired,metric-trigger-disabled-issue-open", "two failure modes with detectors", fm);
  for (const c of ["fm-metric-disposition-expired", "fm-metric-trigger-disabled-issue-open"]) {
    const res = d.prepare(q1(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", c).p).get();
    ok(res.expected === "0", c + ": the detector runs", res);
  }
  ok(n("decision_log") >= 2 && q1(d, "SELECT predicted_outcome p FROM decision_log WHERE action LIKE 'METRIC-PLAYBOOKS-1:%'").p === "breaches_auto_remediated_24h >= 6 within 24 h" && q1(d, "SELECT capability FROM capability_ledger WHERE capability = 'breach-doctor:metric-trigger-playbooks'"), "one decision_log row with a prediction on an outcome the doctor has to earn, and the capability row");
}

// ---- the rules over fixtures shaped like live qnfo-audit
const hits = (rid) => qa(d, "SELECT * FROM (" + pb(rid).trigger_sql + ") LIMIT 120");
const ids = (rid) => hits(rid).map((h) => h.issue_id).sort((x, y) => x - y);
const apply = (rid, id) => { let ch = 0; for (const s of JSON.parse(pb(rid).action_sql)) ch += Number(d.prepare(s).run(id).changes); return ch; };
const revert = (rid, id) => { for (const s of JSON.parse(pb(rid).revert_sql)) d.prepare(s).run(id); };
const verify = (rid, id) => d.prepare(pb(rid).verify_sql).get(id);
ok(JSON.stringify(ids("MD-1")) === JSON.stringify([5001, 5006, 100226, 1000015]), "MD-1 names the losers: the later of equal priority (100226), the lower priority (5001), the hand-filed twin (1000015) and 5006 (a live claim is the engine's check, read once a tick); the failing-contract loser 5004 is not named", ids("MD-1"));
for (const h of hits("MD-1")) { const f = JSON.parse(h.facts_json); ok(Object.keys(h).sort().join(",") === "facts_json,issue_id,subject" && api.bdFactsSafe(f) && /^[a-z0-9-]+$/.test(h.subject), "MD-1 hit " + h.issue_id + ": issue_id, subject, facts_json; facts hold numbers and ids only", f); }
ok(JSON.parse(hits("MD-1").find((h) => h.issue_id === 100226).facts_json).survivor_issue === 99924 && JSON.parse(hits("MD-1").find((h) => h.issue_id === 5001).facts_json).survivor_issue === 5002 && JSON.parse(hits("MD-1").find((h) => h.issue_id === 1000015).facts_json).survivor_issue === 100088, "survivors: lowest id at equal priority (99924), highest priority (5002), the numbered issue over the hand-filed twin (100088)");
ok(ids("MD-6").join(",") === "3015,99914,99915,100225", "MD-6 names the covered children (409, 3688, 410 and 1959, whose live code task is the engine's check); not the enabled child, not the child whose parent has no open issue, not the child more urgent than its parent, not the disabled trigger with no dep, not the stranded ones the file closed", ids("MD-6"));
{
  const f = JSON.parse(hits("MD-6").find((h) => h.issue_id === 100225).facts_json);
  ok(f.child_trigger === 409 && f.parent_trigger === 3689 && f.parent_issue === 99938 && f.parent_priority === "critical" && f.child_priority === "critical" && api.bdFactsSafe(f), "MD-6 facts: child and parent trigger, parent issue, both priorities", f);
}
ok(ids("MD-4").join(",") === "6101,6106", "MD-4 names the recovered-but-open issues with a 200 minute streak (not 30 minutes, not reset by a relapse, not an alert target, not hit again); the claimed 6106 is named too and skipped by the engine", ids("MD-4"));
{
  const f = JSON.parse(hits("MD-4").find((h) => h.issue_id === 6101).facts_json);
  ok(f.trigger_id === 6001 && f.value === 4 && f.threshold === 10 && f.clear_min >= 199 && f.clear_min <= 202 && api.bdFactsSafe(f), "MD-4 facts: trigger, value, threshold, clear minutes", f);
}
ok(ids("MD-7").join(",") === "2861,2875,99936", "MD-7 names the three heartbeat issues (not the clear metric, not the metric with no dep row)", ids("MD-7"));
{
  const f = JSON.parse(hits("MD-7").find((h) => h.issue_id === 2875).facts_json);
  ok(f.trigger_id === 3452 && f.window_h === 24 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(f.gap_end) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(f.clears_by) && f.heartbeat_age_min <= 6 && api.bdFactsSafe(f), "MD-7 facts: trigger, window, the end of the gap, the expiry 25 h after it, the heartbeat age", f);
  const gapEnd = Date.parse(f.gap_end), tick = qa(d, "SELECT ts FROM fleet_tick ORDER BY ts").map((r) => Date.parse(r.ts));
  let g = 0; for (let i = 1; i < tick.length; i++) if (tick[i] - tick[i - 1] > 15 * 60000) g = tick[i];
  ok(gapEnd === g && Date.parse(f.clears_by) - gapEnd === 25 * H, "the gap end is the first tick after the last gap above 15 minutes and the expiry is 25 hours later", [f.gap_end, new Date(g).toISOString()]);
}

// MD-1 actions
{
  ok(verify("MD-1", 100226).observed !== "ok", "MD-1: verify_sql reads a reason before the action", verify("MD-1", 100226));
  const openBefore = qa(d, "SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id);
  ok(apply("MD-1", 100226) === 1, "MD-1: the action changes one row");
  const openAfter = qa(d, "SELECT id FROM agent_issues WHERE status = 'open' ORDER BY id").map((r) => r.id);
  ok(openBefore.filter((x) => !openAfter.includes(x)).join(",") === "100226", "MD-1: it closed only issue 100226", [openBefore.length, openAfter.length]);
  ok(status(100226).status === "closed" && status(100226).close_channel === "auto:triage-sync:breach-doctor" && evidence(100226).startsWith("SUPERSEDED BY #99924: both issues are open for metric trigger 354") && /Closed by breach-doctor rule MD-1/.test(evidence(100226)) && !evidence(100226).includes(";"), "MD-1: closed through the live close-sync trigger with SUPERSEDED BY #99924 and no semicolon", evidence(100226));
  ok(verify("MD-1", 100226).observed === "ok", "MD-1: verify_sql reads ok after the action", verify("MD-1", 100226));
  ok(apply("MD-1", 100226) === 0, "MD-1: a second run changes nothing");
  ok(status(99924).status === "open", "MD-1: the survivor stays open");
  revert("MD-1", 100226);
  ok(status(100226).status === "open" && evidence(100226) === null && verify("MD-1", 100226).observed === "issue-reopened", "MD-1: revert_sql reopens the loser and clears the evidence");
  ok(apply("MD-1", 5004) === 0 && status(5004).status === "open", "MD-1: an issue with a failing contract is not closed (the statement changes no row)");
  ok(apply("MD-1", 5006) === 0 && status(5006).status === "open", "MD-1: an issue under a live work claim is not closed");
  ok(apply("MD-1", 5005) === 0 && apply("MD-1", 5007) === 0 && apply("MD-1", 99924) === 0, "MD-1: a survivor and a single issue are not closed");
  ok(apply("MD-1", 5001) === 1 && evidence(5001).startsWith("SUPERSEDED BY #5002") && apply("MD-1", 1000015) === 1 && evidence(1000015).startsWith("SUPERSEDED BY #100088"), "MD-1: the lower priority and the hand-filed twin are superseded to 5002 and 100088");
  revert("MD-1", 5001); revert("MD-1", 1000015);
}
// MD-6 actions
{
  ok(verify("MD-6", 100225).observed !== "ok", "MD-6: verify_sql reads a reason before the action");
  const rows = apply("MD-6", 100225);
  ok(rows === 1, "MD-6: the action changes one row (the child's triage row)", rows);
  ok(status(100225).status === "closed" && evidence(100225).startsWith("SUPERSEDED BY #99938: metric trigger 409 is disabled (enabled=0) and metric_deps relation disabled-duplicate names metric monthly_cost_run_rate_usd") && !evidence(100225).includes(";") && /Closed by breach-doctor rule MD-6/.test(evidence(100225)), "MD-6: the child is closed with SUPERSEDED BY the parent's issue and the metric names", evidence(100225));
  ok(q1(d, "SELECT priority p FROM agent_issues WHERE id = 99938").p === "critical" && status(99938).status === "open", "MD-6: the parent's issue is already as urgent as the child (raised once by the file) and stays open; the action does not touch it");
  ok(verify("MD-6", 100225).observed === "ok", "MD-6: verify_sql reads ok");
  ok(q1(d, "SELECT status FROM agent_issues WHERE id = 3015").status === "open" && q1(d, "SELECT status FROM agent_issues WHERE id = 99914").status === "open", "MD-6: the other covered children are untouched");
  ok(apply("MD-6", 100225) === 0, "MD-6: a second run changes nothing");
  revert("MD-6", 100225);
  ok(status(100225).status === "open" && evidence(100225) === null && verify("MD-6", 100225).observed === "issue-reopened", "MD-6: revert_sql reopens the child and clears the evidence");
  ok(apply("MD-6", 99914) === 1 && evidence(99914).startsWith("SUPERSEDED BY #99935"), "MD-6: equal priority is enough; the child goes to 99935");
  ok(apply("MD-6", 7101) === 0 && apply("MD-6", 7102) === 0 && apply("MD-6", 7103) === 0 && apply("MD-6", 99938) === 0, "MD-6: no dep row, a parent with no open issue, an enabled child and a parent issue are all refused");
  ok(apply("MD-6", 7105) === 0 && status(7105).status === "open" && !ids("MD-6").includes(7105), "MD-6: a critical child whose parent issue is only low priority stays open (the playbook cannot raise a parent, and urgency is never dropped)");
  revert("MD-6", 99914);
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
// MD-7 actions
{
  ok(verify("MD-7", 2875).observed === "no-live-disposition", "MD-7: verify_sql reads no-live-disposition before the action");
  ok(apply("MD-7", 2875) === 1, "MD-7: the action inserts one disposition");
  const dp = q1(d, "SELECT * FROM metric_dispositions WHERE issue_id = 2875");
  ok(dp && dp.metric === "tick_completion_24h" && dp.kind === "time-gated" && dp.trigger_id === 3452 && dp.released_at === null && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(dp.expires_at) && Date.parse(dp.expires_at) > Date.now() + 15 * H && /the last fleet_tick gap ended/.test(dp.evidence) && !dp.evidence.includes(";"), "MD-7: the row names the metric, kind, trigger, a future expiry and the evidence", dp);
  ok(status(2875).status === "open", "MD-7: the issue stays open (no silent drop)");
  ok(verify("MD-7", 2875).observed === "ok", "MD-7: verify_sql reads ok");
  ok(JSON.stringify(ids("MD-7")) === "[2861,99936]", "MD-7: the dated issue leaves the trigger's hit list", ids("MD-7"));
  ok(apply("MD-7", 2875) === 0, "MD-7: a second run inserts nothing");
  revert("MD-7", 2875);
  ok(q1(d, "SELECT released_at r FROM metric_dispositions WHERE issue_id = 2875").r !== null && verify("MD-7", 2875).observed === "no-live-disposition" && ids("MD-7").includes(2875), "MD-7: revert_sql releases the row and the issue is named again");
  ok(apply("MD-7", 3453) === 0 && apply("MD-7", 2876) === 0 && apply("MD-7", 7110) === 0, "MD-7: a metric that is clear and a metric with no dep row get no disposition");
  d.prepare("UPDATE metric_dispositions SET released_at = NULL, expires_at = ? WHERE issue_id = 2875").run(iso(10));
  ok(verify("MD-7", 2875).observed === "no-live-disposition" && ids("MD-7").includes(2875), "MD-7: an expired disposition is not live: the issue is named again and verify reads no-live-disposition");
  const exp = d.prepare(q1(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-metric-disposition-expired'").p).get();
  ok(exp.observed === "1", "fm-metric-disposition-expired reads 1 for an expired disposition whose trigger is still hit and issue open", exp);
  d.prepare("UPDATE metric_dispositions SET released_at = ? WHERE issue_id = 2875").run(iso(1));
  ok(d.prepare(q1(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-metric-disposition-expired'").p).get().observed === "0", "and 0 once it is released");
}
// MD-7 refusals: no gap in the window, a stale heartbeat
for (const [label, o, expectHits] of [["no gap inside 24 h (the gap ended 26 h ago)", { gapStartMin: 27 * 60 - 20, gapEndMin: 26 * 60 }, 0], ["a heartbeat that stopped 40 minutes ago", { lastTickMin: 40 }, 0], ["no heartbeat rows at all", { heartbeat: "none" }, 0]]) {
  const w = world(o), r = qa(w, "SELECT * FROM (" + q1(w, "SELECT trigger_sql t FROM breach_playbooks WHERE rule_id = 'MD-7'").t + ") LIMIT 120");
  ok(r.length === expectHits, "MD-7 names nothing with " + label, r.map((x) => x.issue_id));
}
{
  // the pre-fix reading of the same shape: a fresh world where the gap is real names the three
  const w = world(), r = qa(w, "SELECT * FROM (" + q1(w, "SELECT trigger_sql t FROM breach_playbooks WHERE rule_id = 'MD-7'").t + ") LIMIT 120");
  ok(r.length === 3, "control: the same world with the gap names the three heartbeat issues");
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
  // measure period: a playbook younger than 30 minutes acts on nothing
  const young = world();
  const r0 = await tick(young);
  ok(r0.ok === true && r0.acted === 0 && qa(young, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'closed' AND id IN (100225, 3015, 99914, 5001, 100226, 1000015, 6101)")[0].n === 0 && qa(young, "SELECT COUNT(*) n FROM metric_dispositions")[0].n === 0, "a playbook younger than 30 minutes runs in measure: the tick diagnoses and changes nothing", { acted: r0.acted });
  ok(qa(young, "SELECT rule_id FROM breach_diagnoses WHERE rule_id LIKE 'MD-%'").length >= 8, "and the measure tick records the would-do cases (found causes, not unclassified)", qa(young, "SELECT rule_id, issue_id FROM breach_diagnoses WHERE rule_id LIKE 'MD-%'"));
  const results = [];
  for (let i = 0; i < 8; i++) results.push(await tick(w));
  ok(results.every((r) => r.ok === true && !r.error && r.taint_dropped === 0 && r.failed === 0), "eight ticks succeed with no taint drop and no failed case", results.map((r) => ({ ok: r.ok, err: r.error, taint: r.taint_dropped, failed: r.failed })));
  const cases = qa(w, "SELECT issue_id, rule_id, state, cause_class, error_code, verify_passes FROM breach_diagnoses WHERE rule_id LIKE 'MD-%' ORDER BY issue_id");
  const byRule = (r) => cases.filter((c) => c.rule_id === r && c.state === "verified").map((c) => c.issue_id).sort((x, y) => x - y).join(",");
  ok(byRule("MD-6") === "3015,99914,100225", "MD-6 verified the three covered children", cases.filter((c) => c.rule_id === "MD-6"));
  ok(byRule("MD-7") === "2861,2875,99936", "MD-7 verified the three heartbeat issues", cases.filter((c) => c.rule_id === "MD-7"));
  ok(byRule("MD-4") === "6101", "MD-4 verified the recovered issue (the claimed 6106 was skipped)", cases.filter((c) => c.rule_id === "MD-4"));
  ok(byRule("MD-1") === "5001,100226,1000015", "MD-1 verified the three superseded duplicates (5004 has a failing contract, 5006 a live claim)", cases.filter((c) => c.rule_id === "MD-1"));
  ok(cases.every((c) => c.state === "verified" || c.state === "diagnosed"), "no MD case failed, reverted or hangs in flight", cases.filter((c) => c.state !== "verified" && c.state !== "diagnosed"));
  const w2 = (id) => (q1(w, "SELECT status FROM agent_issues WHERE id = ?", id) || {}).status;
  ok([3015, 99914, 100225, 5001, 100226, 1000015, 6101].every((i) => w2(i) === "closed") && [6106, 5004, 5006, 2875, 99915, 7105, 99924, 5002, 100088].every((i) => w2(i) === "open"), "the issues are closed or dated as the playbooks say and the guarded ones (claimed, failing contract, a live code task, a child more urgent than its parent, the survivors) stay open", [3015, 99914, 100225, 5001, 100226, 1000015, 6101, 6106, 5004, 5006, 2875, 99915, 7105, 99924, 5002, 100088].map((i) => i + ":" + w2(i)));
  ok(w2(100225) === "closed" && w2(3015) === "closed" && q1(w, "SELECT priority p FROM agent_issues WHERE id = 99938").p === "critical", "end to end: the parent 99938 carries the highest child priority (critical)");
  ok(qa(w, "SELECT COUNT(*) n FROM metric_dispositions WHERE kind = 'time-gated' AND released_at IS NULL")[0].n === 3, "end to end: three live dispositions");
  ok(qa(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'qnfo-fleet-control:breach-doctor'")[0].n === 10, "a decision_log row for every applied action (3 MD-1, 3 MD-6, 3 MD-7, 1 MD-4)", qa(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'qnfo-fleet-control:breach-doctor'"));
  ok(qa(w, "SELECT COUNT(*) n FROM breach_diagnosis_events WHERE event = 'taint-drop'")[0].n === 0, "no taint-drop event");
  const bd = q1(w, "SELECT revert_sql r FROM breach_diagnoses WHERE issue_id = 100225 AND rule_id = 'MD-6' ORDER BY id DESC LIMIT 1");
  ok(bd && JSON.parse(bd.r).length === 2, "the case stores the two revert statements (reopen the triage row, reopen the issue)", bd);
  const m = (k) => (q1(w, "SELECT last_value v FROM metric_registry WHERE metric = ?", k) || {}).v;
  ok(Number(m("breaches_auto_remediated_24h")) === 10, "breaches_auto_remediated_24h counts the ten verified cases", m("breaches_auto_remediated_24h"));
  // the other family is untouched
  ok(w2(900) === "open", "a TOOL-FAILURE issue is untouched");
}

// ---- Rollback
{
  const w = world();
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  w.exec(rb);
  ok(qa(w, "SELECT rule_id FROM breach_playbooks WHERE rule_id LIKE 'MD-%' AND (enabled <> 0 OR mode <> 'measure')").length === 0, "Rollback disables the four playbooks and puts them in measure");
  const st = (id) => q1(w, "SELECT status FROM agent_issues WHERE id = ?", id).status;
  ok(st(99937) === "open" && st(2570) === "open" && st(99949) === "open" && q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 99937").e === null, "Rollback reopens the three issues the file closed and clears their evidence");
  ok(q1(w, "SELECT COUNT(*) n FROM metric_deps WHERE active = 1").n === 0, "Rollback deactivates metric_deps");
  const pr = (id) => q1(w, "SELECT priority p FROM agent_issues WHERE id = ?", id).p;
  ok(pr(99938) === "medium" && pr(100301) === "medium" && pr(99935) === "medium" && pr(100225) === "critical", "Rollback restores the three parent priorities from the backup table and leaves the children alone");
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'BREACH-DOCTOR-1: MD-P%' AND status = 'open'").n === 5 && q1(w, "SELECT COUNT(*) n FROM decision_log").n >= 2, "Rollback leaves the five lever issues open (an issue is closed only with close_evidence) and the decision_log row");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
