import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(/var VERSION = "0\.(4[0-9]|[5-9][0-9])\.\d+/.test(src), "version at least 0.40.6");
assert.ok(src.includes('row.source === "remediation" && cycle >= 1 && Number(ctx.hardCount) > 0 && hard.length > Number(ctx.hardCount)'), "rising rule present");
assert.ok(src.includes("if (hard.length && cycle < _cycleCap && !_rising) {"), "revise branch gated on !_rising");
console.log("errata-loop-stop ok");
