// STAMP-ESCALATE-1 suite (issue 9762): runs scripts/remediation_consumer_escalate_test.py and remediation_consumer_stamp_test.py, which drive the
// consumer's real consume_one against sqlite and prove a d1-query or code-read contract that keeps failing past max_attempts takes status escalated
// with an escalate_to owner, while standing detectors (fm-*, belief-*), passes, superseded contracts and single fails after many passes do not.
// Run: node scripts/consumer-escalate.test.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
for (const [file, min] of [["remediation_consumer_escalate_test.py", 11], ["remediation_consumer_stamp_test.py", 7]]) {
  const r = spawnSync("python3", [join(here, file)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  ok(r.status === 0 && /all passed/.test(out) && !/^FAIL/m.test(out), file + " passes", out.slice(-500));
  ok((out.match(/^ok /gm) || []).length >= min, file + " covers its cases", (out.match(/^ok /gm) || []).length);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
