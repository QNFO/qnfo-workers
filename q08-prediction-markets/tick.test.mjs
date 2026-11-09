import test from "node:test"; import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { tick, chainHash } from "./worker.js";
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
const news = async () => [1, 2, 3, 4].map((i) => ({ title: "h" + i, domain: "x.com", date: "20261109", src: "gdelt" }));
const said = (ps) => (m, n, model, opts = {}) => Promise.resolve(JSON.stringify({ p: opts.ask === "no" ? 1 - (ps[model] ?? 0.5) : ps[model] ?? 0.5, confidence: "medium", why: "Three outlets report it (" + model + ")." }));
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
  const byTitle = { "Will small happen?": { a: 0.56, b: 0.58, c: 0.6 }, "Will split happen?": { a: 0.9, b: 0.8, c: 0.45 }, "Will one happen?": { a: 0.9 } };
  const ask = async (m, n, model) => { const ps = byTitle[m.title]; if (ps[model] == null) throw new Error("no answer"); return JSON.stringify({ p: ps[model], confidence: "high", why: "w" }); };
  assert.equal((await tick(env, feed([mk("small", 0.5), mk("split", 0.5)]), { ...base, ask })).opened, 0); // two estimates per tick
  assert.equal((await tick(env, feed([mk("one", 0.5)]), { ...base, ask })).opened, 0);
  const st = await get(env, "/api/state");
  assert.equal(st.predictions.length, 3); assert.ok(st.predictions.every((p) => !p.traded));
  assert.ok(st.predictions.find((p) => p.title.includes("one")).confidence === "no-ensemble");
  assert.deepEqual(JSON.parse(st.predictions[0].sources), { gdelt: 4 }); // the evidence source counts are kept, so a dead source shows
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

