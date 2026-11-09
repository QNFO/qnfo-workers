import test from "node:test"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { tick } from "./worker.js";
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const mk = (sql, args = []) => ({ bind: (...a) => mk(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }) });
  return { prepare: (s) => mk(s), batch: async (xs) => { for (const x of xs) await x.run(); return []; }, _raw: db };
}
const soon = (d) => new Date(Date.now() + d * 86400000).toISOString();
const feed = (markets) => ({ source: "polymarket", markets });
const mk = (slug, yes, x = {}) => ({ slug, title: "Will " + slug + " happen?", yes, vol24: 50000, move: 0, closed: 0, ends_at: soon(5), sports: 0, ...x });
const news = async () => [1, 2, 3, 4].map((i) => ({ title: "h" + i, domain: "x.com", date: "20261109" }));
const said = (ps) => (m, n, model) => Promise.resolve(JSON.stringify({ p: ps[model] ?? 0.5, confidence: "medium", why: "Three outlets report it (" + model + ")." }));
const deps = (ps) => ({ news, ask: said(ps), models: Object.keys(ps) });
const agree80 = deps({ a: 0.78, b: 0.8, c: 0.82 });
const get = async (env, path) => (await worker.fetch(new Request("https://x" + path), env)).json();

test("a full tick: three models agree on a gap, a paper trade opens with fair, edge and why, and the estimate is recorded with its members", async () => {
  const env = { TRADES_DB: fakeD1() };
  const r = await tick(env, feed([mk("vote", 0.55)]), agree80);
  assert.equal(r.opened, 1); assert.equal(r.estimated, 1); assert.equal(r.ai, "ok");
  const st = await get(env, "/api/state");
  assert.equal(st.open[0].strategy, "signal"); assert.equal(st.open[0].side, "yes"); assert.ok(Math.abs(st.open[0].fair - 0.8) < 1e-9); assert.match(st.open[0].why, /Three outlets/);
  assert.equal(st.predictions[0].traded, 1); assert.equal(JSON.parse(st.predictions[0].models).length, 3);
});
test("no trade, but the estimate is still recorded: small gap, a dissenting member, too few members, thin evidence", async () => {
  const env = { TRADES_DB: fakeD1() };
  const base = { news, models: ["a", "b", "c"] };
  const byTitle = { "Will small happen?": { a: 0.56, b: 0.58, c: 0.6 }, "Will split happen?": { a: 0.9, b: 0.8, c: 0.45 }, "Will one happen?": { a: 0.9 }, "Will thin happen?": { a: 0.9, b: 0.9, c: 0.9 } };
  const r = await tick(env, feed(["small", "split", "one", "thin"].map((s) => mk(s, 0.5)).slice(0, 3)), { ...base, ask: async (m, n, model) => { const ps = byTitle[m.title]; if (ps[model] == null) throw new Error("no answer"); return JSON.stringify({ p: ps[model], confidence: "high", why: "w" }); } });
  assert.equal(r.opened, 0);
  const st = await get(env, "/api/state");
  assert.equal(st.predictions.length, 3); assert.ok(st.predictions.every((p) => !p.traded));
  assert.ok(st.predictions.find((p) => p.title.includes("one")).confidence === "no-ensemble");
  const r2 = await tick(env, feed([mk("thin", 0.5)]), { news: async () => [], ask: async () => "{}", models: ["a"] });
  assert.equal(r2.opened, 0); assert.equal((await get(env, "/api/state")).predictions.find((p) => p.title.includes("thin")).confidence, "no-evidence");
});
test("sports and long-dated markets are never estimated or traded", async () => {
  const env = { TRADES_DB: fakeD1() }; let asked = 0;
  const r = await tick(env, feed([mk("game", 0.5, { sports: 1 }), mk("far", 0.5, { ends_at: soon(90) })]), { news, models: ["a", "b"], ask: async () => { asked++; return "{}"; } });
  assert.equal(asked, 0); assert.equal(r.opened, 0);
});
test("a signal position is held through a dip and exits when the market converges to the estimate", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("v", 0.55)]), agree80);
  assert.equal((await tick(env, feed([mk("v", 0.40)]), agree80)).closed, 0);
  assert.equal((await tick(env, feed([mk("v", 0.78)]), agree80)).closed, 1);
  const st = await get(env, "/api/state");
  assert.equal(st.closed[0].reason, "converged"); assert.ok(st.closed[0].pnl > 0);
});
test("a closed trade is not re-bought on the next tick", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("v", 0.55)]), agree80);
  await tick(env, feed([mk("v", 0.78)]), agree80);
  const r = await tick(env, feed([mk("v", 0.5)]), agree80);
  assert.equal(r.opened, 0);
});
test("without the AI binding the strategy reports no-ai and trades nothing", async () => {
  const env = { TRADES_DB: fakeD1() };
  const r = await tick(env, feed([mk("q", 0.5)]), {});
  assert.equal(r.ai, "no-ai"); assert.equal(r.opened, 0);
});
test("overlapping ticks cannot double-open: one runs, the other reports busy, cash matches positions", async () => {
  const env = { TRADES_DB: fakeD1() };
  const [a, b] = await Promise.all([tick(env, feed([mk("v", 0.55)]), agree80), tick(env, feed([mk("v", 0.55)]), agree80)]);
  assert.equal([a, b].filter((x) => x.busy).length, 1);
  const st = await get(env, "/api/state");
  assert.equal(st.open.length, 1); assert.ok(Math.abs(st.cash - (10000 - st.open[0].qty * st.open[0].entry)) < 1e-6);
});

