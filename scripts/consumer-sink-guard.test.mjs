// PROBE-AUTHOR-SINK-GUARD-1 suite, consumer half: runs scripts/remediation_consumer_sink_guard_test.py, which drives the consumer's real consume_one against sqlite and proves that for a
// probe-author-1 contract a later pass whose expected or observed is not one short token is a probe-error with the reason free-text-value, recorded nowhere as a value, while tokens and every other
// module keep their old paths. The worker half is qnfo-fleet-control/probe-author-sink.test.mjs.
// Run: node scripts/consumer-sink-guard.test.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("python3", [join(here, "remediation_consumer_sink_guard_test.py")], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
ok(r.status === 0 && /all passed/.test(out) && !/^FAIL/m.test(out), "the sink guard test passes", out.slice(-500));
ok((out.match(/^ok /gm) || []).length >= 35, "the test covers the cases", (out.match(/^ok /gm) || []).length);
ok(/the value is in no record, log line or audit event/.test(out), "the value is checked absent from the record, the log and the audit event");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
