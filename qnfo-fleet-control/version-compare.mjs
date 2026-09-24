// qnfo-fleet-control/version-compare.mjs
// =====================================================================
// Fail-closed version comparator for the fleet deploy control plane.
//
// ORIGIN (2026-09-13 fleet error audit)
//   1. The live deploy control plane issued an hourly redeploy of a
//      HEALTHY worker against a LOWER version:
//        fleet_drift_report  personal-companion  deployed=v1.1.0 canonical=1.0.0
//        fleet_deploys       personal-companion  v1.1.0 -> 1.0.0  ok=0  (x30)
//   1.1 ROOT CAUSE. A leading "v" made parseInt("v1") -> NaN -> 0, so
//       "v1.1.0" parsed as [0,1,0] and was judged BEHIND "1.0.0" = [1,0,0].
//       Production was independently confirmed healthy at v1.1.0
//       (https://reading.q08.org/health).
//
// CONTRACT
//   compareVersions(a, b) -> -1 | 0 | 1 | UNORDERABLE
//   deployDecision(deployed, canonical) -> "deploy" | "no-act"
//
// INVARIANT (rule 5, load-bearing). Equal numeric cores with DIFFERING
//   suffixes are UNORDERABLE, never ordered. The suffix is a build/feature
//   label with no defined direction, so "do not act" is the only safe answer.
//     - a naive semver rule would order "3.6.1" ABOVE "3.6.1-subscribers"
//       and downgrade the live gateway
//       (fleet_status=3.6.1-subscribers, registry=3.6.1);
//     - it would order "1.14.1" ABOVE "1.14.1-gtd-guard" and strip the
//       cloud-ops guard.
//
// INVARIANT (fail-closed). A value that does not parse as a semver-shaped
//   version (e.g. a fabric tag "qnfo-qwav/fabric-20260910") is UNORDERABLE
//   against everything, so the deployer performs no action.
// =====================================================================

/** Sentinel returned when two versions must not be ordered. */
export const UNORDERABLE = "UNORDERABLE";

/**
 * parseVersion(raw) -> { core: number[], suffix: string|null } | null
 * PRECONDITION:  raw is any value.
 * POSTCONDITION: returns a parsed shape for semver-shaped input
 *                (leading "v" tolerated), else null (unparsable).
 */
export function parseVersion(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  // A single leading "v"/"V" is a tag prefix, not a numeric component.
  s = s.replace(/^[vV]/, "");
  // semver-shaped:  <digits(.digits)*> [-<suffix>] [+<build>]
  const m = s.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z._-]+))?(?:\+([0-9A-Za-z._-]+))?$/);
  if (!m) return null;
  const core = m[1].split(".").map((n) => parseInt(n, 10));
  const suffix = m[2] != null ? m[2] : null;
  return { core, suffix, raw };
}

/** compareCore(a[], b[]) -> -1 | 0 | 1  (element-wise, right-padded with 0) */
function compareCore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * compareVersions(a, b) -> -1 | 0 | 1 | UNORDERABLE
 *   -1 : a is BEHIND b
 *    0 : a and b are the same version
 *    1 : a is AHEAD of b
 *    UNORDERABLE : a and b must not be ordered (rule 5 / fail-closed)
 */
export function compareVersions(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  // Fail-closed: anything we cannot parse we will not order.
  if (!A || !B) return UNORDERABLE;
  const c = compareCore(A.core, B.core);
  if (c !== 0) return c < 0 ? -1 : 1;
  // Equal numeric cores: identical suffix => equal; differing suffix => unorderable.
  if (A.suffix === B.suffix) return 0;
  return UNORDERABLE;
}

/**
 * deployDecision(deployed, canonical) -> "deploy" | "no-act"
 * Acts ONLY when `deployed` is strictly BEHIND `canonical`.
 * UNORDERABLE and equal/ahead both map to "no-act" (fail-closed).
 */
export function deployDecision(deployed, canonical) {
  const c = compareVersions(deployed, canonical);
  if (c === UNORDERABLE) return "no-act";
  return c < 0 ? "deploy" : "no-act";
}

export default { UNORDERABLE, parseVersion, compareVersions, deployDecision };
