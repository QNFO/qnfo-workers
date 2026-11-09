import test from "node:test"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { tick, syntheticMarkets, equity, markOf } from "./worker.js";
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const mk = (sql, args = []) => ({ bind: (...a) => mk(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }), _x: () => db.prepare(sql).run(...args) });
  return { prepare: (s) => mk(s), batch: async (xs) => { for (const x of xs) await x.run(); return []; } };
}
test("tick opens, marks and closes paper positions end to end", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  const feed = (yes, move = 0.2) => ({ source: "test", markets: [{ slug: "m", title: "M", yes, vol24: 9e4, move, closed: 0 }] });
  const r1 = await tick(env, feed(0.5));
  assert.equal(r1.opened, 1);
  assert.ok(Math.abs(r1.equity - 10000) < 60);
  const r2 = await tick(env, feed(0.7, 0));
  assert.equal(r2.closed, 1);
  assert.ok(r2.equity > 10000);
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  assert.equal(st.paper, true); assert.equal(st.trades_closed, 1); assert.equal(st.open.length, 0);
  const o = await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "m", side: "yes", usd: 500 }) }), env);
  assert.equal(o.status, 200);
  const big = await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "m", side: "yes", usd: 99999 }) }), env);
  assert.equal(big.status, 400);
});

test("overlapping ticks cannot double-open: one runs, the other reports busy, cash matches positions", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  const feed = { source: "test", markets: [{ slug: "m", title: "M", yes: 0.5, vol24: 9e4, move: 0.2, closed: 0 }] };
  const [a, b] = await Promise.all([tick(env, feed), tick(env, feed)]);
  assert.equal([a, b].filter((x) => x.busy).length, 1);
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  assert.equal(st.open.length, 1);
  assert.ok(Math.abs(st.cash - (10000 - st.open[0].qty * st.open[0].entry)) < 1e-6);
});
test("a NO position with no current price is marked at its own entry, not 1 - entry", () => {
  const p = { slug: "x", side: "no", qty: 125, entry: 0.8 };
  assert.equal(markOf(p, {}), 0.8);
  assert.equal(equity({ cash: 0 }, [p], {}), 100);
});

test("manual orders respect the 30% exposure cap and the 8 position cap like automated entries", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: ["a", "b", "c", "d"].map((k) => ({ slug: k, title: k, yes: 0.5, vol24: 1, move: 0, closed: 0 })) });
  const ok = [];
  for (const k of ["a", "b", "c", "d"]) ok.push((await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: k, side: "yes", usd: 900 }) }), env)).status);
  assert.deepEqual(ok, [200, 200, 200, 400]);
});
test("dashboard escapes market titles", async () => {
  const html = await (await worker.fetch(new Request("https://x/"), {})).text();
  assert.match(html, /const E=v=>String\(v\)\.replace\(/);
});

test("state marks a held market that fell outside the top 100 at its stored price, not its entry", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: [{ slug: "held", title: "H", yes: 0.5, vol24: 1, move: 0.2, closed: 0 }].concat(Array.from({ length: 100 }, (_, i) => ({ slug: "f" + i, title: "f", yes: 0.5, vol24: 1e6 + i, move: 0, closed: 0 }))) }).catch(() => {});
  await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "held", side: "yes", usd: 500 }) }), env);
  await env.TRADES_DB.prepare("UPDATE pt_market SET yes=0.7 WHERE slug=?").bind("held").run();
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  const p = st.open.find((x) => x.slug === "held");
  assert.ok(p && Math.abs(p.mark - 0.7) < 1e-9);
});

test("a second manual order in the same market is refused", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: [{ slug: "m", title: "M", yes: 0.5, vol24: 1, move: 0, closed: 0 }] });
  const order = () => worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "m", side: "yes", usd: 100 }) }), env);
  assert.equal((await order()).status, 200);
  assert.equal((await order()).status, 400);
});

test("a stopped-out market is not re-bought in the same tick or the next", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  const feed = (yes, move) => ({ source: "test", markets: [{ slug: "m", title: "M", yes, vol24: 9e4, move, closed: 0 }] });
  await tick(env, feed(0.5, 0.2));
  const r = await tick(env, feed(0.3, 0.2));
  assert.equal(r.closed, 1); assert.equal(r.opened, 0);
  assert.equal((await tick(env, feed(0.3, 0.2))).opened, 0);
});
test("a manual order on a market priced at 0 or 1 is refused instead of making an infinite quantity", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: [{ slug: "z", title: "Z", yes: 0, vol24: 1, move: 0, closed: 0 }] });
  const r = await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "z", side: "yes", usd: 100 }) }), env);
  assert.equal(r.status, 400);
});
test("a held market not refreshed this tick is not exited on its stored price", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: [{ slug: "m", title: "M", yes: 0.5, vol24: 9e4, move: 0.2, closed: 0 }] });
  await env.TRADES_DB.prepare("UPDATE pt_market SET yes=0.995 WHERE slug=?").bind("m").run();
  const r = await tick(env, { source: "test", markets: [{ slug: "other", title: "O", yes: 0.5, vol24: 1, move: 0, closed: 0 }] });
  assert.equal(r.closed, 0);
});

