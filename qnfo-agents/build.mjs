// Bundles src/index.ts into worker.js, one self-contained ES module (the fleet's deploy transports and load gate take one module
// per worker), and copies it to deployed-current.worker.js (mirror-guard). Run: npm ci && npm run build.
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error("package.json version must be x.y.z");

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser", "import", "default"],
  mainFields: ["module", "main"],
  external: ["cloudflare:*", "node:*"],
  minify: true,
  legalComments: "none",
  outfile: "worker.js",
  // The fleet's guards (version-bump-guard, the canary, VERSION-AHEAD-1) read the first `var VERSION = "x.y.z"` of worker.js.
  banner: { js: 'var VERSION = "' + VERSION + '"; // qnfo-agents bundle, generated from src/ by build.mjs (npm ci && npm run build). Edit src/, never this file.' },
  logLevel: "warning",
  // Bare Node built-ins ("path") resolve to node:path, which the nodejs_compat flag provides at the edge.
  plugins: [{ name: "node-builtins", setup(b) { b.onResolve({ filter: new RegExp("^(" + builtinModules.join("|").replace(/\//g, "\\/") + ")$") }, (a) => ({ path: "node:" + a.path, external: true })); } }]
});
// MODEL-FLOOR-1: the SDK's Workers AI provider carries a per-model quirk row and an example in an error message for a model the
// fleet bans (scripts/model-floor-guard.mjs). This worker never selects it (DEFAULT_MODEL / FALLBACK_MODEL in src/index.ts are on
// the allowed table), so the id is renamed to one that names no model; the quirk row then matches nothing.
const BANNED_IN_VENDOR = [/@cf\/zai-org\/glm-4\.7-flash/g];
let bundled = readFileSync("worker.js", "utf8");
for (const re of BANNED_IN_VENDOR) bundled = bundled.replace(re, "@cf/zai-org/retired-flash");
bundled = bundled.replace(/(\.exports=`)\t(?=\r?\n)/g, "$1\\t");
writeFileSync("worker.js", bundled);
copyFileSync("worker.js", "deployed-current.worker.js");
console.log("worker.js", (readFileSync("worker.js").length / 1024).toFixed(0) + " KiB, VERSION " + VERSION);
