/**
 * improvement-relapse-trigger.test.mjs -- offline regression lock for IL-RELAPSE-TRIGGER-1 (agent_issues 99927, 2884, 100012).
 * IMPROVEMENT-LOOP-1 judged "did the fix hold" against the registry TARGET, but a METRIC-TRIGGER issue closes when its trigger PREDICATE
 * clears (TRIGGER-RECOVERY-1), and the target is stricter for many metrics: gateway_cap_30d_usd (trigger gt 180, target <= 150) and
 * server_side_close_share_7d (trigger lt 0.9, target >= 0.95) were filed as METRIC-FIX-RELAPSED-1 with their trigger clear, and
 * fix_hold_rate_30d read 0.5 for fixes that held by the rule that closed them.
 * Proves:
 *   - closure on trigger clear with the metric between trigger and target: no relapse recorded, no fileable finding, counted held in
 *     fix_hold_rate_30d, counted as a miss in fix_target_hold_rate_30d, one early-warning finding (file: false) and a target_misses row,
 *     for the gateway_cap_30d_usd (gt 180 vs <= 150) and the server_side_close_share_7d (lt 0.9 vs >= 0.95) fixtures;
 *   - the trigger hit again after the closure is a relapse (fileable while it is still hit; recorded but not filed once clear again);
 *   - an issue with no readable trigger (a constraint breach, a trigger with no threshold, a deleted trigger) is judged against the target
 *     exactly as before, so the two rates agree there;
 *   - a real relapse replaces an early warning on the same metric whichever closed issue is seen first;
 *   - the tick closes an open METRIC-FIX-RELAPSED-1 issue whose trigger is clear with early-warning evidence (not "back inside its target"),
 *     files nothing for it, keeps a genuine relapse open, writes both rates, and installs per-closure probes that catch relapses.
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/improvement-relapse-trigger.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- IMPROVEMENT-LOOP-1:BEGIN";
const END = "// ---- IMPROVEMENT-LOOP-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL improvement block markers missing"); console.log("1 failed"); process.exit(1); }
const ca = src.indexOf("// ---- CHARTER-LOOP-1:BEGIN"), cb = src.indexOf("// ---- CHARTER-LOOP-1:END ----");
if (ca < 0 || cb < 0) { console.error("FAIL charter block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { fetch: async () => { throw new Error("offline"); }, AbortSignal, VERSION: "test", timedFetch: null, b64encode: null, sha256: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, isFinite, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(ca, cb + "// ---- CHARTER-LOOP-1:END ----".length) + "\n" + src.slice(a, b + END.length) +
  "\n__export = { improvementEvaluate, improvementLoopTick, ilRelapseContract, IL_SELF_METRICS, ilTriggerHit: typeof ilTriggerHit === 'function' ? ilTriggerHit : null, ilTriggerPred: typeof ilTriggerPred === 'function' ? ilTriggerPred : null, ilIssueTriggerId: typeof ilIssueTriggerId === 'function' ? ilIssueTriggerId : null };", sandbox, { filename: "improvement-block.js" });
const I = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
const NOW = Date.parse("2026-10-20T12:00:00Z");
const day = (n) => new Date(NOW - n * 864e5).toISOString().slice(0, 10);
const reg = (metric, target) => ({ metric, target, state: "MEASURED" });
// history of one metric, values[k] = the value k days ago; meets is recomputed from the registry target by the caller
const histOf = (metric, values, meetsFn) => values.map((v, k) => ({ metric, day: day(k), value: v, meets: meetsFn(v) }));
const closedAt = (n) => day(n) + " 06:00:00";
const fires = (x) => x.findings.filter((fd) => fd.key.indexOf("METRIC-FIX-RELAPSED-1") === 0 && fd.file !== false);
const warns = (x) => x.findings.filter((fd) => fd.key.indexOf("METRIC-FIX-RELAPSED-1") === 0 && fd.file === false);

// --- fixtures: the two live cases (measured 2026-10-19)
// gateway_cap_30d_usd: trigger 364 gt 180, target "<=150 (owner threshold); live cap 200". Closure 10 days ago (value 150), cap moved to 180 on day 2.
const GW = { id: 2778, title: "METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: Cost gap: AI gateway cap above $180/30d", closed_at: closedAt(10) };
const gwValues = [180, 180, 180, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150];
const gwTarget = "<=150 (owner threshold); live cap 200";
const gwHist = histOf("gateway_cap_30d_usd", gwValues, (v) => (v <= 150 ? 1 : 0));
const gwFacts = { registry: [reg("gateway_cap_30d_usd", gwTarget)], history: gwHist, closed_issues: [GW], trigger_metric: { "364": "gateway_cap_30d_usd" }, trigger_pred: { "364": { operator: "gt", threshold: 180 } } };
// server_side_close_share_7d: trigger 5799 lt 0.9, target ">= 0.95 (...)". Closure 2 days ago on 0.906; 0.938 and 0.94 since (between trigger and target).
const SS = { id: 99947, title: "METRIC-TRIGGER-5799-SERVER-SIDE-CLOSE-SHARE-7D: Autonomy gap: sessions close more than 10% of issues", closed_at: closedAt(2) };
const ssValues = [0.94, 0.938, 0.906, 0.893, 0.948, 0.951, 0.964, 0.959, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96];
const ssTarget = ">= 0.95 (the fleet closes its own issues; a session close is the exception)";
const ssHist = histOf("server_side_close_share_7d", ssValues, (v) => (v >= 0.95 ? 1 : 0));
const ssFacts = { registry: [reg("server_side_close_share_7d", ssTarget)], history: ssHist, closed_issues: [SS], trigger_metric: { "5799": "server_side_close_share_7d" }, trigger_pred: { "5799": { operator: "lt", threshold: 0.9 } } };

let x = I.improvementEvaluate(gwFacts, NOW);
eq(x.fixes_judged, 1, "gateway_cap: the closure is judged");
eq(x.fixes_held, 1, "gateway_cap: held by the rule that closed it (180 is not gt 180)");
eq(x.fix_hold_rate_30d, 1, "gateway_cap: fix_hold_rate_30d counts it held");
eq(x.fix_target_hold_rate_30d, 0, "gateway_cap: fix_target_hold_rate_30d still counts the target miss");
eq(x.fixes_held_target, 0, "gateway_cap: no closure held against the target");
eq(x.relapses.length, 0, "gateway_cap: no relapse recorded");
eq(fires(x).length, 0, "gateway_cap: no fileable relapse finding");
eq(warns(x).length, 1, "gateway_cap: one early-warning finding");
eq((warns(x)[0] || {}).kind, "relapse-early-warning", "gateway_cap: the warning is typed");
eq(((warns(x)[0] || {}).close_evidence || "").indexOf("gt 180") > 0, true, "gateway_cap: the evidence names the trigger");
eq((x.target_misses || []).length, 1, "gateway_cap: one target_misses row");
eq(((x.target_misses || [])[0] || {}).issue_id, 2778, "gateway_cap: the row names the closed issue");

x = I.improvementEvaluate(ssFacts, NOW);
eq(x.fix_hold_rate_30d, 1, "server_side_close_share: held by trigger lt 0.9");
eq(x.fix_target_hold_rate_30d, 0, "server_side_close_share: missed the 0.95 target");
eq(x.relapses.length, 0, "server_side_close_share: no relapse recorded");
eq(fires(x).length, 0, "server_side_close_share: no fileable relapse finding");
eq(warns(x).length, 1, "server_side_close_share: one early warning");

// --- the trigger hit again after the closure is a relapse
const gwHit = histOf("gateway_cap_30d_usd", [200, 200, 180, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], (v) => (v <= 150 ? 1 : 0));
x = I.improvementEvaluate(Object.assign({}, gwFacts, { history: gwHit }), NOW);
eq(x.fixes_held, 0, "trigger hit again: not held");
eq(x.fix_hold_rate_30d, 0, "trigger hit again: fix_hold_rate_30d 0");
eq(x.relapses.length, 1, "trigger hit again: one relapse recorded");
eq((x.relapses[0] || {}).basis, "trigger", "trigger hit again: judged on the trigger");
eq((x.relapses[0] || {}).days_off, 2, "trigger hit again: two days hit (200, 200), 180 is not gt 180");
let f1 = fires(x);
eq(f1.length, 1, "trigger hit again: one fileable relapse finding");
eq((f1[0] || {}).key, "METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd", "trigger hit again: keyed by the metric");
eq(((f1[0] || {}).text || "").indexOf("trigger (gt 180)") > 0 && ((f1[0] || {}).text || "").indexOf("#") < 0, true, "trigger hit again: the text names the trigger and carries no bare issue reference");
eq(warns(x).length, 0, "trigger hit again: no early warning beside the relapse");

// hit after the closure but clear now: recorded as a relapse (it did not hold), not filed (no longer hit), early warning while the target is missed
const gwRecovered = histOf("gateway_cap_30d_usd", [180, 150, 150, 200, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], (v) => (v <= 150 ? 1 : 0));
x = I.improvementEvaluate(Object.assign({}, gwFacts, { history: gwRecovered }), NOW);
eq(x.relapses.length, 1, "hit then clear: the relapse is recorded");
eq(x.fix_hold_rate_30d, 0, "hit then clear: counted as not held");
eq(fires(x).length, 0, "hit then clear: nothing fileable");
const gwRecovered2 = histOf("gateway_cap_30d_usd", [150, 150, 150, 200, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], (v) => (v <= 150 ? 1 : 0));
x = I.improvementEvaluate(Object.assign({}, gwFacts, { history: gwRecovered2 }), NOW);
eq(x.findings.filter((fd) => fd.key.indexOf("METRIC-FIX-RELAPSED-1") === 0).length, 0, "hit then back on target: no finding at all");
// hit then clear while the target is still missed: an early warning (so an open relapse issue closes with true evidence), never fileable
const gwRecovered3 = histOf("gateway_cap_30d_usd", [180, 150, 150, 200, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], (v) => (v <= 150 ? 1 : 0));
x = I.improvementEvaluate(Object.assign({}, gwFacts, { history: gwRecovered3 }), NOW);
eq(warns(x).length, 1, "hit then clear and target still missed: one early warning");
eq(((warns(x)[0] || {}).close_evidence || "").indexOf("was hit on 1 day(s)") > 0 && ((warns(x)[0] || {}).close_evidence || "").indexOf("clear now") > 0, true, "its evidence says the trigger was hit and is clear now");

// --- an issue with no readable trigger is judged against the target, as before
const noPred = (extra) => Object.assign({}, gwFacts, extra);
x = I.improvementEvaluate(noPred({ trigger_pred: {} }), NOW);
eq(x.fix_hold_rate_30d, 0, "no trigger_pred: judged on the target (relapse)");
eq(x.fix_target_hold_rate_30d, 0, "no trigger_pred: both rates agree");
eq((x.relapses[0] || {}).basis, "target", "no trigger_pred: basis target");
eq(fires(x).length, 1, "no trigger_pred: the relapse is fileable as before");
eq(((fires(x)[0] || {}).text || "").indexOf("is off target again: issue #2778") === 0 || ((fires(x)[0] || {}).text || "").indexOf("gateway_cap_30d_usd is off target again: issue #2778") === 0, true, "no trigger_pred: the earlier wording");
x = I.improvementEvaluate(noPred({ trigger_pred: { "364": { operator: "gt", threshold: null } } }), NOW);
eq(fires(x).length, 1, "a trigger with no threshold is unreadable: target basis");
x = I.improvementEvaluate(noPred({ trigger_pred: { "364": { operator: "", threshold: 180 } } }), NOW);
eq(fires(x).length, 1, "a trigger with no operator is unreadable: target basis");
// an OBJECTIVE-CONSTRAINT-BREACH-1 closure has no trigger: target basis
const OC = { id: 2891, title: "OBJECTIVE-CONSTRAINT-BREACH-1: energy_efficiency", closed_at: closedAt(10) };
x = I.improvementEvaluate({ registry: [reg("energy_efficiency", ">= 0.8 (compute proxy)")], history: histOf("energy_efficiency", [0.7, 0.7, 0.7, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85], (v) => (v >= 0.8 ? 1 : 0)), closed_issues: [OC], trigger_metric: {}, trigger_pred: {} }, NOW);
eq(fires(x).length, 1, "a constraint breach that misses its target again is a relapse");
eq((x.relapses[0] || {}).basis, "target", "constraint breach: target basis");
// a DISABLED trigger files and recovers nothing, so a closure under it keeps the target-based judgement (a metric cannot leave the check by its trigger being switched off)
for (const off of [0, "0", false]) {
  x = I.improvementEvaluate(noPred({ trigger_pred: { "364": { operator: "gt", threshold: 180, enabled: off } } }), NOW);
  eq(fires(x).length, 1, "a disabled trigger (enabled " + JSON.stringify(off) + "): the target-based relapse is fileable");
  eq((x.relapses[0] || {}).basis, "target", "a disabled trigger: target basis");
}
x = I.improvementEvaluate(noPred({ trigger_pred: { "364": { operator: "gt", threshold: 180, enabled: 1 } } }), NOW);
eq(fires(x).length, 0, "an enabled trigger (enabled 1) is judged by its predicate");
// the revert switch (ops_config il_relapse_trigger_judge = off arrives as f.relapse_trigger_judge === false) restores the old judgement everywhere
x = I.improvementEvaluate(Object.assign({}, gwFacts, { relapse_trigger_judge: false }), NOW);
eq(x.fix_hold_rate_30d, 0, "switch off: gateway_cap closure judged on the target (relapse)");
eq(fires(x).length, 1, "switch off: the earlier fileable relapse finding is back");
eq(warns(x).length, 0, "switch off: no early warning");
eq((x.target_misses || []).length, 0, "switch off: nothing is a trigger-clear target miss");
x = I.improvementEvaluate(Object.assign({}, gwFacts, { relapse_trigger_judge: true }), NOW);
eq(fires(x).length, 0, "switch on (explicit): trigger-judged");

// --- operators (the comparison v_metric_trigger_state uses; an unknown operator is gte)
const tp = (operator, threshold) => I.ilTriggerPred ? I.ilTriggerPred("1", { "1": { operator, threshold } }) : null;
const hit = (operator, threshold, value) => (I.ilTriggerHit && tp(operator, threshold) ? I.ilTriggerHit(tp(operator, threshold), value) : "missing");
eq(hit("gt", 180, 180), false, "gt: equal is not hit");
eq(hit("gt", 180, 181), true, "gt: above is hit");
eq(hit("lt", 0.9, 0.9), false, "lt: equal is not hit");
eq(hit("lt", 0.9, 0.893), true, "lt: below is hit");
eq(hit("lte", 5, 5), true, "lte: equal is hit");
eq(hit("gte", 5, 5), true, "gte: equal is hit");
eq(hit("gte", 5, 4.9), false, "gte: below is clear");
eq(hit("eq", 3, 3), true, "eq: equal is hit");
eq(hit("weird", 5, 5), true, "an unknown operator reads as gte");
eq(I.ilTriggerPred ? I.ilTriggerPred("9", { "1": { operator: "gt", threshold: 1 } }) : "missing", null, "an unknown trigger id has no predicate");
eq(I.ilIssueTriggerId ? I.ilIssueTriggerId("METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: x") : "missing", "364", "the trigger id comes from the title");
eq(I.ilIssueTriggerId ? I.ilIssueTriggerId("OBJECTIVE-CONSTRAINT-BREACH-1: energy_efficiency") : "missing", null, "a constraint title has no trigger id");

// A per-closure probe exists before a subsequent daily history row can expose a relapse.
const monitorDate = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const monitor = I.ilRelapseContract(
  { id: GW.id, title: GW.title, closed_at: monitorDate + " 06:00:00" },
  { trigger_metric: { "364": "gateway_cap_30d_usd" }, trigger_pred: { "364": { operator: "gt", threshold: 180, enabled: 1 } } }
);
eq(monitor.class, "metric-relapse-2778", "monitor class is stable and names the closed issue");
eq(monitor.issue_id, 2778, "monitor is linked to the closed issue");
eq(monitor.action.includes("structural fix") && monitor.action.includes("rather than rerunning"), true, "monitor directs a structural replacement instead of a retry");
const monitorDb = new DatabaseSync(":memory:");
monitorDb.exec("CREATE TABLE metric_history (metric TEXT, day TEXT, value REAL, meets INTEGER)");
monitorDb.prepare("INSERT INTO metric_history VALUES (?1, ?2, ?3, ?4)").run("gateway_cap_30d_usd", monitorDate, 180, 1);
eq(monitorDb.prepare(monitor.verify_probe).get().observed, "0", "the closure-day value is outside the relapse window");
const nextDate = (n) => new Date(Date.parse(monitorDate + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
monitorDb.prepare("INSERT INTO metric_history VALUES (?1, ?2, ?3, ?4)").run("gateway_cap_30d_usd", nextDate(1), 180, 1);
eq(monitorDb.prepare(monitor.verify_probe).get().observed, "0", "a post-close value on the clear side of the trigger passes");
monitorDb.prepare("INSERT INTO metric_history VALUES (?1, ?2, ?3, ?4)").run("gateway_cap_30d_usd", nextDate(2), 181, 0);
eq(monitorDb.prepare(monitor.verify_probe).get().observed, "1", "the probe catches a post-close recurrence of the trigger");
const targetMonitor = I.ilRelapseContract(
  { id: 2891, title: "OBJECTIVE-CONSTRAINT-BREACH-1: energy_efficiency", closed_at: monitorDate },
  {}
);
eq(monitorDb.prepare("SELECT instr(?1, 'meets = 0') > 0 AS target_probe").get(targetMonitor.verify_probe).target_probe, 1, "an issue without a trigger uses its target result");
monitorDb.prepare("INSERT INTO metric_history VALUES (?1, ?2, ?3, ?4)").run("energy_efficiency", nextDate(1), 0.7, 0);
eq(monitorDb.prepare(targetMonitor.verify_probe).get().observed, "1", "target-based closures detect a post-close target failure");
const expiredMonitor = I.ilRelapseContract(
  { id: 2893, title: GW.title, closed_at: new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10) },
  { trigger_metric: { "364": "gateway_cap_30d_usd" }, trigger_pred: { "364": { operator: "gt", threshold: 180, enabled: 1 } } }
);
eq(monitorDb.prepare(expiredMonitor.verify_probe).get().observed, "0", "expired durability windows stop reporting historical recurrences");
eq(I.ilRelapseContract({ id: 2892, title: "METRIC-REGRESSION-1: gateway_cap_30d_usd", closed_at: monitorDate }, {}), null, "trend-only closures do not get relapse monitors");
eq(I.ilRelapseContract({ id: 0, title: GW.title, closed_at: monitorDate }, { trigger_metric: { "364": "gateway_cap_30d_usd" } }), null, "invalid issue ids cannot create contracts");

// --- mixed ratio: held clear, relapsed on trigger, trigger-clear target-miss
const mixHist = histOf("m_ok", Array(14).fill(10), () => 1)
  .concat(histOf("m_hit", [60, 60, 60, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], (v) => (v <= 20 ? 1 : 0)))
  .concat(histOf("m_gap", Array(14).fill(30), (v) => (v <= 20 ? 1 : 0)));
x = I.improvementEvaluate({
  registry: [reg("m_ok", "<= 20"), reg("m_hit", "<= 20"), reg("m_gap", "<= 20")], history: mixHist,
  closed_issues: [
    { id: 1, title: "METRIC-TRIGGER-1-M-OK: a", closed_at: closedAt(8) },
    { id: 2, title: "METRIC-TRIGGER-2-M-HIT: b", closed_at: closedAt(8) },
    { id: 3, title: "METRIC-TRIGGER-3-M-GAP: c", closed_at: closedAt(8) }],
  trigger_metric: { "1": "m_ok", "2": "m_hit", "3": "m_gap" },
  trigger_pred: { "1": { operator: "gt", threshold: 50 }, "2": { operator: "gt", threshold: 50 }, "3": { operator: "gt", threshold: 50 } }
}, NOW);
eq(x.fixes_judged, 3, "mixed: three judged");
eq(x.fix_hold_rate_30d, 0.6667, "mixed: two of three held by the trigger (m_ok, m_gap)");
eq(x.fix_target_hold_rate_30d, 0.3333, "mixed: one of three held by the target (m_ok)");
eq(fires(x).map((fd) => fd.metric).join(","), "m_hit", "mixed: only the trigger relapse is fileable");
eq(warns(x).map((fd) => fd.metric).join(","), "m_gap", "mixed: the target-only miss is an early warning");

// --- a real relapse and an early warning on one metric: one finding per key, whichever closed issue is seen first
const twoClear = (order) => {
  const later = { id: 11, title: "METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: later closure", closed_at: closedAt(2) };
  const earlier = { id: 10, title: "METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: earlier closure", closed_at: closedAt(12) };
  // day 5 hit; days 0..2 are 180 (trigger clear, target missed): the later closure holds, the earlier one relapsed but is clear now
  const hist = histOf("gateway_cap_30d_usd", [180, 180, 180, 150, 150, 200, 150, 150, 150, 150, 150, 150, 150, 150], (v) => (v <= 150 ? 1 : 0));
  return I.improvementEvaluate(Object.assign({}, gwFacts, { history: hist, closed_issues: order === "warn-first" ? [later, earlier] : [earlier, later] }), NOW);
};
for (const order of ["warn-first", "relapse-first"]) {
  const y = twoClear(order);
  eq(y.relapses.length, 1, order + ": the earlier closure relapsed");
  eq(fires(y).length, 0, order + ": recovered relapse is not fileable");
  eq(warns(y).length, 1, order + ": exactly one early warning for the metric");
}
// a target-judged relapse (a constraint breach on the same metric, no trigger) beats the trigger-judged closure's early warning, in either order
const mixedBasis = (order) => {
  const trig = { id: 10, title: "METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: closure judged on the trigger", closed_at: closedAt(10) };
  const cons = { id: 12, title: "OBJECTIVE-CONSTRAINT-BREACH-1: gateway_cap_30d_usd", closed_at: closedAt(10) };
  return I.improvementEvaluate(Object.assign({}, gwFacts, { closed_issues: order === "warn-first" ? [trig, cons] : [cons, trig] }), NOW);
};
for (const order of ["warn-first", "relapse-first"]) {
  const y = mixedBasis(order);
  eq(fires(y).length, 1, order + ": the target-judged relapse is fileable once");
  eq(warns(y).length, 0, order + ": and no early warning for the same metric remains");
  eq(y.findings.filter((fd) => fd.key === "METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd").length, 1, order + ": one finding per metric key");
  eq(y.fixes_judged, 2, order + ": both closures are judged");
  eq(y.fix_hold_rate_30d, 0.5, order + ": one held by the trigger, one relapsed on the target");
}

// --- the tick on an in-memory D1
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (!sqlite) {
  console.log("improvement-relapse-trigger.test: node:sqlite unavailable (Node < 22); D1 replay skipped");
} else {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), close_evidence TEXT);
CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
`);
  function stmtOn(sql) {
    let args = [];
    const self = {
      bind(...v) { args = v.map((y) => (y === undefined ? null : y)); return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return self;
  }
  const env = { AUDIT: { prepare: (sql) => stmtOn(sql) } };
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const realNow = Date.now();
  const dd = (n) => new Date(realNow - n * 864e5).toISOString().slice(0, 10);
  const insReg = db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, target, disposition_actor, refresh_cadence, last_value, state) VALUES (?, 'fleet', 'leading', 's', ?, 'a', 'hourly', ?, 'MEASURED')");
  const insHist = db.prepare("INSERT OR REPLACE INTO metric_history (metric, day, value, meets, target, ts) VALUES (?, ?, ?, ?, '', '')");
  const insTrig = db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, operator, threshold, enabled) VALUES (?, ?, ?, ?, ?, 1)");
  // gateway_cap_30d_usd: the live case (trigger gt 180 clear at 180, target <= 150 missed)
  insReg.run("gateway_cap_30d_usd", gwTarget, "180");
  insTrig.run(364, "gateway_cap_30d_usd", "Cost gap", "gt", 180);
  // worker_count: a genuine relapse (trigger gt 30 hit again at 40)
  insReg.run("worker_count", "<= 24", "40");
  insTrig.run(344, "worker_count", "Core gap", "gt", 30);
  for (let k = 1; k <= 13; k++) {
    insHist.run("gateway_cap_30d_usd", dd(k), k <= 2 ? 180 : 150, k <= 2 ? 0 : 1);
    insHist.run("worker_count", dd(k), k <= 2 ? 40 : 20, k <= 2 ? 0 : 1);
  }
  const closeAt = realNow - 10 * 864e5;
  const mkClosed = (title) => { const r = db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, 'closed', 0, ?)").run(title, closeAt); db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'TRIGGER-RECOVERY-1', 'o', 'now', 'recovered')").run(Number(r.lastInsertRowid)); };
  mkClosed("METRIC-TRIGGER-364-GATEWAY-CAP-30D-USD: Cost gap: AI gateway cap above $180/30d");
  mkClosed("METRIC-TRIGGER-344-WORKER-COUNT: Core gap");
  // the open relapse issue the pre-fix loop filed for the gateway cap (agent_issues 2884)
  db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES ('METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd', 'open', 0, 0)").run();

  const t = await I.improvementLoopTick(env);
  eq(t.ok, true, "the tick runs");
  const st = (title) => (one("SELECT status FROM agent_issues WHERE title = ? ORDER BY id DESC", title) || {}).status;
  const ev = (title) => (one("SELECT close_evidence e FROM issue_triage WHERE issue_id = (SELECT id FROM agent_issues WHERE title = ? ORDER BY id DESC LIMIT 1)", title) || {}).e || "";
  eq(st("METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd"), "closed", "the open relapse issue of a trigger-clear metric is closed");
  const gev = ev("METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd");
  eq(gev.indexOf("IL-RELAPSE-TRIGGER-1") > 0 && gev.indexOf("gt 180") > 0 && gev.indexOf("early warning") > 0, true, "with early-warning evidence naming the trigger", gev);
  eq(gev.indexOf("back inside its target") < 0, true, "and not the untrue 'back inside its target'");
  eq(st("METRIC-FIX-RELAPSED-1: worker_count"), "open", "a genuine relapse (trigger gt 30 hit at 40) is filed");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title = 'METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd'").n, 1, "nothing is filed for the gateway cap");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'METRIC-FIX-RELAPSED-1:%' AND status = 'open'").n, 1, "exactly one relapse issue is open (worker_count)");
  eq(t.fix_hold_rate_30d, 0.5, "the tick reports fix_hold_rate_30d by the trigger (gateway held, worker_count relapsed)");
  const gatewayMonitor = one("SELECT * FROM remediation_contracts WHERE class = 'metric-relapse-1'");
  const workerMonitor = one("SELECT * FROM remediation_contracts WHERE class = 'metric-relapse-2'");
  eq(gatewayMonitor.issue_id, 1, "the held metric closure receives its own relapse contract");
  eq(workerMonitor.issue_id, 2, "the relapsed metric closure receives its own relapse contract");
  eq(gatewayMonitor.verify_transport, "d1-query", "relapse contract uses the D1 probe transport");
  eq(one(gatewayMonitor.verify_probe).observed, "0", "the closure-specific probe passes while its trigger stays clear");
  eq(one(workerMonitor.verify_probe).observed, "3", "the closure-specific probe detects later trigger hits, including today's reading");
  eq(workerMonitor.action.includes("structural fix") && workerMonitor.action.includes("rather than rerunning"), true, "the contract prescribes a structural replacement, not a rerun");
  eq(one("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'metric-relapse-%'").n, 2, "one relapse contract is installed per eligible closed issue");
  eq(t.fix_target_hold_rate_30d, 0, "and the strict fix_target_hold_rate_30d");
  eq(Number(one("SELECT last_value v FROM metric_registry WHERE metric = 'fix_hold_rate_30d'").v), 0.5, "fix_hold_rate_30d is written to metric_registry");
  eq(Number((one("SELECT last_value v FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'") || {}).v), 0, "fix_target_hold_rate_30d is written to metric_registry");
  eq((one("SELECT kind k FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'") || {}).k, "guard", "the new metric is a guard metric");
  eq(one("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE metric_key = 'fix_target_hold_rate_30d'").n, 0, "and has no threshold trigger (named exemption)");
  const run = one("SELECT fixes_judged, fixes_held, state_json FROM improvement_loop_runs ORDER BY id DESC LIMIT 1");
  eq(run.fixes_judged, 2, "the run row records two judged closures");
  eq(run.fixes_held, 1, "and one held by the trigger");
  eq(JSON.parse(run.state_json).fix_target_hold_rate_30d, 0, "state_json carries the strict rate");
  const t2 = await I.improvementLoopTick(env);
  eq(t2.filed, 0, "a second tick files nothing new");
  eq(st("METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd"), "closed", "the closed gateway cap relapse issue stays closed");
  // the revert switch on the real tick: off judges the closure on the target again and files the relapse; removing the row closes it with the early-warning evidence
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('il_relapse_trigger_judge', 'off')").run();
  const t3 = await I.improvementLoopTick(env);
  eq(t3.fix_hold_rate_30d, 0, "switch off: the tick judges every closure on the target (0 held)");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title = 'METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd' AND status = 'open'").n, 1, "switch off: the target-based relapse is filed again");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'METRIC-FIX-RELAPSED-1:%' AND status = 'open'").n <= 3, true, "and a tick still files at most 3");
  db.prepare("DELETE FROM ops_config").run();
  const t4 = await I.improvementLoopTick(env);
  eq(t4.fix_hold_rate_30d, 0.5, "switch removed: trigger-judged again");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title = 'METRIC-FIX-RELAPSED-1: gateway_cap_30d_usd' AND status = 'open'").n, 0, "switch removed: the relapse issue of the trigger-clear metric is closed with evidence again");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