// ----- the research-backed pipeline: log, first-forecast scoring, frozen parameters, sizing, filters -----
const sg = (x) => 1 / (1 + Math.exp(-x));
function rng(seed) { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
// Seed resolved first-forecasts straight into the log (with a valid chain) and the estimate table.
async function seedResolved(env, rows) {
  const raw = env.TRADES_DB._raw;
  let prev = raw.prepare("SELECT hash FROM pt_estimate_log ORDER BY id DESC LIMIT 1").get()?.hash || "";
  for (const [i, r] of rows.entries()) {
    const slug = "seed-" + r.domain + "-" + i + "-" + Math.random().toString(36).slice(2, 6), ts = "2026-10-01T00:00:00.000Z", core = JSON.stringify({ slug, fair: r.fair, i });
    const hash = await chainHash(prev, core);
    raw.prepare("INSERT INTO pt_estimate_log (ts,slug,core,fair_raw,fair,market,confidence,domain,ends_at,params_version,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(ts, slug, core, r.raw, r.fair, r.market, "medium", r.domain, "2026-10-05T00:00:00.000Z", 1, prev, hash);
    raw.prepare("INSERT INTO pt_estimate (slug,title,fair,market,confidence,ends_at,headlines,traded,updated_at,outcome,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(slug, slug, r.fair, r.market, "medium", "2026-10-05T00:00:00.000Z", 3, 0, ts, r.outcome, ts);
    prev = hash;
  }
}
const overconfident = (n, seed, domain = "tech") => { const r = rng(seed); return Array.from({ length: n }, () => { const z = (r() - 0.5) * 6, p = sg(z); return { domain, raw: p, fair: p, market: sg(z * 0.4), outcome: r() < sg(0.5 * z) ? 1 : 0 }; }); };

test("every estimate is appended to a hash-chained log with its evidence, and the chain verifies", async () => {
  const env = { TRADES_DB: fakeD1() };
  const withEvidence = { ...agree80, news: async () => [{ title: "Senate schedules the vote", domain: "x.com", date: "20261109", src: "gdelt" }, { title: "Vote whip count", domain: "y.com", date: "20261109", src: "hn" }, { title: "Bill text", domain: "z.org", date: "20261108", src: "wiki" }] };
  await tick(env, feed([mk("vote", 0.55)]), withEvidence);
  const tr = await get(env, "/api/track-record");
  assert.equal(tr.chain.ok, true); assert.equal(tr.chain.count, 1); assert.equal(tr.rows.length, 1);
  const core = JSON.parse(tr.rows[0].core);
  assert.equal(core.slug, "vote"); assert.equal(core.evidence.length, 3); assert.deepEqual(core.sources, { gdelt: 1, hn: 1, wiki: 1 }); assert.equal(core.params_version, 1); assert.equal(core.models.length, 3);
  assert.equal(tr.rows[0].domain, "politics"); assert.equal(tr.rows[0].prev_hash, "");
});
test("the log refuses edits and deletes, and a tamper from outside is caught by the chain", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("a", 0.55), mk("b", 0.55)]), agree80);
  const raw = env.TRADES_DB._raw;
  assert.throws(() => raw.exec("UPDATE pt_estimate_log SET fair = 0.99"), /append-only/); assert.throws(() => raw.exec("DELETE FROM pt_estimate_log"), /append-only/);
  assert.equal((await get(env, "/api/track-record")).chain.ok, true);
  raw.exec("DROP TRIGGER pt_estimate_log_no_update"); raw.exec("UPDATE pt_estimate_log SET core = REPLACE(core, '\"fair\":0.8', '\"fair\":0.9') WHERE id = 1");
  const tr = await get(env, "/api/track-record"); assert.equal(tr.chain.ok, false); assert.equal(tr.chain.bad_id, 1);
});
test("the first forecast on a market is the one scored, not a later one made closer to the answer", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("m", 0.5)]), deps({ a: 0.58, b: 0.58, c: 0.58 })); // an 8-point gap: recorded, not traded
  env.TRADES_DB._raw.exec("UPDATE pt_estimate SET updated_at = '2020-01-01T00:00:00.000Z'"); // past the re-estimate interval
  await tick(env, feed([mk("m", 0.5)]), deps({ a: 0.2, b: 0.2, c: 0.2 }));
  const raw = env.TRADES_DB._raw;
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM pt_estimate_log").get().n, 2);
  raw.exec("UPDATE pt_estimate SET outcome = 1");
  const c = await get(env, "/api/charter");
  assert.equal(c.evaluation.n, 1); assert.ok(Math.abs(c.evaluation.brier_model - 0.1764) < 1e-9, "scored the first forecast (0.58), not the later 0.2: " + c.evaluation.brier_model);
  assert.equal(c.lead_hours.n, 1); assert.ok(c.log_loss.n === 1 && c.log_loss.model < c.log_loss.market, JSON.stringify(c.log_loss));
});
test("recalibration and domain switch-off change the parameters once, start a new sample, and are logged with rollbacks", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("seed", 0.99)]), deps({})); // creates the tables
  const bad = Array.from({ length: 30 }, () => ({ domain: "politics", raw: 0.9, fair: 0.9, market: 0.5, outcome: 0 }));
  await seedResolved(env, [...overconfident(160, 41), ...bad]);
  await tick(env, feed([mk("x", 0.99)]), deps({}));
  const c = await get(env, "/api/charter");
  assert.equal(c.params.version, 2); assert.ok(c.params.recal.a < 0.7, JSON.stringify(c.params.recal)); assert.ok(c.params.domains_off.politics);
  assert.equal(c.evaluation_frozen.n, 0); assert.equal(c.graduation.ready, false); assert.ok(c.by_domain.tech.n >= 100 && c.by_domain.politics.n === 30);
  const acts = c.decisions.map((d) => d.action).join(" | ");
  assert.match(acts, /recalibration slope 1 -> /); assert.match(acts, /switch off the politics domain/); assert.match(acts, /start parameter version 2/);
  assert.ok(c.decisions.every((d) => d.rollback && d.assumption));
  await tick(env, feed([mk("y", 0.99)]), deps({})); // the next review changes nothing: weekly lock
  assert.equal((await get(env, "/api/charter")).params.version, 2);
});
test("a switched-off domain is not estimated, and a wide-spread market is skipped", async () => {
  const env = { TRADES_DB: fakeD1() }; let asked = [];
  await tick(env, feed([mk("seed", 0.99)]), deps({}));
  env.TRADES_DB._raw.exec("INSERT OR REPLACE INTO pt_control (key,value,updated_at) VALUES ('domains_off', '{\"politics\":\"2999-01-01T00:00:00.000Z\"}', 'x')");
  const spy = { news, models: ["a", "b", "c"], ask: async (m, n, model) => { asked.push(m.title); return JSON.stringify({ p: 0.5, confidence: "low", why: "w" }); } };
  await tick(env, feed([{ ...mk("senate", 0.5), title: "Will the Senate pass the bill?" }, { ...mk("wide", 0.5), spread: 0.2 }, mk("ok", 0.5, { spread: 0.02 })]), spy);
  assert.ok(asked.every((t) => /ok/.test(t)) && asked.length === 3, asked.join(","));
});
test("stakes follow fractional Kelly: a thin agreed edge risks less than the position cap", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("thin", 0.5)]), deps({ a: 0.6, b: 0.62, c: 0.64 }));
  const st = await get(env, "/api/state"); const o = st.open[0];
  assert.ok(Math.abs(o.qty * o.entry - 300) < 1, "quarter Kelly of a 6-point blended edge is 3% of equity: " + o.qty * o.entry);
});
test("the charter endpoint exposes the frozen sample, the split by domain, the parameters and the track record", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("v", 0.55)]), agree80);
  const c = await get(env, "/api/charter");
  for (const k of ["evaluation", "evaluation_frozen", "by_domain", "log_loss", "lead_hours", "params", "track_record", "calibration", "decisions", "graduation"]) assert.ok(k in c, k);
  assert.equal(c.params.version, 1); assert.equal(c.track_record.count, 1); assert.equal(c.mode, "paper");
});

