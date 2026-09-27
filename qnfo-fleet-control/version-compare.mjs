/**
 * version-compare.mjs -- QNFO fleet version comparator (FAIL-CLOSED).
 *
 * Origin: 2026-09-13 fleet error audit. qnfo-fleet-control was issuing an hourly
 * redeploy of a HEALTHY worker against a LOWER version:
 *     fleet_drift_report  personal-companion  deployed=v1.1.0 canonical=1.0.0
 *     fleet_deploys       personal-companion  v1.1.0 -> 1.0.0  ok=0  (x30)
 * Cause: a leading "v" makes parseInt("v1") NaN -> 0, so "v1.1.0" parsed as
 * [0,1,0] and was judged behind "1.0.0" = [1,0,0]. Production was independently
 * confirmed healthy at v1.1.0.
 *
 * RULE 5 (load-bearing): equal numeric cores with DIFFERING suffixes are
 * UNORDERABLE, not ordered. A naive semver rule (release > prerelease) would
 * order "3.6.1" ABOVE "3.6.1-subscribers" and downgrade the live gateway
 * (fleet_status=3.6.1-subscribers, registry=3.6.1), and would order "1.14.1"
 * above "1.14.1-gtd-guard" and strip the cloud-ops guard. The suffix is a
 * build/feature label with NO defined direction, so "do not act" is the only
 * safe answer.
 *
 * Postcondition: deployDecision() returns NO_ACT for equal, newer, or
 * UNORDERABLE pairs; ACT only for a strictly newer canonical core.
 */

export const UNORDERABLE = "UNORDERABLE";
export const ACT = "deploy";
export const NO_ACT = "no-act";

/** Parse "<v?><dotted-numeric-core><suffix>"; null when there is no numeric core. */
function parse(v) {
  const raw = v === null || v === undefined ? "" : String(v).trim();
  if (!raw) return null;
  const s = raw.replace(/^[vV]/, "");
  const m = s.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) return null;
  const core = m[1].split(".").map((n) => parseInt(n, 10));
  const suffix = (m[2] || "").replace(/^[-+_.]+/, "");
  return { core, suffix };
}

function cmpCore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * PRECONDITION:  a, b are version strings (any shape).
 * POSTCONDITION: -1 | 0 | 1 when strictly orderable, else UNORDERABLE.
 *                UNORDERABLE whenever either side has no numeric core, or the
 *                numeric cores are EQUAL but the suffixes differ (rule 5).
 */
export function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return UNORDERABLE;
  const c = cmpCore(pa.core, pb.core);
  if (c !== 0) return c;
  if (pa.suffix === pb.suffix) return 0;
  return UNORDERABLE;
}

/**
 * PRECONDITION:  deployed, canonical are version strings.
 * POSTCONDITION: ACT only when canonical is STRICTLY newer.
 *                NO_ACT for equal, for deployed-ahead (never downgrade), and
 *                for every UNORDERABLE pair (fail closed).
 */
export function deployDecision(deployed, canonical) {
  const c = compareVersions(deployed, canonical);
  if (c === UNORDERABLE) return NO_ACT;
  return c < 0 ? ACT : NO_ACT;
}

export default { compareVersions, deployDecision, UNORDERABLE, ACT, NO_ACT };
