// IL-RELAPSE-TRIGGER-1 offline suite: replays migrations/2026-10-19-fix-target-hold-rate.sql on SQLite. Proves: the guard metric fix_target_hold_rate_30d is
// registered once with its named METRIC-CLOSED-LOOP-1 exemption (no threshold trigger) and a probation row, the registry text of both hold-rate
// metrics equals what qnfo-fleet-control 0.39.0 writes (so the seed and the worker never disagree), fix_hold_rate_30d is rewritten only from its
// known old text, the control_registry, failure_modes, capability_ledger and decision_log rows land once, the detector fm-relapse-judged-against-
// target-not-trigger reads a defect while an open relapse issue sits on a metric whose trigger is clear and passes once the tick closes it (a relapse on a
// metric whose trigger IS hit is not counted), the decision's prediction parses, re-applying changes nothing, and the Rollback line restores the old text.
// Run: node migrations/fix-target-hold-rate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const here = (f) => new URL("./" + f, import.meta.url);
const root = (f) => new URL("../" + f, import.meta.url);
const sql = readFileSync(here("2026-10-19-fix-target-hold-rate.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

// the worker's own strings (the IL block of qnfo-fleet-control/worker.js)
const src = readFileSync(root("qnfo-fleet-control/worker.js"), "utf8");
const a = src.indexOf("// ---- IMPROVEMENT-LOOP-1:BEGIN"), b = src.indexOf("// ---- IMPROVEMENT-LOOP-1:END ----");
const ca = src.indexOf("// ---- CHARTER-LOOP-1:BEGIN"), cb = src.indexOf("// ---- CHARTER-LOOP-1:END ----");
ok(a > 0 && b > a && ca > 0 && cb > ca, "the worker blocks are present");
const sandbox = { fetch: async () => { throw new Error("offline"); }, AbortSignal, VERSION: "test", timedFetch: null, b64encode: null, sha256: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, isFinite, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(ca, cb + "// ---- CHARTER-LOOP-1:END ----".length) + "\n" + src.slice(a, b + "// ---- IMPROVEMENT-LOOP-1:END ----".length) + "\n__export = { IL_SELF_METRICS };", sandbox, { filename: "improvement-block.js" });
const W0 = Object.fromEntries(sandbox.__export.IL_SELF_METRICS.map((m) => [m.metric, m]));
const W = new Proxy(W0, { get: (t, k) => t[k] || {} }); // a missing worker definition fails the assertions below instead of crashing the suite
ok("fix_hold_rate_30d" in W0 && "fix_target_hold_rate_30d" in W0, "the worker defines both hold-rate metrics");

const OLD_FORMULA = "held / judged over metric issues closed in the last 30d (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1, METRIC-REGRESSION-1): relapsed when a metric_history day after closure fails its target (IMPROVEMENT-LOOP-1)";
const OLD_TARGET = ">= 0.8 (closed metric issues whose metric stayed on target afterwards)";

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, formula TEXT, authored_by TEXT NOT NULL, authored_at TEXT NOT NULL, probation_until TEXT NOT NULL, graduation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation','graduated','retired')), graduated_at TEXT);
CREATE TRIGGER metric_authorship_birth AFTER INSERT ON metric_registry BEGIN INSERT OR IGNORE INTO metric_authorship (metric, formula, authored_by, authored_at, probation_until, graduation, status) VALUES (NEW.metric, NEW.formula, COALESCE(NEW.owner, 'unknown'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'), 'a value at a refresh after probation_until, with its analytics_metric_triggers row or a named exemption', 'probation'); END;
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT);
CREATE TABLE analytics_dash_records (metric TEXT, value TEXT);
CREATE TABLE analytics_dash_meta (key TEXT, value TEXT);
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL WHEN operator = 'gt' THEN val > threshold WHEN operator = 'lte' THEN val <= threshold WHEN operator = 'lt' THEN val < threshold WHEN operator = 'eq' THEN val = threshold ELSE val >= threshold END AS hit
FROM raw;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold','filter','pause','kill-switch','gate','cap','guard','lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove','demote','replace','keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned','applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, state) VALUES
  ('fix_hold_rate_30d', 'system', 'lagging', '${OLD_FORMULA}', 'qnfo-audit.metric_history + agent_issues (qnfo-fleet-control IMPROVEMENT-LOOP-1)', '${OLD_TARGET}', 'qnfo-fleet-control', 'qnfo-fleet-control IMPROVEMENT-LOOP-1 files and closes the issues', 'hourly', '< 0.8', '< 0.5', '0.5', 'MEASURED'),
  ('gateway_cap_30d_usd', 'fleet', 'lagging', 'x', 's', '<=150 (owner threshold); live cap 200', 'o', 'a', 'hourly', NULL, NULL, '180', 'MEASURED'),
  ('worker_count', 'fleet', 'lagging', 'x', 's', '<= 24', 'o', 'a', 'hourly', NULL, NULL, '40', 'MEASURED');
INSERT INTO analytics_metric_triggers (id, metric_key, title, operator, threshold, enabled) VALUES (364, 'gateway_cap_30d_usd', 'Cost gap', 'gt', 180, 1), (344, 'worker_count', 'Core gap', 'gt', 30, 1), (388, 'fix_hold_rate_30d', 'Fix durability gap', 'lt', 0.8, 1);
INSERT INTO agent_issues (title, status) VALUES ('METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd', 'open'), ('METRIC-FIX-RELAPSED-1: worker_count', 'open');
`);
db.exec(sql);

const m = db.prepare("SELECT * FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'").get();
ok(m && m.kind === "guard" && m.refresh_cadence === "hourly" && m.layer === "system", "the guard metric is registered hourly", m);
ok(m && /^maximize/.test(m.target), "its target gives a direction and no threshold (trended by the loop)", m && m.target);
ok(m && m.disposition_actor.includes("exempt from a threshold trigger") && m.disposition_actor.includes("METRIC-CLOSED-LOOP-1"), "the registry row names the METRIC-CLOSED-LOOP-1 exemption");
ok(db.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key = 'fix_target_hold_rate_30d'").get().n === 0, "no threshold trigger is created for it (a second trigger would file the same finding twice)");
ok(db.prepare("SELECT status FROM metric_authorship WHERE metric = 'fix_target_hold_rate_30d'").get().status === "probation", "it is born on probation");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "the migration carries its three header lines");
ok(/exemption/i.test(sql) && /fix_target_hold_rate_30d has no threshold trigger/.test(sql), "the exemption is stated in the file (METRIC-CLOSED-LOOP-1)");

// parity with the worker: the seed and the worker's INSERT OR IGNORE write the same text
ok(m.formula === W.fix_target_hold_rate_30d.formula, "fix_target_hold_rate_30d formula equals the worker's", [m.formula, W.fix_target_hold_rate_30d.formula]);
ok(m.target === W.fix_target_hold_rate_30d.target, "fix_target_hold_rate_30d target equals the worker's", [m.target, W.fix_target_hold_rate_30d.target]);
ok(m.kind === W.fix_target_hold_rate_30d.kind && m.warning_band === W.fix_target_hold_rate_30d.warning && m.kill_band === W.fix_target_hold_rate_30d.kill, "kind and bands equal the worker's");
ok(!W.fix_target_hold_rate_30d.trigger, "the worker seeds no trigger for it");
const h = db.prepare("SELECT formula, target FROM metric_registry WHERE metric = 'fix_hold_rate_30d'").get();
ok(h.formula === W.fix_hold_rate_30d.formula, "fix_hold_rate_30d formula equals the worker's", [h.formula, W.fix_hold_rate_30d.formula]);
ok(h.target === W.fix_hold_rate_30d.target, "fix_hold_rate_30d target equals the worker's", [h.target, W.fix_hold_rate_30d.target]);
ok(/^>= 0\.8/.test(h.target), "the 0.8 target number is unchanged (trigger 388 still compares with 0.8)");
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'fix_hold_rate_30d'").get().last_value === "0.5", "the migration does not touch the measured value");

// the control, failure mode, capability and decision rows
const cr = db.prepare("SELECT * FROM control_registry WHERE control = 'improvement-loop-relapse-trigger-judge'").get();
ok(cr && cr.kind === "filter" && cr.disposition === "keep" && cr.disposition_state === "applied" && cr.critical_path === 0, "the relapse judge is registered as an applied, kept, off-critical-path filter", cr);
ok(cr && cr.alternate_path.includes("fix_target_hold_rate_30d") && cr.alternate_path.includes("target_misses"), "its alternate path is the strict metric and target_misses");
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'relapse-judged-against-target-not-trigger'").get();
ok(fm && fm.probe_class === "fm-relapse-judged-against-target-not-trigger" && fm.root_cause.includes("TRIGGER-RECOVERY-1") && fm.issue_id === 99927, "the failure mode names its root cause and issue", fm && fm.fm_key);
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-relapse-judged-against-target-not-trigger'").get();
ok(det && det.verify_transport === "d1-query" && det.module === "failure-mode" && det.expected_cadence_h === 1 && det.issue_id === null && det.status === "active", "one standing hourly d1-query detector", det);
ok(det && det.next_due_at > db.prepare("SELECT datetime('now', '+60 minutes') AS t").get().t, "its first read waits for the worker deploy (about 90 minutes)");
ok(db.prepare("SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'relapse-vs-early-warning-judgement'").get().n === 1, "the capability is recorded");
const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'IL-RELAPSE-TRIGGER-1:') = 1").all();
ok(dl.length === 1 && dl[0].capability_gain && dl[0].predicted_outcome, "one decision_log row with its capability gain and prediction");
const po = /^(\S+) (<=|>=|<|>|=) ([0-9.]+) within (\d+) (?:h|hours)$/.exec(dl[0].predicted_outcome);
ok(!!po && db.prepare("SELECT 1 AS x FROM metric_registry WHERE metric = ?").get(po[1]) !== undefined, "the prediction parses as <metric> <op> <value> within <N> hours on a registered metric", dl[0].predicted_outcome);

// the detector: a defect while an open relapse issue sits on a trigger-clear metric, clean once it is closed, blind to a genuine relapse
const probe = (s) => { const r = db.prepare(s).get(); return r; };
const before = probe(det.verify_probe);
ok(before.expected === "0" && before.observed === "1", "the detector reads the open relapse on gateway_cap_30d_usd (trigger gt 180 clear at 180) and not worker_count (trigger gt 30 hit at 40)", before);
db.exec("UPDATE agent_issues SET status = 'closed' WHERE title = 'METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd'");
const after = probe(det.verify_probe);
ok(after.expected === "0" && after.observed === "0", "once the tick closes it the detector passes while the genuine relapse stays open", after);
db.exec("UPDATE metric_registry SET last_value = '181' WHERE metric = 'gateway_cap_30d_usd'; UPDATE agent_issues SET status = 'open' WHERE title = 'METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd'");
ok(probe(det.verify_probe).observed === "0", "a relapse whose trigger is hit again (181 > 180) is not counted");
db.exec("UPDATE metric_registry SET last_value = '180' WHERE metric = 'gateway_cap_30d_usd'");

// re-applying changes nothing, and the old formula is the only text the rewrite replaces
const counts = () => ["metric_registry", "control_registry", "failure_modes", "remediation_contracts", "capability_ledger", "decision_log", "metric_authorship"].map((t) => db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n).join(",");
const c1 = counts();
db.exec(sql);
ok(counts() === c1, "re-applying adds no row", [c1, counts()]);
db.exec("UPDATE metric_registry SET formula = 'edited by a later change' WHERE metric = 'fix_hold_rate_30d'");
db.exec(sql);
ok(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'fix_hold_rate_30d'").get().formula === "edited by a later change", "a formula edited since is not overwritten by a re-apply");
db.exec("UPDATE metric_registry SET formula = '" + W.fix_hold_rate_30d.formula.replace(/'/g, "''") + "' WHERE metric = 'fix_hold_rate_30d'");

// the worker seeding the metric first (INSERT OR IGNORE with its own text) still ends with the exemption text
const db2 = new DatabaseSync(":memory:");
for (const t of ["metric_registry", "metric_authorship", "control_registry", "failure_modes", "remediation_contracts", "capability_ledger", "decision_log"]) {
  db2.exec(db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t).sql);
}
db2.exec(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'metric_authorship_birth'").get().sql);
const wm = W.fix_target_hold_rate_30d;
db2.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state) VALUES (?1, 'system', ?2, ?3, 'qnfo-audit.metric_history + agent_issues (qnfo-fleet-control IMPROVEMENT-LOOP-1)', ?4, 'qnfo-fleet-control', 'qnfo-fleet-control IMPROVEMENT-LOOP-1 files and closes the issues', 'hourly', ?5, ?6, 'MEASURED')").run("fix_target_hold_rate_30d", wm.kind || "", wm.formula || "", wm.target || "", wm.warning || "", wm.kill || "");
db2.exec(sql);
const m2 = db2.prepare("SELECT disposition_actor, formula, target FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'").get();
ok(m2.disposition_actor.includes("exempt from a threshold trigger") && m2.formula === wm.formula && m2.target === wm.target, "when the worker seeded the row first, the migration still names the exemption and keeps the worker's text", m2);
ok(db2.prepare("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'").get().n === 1, "one registry row either way");

// the Rollback line removes what the file added and restores the old text
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
ok(db.prepare("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM metric_authorship WHERE metric = 'fix_target_hold_rate_30d'").get().n === 0, "Rollback removes the guard metric and its probation row");
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM capability_ledger").get().n === 0, "Rollback removes the failure mode, detector, control and capability rows");
const rh = db.prepare("SELECT formula, target FROM metric_registry WHERE metric = 'fix_hold_rate_30d'").get();
ok(rh.formula === OLD_FORMULA && rh.target === OLD_TARGET, "Rollback restores the old fix_hold_rate_30d text", rh);

ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
ok(!/(^|[^A-Za-z0-9_])#\d/.test(sql), "no bare issue reference with a hash");
console.log(`fix-target-hold-rate: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
