import test from "node:test"; import assert from "node:assert/strict";
import { CHARTER, parseMarket, isSports, parseEstimate, newsQuery, aggregate, decide, signalEntries, exits, equity, markOf, priceOf, candidates, stats, currentDrawdown, bootstrapCI, evaluate, graduation, reviewActions, syntheticMarkets } from "./worker.js";

test("parseMarket reads gamma outcomePrices and the end date", () => {
  const m = parseMarket({ slug: "a", question: "Q", outcomePrices: '["0.4","0.6"]', endDate: "2026-11-20T00:00:00Z" });
  assert.equal(m.yes, 0.4); assert.equal(m.ends_at, "2026-11-20T00:00:00.000Z"); assert.equal(parseMarket({ slug: "a", outcomePrices: "bad" }), null);
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
test("newsQuery keeps the distinctive words", () => { assert.equal(newsQuery("Will the Fed cut interest rates by December 2026?"), "Fed cut interest rates December"); });

const E = (p, confidence = "medium", why = "w") => ({ p, confidence, why });
test("aggregate: median, spread, weakest confidence, and fewer than two answers is no estimate", () => {
  const a = aggregate([E(0.7, "high"), E(0.8, "medium"), E(0.75, "high", "longest reason")]);
  assert.equal(a.p, 0.75); assert.ok(Math.abs(a.spread - 0.1) < 1e-9); assert.equal(a.confidence, "medium"); assert.equal(a.n, 3); assert.equal(a.why, "longest reason");
  assert.equal(aggregate([E(0.7), null, null]), null);
  assert.equal(aggregate([E(0.6, "low"), E(0.7, "high")]).confidence, "low");
});
test("decide needs an agreed gap: every member on the same side, a gap of minEdge, a spread that is not a disagreement", () => {
  const m = { slug: "s", title: "t", yes: 0.5, ends_at: null };
  assert.equal(decide(aggregate([E(0.55), E(0.58), E(0.6)]), m), null); // a gap of 8 points is not enough
  assert.equal(decide(aggregate([E(0.7), E(0.72), E(0.74)]), m).side, "yes");
  assert.equal(decide(aggregate([E(0.2), E(0.25), E(0.3)]), m).side, "no");
  assert.equal(decide(aggregate([E(0.9), E(0.45), E(0.85)]), m), null); // one member on the other side of the price
  assert.equal(decide(aggregate([E(0.95), E(0.62), E(0.7)]), m), null); // spread above 0.25
  assert.equal(decide(aggregate([E(0.9, "low"), E(0.9, "high")]), m), null);
  assert.equal(decide(aggregate([E(0.97), E(0.97)]), { ...m, yes: 0.93 }), null); // the side is already too dear
});
test("candidates: no sports, within 14 days, volume, band, not held or cooling", () => {
  const soon = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const mk = (slug, x = {}) => ({ slug, yes: 0.5, vol24: 50000, closed: 0, ends_at: soon(5), sports: 0, ...x });
  const c = candidates([mk("ok"), mk("sport", { sports: 1 }), mk("far", { ends_at: soon(60) }), mk("thin", { vol24: 10 }), mk("edge", { yes: 0.99 }), mk("held"), mk("cool"), mk("past", { ends_at: soon(-1) })], new Set(["held"]), new Set(["cool"]));
  assert.deepEqual(c.map((m) => m.slug), ["ok"]);
});
test("signalEntries size 5% of equity and respect the exposure cap and open limit", () => {
  const ds = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ slug: "m" + i, title: "t", side: "yes", fair: 0.8, edge: 0.3 - i / 100, why: "w", ends_at: null }));
  const px = Object.fromEntries(ds.map((d) => [d.slug, 0.5]));
  const o = signalEntries(ds, [], { cash: 10000 }, px);
  assert.equal(o.length, 6); assert.ok(o.every((x) => Math.abs(x.usd - 500) < 1e-6 && x.strategy === "signal"));
});
test("exits: signals are held, leave on convergence or resolution; manual positions keep stop and take-profit", () => {
  const pos = [{ id: 1, slug: "a", side: "yes", qty: 100, entry: 0.5, strategy: "signal", fair: 0.8 }, { id: 2, slug: "b", side: "yes", qty: 100, entry: 0.5, strategy: "manual" }, { id: 3, slug: "c", side: "no", qty: 10, entry: 0.5, strategy: "signal", fair: 0.2 }, { id: 4, slug: "d", side: "yes", qty: 1, entry: 0.5, strategy: "manual" }];
  const x = exits(pos, [{ slug: "a", yes: 0.4 }, { slug: "b", yes: 0.4 }, { slug: "c", yes: 0.001 }, { slug: "d", yes: 0.7 }]);
  assert.deepEqual(x.map((e) => [e.id, e.reason]), [[2, "stop_loss"], [3, "resolved"], [4, "take_profit"]]);
  assert.deepEqual(exits([pos[0]], [{ slug: "a", yes: 0.78 }]).map((e) => e.reason), ["converged"]);
  assert.equal(exits([{ id: 9, slug: "c", side: "yes", qty: 1, entry: 0.5, strategy: "manual" }], [{ slug: "c", yes: 0.55, closed: 1 }])[0].exit, 0.55);
});
test("equity marks NO positions at 1-yes and a missing mark at the entry", () => {
  assert.equal(priceOf("no", 0.3), 0.7);
  assert.equal(equity({ cash: 100 }, [{ slug: "a", side: "no", qty: 10, entry: 0.5 }], { a: 0.3 }), 107);
  assert.equal(equity({ cash: 0 }, [{ slug: "x", side: "no", qty: 125, entry: 0.8 }], {}), 100); assert.equal(markOf({ slug: "x", side: "no", entry: 0.8 }, {}), 0.8);
});
test("stats and currentDrawdown", () => {
  assert.equal(stats([{ equity: 100 }, { equity: 120 }, { equity: 90 }, { equity: 130 }], []).max_drawdown_pct, 25);
  assert.equal(currentDrawdown([{ equity: 100 }, { equity: 120 }, { equity: 108 }]), 10);
});
test("synthetic feed is deterministic per 5-minute bucket", () => { assert.deepEqual(syntheticMarkets(1e12), syntheticMarkets(1e12 + 1000)); });

