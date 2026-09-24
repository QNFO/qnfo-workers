// qnfo-fleet-control/version-compare.test.mjs
// =====================================================================
// Regression lock for the fail-closed fleet version comparator.
// Exits non-zero on any failure. Prints "<n> passed, <m> failed".
//
// Run: node qnfo-fleet-control/version-compare.test.mjs
// =====================================================================

import { compareVersions, deployDecision, UNORDERABLE, parseVersion } from "./version-compare.mjs";

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}  (got ${String(actual)}, want ${String(expected)})`);
}

function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

// ---------------------------------------------------------------------
// Section 1: the "v" prefix must not destroy the numeric core.
//   Anti-pattern: parseInt("v1") -> NaN -> 0, "v1.1.0" -> [0,1,0].
// ---------------------------------------------------------------------
section("1. v-prefix parsing");
eq(JSON.stringify(parseVersion("v1.1.0").core), "[1,1,0]", "v1.1.0 core is [1,1,0], not [0,1,0]");
eq(parseVersion("v1.1.0").core[0], 1, "v1.1.0 major is 1");
eq(compareVersions("v1.1.0", "1.0.0"), 1, "v1.1.0 is AHEAD of 1.0.0");

// ---------------------------------------------------------------------
// Section 2: rule 5 -- equal cores with differing suffixes are UNORDERABLE.
// ---------------------------------------------------------------------
section("2. rule 5 -- differing suffix on equal core is UNORDERABLE");
eq(compareVersions("3.6.1-subscribers", "3.6.1"), UNORDERABLE, "3.6.1-subscribers vs 3.6.1");
eq(compareVersions("1.14.1", "1.14.1-gtd-guard"), UNORDERABLE, "1.14.1 vs 1.14.1-gtd-guard");
eq(compareVersions("2.1.0", "qnfo-qwav/fabric-20260910"), UNORDERABLE, "2.1.0 vs fabric tag");
eq(compareVersions("3.6.1", "3.6.1"), 0, "identical versions are equal");

// ---------------------------------------------------------------------
// Section 3: the personal-companion downgrade must never re-fire.
// ---------------------------------------------------------------------
section("3. genuine-ahead deployments must be no-act");
eq(deployDecision("v1.1.0", "1.0.0"), "no-act", "v1.1.0 vs 1.0.0 (the 2026-09-13 bug)");
eq(deployDecision("v2.0.0", "1.9.9"), "no-act", "v2.0.0 vs 1.9.9");
eq(deployDecision("1.0.0", "1.0.0"), "no-act", "equal versions are no-act");

// ---------------------------------------------------------------------
// Section 4: genuine-behind deployments MUST still act.
// ---------------------------------------------------------------------
section("4. genuine-behind deployments must deploy");
eq(deployDecision("1.0.0", "1.1.0"), "deploy", "1.0.0 vs 1.1.0");
eq(deployDecision("1.9.9", "2.0.0"), "deploy", "1.9.9 vs 2.0.0");
eq(compareVersions("1.0.0", "1.1.0"), -1, "1.0.0 is BEHIND 1.1.0");

// ---------------------------------------------------------------------
// Section 5: fail-closed on unparsable / non-semver input.
// ---------------------------------------------------------------------
section("5. fail-closed on unparsable input");
eq(compareVersions("qnfo-qwav/fabric-20260910", "2.1.0"), UNORDERABLE, "fabric tag vs 2.1.0");
eq(deployDecision("qnfo-qwav/fabric-20260910", "2.1.0"), "no-act", "fabric deployed -> no-act");
eq(deployDecision("1.0.0", "some/opaque-tag"), "no-act", "opaque canonical -> no-act");
eq(parseVersion("not-a-version"), null, "non-semver parses to null");

console.log(`\n${"=".repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(60));

process.exit(failed === 0 ? 0 : 1);
