// CONSUMER-PENDING-IS-DEFERRAL-1 suite: runs scripts/remediation_consumer_pending_test.py, which drives the consumer's real consume_one
// against sqlite and proves a pending d1-query read is a deferral (no verification row, last_verdict deferred, counted as skipped) while the
// measured-pending shape, a stale read and a pass keep their rows, and that the carve-out agrees with the D1 trigger's own expression.
// Run: node scripts/consumer-pending.test.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("python3", [join(here, "remediation_consumer_pending_test.py")], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
ok(r.status === 0 && /all passed/.test(out) && !/^FAIL/m.test(out), "the pending-is-deferral test passes", out.slice(-500));
ok((out.match(/^ok /gm) || []).length >= 60, "the test covers the cases and the trigger parity corpus", (out.match(/^ok /gm) || []).length);
ok(/same verdict as the D1 trigger/.test(out), "the carve-out is compared with the trigger's own expression");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
