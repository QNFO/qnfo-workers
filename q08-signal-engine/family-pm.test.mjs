// Q08-FAMILY-PM-1: the q08 family has product managers, counters feed them, and the page lists them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const w = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const m = readFileSync(new URL("../migrations/2026-11-13-q08-family-pm.sql", import.meta.url), "utf8");
test("every q08 product has a registry row and at least two growth metrics", () => {
  for (const p of ["q08-signals", "q08-markets", "q08-mind"]) {
    assert.ok(m.includes("product_registry (product, host, worker, program_code, what_for, plus_cadence_h, state) VALUES ('" + p + "'"), p + " registry");
    assert.ok((m.match(new RegExp("VALUES \\('" + p + "', '[a-z0-9_]+', '[^']+', '[a-z]+', '[a-z]+', [0-9]+, 'counter'\\)", "g")) || []).length >= 2, p + " metrics");
  }
});
test("the worker writes the counters the metrics read, and serves /managers", () => {
  for (const k of ["q08_pieces_published_7d", "q08_signals_read_7d", "q08m_forecasts_7d", "q08m_pageviews_7d", "q08m_calls_with_edge"]) assert.ok(w.includes('"' + k + '"') && m.includes("'" + k + "'"), k);
  assert.ok(w.includes('path === "/managers"') && w.includes('path === "/api/managers"') && w.includes("writeGrowthCounters(env)"));
});
