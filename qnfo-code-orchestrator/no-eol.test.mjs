// CODE-LOOP-NO-EOL-1 offline test: hunk patches for files with and without a final newline apply with `git apply` and
// reproduce the proposed file byte for byte, and stay small. 49 of 93 worker.js files lack a final newline; before 0.3.2
// every patch to them was a whole-file rewrite (379k chars for a 3-line q08 edit), over code-task-publish's 200k cap.
// Run: node --no-warnings qnfo-code-orchestrator/no-eol.test.mjs   (exit 0 = all passed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "noeol-"));
// hunkPatch is internal to the worker; load a copy that also exports it.
const src = fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { hunkPatch as __hunkPatch };\n";
fs.writeFileSync(path.join(tmp, "w.mjs"), src);
const { __hunkPatch: hunkPatch } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const sh = (cwd, ...a) => spawnSync(a[0], a.slice(1), { cwd, encoding: "utf8" });

function roundTrip(name, base, next) {
  const dir = fs.mkdtempSync(path.join(tmp, "r-"));
  sh(dir, "git", "init", "-q");
  fs.mkdirSync(path.join(dir, "w"));
  fs.writeFileSync(path.join(dir, "w/worker.js"), base);
  const patch = hunkPatch("w/worker.js", base, next);
  fs.writeFileSync(path.join(dir, "p.patch"), patch);
  const r = sh(dir, "git", "apply", "p.patch");
  const out = fs.readFileSync(path.join(dir, "w/worker.js"), "utf8");
  ok(r.status === 0, name + ": git apply accepts the patch", r.stderr);
  ok(out === next, name + ": the result is the proposed file byte for byte", { out: out.slice(-80), next: next.slice(-80) });
  return patch;
}

const big = Array.from({ length: 3000 }, (_, i) => "line " + i + " " + "x".repeat(40)).join("\n");
// 1. middle edit, no final newline: small hunk, not a whole-file rewrite
let p = roundTrip("no-EOL middle edit", big, big.replace("line 1500 ", "line 1500 EDITED "));
ok(p.length < 2000 && !/^@@ -1,3000/m.test(p), "no-EOL middle edit: the patch is a small hunk (" + p.length + " chars)");
// 2. edit of the last line, no final newline
p = roundTrip("no-EOL last-line edit", big, big.replace(/line 2999 x+$/, "line 2999 changed"));
ok(/\\ No newline at end of file\n/.test(p) && p.length < 2000, "no-EOL last-line edit: git's marker, small patch");
// 3. append after the last line, no final newline
p = roundTrip("no-EOL append", big, big + "\nappended line");
ok(p.length < 2000, "no-EOL append: small patch");
// 4. edit near the end with the last line as context
p = roundTrip("no-EOL edit near end", big, big.replace("line 2998 ", "line 2998 near-end "));
// 5. files that do end with a newline behave as before
roundTrip("EOL middle edit", big + "\n", (big + "\n").replace("line 10 ", "line 10 EDITED "));
roundTrip("EOL last-line edit", big + "\n", big.replace(/line 2999 x+$/, "line 2999 changed") + "\n");
// 6. a change of the final-newline state falls back to the whole-file patch, which still applies
roundTrip("EOL state change", big, big + "\n");
// 7. the real failure: a 1228-line worker without a final newline, 2 small edits plus the mirror
const q08 = fs.readFileSync(path.join(here, "..", "q08-signal-engine", "worker.js"), "utf8");
if (!q08.endsWith("\n")) {
  const next = q08.replace("var fb = '<div class=\"fb\">", "var fb = '<div class=\"fb\" data-t=\"1\">");
  p = roundTrip("q08 worker.js (no final newline)", q08, next);
  ok(p.length < 5000, "q08 worker.js: patch is " + p.length + " chars (was ~379k as a whole-file patch)");
}
// 8. randomized round trips (seeded): inserts, deletes and edits anywhere, with and without a final newline
{
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let bad = 0;
  for (let k = 0; k < 120; k++) {
    const n = 1 + rnd(40);
    const lines = Array.from({ length: n }, (_, i) => "l" + i + "-" + rnd(5));
    const eol = rnd(2) === 1;
    const base = lines.join("\n") + (eol ? "\n" : "");
    const nx = lines.slice();
    for (let e = 0, m = 1 + rnd(4); e < m; e++) {
      const at = rnd(nx.length + 1), op = rnd(3);
      if (op === 0) nx.splice(at, 0, "new" + k + "-" + e);
      else if (op === 1 && nx.length > 1) nx.splice(Math.min(at, nx.length - 1), 1);
      else nx[Math.min(at, nx.length - 1)] = "chg" + k + "-" + e;
    }
    const next = nx.join("\n") + (eol ? "\n" : "");
    if (next === base) continue;
    const before = fail;
    roundTrip("fuzz " + k + (eol ? " eol" : " no-eol"), base, next);
    if (fail > before) bad++;
  }
  ok(bad === 0, "120 seeded random edits round-trip through git apply (" + bad + " failed)");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
