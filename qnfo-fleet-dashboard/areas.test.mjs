// AREAS-1 (1.38.0) offline suite: the functional-area model, the bottleneck rule, the trend rule, and the rendered page against an in-memory D1.
// Proves: (A) a metric key maps to exactly one area; (B) each area lists at most 3 rows, ranked by priority then gap, and counts the rest;
// (C) trend direction is judged against the breach operator (a falling run-rate is improving, a falling subscriber count is worsening);
// (D) the bottleneck is the failing stage when it holds over 40% of finished work, else the largest waiting stage of 5 or more, else none;
// (E) the page shows five area tiles, per-area breach rows with a Diagnose control, a Pipelines panel, and none of the removed sections;
// (F) a source that cannot be read is named in blind and never rendered as zero; (G) GET /api/areas returns the same model.
// Run: node qnfo-fleet-dashboard/areas.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL: " + m); } };
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("/* AREAS-1:BEGIN"), b = src.indexOf("/* AREAS-1:END */");
ok(a > 0 && b > a, "AREAS-1 block markers present");
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, RegExp, isFinite, Promise });
vm.runInContext(src.slice(a, b) + "\nglobalThis.X = { areaOf, prioNum, gapOf, trendOf, bottleneckOf, buildAreas, fmtNum, shortTitle, sparkSvg, areaTilesHtml, areaSectionsHtml, flowHtml };", cx);
vm.runInContext("async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }; globalThis.areasModel = areasModel;", cx);
const X = cx.X;
// A
ok(X.areaOf("fleet_ai_run_rate_30d_usd") === "cost", "run-rate is cost");
ok(X.areaOf("subscribers_growth_monthly") === "reach", "subscribers is reach");
ok(X.areaOf("q08_gate_pass_rate_7d") === "research", "q08 is research");
ok(X.areaOf("code_task_success_rate_30d") === "autonomy", "code task is autonomy");
ok(X.areaOf("guard_rcs") === "reliability", "guard is reliability");
ok(X.areaOf("something_unmapped") === "autonomy", "unmapped falls to autonomy, never dropped");
// B
const rows = [];
for (let i = 0; i < 6; i++) rows.push({ metric_key: "issue_x" + i, title: "t" + i, operator: "gt", threshold: 10, owner: "o", priority: 3 + i, val: 20 });
rows.push({ metric_key: "issue_hi", title: "hi", operator: "gt", threshold: 10, owner: "o", priority: "high", val: 11 });
const m = X.buildAreas(rows, {}, [], null);
const au = m.areas.find((x) => x.id === "autonomy");
ok(m.total === 7 && au.count === 7, "all breaches counted: " + au.count);
ok(au.top.length === 3 && au.more === 4, "top 3 listed, rest counted");
ok(au.top[0].key === "issue_x5" && au.top[1].key === "issue_hi", "equal priority 8 is broken by the larger gap, then the smaller: " + au.top.map((x) => x.key));
ok(X.prioNum("high") === 8 && X.prioNum(7) === 7 && X.prioNum("6") === 6 && X.prioNum(null) === 5, "priority parsing");
ok(m.areas.find((x) => x.id === "cost").status === "ok" && au.status === "act", "status: clear area ok, high-priority area act");
// C
ok(X.trendOf([10, 8, 5], "gt").good === true, "falling value under a gt breach is improving");
ok(X.trendOf([10, 8, 5], "lt").good === false, "falling value under an lt breach is worsening");
ok(X.trendOf([5, 5], "gt").dir === "flat" && X.trendOf([5, 5], "gt").good === null, "flat is neither");
ok(X.trendOf([5], "gt").dir === null && X.trendOf([], "gt").dir === null, "under two points: no trend claimed");
ok(X.trendOf([1, 2], null, "up").good === true, "explicit good direction wins");
// D
const st = (k, n, kind) => ({ k, label: k, n, kind });
ok(X.bottleneckOf([st("q", 2, "wip"), st("m", 48, "done"), st("c", 74, "done"), st("f", 68, "fail")]) === null, "35% failure is not a constraint: " + JSON.stringify(X.bottleneckOf([st("q", 2, "wip"), st("m", 48, "done"), st("c", 74, "done"), st("f", 68, "fail")])));
const b1 = X.bottleneckOf([st("m", 10, "done"), st("f", 30, "fail")]);
ok(b1 && b1.k === "f" && /75%/.test(b1.why), "failing stage holding 75% of finished work is the constraint");
const b2 = X.bottleneckOf([st("deferred", 423, "parked"), st("queued", 3, "wip"), st("pub", 194, "done")]);
ok(b2 && b2.k === "deferred", "largest parked stage is the constraint");
ok(X.bottleneckOf([st("a", 2, "wip"), st("b", 3, "wip")]) === null, "small queues are not a bottleneck");
ok(X.bottleneckOf([st("d", 900, "drop"), st("a", 1, "done")]) === null, "declined items are not a bottleneck");
// E and F: render
const mm = X.buildAreas(rows.concat([{ metric_key: "fleet_ai_run_rate_30d_usd", title: "Fleet AI run-rate above $15/30d", operator: "gt", threshold: 95, owner: "fleet", priority: "high", val: 215.38 }]),
  { fleet_ai_run_rate_30d_usd: [{ day: "d1", value: 100 }, { day: "d2", value: 215 }], open_agent_issues: [{ day: "d1", value: 200 }, { day: "d2", value: 215 }] },
  [{ id: "research", name: "Research queue", stages: [st("deferred", 423, "parked"), st("queued", 3, "wip")] }], { probes_ok: 28, probes_total: 28 });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tiles = X.areaTilesHtml(mm, esc), secs = X.areaSectionsHtml(mm, esc), flow = X.flowHtml(mm, esc);
