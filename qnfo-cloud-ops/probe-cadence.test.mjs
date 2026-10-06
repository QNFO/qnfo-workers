// PROBE-CADENCE-1 (qnfo-cloud-ops 1.22.0): the tick dispatches the runtime-probe runner (remediation-consumer.yml) only when
// its last run is older than the window and no dispatch was sent inside that window, and the workflow listens for the event.
// Run: node qnfo-cloud-ops/probe-cadence.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- PROBE-CADENCE-1:BEGIN"), b = src.indexOf("// ---- PROBE-CADENCE-1:END");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
check(a > 0 && b > a, "the pure block is marked");
const sandbox = { Date, Math, Number, isNaN };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { PROBE_CADENCE_REPO, PROBE_CADENCE_WORKFLOW, PROBE_CADENCE_EVENT, PROBE_CADENCE_STALE_MIN, probeCadenceDecide };", sandbox);
const { PROBE_CADENCE_REPO, PROBE_CADENCE_WORKFLOW, PROBE_CADENCE_EVENT, PROBE_CADENCE_STALE_MIN, probeCadenceDecide } = sandbox.__export;

const now = Date.parse("2026-10-06T18:00:00Z");
const ago = (min) => new Date(now - min * 60000).toISOString();
check(PROBE_CADENCE_STALE_MIN === 60 && PROBE_CADENCE_REPO === "QNFO/qnfo-workers" && PROBE_CADENCE_WORKFLOW === "remediation-consumer.yml", "60-minute window on the consumer workflow of this repository");
let d = probeCadenceDecide(ago(12), null, now, 60);
check(d.dispatch === false && /ran 12 min ago/.test(d.why), "a consumer that ran 12 min ago is left alone", d);
d = probeCadenceDecide(ago(75), null, now, 60);
check(d.dispatch === true && /last ran 75 min ago/.test(d.why), "a consumer idle for 75 min is dispatched", d);
d = probeCadenceDecide(ago(75), ago(20), now, 60);
check(d.dispatch === false && /dispatched 20 min ago/.test(d.why), "one dispatch per window: a dispatch 20 min ago waits for its run", d);
d = probeCadenceDecide(ago(140), ago(70), now, 60);
check(d.dispatch === true, "a dispatch that started nothing for a whole window is sent again", d);
d = probeCadenceDecide(null, null, now, 60);
check(d.dispatch === true && /no consumer run found/.test(d.why), "no run at all is dispatched", d);
d = probeCadenceDecide("not a date", null, now, 60);
check(d.dispatch === true, "an unreadable run time counts as no run", d);
d = probeCadenceDecide(ago(15), null, now, 1);
check(d.dispatch === true, "the window never drops below 10 minutes (one tick)", d);
check(probeCadenceDecide(ago(59), null, now, 60).dispatch === false && probeCadenceDecide(ago(60), null, now, 60).dispatch === true, "the boundary: 59 min waits, 60 min dispatches");

// The tick wires it in, the manual route can run it, and it never writes a run log per tick.
check(/runs\.push\(jobProbeCadence\(env\)\.catch\(/.test(src), "every tick runs the job");
check(/"probe-cadence": jobProbeCadence,/.test(src), "POST /run?job=probe-cadence reaches it");
const job = src.slice(src.indexOf("async function jobProbeCadence"), src.indexOf("__name(jobProbeCadence"));
check(job.indexOf("logRun(") < 0 && /stateSet\(env, "probe_cadence"/.test(job), "state only on a plain tick (scheduler_state probe_cadence), no audit_sessions row");
check(/\/dispatches"/.test(job) && /event_type: PROBE_CADENCE_EVENT/.test(job), "it sends repository_dispatch with the shared event type");
check(/PROBE-CADENCE-DISPATCH-1/.test(job) && /r\.status === 401 \|\| r\.status === 403 \|\| r\.status === 404/.test(job), "a refused dispatch files PROBE-CADENCE-DISPATCH-1 once");

// The workflow must listen for the event, or the dispatch starts nothing.
const wf = readFileSync(join(here, "..", ".github", "workflows", "remediation-consumer.yml"), "utf8");
const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
check(new RegExp("repository_dispatch:\\s*\\n\\s*types: \\[" + PROBE_CADENCE_EVENT + "\\]").test(on), "remediation-consumer.yml listens for repository_dispatch " + PROBE_CADENCE_EVENT);

console.log(fails ? fails + " FAILED" : "probe-cadence: all assertions passed");
process.exit(fails ? 1 : 0);
