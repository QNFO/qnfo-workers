// LAND-BUNDLE-GUARD-1: landFix never commits a wrangler bundle of a worker over its hand-written source on main.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- LAND-BUNDLE-GUARD-1:BEGIN"), src.indexOf("// ---- LAND-BUNDLE-GUARD-1:END"));
const sandbox = { __name: (f) => f };
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { landBundleRefusal, landHelperLayers, landCommentLines };", sandbox);
const { landBundleRefusal, landHelperLayers, landCommentLines } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const helpers = (n) => Array.from({ length: n }, (_, i) => "var __name" + "2".repeat(i) + " = (t, v) => t;").join("\n");
const comments = (n) => Array.from({ length: n }, (_, i) => "// note " + i).join("\n");
const body = 'var VERSION = "1.2.3";\nexport default { fetch() { return new Response("ok"); } };';
const source = helpers(5) + "\n" + comments(600) + "\n" + body;

check(landHelperLayers(source) === 5 && landCommentLines(source) === 600, "counts helper layers and comment lines");
// the 2026-10-04 case: wrangler wrapped the source in one more __name layer and kept 55 of 671 comment lines
check(/helper layers \(6 vs 5/.test(landBundleRefusal(helpers(6) + "\n" + comments(55) + "\n" + body, source) || ""), "a re-bundled script (one more __name layer) is refused");
check(/keeps 55 of the 600 comment lines/.test(landBundleRefusal(helpers(5) + "\n" + comments(55) + "\n" + body, source) || ""), "a script that drops most comments is refused");
check(landBundleRefusal(source.replace('"1.2.3"', '"1.2.4"') + "\n// fix", source) === null, "a real source edit (same helpers, comments kept) may land");
check(landBundleRefusal(helpers(1) + "\n" + body, helpers(1) + "\n" + comments(5) + "\n" + body) === null, "a short, nearly comment-free source is not judged on comments");
check(landBundleRefusal(helpers(6) + "\n" + body, null) === null, "with no file on main there is nothing to protect");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
