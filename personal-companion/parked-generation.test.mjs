// PARKED-GENERATION-1 (2026-11-25): the companion-generation Workflow schedule kept running after the fleet was refocused (five runs a day,
// about 390k neurons). It stays off, and a parked run ends before any model call. Run: node --test personal-companion/parked-generation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const toml = fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
test("no Workflow schedule is declared", () => { assert.ok(!/^\s*schedules\s*=/m.test(toml)); });
test("a parked generation or research run returns before it calls a model", () => {
  assert.match(src, /var PARKED_GENERATION = true;/);
  const g = src.slice(src.indexOf("var GenerationFlow = class"), src.indexOf("var PersonalPipelineFlow"));
  assert.ok(g.indexOf("if (PARKED_GENERATION)") > 0 && g.indexOf("if (PARKED_GENERATION)") < g.indexOf("generate(this.env"));
  const r = src.slice(src.indexOf("var ResearchRunFlow = class"), src.indexOf("var ResearchRunFlow = class") + 400);
  assert.match(r, /if \(PARKED_GENERATION\) return/);
});
test("the deployed mirror carries the same guard (the canonical deploy reads the mirror)", () => {
  const mirror = fs.readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
  assert.match(mirror, /var PARKED_GENERATION = true;/);
  assert.equal(mirror, src);
});