// ----- the proof harness -----
// Deterministic synthetic worlds: the truth is drawn from a hidden probability; the market sees it with noise, the model sees it with less (or more) noise.
function world(n, modelNoise, marketNoise, seed = 7) {
  let s = seed; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const clamp = (x) => Math.min(0.95, Math.max(0.05, x));
  return Array.from({ length: n }, () => { const t = 0.1 + 0.8 * rnd(); const outcome = rnd() < t ? 1 : 0;
    return { fair: clamp(t + (rnd() - 0.5) * modelNoise), market: clamp(t + (rnd() - 0.5) * marketNoise), confidence: "medium", outcome }; });
}
test("bootstrapCI is deterministic and brackets the mean", () => {
  const xs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.2, 0.3]; const a = bootstrapCI(xs), b = bootstrapCI(xs);
  assert.deepEqual(a, b); assert.ok(a.lo < 0.286 && a.hi > 0.286); assert.equal(bootstrapCI([1]), null);
});
test("evaluate: information that is better than the price shows a positive Brier gain and a trade edge over backing the favourite", () => {
  const ev = evaluate(world(600, 0.10, 0.60));
  assert.ok(ev.brier_gain > 0 && ev.brier_gain_ci.lo > 0, JSON.stringify(ev.brier_gain_ci));
  assert.ok(ev.shadow_n > 30 && ev.shadow_roi > ev.control_roi);
  assert.ok(ev.edge_over_control_ci.lo > 0, JSON.stringify(ev.edge_over_control_ci));
});
test("evaluate: a model that is worse than the price shows a negative gain and does not pass", () => {
  const ev = evaluate(world(600, 0.70, 0.10));
  assert.ok(ev.brier_gain < 0 && ev.brier_gain_ci.hi < 0);
  assert.ok(!(ev.shadow_roi_ci && ev.shadow_roi_ci.lo > 0));
});
test("evaluate ignores unresolved, void and unestimated rows", () => {
  const ev = evaluate([{ fair: 0.7, market: 0.5, confidence: "high", outcome: null }, { fair: 0.7, market: 0.5, confidence: "high", outcome: -1 }, { fair: null, market: 0.5, confidence: "no-evidence", outcome: 1 }]);
  assert.equal(ev.n, 0); assert.equal(ev.brier_gain, null);
});
test("graduation: stays paper until every criterion holds, and says why", () => {
  const ctx = { days: 3, max_drawdown_pct: 2 };
  const none = graduation(evaluate([]), ctx);
  assert.equal(none.ready, false); assert.ok(none.reasons.length >= 5); assert.equal(none.live_enabled, false);
  const ev = evaluate(world(600, 0.10, 0.60));
  assert.equal(graduation(ev, { days: 3, max_drawdown_pct: 2 }).ready, false); // too few days
  assert.equal(graduation(ev, { days: 40, max_drawdown_pct: 25 }).ready, false); // drawdown
  const ok = graduation(ev, { days: 40, max_drawdown_pct: 5 });
  assert.equal(ok.ready, true, JSON.stringify(ok.reasons)); assert.equal(ok.mode, "paper"); // ready never means live
  assert.equal(CHARTER.live.enabled, false);
});
test("reviewActions: pause on drawdown or a significantly worse model, widen the gap, narrow it only on proof", () => {
  const worse = evaluate(world(200, 0.70, 0.10));
  const a = reviewActions(worse, { drawdown_pct: 0, min_edge: 0.10 });
  assert.ok(a.some((x) => x.kind === "pause") && a.some((x) => x.kind === "min_edge" && x.value === 0.12));
  assert.deepEqual(reviewActions(evaluate([]), { drawdown_pct: 16, min_edge: 0.10 }).map((x) => x.kind), ["pause"]);
  assert.deepEqual(reviewActions(evaluate([]), { drawdown_pct: 3, min_edge: 0.10 }), []);
  const good = evaluate(world(600, 0.10, 0.60));
  assert.deepEqual(reviewActions(good, { drawdown_pct: 0, min_edge: 0.10 }).map((x) => x.value), [0.09]);
  assert.equal(reviewActions(good, { drawdown_pct: 0, min_edge: 0.08 }).length, 0); // floor
  assert.equal(reviewActions(worse, { drawdown_pct: 0, min_edge: 0.20 }).filter((x) => x.kind === "min_edge").length, 0); // ceiling
});
