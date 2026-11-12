// VALUE-PIPELINE-1 offline suite: q08.org's front door is the live signal-to-value pipeline, fed by q08-prediction-markets /api/story
// through the PM service binding, with the reports below it and one navigation shared with markets.q08.org.
// Run: node q08-signal-engine/pipeline-front.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0);
CREATE TABLE q08_retractions (slug TEXT);
INSERT INTO published_pieces (slug, title, body_md, published_at) VALUES ('2026-11-11-a', 'A report', 'Body.', '2026-11-11T07:00:00Z');`);
const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async all() { try { return { results: db.prepare(sql).all(...a) }; } catch (e) { return { results: [] }; } }, async first() { try { return db.prepare(sql).get(...a) || null; } catch (e) { return null; } }, async run() { try { db.prepare(sql).run(...a); } catch (e) {} return {}; } }; return st; }, async batch() { return []; } };
const story = { stake: 100, signals: { last_7d: 1234, by_source: { news: 1000, hn: 234 } },
  forecasts: { open: 9, disagree: 2, mean_edge_pts: 3.4, list: [{ slug: "iran-q", title: "US x Iran ceasefire by November 22?", forecast: 0.67, crowd: 0.635, edge_pts: 3, position: { side: "YES", entry: 0.635, pnl: -4.5 }, proxy: { name: "Brent crude oil", now: 71.2, unit: "$/bbl" }, related: [{ title: "What the strait closure did", url: "https://q08.org/p/x" }] }] },
  book: { totals: { positions: 2, pnl: -4.5 } }, pilot: { start: 10000, equity: 9060 },
  stages: [{ key: "signal", value: 0.9, met: true }, { key: "forecast", value: null, met: null }, { key: "edge", value: 3.4, met: true }, { key: "value", value: null, met: null }] };
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const ctx = { waitUntil() {} };
const seen = [];
const PM = { fetch: async (u) => { seen.push(String(u)); return new Response(JSON.stringify(story), { headers: { "content-type": "application/json" } }); } };
const html = await (await w.fetch(new Request("https://q08.org/"), { DB: D1, PM }, ctx)).text();
ok(seen.some((u) => u.endsWith("/api/story")), "the front door reads the pipeline through the PM binding", seen);
ok(html.includes("Signals in. Forecasts out. Value measured.") && !html.includes("What happened, and the system that made it happen."), "the front door leads with the pipeline, not the essays");
ok(html.indexOf("1 · Signals in") < html.indexOf('id="reports"'), "the four stages come before the reports");
ok(html.includes("1,234") && html.includes("−$4.50") && html.includes("Target 2 points or more") && html.includes("missed") === false, "live numbers, the loss and the targets render");
ok(html.includes('href="https://markets.q08.org/f/iran-q"') && html.includes("Brent crude oil") && html.includes("https://q08.org/p/x"), "a live forecast links to its forecast page, its financial proxy and its report");
ok(html.includes('href="https://markets.q08.org/track-record"') && html.includes('href="/#reports"') && html.includes(">Pipeline</a>"), "one navigation across q08.org and markets.q08.org");
ok(html.includes("/p/2026-11-11-a"), "the reports still list below the pipeline");
const down = await (await w.fetch(new Request("https://q08.org/"), { DB: D1, PM: { fetch: async () => { throw new Error("down"); } } }, ctx)).text();
ok(down.includes("Signals in. Forecasts out. Value measured.") && down.includes("1 · Signals in") && down.includes("/p/2026-11-11-a"), "the front door renders the pipeline frame and the reports when the markets worker is down");
const none = await (await w.fetch(new Request("https://q08.org/"), { DB: D1 }, ctx)).text();
ok(none.includes("4 · Value captured"), "no binding: the frame still renders");
console.log("pipeline-front: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
// Q08-GROWTH-1: a signal report links forward to the forecasts it feeds; a report no forecast cites gets no box.
{
  const W = await import("./worker.js");
  const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const fn = new Function("escHtml", "q08Pct", src.slice(src.indexOf("function q08FeedsBox("), src.indexOf("function renderIndex(")) + "; return q08FeedsBox;")((s) => String(s), (p) => Math.round(1000 * p) / 10 + "%");
  const story = { forecasts: { list: [{ slug: "jh", title: "Jensen Huang out by December 31?", forecast: 0.58, crowd: 0.47, deadline: "2026-12-31", related: [{ url: "https://q08.org/p/nv" }] }] } };
  const box = fn(story, "nv");
  console.log(box.includes('href="https://markets.q08.org/f/jh"') && box.includes("Forecasts this report feeds") && box.includes("/ledger") && fn(story, "other") === "" && fn(null, "nv") === "" ? "feeds box ok" : "FAIL feeds box");
  if (!box.includes("Forecasts this report feeds")) process.exit(1);
  void W;
}
