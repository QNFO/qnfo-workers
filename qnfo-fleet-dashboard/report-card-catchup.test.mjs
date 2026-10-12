// REPORT-CARD-CATCHUP-1 offline suite (qnfo-fleet-dashboard 1.29.4, agent_issues 2054). Proves: the weekly report card is
// due from the latest Monday 06:00 UTC, any later tick catches a missed hour up, an unmeasured row (sai null) written by
// another writer never counts as the card, and a measured row stops a second write. Also WATCHMAKER-TICK-LEDGER-1 (2363):
// the tick ledger is a listed operation and no WATCHMAKER_OPS key occurs twice.
// Run: node qnfo-fleet-dashboard/report-card-catchup.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const code = cut("function reportCardDue(now) {", "__name(persistWeeklyReportCard");

const d1 = (db) => ({ prepare: (sql) => { const q = sql.replace(/\?\d+/g, "?"); const mk = (args) => ({ bind: (...a) => mk(a), first: async () => db.prepare(q).get(...args) || null, run: async () => db.prepare(q).run(...args) }); return mk([]); } });
const run = async (nowIso, rows, saiValue) => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE report_card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, sai REAL, grade TEXT, scores_json TEXT, signals_json TEXT); CREATE TABLE report_card_inputs (key TEXT, value TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  for (const r of rows) db.prepare("INSERT INTO report_card_history (ts, sai) VALUES (?, ?)").run(r[0], r[1]);
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(nowIso); } }
  const sb = { Date: FakeDate, JSON, Math, String, Number, isNaN,
    ensureReportCardTable: async () => {}, loadSaiConfig: async () => ({}), liveSaiInputs: async () => ({}),
    computeSai: () => ({ sai: saiValue, scores: { self_improv: 0.4 }, signals: {}, config_missing: saiValue == null ? ["w_x"] : [], decision_source: "t" }) };
  vm.createContext(sb);
  vm.runInContext(code + "\n__f = { reportCardDue, persistWeeklyReportCard };", sb);
  const out = await sb.__f.persistWeeklyReportCard({ AUDIT: d1(db) }, {});
  return { out, measured: db.prepare("SELECT COUNT(*) AS n FROM report_card_history WHERE sai IS NOT NULL").get().n, events: db.prepare("SELECT id, status FROM cloud_ops_events").all(), due: sb.__f.reportCardDue(new RealDate(nowIso)) };
};

{ const r = await run("2026-10-05T06:01:00.000Z", [["2026-09-28T06:00:54.493Z", 72.3]], 74);
  ok(r.due === "2026-10-05T06:00:00.000Z" && r.out.weekly === true && r.measured === 2, "Monday 06:01 writes the week's card", r); }
{ const r = await run("2026-10-05T05:59:00.000Z", [["2026-09-28T06:00:54.493Z", 72.3]], 74);
  ok(r.due === "2026-09-28T06:00:00.000Z" && r.out.dup === true && r.measured === 1, "before Monday 06:00 the previous week's card still stands", r); }
{ // the 2026-10-05 miss: the 06:00 and 06:15 ticks wrote nothing and an unmeasured row landed at 06:30
  const r = await run("2026-10-05T06:45:00.000Z", [["2026-09-28T06:00:54.493Z", 72.3], ["2026-10-05T06:30:31Z", null]], 74);
  ok(r.out.weekly === true && r.measured === 2, "an unmeasured row of the same day does not count as the card", r); }
{ const r = await run("2026-10-08T13:15:00.000Z", [["2026-09-28T06:00:54.493Z", 72.3], ["2026-10-05T07:00:32Z", null]], 74);
  ok(r.due === "2026-10-05T06:00:00.000Z" && r.out.weekly === true && r.measured === 2 && r.events.some((e) => e.id === "rc-weekly-2026-10-05" && e.status === "ok"), "a tick three days later catches the missed week up", r); }
{ const r = await run("2026-10-08T13:30:00.000Z", [["2026-10-08T13:15:00.000Z", 74]], 74);
  ok(r.out.dup === true && r.measured === 1, "a measured row since the due time stops a second write", r); }
{ const r = await run("2026-10-11T23:59:00.000Z", [], 74);
  ok(r.due === "2026-10-05T06:00:00.000Z", "Sunday belongs to the week that began the Monday before", r.due); }
{ const r = await run("2026-10-06T09:00:00.000Z", [], null);
  ok(r.out.sai_null === true && r.measured === 0 && r.events.some((e) => e.status === "warn"), "a null SAI still fails closed: no row, a warn event (REPORT-CARD-FAIL-CLOSED-1)", r); }

const ops = /var WATCHMAKER_OPS = \[([\s\S]*?)\n\];/.exec(src);
const keys = (ops ? ops[1].match(/\{ key: "[^"]+"/g) || [] : []).map((x) => x.slice(8, -1));
ok(keys.includes("tick-sequence-ledger") && /key: "tick-sequence-ledger"[^\n]*sql: "SELECT MAX\(ts\) AS last FROM tick_runs"/.test(src), "the hourly tick ledger is a listed operation proved by tick_runs");
ok(keys.length > 40 && new Set(keys).size === keys.length, "no WATCHMAKER_OPS key occurs twice", keys.filter((k, i) => keys.indexOf(k) !== i));
console.log(fail ? fail + " failed" : pass + " passed");
if (fail) process.exit(1);
