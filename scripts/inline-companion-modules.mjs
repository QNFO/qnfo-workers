
import fs from "node:fs";
const dir = "personal-companion/";
const orig = process.argv[2];
let worker = fs.readFileSync(orig, "utf8");
function ns(name, file, prelude) {
  let t = fs.readFileSync(dir + file, "utf8");
  const names = [];
  t = t.replace(/^import \* as WB from "\.\/wellbeing\.js";[^\n]*$/m, "");
  t = t.replace(/^export (async function|function|const|let|var|class) ([A-Za-z_$][\w$]*)/gm, (m, kw, id) => { names.push(id); return kw + " " + id; });
  if (/^\s*(import|export)\b/m.test(t)) throw new Error("unhandled import/export in " + file);
  return "var " + name + " = (() => {\n" + (prelude||"") + t + "\nreturn Object.freeze({ " + names.join(", ") + " });\n})(); // end inline " + file + "\n";
}
const imp = /^import \* as WBW from "\.\/wellbeing-wire\.js";.*$/m;
if (!imp.test(worker)) throw new Error("WBW import line not found");
const block = "// SINGLE-MODULE-INLINE-1: wellbeing.js + wellbeing-wire.js inlined as namespaces by scripts/inline-companion-modules.mjs; the deploy uploads worker.js as ONE module (no relative imports allowed), and the source text below keeps its comments so the marker-based suites still find their anchors. Edit the sibling modules and re-run the script.\n" +
  ns("WBW", "wellbeing-wire.js", ns("WB", "wellbeing.js"));
worker = worker.replace(imp, () => block);
if (/^\s*import\s.*["']\.\.?\//m.test(worker)) throw new Error("relative import remains");
fs.writeFileSync(dir + "worker.js", worker);
console.log("ok", worker.length);

