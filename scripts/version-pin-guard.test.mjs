// VERSION-PIN-TESTS-1 (2026-10-08): no suite may test a worker VERSION against a version-range regex such as
// /^0\.9\.6[4-9]/.test(VERSION). Seven suites did; each failed at the next bump and blocked every code task on its
// worker (#2137, #2116, #1815). Use versionAtLeast from scripts/version-at-least.mjs instead.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { versionAtLeast } from "./version-at-least.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d ? " :: " + JSON.stringify(d) : "")); } };

ok(versionAtLeast("0.9.70-codeagent", "0.9.64"), "0.9.70 is at least 0.9.64");
ok(versionAtLeast("0.10.0", "0.9.64"), "0.10.0 is at least 0.9.64");
ok(versionAtLeast("1.3.1-x", "1.3.1"), "equal core counts");
ok(!versionAtLeast("0.9.63", "0.9.64"), "0.9.63 is below 0.9.64");
ok(!versionAtLeast("garbage", "0.0.1"), "unparseable is false");

const root = new URL("..", import.meta.url).pathname;
const suites = [];
(function walk(dir, depth) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".") || n === "archive") continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory() && depth < 2) walk(p, depth + 1);
    else if (/\.test\.mjs$/.test(n)) suites.push(p);
  }
})(root, 0);
// A regex literal pinning a minor or patch number (/^1\.3\./, /^0\.9\.6[4-9]/), applied with .test() to a version. A
// major-only pin (/^2\./, /^3\.\d+\.\d+/) is allowed: a major bump is a breaking change the suite must review anyway.
const PIN = /\/\^\(?\d+\\\.(?:\d|\(|\[)[^/\n]*\/\.test\(\s*[\w.]*(VERSION|version|__hv|__mv)\b/;
const markerDir = (p) => ["FOLDED", "RETIRED"].some((m) => { try { return statSync(join(p, "..", m)).isFile(); } catch (e) { return false; } });
const pinned = suites.filter((p) => !p.endsWith("version-pin-guard.test.mjs") && !markerDir(p) && PIN.test(readFileSync(p, "utf8"))).map((p) => p.slice(root.length));
ok(suites.length > 50, "the scan sees the suites", suites.length);
ok(pinned.length === 0, "no suite pins a VERSION with a range regex (use versionAtLeast)", pinned);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
