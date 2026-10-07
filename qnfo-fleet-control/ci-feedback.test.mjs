// CI-FEEDBACK-1 (qnfo-fleet-control 0.8.0): a refused code-loop pull request carries the failing suites and assertion lines of its
// failed required check, read from the job log, instead of "gate=failure" alone. The fixtures are verbatim excerpts of the two
// deploy-gate logs that refused PR 750 (qnfo-ipatent) and PR 752 (q08-signal-engine) on 2026-10-07.
// Run: node qnfo-fleet-control/ci-feedback.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- CI-FEEDBACK-1:BEGIN"), b = src.indexOf("// ---- CI-FEEDBACK-1:END");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); if (!c) fails++; };
check(a > 0 && b > a, "the pure block is marked");
const box = { String, Object, Math };
vm.createContext(box);
vm.runInContext(src.slice(a, b) + "\n__export = { cmFailureLines, cmFailureText, CI_FEEDBACK_LINES, CI_FEEDBACK_CHARS };", box);
const { cmFailureLines, cmFailureText, CI_FEEDBACK_LINES, CI_FEEDBACK_CHARS } = box.__export;

const LOG_752 = "2026-10-07T00:21:25.5463924Z shell: /usr/bin/bash -e {0}\n2026-10-07T00:21:25.5464217Z ##[endgroup]\n2026-10-07T00:21:25.5903977Z SUITE-RUNNER-1: 6 of 217 suites (suites of q08-signal-engine)\n2026-10-07T00:21:26.1920644Z ok      325 ms  q08-signal-engine/metrics.test.mjs\n2026-10-07T00:21:26.1922065Z ok      337 ms  q08-signal-engine/note.test.mjs\n2026-10-07T00:21:26.1923176Z ok       54 ms  q08-signal-engine/phrase-revise.test.mjs\n2026-10-07T00:21:26.1924278Z FAIL    313 ms  q08-signal-engine/quality.test.mjs\n2026-10-07T00:21:26.1925438Z ok      258 ms  q08-signal-engine/sitemap.test.mjs\n2026-10-07T00:21:26.1926568Z ok       76 ms  q08-signal-engine/write-routes.test.mjs\n2026-10-07T00:21:26.1927092Z \n2026-10-07T00:21:26.1927866Z ##[group]FAIL q08-signal-engine/quality.test.mjs (exit 1)\n2026-10-07T00:21:26.1928753Z quality.test.mjs ok\n2026-10-07T00:21:26.1929368Z quality.test.mjs section 12 ok\n2026-10-07T00:21:26.1930245Z node:internal/modules/run_main:123\n2026-10-07T00:21:26.1931126Z     triggerUncaughtException(\n2026-10-07T00:21:26.1931543Z     ^\n2026-10-07T00:21:26.1931700Z \n2026-10-07T00:21:26.1932116Z AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n2026-10-07T00:21:26.1932557Z \n2026-10-07T00:21:26.1932678Z 4000 !== 2000\n2026-10-07T00:21:26.1932848Z \n2026-10-07T00:21:26.1933369Z     at file:///home/runner/work/qnfo-workers/qnfo-workers/q08-signal-engine/quality.test.mjs:190:37 {\n2026-10-07T00:21:26.1934105Z   generatedMessage: true,\n2026-10-07T00:21:26.1934461Z   code: 'ERR_ASSERTION',\n2026-10-07T00:21:26.1934804Z   actual: 4000,\n2026-10-07T00:21:26.1935167Z   expected: 2000,\n2026-10-07T00:21:26.1935490Z   operator: 'strictEqual',\n2026-10-07T00:21:26.1935838Z   diff: 'simple'\n2026-10-07T00:21:26.1936121Z }\n2026-10-07T00:21:26.1936282Z \n2026-10-07T00:21:26.1936412Z Node.js v22.23.3\n2026-10-07T00:21:26.1936580Z \n2026-10-07T00:21:26.1936914Z ##[endgroup]\n2026-10-07T00:21:26.1937037Z \n2026-10-07T00:21:26.1937196Z SUITE-RUNNER-1: 5 passed, 1 failed\n2026-10-07T00:21:26.1986047Z ##[error]Process completed with exit code 1.\n2026-10-07T00:21:26.2040126Z ##[group]Run node qnfo-fleet-dashboard/owner-edit.test.mjs\n";
const LOG_750 = "2026-10-06T23:00:42.3868168Z ok      113 ms  qnfo-ipatent/bench-dataset.test.mjs\n2026-10-06T23:00:42.3868829Z ok       97 ms  qnfo-ipatent/error-json.test.mjs\n2026-10-06T23:00:42.3877458Z ok       89 ms  qnfo-ipatent/fleet-link.test.mjs\n2026-10-06T23:00:42.3885879Z FAIL     96 ms  qnfo-ipatent/mechanism.test.mjs\n2026-10-06T23:00:42.3895852Z ok       91 ms  qnfo-ipatent/routes.test.mjs\n2026-10-06T23:00:42.3896721Z ok       70 ms  qnfo-ipatent/usage.test.mjs\n2026-10-06T23:00:42.3897053Z \n2026-10-06T23:00:42.3897561Z ##[group]FAIL qnfo-ipatent/mechanism.test.mjs (exit 1)\n2026-10-06T23:00:42.3898302Z Vectorize search failed: Cannot read properties of undefined (reading 'query')\n2026-10-06T23:00:42.3899144Z FAIL a supplied card and the derivation rules reach the drafting prompt :: 503\n2026-10-06T23:00:42.3899995Z FAIL the draft response carries the card and its holes\n2026-10-06T23:00:42.3900701Z Vectorize search failed: Cannot read properties of undefined (reading 'query')\n2026-10-06T23:00:42.3901413Z FAIL without a card the prompt has no card section :: 503\n2026-10-06T23:00:42.3902065Z FAIL every draft prompt carries the rule: means, not law or result\n2026-10-06T23:00:42.3902769Z FAIL every draft prompt carries the rule: structure for every function\n2026-10-06T23:00:42.3903427Z FAIL every draft prompt carries the rule: enabled range\n2026-10-06T23:00:42.3904145Z Vectorize search failed: Cannot read properties of undefined (reading 'query')\n2026-10-06T23:00:42.3904858Z FAIL a malformed card is ignored, the draft still runs\n2026-10-06T23:00:42.3905366Z 17 passed, 7 failed\n2026-10-06T23:00:42.3906036Z \n2026-10-06T23:00:42.3906396Z ##[endgroup]\n2026-10-06T23:00:42.3906559Z \n2026-10-06T23:00:42.3906772Z SUITE-RUNNER-1: 5 passed, 1 failed\n2026-10-06T23:00:42.3932843Z ##[error]Process completed with exit code 1.\n2026-10-06T23:00:42.3980439Z ##[group]Run node qnfo-fleet-dashboard/owner-edit.test.mjs\n2026-10-06T23:00:42.3980789Z \u001b[36;1mnode qnfo-fleet-dashboard/owner-edit.test.mjs\u001b[0m\n2026-10-06T23:00:42.4034944Z shell: /usr/bin/bash -e {0}\n2026-10-06T23:00:42.4035162Z ##[endgroup]\n2026-10-06T23:00:42.4675834Z (node:2324) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n2026-10-06T23:00:42.4676470Z (Use `node --trace-warnings ...` to show where the warning was created)\n2026-10-06T23:00:42.4882701Z 43 passed, 0 failed\n2026-10-06T23:00:42.4971893Z ##[group]Run node qnfo-fleet-dashboard/objective-apply.test.mjs\n2026-10-06T23:00:42.4972964Z \u001b[36;1mnode qnfo-fleet-dashboard/objective-apply.test.mjs\u001b[0m\n2026-10-06T23:00:42.5043178Z shell: /usr/bin/bash -e {0}\n";