test("a manual order on a quote older than 15 minutes is refused, a fresh one is accepted", async () => {
  const env = { TRADES_DB: fakeD1(), STRATEGIES: "momentum,fade" };
  await tick(env, { source: "test", markets: [{ slug: "m", title: "M", yes: 0.5, vol24: 1, move: 0, closed: 0 }] });
  const order = () => worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: "m", side: "yes", usd: 100 }) }), env);
  await env.TRADES_DB.prepare("UPDATE pt_market SET updated_at=? WHERE slug=?").bind(new Date(Date.now() - 20 * 60000).toISOString(), "m").run();
  const stale = await order();
  assert.equal(stale.status, 400); assert.match((await stale.json()).error, /stale/);
  await env.TRADES_DB.prepare("UPDATE pt_market SET updated_at=? WHERE slug=?").bind(new Date(Date.now() - 60000).toISOString(), "m").run();
  assert.equal((await order()).status, 200);
});

test("the dashboard has an order form that posts to /api/order and shows the returned error", async () => {
  const html = await (await worker.fetch(new Request("https://x/"), {})).text();
  assert.match(html, /Buy YES/); assert.match(html, /Buy NO/); assert.match(html, /id=amt/);
  assert.match(html, /fetch\('\/api\/order'/); assert.match(html, /Not placed: /);
});

const soon = (d) => new Date(Date.now() + d * 86400000).toISOString();
const sigFeed = (markets) => ({ source: "polymarket", markets });
const mk = (slug, yes, extra = {}) => ({ slug, title: "Will " + slug + " happen?", yes, vol24: 50000, move: 0, closed: 0, ends_at: soon(5), sports: 0, ...extra });
test("signal strategy: a model gap of 10+ points with medium confidence opens a paper trade with fair, edge and why", async () => {
  const env = { TRADES_DB: fakeD1() };
  const deps = { news: async () => [1, 2, 3, 4].map((i) => ({ title: "h" + i, domain: "x.com", date: "20261109" })),
    ask: async () => JSON.stringify({ p: 0.8, confidence: "medium", why: "Three outlets report the vote is scheduled." }) };
  const r = await tick(env, sigFeed([mk("vote", 0.55)]), deps);
  assert.equal(r.opened, 1); assert.equal(r.estimated, 1);
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  assert.equal(st.open[0].strategy, "signal"); assert.equal(st.open[0].side, "yes"); assert.ok(Math.abs(st.open[0].fair - 0.8) < 1e-9);
  assert.match(st.open[0].why, /Three outlets/); assert.equal(st.predictions[0].traded, 1);
});
test("signal strategy: a small gap, low confidence or too few headlines opens nothing but is still recorded", async () => {
  const env = { TRADES_DB: fakeD1() };
  const news4 = async () => [1, 2, 3, 4].map((i) => ({ title: "h" + i, domain: "x.com", date: "20261109" }));
  const r1 = await tick(env, sigFeed([mk("a", 0.55), mk("b", 0.55), mk("c", 0.55)]), { news: async (t) => (/b/.test(t) ? [] : news4()),
    ask: async (m) => JSON.stringify(/a /.test(m.title) ? { p: 0.60, confidence: "high", why: "small" } : { p: 0.9, confidence: "low", why: "unsure" }) });
  assert.equal(r1.opened, 0);
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  assert.equal(st.predictions.length, 3); assert.ok(st.predictions.every((p) => !p.traded));
  assert.ok(st.predictions.some((p) => p.confidence === "no-evidence"));
});
test("sports and long-dated markets are never estimated or traded", async () => {
  const env = { TRADES_DB: fakeD1() }; let asked = 0;
  const r = await tick(env, sigFeed([mk("game", 0.5, { sports: 1 }), mk("far", 0.5, { ends_at: soon(90) })]), { news: async () => [1, 2, 3].map(() => ({ title: "h", domain: "x", date: "1" })), ask: async () => { asked++; return "{}"; } });
  assert.equal(asked, 0); assert.equal(r.opened, 0);
});
test("a signal position is held, not stopped out, and exits when the market converges to fair value", async () => {
  const env = { TRADES_DB: fakeD1() };
  const deps = { news: async () => [1, 2, 3].map(() => ({ title: "h", domain: "x", date: "1" })), ask: async () => JSON.stringify({ p: 0.8, confidence: "high", why: "w" }) };
  await tick(env, sigFeed([mk("v", 0.55)]), deps);
  const dip = await tick(env, sigFeed([mk("v", 0.40)]), deps);
  assert.equal(dip.closed, 0);
  const conv = await tick(env, sigFeed([mk("v", 0.78)]), deps);
  assert.equal(conv.closed, 1);
  const st = await (await worker.fetch(new Request("https://x/api/state"), env)).json();
  assert.equal(st.closed[0].reason, "converged"); assert.ok(st.closed[0].pnl > 0);
});
test("without the AI binding the signal strategy reports no-ai and trades nothing", async () => {
  const env = { TRADES_DB: fakeD1() };
  const r = await tick(env, sigFeed([mk("q", 0.5)]), {});
  assert.equal(r.ai, "no-ai"); assert.equal(r.opened, 0);
});
