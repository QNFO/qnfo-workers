import test from "node:test"; import assert from "node:assert/strict";
import { CHARTER, isQuant, ceLines, ceMatch, domainOf, applyRecal, fitRecal, fitBlend, kellyStake, sha256Hex, chainHash, verifyChain, logLoss, byDomain, tuneActions, wikiItems, hnQuery, gdeltDelay, parseMarket, isSports, parseEstimate, newsQuery, aggregate, decide, signalEntries, exits, equity, markOf, priceOf, candidates, stats, currentDrawdown, bootstrapCI, evaluate, graduation, reviewActions, syntheticMarkets } from "./worker.js";

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

test("sports are recognised from Polymarket's own markers, esports and exact-score markets, not only from words", () => {
  const base = { slug: "x", question: "Will it happen?", outcomePrices: '["0.5","0.5"]' };
  assert.equal(parseMarket({ ...base, sportsMarketType: "moneyline" }).sports, 1);
  assert.equal(parseMarket({ ...base, gameStartTime: "2026-11-09 01:20:00+00" }).sports, 1);
  assert.equal(parseMarket({ ...base, events: [{ gameId: 12345 }] }).sports, 1);
  assert.equal(parseMarket({ ...base, events: [{ seriesSlug: "weekly-news" }] }).sports, 0);
  for (const t of ["Exact Score: Any Other Score?", "Will Bilibili Gaming win Worlds 2026?", "Will Elon Musk post 40-64 tweets from November 7 to November 9, 2026?", "Valorant Champions winner"]) assert.ok(isSports({ title: t }), t);
  assert.ok(!isSports({ title: "US x Iran Effective Ceasefire by November 22?" }));
});
test("hnQuery keeps three distinctive words and drops month names", () => {
  assert.equal(hnQuery("US x Iran Effective Ceasefire by November 22?"), "Iran Effective Ceasefire");
});
test("gdeltDelay waits out the five second limit", () => {
  assert.equal(gdeltDelay(10000, 10000), 5600); assert.equal(gdeltDelay(13000, 10000), 2600); assert.equal(gdeltDelay(20000, 10000), 0);
});

test("wikiItems keeps only recently edited articles and strips the markup", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const items = wikiItems({ query: { search: [{ title: "Iran ceasefire", snippet: "talks <span class=\"searchmatch\">continue</span> &amp; hold", timestamp: "2026-11-08T10:00:00Z" }, { title: "Old article", snippet: "x", timestamp: "2026-01-01T00:00:00Z" }] } }, now);
  assert.equal(items.length, 1); assert.match(items[0].title, /^Iran ceasefire: talks continue & hold \[last edited 2026-11-08\]$/); assert.equal(items[0].src, "wiki");
  assert.deepEqual(wikiItems(null), []);
});