const l752 = cmFailureLines(LOG_752);
check(l752.includes("FAIL q08-signal-engine/quality.test.mjs"), "PR 752: the failing suite is named, without its timing column", l752);
check(l752.some((l) => /^AssertionError \[ERR_ASSERTION\]: Expected values to be strictly equal/.test(l)), "PR 752: the assertion error is kept", l752);
check(l752.includes("4000 !== 2000"), "PR 752: the values that differ are kept (the patch doubled a constant the suite pins)", l752);
check(l752.some((l) => /^at q08-signal-engine\/quality\.test\.mjs:190:37/.test(l)), "PR 752: the failing line is kept, with the runner's checkout path stripped", l752);
const l750 = cmFailureLines(LOG_750);
check(l750.includes("FAIL qnfo-ipatent/mechanism.test.mjs"), "PR 750: the failing suite is named", l750);
check(l750.includes("FAIL a supplied card and the derivation rules reach the drafting prompt :: 503"), "PR 750: the failing assertion and its detail are kept", l750);
check(l750.some((l) => /Cannot read properties of undefined \(reading 'query'\)/.test(l)), "PR 750: the runtime error that names the cause is kept", l750);
check(l750.filter((l) => /Vectorize search failed/.test(l)).length === 1, "a repeated line is kept once", l750);
for (const [n, ls] of [["752", l752], ["750", l750]]) {
  check(ls.length <= CI_FEEDBACK_LINES && ls.every((l) => l.length <= 200), "PR " + n + ": at most " + CI_FEEDBACK_LINES + " lines of 200 chars", ls);
  check(ls.every((l) => !/^##\[|^\d{4}-\d\d-\d\dT|\u001b|^ok\b|generatedMessage|node:internal|passed, /.test(l)), "PR " + n + ": no runner markers, timestamps, passing suites or node internals", ls);
}
check(cmFailureLines("") .length === 0 && cmFailureLines(null).length === 0, "an empty log gives nothing");
const txt = cmFailureText({ gate: l752, other: [] });
check(/^gate: FAIL q08-signal-engine\/quality\.test\.mjs \| /.test(txt) && txt.indexOf("other:") < 0 && txt.length <= CI_FEEDBACK_CHARS, "cmFailureText names the check, joins its lines and skips an empty one", txt);
check(cmFailureText({ gate: Array(40).fill("FAIL " + "x".repeat(190)) }).length === CI_FEEDBACK_CHARS, "cmFailureText is capped at " + CI_FEEDBACK_CHARS + " chars");

// Wiring: the merge runner reads the log only for a failed-check refusal, and keeps the longer note.
const h = src.slice(src.indexOf("async function cmHandle"), src.indexOf("async function cmHandle") + 6000);
check(/d\.action === "refuse" && d\.stale_check && g\.checks && g\.checks\.length\)[\s\S]{0,400}cmFailureExcerpt\(env, g\.checks/.test(h) && /d\.why = d\.why \+ "; failing: " \+ fx/.test(h), "cmHandle appends the excerpt to a failed-check refusal");
check(/actions\/jobs\/" \+ c\.id \+ "\/logs"/.test(src), "the excerpt reads the failed check run's job log");
check(/last_error: \("merge-runner: " \+ why\)\.slice\(0, 1200\), merge_note: String\(why\)\.slice\(0, 1200\)/.test(src), "merge_note and last_error keep 1200 chars");

console.log(fails ? fails + " FAILED" : "ci-feedback: all assertions passed");
process.exit(fails ? 1 : 0);
