import test from "node:test"; import assert from "node:assert/strict";
import { parseMarket, entries, exits, equity, priceOf, syntheticMarkets } from "./worker.js";
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
