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
  const env = { TRADES_DB: fakeD1() };
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
  const env = { TRADES_DB: fakeD1() };
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
  const env = { TRADES_DB: fakeD1() };
  await tick(env, { source: "test", markets: ["a", "b", "c", "d"].map((k) => ({ slug: k, title: k, yes: 0.5, vol24: 1, move: 0, closed: 0 })) });
  const ok = [];
  for (const k of ["a", "b", "c", "d"]) ok.push((await worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify({ slug: k, side: "yes", usd: 900 }) }), env)).status);
  assert.deepEqual(ok, [200, 200, 200, 400]);
});
test("dashboard escapes market titles", async () => {
  const html = await (await worker.fetch(new Request("https://x/"), {})).text();
  assert.match(html, /const E=v=>String\(v\)\.replace\(/);
});
