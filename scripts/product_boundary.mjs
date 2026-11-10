// scripts/product_boundary.mjs: ULTRASTABLE-BOUNDARY-1 (2026-11-10, charter pillar autonomy).
// WHAT   Reads product/boundary.json, the split of this repository into the Ultrastable core (the self-governing development
//        platform), QNFO's applications that run on it (customer zero) and the owner's personal plane. Design and spin-off plan:
//        docs/PRODUCT-ULTRASTABLE.md. It fails when a live worker directory (worker.js, no RETIRED or FOLDED marker) is not
//        classified, when a classified worker no longer exists, when a class is unknown, or when a listed core script,
//        workflow or doc is missing. New code therefore lands on a known side of the split.
// USAGE  node scripts/product_boundary.mjs            # report and exit 1 on a violation
//        node scripts/product_boundary.mjs --json     # machine-readable report
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CLASSES = ["core", "app", "personal"];

export function liveWorkers(root) {
  return readdirSync(root).filter((d) => {
    const p = join(root, d);
    try { if (!statSync(p).isDirectory()) return false; } catch { return false; }
    if (d.startsWith(".") || d === "archive") return false;
    return existsSync(join(p, "worker.js")) && !existsSync(join(p, "RETIRED")) && !existsSync(join(p, "FOLDED"));
  }).sort();
}

export function checkBoundary(root, manifest) {
  const violations = [];
  const live = liveWorkers(root);
  const listed = manifest.workers || {};
  for (const w of live) if (!listed[w]) violations.push(`unclassified live worker: ${w} (add it to product/boundary.json as core, app or personal)`);
  for (const [w, v] of Object.entries(listed)) {
    if (!live.includes(w)) violations.push(`classified worker is not live: ${w} (remove it, or restore the worker)`);
    if (!CLASSES.includes(v.class)) violations.push(`unknown class for ${w}: ${v.class}`);
    if (!v.role) violations.push(`worker ${w} has no role`);
  }
  for (const f of [...(manifest.core_scripts || []), ...(manifest.core_workflows || []), manifest.doc].filter(Boolean)) {
    if (!existsSync(join(root, f))) violations.push(`listed path is missing: ${f}`);
  }
  const counts = Object.fromEntries(CLASSES.map((c) => [c, Object.values(listed).filter((v) => v.class === c).length]));
  const entangled = Object.entries(listed).filter(([, v]) => v.entangled).map(([w]) => w);
  return { ok: violations.length === 0, violations, counts, live: live.length, entangled };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(readFileSync(join(root, "product", "boundary.json"), "utf8"));
  const r = checkBoundary(root, manifest);
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${manifest.product} boundary: ${r.live} live workers; core ${r.counts.core}, app ${r.counts.app}, personal ${r.counts.personal}; entangled: ${r.entangled.join(", ") || "none"}`);
    for (const v of r.violations) console.log(`VIOLATION ${v}`);
  }
  process.exit(r.ok ? 0 : 1);
}