test("a decision the position cap rejects is not marked traded (issue 8840)", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("seed", 0.5)]), deps({ a: 0.5, b: 0.5, c: 0.5 })); // initialises the schema, no trade
  const raw = env.TRADES_DB._raw;
  for (let i = 0; i < 8; i++) raw.exec("INSERT INTO pt_position (slug,title,side,qty,entry,strategy,opened_at) VALUES ('held" + i + "','held','yes',10,0.5,'signal','2026-01-01T00:00:00Z')");
  const r = await tick(env, feed([mk("vote", 0.55)]), agree80);
  assert.equal(r.opened, 0);
  assert.equal(raw.prepare("SELECT traded FROM pt_estimate WHERE slug='vote'").get().traded, 0, "no position, so not TRADED");
});
test("settlement polling rotates: twenty unresolved rows cannot hold every batch (issue 8840)", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("seed", 0.5)]), deps({ a: 0.5, b: 0.5, c: 0.5 }));
  const raw = env.TRADES_DB._raw;
  for (let i = 0; i < 25; i++) raw.prepare("INSERT INTO pt_estimate (slug,title,fair,market,confidence,ends_at,updated_at,traded) VALUES (?,?,?,?,?,?,?,?)").run("m" + String(i).padStart(2, "0"), "t", 0.6, 0.5, "high", new Date(Date.now() - 86400000 + i * 1000).toISOString(), "2026-01-01", 0);
  const asked = [];
  const bySlug = async (slugs) => { asked.push(...slugs); return slugs.map((s) => ({ slug: s, title: s, yes: s === "m24" ? 1 : 0.5, vol24: 0, move: 0, closed: 0, ends_at: null })); };
  await tick(env, feed([]), { ...deps({}), bySlug });
  assert.ok(!asked.includes("m24"), "the first batch is the 20 oldest");
  const r = await tick(env, feed([]), { ...deps({}), bySlug });
  assert.ok(asked.includes("m24"), "the second batch reaches the rows the first did not check");
  assert.equal(r.settled, 1);
  assert.equal(raw.prepare("SELECT outcome FROM pt_estimate WHERE slug='m24'").get().outcome, 1);
});
test("the charter reports the proof split by confidence once a level has enough resolved forecasts (issue 8840)", async () => {
  const env = { TRADES_DB: fakeD1() };
  await tick(env, feed([mk("seed", 0.5)]), deps({ a: 0.5, b: 0.5, c: 0.5 }));
  const c = await get(env, "/api/charter");
  assert.ok(c.evaluation && "by_confidence" in c.evaluation);
});

