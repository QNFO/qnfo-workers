#!/usr/bin/env node
// WEBMCP-FLEET-1 applier (2026-10-25).
//
// WHAT. Inlines _shared/webmcp.js (the canonical block: bridge, tool packs, manifest, routes, HTML injection) into
// every worker that serves HTML, and attaches it to the worker's default export. Idempotent: a second run replaces the
// block in place instead of stacking copies, so `git diff` after a re-run is empty.
//
// WHY inline and not `import`. The canonical deploy fetches the worker file from GitHub and PUTs those exact bytes as
// `application/javascript+module`; no bundler resolves a relative import at that point, so an imported module would ship
// as a broken reference and the worker would fail to load. One generated copy per worker, from one source file, checked
// by scripts/webmcp-verify.mjs, is the shape this deploy path can actually carry.
//
// USAGE.  node scripts/webmcp-apply.mjs            # apply to every target, report
//         node scripts/webmcp-apply.mjs --check    # exit 1 when any target is out of date (CI gate)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "_shared", "webmcp.js");
const BEGIN = "// ---- WEBMCP-FLEET-1:BEGIN";
const END = "// ---- WEBMCP-FLEET-1:END ----";
const ATTACH_MARK = "// ---- WEBMCP-FLEET-1:ATTACH ";
const NL = String.fromCharCode(10);

// Every worker that answers a browser with HTML. API-only workers are deliberately absent: a tool surface on an
// endpoint nobody renders is a claim without a page.
export const TARGETS = [
  "qnfo-gateway",
  "qnfo-fleet-dashboard",
  "idea-hub",
  "q08-signal-engine",
  "q08-mind",
  "qnfo-ai-search",
  "qnfo-ipatent",
  "qnfo-lifecycle",
  "personal-companion"
];

function stripAttach(src) {
  let i = src.indexOf(ATTACH_MARK);
  while (i >= 0) {
    const call = src.indexOf("wmAttach(", i);
    const nl = call < 0 ? -1 : src.indexOf(NL, call);
    src = src.slice(0, i) + (nl < 0 ? "" : src.slice(nl + 1));
    i = src.indexOf(ATTACH_MARK);
  }
  return src;
}

function stripBlock(src) {
  const i = src.indexOf(BEGIN);
  if (i < 0) return src;
  const j = src.indexOf(END, i);
  if (j < 0) throw new Error("WEBMCP block BEGIN without END");
  return stripAttach(src.slice(0, i) + src.slice(j + END.length));
}

// Shapes seen in this repo: `export { x as default };` (most workers, sometimes among several exports) and
// `export default {...}` (idea-hub, q08-signal-engine, q08-mind, qnfo-email). The second shape is normalised to a named
// binding so the object can be mutated after declaration, which is how wmAttach installs without editing one line
// inside fetch().
function defaultBinding(src) {
  const named = src.match(/export\s*\{[^}]*?([A-Za-z_$][\w$]*)\s+as\s+default/);
  if (!named && /export\s+default\s+__wm_default/.test(src)) return { src, name: "__wm_default", rewritten: false };
  if (named) return { src, name: named[1], rewritten: false };
  const inline = src.match(/export\s+default\s*\{/);
  if (inline) {
    const at = inline.index;
    const head = src.slice(0, at) + "var __wm_default = {";
    return { src: head + src.slice(at + inline[0].length), name: "__wm_default", rewritten: true };
  }
  return { src, name: null, rewritten: false };
}

function applyOne(worker, block, { check }) {
  const file = join(ROOT, worker, "worker.js");
  if (!existsSync(file)) return { worker, status: "missing" };
  const orig = readFileSync(file, "utf8");
  if (!orig.includes("async fetch")) return { worker, status: "no-fetch" };
  let src = stripBlock(orig);
  const binding = defaultBinding(src);
  if (!binding.name) return { worker, status: "no-default-export" };
  src = binding.src;
  if (binding.rewritten && !/export\s+default\s+__wm_default/.test(src)) {
    src = src.replace(/\s*$/, NL) + "export default __wm_default;" + NL;
  }
  const tail =
    NL + block.trimEnd() + NL +
    "// ---- WEBMCP-FLEET-1:ATTACH " + worker + " ----" + NL +
    "wmAttach(" + binding.name + ', "' + worker + '");' + NL;
  const out = src.replace(/\s*$/, NL) + tail;
  if (out === orig) return { worker, status: "unchanged", bytes: orig.length };
  if (check) return { worker, status: "stale", bytes: orig.length };
  writeFileSync(file, out, "utf8");
  return { worker, status: "written", before: orig.length, after: out.length, binding: binding.name };
}

// Only run the applier when executed directly: importing it for TARGETS (webmcp-smoke.mjs, webmcp-verify.mjs) must not
// rewrite ten worker files as a side effect.
const direct = !!process.argv[1] && process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/webmcp-apply.mjs");
const check = direct && process.argv.includes("--check");
if (!direct) { /* imported: exports only */ }
else {
const block = readFileSync(SRC, "utf8").trimEnd();
const rows = TARGETS.map((w) => applyOne(w, block, { check }));
for (const r of rows) console.log(JSON.stringify(r));
const bad = rows.filter((r) => ["stale", "missing", "no-default-export", "no-fetch"].includes(r.status));
console.log(JSON.stringify({ targets: TARGETS.length, changed: rows.filter((r) => r.status === "written").length, problems: bad.length }));
if (check && bad.length) process.exit(1);
}
