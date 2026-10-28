// BP26-AI-ACT-ART50-1 (personal-api 4.26.0): the companion's first screen and guide carry the Art. 50(1) AI disclosure in a visible text node.
// The regex is the one scripts/bp26_web.py uses (DISCLOSURE_RX) so a change there is caught here. Run: node personal-api/ai-disclosure.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as C from "./companion.js";
const DISCLOSURE_RX = /\b(?:is an ai system|an ai language model|you are (?:talking|chatting|interacting|speaking) with an? (?:ai|automated)|this is an ai\b|i am an ai\b|i'm an ai\b|ai[- ]generated (?:reply|response|answer))/i;
function visible(page) {
  const t = page.replace(/<!--.*?-->/gs, " ").replace(/<(script|style|noscript|template)\b.*?<\/\1\s*>/gis, " ").replace(/<head\b.*?<\/head\s*>/gis, " ");
  return t.split(/<[^>]*>/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
let n = 0; const ok = (m) => { n++; console.log("ok - " + m); };
for (const [name, html] of [["first screen", C.PAGE_HTML], ["guide", C.GUIDE_HTML]]) {
  const hit = visible(html).find((s) => s.length <= 400 && DISCLOSURE_RX.test(s));
  assert.ok(hit, name + " has no visible AI disclosure"); ok(name + " carries a visible disclosure: " + hit.slice(0, 60));
}
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(w.includes("Your companion is an AI system: an AI language model writes every reply")); ok("the inlined worker.js carries the same text");
const vm = w.match(/var VERSION = "(\d+)\.(\d+)\./); assert.ok(+vm[1] > 4 || +vm[2] >= 26); ok("VERSION is at least 4.26");
console.log(n + " passed, 0 failed");
