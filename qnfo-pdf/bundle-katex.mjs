import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, "worker.js");
const mirrorPath = join(here, "deployed-current.worker.js");
const rendererPath = join(here, "renderer.js");
const marker = "\n// renderer.js\n";
const current = readFileSync(workerPath, "utf8");
const markerIndex = current.indexOf(marker);
const packageLock = JSON.parse(readFileSync(join(here, "package-lock.json"), "utf8"));
const katexVersion = packageLock.packages["node_modules/katex"]?.version;

if (!katexVersion) {
  throw new Error("package-lock.json is missing the locked KaTeX version");
}

if (markerIndex < 0) {
  throw new Error("worker.js is missing the // renderer.js marker");
}

function updateStylesheet(source, path) {
  const stylesheet = /https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[^/]+\/dist\/katex\.min\.css/g;
  const matches = [...source.matchAll(stylesheet)];
  if (matches.length !== 1) {
    throw new Error(`${path} must contain exactly one KaTeX stylesheet URL`);
  }
  return source.replace(stylesheet, `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist/katex.min.css`);
}

const renderer = readFileSync(rendererPath, "utf8");
const nextRenderer = updateStylesheet(renderer, "renderer.js");
const nextWorkerBody = updateStylesheet(current.slice(markerIndex + 1), "worker.js");

const result = await build({
  absWorkingDir: here,
  stdin: {
    contents: 'import katex from "katex";\nexport { katex as default };',
    resolveDir: here,
    sourcefile: "katex-bundle-entry.mjs",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});

const bundled = result.outputFiles[0].text;
const exportFooter = "\nexport {\n  katex as default\n};\n";
if (!bundled.endsWith(exportFooter)) {
  throw new Error("esbuild output did not end with the expected KaTeX export");
}

const workerHelpers = bundled.includes("var __name =")
  ? ""
  : 'var __defProp = Object.defineProperty;\nvar __name = (target, value) => __defProp(target, "name", { value, configurable: true });\n';
const katexBundle = workerHelpers + bundled.slice(0, -exportFooter.length).trimEnd();
const next = `${katexBundle}\n${nextWorkerBody}`;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  if (renderer !== nextRenderer) {
    throw new Error("renderer.js has a stale KaTeX stylesheet URL; run `npm run bundle:katex`");
  }
  if (current.slice(0, markerIndex).trimEnd() !== katexBundle) {
    throw new Error("worker.js has a stale KaTeX bundle; run `npm run bundle:katex`");
  }
  if (current !== next) {
    throw new Error("worker.js has a stale KaTeX stylesheet URL; run `npm run bundle:katex`");
  }
  if (readFileSync(mirrorPath, "utf8") !== current) {
    throw new Error("deployed-current.worker.js is not identical to worker.js");
  }
  console.log("KaTeX bundle and worker mirror are current");
} else {
  if (renderer !== nextRenderer) {
    writeFileSync(rendererPath, nextRenderer);
    console.log("renderer.js: KaTeX stylesheet updated");
  }
  if (next !== current) {
    writeFileSync(workerPath, next);
    console.log("worker.js: KaTeX bundle and stylesheet refreshed");
  } else {
    console.log("worker.js: KaTeX bundle and stylesheet already current");
  }
  writeFileSync(mirrorPath, next);
  console.log("deployed-current.worker.js: mirror refreshed");
}
