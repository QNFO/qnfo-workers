// ATTRIBUTION-COVERAGE-DTD-1 (#1997): workers_ai_attribution_coverage_pct is a day-to-date ratio, not one hourly delta,
// and a day whose GraphQL total is still tiny does not write a value. Run: node --no-warnings qnfo-fleet-control/attribution-coverage.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- ATTRIBUTION-COVERAGE-DTD-1:BEGIN"), src.indexOf("// ---- ATTRIBUTION-COVERAGE-DTD-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { attributionCoveragePct, ATTR_COVERAGE_MIN_NEURONS, ATTR_COVERAGE_FORMULA };", sandbox);
const { attributionCoveragePct, ATTR_COVERAGE_MIN_NEURONS, ATTR_COVERAGE_FORMULA } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// the 2026-10-05 19:00Z case: one hour read 73.2, day-to-date 132.8k attributed vs 128.1k billed
let r = attributionCoveragePct(132800, 128100, ATTR_COVERAGE_MIN_NEURONS);
check(r.pct === 100 && !r.idle, "day-to-date 132.8k/128.1k reads 100 (capped), not the hourly 73.2");
r = attributionCoveragePct(96075, 128100, ATTR_COVERAGE_MIN_NEURONS);
check(r.pct === 75 && !r.idle, "75% attributed reads 75.0");
r = attributionCoveragePct(1, 3, ATTR_COVERAGE_MIN_NEURONS);
check(r.pct === null && r.idle && /floor/.test(r.why), "a few neurons just after midnight write nothing: " + r.why);
r = attributionCoveragePct(4999, 4999, ATTR_COVERAGE_MIN_NEURONS);
check(r.idle, "just under the floor is still idle");
r = attributionCoveragePct(5000, 5000, ATTR_COVERAGE_MIN_NEURONS);
check(!r.idle && r.pct === 100, "at the floor the ratio is written");
r = attributionCoveragePct(0, 0, ATTR_COVERAGE_MIN_NEURONS);
check(r.idle && /no Workers AI/.test(r.why), "no billed neurons is idle, never a 0% coverage");
r = attributionCoveragePct(0, 20000, ATTR_COVERAGE_MIN_NEURONS);
check(r.pct === 0 && !r.idle, "nothing attributed against a real total reads 0");
r = attributionCoveragePct(-5, 20000, ATTR_COVERAGE_MIN_NEURONS);
check(r.pct === 0, "a negative attributed value is clamped to 0");
r = attributionCoveragePct("12345.6", "20000", 0);
check(r.pct === 61.7, "string inputs are read as numbers and rounded to 0.1");
check(ATTR_COVERAGE_MIN_NEURONS >= 1000 && ATTR_COVERAGE_MIN_NEURONS <= 20000, "the floor is between 1k and 20k neurons");
check(/day-to-date/.test(ATTR_COVERAGE_FORMULA) && /00:00Z/.test(ATTR_COVERAGE_FORMULA) && /5000/.test(ATTR_COVERAGE_FORMULA), "the registry formula states the window and the floor");
// the writer: GraphQL window starts at 00:00Z today, the metric is written from attributionCoveragePct, idle writes nothing
check(/datetime_geq: "' \+ day \+ 'T00:00:00Z"/.test(src), "GraphQL window starts at 00:00Z today");
check(!/datetime_geq: "' \+ pv\.ts/.test(src), "the interval-since-last-run window is gone");
check(/var cov = attributionCoveragePct\(cum, total, ATTR_COVERAGE_MIN_NEURONS\);\s*if \(cov\.idle\) return \{ ok: true, idle: true/.test(src), "an idle day writes nothing");
check(/bind\(String\(cov\.pct\), nowIso, ATTR_COVERAGE_FORMULA\)\.run\(\);/.test(src), "the written value is the day-to-date pct and the formula is updated");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
