// SUITE-RUNNER-1 offline suite (scripts/run-suites.mjs). Proves: discovery finds every <dir>/*.test.mjs including this one;
// a changed worker selects exactly its own suites; a shared path (scripts, .github, migrations, _shared, a root file) and a
// control-plane worker select every suite (MERGE-BOUNDARY-GATE-1, which put the control plane back into the full-set rule that
// PRS-SCOPE-1 had taken it out of); no change selects none; CONTROL_PLANE equals qnfo-fleet-control's TP_CONTROL_PLANE, so the
// full-set rule follows the control plane the transformation loop and the merge runner use; and the recorded override
// (scripts/suite-quarantine.txt) excuses a red suite only while its dated, referenced line is live.
// Run: node --no-warnings scripts/run-suites.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { discover, select, syntaxTargets, isModuleSource, parseQuarantine, applyQuarantine, msUntilSafeStart, HOUR_EDGE_GUARD_S, CONTROL_PLANE, SHARED, ALWAYS, QUARANTINE_FILE, QUARANTINE_MAX_DAYS } from "./run-suites.mjs";

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
for (const d of CONTROL_PLANE) {
  s = select(all, ["radar-hub", d]);
  ok(/full set/.test(s.reason) && s.suites.length === all.length, "a control-plane change (" + d + ") runs every suite on a PR (MERGE-BOUNDARY-GATE-1; PRS-SCOPE-1 had scoped it)", s.reason);
}
for (const d of SHARED) {
  s = select(all, [d]);
  ok(s.suites.length === all.length, "a shared-path change (" + d + ") runs every suite", s.reason);
}
ok(SHARED.includes("_shared") && SHARED.includes("."), "_shared and a root-file change are shared paths");
ok(syntaxTargets(root, ["."], false).length === 0, "a root-file marker is not a worker directory for the syntax check");
s = select(all, []);
ok(s.suites.length === 0 && /no worker directory/.test(s.reason), "no change runs nothing");
s = select(all, ["docs"]);
ok(s.suites.every((x) => x.startsWith("docs/") || ALWAYS.includes(x)) && !s.suites.some((x) => /^qnfo-/.test(x)), "a docs-only change runs only the docs suites (docs/doctrine-readings.test.mjs since #853) and the repository guards, never a worker suite", s.suites);

// SUITE-DEPENDENTS-1: with a reader, a suite in another directory that reads a file of the changed one runs too
const rd = (x) => readFileSync(join(root, x), "utf8");
s = select(all, ["qnfo-fleet-dashboard"], rd);
ok(s.suites.includes("qnfo-fleet-dashboard/architecture.test.mjs") && s.suites.includes("qnfo-cloud-ops/job-reason.test.mjs") && s.suites.some((x) => !x.startsWith("qnfo-fleet-dashboard/") && !ALWAYS.includes(x) && rd(x).includes("../qnfo-fleet-dashboard/")) && /read them/.test(s.reason), "a suite elsewhere that reads ../qnfo-fleet-dashboard/ runs when qnfo-fleet-dashboard changes", s.reason);
ok(s.suites.every((x) => x.startsWith("qnfo-fleet-dashboard/") || ALWAYS.includes(x) || rd(x).includes("../qnfo-fleet-dashboard/")), "nothing unrelated is added", s.suites.filter((x) => !x.startsWith("qnfo-fleet-dashboard/")));
ok(select(all, ["qnfo-fleet-dashboard"]).suites.every((x) => x.startsWith("qnfo-fleet-dashboard/") || ALWAYS.includes(x)), "without a reader select() is unchanged");
ok(select(["a/x.test.mjs", "b/y.test.mjs", "c/z.test.mjs"], ["a"], (x) => (x === "b/y.test.mjs" ? 'import w from "../a/worker.js"' : x === "c/z.test.mjs" ? '"../ab/worker.js"' : "")).suites.join() === "a/x.test.mjs,b/y.test.mjs", "the match is on the whole directory name (../ab/ is not ../a/)");

