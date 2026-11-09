import test from "node:test"; import assert from "node:assert/strict";
import { isSports, parseEstimate, newsQuery, decide, stats, parseMarket, entries, exits, equity, priceOf, syntheticMarkets } from "./worker.js";
const A = { cash: 10000 };
test("parseMarket reads gamma outcomePrices string", () => {
  assert.equal(parseMarket({ slug: "a", question: "Q", outcomePrices: '["0.4","0.6"]' }).yes, 0.4);
  assert.equal(parseMarket({ slug: "a", outcomePrices: "bad" }), null);
});
test("entries: momentum direction, 10% sizing, 30% exposure cap", () => {
  const ms = [1, 2, 3, 4, 5].map((i) => ({ slug: "m" + i, title: "t", yes: 0.5, vol24: 9000, move: i % 2 ? 0.2 : -0.2, closed: 0 }));
  const o = entries(ms, [], A);
  assert.equal(o.length, 3);
  assert.ok(o.every((x) => Math.abs(x.usd - 1000) < 1e-6));
  assert.equal(o.find((x) => x.slug === "m1").side, "yes");
  assert.equal(o.find((x) => x.slug === "m2").side, "no");
});
test("entries skips low volume, small moves, extremes, held markets", () => {
  const ms = [{ slug: "a", yes: 0.5, vol24: 10, move: 0.3 }, { slug: "b", yes: 0.5, vol24: 9e4, move: 0.01 }, { slug: "c", yes: 0.95, vol24: 9e4, move: 0.3 }, { slug: "d", yes: 0.5, vol24: 9e4, move: 0.3 }];
  assert.equal(entries(ms, [{ slug: "d", side: "yes", qty: 1, entry: 0.5 }], A).length, 0);
});
test("exits: stop loss, take profit, resolution", () => {
  const pos = [{ id: 1, slug: "s", side: "yes", qty: 100, entry: 0.5 }, { id: 2, slug: "t", side: "yes", qty: 100, entry: 0.5 }, { id: 3, slug: "r", side: "no", qty: 100, entry: 0.5 }, { id: 4, slug: "h", side: "yes", qty: 1, entry: 0.5 }];
  const ms = [{ slug: "s", yes: 0.4 }, { slug: "t", yes: 0.7 }, { slug: "r", yes: 0.005 }, { slug: "h", yes: 0.52 }];
  const x = exits(pos, ms);
  assert.deepEqual(x.map((e) => e.reason), ["stop_loss", "take_profit", "resolved"]);
  assert.equal(x[2].exit, 1);
});
test("equity marks NO positions at 1-yes", () => {
  assert.equal(priceOf("no", 0.3), 0.7);
  assert.equal(equity({ cash: 100 }, [{ slug: "a", side: "no", qty: 10, entry: 0.5 }], { a: 0.3 }), 107);
});
test("synthetic feed is deterministic per 5-minute bucket", () => {
  assert.deepEqual(syntheticMarkets(1e12), syntheticMarkets(1e12 + 1000));
});
test("fade: contrarian half-size bet after a spike into the band", () => {
  const o = entries([{ slug: "f", title: "F", yes: 0.85, vol24: 9e4, move: 0.16, closed: 0 }], [], A);
  assert.equal(o.length, 1); assert.equal(o[0].strategy, "fade"); assert.equal(o[0].side, "no"); assert.ok(Math.abs(o[0].usd - 500) < 1e-6);
});
test("stats: max drawdown and per-strategy pnl", () => {
  const s = stats([{ equity: 100 }, { equity: 120 }, { equity: 90 }, { equity: 130 }], [{ strategy: "a", pnl: 5 }, { strategy: "a", pnl: -2 }]);
  assert.equal(s.max_drawdown_pct, 25); assert.deepEqual(s.by_strategy.a, { trades: 2, wins: 1, pnl: 3 });
});
test("a closed market with no resolved price exits at its mark, not at a rounded 0 or 1", () => {
  const x = exits([{ id: 1, slug: "c", side: "yes", qty: 10, entry: 0.5 }], [{ slug: "c", yes: 0.55, closed: 1 }]);
  assert.equal(x[0].reason, "closed"); assert.equal(x[0].exit, 0.55);
  assert.equal(exits([{ id: 2, slug: "r", side: "yes", qty: 1, entry: 0.5 }], [{ slug: "r", yes: 1, closed: 1 }])[0].exit, 1);
});

test("isSports flags games and leagues but not finance or politics", () => {
  for (const t of ["Lakers vs. Celtics", "Will the Chiefs win the Super Bowl?", "Premier League: Arsenal to win on 2026-11-09", "Will Verstappen win the Grand Prix?", "Points spread: Team A (-3.5)"]) assert.ok(isSports({ title: t }), t);
  for (const t of ["Will the Fed cut rates in December?", "Will credit spread widen above 300 basis points?", "Will Bitcoin close above $100k on Friday?", "Will the Senate pass the funding bill by Nov 20?"]) assert.ok(!isSports({ title: t }), t);
  assert.ok(isSports({ title: "x", category: "Sports" }));
});
test("parseEstimate accepts JSON in prose, clamps p and rejects junk", () => {
  assert.deepEqual(parseEstimate('Sure: {"p": 0.7, "confidence": "High", "why": "ok"}'), { p: 0.7, confidence: "high", why: "ok" });
  assert.equal(parseEstimate('{"p": 1.4}'), null); assert.equal(parseEstimate("no json"), null);
  assert.equal(parseEstimate('{"p": 0.999, "confidence": "high"}').p, 0.97);
  assert.equal(parseEstimate('{"p": 0.5, "confidence": "certain"}').confidence, "low");
});
test("newsQuery keeps the distinctive words", () => {
  assert.equal(newsQuery("Will the Fed cut interest rates by December 2026?"), "Fed cut interest rates December");
});
test("decide needs a clear gap, enough confidence and a tradable price", () => {
  const m = { slug: "s", title: "t", yes: 0.5, ends_at: null };
  assert.equal(decide({ p: 0.55, confidence: "high", why: "" }, m), null);
  assert.equal(decide({ p: 0.9, confidence: "low", why: "" }, m), null);
  assert.equal(decide({ p: 0.2, confidence: "medium", why: "w" }, m).side, "no");
  assert.equal(decide({ p: 0.97, confidence: "high", why: "" }, { ...m, yes: 0.93 }), null);
});
