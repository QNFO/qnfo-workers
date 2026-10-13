// METRIC-REFRESHER-2 (qnfo-fleet-control 0.25.0) offline suite. No network, no D1: a scripted stub answers the step's statements.
// Proves: a metric the trigger path refreshed inside its window is only shadowed (no write); a stale or never-refreshed one is
// written with the step's own value; a run with no error writes an ok ledger row and moves the two spof_registry rows to
// spof_registry_resolved; a run with an error writes an error row and moves nothing; the step is wired into the 20-minute tick.
// Run: node --no-warnings qnfo-fleet-control/metric-refresher-2.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// BEGIN METRIC-REFRESHER-2"), b = src.indexOf("// END METRIC-REFRESHER-2");
ok(a > 0 && b > a, "the METRIC-REFRESHER-2 block is present");
const sb = { __name: (f) => f, console: { log() {}, error() {} }, Date, String, Number, isNaN, JSON };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n__x = { mr2Decide, metricRefresher2, MR2_METRICS, MR2_COMPONENTS };", sb);
const { mr2Decide, metricRefresher2, MR2_METRICS, MR2_COMPONENTS } = sb.__x;

const NOW = Date.parse("2026-10-13T07:00:00Z");
ok(mr2Decide("2026-10-13T06:50:00Z", 30, NOW) === "shadow", "refreshed 10 min ago, window 30: shadow");
ok(mr2Decide("2026-10-13T06:00:00Z", 30, NOW) === "takeover", "refreshed 60 min ago, window 30: takeover");
ok(mr2Decide("2026-10-13 06:10:00", 90, NOW) === "shadow", "a space-separated UTC timestamp parses");
ok(mr2Decide(null, 90, NOW) === "takeover" && mr2Decide("garbage", 90, NOW) === "takeover", "never refreshed or unparsable: takeover");
ok(MR2_METRICS.length === 4 && MR2_METRICS.every((m) => /^SELECT /.test(m.sql) && m.stale_min > 0), "four metrics, each a SELECT with a window");
ok(MR2_COMPONENTS.join("|") === "audits_stale refresher|publish freshness metrics", "the two spof_registry components");

function fakeDb(reg, opts) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const st = { sql, args: [] };
      st.bind = (...args) => { st.args = args; return st; };
      st.first = async () => {
        calls.push({ op: "first", sql, args: st.args });
        if (/FROM metric_registry WHERE metric = \?1/.test(sql)) return reg[st.args[0]] || null;
        if (opts && opts.failSql && sql.indexOf(opts.failSql) >= 0) throw new Error("no such table");
        return { v: "7" };
      };
      st.run = async () => { calls.push({ op: "run", sql, args: st.args }); return { meta: { changes: /^DELETE FROM spof_registry/.test(sql) ? 1 : 1 } }; };
      return st;
    },
  };
  return db;
}
const fresh = { last_value: "0", last_refreshed: "2026-10-13T06:55:00Z" };
const stale = { last_value: "1", last_refreshed: "2026-10-13T04:00:00Z" };

// 1. All fresh: no metric write, ok ledger, both rows moved.
let db = fakeDb({ audits_stale: fresh, papers_hours_since_last_publish: fresh, ideas_hours_since_last_proposal: fresh, social_hours_since_last_post: fresh });
let r = await metricRefresher2({ AUDIT_DB: db }, NOW);
ok(r.ok && r.takeover.length === 0 && r.shadow.length === 4, "fresh registry: four shadows, no takeover", r);
ok(!db.calls.some((c) => c.op === "run" && /^UPDATE metric_registry/.test(c.sql)), "fresh registry: no metric write");
const ledger = db.calls.find((c) => c.op === "run" && /INSERT INTO cloud_ops_events/.test(c.sql));
ok(ledger && ledger.args[3] === "ok" && /^metric-refresher-2-/.test(ledger.args[0]), "an ok ledger row", ledger && ledger.args);
ok(db.calls.filter((c) => c.op === "run" && /INSERT INTO spof_registry_resolved/.test(c.sql)).length === 2 && r.resolved === 2, "a clean run moves both spof_registry rows", r.resolved);

// 2. One stale metric: written with the step's value and timestamp.
db = fakeDb({ audits_stale: stale, papers_hours_since_last_publish: fresh, ideas_hours_since_last_proposal: fresh, social_hours_since_last_post: fresh });
r = await metricRefresher2({ AUDIT_DB: db }, NOW);
const w = db.calls.filter((c) => c.op === "run" && /^UPDATE metric_registry/.test(c.sql));
ok(w.length === 1 && w[0].args[0] === "7" && w[0].args[2] === "audits_stale" && w[0].args[1] === new Date(NOW).toISOString(), "a stale metric is written by the alternate", w.map((x) => x.args));
ok(r.takeover.length === 1 && r.shadow.length === 3, "one takeover, three shadows", r);

// 3. An error: error ledger row, nothing moved.
db = fakeDb({ audits_stale: fresh, papers_hours_since_last_publish: fresh, ideas_hours_since_last_proposal: fresh, social_hours_since_last_post: fresh }, { failSql: "social_media_posts" });
r = await metricRefresher2({ AUDIT_DB: db }, NOW);
const led2 = db.calls.find((c) => c.op === "run" && /INSERT INTO cloud_ops_events/.test(c.sql));
ok(!r.ok && r.errors.length === 1 && led2 && led2.args[3] === "error", "a failing query gives an error ledger row", r.errors);
ok(!db.calls.some((c) => /spof_registry/.test(c.sql)), "a run with an error moves no spof_registry row");

// 4. Not registered: an error, never an insert into metric_registry.
db = fakeDb({});
r = await metricRefresher2({ AUDIT_DB: db }, NOW);
ok(!r.ok && r.errors.length === 4 && !db.calls.some((c) => /INSERT INTO metric_registry|UPDATE metric_registry/.test(c.sql)), "unregistered metrics are reported, never created");

// 5. Wired into the 20-minute tick.
ok(/metricRefresher2\(env\)\.catch/.test(src.slice(src.indexOf('if (cron === "*/20 * * * *")'), src.indexOf('if (cron === "0 3 * * *")'))), "metricRefresher2 runs in the */20 block");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
