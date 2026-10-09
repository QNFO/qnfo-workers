// SUITE-RUNNER-1 offline suite (scripts/run-suites.mjs). Proves: discovery finds every <dir>/*.test.mjs including this one;
// a changed worker selects exactly its own suites; a control-plane worker or a shared path (scripts, .github, migrations)
// selects every suite; no change selects none; and CONTROL_PLANE equals qnfo-fleet-control's TP_CONTROL_PLANE, so the
// full-set rule follows the control plane the transformation loop and the merge runner use.
// Run: node --no-warnings scripts/run-suites.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { discover, select, CONTROL_PLANE, SHARED } from "./run-suites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const all = discover(root);
ok(all.length >= 150 && all.includes("scripts/run-suites.test.mjs") && all.includes("radar-hub/away-gate.test.mjs"), "discovery finds every suite, this one and the formerly orphaned radar-hub suites", all.length);
ok(all.every((s) => /^[^/]+\/[^/]+\.test\.mjs$/.test(s)), "every discovered path is <dir>/<name>.test.mjs");

let s = select(all, ["radar-hub"]);
ok(s.suites.length >= 3 && s.suites.every((x) => x.startsWith("radar-hub/")), "a changed worker runs exactly its own suites", s);
s = select(all, ["radar-hub", "idea-hub", ""]);
ok(s.suites.some((x) => x.startsWith("idea-hub/")) && s.suites.some((x) => x.startsWith("radar-hub/")) && s.suites.every((x) => /^(idea|radar)-hub\//.test(x)), "two changed workers run both sets and nothing else");
for (const d of ["qnfo-fleet-control", "qnfo-gateway", "qnfo-code-orchestrator"]) {
  s = select(all, ["radar-hub", d]);
  ok(s.suites.length === all.length && /full set/.test(s.reason), "a control-plane change (" + d + ") runs every suite", s.reason);
}
for (const d of SHARED) {
  s = select(all, [d]);
  ok(s.suites.length === all.length, "a shared-path change (" + d + ") runs every suite", s.reason);
}
s = select(all, []);
ok(s.suites.length === 0 && /no worker directory/.test(s.reason), "no change runs nothing");
s = select(all, ["docs"]);
ok(s.suites.every((x) => x.startsWith("docs/")), "a docs-only change runs only the docs suites (docs/doctrine-readings.test.mjs since #853), never a worker suite", s.suites);

const fc = readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8");
const m = /var TP_CONTROL_PLANE = (\[[^\]]*\]);/.exec(fc);
const tp = m ? JSON.parse(m[1]) : null;
ok(tp && tp.slice().sort().join(",") === CONTROL_PLANE.slice().sort().join(","), "CONTROL_PLANE equals qnfo-fleet-control TP_CONTROL_PLANE", { tp, CONTROL_PLANE });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
