// SUITE-RUNNER-1 offline suite (scripts/run-suites.mjs). Proves: discovery finds every <dir>/*.test.mjs including this one;
// a changed worker selects exactly its own suites; a shared path (scripts, .github, migrations) selects every suite (a
// control-plane worker selects its own on a PR, PRS-SCOPE-1); no change selects none; and CONTROL_PLANE equals qnfo-fleet-control's TP_CONTROL_PLANE, so the
// full-set rule follows the control plane the transformation loop and the merge runner use.
// Run: node --no-warnings scripts/run-suites.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { discover, select, syntaxTargets, isModuleSource, CONTROL_PLANE, SHARED, ALWAYS } from "./run-suites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const all = discover(root);
ok(all.length >= 150 && all.includes("scripts/run-suites.test.mjs") && all.includes("radar-hub/away-gate.test.mjs"), "discovery finds every suite, this one and the formerly orphaned radar-hub suites", all.length);
ok(all.every((s) => /^[^/]+\/[^/]+\.test\.mjs$/.test(s)), "every discovered path is <dir>/<name>.test.mjs");

let s = select(all, ["radar-hub"]);
ok(s.suites.length >= 3 && s.suites.every((x) => x.startsWith("radar-hub/") || ALWAYS.includes(x)) && ALWAYS.every((x) => s.suites.includes(x)), "a changed worker runs exactly its own suites plus the repository guards (SUITE-GUARDS-ALWAYS-1)", s);
s = select(all, ["radar-hub", "idea-hub", ""]);
ok(s.suites.some((x) => x.startsWith("idea-hub/")) && s.suites.some((x) => x.startsWith("radar-hub/")) && s.suites.every((x) => /^(idea|radar)-hub\//.test(x) || ALWAYS.includes(x)), "two changed workers run both sets, the repository guards and nothing else");
for (const d of ["qnfo-fleet-control", "qnfo-gateway", "qnfo-code-orchestrator"]) {
  s = select(all, ["radar-hub", d]);
  ok(!/full set/.test(s.reason) && s.suites.some((x) => x.startsWith(d + "/")) && s.suites.every((x) => x.startsWith(d + "/") || x.startsWith("radar-hub/") || ALWAYS.includes(x)), "a control-plane change (" + d + ") runs its own suites on a PR; the full set stays on main's push (PRS-SCOPE-1)", s.reason);
}
for (const d of SHARED) {
  s = select(all, [d]);
  ok(s.suites.length === all.length, "a shared-path change (" + d + ") runs every suite", s.reason);
}
s = select(all, []);
ok(s.suites.length === 0 && /no worker directory/.test(s.reason), "no change runs nothing");
s = select(all, ["docs"]);
ok(s.suites.every((x) => x.startsWith("docs/") || ALWAYS.includes(x)) && !s.suites.some((x) => /^qnfo-/.test(x)), "a docs-only change runs only the docs suites (docs/doctrine-readings.test.mjs since #853) and the repository guards, never a worker suite", s.suites);

// SUITE-SYNTAX-CHECK-1: the changed worker files are syntax-checked; shared paths are not worker directories
let syn = syntaxTargets(root, ["qnfo-email", "scripts", "migrations", ""], false);
ok(syn.includes("qnfo-email/worker.js") && syn.includes("qnfo-email/deployed-current.worker.js") && !syn.some((x) => /^(scripts|migrations)\//.test(x)), "a changed worker's two files are syntax-checked, shared paths are not", syn);
syn = syntaxTargets(root, [], true);
ok(syn.includes("qnfo-fleet-control/worker.js") && syn.length >= 20, "--all syntax-checks every worker directory", syn.length);
ok(syntaxTargets(root, ["no-such-dir"], false).length === 0, "a directory without worker.js is skipped");
ok(isModuleSource("// c\nexport default {};") && isModuleSource("import { x } from 'y';") && !isModuleSource("addEventListener('fetch', h);\nvar exported = 1;"), "module-shaped sources are told apart from scripts");

const fc = readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8");
const m = /var TP_CONTROL_PLANE = (\[[^\]]*\]);/.exec(fc);
const tp = m ? JSON.parse(m[1]) : null;
ok(tp && tp.slice().sort().join(",") === CONTROL_PLANE.slice().sort().join(","), "CONTROL_PLANE equals qnfo-fleet-control TP_CONTROL_PLANE", { tp, CONTROL_PLANE });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
