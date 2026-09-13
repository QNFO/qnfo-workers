// qnfo-fleet-control/version-compare.mjs
//
// Corrected version comparison + worker-scoped VERSION extraction for the fleet
// deploy scan / heal / redeploy path.
//
// WHY THIS EXISTS (all evidence live, read 2026-09-13)
// ---------------------------------------------------
// The running control plane reports, hourly:
//   fleet_drift_report  personal-companion deployed=v1.1.0 canonical=1.0.0 note=canonical-ahead
//   fleet_deploys       personal-companion v1.1.0 -> 1.0.0 ok=0
//                       HTTP 400 code 10021 "Workflow GenerationFlow must be exported
//                       or a script_name must be specified"
//   ... 7 consecutive hourly attempts, all ok=0:
//       07:01:43, 08:01:23, 09:01:23, 10:01:24, 11:01:23, 12:01:24, 13:01:23
//
// A leading "v" makes parseInt("v1") NaN -> 0, so "v1.1.0" parses as [0,1,0] and is
// classified LOWER than "1.0.0" = [1,0,0]. The running worker is therefore labelled
// canonical-ahead and redeployed against its will, hourly, forever.
//
// The same class is confirmed by three independent live readings of ONE worker:
//   qnfo-fleet-control   registry=0.4.11   drift.deployed=0.3.4   drift.canonical=0.3.3
// and drift.canonical 0.3.3 is provably a SUB-MODULE's version constant. Source read
// (QNFO/qnfo-workers qnfo-fleet-control/worker.js, 75,875 B, sha d9d438f0):
//   module 1: var VERSION = "0.3.3"; var WORKER = "qnfo-fleet-advisor";
//   module 2: var VERSION = "1.0.0"; var WORKER = "qnfo-fleet-calibrator";
// A merged bundle has N VERSION constants. Taking the FIRST yields a sub-module's.
//
// RULE (fail-closed)
// ------------------
//   1. strip one leading "v" (case-insensitive)
//   2. parse the numeric core; compare cores positionally
//   3. cores differ                -> order by core
//   4. cores equal, suffix equal   -> equal
//   5. cores equal, suffix DIFFERS -> UNORDERABLE; caller must NOT redeploy
//   6. unparseable (build tag)     -> UNORDERABLE; caller must NOT redeploy
//
// Rule 5 is load-bearing and non-obvious. A naive semver rule (release > prerelease)
// would order "3.6.1" ABOVE "3.6.1-subscribers" and DOWNGRADE the live gateway
// (fleet_status qnfo-gateway=3.6.1-subscribers, registry=3.6.1), and would order
// "1.14.1" above "1.14.1-gtd-guard" and strip the cloud-ops guard. The suffix is a
// build/feature label, not a prerelease marker; its direction is undefined, so the
// only safe answer is "cannot decide, do not act".
//
// Verified: 20/20 assertions pass (see version-compare.test.mjs).

export const UNORDERABLE = Symbol('UNORDERABLE');

/**
 * Parse a version string into a comparable shape.
 * @param {unknown} v
 * @returns {{core:number[], suffix:string|null}|null} null when unparseable
 */
export function parseVersion(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^v?(\d+(?:\.\d+)*)(?:[-+]([0-9A-Za-z._-]+))?$/);
  if (!m) return null;
  return { core: m[1].split('.').map(Number), suffix: m[2] || null };
}

/**
 * Compare two version strings.
 * @returns {1|-1|0|typeof UNORDERABLE} 1 if a>b, -1 if a<b, 0 if equal
 */
export function compareVersions(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  if (!A || !B) return UNORDERABLE;
  const n = Math.max(A.core.length, B.core.length);
  for (let i = 0; i < n; i++) {
    const x = A.core[i] || 0;
    const y = B.core[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (A.suffix === B.suffix) return 0;
  return UNORDERABLE; // same core, different label -> no defined direction
}

/**
 * Decide whether the canonical artifact should replace the deployed one.
 * 'blocked' means: do not act, and surface the pair for human review.
 * @returns {'redeploy'|'no-act'|'blocked'}
 */
export function deployDecision(deployed, canonical) {
  const c = compareVersions(canonical, deployed);
  if (c === UNORDERABLE) return 'blocked';
  return c > 0 ? 'redeploy' : 'no-act';
}

/**
 * Extract the VERSION that belongs to `workerName` from a (possibly merged) bundle.
 *
 * Pairs each `var WORKER=` with the NEAREST PRECEDING `var VERSION=`, rejecting the
 * pair when another WORKER declaration sits between them. Returns null whenever it
 * cannot decide with certainty, so the caller fails closed instead of acting on a
 * sub-module's version.
 *
 * NOTE: an earlier draft of this function scanned a +/-4000-char window around each
 * WORKER and took the FIRST VERSION in that window. It returned "0.3.3" (the advisor
 * module's version) for "qnfo-fleet-calibrator", reproducing the exact live defect it
 * was written to fix. It failed its own test and was replaced by the proximity rule.
 *
 * @param {string} source bundle text
 * @param {string} workerName the worker whose version we want
 * @returns {string|null} null = undecidable (caller must fail closed)
 */
export function extractWorkerVersion(source, workerName) {
  if (typeof source !== 'string' || !workerName) return null;

  const versions = [];
  const workers = [];
  let m;

  const reV = /var\s+VERSION\s*=\s*["']([^"']+)["']/g;
  while ((m = reV.exec(source)) !== null) versions.push({ i: m.index, v: m[1] });

  const reW = /var\s+WORKER\s*=\s*["']([^"']+)["']/g;
  while ((m = reW.exec(source)) !== null) workers.push({ i: m.index, w: m[1] });

  const out = {};
  for (const W of workers) {
    let best = null;
    for (const V of versions) {
      if (V.i < W.i && (!best || V.i > best.i)) best = V;
    }
    if (!best) continue;
    // another WORKER declaration between the VERSION and this WORKER -> not our pair
    if (workers.some((o) => o !== W && o.i > best.i && o.i < W.i)) continue;
    if (out[W.w] !== undefined) {
      out[W.w] = null; // duplicate/ambiguous worker name -> fail closed
      continue;
    }
    out[W.w] = best.v;
  }

  return out[workerName] === undefined ? null : out[workerName];
}
