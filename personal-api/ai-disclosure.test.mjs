// OWNER-NO-INTERNAL-AI-DISCLOSURE-1 (owner directive 2026-11-11): never show an AI disclosure on an internal-facing tool.
// The companion (me.q08.org) is the owner's own tool: no page or reply carries the "AI system" notice. Run: node personal-api/ai-disclosure.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as C from "./companion.js";
const RX = /your companion is an ai system|an ai language model writes every reply/i;
let n = 0; const ok = (m) => { n++; console.log("ok - " + m); };
for (const [name, html] of [["first screen", C.PAGE_HTML], ["guide", C.GUIDE_HTML]]) { assert.ok(!RX.test(html), name + " shows an AI disclosure"); ok(name + " has no AI disclosure"); }
for (const f of ["./worker.js", "./deployed-current.worker.js"]) {
  const w = fs.readFileSync(new URL(f, import.meta.url), "utf8");
  assert.ok(!/<p[^>]*>Your companion is an AI system/.test(w), f + " renders the disclosure"); ok(f + " renders no disclosure");
  assert.ok(w.includes('var TWIN_AI_DISCLOSURE = "";')); ok(f + " does not prefix replies");
}
console.log(n + " passed, 0 failed");
