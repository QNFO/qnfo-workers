// Inlines _shared/design-system.js into a worker between the DESIGN-SYSTEM-1 markers and mirrors the result to deployed-current.worker.js.
//
// Run: node _shared/inline-design-system.mjs <worker-dir> [--anchor "<line prefix to insert before>"] [--check]
//   --anchor  the first adoption only: the block is inserted before the first line of worker.js that starts with this text.
//             Once the markers exist the block is replaced in place and --anchor is ignored.
//   --check   writes nothing; exit code 1 when the worker (or its mirror) holds a stale or missing copy.
//
// The module is pure strings and pure functions, so the block is the file verbatim between the markers.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BEGIN = "// DESIGN-SYSTEM-1:BEGIN (sourced from _shared/design-system.js; applied by _shared/inline-design-system.mjs; do not edit inside a worker)";
export const END = "// DESIGN-SYSTEM-1:END";

const root = new URL("../", import.meta.url);

export function moduleSource() {
  return readFileSync(new URL("_shared/design-system.js", root), "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function block() {
  return BEGIN + "\n" + moduleSource() + END + "\n";
}

// Returns the worker text with the block in place; throws when the markers are broken or there is nowhere to insert it.
export function apply(text, anchor) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if ((a < 0) !== (b < 0) || (a >= 0 && b < a)) throw new Error("DESIGN-SYSTEM-1 markers are broken (one missing or out of order)");
  if (a >= 0) return text.slice(0, a) + block() + text.slice(b + END.length).replace(/^\n/, "");
  if (!anchor) throw new Error("no DESIGN-SYSTEM-1 block yet: pass --anchor \"<line prefix>\" to say where it goes");
  const at = text.split("\n").findIndex((l) => l.startsWith(anchor));
  if (at < 0) throw new Error("anchor not found: " + anchor);
  const lines = text.split("\n");
  return lines.slice(0, at).join("\n") + "\n" + block() + lines.slice(at).join("\n");
}

// The block as it stands in a worker's text, or "" when absent.
export function current(text) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  return a < 0 || b < 0 ? "" : text.slice(a, b + END.length) + "\n";
}

function main(argv) {
  const dir = argv.find((x, k) => !x.startsWith("--") && argv[k - 1] !== "--anchor");
  if (!dir) throw new Error("usage: node _shared/inline-design-system.mjs <worker-dir> [--anchor <text>] [--check]");
  const i = argv.indexOf("--anchor"), anchor = i >= 0 ? argv[i + 1] : "";
  const check = argv.includes("--check");
  const paths = ["worker.js", "deployed-current.worker.js"].map((f) => fileURLToPath(new URL(dir + "/" + f, root))).filter((p) => existsSync(p));
  if (!paths.length) throw new Error("no worker.js in " + dir);
  let stale = 0;
  for (const p of paths) {
    const before = readFileSync(p, "utf8");
    const after = apply(before, anchor);
    if (after === before) continue;
    if (check) { console.error("Stale DESIGN-SYSTEM-1 block in " + p + ": run node _shared/inline-design-system.mjs " + dir); stale++; }
    else { writeFileSync(p, after); console.log("inlined " + moduleSource().length + " bytes into " + p); }
  }
  if (stale) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
