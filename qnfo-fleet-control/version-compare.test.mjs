/**
 * version-compare.test.mjs -- regression lock for the fail-closed comparator.
 *
 * Its output MUST contain "0 failed" on success; version-compare.yml greps for
 * exactly that string, so the two assertions are one contract.
 */
import {
  compareVersions,
  deployDecision,
  UNORDERABLE,
  ACT,
  NO_ACT,
} from "./version-compare.mjs";

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  if (actual === expected) {
    passed++;
    return;
  }
  failed++;
  console.error(
    `FAIL ${label}: got ${String(actual)}, want ${String(expected)}`,
  );
}

// --- ordering by numeric core -------------------------------------------
eq(compareVersions("1.0.0", "1.0.0"), 0, "identical cores are equal");
eq(compareVersions("1.0.0", "1.0.1"), -1, "patch behind");
eq(compareVersions("1.2.0", "1.1.9"), 1, "minor ahead");
eq(compareVersions("2.0.0", "1.9.9"), 1, "major ahead");
eq(compareVersions("1.0.0", "1.0.0.0"), 0, "trailing zero group equal");

// --- the v-prefix bug that caused the incident --------------------------
eq(compareVersions("v1.1.0", "1.0.0"), 1, "v1.1.0 is AHEAD of 1.0.0, not [0,1,0]");
eq(compareVersions("v1.1.0", "1.1.0"), 0, "v-prefix is not significant");

// --- RULE 5: equal cores + differing suffixes are UNORDERABLE -----------
eq(compareVersions("3.6.1-subscribers", "3.6.1"), UNORDERABLE, "suffix vs none");
eq(compareVersions("1.14.1", "1.14.1-gtd-guard"), UNORDERABLE, "none vs suffix");
eq(
  compareVersions("2.1.0", "qnfo-qwav/fabric-20260910"),
  UNORDERABLE,
  "semver vs opaque non-semver label",
);
eq(
  compareVersions("qnfo-scorecard/1.0.0", "1.0.0"),
  UNORDERABLE,
  "namespaced label has no numeric core",
);
eq(compareVersions("", "1.0.0"), UNORDERABLE, "empty string fail-closed");
eq(compareVersions(null, "1.0.0"), UNORDERABLE, "null fail-closed");
eq(compareVersions("1.0.0", undefined), UNORDERABLE, "undefined fail-closed");

// --- deployDecision: never downgrade, never act on UNORDERABLE ----------
eq(deployDecision("1.0.0", "1.1.0"), ACT, "genuine upgrade acts");
eq(deployDecision("1.0.0", "1.0.0"), NO_ACT, "equal no-act");
eq(deployDecision("1.1.0", "1.0.0"), NO_ACT, "deployed ahead no-act");
eq(deployDecision("v1.1.0", "1.0.0"), NO_ACT, "the personal-companion downgrade");
eq(deployDecision("v2.0.0", "1.9.9"), NO_ACT, "a v-prefixed genuine downgrade");
eq(deployDecision("3.6.1-subscribers", "3.6.1"), NO_ACT, "unorderable no-act");
eq(deployDecision("2.1.0", "qnfo-qwav/fabric-20260910"), NO_ACT, "opaque label no-act");

console.log(`version-compare: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
