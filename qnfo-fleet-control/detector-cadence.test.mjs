// DETECTOR-CADENCE-1 (qnfo-fleet-control 0.12.1) offline suite. Proves: rtStandingDetector recognises fm-* and belief-*
// classes and nothing else; the REMEDIATION-HOLD-1 branch checks it before the pass/hold/close logic, so a standing
// detector is never parked at RT_HOLD_CADENCE_H nor closed after RT_HOLD_D days, and a parked one is re-armed.
// Run: node qnfo-fleet-control/detector-cadence.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const a = src.indexOf("var RT_STANDING_DETECTOR_PREFIXES"), b = src.indexOf("\n}", src.indexOf("function rtStandingDetector(")) + 2;
const isDet = new Function(src.slice(a, b) + "\nreturn rtStandingDetector;")();
ok(isDet("fm-head-of-line") && isDet("belief-lane-merges") && isDet("fm-x"), "fm-* and belief-* are standing detectors");
ok(!isDet("issue-2186") && !isDet("METRIC-TRIGGER-1238") && !isDet("liveness-qnfo") && !isDet("") && !isDet(null) && !isDet("xfm-1"), "issue, metric, liveness and look-alike classes are not");
const i = src.indexOf("REMEDIATION-HOLD-1 (0.4.123");
const branch = src.slice(i, src.indexOf("await db.prepare(\"UPDATE remediation_contracts SET attempts", i));
const d = branch.indexOf("if (rtStandingDetector(c.class))"), p = branch.indexOf('verdict === "pass"');
ok(d > 0 && p > d, "the detector check runs before the pass -> hold/close logic", { d, p });
ok(/if \(rtStandingDetector\(c\.class\)\) \{[\s\S]*?if \(c\.contract_status === "holding"\) nextStatus = "active";/.test(branch), "a parked detector is re-armed to active");
ok(!/rtStandingDetector[\s\S]{0,300}RT_HOLD_CADENCE_H/.test(branch.slice(d, p)), "the detector branch never applies the 24 h hold cadence");
const v = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(v[0] > 0 || v[1] > 12 || (v[1] === 12 && v[2] >= 1), "VERSION is at least 0.12.1", v);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
