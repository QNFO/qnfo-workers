// MATH-BROWSER-2 (3.9.7, #1890): the 06:00 cron samples the pinned anyon paper plus four rotating pages through
// PDF_SVC /math-check, stores the report in RELEASES, and /api/render-health serves it as browser_sample.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gwb-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") + "\nexport { browserMathSample, handleRenderHealth, BROWSER_SAMPLE_PIN };\n");
const { browserMathSample, handleRenderHealth, BROWSER_SAMPLE_PIN } = await import(pathToFileURL(join(dir, "w.mjs")).href);

function env() {
  const store = {}, calls = [];
  const rows = [{ rid: 3, slug: "p3" }, { rid: 5, slug: "p5" }, { rid: 8, slug: "p8" }];
  return {
    calls, store,
    RELEASES: { async get(k) { return store[k] ? { json: async () => JSON.parse(store[k]) } : null; }, async put(k, v) { store[k] = v; } },
    LIVING_PAPER: { prepare(sql) { return { bind(...a) { return { async all() {
      if (/LIMIT \?3/.test(sql)) return { results: rows.filter((r) => r.rid > a[0]).slice(0, a[2]) };
      return { results: [] };
    }, async first() { return { checked: 0, last: null }; } }; }, async all() { return { results: [] }; }, async first() { return { checked: 0, last: null }; } }; } },
    PDF_SVC: { async fetch(u) { calls.push(u); const slug = decodeURIComponent(u.split("/").pop()); return new Response(JSON.stringify(slug === "p5" ? { ok: false, error: "timeout" } : { ok: true, slug, typeset: 10, errors: 0, raw_dollar: 0, pseudo_residual: 1, pass: true }), { status: slug === "p5" ? 502 : 200 }); } },
  };
}

test("samples the pinned paper plus rotating pages, wraps, and stores the report", async () => {
  const e = env();
  const out = await browserMathSample(e);
  assert.equal(e.calls[0], "https://qnfo-pdf/math-check/" + BROWSER_SAMPLE_PIN);
  assert.equal(out.pages, 5);
  assert.deepEqual(out.results.map((x) => x.slug), [BROWSER_SAMPLE_PIN, "p3", "p5", "p8", "p3"]);
  assert.equal(out.failing, 1);
  assert.equal(out.typeset, 40);
  const r = await handleRenderHealth(e);
  const j = await r.json();
  assert.equal(j.browser_sample.pages, 5);
  assert.equal(j.browser_sample.results[0].slug, BROWSER_SAMPLE_PIN);
});

test("does nothing without the binding", async () => {
  const e = env();
  delete e.PDF_SVC;
  assert.equal(await browserMathSample(e), null);
});
