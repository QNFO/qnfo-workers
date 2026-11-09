// GATEWAY-RUNWAY-BRAKE-1 (issue 7986): costImpactGuard recommends and never PUTs spend_limits alone.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("async function costImpactGuard(env) {");
const body = src.slice(a, src.indexOf("\n}\n", a));
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL " + m); } };
ok(a > 0, "costImpactGuard found");
ok(!/method:\s*"PUT"/.test(body), "no PUT in costImpactGuard");
ok(!body.includes("spend_limits: { enabled: true, rules: newRules }"), "spend_limits-only body is gone");
ok(/-recommended:brake=/.test(body), "action records a recommendation with the brake shape");
console.log(fail ? "failed" : "1 suite passed");
if (fail) process.exit(1);
