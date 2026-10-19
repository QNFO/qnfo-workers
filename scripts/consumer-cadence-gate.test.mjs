// CONSUMER-GATE-STARVATION-1 suite: the cadence gate of remediation-consumer.yml counts a consumer run only when its `consume` job
// ran, and the workflow runs the gate through scripts/consumer-cadence-gate.mjs. Run: node scripts/consumer-cadence-gate.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

let out = "";
try { out = execFileSync("node", [join(here, "consumer-cadence-gate.mjs"), "--selftest"], { encoding: "utf8" }); } catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); }
ok(/selftest: ok/.test(out) && !/^FAIL/m.test(out), "the gate's own selftest passes", out.slice(-400));
ok((out.match(/^PASS/gm) || []).length >= 10, "the selftest covers the cases", (out.match(/^PASS/gm) || []).length);

const wf = readFileSync(join(here, "..", ".github", "workflows", "remediation-consumer.yml"), "utf8");
ok(/node scripts\/consumer-cadence-gate\.mjs/.test(wf), "the workflow's cadence-gate step runs the script");
ok(!/select\(\.status == "in_progress" or \.conclusion == "success"\) \| \.run_started_at/.test(wf), "the workflow no longer reads the last run by workflow conclusion alone (a skipped trigger concluded success)");
ok(/RUN_ID: \$\{\{ github\.run_id \}\}/.test(wf) && /EVENT: \$\{\{ github\.event_name \}\}/.test(wf) && /HEAD_MSG:/.test(wf), "the step passes the event, the head message and the run id");
ok(/needs: cadence-gate/.test(wf) && /needs\.cadence-gate\.outputs\.run == 'true'/.test(wf), "the consume job still waits on the gate's output");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
