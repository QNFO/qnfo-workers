// HARNESS-RELATIVE-IMPORT-1 (2026-10-17): the suites load worker.js by base64 data URL, and a data
// URL cannot resolve a relative specifier. personal-companion 1.29.0-wellbeing-loop imports
// "./wellbeing-wire.js", so all 30 suites died with ERR_UNSUPPORTED_RESOLVE_REQUEST while the live
// worker (bundled by the deploy) kept serving - the gate was red on a harness limitation, not on the
// feature. Materialise the (already transformed) source plus every sibling module it imports into a
// temp directory and import it from there, so relative imports resolve exactly as they do in the
// bundle. Each caller keeps its own source transformation and its own `src` string.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function importWorker(makeSource, baseUrl = new URL("./", import.meta.url)) {
  const baseDir = fileURLToPath(baseUrl);
  const src = String(makeSource());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qnfo-pc-"));
  // the temp copy is ESM: sibling .js modules must parse as modules too
  fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
  const need = new Set();
  // transitive: wellbeing-wire.js itself imports ./wellbeing.js, so follow the graph, not one level
  const queue = [src];
  while (queue.length) {
    const text = queue.shift();
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)) {
      const rel = m[1];
      if (need.has(rel)) continue;
      need.add(rel);
      const from = path.join(baseDir, rel);
      if (fs.existsSync(from)) queue.push(fs.readFileSync(from, 'utf8'));
    }
  }
  for (const rel of need) {
    const from = path.join(baseDir, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  const entry = path.join(dir, "worker-entry.mjs");
  fs.writeFileSync(entry, src);
  return import(pathToFileURL(entry).href + "?v=" + Math.random());
}
