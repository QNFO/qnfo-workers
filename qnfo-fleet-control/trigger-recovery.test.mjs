// TRIGGER-RECOVERY-1: a METRIC-TRIGGER issue closes itself, with close_evidence, once its metric has been back on the right
// side of the threshold for TRIGGER_RECOVERY_MIN minutes; a breach during the streak ends it. Runs the real
// evaluateMetricTriggers against an in-memory D1 (node:sqlite). Also checks the publication preflight and calibrator fixes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = cut("// ---- ACT-BRIDGE-1:BEGIN", "// ---- ACT-BRIDGE-1:END") +
  cut("async function evaluateMetricTriggers(env)", "__name(evaluateMetricTriggers") +
  cut("async function metricTriggerValue(db, t)", "__name(metricTriggerValue") +
  (src.indexOf("function triggerNum(") >= 0 ? "\n" + src.slice(src.indexOf("function triggerNum("), src.indexOf("\n}\n", src.indexOf("function triggerNum(")) + 3) : "");
const sb = { console, Date, JSON, Math, Number, String, isFinite };
vm.createContext(sb);
vm.runInContext(code + "\n__x = { evaluateMetricTriggers, triggerRecoveryDue, TRIGGER_RECOVERY_MIN };", sb);
const { evaluateMetricTriggers, triggerRecoveryDue, TRIGGER_RECOVERY_MIN } = sb.__x;

const sq = new DatabaseSync(":memory:");
sq.exec(`CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority TEXT, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
CREATE TABLE analytics_dash_records (metric TEXT, value TEXT); CREATE TABLE analytics_dash_meta (key TEXT, value TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT);
CREATE TABLE analytics_action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, fired_at TEXT, metric_value REAL, action TEXT, queue_target TEXT, status TEXT, notes TEXT);
CREATE TABLE alerts (source TEXT, level TEXT, message TEXT, digested TEXT);
INSERT INTO analytics_metric_triggers VALUES (7, 'ask_error_rate_7d', 'Ask errors high', 'meta', 'gt', 0.1, '7', 'Pillar reach. Fix ask errors.', 'qnfo-ai-search', 'agent_issues', 24, 1);
INSERT INTO analytics_metric_triggers VALUES (8, 'digest_x', 'Digest only', 'meta', 'gt', 1, 'low', 'note', 'x', 'alerts', 24, 1);
INSERT INTO metric_registry VALUES ('ask_error_rate_7d', '0.2'), ('digest_x', '0');`);
const d1 = { prepare(sql0) { const order = []; const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(+n - 1); return "?"; }); let a = [];
  const st = { bind(...x) { a = order.length ? order.map((i) => x[i]) : x; return st; },
    async first() { return sq.prepare(sql).get(...a) ?? null; }, async all() { return { results: sq.prepare(sql).all(...a) }; }, async run() { sq.prepare(sql).run(...a); return {}; } }; return st; } };
const env = { AUDIT: d1 };
let fails = 0;
const check = (c, m, d) => { console.log((c ? "PASS " : "FAIL ") + m + (c || d === undefined ? "" : " :: " + JSON.stringify(d))); if (!c) fails++; };
const issues = () => sq.prepare("SELECT id, status FROM agent_issues WHERE title LIKE 'METRIC-TRIGGER-7-%'").all();
const log = (st) => sq.prepare("SELECT COUNT(*) n FROM analytics_action_log WHERE trigger_id=7 AND status=?").get(st).n;
const ageStreak = (min) => sq.prepare("UPDATE analytics_action_log SET fired_at = datetime('now', ?) WHERE trigger_id=7 AND status='recovering'").run("-" + min + " minutes");

check(triggerRecoveryDue("2026-10-02 08:00:00", Date.parse("2026-10-02T09:00:00Z"), 60) === true, "60 minutes after the streak opened, recovery is due");
check(triggerRecoveryDue("2026-10-02 08:30:00", Date.parse("2026-10-02T09:00:00Z"), 60) === false, "30 minutes is not enough");
check(triggerRecoveryDue(null, Date.now(), 60) === false && triggerRecoveryDue("garbage", Date.now(), 60) === false, "no streak or an unreadable time never closes");
check(TRIGGER_RECOVERY_MIN >= 60, "the recovery window is at least an hour");

await evaluateMetricTriggers(env);
check(issues().length === 1 && issues()[0].status === "open", "a breach files one open issue");
sq.prepare("UPDATE metric_registry SET last_value='0.05' WHERE metric='ask_error_rate_7d'").run();
await evaluateMetricTriggers(env);
check(issues()[0].status === "open" && log("recovering") === 1, "the first recovered tick opens a streak and closes nothing");
await evaluateMetricTriggers(env);
check(issues()[0].status === "open" && log("recovering") === 1, "a second tick inside the window keeps the issue open and does not open a second streak");
ageStreak(30); await evaluateMetricTriggers(env);
check(issues()[0].status === "open", "30 minutes into the streak the issue is still open");
// relapse: breach again inside the cooldown, then recover again
sq.prepare("UPDATE metric_registry SET last_value='0.3' WHERE metric='ask_error_rate_7d'").run();
await evaluateMetricTriggers(env);
check(log("relapsed") === 1 && issues().length === 1, "a breach during the streak writes 'relapsed' and files no duplicate (cooldown)");
sq.prepare("UPDATE metric_registry SET last_value='0.05' WHERE metric='ask_error_rate_7d'").run();
ageStreak(120); await evaluateMetricTriggers(env);
check(issues()[0].status === "open", "after a relapse the old streak no longer counts (would otherwise close at once)");
check(log("recovering") === 2, "recovery after a relapse opens a new streak");
sq.prepare("UPDATE analytics_action_log SET fired_at = datetime('now','-61 minutes') WHERE trigger_id=7 AND status='recovering' AND id = (SELECT MAX(id) FROM analytics_action_log WHERE trigger_id=7 AND status='recovering')").run();
const out = await evaluateMetricTriggers(env);
const tri = sq.prepare("SELECT * FROM issue_triage WHERE issue_id=?").get(issues()[0].id);
check(issues()[0].status === "closed", "61 minutes of recovery closes the issue", issues());
check(tri && tri.triage_state === "closed" && /TRIGGER-RECOVERY-1 .*ask_error_rate_7d=0.05 no longer gt 0.1/.test(tri.close_evidence), "it closes with close_evidence naming the value and threshold", tri);
check(log("recovered") === 1 && out.recovered && out.recovered[0].id === 7, "the close is logged and reported");
await evaluateMetricTriggers(env);
check(log("recovering") === 2 && log("recovered") === 1, "with no open issue, a recovered metric writes nothing more");
check(sq.prepare("SELECT COUNT(*) n FROM analytics_action_log WHERE trigger_id=8").get().n === 0, "a digest-only trigger never opens recovery streaks");

const pp = cut("async function publicationPreflight(env)", "__name(publicationPreflight");
check(/sok && open[\s\S]*INSERT INTO issue_triage[\s\S]*close_evidence[\s\S]*UPDATE agent_issues SET status='closed'/.test(pp), "the publication preflight closes its own issue with evidence on recovery");
check(/if \(cron === "30 3 \* \* 1"\) type = "stress"/.test(src) && /"30 3 \* \* 1"/.test(readFileSync(join(here, "wrangler.toml"), "utf8")), "the calibrator's stress key matches the declared Monday cron");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
