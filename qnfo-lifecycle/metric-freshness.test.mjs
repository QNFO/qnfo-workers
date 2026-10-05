// METRIC-CADENCE-UNITS-1 + METRIC-UNMEASURED-CLASS-1 (#1865): the freshness auditor reads "*/3h" and "2h" with their unit,
// and reports a never-measured UNMEASURED / n/a metric in its own class instead of as a stale writer.
// Run: node qnfo-lifecycle/metric-freshness.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// METRIC-CADENCE-UNITS-1"), b = src.indexOf("async function handleMetricsRefresh");
if (a < 0 || b < a) throw new Error("metric-freshness block not found");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, refresh_cadence TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, remediation TEXT, close_evidence TEXT);
CREATE TABLE service_registry (service TEXT PRIMARY KEY);`);
const d1 = { prepare(sql) { const st = db.prepare(sql); let args = []; const o = { bind(...x) { args = x; return o; }, async first() { return st.get(...args) || null; }, async all() { return { results: st.all(...args) }; }, async run() { const r = st.run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return o; } };
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, Array, isNaN, parseInt, AbortSignal, QNFO_VERSION: "test", fetch: async () => { throw new Error("offline"); } });
vm.runInContext(src.slice(a, b) + "\nthis.__k = { metricCadenceMinutes, runMetricFreshness };", cx);
const { metricCadenceMinutes, runMetricFreshness } = cx.__k;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

ok(metricCadenceMinutes("*/15") === 15, "*/15 is 15 minutes");
ok(metricCadenceMinutes("*/3h") === 180, "*/3h is 180 minutes (was read as 3)");
ok(metricCadenceMinutes("2h") === 120, "2h is 120 minutes (was unparsed)");
ok(metricCadenceMinutes("30m") === 30 && metricCadenceMinutes("1d") === 1440, "m and d units");
ok(metricCadenceMinutes("hourly") === 60 && metricCadenceMinutes("daily") === 1440, "named cadences unchanged");
ok(metricCadenceMinutes("sometimes") === null && metricCadenceMinutes("*/3x") === null, "unknown forms stay unparsed");

const NOW = Date.now(), ago = (min) => new Date(NOW - min * 60000).toISOString();
const ins = db.prepare("INSERT INTO metric_registry (metric, refresh_cadence, last_value, last_refreshed, state) VALUES (?, ?, ?, ?, ?)");
ins.run("inbound_unactioned_72h", "*/3h", "0", ago(60), "MEASURED");              // fresh under the 3h cadence
ins.run("q08_gate_pass_rate_7d", "2h", "0.476", ago(100), "MEASURED");             // fresh under 2h
ins.run("ask_helpful_rate_30d", "hourly", null, null, "UNMEASURED");               // under 10 ratings: no reading yet
ins.run("paper_math_browser_fail_pages", "daily", null, null, "n/a");
ins.run("open_agent_issues", "hourly", "5", ago(5), "MEASURED");
ins.run("worker_count", "daily", "44", ago(5), "MEASURED");
let out = await runMetricFreshness({ QNFO_AUDIT: d1 });
ok(out.stale === 0 && out.never === 0 && out.unparsed_cadence === 0, "unit cadences read fresh; nothing stale, never or unparsed (" + JSON.stringify({ s: out.stale, n: out.never, u: out.unparsed_cadence }) + ")");
ok(out.unmeasured === 2 && out.unmeasured_metrics.join(",") === "ask_helpful_rate_30d,paper_math_browser_fail_pages", "never-measured UNMEASURED and n/a rows are their own class");
// a MEASURED row with no refresh is still a dead writer
ins.run("clef_candidate_calls_7d", "hourly", null, null, "MEASURED");
ins.run("pageviews_30d", "hourly", "9000", ago(1499), "MEASURED");
out = await runMetricFreshness({ QNFO_AUDIT: d1 });
ok(out.never === 1 && out.stale === 1 && out.filed_issue === true, "a MEASURED metric never refreshed and a 1499m-old hourly metric still count and file the issue");
const iss = db.prepare("SELECT description FROM agent_issues WHERE status = 'open'").get();
ok(/clef_candidate_calls_7d \(never refreshed\)/.test(iss.description) && /awaiting a first reading/.test(iss.description), "the description names the dead writers and lists the unmeasured class separately");
// an UNMEASURED metric that its writer stamped is judged on its cadence
db.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = 'ask_helpful_rate_30d'").run(ago(500));
out = await runMetricFreshness({ QNFO_AUDIT: d1 });
ok(out.unmeasured === 1 && out.stale === 2, "a stamped UNMEASURED row 500m old on an hourly cadence is stale again");
// recovery closes the issue with evidence
db.prepare("DELETE FROM metric_registry WHERE metric IN ('clef_candidate_calls_7d', 'pageviews_30d', 'ask_helpful_rate_30d')").run();
out = await runMetricFreshness({ QNFO_AUDIT: d1 });
const tri = db.prepare("SELECT close_evidence FROM issue_triage").get();
ok(out.closed_issue && /never-measured UNMEASURED excluded: paper_math_browser_fail_pages/.test(tri.close_evidence), "a fresh registry closes the issue and its evidence names the excluded class");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