// ----- settlement, the proof and the self-management loop -----
test("a resolved market settles its estimate, and the proof compares the model with the price", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("yes1", 0.5, { ends_at: soon(0.5) }), mk("no1", 0.5, { ends_at: soon(0.5) })]), deps({ a: 0.8, b: 0.8, c: 0.8 }));
  env.TRADES_DB._raw.exec("UPDATE pt_estimate SET ends_at = '2020-01-01T00:00:00.000Z'");
  const r = await tick(env, feed([]), { ...deps({}), bySlug: async (slugs) => slugs.map((s) => ({ slug: s, title: s, yes: s === "yes1" ? 1 : 0, vol24: 0, move: 0, closed: 1, ends_at: null })) });
  assert.equal(r.settled, 2); assert.equal(r.review.resolved, 2);
  const c = await get(env, "/api/charter");
  assert.equal(c.evaluation.n, 2);
  assert.ok(Math.abs(c.evaluation.brier_model - 0.34) < 1e-9 && Math.abs(c.evaluation.brier_market - 0.25) < 1e-9, "an 80% call that was right once and wrong once scores worse than the 50% price");
  assert.equal(c.graduation.ready, false); assert.equal(c.mode, "paper"); assert.equal(c.charter.live.enabled, false);
  assert.ok(c.graduation.reasons.some((x) => /resolved estimates/.test(x)));
});
test("a market 30 days past its end date that never resolved is void and excluded from scoring", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("limbo", 0.5)]), deps({ a: 0.8, b: 0.8, c: 0.8 }));
  env.TRADES_DB._raw.exec("UPDATE pt_estimate SET ends_at = '2020-01-01T00:00:00.000Z'");
  await tick(env, feed([]), { ...deps({}), bySlug: async (slugs) => slugs.map((s) => ({ slug: s, title: s, yes: 0.5, vol24: 0, move: 0, closed: 0, ends_at: null })) });
  assert.equal(env.TRADES_DB._raw.prepare("SELECT outcome FROM pt_estimate WHERE slug='limbo'").get().outcome, -1);
  assert.equal((await get(env, "/api/charter")).evaluation.n, 0);
});
test("the circuit breaker pauses new entries (estimates continue), logs the decision with a rollback, and expires", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("seed", 0.99, { ends_at: soon(5) })]), deps({}));
  const raw = env.TRADES_DB._raw;
  raw.exec("INSERT OR REPLACE INTO pt_equity VALUES ('2026-01-01T00:00:00.000Z', 10000, 10000, 0, 't'), ('2099-01-01T00:00:00.000Z', 8000, 8000, 0, 't')"); // a peak, then a later 20% drop
  const r = await tick(env, feed([mk("a", 0.5)]), agree80);
  assert.equal(r.opened, 1); // the pause starts at the end of this tick's review
  const c1 = await get(env, "/api/charter");
  assert.equal(c1.control.paused, true); assert.match(c1.control.paused_reason, /breaker/); assert.equal(c1.decisions.length >= 1, true); assert.match(c1.decisions[0].rollback, /DELETE FROM pt_control/);
  const r2 = await tick(env, feed([mk("b", 0.5)]), agree80);
  assert.equal(r2.paused, true); assert.equal(r2.opened, 0); assert.equal(r2.estimated, 1); // paused: no trade, still estimating
  raw.exec("UPDATE pt_control SET value='2020-01-01T00:00:00.000Z' WHERE key='paused_until'");
  raw.exec("DELETE FROM pt_equity WHERE ts > '2090' OR ts < '2026-02-01'"); // the drop is over
  const r3 = await tick(env, feed([mk("c", 0.5)]), agree80);
  assert.equal(r3.paused, false); assert.equal(r3.opened, 1);
});
test("metrics and a heartbeat are published to qnfo-audit when it is bound, and a failing audit write does not break the tick", async () => {
  const audit = fakeD1();
  audit._raw.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT); CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);");
  for (const k of ["pm_paper_return_pct", "pm_paper_drawdown_pct", "pm_resolved_estimates", "pm_brier_gain", "pm_shadow_roi", "pm_edge_over_control", "pm_graduation_ready", "pm_breaker_active"]) audit._raw.prepare("INSERT INTO metric_registry (metric) VALUES (?)").run(k);
  const env = { TRADES_DB: fakeD1(), AUDIT: audit };
  const r = await tick(env, feed([mk("v", 0.55)]), agree80);
  assert.equal(r.review.published, "ok");
  assert.equal(audit._raw.prepare("SELECT last_value v FROM metric_registry WHERE metric='pm_graduation_ready'").get().v, "0");
  assert.equal(audit._raw.prepare("SELECT worker w FROM fleet_heartbeat").get().w, "q08-prediction-markets");
  const bad = { TRADES_DB: fakeD1(), AUDIT: { batch: async () => { throw new Error("audit down"); }, prepare: () => ({ bind: () => ({}) }) } };
  const r2 = await tick(bad, feed([mk("v", 0.55)]), agree80);
  assert.equal(r2.opened, 1); assert.equal(r2.review.published, "error");
});