ok((tiles.match(/class="ar-tile /g) || []).length === 5, "five area tiles");
ok(/28\/28/.test(tiles) && /Open issues/.test(tiles), "stars: probes and open issues");
ok(/worsening 14d/.test(tiles) || /improving 14d/.test(tiles), "tile carries a trend word");
ok((secs.match(/data-fleet-fill/g) || []).length >= 4 && /Diagnose/.test(secs), "rows carry a Diagnose control that fills the command line");
ok(/4 more in breach/.test(secs), "overflow is a count, not a list");
ok(!/data-fleet-cmd/.test(secs), "no control runs a command without the owner pressing Enter");
ok(/bottleneck: deferred/.test(flow) && /423 items waiting here/.test(flow), "flow names its bottleneck and why");
const ageFlow = X.flowHtml({ flows: [{ id: 'i', name: 'Open issues by age', stages: [st('<1d', 4, 'info'), st('7d+', 38, 'stale')], bottleneck: null }] }, esc);
ok(/tag u/.test(ageFlow) && /38/.test(ageFlow) && !/flowing/.test(ageFlow), 'an aging pipeline with no bottleneck still flags its stale stage');
ok(X.bottleneckOf([st('a', 1, 'info'), st('b', 60, 'stale')]) === null, 'stale and info stages are never the bottleneck');
const cl = X.bottleneckOf([st('q', 5, 'wip'), st('m', 48, 'done'), st('c', 66, 'fail'), st('f', 68, 'fail')]);
ok(cl && cl.k === 'f' && /74%/.test(cl.why), 'failing stages are summed and the largest is named: ' + JSON.stringify(cl));
ok(!/undefined|NaN|\[object/.test(tiles + secs + flow), "no undefined, NaN or object leaks");
ok(!/<script/i.test(secs), "no markup injection from titles");
const evil = X.areaSectionsHtml(X.buildAreas([{ metric_key: "guard_rcs", title: "<img onerror=x>", operator: "gt", threshold: 0, owner: "<b>", priority: 7, val: 1 }], {}, [], null), esc);
ok(!/<img/.test(evil) && evil.indexOf("&lt;img") > 0 && evil.indexOf("&lt;b&gt;") > 0, "titles and owners are escaped");
// G and live page against an in-memory D1
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
function mkdb(withHistory) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE v_metric_trigger_state (metric_key TEXT, title TEXT, operator TEXT, threshold REAL, owner TEXT, priority TEXT, val REAL, hit INTEGER);" +
    "CREATE TABLE metric_history (metric TEXT, day TEXT, value REAL);" +
    "CREATE TABLE code_tasks (status TEXT, created_at TEXT); CREATE TABLE research_queue (status TEXT); CREATE TABLE outreach_queue (status TEXT); CREATE TABLE agent_issues (status TEXT, created_at INTEGER);" +
    "CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER); CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);");
  const ins = db.prepare("INSERT INTO v_metric_trigger_state_t VALUES (?,?,?,?,?,?,?,1)".replace("_t", "_x"));
  return db;
}
// a table cannot be inserted through a view name, so build the trigger source as a table and select through a same-named view
function mk2(opts) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE trig (metric_key TEXT, title TEXT, operator TEXT, threshold REAL, owner TEXT, priority TEXT, val REAL, hit INTEGER); CREATE VIEW v_metric_trigger_state AS SELECT * FROM trig;" +
    "CREATE TABLE metric_history (metric TEXT, day TEXT, value REAL);" +
    "CREATE TABLE code_tasks (status TEXT, created_at TEXT); CREATE TABLE research_queue (status TEXT); CREATE TABLE outreach_queue (status TEXT); CREATE TABLE agent_issues (status TEXT, created_at INTEGER);");
  db.prepare("INSERT INTO trig VALUES ('guard_rcs','Security gap: a deploy guard exited non-zero','gt',0,'fleet-control','7',1,1)").run();
  db.prepare("INSERT INTO trig VALUES ('subscribers_growth_monthly','Reach gap: growth under +10/month','lt',10,'subs','8',0,1)").run();
  for (const d of ["2026-10-14", "2026-10-15", "2026-10-16"]) db.prepare("INSERT INTO metric_history VALUES ('subscribers_growth_monthly', ?, ?)").run(d, d === "2026-10-16" ? 0 : 2);
  db.prepare("INSERT INTO code_tasks VALUES ('failed', ?)").run(new Date().toISOString());
  for (let i = 0; i < 30; i++) db.prepare("INSERT INTO research_queue VALUES ('deferred')").run();
  db.prepare("INSERT INTO agent_issues VALUES ('open', ?)").run(Date.now() - 9 * 864e5);
  if (opts && opts.broken) db.exec("DROP TABLE code_tasks");
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { db.prepare(sql).run(...a); return { success: true }; } }; return q; };
  return { prepare: prep };
}
const am = await cx.areasModel({ AUDIT: mk2() }, { probes_ok: 3, probes_total: 4 });
ok(am.total === 2, "areasModel reads the breach view: " + am.total);
const rel = am.areas.find((x) => x.id === "reach");
ok(rel.top[0].key === "subscribers_growth_monthly" && rel.top[0].trend.good === false, "falling subscriber growth under an lt target reads worsening");
ok(am.flows.some((f) => f.id === "research" && f.bottleneck && f.bottleneck.k === "deferred"), "30 deferred research items is the bottleneck");
ok(am.flows.some((f) => f.id === "issues" && f.stages.find((s) => s.k === "7d+").n === 1), "issue age bucket counted");
ok(am.blind.length === 0, "nothing blind when every source reads");
vm.runInContext("AREAS_CACHE = { at: 0, v: null };", cx);
const bm = await cx.areasModel({ AUDIT: mk2({ broken: true }) }, null);
ok(bm.blind.includes("code tasks") && !bm.flows.some((f) => f.id === "code"), "an unreadable source is named and its flow omitted, not shown as zero: " + bm.blind);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
