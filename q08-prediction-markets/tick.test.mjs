import test from "node:test"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { tick, syntheticMarkets } from "./worker.js";
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const mk = (sql, args = []) => ({ bind: (...a) => mk(sql, a),
    run: async () => { db.prepare(sql).run(...args); return {}; },
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
