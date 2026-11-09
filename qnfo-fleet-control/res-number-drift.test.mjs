/**
 * res-number-drift.test.mjs -- RES-NUMBER-DRIFT-1 (issue 9768): pfResNumberDrift in qnfo-fleet-control/worker.js.
 *   node qnfo-fleet-control/res-number-drift.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
const i = src.indexOf("function pfResNumberDrift(");
let d = 0, end = -1;
for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) { end = k + 1; break; } }
const f = vm.runInNewContext("(" + src.slice(i, end) + ")");
let failed = 0;
function ok(c, m) { if (!c) { failed++; console.error("FAIL " + m); } else console.log("ok   " + m); }

const wbs = [
  { wbs_code: "RES.030", level: "project", github_repo: "QNFO/alpha" },
  { wbs_code: "RES.031", level: "project", github_repo: "QNFO/beta" },
  { wbs_code: "RES.031.1", level: "project", github_repo: null },
  { wbs_code: "ADM.001", level: "project", github_repo: null }
];
const repos = [
  { name: "alpha", description: "Program RES.031 notes", topics: [] },
  { name: "beta", description: "RES.031 work", topics: ["res-031"] },
  { name: "gamma", description: "RES.099 unlinked", topics: [] }
];
const r = f(wbs, repos);
ok(r.next_free === "RES.032", "next free number follows the highest registry RES number (" + r.next_free + ")");
ok(r.duplicates.length === 1 && r.duplicates[0].res === 31, "RES.031 on two project rows is a duplicate");
ok(r.mismatches.length === 1 && r.mismatches[0].repo === "alpha" && r.mismatches[0].label_res === 31, "alpha is labelled RES.031 but registered RES.030");
ok(r.count === 2, "count sums both kinds");
const clean = f([{ wbs_code: "RES.001", level: "project", github_repo: "QNFO/a" }], [{ name: "a", description: "RES.001", topics: [] }]);
ok(clean.count === 0 && clean.next_free === "RES.002", "a consistent registry reports no drift");
ok(f(null, null).next_free === "RES.001", "empty input is safe");
console.log(failed + " failed");
process.exit(failed ? 1 : 0);
