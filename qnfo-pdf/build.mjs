// qnfo-pdf/build.mjs — splice renderer.js into worker.js.
//
// The committed worker.js is an esbuild artifact: the KaTeX bundle, then the renderer inlined between
// the `// renderer.js` and `// worker.js` markers, then the worker logic. renderer.js is the source of
// truth for everything above the `// worker.js` marker; this script rewrites that region so the two can
// never drift. deployed-current.worker.js is the byte-identical mirror the drift guard compares against.
//
//   node build.mjs            # rewrite worker.js + deployed-current.worker.js
//   node build.mjs --check    # exit 1 when the inlined renderer is stale
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RENDERER_MARK = "// renderer.js";
const WORKER_MARK = "// worker.js";

function read(name) {
  return readFileSync(join(here, name), "utf8");
}

function rendererSource() {
  let src = read("renderer.js");
  // the bundle already holds the KaTeX module, and there is nothing to re-export from inside it
  src = src.replace(/^import\s+katex[^\n]*\n/m, "");
  src = src.replace(/\nexport\s*\{[\s\S]*?\};\s*$/, "\n");
  // `export const RENDERER_VERSION = …` would be legal in the ESM bundle but unparseable for the suite,
  // which evaluates this region with new Function(); drop the keyword so the copy is plain script code
  src = src.replace(/^export\s+(const|let|var|function|class)\s/gm, "$1 ");
  return src.replace(/^\s+/, "").replace(/\s+$/, "");
}

function splice(worker) {
  const a = worker.indexOf(RENDERER_MARK);
  const b = worker.indexOf(WORKER_MARK);
  if (a < 0 || b < 0 || b <= a) throw new Error("worker.js is missing the " + RENDERER_MARK + " / " + WORKER_MARK + " markers");
  const block = RENDERER_MARK + "\n" + rendererSource() + "\n\n";
  return worker.slice(0, a) + block + worker.slice(b);
}

const current = read("worker.js");
const next = splice(current);

if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("renderer.js is newer than the inlined copy in worker.js — run `node build.mjs`");
    process.exit(1);
  }
  console.log("worker.js renderer region is current");
  process.exit(0);
}

if (next !== current) {
  writeFileSync(join(here, "worker.js"), next);
  console.log("worker.js: renderer region rewritten (" + next.length + " bytes)");
} else {
  console.log("worker.js: renderer region already current");
}
writeFileSync(join(here, "deployed-current.worker.js"), read("worker.js"));
console.log("deployed-current.worker.js: mirror refreshed (" + read("worker.js").length + " bytes)");
