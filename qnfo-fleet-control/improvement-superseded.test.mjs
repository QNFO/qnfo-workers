/**
 * improvement-superseded.test.mjs -- offline regression lock for IL-SUPERSEDED-1 (agent_issues 2617, 2618).
 * IMPROVEMENT-LOOP-1 judged relapse of closed METRIC-TRIGGER issues against metric_history and filed
 * METRIC-FIX-RELAPSED-1 for issues_open_over_24h and open_issues_without_doer_24h, whose triggers SLA-120M-2 / -6 had
 * deliberately superseded by the 120-minute metrics (registry target "... [superseded by <metric>, ...]"). The old window
 * stays measured and off target, so nothing covered it and the loop filed (and would refile) the finding for good.
 * Proves, with the explicit marker as the ONLY discriminator (16 other registry metrics have all triggers disabled for other
 * reasons and must keep their regression and relapse checks):
 *   - a marked metric yields no regression and no relapse finding, no judged fix, and a "superseded" trend naming the successor;
 *   - the same history without the marker, or with a marker whose successor is not in the registry, still files;
 *   - the hourly tick closes the open relapse and regression issues of a superseded metric with "superseded by <successor>"
 *     evidence (naming the successor's open trigger issue) through the existing close path, past the close-evidence trigger;
 *   - a metric with disabled triggers and no marker keeps its open relapse issue open.
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/improvement-superseded.test.mjs
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
const sandbox = { fetch: async () => { throw new Error("offline"); }, AbortSignal, VERSION: "test", timedFetch: null, b64encode: null, sha256: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, isFinite, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(ca, cb + "// ---- CHARTER-LOOP-1:END ----".length) + "\n" + src.slice(a, b + END.length) + "\n__export = { improvementEvaluate, improvementLoopTick };", sandbox, { filename: "improvement-block.js" });
const I = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
const NOW = Date.parse("2026-10-20T12:00:00Z");
const day = (n) => new Date(NOW - n * 864e5).toISOString().slice(0, 10);
const hist = (metric, values, meets) => values.map((v, k) => ({ metric, day: day(k), value: v, meets: meets ? meets[k] : null }));
const flat14 = (v) => Array.from({ length: 14 }, () => v);
const reg = (metric, target) => ({ metric, target, state: "MEASURED" });

const OLD = "issues_open_over_24h", NEW = "issues_open_over_120m";
const OLD_TARGET = "0 (owner directive 2026-10-13: every open issue resolved, deployed and closed within 24 hours) [superseded by issues_open_over_120m, SLA-120M-2]";
const offTarget = (n) => Array.from({ length: n }, () => 0);
const closedTrigger = [{ id: 2196, title: "METRIC-TRIGGER-3062-ISSUES-OPEN-OVER-24H: backlog older than 24 h", closed_at: day(10) + " 06:00:00" }];
const facts = (oldTarget, withSuccessor) => ({
  registry: [reg(OLD, oldTarget)].concat(withSuccessor === false ? [] : [reg(NEW, "0")]),
  history: hist(OLD, flat14(93), offTarget(14)),
  closed_issues: closedTrigger, trigger_metric: { "3062": OLD }
});

// --- pure: the marker removes the metric from regression and relapse judgement
let x = I.improvementEvaluate(facts(OLD_TARGET), NOW);
eq(x.findings.length, 0, "a superseded metric files no relapse and no regression");
eq(x.relapses.length, 0, "and records no relapse");
eq(x.fixes_judged, 0, "and its closed fix is not judged");
eq((x.superseded || {})[OLD], NEW, "the successor is named");
eq((x.trends.find((t) => t.metric === OLD) || {}).verdict, "superseded", "its trend says superseded");
eq(x.evaluable, 0, "a superseded metric is not counted as evaluable");

// a falling off-target series with the marker is no regression either
const falling = hist(OLD, Array.from({ length: 14 }, (_, k) => (k < 7 ? 40 : 90)), offTarget(14));
x = I.improvementEvaluate({ registry: [reg(OLD, "<= 5 [superseded by " + NEW + "]"), reg(NEW, "0")], history: falling }, NOW);
eq(x.findings.length, 0, "no regression finding for a superseded metric");

// --- negative controls: without the marker (or without a registered successor) the finding is filed as before
x = I.improvementEvaluate(facts("0 (owner directive 2026-10-13: every open issue resolved, deployed and closed within 24 hours)"), NOW);
const rel = x.findings.find((fd) => fd.key === "METRIC-FIX-RELAPSED-1: " + OLD);
eq(!!rel && rel.file === true, true, "no marker: the relapse is filed (a disabled trigger alone never silences a metric)");
eq(x.fixes_judged, 1, "no marker: the closed fix is judged");
eq(Object.keys(x.superseded || {}).length, 0, "no marker: nothing superseded");
x = I.improvementEvaluate(facts(OLD_TARGET, false), NOW);
eq(x.findings.some((fd) => fd.key === "METRIC-FIX-RELAPSED-1: " + OLD), true, "a marker whose successor is not in the registry does not silence it");

// --- the hourly tick closes the open findings of a superseded metric
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (!sqlite) {
  console.log("improvement-superseded.test: node:sqlite unavailable (Node < 22); D1 replay skipped");
} else {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), close_evidence TEXT);
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
  db.exec("CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))");
  const insHist = db.prepare("INSERT OR REPLACE INTO metric_history (metric, day, value, meets, target, ts) VALUES (?, ?, ?, ?, '', '')");
  insReg.run(OLD, OLD_TARGET, "93");
  insReg.run(NEW, "0", "4");
  insReg.run("pageviews_30d", ">= 5000 (test target)", "100");
  // the old metric's triggers are disabled and so are pageviews' (the control): only the marker may tell them apart
  db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, enabled) VALUES (3062, ?, 'Backlog 24h', 0)").run(OLD);
  db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, enabled) VALUES (5937, ?, 'Backlog 120m', 1)").run(NEW);
  db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, enabled) VALUES (341, 'pageviews_30d', 'Pageviews', 0)").run();
  for (let k = 0; k <= 13; k++) { insHist.run(OLD, dd(k), 93, 0); insHist.run("pageviews_30d", dd(k), 100, 0); }
  const closeAt = realNow - 10 * 864e5;
  const mkClosed = (title) => { const r = db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, 'closed', 0, ?)").run(title, closeAt); db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'x', 'o', 'now', 'recovered')").run(Number(r.lastInsertRowid)); };
  mkClosed("METRIC-TRIGGER-3062-ISSUES-OPEN-OVER-24H: backlog older than 24 h");
  mkClosed("METRIC-TRIGGER-341-PAGEVIEWS-30D: pageviews gap");
  // the successor's open trigger issue and the open findings the loop filed on 2026-10-15
  const succ = db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES ('METRIC-TRIGGER-5937-ISSUES-OPEN-OVER-120M: backlog older than 120 min', 'open', 0, 0)").run();
  const succId = Number(succ.lastInsertRowid);
  db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, 'open', 0, 0)").run("METRIC-FIX-RELAPSED-1: " + OLD);
  db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, 'open', 0, 0)").run("METRIC-REGRESSION-1: " + OLD);
  db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES ('METRIC-FIX-RELAPSED-1: pageviews_30d', 'open', 0, 0)").run();

  const t = await I.improvementLoopTick(env);
  eq(t.ok, true, "the tick runs");
  const st = (title) => one("SELECT status FROM agent_issues WHERE title = ?", title).status;
  const ev = (title) => (one("SELECT close_evidence e FROM issue_triage WHERE issue_id = (SELECT id FROM agent_issues WHERE title = ?)", title) || {}).e || "";
  eq(st("METRIC-FIX-RELAPSED-1: " + OLD), "closed", "the superseded metric's open relapse issue is closed");
  eq(st("METRIC-REGRESSION-1: " + OLD), "closed", "and its open regression issue");
  eq(ev("METRIC-FIX-RELAPSED-1: " + OLD).indexOf("superseded by " + NEW + " (open trigger issue " + succId + ",") === 0, true, "evidence names the successor metric and its open trigger issue", ev("METRIC-FIX-RELAPSED-1: " + OLD));
  eq(st("METRIC-FIX-RELAPSED-1: pageviews_30d"), "open", "control: a metric with disabled triggers and no marker keeps its open relapse issue");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title = 'METRIC-FIX-RELAPSED-1: " + OLD + "' AND status = 'open'").n, 0, "the superseded relapse is not refiled");
  const t2 = await I.improvementLoopTick(env);
  eq(t2.filed, 0, "a second tick files nothing for the superseded metric");
  eq(one("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE '%" + OLD + "'").n, 2, "still exactly the two original rows");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
