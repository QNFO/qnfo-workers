// FLEET-GRAPH-1 offline suite: replays scripts/fleet_graph.mjs --selftest (secret-value canary, SQL and trigger parsing,
// trigger depth and cycles, diff writes, SQL escaping, every finding kind without false positives). The AST cases need
// acorn and acorn-walk, which the repository suite runner does not install; they are reported as skipped here and run in
// .github/workflows/fleet-graph.yml, which installs the pinned versions first. Run: node scripts/fleet_graph.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const FG = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "fleet_graph.mjs")).href);
const lines = [];
const fails = await FG.selftest((l) => { lines.push(l); console.log(l); });
if (fails) process.exit(1);
console.log("fleet_graph.test.mjs ok");
// ARCHIVE-MARKER-READ-2: buildCode must list archive/<dir> directories that carry RETIRED or FOLDED as retired.
import { readFileSync } from "node:fs";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fleet_graph.mjs"), "utf8");
if (!/ARCHIVE-MARKER-READ-2[\s\S]{0,300}join\(root, "archive", d, "RETIRED"\)[\s\S]{0,120}retired\.push\(d\)/.test(src)) { console.error("ARCHIVE-MARKER-READ-2 missing from buildCode"); process.exit(1); }
console.log("archive marker read ok");
