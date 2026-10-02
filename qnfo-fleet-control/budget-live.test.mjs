// BUDGET-LIVE-1: fleet_budget.current is counted from the account, and an unreadable list is never a zero.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- BUDGET-LIVE-1:BEGIN"), src.indexOf("// ---- BUDGET-LIVE-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { budgetLiveCount, BUDGET_LIVE_SOURCES };", sandbox);
const { budgetLiveCount, BUDGET_LIVE_SOURCES } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

check(budgetLiveCount({ success: true, result: [{}, {}, {}], result_info: { total_count: 11 } }) === 11, "total_count wins when it is at least the listed rows (a paged D1 list)");
check(budgetLiveCount({ success: true, result: [{}, {}] }) === 2, "listed rows are counted when there is no result_info");
check(budgetLiveCount({ success: true, result: [{}, {}, {}], result_info: { total_count: 0 } }) === 3, "a total_count below the listed rows is ignored");
check(budgetLiveCount({ success: true, result: { buckets: [{}, {}, {}, {}] } }) === 4, "the R2 shape (result.buckets) is counted");
check(budgetLiveCount({ success: true, result: [] }) === 0, "an empty list that succeeded is a real zero");
check(budgetLiveCount({ success: false, errors: [{ code: 10000 }], result: null }) === null, "a refused list is unreadable, not zero");
check(budgetLiveCount(null) === null && budgetLiveCount({ success: true, result: null }) === null, "a missing body or result is unreadable");
check(Object.keys(BUDGET_LIVE_SOURCES).every((k) => /^\/[a-z0-9/]+\?per_page=\d+$/.test(BUDGET_LIVE_SOURCES[k])), "every source is an account-relative list path");
check(!("workers" in BUDGET_LIVE_SOURCES) && !Object.keys(BUDGET_LIVE_SOURCES).some((k) => k.startsWith("ai_spend")), "workers and ai_spend keep their own refresh");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