// ----- the research-backed pieces (recommendations R4 to R11) -----
function rng(seed) { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
const lg = (p) => Math.log(p / (1 - p)), sg = (x) => 1 / (1 + Math.exp(-x));
test("domainOf classifies by topic and falls back to other", () => {
  assert.equal(domainOf("Will OpenAI release GPT-6 before December?"), "tech");
  assert.equal(domainOf("Will Bitcoin close above $100k?"), "crypto");
  assert.equal(domainOf("Will the Fed cut rates in December?"), "macro");
  assert.equal(domainOf("US x Iran Effective Ceasefire by November 22?"), "geopolitics");
  assert.equal(domainOf("Will the Senate pass the funding bill?"), "politics");
  assert.equal(domainOf("Will a hurricane make landfall in Florida?"), "science");
  assert.equal(domainOf("Will Taylor Swift win a Grammy?"), "entertainment");
  assert.equal(domainOf("Something unclassifiable"), "other");
});
test("recalibration: an overconfident model is shrunk, an underconfident one stretched, a calibrated one left alone", () => {
  const make = (k, n, seed) => { const r = rng(seed); return Array.from({ length: n }, () => { const z = (r() - 0.5) * 6; const raw = sg(z); return { raw, outcome: r() < sg(k * z) ? 1 : 0 }; }); };
  const over = fitRecal(make(0.5, 800, 3)), under = fitRecal(make(1.8, 800, 4)), fine = fitRecal(make(1, 800, 5));
  assert.ok(over.a < 0.7, JSON.stringify(over)); assert.ok(under.a > 1.4, JSON.stringify(under)); assert.ok(Math.abs(fine.a - 1) < 0.25 && Math.abs(fine.b) < 0.25, JSON.stringify(fine));
  assert.deepEqual(fitRecal([]), { a: 1, b: 0 });
  assert.ok(Math.abs(applyRecal(0.8) - 0.8) < 1e-9); assert.ok(applyRecal(0.8, 0.5, 0) < 0.8 && applyRecal(0.8, 1.5, 0) > 0.8);
  const tiny = fitRecal([{ raw: 0.9, outcome: 0 }, { raw: 0.9, outcome: 0 }, { raw: 0.9, outcome: 0 }]); assert.ok(tiny.a >= 0.5 && tiny.a <= 2 && Math.abs(tiny.b) <= 1); // a tiny sample is bounded
});
test("fitBlend: trusts the model when it is better than the price and the price when it is not", () => {
  const r = rng(11); const rows = Array.from({ length: 400 }, () => { const t = 0.1 + 0.8 * r(); return { t, outcome: r() < t ? 1 : 0 }; });
  const good = rows.map((x) => ({ fair: x.t, market: Math.min(0.95, Math.max(0.05, x.t + (r() - 0.5) * 0.8)), outcome: x.outcome }));
  const bad = rows.map((x) => ({ market: x.t, fair: Math.min(0.95, Math.max(0.05, x.t + (r() - 0.5) * 0.8)), outcome: x.outcome }));
  assert.ok(fitBlend(good) >= 0.7, String(fitBlend(good))); assert.ok(fitBlend(bad) <= 0.3, String(fitBlend(bad))); assert.equal(fitBlend([]), 0.5);
});
test("kellyStake: quarter Kelly, capped at the position limit, zero without an edge", () => {
  assert.equal(kellyStake(0.5, 0.55, 10000), 0); assert.equal(kellyStake(0.9, 0.5, 10000), 500); // capped at 5%
  const s = kellyStake(0.6, 0.55, 10000); assert.ok(Math.abs(s - 10000 * 0.25 * ((0.6 - 0.55) / 0.45)) < 1e-6 && s < 500);
});
test("decide shrinks toward the price by the blend weight and gives the side's win probability", () => {
  const m = { slug: "s", title: "t", yes: 0.5, ends_at: null };
  const d = decide(aggregate([E(0.7), E(0.72), E(0.74)]), m, 0.1, undefined, 0.5); assert.ok(Math.abs(d.pWin - 0.61) < 1e-9);
  const n = decide(aggregate([E(0.2), E(0.25), E(0.3)]), m, 0.1, undefined, 0.5); assert.equal(n.side, "no"); assert.ok(Math.abs(n.pWin - (1 - (0.5 * 0.25 + 0.25))) < 1e-9);
  assert.ok(Math.abs(decide(aggregate([E(0.7), E(0.72), E(0.74)]), m).pWin - 0.72) < 1e-9); // default weight 1 = the model alone
});
test("signalEntries size by Kelly: a thin edge gets a small stake, a thin-enough edge none", () => {
  const px = { a: 0.5, b: 0.5, c: 0.5 };
  const o = signalEntries([{ slug: "a", title: "a", side: "yes", fair: 0.9, edge: 0.4, pWin: 0.9 }, { slug: "b", title: "b", side: "yes", fair: 0.6, edge: 0.1, pWin: 0.56 }, { slug: "c", title: "c", side: "yes", fair: 0.52, edge: 0.02, pWin: 0.502 }], [], { cash: 10000 }, px);
  assert.deepEqual(o.map((x) => x.slug), ["a", "b"]); assert.equal(o[0].usd, 500); assert.ok(o[1].usd < 500 && o[1].usd > 50);
});
test("candidates skip wide-spread markets and switched-off domains", () => {
  const soon = new Date(Date.now() + 5 * 86400000).toISOString(); const mk = (slug, x) => ({ slug, title: "Will the Fed cut rates?", yes: 0.5, vol24: 50000, closed: 0, ends_at: soon, sports: 0, ...x });
  assert.deepEqual(candidates([mk("tight", { spread: 0.02 }), mk("wide", { spread: 0.2 }), mk("none")], new Set(), new Set()).map((m) => m.slug), ["tight", "none"]);
  assert.deepEqual(candidates([mk("a")], new Set(), new Set(), undefined, Date.now(), new Set(["macro"])), []);
  assert.equal(parseMarket({ slug: "x", outcomePrices: '["0.5","0.5"]', spread: 0.03 }).spread, 0.03); assert.equal(parseMarket({ slug: "x", outcomePrices: '["0.5","0.5"]' }).spread, null);
});
test("the forecast log is a hash chain: any edit, deletion or reorder is detected", async () => {
  let prev = ""; const rows = [];
  for (let i = 1; i <= 4; i++) { const core = JSON.stringify({ i, p: i / 10 }); const hash = await chainHash(prev, core); rows.push({ id: i, core, prev_hash: prev, hash }); prev = hash; }
  assert.deepEqual(await verifyChain(rows), { ok: true, count: 4, head: prev, bad_id: null });
  assert.equal((await verifyChain([rows[0], { ...rows[1], core: JSON.stringify({ i: 2, p: 0.9 }) }, rows[2], rows[3]])).bad_id, 2); // edited
  assert.equal((await verifyChain([rows[0], rows[2], rows[3]])).ok, false); // deleted
  assert.equal((await verifyChain([rows[1], rows[0], rows[2], rows[3]])).ok, false); // reordered
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("logLoss and byDomain report beside Brier and split the proof by domain", () => {
  const rows = [...world(300, 0.1, 0.6, 21).map((x) => ({ ...x, domain: "tech" })), ...world(300, 0.7, 0.1, 22).map((x) => ({ ...x, domain: "politics" }))];
  const ll = logLoss(rows); assert.ok(ll.n === 600 && Number.isFinite(ll.model) && Number.isFinite(ll.market));
  const d = byDomain(rows); assert.ok(d.tech.brier_gain_ci.lo > 0 && d.politics.brier_gain_ci.hi < 0, JSON.stringify(d));
});
test("tuneActions: weekly lock, bounded parameter moves, immediate domain switch-off", () => {
  const r = rng(31); const rows = Array.from({ length: 300 }, () => { const z = (r() - 0.5) * 6, raw = sg(z); return { raw, fair: raw, market: sg(z * 0.4), confidence: "medium", domain: "tech", outcome: r() < sg(0.5 * z) ? 1 : 0 }; });
  const now = Date.parse("2026-12-01T00:00:00Z");
  const free = tuneActions(rows, { recal_a: 1, recal_b: 0, blend_w: 0.5, last_tune_at: null }, now);
  assert.ok(free.some((a) => a.kind === "recal" && a.a < 0.7)); assert.ok(free.every((a) => a.reason));
  const locked = tuneActions(rows, { recal_a: 1, recal_b: 0, blend_w: 0.5, last_tune_at: "2026-11-28T00:00:00Z" }, now);
  assert.equal(locked.filter((a) => a.kind !== "domain_off").length, 0);
  const bad = Array.from({ length: 40 }, (_, i) => ({ raw: 0.9, fair: 0.9, market: 0.5, confidence: "medium", domain: "politics", outcome: 0 }));
  const dom = tuneActions(bad, { recal_a: 1, recal_b: 0, blend_w: 0.5, last_tune_at: "2026-11-30T00:00:00Z" }, now);
  assert.deepEqual(dom.map((a) => a.kind), ["domain_off"]); assert.equal(dom[0].domain, "politics");
  assert.equal(tuneActions(bad, { recal_a: 1, recal_b: 0, blend_w: 0.5, last_tune_at: "2026-11-30T00:00:00Z", domains_off: { politics: "2026-12-10T00:00:00Z" } }, now).length, 0); // already off
  assert.equal(tuneActions(rows.slice(0, 20), { recal_a: 1, recal_b: 0, blend_w: 0.5 }, now).length, 0); // too few resolved
});

test("isQuant flags price brackets and post counts, not questions where news matters", () => {
  for (const x of ["Will the price of Ethereum be above $2,200 on November 9?", "Will the price of Bitcoin be between $76,000 and $78,000 on November 10?", "Bitcoin Up or Down on November 9?", "Will Elon Musk post 300-319 tweets from November 3 to November 10?", "Exact Score: Any Other Score?"]) assert.ok(isQuant(x), x);
  for (const x of ["US x Iran Effective Ceasefire by November 22?", "Will Bitcoin hit $100k in November?", "Will the Fed cut rates in December?", "Will OpenAI release GPT-6 before December?"]) assert.ok(!isQuant(x), x);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  assert.deepEqual(candidates([{ slug: "q", title: "Will the price of Ethereum be above $2,200 on November 9?", yes: 0.5, vol24: 5e4, closed: 0, ends_at: soon, sports: 0 }], new Set(), new Set()), []);
});
test("the current-events portal gives evidence lines matched to a question by its distinctive words", () => {
  const html = '<ul><li><a href="/wiki/Iran">Iran</a> and <a href="/wiki/Israel">Israel</a> agree to extend their ceasefire for another week, mediators say. <a href="https://example.com">Reuters</a></li><li>A hurricane makes landfall in Florida, forcing evacuations of coastal counties.</li><li>short</li></ul>';
  const lines = ceLines(html, "2026-11-08T10:00:00Z");
  assert.equal(lines.length, 2); assert.match(lines[0].title, /Iran and Israel agree to extend their ceasefire.*\[Wikipedia current events 2026-11-08\]$/); assert.equal(lines[0].date, "20261108");
  const hit = ceMatch(lines, "US x Iran Effective Ceasefire by November 22?"); assert.equal(hit.length, 1); assert.equal(hit[0].src, "events"); assert.ok(!("text" in hit[0]));
  assert.deepEqual(ceMatch(lines, "Will the Senate pass the funding bill?"), []); assert.deepEqual(ceMatch([], "anything goes here"), []);
});

test("evaluate scores the blend with the weight the strategy trades on", () => {
  const rows = [0, 1, 0, 1].map((o, i) => ({ fair: o ? 0.8 : 0.2, market: 0.5, outcome: o, confidence: "high", domain: "politics", ts: "2026-01-0" + (i + 1) }));
  const half = evaluate(rows, 0.1), full = evaluate(rows, 0.1, { SLIP: 0.01, blendW: 1 });
  assert.ok(Math.abs(full.brier_blend - full.brier_model) < 1e-9);
  assert.ok(full.brier_blend < half.brier_blend);
});
test("a lapsed domain pause is renewed only on forecasts made after it lapsed", () => {
  const bad = (i, ts) => ({ fair: 0.9, market: 0.5, outcome: 0, confidence: "high", domain: "crypto", ts, v: 1 });
  const old = Array.from({ length: 30 }, (_, i) => bad(i, "2026-01-01T00:00:00Z"));
  const params = { recal_a: 1, recal_b: 0, blend_w: 0.5, domains_off: { crypto: "2026-02-01T00:00:00Z" }, last_tune_at: null };
  const now = Date.parse("2026-02-10T00:00:00Z");
  assert.ok(!tuneActions(old, params, now).some((a) => a.kind === "domain_off"), "old record alone must not renew");
  const fresh = old.concat(Array.from({ length: 30 }, (_, i) => bad(i, "2026-02-05T00:00:00Z")));
  assert.ok(tuneActions(fresh, params, now).some((a) => a.kind === "domain_off" && a.domain === "crypto"));
});
test("verifyChain carries the last hash across pages", async () => {
  const mk = async (prev, core) => ({ core, prev_hash: prev, hash: await chainHash(prev, core) });
  const a = await mk("", "a"), b = await mk(a.hash, "b"), c = await mk(b.hash, "c");
  const p1 = await verifyChain([a, b]), p2 = await verifyChain([c], p1.head);
  assert.ok(p1.ok && p2.ok && p2.head === c.hash);
  assert.equal((await verifyChain([c], "")).ok, false);
});
