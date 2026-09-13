// PATCH-2026-09-13 — version comparison + downgrade guard for qnfo-fleet-deploy
//
// DEFECTS FIXED (both root-caused from live evidence 2026-09-13)
//
//  B2  newer() mis-parses suffixed / path-style version strings.
//      `num(s)` does `s.split("-")[0]` then a numeric compare, falling through to
//      `return a > b`. Consequences, both observed in fleet_drift_report:
//        - newer("0.5.3-failclosed","0.5.3") === true
//          -> false "deployed-ahead" -> heal is SKIPPED forever.
//          (fleet_drift_report: deployed-ahead = 518)
//        - newer("qnfo-email/fabric-20260910","0.3.4-glm53") === false
//          -> classified "behind" -> would OVERWRITE a fabric build with an
//             older semver canonical.
//          (fleet_drift_report: canonical-ahead = 974)
//      Every scan reports healed=0.
//
//  B3  redeploy() computes `direction` and DISCARDS it.
//      Any mis-parse therefore deploys a downgrade. Evidence: fleet_deploys
//      ids 68-74 — personal-companion, EVERY HOUR since 08:01, ok=0,
//      HTTP 400 `10021 Workflow GenerationFlow must be exported or a
//      script_name must be specified`, attempting v1.1.0 -> 1.0.0.
//
// FIX
//  1. Replace newer() with cmpV() (tri-state: 1 / 0 / -1 / null) + thin newer() wrapper.
//     - Only strings that BEGIN with optional `v` then digits are treated as semver.
//     - Fabric tags / path-style / missing versions -> null (INCOMPARABLE).
//     - Build suffixes (-glm53, +cors-fixed, -failclosed) ignored -> 0 (NOT drift).
//  2. scan(): use cmpV(); incomparable is reported, counted, and NEVER healed.
//  3. redeploy(env, worker, force): refuse `incomparable` and refuse `downgrade`
//     unless force=true. /redeploy route passes body.force.
//
// IDEMPOTENT: safe to run twice; aborts if an anchor is missing (source drifted).
// SCOPE: repo only. qnfo-fleet-deploy has NO_SELF and cannot redeploy itself —
//        run this from a host or qnfo-fleet-control, then deploy via the normal path.
//
// usage: node PATCH-2026-09-13-version-cmp-and-downgrade-guard.mjs worker.js
import { readFileSync, writeFileSync } from "node:fs";

const F = process.argv[2] || "worker.js";
let src = readFileSync(F, "utf8");
const orig = src;

const NEWER_OLD = `function newer(a, b) {
  a = String(a || ""); b = String(b || "");
  function num(s) { var m = s.split("-")[0]; var p = m.split("."); var n = []; for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); } return n; }
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y; }
  return a > b;
}`;

const NEWER_NEW = `function cmpV(a, b) {
  a = String(a == null ? "" : a); b = String(b == null ? "" : b);
  function norm(s) {
    var m = String(s).trim().match(/^v?(\\d+(?:\\.\\d+)*)/);
    if (!m) return null;
    var p = m[1].split("."), n = [];
    for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); }
    return n;
  }
  var ap = norm(a), bp = norm(b);
  if (!ap || !bp) return null;
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
function newer(a, b) { return cmpV(a, b) === 1; }`;

const OUT_OLD = `var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`;
const OUT_NEW = `var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, incomparable: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`;

const SCAN_OLD = `      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      if (newer(depV, canV)) {
        out.ahead++;`;
const SCAN_NEW = `      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      var cmp = cmpV(depV, canV);
      if (cmp === 0) { await clearScanErr(env, n); out.clean++; continue; }
      if (cmp === null) {
        out.incomparable = (out.incomparable || 0) + 1;
        out.errKinds["version-incomparable"] = (out.errKinds["version-incomparable"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":incomparable " + depV + " ? " + canV);
        await report(env, n, depV, canV, c.path, "version-incomparable");
        continue;
      }
      if (cmp === 1) {
        out.ahead++;`;

const SIG_OLD = `async function redeploy(env, worker) {`;
const SIG_NEW = `async function redeploy(env, worker, force) {`;

const DIR_OLD = `  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";`;
const DIR_NEW = `  var cmpDir = cmpV(depV || "", canV);
  var direction = cmpDir === null ? "incomparable" : (cmpDir === 1 ? "downgrade" : "upgrade");
  if (cmpDir === null) {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused: incomparable version vocabularies");
    return { ok: false, status: 409, note: "refused: incomparable version vocabularies (" + (depV || "?") + " vs " + canV + ")", direction: direction };
  }
  if (direction === "downgrade" && !force) {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused: downgrade");
    return { ok: false, status: 409, note: "refused: downgrade " + depV + " -> " + canV + " (pass force=true to override)", direction: direction };
  }`;

const ROUTE_OLD = `      var res = await redeploy(env, String(w));`;
const ROUTE_NEW = `      var res = await redeploy(env, String(w), !!body.force);`;

const edits = [
  ["newer->cmpV", NEWER_OLD, NEWER_NEW],
  ["scan-out-init", OUT_OLD, OUT_NEW],
  ["scan-comparison", SCAN_OLD, SCAN_NEW],
  ["redeploy-signature", SIG_OLD, SIG_NEW],
  ["direction-guard", DIR_OLD, DIR_NEW],
  ["redeploy-route", ROUTE_OLD, ROUTE_NEW],
];

let applied = 0, skipped = 0, missing = 0;
for (const [name, oldB, newB] of edits) {
  if (src.includes(newB)) { console.log("skip (already applied): " + name); skipped++; continue; }
  if (!src.includes(oldB)) { console.error("MISSING ANCHOR: " + name); missing++; continue; }
  src = src.replace(oldB, newB);
  applied++;
  console.log("applied: " + name);
}

if (missing) {
  console.error("aborting: " + missing + " anchor(s) not found — source drifted, review manually");
  process.exit(2);
}
if (src !== orig) {
  writeFileSync(F, src);
  console.log("wrote " + F + ": " + orig.length + " -> " + src.length + " bytes (applied=" + applied + " skipped=" + skipped + ")");
} else {
  console.log("no change (applied=0 skipped=" + skipped + ")");
}