// ---- issue 9107: consistency and fake-date probes ----
const probeAsk = (script) => (m, n, model, opts = {}) => Promise.resolve(JSON.stringify({ p: opts.ask === "no" ? script.no : opts.daysBack ? script.fake : script.yes, confidence: "medium", why: "Three outlets report it (" + model + ")." }));
const sampledSlug = (() => { for (let i = 0; i < 500; i++) { const s = "vote" + i; if (probeSampledFor(s)) return s; } })();
function probeSampledFor(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % 100 < 20; }
const unsampledSlug = (() => { for (let i = 0; i < 500; i++) { const s = "plain" + i; if (!probeSampledFor(s)) return s; } })();
const pd = (script, slug) => ({ news, models: ["a", "b", "c"], ask: probeAsk(script) });
test("a probed market whose NO wording does not complement YES is recorded inconsistent and not traded", async () => {
  const env = { TRADES_DB: fakeD1() };
  const r = await tick(env, feed([mk(sampledSlug, 0.55)]), pd({ yes: 0.8, no: 0.6, fake: 0.8 }));
  assert.equal(r.opened, 0);
  const row = env.TRADES_DB._raw.prepare("SELECT confidence, traded, probe FROM pt_estimate WHERE slug=?").get(sampledSlug);
  assert.equal(row.confidence, "inconsistent"); assert.equal(row.traded, 0); assert.equal(JSON.parse(row.probe).complement.ok, false);
  const c = await get(env, "/api/charter");
  assert.equal(c.probes.n, 1); assert.equal(c.probes.inconsistent, 1); assert.equal(c.probes.inconsistent_share, 1);
});
test("a probed market whose answer moves with the stated date excludes that model, and a consistent one trades", async () => {
  const env = { TRADES_DB: fakeD1() };
  const r = await tick(env, feed([mk(sampledSlug, 0.55)]), pd({ yes: 0.8, no: 0.2, fake: 0.4 }));
  const row = env.TRADES_DB._raw.prepare("SELECT models, probe, traded FROM pt_estimate WHERE slug=?").get(sampledSlug);
  assert.equal(JSON.parse(row.models).length, 2, "the model that looked ahead is out of the ensemble"); assert.equal(JSON.parse(row.probe).fake.ok, false);
  const ok = { TRADES_DB: fakeD1() };
  const r2 = await tick(ok, feed([mk(sampledSlug, 0.55)]), pd({ yes: 0.8, no: 0.2, fake: 0.78 }));
  assert.equal(r2.opened, 1); assert.equal(JSON.parse(ok.TRADES_DB._raw.prepare("SELECT probe FROM pt_estimate WHERE slug=?").get(sampledSlug).probe).fake.ok, true);
});
test("an unsampled market is never probed, so the extra calls stay within the sample", async () => {
  const env = { TRADES_DB: fakeD1() }; let calls = 0;
  const ask = (m, n, model, opts) => { calls++; return probeAsk({ yes: 0.8, no: 0.2, fake: 0.8 })(m, n, model, opts); };
  await tick(env, feed([mk(unsampledSlug, 0.55)]), { news, models: ["a", "b", "c"], ask });
  assert.equal(calls, 3); assert.equal(env.TRADES_DB._raw.prepare("SELECT probe FROM pt_estimate WHERE slug=?").get(unsampledSlug).probe, null);
});
