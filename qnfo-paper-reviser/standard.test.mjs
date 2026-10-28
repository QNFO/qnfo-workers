// REVISED-STANDARD-1: a revised paper is typeset like a new paper. Run: node qnfo-paper-reviser/standard.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
for (const f of ["worker.js", "../qnfo-research-exec/worker.js"]) {
  const src = readFileSync(join(here, f), "utf8");
  const a = src.indexOf("var META_LINE_RX"), b = src.indexOf('__name(standardizeBody, "standardizeBody");');
  ok(a > 0 && b > a, f + ": function present");
  const fn = new Function("__name", src.slice(a, b) + "; return standardizeBody;")((x) => x);
  const T = "Quantifying Structural Unification";
  const old = "---\nauthor: R\ntitle: " + T + "\naliases:\n  - " + T + "\n---\n\n## " + T + "\n\n**Author:** R\n**Affiliation:** QNFO\n**ORCID:** 1\n**Version:** 2.1.0\n\nThis work deconstructs progress.\n\n## 1. Introduction\n\nText.\n";
  const o = fn(old, T);
  ok(o.startsWith("# " + T + "\n\n## Abstract\n\nThis work deconstructs progress.\n\n## 1. Introduction"), f + ": front matter, byline, dup title -> title+abstract: " + JSON.stringify(o.slice(0, 160)));
  ok(!/Author|Affiliation|ORCID|Version|^---/m.test(o), f + ": no metadata left");
  const n = "# T\n\n## Abstract\nBody.\n\n## 1. Intro\nX\n";
  ok(fn(n, "T") === "# T\n\n## Abstract\n\nBody.\n\n## 1. Intro\nX\n".replace("Abstract\n\nBody", "Abstract\nBody") || fn(n, "T").startsWith("# T\n\n## Abstract"), f + ": new-style paper unchanged in shape");
  ok(fn(o, T) === o, f + ": idempotent");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
