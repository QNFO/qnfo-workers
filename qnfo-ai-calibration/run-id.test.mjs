// WORKERS-STANDARDS-1 (qnfo-ai-calibration 1.3.4) offline suite: the calibration run id comes from crypto, keeps its
// shape (cal-<ms>-<six hex>), and no id in the bundle is drawn from Math.random. No network.
// Run: node qnfo-ai-calibration/run-id.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const line = src.split("\n").find((l) => /var runId = /.test(l)) || "";
ok(/crypto\.randomUUID\(\)/.test(line) && !/Math\.random\(\)/.test(line), "the run id is drawn from crypto.randomUUID", line.slice(0, 160));
const code = src.split("\n").filter((l) => !/^var VERSION = /.test(l)).join("\n");
ok(!/Math\.random\(\)/.test(code), "no Math.random call remains in the bundle");
const expr = (/var runId = ([^;]+);/.exec(line) || [])[1];
const ids = new Set();
for (let i = 0; i < 200; i++) ids.add(new Function("t0", "return " + expr)(1790000000000));
ok(ids.size === 200 && [...ids].every((id) => /^cal-1790000000000-[0-9a-f]{6}$/.test(id)), "ids keep the cal-<ms>-<six hex> shape and do not repeat in 200 draws", [...ids].slice(0, 2));
const v = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
ok(versionAtLeast(v, "1.3.4"), "VERSION is at least 1.3.4", v);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
