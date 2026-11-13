// Inlines forecast-engine.mjs into worker.js (and its mirror) between the FORECAST-ENGINE-1 markers, wrapped in one closure (FE)
// so its names never collide with the paper-trading code. The canonical deploy uploads worker.js alone, so the module is the
// source of truth for tests and the block is its deployed copy. Run: node q08-prediction-markets/inline-forecast-engine.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
export const BEGIN = "// FORECAST-ENGINE-1:BEGIN (sourced from forecast-engine.mjs by inline-forecast-engine.mjs; do not edit inside worker.js)";
export const END = "// FORECAST-ENGINE-1:END";
const EXPORTS = ["tick", "plan", "renderPage", "latestRows", "ensureSchema", "MODELS", "LIMITS", "FE_VERSION", "storyData", "renderStory", "renderTrackRecord", "flowHtml", "stageScores", "siteTop", "VP_CSS", "NAV", "forecastData", "renderForecast", "ledgerData", "renderLedger", "pmStatus", "productManager", "clockStatus", "improvesData", "renderImproves", "feedXml", "sitemapXml"];
export function block() {
  const src = readFileSync(new URL("./forecast-engine.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n")
    .replace(/^export (async function|function|const) /gm, "$1 ").trimEnd();
  return BEGIN + "\nconst FE = (() => {\n" + src + "\nreturn { " + EXPORTS.join(", ") + " };\n})();\n" + END + "\n";
}
export function apply(text) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if ((a < 0) !== (b < 0) || (a >= 0 && b < a)) throw new Error("FORECAST-ENGINE-1 markers are broken (one missing or out of order)");
  if (a >= 0 && b > a) return text.slice(0, a) + block() + text.slice(b + END.length).replace(/^\n/, "");
  const at = text.indexOf("\nexport default {");
  if (at < 0) throw new Error("no export default in worker.js");
  return text.slice(0, at + 1) + block() + "\n" + text.slice(at + 1);
}
if (import.meta.url === new URL(process.argv[1], "file://").href) {
  let stale = 0;
  for (const f of ["worker.js", "deployed-current.worker.js"]) {
    const u = new URL("./" + f, import.meta.url), t = readFileSync(u, "utf8"), n = apply(t);
    if (n !== t) { stale++; if (!process.argv.includes("--check")) writeFileSync(u, n); }
  }
  console.log(process.argv.includes("--check") ? (stale ? "stale" : "current") : "inlined into " + stale + " file(s)");
  if (process.argv.includes("--check") && stale) process.exit(1);
}
