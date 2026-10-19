// CONTRACT-STAMP-NO-CLOBBER-1 suite: runs scripts/remediation_consumer_stamp_test.py, which executes the consumer's real contract-stamp
// statement in sqlite and proves it never overwrites a status the consumer does not own. Run: node scripts/consumer-stamp.test.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("python3", [join(here, "remediation_consumer_stamp_test.py")], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
ok(r.status === 0 && /all passed/.test(out) && !/^FAIL/m.test(out), "the stamp test passes", out.slice(-500));
ok((out.match(/^ok /gm) || []).length >= 10, "the stamp test covers the cases", (out.match(/^ok /gm) || []).length);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
