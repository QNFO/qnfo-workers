// ONE-WORKER-COUNT-1 (transformation lever T5.10, pillar core): one census for worker_count (the live scripts list budgetAudit
// already writes to fleet_budget.workers) and a guard, worker_count_disagreement, that names the workers present in only one of
// the live list and service_registry (state live). Run: node qnfo-fleet-control/one-worker-count.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- ONE-WORKER-COUNT-1:BEGIN"), src.indexOf("// ---- ONE-WORKER-COUNT-1:END"));
const sandbox = { VERSION: "0.4.138-test", __name: (f) => f };
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { workerCountDiff, oneWorkerCount };", sandbox);
const { workerCountDiff, oneWorkerCount } = sandbox.__export;
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); if (!c) fails++; };

// 1. the pure comparison
let d = workerCountDiff(["a", "b", "c"], [{ service: "a", kind: "worker", state: "live" }, { service: "b", kind: "worker", state: "live" }, { service: "c", kind: "worker", state: "live" }]);
check(d.live === 3 && d.registry === 3 && d.disagreement === 0 && d.only_live.length === 0 && d.only_registry.length === 0, "three live scripts and three live registry rows: no disagreement", d);
d = workerCountDiff(["a", "b", "ghost"], [{ service: "a", kind: "worker", state: "live" }, { service: "b", kind: "worker", state: "live" }, { service: "gone", kind: "worker", state: "live" }, { service: "old", kind: "worker", state: "retired" }, { service: "svc", kind: "service", state: "live" }, { service: "a" }]);
check(d.live === 3 && d.registry === 3 && d.disagreement === 2 && d.only_live.join() === "ghost" && d.only_registry.join() === "gone", "a script with no live row and a live row with no script each count once; retired rows and non-worker kinds are not compared; a duplicate name counts once", d);
check(workerCountDiff([], []).disagreement === 0 && workerCountDiff(null, null).live === 0 && workerCountDiff(["x", "", null], []).live === 1, "empty inputs are a measured zero; blank ids are ignored", workerCountDiff(["x", "", null], []));

// 2. the writer: worker_count and the guard from one census, the day's event upserted with the names
const writes = [];
let eventArgs = null, eventSql = null;
const db = {
  prepare(sql) {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async all() { return { results: [{ service: "a", kind: "worker", state: "live" }, { service: "zombie", kind: "worker", state: "live" }, { service: "old", kind: "worker", state: "deleted" }] }; },
      async run() { writes.push({ sql, args }); if (/cloud_ops_events/.test(sql)) { eventArgs = args; eventSql = sql; } return { meta: { changes: 1 } }; }
    };
    return s;
  }
};
const r = await oneWorkerCount({ AUDIT: db }, ["a", "b"], "2026-10-06T10:00:00Z");
check(r.live === 2 && r.registry === 2 && r.disagreement === 2 && r.only_live.join() === "b" && r.only_registry.join() === "zombie", "the writer returns the comparison", r);
const wc = writes.find((w) => /metric='worker_count'/.test(w.sql)), wd = writes.find((w) => /metric='worker_count_disagreement'/.test(w.sql));
check(wc && wc.args[0] === "2" && wc.args[1] === "2026-10-06T10:00:00Z" && /state='MEASURED'/.test(wc.sql), "worker_count is the live scripts count, stamped with the tick and MEASURED", wc);
check(wd && wd.args[0] === "2" && wd.args[1] === "2026-10-06T10:00:00Z", "worker_count_disagreement is the symmetric difference", wd);
check(eventArgs && eventArgs[0] === "worker-count-2026-10-06" && /only live b; only registry zombie/.test(eventArgs[2]) && eventArgs[4] === "disagree" && /ON CONFLICT\(id\) DO UPDATE/.test(eventSql), "the day's worker-count event names the odd ones out, status disagree, upserted by id", eventArgs);
const meta = JSON.parse(eventArgs[3]);
check(meta.live === 2 && meta.registry === 2 && meta.only_live.join() === "b" && meta.only_registry.join() === "zombie" && meta.v === "0.4.138-test", "the event meta carries both lists and the version", meta);
// 3. agreement: status ok and no names in the text
writes.length = 0;
const db2 = { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async all() { return { results: [{ service: "a", kind: "worker", state: "live" }] }; }, async run() { writes.push({ sql, args }); return { meta: { changes: 1 } }; } }; return s; } };
const r2 = await oneWorkerCount({ AUDIT: db2 }, ["a"], "2026-10-06T11:00:00Z");
const ev2 = writes.find((w) => /cloud_ops_events/.test(w.sql));
check(r2.disagreement === 0 && ev2 && ev2.args[4] === "ok" && !/only live/.test(ev2.args[2]) && writes.find((w) => /metric='worker_count_disagreement'/.test(w.sql)).args[0] === "0", "agreement writes 0 and an ok event", ev2 && ev2.args);

console.log(fails ? fails + " FAILED" : "one-worker-count: all assertions passed");
process.exit(fails ? 1 : 0);
