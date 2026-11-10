import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const sql = readFileSync(new URL("../migrations/2026-11-10-paper-demos.sql", import.meta.url), "utf8");
test("PAPER-DEMOS-1 renders the demo block on the paper page and the quick read", () => {
  assert.match(src, /demoBlockHtml\(paper\._demo\) \+ st\.html/);
  assert.match(src, /demoBlockHtml\(d\.demo\)/);
  assert.match(src, /paper\._demo = await demoFor\(env, slug\)/);
});
test("only qnfo.github.io demo addresses are accepted", () => {
  const m = src.match(/var DEMO_URL_RE = (\/.*\/);/);
  const re = eval(m[1]);
  assert.ok(re.test("https://qnfo.github.io/paper-demo-llm-convergence-gate/"));
  for (const bad of ["http://qnfo.github.io/x/", "https://evil.example/x/", "https://qnfo.github.io.evil.com/x/", "javascript:alert(1)"]) assert.ok(!re.test(bad), bad);
});
test("migration seeds the first demo with a valid address", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS paper_demos/);
  assert.match(sql, /https:\/\/qnfo\.github\.io\/paper-demo-llm-convergence-gate\//);
});

test("second demo is seeded for its paper", () => {
  const m = readFileSync(new URL("../migrations/2026-11-10-paper-demos-ess.sql", import.meta.url), "utf8");
  assert.match(m, /INSERT OR REPLACE INTO paper_demos/);
  assert.match(m, /https:\/\/qnfo\.github\.io\/paper-demo-unfalsifiability-ess\//);
});

test("PAPER-DEMOS-3 seeds the agentic-collapse demo", () => {
  const m = readFileSync(new URL("../migrations/2026-11-10-paper-demos-ai.sql", import.meta.url), "utf8");
  for (const r of ["agentic-collapse", "agent-deadlock", "subliminal-learning"])
    assert.match(m, new RegExp("https://qnfo\.github\.io/paper-demo-" + r + "/"));
});

test("PAPER-DEMOS-3b seeds the Monna-map demo", () => {
  const m = readFileSync(new URL("../migrations/2026-11-10-paper-demos-monna.sql", import.meta.url), "utf8");
  assert.match(m, /https:\/\/qnfo\.github\.io\/paper-demo-hallucination-monna-map\//);
});
