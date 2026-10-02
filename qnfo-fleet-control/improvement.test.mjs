/**
 * improvement.test.mjs -- offline regression lock for IMPROVEMENT-LOOP-1.
 * Slices the block out of worker.js and drives improvementEvaluate with synthetic history.
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- IMPROVEMENT-LOOP-1:BEGIN";
const END = "// ---- IMPROVEMENT-LOOP-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL improvement block markers missing"); console.log("1 failed"); process.exit(1); }
const ca = src.indexOf("// ---- CHARTER-LOOP-1:BEGIN"), cb = src.indexOf("// ---- CHARTER-LOOP-1:END ----");
if (ca < 0 || cb < 0) { console.error("FAIL charter block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { VERSION: "test", timedFetch: null, b64encode: null, sha256: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, isFinite, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(ca, cb + "// ---- CHARTER-LOOP-1:END ----".length) + "\n" + src.slice(a, b + END.length) + "\n__export = { improvementEvaluate, improvementLoopTick, ilDirection, ilIssueMetric, IL_SELF_METRICS };", sandbox, { filename: "improvement-block.js" });
const I = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
const NOW = Date.parse("2026-10-20T12:00:00Z");
const day = (n) => new Date(NOW - n * 864e5).toISOString().slice(0, 10);
// history for one metric: values[k] is the value k days ago (k = 0..13)
const hist = (metric, values, meets) => values.map((v, k) => ({ metric, day: day(k), value: v, meets: meets ? meets[k] : null }));
const flat14 = (v) => Array.from({ length: 14 }, () => v);
const step = (recent, prior) => Array.from({ length: 14 }, (_, k) => (k < 7 ? recent : prior));

// direction from targets, including the live registry's forms
eq(I.ilDirection("<= 200 (A9 ceiling)"), "down", "<= is down");
eq(I.ilDirection(">=2 per flagship"), "up", ">= is up");
eq(I.ilDirection("+10 new/month"), "up", "+N is up");
eq(I.ilDirection("maximize (feeds external_impact)"), "up", "maximize is up");
eq(I.ilDirection("all 0"), "down", "all 0 is down");
eq(I.ilDirection("0"), "down", "bare 0 is down");
eq(I.ilDirection("<=144/day each (CRON-MANDATE-1)"), null, "per-unit rule has no direction");
eq(I.ilDirection("RETIRED 2026-10-01"), null, "retired has no direction");
eq(I.ilDirection("< 24h behind repo main"), "down", "< is down");

// metric names from closed issue titles
eq(I.ilIssueMetric("METRIC-TRIGGER-344-WORKER-COUNT: Core gap", { "344": "worker_count" }), "worker_count", "trigger issue maps through the trigger id");
eq(I.ilIssueMetric("OBJECTIVE-CONSTRAINT-BREACH-1: energy_efficiency", {}), "energy_efficiency", "constraint issue");
eq(I.ilIssueMetric("METRIC-REGRESSION-1: pageviews_30d", {}), "pageviews_30d", "regression issue");
eq(I.ilIssueMetric("SOMETHING-ELSE", {}), null, "unrelated issue");

const reg = (metric, target) => ({ metric, target, state: "MEASURED" });

// unknown is never a finding
let x = I.improvementEvaluate({ registry: [reg("pageviews_30d", "maximize")], history: hist("pageviews_30d", [100, 90, 80]) }, NOW);
eq(x.evaluable, 0, "three days of history: unmeasured");
eq(x.findings.length, 0, "unmeasured files nothing");
eq(x.improvement_rate_7d, null, "rate is null when nothing is evaluable");

// a 'maximize' metric that fell 40% is a regression even with no threshold
x = I.improvementEvaluate({ registry: [reg("pageviews_30d", "maximize")], history: hist("pageviews_30d", step(60, 100)) }, NOW);
eq(x.regressed, 1, "maximize metric down 40% is regressed");
eq(x.findings[0] && x.findings[0].key, "METRIC-REGRESSION-1: pageviews_30d", "regression finding key");
eq(x.findings[0] && x.findings[0].severity, "medium", "no target: medium");
eq(x.metric_regressions_7d, 1, "regression count");

// a cost metric that went DOWN 30% improved; one that went up 10% is flat (under the 15% bar)
x = I.improvementEvaluate({ registry: [reg("cost_usd_30d", "<= 200"), reg("worker_count", "<= 24")], history: hist("cost_usd_30d", step(315, 450)).concat(hist("worker_count", step(44, 40))) }, NOW);
eq(x.improved, 1, "cost down 30% improved");
eq(x.flat, 1, "worker_count up 10% is flat");
eq(x.improvement_rate_7d, 0.5, "rate 1 of 2");
eq(x.findings.length, 0, "no findings");

// regression while off target is high; covered by an open trigger issue it is carried there, not filed twice
const offMeets = Array.from({ length: 14 }, () => 0);
x = I.improvementEvaluate({ registry: [reg("cost_usd_30d", "<= 200")], history: hist("cost_usd_30d", step(600, 450), offMeets), open_titles: ["METRIC-TRIGGER-9-COST-USD-30D: Cost gap"], trigger_metric: { "9": "cost_usd_30d" } }, NOW);
eq(x.findings[0] && x.findings[0].severity, "high", "worsening and off target: high");
eq(x.findings[0] && x.findings[0].covered_by, "METRIC-TRIGGER-9-COST-USD-30D: Cost gap", "covered by the open trigger issue");

// hysteresis: an open regression stays open at -10%, closes at -5%
const openReg = ["METRIC-REGRESSION-1: referral_30d"];
x = I.improvementEvaluate({ registry: [reg("referral_30d", "maximize")], history: hist("referral_30d", step(90, 100)), open_titles: openReg }, NOW);
eq(x.findings.length, 1, "open regression at -10% stays open");
x = I.improvementEvaluate({ registry: [reg("referral_30d", "maximize")], history: hist("referral_30d", step(95, 100)), open_titles: openReg }, NOW);
eq(x.findings.length, 0, "open regression at -5% clears");
x = I.improvementEvaluate({ registry: [reg("referral_30d", "maximize")], history: hist("referral_30d", step(90, 100)) }, NOW);
eq(x.findings.length, 0, "a new -10% decline is not filed");

// retired metrics are skipped
x = I.improvementEvaluate({ registry: [{ metric: "impressions_growth_30d", target: "RETIRED", state: "RETIRED" }], history: hist("impressions_growth_30d", step(1, 100)) }, NOW);
eq(x.trends.length, 0, "retired metric skipped");

// fix durability: one fix held, one relapsed and is still off target
const meetsAfterClose = (offFrom) => Array.from({ length: 14 }, (_, k) => (k <= offFrom ? 0 : 1));
const closed = [
  { id: 1755, title: "METRIC-TRIGGER-343-COST-PER-SUCCESSFUL-TASK-BY-CLASS: Cost gap", closed_at: day(10) + " 06:00:00" },
  { id: 1753, title: "METRIC-TRIGGER-341-SUBSCRIBERS-GROWTH-MONTHLY: Reach gap", closed_at: day(10) + " 06:00:00" },
  { id: 1801, title: "METRIC-REGRESSION-1: subscribers_growth_monthly", closed_at: day(5) + " 06:00:00" }
];
const tm = { "343": "cost_per_successful_task_by_class", "341": "subscribers_growth_monthly" };
x = I.improvementEvaluate({
  registry: [reg("cost_per_successful_task_by_class", "<0.05 USD/task"), reg("subscribers_growth_monthly", "+10 new/month")],
  history: hist("cost_per_successful_task_by_class", flat14(0.04), Array.from({ length: 14 }, () => 1)).concat(hist("subscribers_growth_monthly", flat14(3), meetsAfterClose(4))),
  closed_issues: closed, trigger_metric: tm
}, NOW);
eq(x.fixes_judged, 2, "two recovery-type closures judged (the regression closure is not)");
eq(x.fixes_held, 1, "one held");
eq(x.fix_hold_rate_30d, 0.5, "hold rate 0.5");
eq(x.relapses.length, 1, "one relapse recorded");
eq(x.relapses[0] && x.relapses[0].issue_id, 1753, "relapse names the closed issue");
const rel = x.findings.find((fd) => fd.key === "METRIC-FIX-RELAPSED-1: subscribers_growth_monthly");
eq(!!rel, true, "relapse finding while still off target");
eq(rel && rel.text.includes("#1753"), true, "relapse text names the issue whose fix did not hold");

// a relapse that has recovered since is counted but not filed
x = I.improvementEvaluate({
  registry: [reg("subscribers_growth_monthly", "+10 new/month")],
  history: hist("subscribers_growth_monthly", flat14(12), Array.from({ length: 14 }, (_, k) => (k === 3 ? 0 : 1))),
  closed_issues: [closed[1]], trigger_metric: tm
}, NOW);
eq(x.fix_hold_rate_30d, 0, "a dip after closure counts against the hold rate");
eq(x.findings.filter((fd) => fd.key.indexOf("METRIC-FIX-RELAPSED-1") === 0).length, 0, "recovered relapse is not filed");

// self metrics declare targets and triggers the trigger loop can read
eq(I.IL_SELF_METRICS.length, 3, "three self metrics");
eq(I.IL_SELF_METRICS.filter((m) => m.trigger).length, 2, "two self triggers");

// --- the hourly tick against an in-memory D1 (node:sqlite, Node 22) ---------------------------------------------------
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (!sqlite) {
  console.log("improvement.test: node:sqlite unavailable (Node < 22); D1 replay skipped");
} else {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NOT (lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly')) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), close_evidence TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
`);
  const insReg = db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, target, disposition_actor, refresh_cadence, last_value, state) VALUES (?, 'fleet', 'leading', 's', ?, 'a', 'hourly', ?, ?)");
  insReg.run("pageviews_30d", "maximize (feeds impressions_growth_30d)", "5960", "MEASURED");
  insReg.run("cost_usd_30d", "<= 200 (A9 ceiling)", "450.56", "MEASURED");
  insReg.run("impressions_growth_30d", "RETIRED", "27", "RETIRED");
  insReg.run("notes", "maximize", "n/a", "MEASURED");
  function stmtOn(sql) {
    let args = [];
    const self = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return self;
  }
  const env = { AUDIT: { prepare: (sql) => stmtOn(sql) } };
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const realNow = Date.now();
  const dd = (n) => new Date(realNow - n * 864e5).toISOString().slice(0, 10);

  let t = await I.improvementLoopTick(env);
  eq(t.ok, true, "tick 1 runs");
  eq(t.snapshotted, 2, "tick 1 snapshots the two numeric, non-retired metrics");
  eq(t.evaluable, 0, "tick 1: one day of history is unmeasured");
  eq(t.filed, 0, "tick 1 files nothing");
  eq(one("SELECT meets FROM metric_history WHERE metric='cost_usd_30d'").meets, 0, "cost 450 > 200 recorded as off target");
  eq(one("SELECT meets FROM metric_history WHERE metric='pageviews_30d'").meets, null, "maximize has no meets");
  eq(one("SELECT COUNT(*) n FROM metric_registry WHERE metric IN ('improvement_rate_7d','metric_regressions_7d','fix_hold_rate_30d')").n, 3, "self metrics registered past the integrity triggers");
  eq(one("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE notes='seeded by IMPROVEMENT-LOOP-1'").n, 2, "self triggers seeded");
  t = await I.improvementLoopTick(env);
  eq(one("SELECT COUNT(*) n FROM metric_history").n, 2, "same-day tick upserts, never duplicates");
  eq(one("SELECT COUNT(*) n FROM analytics_metric_triggers").n, 2, "seeds are idempotent");

  // backfill 13 earlier days: pageviews fell 40% week on week, cost fell 30%
  const ins = db.prepare("INSERT OR REPLACE INTO metric_history (metric, day, value, meets, target, ts) VALUES (?, ?, ?, ?, '', '')");
  for (let k = 1; k <= 13; k++) { ins.run("pageviews_30d", dd(k), k < 7 ? 3600 : 6000, null); ins.run("cost_usd_30d", dd(k), k < 7 ? 315 : 450, 0); }
  db.prepare("UPDATE metric_registry SET last_value='3600' WHERE metric='pageviews_30d'").run();
  db.prepare("UPDATE metric_registry SET last_value='315' WHERE metric='cost_usd_30d'").run();
  t = await I.improvementLoopTick(env);
  eq(t.evaluable, 2, "tick 3: both directional metrics evaluable");
  eq(t.improved, 1, "cost improved");
  eq(t.regressed, 1, "pageviews regressed");
  eq(t.filed, 1, "one regression filed");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title='METRIC-REGRESSION-1: pageviews_30d'").n, 1, "regression issue open");
  eq(Number(one("SELECT last_value v FROM metric_registry WHERE metric='improvement_rate_7d'").v), 0.5, "improvement_rate_7d written");
  t = await I.improvementLoopTick(env);
  eq(t.filed, 0, "dedupe: no second regression issue");
  // recovery: pageviews back to the prior level
  for (let k = 0; k < 7; k++) ins.run("pageviews_30d", dd(k), 6000, null);
  db.prepare("UPDATE metric_registry SET last_value='6000' WHERE metric='pageviews_30d'").run();
  t = await I.improvementLoopTick(env);
  eq(t.closed, 1, "recovered regression closed");
  eq(one("SELECT status FROM agent_issues WHERE title='METRIC-REGRESSION-1: pageviews_30d'").status, "closed", "closed with evidence past the close-evidence trigger");
  eq(/IMPROVEMENT-LOOP-1/.test(one("SELECT close_evidence e FROM issue_triage").e), true, "close evidence names the loop");
  eq(one("SELECT COUNT(*) n FROM improvement_loop_runs").n, 5, "one ledger row per tick");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