// SUITE-SYNTAX-CHECK-1: the changed worker files are syntax-checked; shared paths are not worker directories
let syn = syntaxTargets(root, ["qnfo-email", "scripts", "migrations", ""], false);
ok(syn.includes("qnfo-email/worker.js") && syn.includes("qnfo-email/deployed-current.worker.js") && !syn.some((x) => /^(scripts|migrations)\//.test(x)), "a changed worker's two files are syntax-checked, shared paths are not", syn);
syn = syntaxTargets(root, [], true);
ok(syn.includes("qnfo-fleet-control/worker.js") && syn.length >= 20, "--all syntax-checks every worker directory", syn.length);
ok(syntaxTargets(root, ["no-such-dir"], false).length === 0, "a directory without worker.js is skipped");
ok(isModuleSource("// c\nexport default {};") && isModuleSource("import { x } from 'y';") && !isModuleSource("addEventListener('fetch', h);\nvar exported = 1;"), "module-shaped sources are told apart from scripts");

// MERGE-BOUNDARY-GATE-1: the recorded override
const TODAY = "2026-10-19";
const line = (suite, exp, ref, why) => [suite, exp, ref, why].join(" | ");
let qz = parseQuarantine("# comment\n\n" + line("qnfo-ops/x.test.mjs", "2026-10-22", "2830", "stale fixture, fix tracked in 2830"), TODAY);
ok(qz.active.size === 1 && qz.active.get("qnfo-ops/x.test.mjs").ref === "2830" && qz.problems.length === 0, "a dated, referenced entry is live", qz);
qz = parseQuarantine(line("qnfo-ops/x.test.mjs", "2026-10-19", "2830", "expires today, still live today"), TODAY);
ok(qz.active.size === 1, "an entry is live through its expiry day", qz);
qz = parseQuarantine(line("qnfo-ops/x.test.mjs", "2026-10-18", "2830", "expired yesterday, no longer excuses"), TODAY);
ok(qz.active.size === 0 && qz.problems.length === 0 && qz.warnings.length === 1 && /expired/.test(qz.warnings[0]), "an expired entry stops excusing the suite and is a warning, not a stop", qz);
qz = parseQuarantine(line("qnfo-ops/x.test.mjs", "2026-11-30", "2830", "far horizon, forgotten for weeks"), TODAY);
ok(qz.active.size === 0 && qz.problems.length === 1 && /days away/.test(qz.problems[0]), "an expiry beyond " + QUARANTINE_MAX_DAYS + " days fails the run", qz);
for (const bad of ["qnfo-ops/x.test.mjs | 2026-10-22 | 2830", "qnfo-ops/x.test.mjs | tomorrow | 2830 | a reason long enough", "qnfo-ops/x.test.mjs | 2026-10-22 | | a reason long enough", "qnfo-ops/x.test.mjs | 2026-10-22 | 2830 | short", "qnfo-ops/x.js | 2026-10-22 | 2830 | a reason long enough", "../x/y.test.mjs | 2026-10-22 | 2830 | a reason long enough"]) {
  qz = parseQuarantine(bad, TODAY);
  ok(qz.active.size === 0 && qz.problems.length === 1 && /malformed/.test(qz.problems[0]), "a malformed entry fails the run: " + bad, qz);
}
const res = [{ suite: "a/ok.test.mjs", code: 0 }, { suite: "a/red.test.mjs", code: 1 }, { suite: "b/red.test.mjs", code: 1 }, { suite: "a/quar-green.test.mjs", code: 0 }, { suite: "a/x.js (node --check)", code: 1 }];
const act = new Map([["a/red.test.mjs", { suite: "a/red.test.mjs", expires: "2026-10-22", ref: "2830", reason: "r" }], ["a/quar-green.test.mjs", { suite: "a/quar-green.test.mjs", expires: "2026-10-22", ref: "2830", reason: "r" }]]);
const sp = applyQuarantine(res, act);
ok(sp.quarantined.map((x) => x.suite).join() === "a/red.test.mjs" && sp.real.map((x) => x.suite).join() === "b/red.test.mjs,a/x.js (node --check)" && sp.stale.map((x) => x.suite).join() === "a/quar-green.test.mjs", "only a listed red suite is excused; an unlisted red suite and a syntax failure still fail; a listed green suite is stale", sp);
ok(applyQuarantine(res, new Map()).real.length === 3, "with no override every red result fails the run");
const qfile = readFileSync(join(root, QUARANTINE_FILE), "utf8");
const live = parseQuarantine(qfile, new Date().toISOString().slice(0, 10));
ok(live.problems.length === 0, "the committed quarantine file parses with no malformed or far-horizon line", live.problems);

// the CLI end to end on a synthetic tree: a red suite fails the run, the same suite under a live entry does not, under an expired entry it does again
{
  const t = mkdtempSync(join(tmpdir(), "run-suites-"));
  mkdirSync(join(t, "a")); mkdirSync(join(t, "scripts"));
  writeFileSync(join(t, "a", "ok.test.mjs"), "process.exit(0);\n");
  writeFileSync(join(t, "a", "red.test.mjs"), "console.log('boom'); process.exit(1);\n");
  const run = (today) => spawnSync(process.execPath, ["--no-warnings", join(root, "scripts", "run-suites.mjs"), "--all", "--today", today], { cwd: t, encoding: "utf8" });
  let r = run("2026-10-19");
  ok(r.status === 1 && /1 failed/.test(r.stdout) && /FAIL .*a\/red\.test\.mjs/.test(r.stdout), "CLI: a red suite with no override fails the run", r.stdout.slice(-300));
  writeFileSync(join(t, QUARANTINE_FILE), "a/red.test.mjs | 2026-10-21 | 2830 | synthetic red suite for the override test\n");
  r = run("2026-10-19");
  ok(r.status === 0 && /1 quarantined/.test(r.stdout) && /::warning::SUITE-QUARANTINE-1 a\/red\.test\.mjs is red and quarantined until 2026-10-21 \(2830\)/.test(r.stdout), "CLI: a live entry excuses the red suite, loudly", r.stdout.slice(-400));
  r = run("2026-10-23");
  ok(r.status === 1 && /expired 2026-10-21/.test(r.stdout), "CLI: the same entry past its expiry no longer excuses it", r.stdout.slice(-400));
  writeFileSync(join(t, QUARANTINE_FILE), "a/red.test.mjs | 2026-12-31 | 2830 | synthetic far horizon for the override test\n");
  r = run("2026-10-19");
  ok(r.status === 1 && /days away/.test(r.stdout), "CLI: an entry with a far horizon fails even a run whose suites are excused", r.stdout.slice(-400));
  rmSync(t, { recursive: true, force: true });
}

// RUN-SUITES-HOUR-EDGE-1: no suite starts in the last HOUR_EDGE_GUARD_S seconds before an hour edge (or a UTC midnight, which is one)
{
  const at = (iso) => Date.parse(iso);
  ok(HOUR_EDGE_GUARD_S === 10, "the guard is 10 s", HOUR_EDGE_GUARD_S);
  ok(msUntilSafeStart(at("2026-10-20T10:30:00Z")) === 0, "mid-hour: no wait");
  ok(msUntilSafeStart(at("2026-10-20T10:59:49.999Z")) === 0, "10.001 s before the edge: no wait");
  ok(msUntilSafeStart(at("2026-10-20T10:59:50Z")) === 11000, "10 s before the edge: waits the 10 s plus 1 s", msUntilSafeStart(at("2026-10-20T10:59:50Z")));
  ok(msUntilSafeStart(at("2026-10-20T10:59:59.500Z")) === 1500, "0.5 s before the edge: waits 0.5 s plus 1 s", msUntilSafeStart(at("2026-10-20T10:59:59.500Z")));
  ok(msUntilSafeStart(at("2026-10-20T11:00:00Z")) === 0, "on the edge itself the new hour has begun: no wait");
  ok(msUntilSafeStart(at("2026-10-20T23:59:55Z")) === 6000, "before UTC midnight the wait ends one second after 00:00Z", msUntilSafeStart(at("2026-10-20T23:59:55Z")));
  ok(msUntilSafeStart(at("2026-10-20T23:59:55Z")) + at("2026-10-20T23:59:55Z") === at("2026-10-21T00:00:01Z"), "the wait lands at 00:00:01Z");
  ok(msUntilSafeStart(at("2026-10-20T10:59:45Z"), 20) === 16000, "the guard is a parameter", msUntilSafeStart(at("2026-10-20T10:59:45Z"), 20));
  const src = readFileSync(join(root, "scripts", "run-suites.mjs"), "utf8");
  ok(/async function runOne\([^)]*\) \{\s*const wait = msUntilSafeStart\(Date\.now\(\)\);/.test(src), "runOne waits for a safe start before it spawns a suite");
}

const fc = readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8");
const m = /var TP_CONTROL_PLANE = (\[[^\]]*\]);/.exec(fc);
const tp = m ? JSON.parse(m[1]) : null;
ok(tp && tp.slice().sort().join(",") === CONTROL_PLANE.slice().sort().join(","), "CONTROL_PLANE equals qnfo-fleet-control TP_CONTROL_PLANE", { tp, CONTROL_PLANE });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
