#!/usr/bin/env node
// VOICE-INPUT-1 applier (2026-11-09). Inlines _shared/voice.js into every worker that serves a page with a free-text field and
// attaches it to the default export, the same way scripts/webmcp-apply.mjs does (the canonical deploy ships one file, no imports).
// USAGE.  node scripts/voice-apply.mjs           # apply, idempotent
//         node scripts/voice-apply.mjs --check   # exit 1 when a target is stale (CI gate)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "_shared", "voice.js");
const BEGIN = "// ---- VOICE-INPUT-1:BEGIN";
const END = "// ---- VOICE-INPUT-1:END ----";
const ATTACH_MARK = "// ---- VOICE-INPUT-1:ATTACH ";
const NL = String.fromCharCode(10);

// Every worker whose pages hold a textarea or a text input a person types a command, question or note into.
export const TARGETS = [
  "qnfo-fleet-dashboard", "personal-api", "personal-companion", "qnfo-jobsearch", "qnfo-gateway",
  "qnfo-ai-search", "qnfo-ipatent", "idea-hub", "q08-signal-engine", "qnfo-lifecycle"
];

function stripAttach(src) {
  let i = src.indexOf(ATTACH_MARK);
  while (i >= 0) {
    const call = src.indexOf("vxAttach(", i);
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
  if (j < 0) throw new Error("VOICE block BEGIN without END");
  return stripAttach(src.slice(0, i) + src.slice(j + END.length));
}
function defaultBinding(src) {
  const named = src.match(/export\s*\{[^}]*?([A-Za-z_$][\w$]*)\s+as\s+default/);
  if (named) return named[1];
  const plain = src.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/);
  return plain ? plain[1] : null;
}
function applyOne(worker, block, check) {
  const file = join(ROOT, worker, "worker.js");
  if (!existsSync(file)) return { worker, status: "missing" };
  const orig = readFileSync(file, "utf8");
  const src = stripBlock(orig);
  const name = defaultBinding(src);
  if (!name) return { worker, status: "no-default-export" };
  const out = src.replace(/\s*$/, NL) + NL + block.trimEnd() + NL + ATTACH_MARK + worker + " ----" + NL + "vxAttach(" + name + ', "' + worker + '");' + NL;
  if (out === orig) return { worker, status: "unchanged" };
  if (check) return { worker, status: "stale" };
  writeFileSync(file, out, "utf8");
  return { worker, status: "written", binding: name };
}
const direct = !!process.argv[1] && process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/voice-apply.mjs");
if (direct) {
  const check = process.argv.includes("--check");
  const block = readFileSync(SRC, "utf8").trimEnd();
  const rows = TARGETS.map((w) => applyOne(w, block, check));
  for (const r of rows) console.log(JSON.stringify(r));
  const bad = rows.filter((r) => ["stale", "missing", "no-default-export"].includes(r.status));
  console.log(JSON.stringify({ targets: TARGETS.length, problems: bad.length }));
  if (bad.length) process.exit(1);
}
