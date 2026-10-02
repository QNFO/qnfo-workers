// GUARD-RCS-CANCELLED-1 offline suite (qnfo-fleet-dashboard 1.18.7).
// Slices guardRunState out of the real worker.js. Proves: a guard's state is its latest run that actually concluded,
// so a concurrency-cancelled or skipped run never counts as a guard that failed closed (the false METRIC-TRIGGER-361 of
// 2026-10-02, agent_issues 1797), while a real failure, timeout or startup failure still counts.
// Run: node qnfo-fleet-dashboard/guard-rcs.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("function guardRunState(runs)");
const b = src.indexOf("\n}\n", a);
if (a < 0 || b < a) throw new Error("guardRunState not found in worker.js");
const guardRunState = new Function(src.slice(a, b + 2) + "\nreturn guardRunState;")();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const r = (...cs) => cs.map((c, i) => ({ id: i, conclusion: c }));

ok(guardRunState(r("success")).failing === false, "latest success -> not failing");
ok(guardRunState(r("cancelled", "success")).failing === false && guardRunState(r("cancelled", "success")).run.id === 1, "a cancelled latest run is skipped; the earlier success decides");
ok(guardRunState(r("skipped", "cancelled", "success")).failing === false, "skipped and cancelled are both skipped");
ok(guardRunState(r("cancelled", "failure")).failing === true, "a real failure behind a cancelled run still counts");
ok(guardRunState(r("failure", "success")).failing === true, "latest failure counts");
ok(guardRunState(r("timed_out")).failing === true && guardRunState(r("startup_failure")).failing === true, "timeouts and startup failures count");
ok(guardRunState(r("neutral")).failing === false, "neutral is not a failure");
ok(guardRunState(r("cancelled", "cancelled")) === null && guardRunState([]) === null, "no concluded run -> unread (null), not failing");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
