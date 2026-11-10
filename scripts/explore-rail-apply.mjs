#!/usr/bin/env node
// EXPLORE-RAIL-1 applier (2026-11-10). Inlines _shared/explore-rail.js into every worker that serves a public property's HTML and attaches it to the
// worker's default export, the same shape as scripts/webmcp-apply.mjs (the canonical deploy ships one file, so there is no import). Idempotent.
//   node scripts/explore-rail-apply.mjs            apply to every target
//   node scripts/explore-rail-apply.mjs --check    exit 1 when a target is stale (used by explore-rail.test.mjs)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "_shared", "explore-rail.js");
const BEGIN = "// ---- EXPLORE-RAIL-1:BEGIN";
const END = "// ---- EXPLORE-RAIL-1:END ----";
const ATTACH = "// ---- EXPLORE-RAIL-1:ATTACH ";
const NL = String.fromCharCode(10);
// A worker joins when a public property's pages come out of it. The block is gated by request host, so a worker that also serves a private host is not decorated there.
export const TARGETS = ["qnfo-gateway", "idea-hub", "qnfo-ai-search", "qnfo-ipatent", "qnfo-fleet-dashboard"];

export function strip(src) {
  const i = src.indexOf(BEGIN);
  if (i < 0) return src;
  const j = src.indexOf(END, i);
  if (j < 0) throw new Error("EXPLORE-RAIL block BEGIN without END");
  let out = src.slice(0, i) + src.slice(j + END.length);
  const a = out.indexOf(ATTACH);
  if (a >= 0) { const c = out.indexOf("erAttach(", a), nl = c < 0 ? -1 : out.indexOf(NL, c); out = out.slice(0, a) + (nl < 0 ? "" : out.slice(nl + 1)); }
  return out;
}
export function binding(src) {
  const named = src.match(/export\s*\{[^}]*?([A-Za-z_$][\w$]*)\s+as\s+default/);
  if (named) return named[1];
  if (/export\s+default\s+__wm_default/.test(src)) return "__wm_default";
  return null;
}
export function applyText(orig, worker, block) {
  const src = strip(orig);
  const name = binding(src);
  if (!name) return null;
  return src.replace(/\s*$/, NL) + NL + block.trimEnd() + NL + ATTACH + worker + " ----" + NL + "erAttach(" + name + ");" + NL;
}
const direct = !!process.argv[1] && process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/explore-rail-apply.mjs");
if (direct) {
  const check = process.argv.includes("--check");
  const block = readFileSync(SRC, "utf8").trimEnd();
  let bad = 0;
  for (const w of TARGETS) {
    for (const f of ["worker.js", "deployed-current.worker.js"]) {
      const file = join(ROOT, w, f);
      if (!existsSync(file)) { if (f === "worker.js") { console.log(JSON.stringify({ worker: w, status: "missing" })); bad++; } continue; }
      const orig = readFileSync(file, "utf8");
      const out = applyText(orig, w, block);
      if (!out) { console.log(JSON.stringify({ worker: w, file: f, status: "no-default-export" })); bad++; continue; }
      if (out === orig) { console.log(JSON.stringify({ worker: w, file: f, status: "unchanged" })); continue; }
      if (check) { console.log(JSON.stringify({ worker: w, file: f, status: "stale" })); bad++; continue; }
      writeFileSync(file, out, "utf8");
      console.log(JSON.stringify({ worker: w, file: f, status: "written", before: orig.length, after: out.length }));
    }
  }
  if (bad) process.exit(1);
}
