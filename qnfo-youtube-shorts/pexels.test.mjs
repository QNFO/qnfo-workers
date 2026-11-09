// YT-STOCK-HYBRID-2 (issue 9757): the Pexels fallback is present, keyless-safe and claim-free.
import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(src.includes("api.pexels.com/v1/search"), "pexels source present");
assert.ok(/if \(!env\.PEXELS_API_KEY\) return null/.test(src), "no key -> no call");
assert.ok(/PEXELS_QUERIES = \[/.test(src), "fixed query list");
console.log("pexels: passed");
