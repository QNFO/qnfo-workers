// FLEET-GRAPH-CADENCE-1 (qnfo-cloud-ops 1.32.0): the tick dispatches fleet-graph.yml (the FLEET-GRAPH-1 build) when its last
// main run is older than 60 minutes and no dispatch went out inside that window, and the workflow listens for the event.
// Run: node qnfo-cloud-ops/fleet-graph-cadence.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
const block = (tag) => { const a = src.indexOf("// ---- " + tag + ":BEGIN"), b = src.indexOf("// ---- " + tag + ":END"); check(a > 0 && b > a, tag + " pure block is marked"); return src.slice(a, b); };
const sandbox = { Date, Math, Number, isNaN };
vm.createContext(sandbox);
vm.runInContext(block("PROBE-CADENCE-1") + block("FLEET-GRAPH-CADENCE-1") + "\n__export = { PROBE_CADENCE_REPO, FLEET_GRAPH_WORKFLOW, FLEET_GRAPH_EVENT, FLEET_GRAPH_STALE_MIN, probeCadenceDecide };", sandbox);
const { PROBE_CADENCE_REPO, FLEET_GRAPH_WORKFLOW, FLEET_GRAPH_EVENT, FLEET_GRAPH_STALE_MIN, probeCadenceDecide } = sandbox.__export;
check(PROBE_CADENCE_REPO === "QNFO/qnfo-workers" && FLEET_GRAPH_WORKFLOW === "fleet-graph.yml", "dispatches this repository's fleet-graph workflow");
check(FLEET_GRAPH_STALE_MIN > 0 && FLEET_GRAPH_STALE_MIN <= 110, "window plus one 10-minute tick stays inside the 120-minute SLA (SLA-120M-1)", FLEET_GRAPH_STALE_MIN);
const now = Date.parse("2026-10-19T06:00:00Z");
const ago = (min) => new Date(now - min * 60000).toISOString();
check(probeCadenceDecide(ago(20), null, now, FLEET_GRAPH_STALE_MIN).dispatch === false, "a build 20 min ago is left alone");
check(probeCadenceDecide(ago(61), null, now, FLEET_GRAPH_STALE_MIN).dispatch === true, "a build 61 min ago is dispatched");
check(probeCadenceDecide(ago(90), ago(10), now, FLEET_GRAPH_STALE_MIN).dispatch === false, "one dispatch per window");

const job = src.slice(src.indexOf("async function jobFleetGraphCadence"), src.indexOf("__name(jobFleetGraphCadence"));
check(job.length > 200, "the job exists");
check(/runs\.push\(jobFleetGraphCadence\(env\)\.catch\(/.test(src), "every tick runs the job");
check(/"fleet-graph-cadence": jobFleetGraphCadence,/.test(src), "POST /run?job=fleet-graph-cadence reaches it");
check(job.indexOf("logRun(") < 0 && /stateSet\(env, "fleet_graph_cadence"/.test(job), "state only on a plain tick, no run log row");
check(/event_type: FLEET_GRAPH_EVENT/.test(job) && /branch=main/.test(job), "it reads main's runs and sends the fleet-graph event");
check(/FLEET-GRAPH-DISPATCH-1/.test(job) && /r\.status === 401 \|\| r\.status === 403 \|\| r\.status === 404/.test(job), "a refused dispatch files FLEET-GRAPH-DISPATCH-1 once");
const wf = readFileSync(join(here, "..", ".github", "workflows", "fleet-graph.yml"), "utf8");
const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
check(new RegExp("repository_dispatch:\\s*\\n\\s*types: \\[" + FLEET_GRAPH_EVENT + "\\]").test(on), "fleet-graph.yml listens for repository_dispatch " + FLEET_GRAPH_EVENT);
console.log(fails ? fails + " FAILED" : "fleet-graph-cadence: all assertions passed");
process.exit(fails ? 1 : 0);