// ----- manual orders and the page -----
const order = (env, body) => worker.fetch(new Request("https://x/api/order", { method: "POST", body: JSON.stringify(body) }), env);
test("manual orders: caps, duplicates, stale quotes and prices at 0 or 1 are refused; a fresh market is accepted", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed(["a", "b", "c", "d", "z"].map((k) => mk(k, k === "z" ? 0.005 : 0.5, { vol24: 1 }))), {});
  const ok = []; for (const k of ["a", "b", "c", "d"]) ok.push((await order(env, { slug: k, side: "yes", usd: 900 })).status);
  assert.deepEqual(ok, [200, 200, 200, 400]); // 30% exposure cap
  assert.equal((await order(env, { slug: "a", side: "yes", usd: 10 })).status, 400); // already open
  assert.equal((await order(env, { slug: "z", side: "yes", usd: 10 })).status, 400); // price too close to 0
  env.TRADES_DB._raw.exec("UPDATE pt_market SET updated_at='2020-01-01T00:00:00.000Z' WHERE slug='d'");
  const stale = await order(env, { slug: "d", side: "no", usd: 10 }); assert.match((await stale.json()).error, /stale/);
});
test("the dashboard has the evidence panel, predictions, the order form, escapes titles and posts to the API", async () => {
  const html = await (await worker.fetch(new Request("https://x/"), {})).text();
  for (const s of ["Does the information beat the market?", "Predictions", "Buy YES", "Buy NO", "id=amt", "fetch('/api/order'", "fetch('/api/charter')", "Not placed: ", "const E=v=>String(v).replace("]) assert.ok(html.includes(s), s);
});
test("health and charter describe a paper-only worker", async () => {
  const h = await get({}, "/health");
  assert.equal(h.paper_trading, true); assert.equal(h.mode, "paper"); assert.equal(h.charter, "PM-CHARTER-1");
});
