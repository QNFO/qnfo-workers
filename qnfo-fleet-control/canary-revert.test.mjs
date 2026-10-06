// CONTROL-PLANE-SELF-MERGE-1 (qnfo-fleet-control 0.7.0): the merge lane may merge a control-plane session pull request only
// because scripts/canary_revert.py (canonical-deploy.yml) can revert the push. This suite runs the script's own selftest and
// keeps the canary worker set in parity between the script and the lane's CP_CANARY_WORKERS.
// Run: node qnfo-fleet-control/canary-revert.test.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + String(x).slice(0, 600) : "")); if (!c) fails++; };

const r = spawnSync("python3", [join(here, "..", "scripts", "canary_revert.py"), "--selftest"], { encoding: "utf8" });
check(r.status === 0 && /canary-revert selftest: ok/.test(r.stdout), "scripts/canary_revert.py --selftest passes", (r.stdout || "") + (r.stderr || ""));

const worker = readFileSync(join(here, "worker.js"), "utf8"), script = readFileSync(join(here, "..", "scripts", "canary_revert.py"), "utf8");
const laneList = /var CP_CANARY_WORKERS = \[([^\]]*)\]/.exec(worker), scriptList = /CANARY_WORKERS = \[([^\]]*)\]/.exec(script);
const names = (s) => (s ? s[1].match(/"([^"]+)"/g).map((x) => x.replace(/"/g, "")).sort() : []);
check(laneList && scriptList && names(laneList).join() === names(scriptList).join() && names(laneList).length >= 7, "CP_CANARY_WORKERS (lane) and CANARY_WORKERS (script) name the same workers", { lane: names(laneList), script: names(scriptList) });
check(/function bhControlPlaneDecide\(names, opts\)/.test(worker) && /control_plane_self_merge/.test(worker), "the lane has the control-plane decision and reads ops_config control_plane_self_merge");

console.log(fails ? fails + " FAILED" : "canary-revert: all assertions passed");
process.exit(fails ? 1 : 0);
