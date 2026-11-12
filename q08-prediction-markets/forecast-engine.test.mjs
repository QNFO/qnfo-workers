// FORECAST-ENGINE-1 tests: node q08-prediction-markets/forecast-engine.test.mjs
import { readFileSync } from "node:fs";
import { classify, deadlineOf, familyKey, isotonic, termStructure, properEntities, matchEvidence, needsUpdate, buildPrompt, parseShift, combine, valueAdded, plan, renderPage, spinoffStatus, bootstrapCI, lastPerSlug, forecastOne, sha256Hex } from "./forecast-engine.mjs";
import { block, apply } from "./inline-forecast-engine.mjs";
import { newsQuery, parseGdelt, parseNewsRss, fetchNews, newsLane, tick, latestRows } from "./forecast-engine.mjs";
import { simulateBook, parseFredCsv, proxyMove, relatedPieces, storyData, renderStory, renderTrackRecord, flowHtml, proxyLane, usd } from "./forecast-engine.mjs";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema as ensureSchemaFor } from "./forecast-engine.mjs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x)); } };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const snap = JSON.parse(readFileSync(new URL("./forecast-demo/snapshot-2026-11-12.json", import.meta.url), "utf8"));
const now = Date.parse(snap.now);

// 1 select
ok(classify("Will there be no change in Fed interest rates after the December 2026 meeting?")?.key === "monetary", "Fed question is monetary");
ok(classify("Jensen Huang announced resignation or removal by December 31?")?.key === "leadership", "CEO removal is leadership");
ok(classify("Will Anthropic IPO by November 20, 2026?")?.key === "capital", "IPO is capital");
ok(classify("US announces end of Iranian blockade by December 31, 2026?")?.key === "energy-geopolitics", "blockade is energy");
for (const t of ["Buccaneers vs. Bears", "Will Bitcoin dip to $60,000 November 9-15?", "Will Kai Cenat finish his GTA marathon by November 11, 7:59 AM ET?", "Will Bilibili Gaming win Worlds 2026?", "Jensen Huang divorce in 2026?", "Rates cut next meeting (synthetic)"])
  ok(classify(t) === null, "trivial or synthetic dropped: " + t);

// 2 prior
ok(deadlineOf("Will Anthropic IPO by November 20, 2026?", 2026) === "2026-11-20", "deadline with year");
ok(deadlineOf("Jensen Huang announced resignation or removal by December 31?", 2026) === "2026-12-31", "deadline without year");
ok(deadlineOf("Will the U.S. invade Iran before 2027?", 2026) === "2026-12-31", "before a year");
ok(deadlineOf("Will there be no change in Fed interest rates after the December 2026 meeting?", 2026) === "2026-12-31", "month-year meeting");
ok(familyKey("Pete Hegseth out as Secretary of Defense by November 21?") === familyKey("Pete Hegseth out as Secretary of Defense by December 31?"), "legs share a family");
const iso = isotonic([0.455, 0.55, 0.155], [6, 6, 0.01], 1);
ok(iso[0] <= iso[1] && iso[1] <= iso[2] + 1e-9, "isotonic is monotone", iso);
ok(iso[2] > 0.5, "a stale low leg is pulled up to the fresh legs", iso);
const dec = isotonic([0.935, 0.745, 0.565], [1, 1, 1], -1);
ok(dec[0] >= dec[1] && dec[1] >= dec[2], "continues-through legs are non-increasing", dec);
const ts = termStructure(snap.markets.filter((m) => classify(m.title)), now);
const huang = ts.find((q) => q.slug === "jensen-huang-announced-resignation-or-removal-by-december-31");
ok(huang && huang.incoherent && huang.prior > huang.quoted + 0.3, "the stale Dec 31 Huang quote (15.5%) is flagged and repaired above the Nov 13 leg", huang && { q: huang.quoted, p: huang.prior });
ok(ts.every((q) => q.prior > 0 && q.prior < 1), "priors in (0,1)");

// 3 match
ok(properEntities("Jensen Huang announced resignation or removal by December 31?").join() === "jensen,huang", "proper entities skip stop words and months", properEntities("Jensen Huang announced resignation or removal by December 31?"));
const ev = matchEvidence(huang, snap.signals, { sinceMs: now - 21 * 86400000 });
ok(ev.length === 4 && ev.every((e) => /huang/i.test(e.title)), "Huang evidence is the four Huang headlines", ev.map((e) => e.title));
ok(matchEvidence({ title: "Will the U.S. invade Iran before 2027?" }, snap.signals).length === 0, "no Iran signals in the stream: no evidence, no tokens");

// 4 trigger
ok(needsUpdate(null, 0.5, ev).yes, "first forecast triggers");
ok(!needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev) }, 0.52, ev).yes, "same evidence, small move: skip");
ok(needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev) }, 0.56, ev).yes, "crowd moved 6 points: update");
ok(needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev.slice(1)) }, 0.5, ev).yes, "one new signal: update");

// 5 prompt stays small
const prompt = buildPrompt({ ...huang, title: huang.title }, ev, "2026-11-12");
ok(prompt.length < 2000 && prompt.includes("E2") && prompt.includes("54.2%"), "prompt is compact and carries the repaired prior", prompt.length);

// 6 gate
const ids = ["E1", "E2"];
ok(parseShift('{"shift": 0.5, "cites": ["E2"], "mechanism": "m", "watch": "w"}', ids).ok, "valid verdict");
ok(!parseShift('{"shift": 0.8, "cites": [], "mechanism": "m"}', ids).ok, "uncited shift rejected");
ok(!parseShift('{"shift": 0.8, "cites": ["E9"]}', ids).ok, "citation of unknown evidence rejected");
ok(!parseShift('{"shift": 3, "cites": ["E1"]}', ids).ok, "out-of-range shift rejected");
ok(!parseShift("I think it goes up", ids).ok, "prose rejected");
ok(parseShift('Sure. {"shift": 0, "cites": []}', ids).ok, "zero shift needs no citation");
const v = (s) => ({ ok: true, shift: s, cites: ["E1"] });
ok(combine(0.3, [v(0.5)]).p === 0.3, "one verdict: crowd stands");
ok(combine(0.3, [v(0.5), v(-0.5)]).p === 0.3, "opposite directions: crowd stands");
ok(combine(0.3, [v(0), v(0.5)]).p === 0.3, "only one model moves: crowd stands");
ok(combine(0.3, [v(0), v(0)]).p === 0.3, "both zero: crowd stands");
const up = combine(0.5, [v(2), v(2)]);
ok(near(up.shift, 1) && up.p < 0.74, "shift halved then capped at 1 logit", up);
// the real 2026-11-12 run
const answers = JSON.parse(readFileSync(new URL("./forecast-demo/answers-2026-11-12.json", import.meta.url), "utf8"));
const pl = plan(snap.markets, snap.signals, {}, now);
ok(pl.consequential === 16 && pl.skipped.trivial === 6, "snapshot: 16 consequential, 6 trivial", pl);
ok(pl.chosen.length === 3 && pl.chosen.every((q) => answers[q.slug]), "snapshot: three questions with fresh evidence are chosen", pl.chosen.map((q) => q.slug));
const today = "2026-11-12";
const res = {};
for (const q of pl.chosen) res[q.slug] = await forecastOne(q, async (m) => answers[q.slug].find((a) => a.model === m), today);
const h = res["jensen-huang-announced-resignation-or-removal-by-december-31"];
ok(near(h.p, 0.6445, 0.002) && h.tokens === 752, "Huang: 54.2% crowd -> 64.4%, 752 tokens", { p: h.p, t: h.tokens });
ok(res["will-anthropic-ipo-by-november-20-2026"].p === res["will-anthropic-ipo-by-november-20-2026"].prior, "Anthropic IPO: crowd stands");
ok(res["will-there-be-no-change-in-fed-interest-rates-after-the-december-2026-meeting-20260729232808635"].why.startsWith("only one model"), "Fed: one model moved, crowd stands");
const total = Object.values(res).reduce((a, r) => a + r.tokens, 0);
ok(total < 3000, "three forecasts cost under 3,000 tokens (q08 essays: ~2.6 million per published piece)", total);
const thrown = await forecastOne(pl.chosen[0], async () => { throw new Error("down"); }, today);
ok(thrown.p === thrown.prior, "model outage: crowd stands, nothing thrown");

// 7 ledger
ok(valueAdded([]).n === 0, "no resolved rows");
const va = valueAdded([{ prior: 0.5, p: 0.7, outcome: 1 }, { prior: 0.2, p: 0.2, outcome: 0 }]);
ok(va.n === 2 && va.value_added > 0, "moving toward the outcome adds value", va);
ok((await sha256Hex("a")).length === 64, "sha256");

// 7b spin-off gates and self-halt
const mk = (n, gain) => Array.from({ length: n }, (_, i) => ({ slug: "q" + i, prior: 0.5, p: gain > 0 ? 0.7 : 0.3, outcome: 1 }));
ok(spinoffStatus([]).next_gate === "prove" && !spinoffStatus([]).halted, "no settled forecasts: first gate, not halted");
const good = spinoffStatus(mk(60, 1));
ok(good.gates[0].passed && good.gates[1].passed && !good.gates[2].passed && good.next_gate === "spin-out" && !good.halted, "60 settled and clearly better than the crowd passes prove and attention", good);
const bad = spinoffStatus(mk(60, -1));
ok(bad.halted && bad.value_added < 0, "60 settled and provably worse than the crowd halts adjustments", bad);
ok(!spinoffStatus(mk(59, -1)).halted, "59 settled: too few to halt");
ok(lastPerSlug([{ slug: "a", p: 1 }, { slug: "a", p: 2 }, { slug: "b", p: 3 }]).length === 2, "one score per question");
ok(bootstrapCI([0.1, 0.1, 0.1]).lo > 0 && bootstrapCI([]) === null, "bootstrap interval");
// 8 page
const rows = Object.values(res).map((r) => ({ ...r, evidence_json: JSON.stringify(r.evidence), verdicts_json: JSON.stringify(r.verdicts), hash: "abc" }));
const head = (t, d, css) => `<meta name="viewport" content="width=device-width"><title>${t}</title><style>${css}</style>`;
const page = renderPage(rows, { value: { n: 0 }, tokens_per: 748 }, head);
ok(page.includes("Forecasts that move money") && page.includes("64.4%") && page.includes("+10 pts vs crowd"), "page renders the forecasts");
ok(page.includes("inconsistent with the other dates"), "page explains the repaired stale quote");
ok(renderPage([], {}, head).includes("No forecasts yet"), "empty state says what happens next");
// 3b news lane (NEWS-LANE-1, issue 11057): a starved family is fetched for by its own entities
ok(newsQuery("Will the U.S. invade Iran before 2027?", "energy-geopolitics") === "iran oil", "a short entity takes its category hint", newsQuery("Will the U.S. invade Iran before 2027?", "energy-geopolitics"));
ok(newsQuery("Pete Hegseth out as Secretary of Defense by November 21?", "officials-rules") === "pete hegseth secretary defense", "names make the query", newsQuery("Pete Hegseth out as Secretary of Defense by November 21?", "officials-rules"));
ok(newsQuery("Will there be no change in Fed interest rates after the December 2026 meeting?", "monetary") === "fed interest rates", "Fed question searches the Fed and rates");
ok(parseGdelt("Please limit requests to one every 5 seconds") === null, "GDELT's plain-text refusal is an error, not zero articles");
const gd = parseGdelt(JSON.stringify({ articles: [{ title: "Iran says strait stays open", url: "https://ex.com/a", seendate: "20261111T093000Z" }, { title: "", url: "https://ex.com/b" }] }));
ok(gd.length === 1 && gd[0].created_at === "2026-11-11 09:30:00", "GDELT rows parse with their seen time", gd);
const rss = parseNewsRss('<rss><channel><item><title><![CDATA[Fed holds interest rates steady &amp; signals patience - Reuters]]></title><link>https://news.example/x</link><pubDate>Wed, 11 Nov 2026 14:00:00 GMT</pubDate></item></channel></rss>');
ok(rss.length === 1 && rss[0].title === "Fed holds interest rates steady & signals patience" && rss[0].created_at === "2026-11-11 14:00:00", "Google News RSS parses and drops the publisher suffix", rss);
const fakeFetch = (gdeltOk) => async (url) => {
  if (url.includes("gdeltproject")) return gdeltOk ? { ok: true, status: 200, text: JSON.stringify({ articles: [{ title: "Iran warns over oil tanker seizures", url: "https://ex.com/iran1", seendate: "20261111T080000Z" }, { title: "Iran oil exports fall", url: "https://ex.com/iran2", seendate: "20261110T080000Z" }] }) } : { ok: true, status: 200, text: "Please limit requests" };
  return { ok: true, status: 200, text: '<item><title>Fed officials split on December rate cut - AP</title><link>https://news.example/fed</link><pubDate>Wed, 11 Nov 2026 14:00:00 GMT</pubDate></item>' };
};
ok((await fetchNews("iran oil", fakeFetch(true))).source === "gdelt", "GDELT answers first");
const fb = await fetchNews("fed interest rates", fakeFetch(false));
ok(fb.source === "gnews" && fb.items.length === 1 && fb.tried[0] === "gdelt:error 200", "a GDELT refusal falls through to Google News", fb);
function d1(db) {
  const st = (sql) => { let args = []; const o = { bind: (...a) => { args = a; return o; },
    all: async () => ({ results: db.prepare(sql).all(...args) }), first: async () => db.prepare(sql).get(...args) || null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } }; return o; };
  return { prepare: st };
}
const sq = new DatabaseSync(":memory:");
sq.exec("CREATE TABLE pt_market (slug TEXT, title TEXT, yes REAL, vol24 REAL, updated_at TEXT, ends_at TEXT, closed INTEGER DEFAULT 0)");
const sigdb = new DatabaseSync(":memory:");
sigdb.exec("CREATE TABLE signal_log (source TEXT, title TEXT, url TEXT, created_at TEXT)");
sigdb.prepare("INSERT INTO signal_log VALUES ('hn','Show HN: a faster SQLite','https://hn/1', datetime('now'))").run();
const nowT = Date.now(), upd = new Date(nowT - 3600e3).toISOString(), dl = new Date(nowT + 40 * 86400e3);
const mon = dl.toLocaleString("en-US", { month: "long", timeZone: "UTC" }), dd = dl.getUTCDate();
sq.prepare("INSERT INTO pt_market (slug,title,yes,vol24,updated_at,ends_at) VALUES (?,?,?,?,?,?)").run("iran-q", `Will the U.S. invade Iran by ${mon} ${dd}, ${dl.getUTCFullYear()}?`, 0.08, 1000, upd, dl.toISOString());
sq.prepare("INSERT INTO pt_market (slug,title,yes,vol24,updated_at,ends_at) VALUES (?,?,?,?,?,?)").run("bucs", "Buccaneers vs. Bears", 0.5, 1000, upd, dl.toISOString());
const asks = [];
const env = { TRADES_DB: d1(sq), SIGNAL_DB: d1(sigdb), __fetchText: fakeFetch(true),
  AI: { run: async (m, b) => { asks.push(m); return { response: '{"shift": 0.2, "cites": ["E1"], "mechanism": "Tanker seizures raise the odds of escalation.", "watch": "Strait traffic"}', usage: { prompt_tokens: 300, completion_tokens: 40 } }; } } };
const tk = await tick(env, nowT);
ok(tk.news.length === 1 && tk.news[0].source === "gdelt" && tk.news[0].added === 2, "the starved Iran family is fetched once and stores two rows", tk.news);
ok(tk.updated === 1 && asks.length === 2, "the Iran question now has evidence and is forecast by both models", tk);
ok(tk.coverage["energy-geopolitics"].with_evidence === 1, "coverage counts the question as covered after the fetch", tk.coverage);
const tk2 = await tick(env, nowT + 60e3);
ok(tk2.news.length === 0, "a covered family is not fetched again", tk2.news);
sq.prepare("DELETE FROM fe_signal").run();
const tk3 = await tick(env, nowT + 120e3);
ok(tk3.news.length === 0, "a family fetched within newsRefetchMin is not fetched again even when it has no rows", tk3.news);
ok((await tick({ ...env, FE_NEWS: "off" }, nowT + 4 * 3600e3)).news.length === 0, "FE_NEWS=off stops the lane");
const lr = await latestRows(env);
ok(lr.stats.coverage && lr.stats.news_signals && lr.rows.length === 1, "latestRows carries coverage and the news-signal counts", lr.stats);
const covPage = renderPage([], { coverage: { "energy-geopolitics": { legs: 3, with_evidence: 1 } } }, (t, d, c) => "");
ok(covPage.includes("Coverage: 1 of 3 questions have fresh evidence") && covPage.includes("Energy and geopolitics: 1 of 3"), "the page shows coverage by category");
// the deployed copy inside worker.js and its mirror is the current module
for (const f of ["worker.js", "deployed-current.worker.js"]) {
  const t = readFileSync(new URL("./" + f, import.meta.url), "utf8");
  ok(apply(t) === t && t.includes(block()), f + " holds the current FORECAST-ENGINE-1 block (run node q08-prediction-markets/inline-forecast-engine.mjs)");
}
const W = (await import("./worker.js")).default;
const fp = await (await W.fetch(new Request("https://t.invalid/forecasts"), {})).text();
ok(fp.includes("No forecasts yet") && /<body class="ds">/.test(fp), "the /forecasts route renders its empty state without a database");
const lp = await W.fetch(new Request("https://t.invalid/living-paper"), {});
ok(lp.status === 301 && lp.headers.get("location") === "/whitepaper", "/living-paper lands on the white paper");
const hj = await (await W.fetch(new Request("https://t.invalid/health"), {})).json();
ok(hj.features.includes("forecasts"), "health lists the forecasts feature");

// VALUE-PIPELINE-1: forecasts become simulated positions, marked to the live market, losses included
{
  const rows = [
    { slug: "a", title: "A?", created_at: "2026-11-12T10:00:00Z", prior: 0.40, p: 0.40, outcome: null },
    { slug: "a", title: "A?", created_at: "2026-11-12T11:00:00Z", prior: 0.40, p: 0.50, outcome: null },
    { slug: "a", title: "A?", created_at: "2026-11-12T12:00:00Z", prior: 0.45, p: 0.45, outcome: null },
    { slug: "b", title: "B?", created_at: "2026-11-12T10:00:00Z", prior: 0.80, p: 0.70, outcome: 1 },
    { slug: "c", title: "C?", created_at: "2026-11-12T10:00:00Z", prior: 0.30, p: 0.30, outcome: null },
  ];
  const bk = simulateBook(rows, { a: 0.6 });
  const a = bk.positions.find((x) => x.slug === "a"), b = bk.positions.find((x) => x.slug === "b");
  ok(bk.positions.length === 2 && bk.totals.with_crowd === 1, "only forecasts that leave the crowd hold a position", bk.totals);
  ok(a.side === "YES" && near(a.entry, 0.40) && near(a.value, 150) && near(a.pnl, 50) && a.marked_live, "YES bought at the crowd price on the first disagreement, marked to the live price, no hindsight exit", a);
  ok(near(a.expected_pnl, 25), "expected P&L at entry is stake x (belief / price - 1)", a);
  ok(b.side === "NO" && b.settled && near(b.pnl, -100), "a settled losing NO position loses its whole stake and is shown", b);
  ok(bk.totals.losses === 1 && bk.totals.wins === 0 && near(bk.totals.pnl, -50) && near(bk.totals.realized, -100) && near(bk.totals.unrealized, 50), "totals carry realized losses and unrealized gains", bk.totals);
  const junk = simulateBook([{ slug: "j", title: "J?", created_at: "x", prior: 0.47, p: 0.57, outcome: null }], { j: 0.9995 });
  ok(junk.positions[0].mark === 0.47 && !junk.positions[0].marked_live && /incoherent/.test(junk.positions[0].mark_source), "a live quote far from the coherent price never marks the position", junk.positions[0]);
  ok(simulateBook([]).totals.positions === 0 && simulateBook([]).totals.return_pct === null, "an empty ledger is an empty book");
  const csv = "observation_date,DCOILBRENTEU\n2026-11-01,70.5\n2026-11-02,.\n2026-11-03,72.0\n2026-11-04,71.25\n";
  const pts = parseFredCsv(csv);
  ok(pts.length === 3 && pts[2].value === 71.25, "FRED CSV parses and skips missing days", pts);
  const mv = proxyMove(pts, "2026-11-02T09:00:00Z");
  ok(mv.start === 70.5 && mv.now === 71.25 && near(mv.change, 0.75), "the proxy move runs from the last close on or before the forecast", mv);
  ok(proxyMove([], "2026-11-01") === null, "no proxy data, no move");
  const rel = relatedPieces("Jensen Huang announced resignation or removal by December 31?", [{ slug: "x", title: "Nvidia's Jensen Huang and the export rules", published_at: "2026-11-01" }, { slug: "y", title: "Grid batteries", published_at: "2026-11-02" }]);
  ok(rel.length === 1 && rel[0].url === "https://q08.org/p/x", "a q08 report naming the question's people links to it", rel);
  ok(usd(-12.5) === "−$12.50" && usd(1000) === "$1,000.00", "money is written as money");
  // storyData over real tables: the forecast ledger, the market, the q08 signal stream and the paper desk
  const vq = new DatabaseSync(":memory:"), vs = new DatabaseSync(":memory:");
  const vdb = d1(vq);
  await ensureSchemaFor(vdb);
  vq.exec("CREATE TABLE pt_market (slug TEXT PRIMARY KEY, title TEXT, yes REAL, vol24 REAL, move REAL, closed INTEGER, source TEXT, updated_at TEXT, ends_at TEXT)");
  vq.exec("CREATE TABLE pt_account (id INTEGER PRIMARY KEY, cash REAL, start_cash REAL)"); vq.exec("INSERT INTO pt_account VALUES (1, 9000, 10000)");
  vq.exec("CREATE TABLE pt_position (slug TEXT, title TEXT, side TEXT, qty REAL, entry REAL, strategy TEXT, opened_at TEXT, closed_at TEXT, exit REAL, pnl REAL, reason TEXT)");
  vq.exec("INSERT INTO pt_position VALUES ('m','M?','yes',100,0.5,'s','2026-11-10',NULL,NULL,NULL,NULL), ('k','K?','no',50,0.4,'s','2026-11-09','2026-11-10',0.1,-15,'stop')");
  vq.exec("CREATE TABLE pt_equity (ts TEXT, equity REAL)"); vq.exec("INSERT INTO pt_equity VALUES ('2026-11-10',10000),('2026-11-11',9100)");
  vq.exec("CREATE TABLE pt_estimate (slug TEXT, fair REAL, market REAL, outcome INTEGER)"); vq.exec("INSERT INTO pt_estimate VALUES ('k',0.7,0.9,1),('j',0.4,0.1,0)");
  vq.exec("INSERT INTO pt_market VALUES ('m','M?',0.6,1,0,0,'polymarket','x',NULL), ('jh','Jensen Huang out by December 31?',0.25,1,0,0,'polymarket','x',NULL)");
  const fut = new Date(Date.now() + 20 * 86400e3).toISOString().slice(0, 10), ca = new Date(Date.now() - 3 * 86400e3).toISOString();
  vq.prepare("INSERT INTO fe_forecast (created_at, slug, title, deadline, category, moves, prior, p, hash) VALUES (?,?,?,?,?,?,?,?,?)").run(ca, "jh", "Jensen Huang out by December 31?", fut, "leadership", "Nvidia shares.", 0.20, 0.30, "h1");
  vq.prepare("INSERT INTO fe_proxy (series, date, value) VALUES (?,?,?)").run("NASDAQ100", new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10), 20000);
  vq.prepare("INSERT INTO fe_proxy (series, date, value) VALUES (?,?,?)").run("NASDAQ100", new Date().toISOString().slice(0, 10), 20200);
  vs.exec("CREATE TABLE signal_log (source TEXT, title TEXT, url TEXT, created_at TEXT)"); vs.exec("INSERT INTO signal_log VALUES ('news','x','u',datetime('now')),('hn','y','v',datetime('now'))");
  vs.exec("CREATE TABLE published_pieces (slug TEXT, title TEXT, core_concept TEXT, published_at TEXT)"); vs.exec("CREATE TABLE q08_retractions (slug TEXT)");
  vs.exec("INSERT INTO published_pieces VALUES ('nv','What Jensen Huang leaving would mean','succession','2026-11-11'), ('gone','Huang retracted','x','2026-11-10')"); vs.exec("INSERT INTO q08_retractions VALUES ('gone')");
  const sd = await storyData({ TRADES_DB: vdb, SIGNAL_DB: d1(vs) });
  const f0 = sd.forecasts.list[0];
  ok(sd.signals.last_7d === 2 && sd.forecasts.open === 1 && sd.forecasts.disagree === 1 && sd.forecasts.mean_edge_pts === 10, "story counts signals, forecasts and edge", { s: sd.signals, f: sd.forecasts });
  ok(f0.position && f0.position.side === "YES" && near(f0.position.pnl, 25), "the live forecast carries its simulated position marked at 25 cents", f0.position);
  ok(f0.proxy && f0.proxy.id === "NASDAQ100" && f0.proxy.change === 200, "the leadership question carries its equity proxy", f0.proxy);
  ok(f0.related.length === 1 && f0.related[0].url.endsWith("/p/nv"), "a retracted report is never linked", f0.related);
  ok(sd.pilot.equity === 9060 && sd.pilot.realized === -15 && sd.pilot.losses === 1, "the paper desk shows its equity and its loss", sd.pilot);
  ok(sd.estimator.n === 2 && sd.estimator.brier_model > sd.estimator.brier_market, "the estimator's losing record against the market is published", sd.estimator);
  const stg = Object.fromEntries(sd.stages.map((g) => [g.key, g]));
  ok(sd.stages.length === 4 && stg.edge.met === true && stg.edge.value === 10 && stg.forecast.met === null && stg.value.met === null, "each stage carries its target and its verdict; no settled data reads as awaiting data", sd.stages);
  const sp = renderStory(sd, head), tr = renderTrackRecord(sd, head);
  ok(sp.includes("Target 2 points or more") && tr.includes("The pipeline's targets"), "the targets are on both pages");
  ok(sp.includes("Signals in. Forecasts out. Value measured.") && sp.includes("Forecasts that move money") && sp.includes("Simulated position:") && sp.includes("https://q08.org/p/nv") && sp.includes("Nasdaq-100"), "the pipeline page links signals, forecasts, positions, reports and the financial proxy");
  ok(sp.includes('href="https://q08.org/"') && sp.includes('href="https://markets.q08.org/track-record"'), "one navigation spans q08.org and markets.q08.org");
  ok(tr.includes("+$25.00") && tr.includes("−$15.00") && tr.includes("<svg class=\"vp-spark\""), "the track record shows the gain and the loss and the equity curve");
  ok(flowHtml(sd).includes("4 · Value captured"), "the four stages render for q08.org's front door");
  const empty = await storyData({});
  ok(empty.empty && renderStory(empty, head).includes("No forecasts yet") && renderTrackRecord(empty, head).includes("No position yet"), "both pages render their empty states with no database");
  const got = [];
  const lane = await proxyLane(vdb, async (u) => { got.push(u); return { ok: true, status: 200, text: "observation_date,X\n2026-11-03,4.1\n" }; }, Date.now());
  ok(lane.filter((x) => x.points === 1).length === 5 && got.every((u) => u.startsWith("https://fred.stlouisfed.org/graph/fredgraph.csv?id=")), "the proxy lane fetches each FRED series once", lane);
  const lane2 = await proxyLane(vdb, async () => { throw new Error("should not fetch"); }, Date.now());
  ok(lane2.every((x) => x.skipped === "fresh"), "a fresh series is not fetched again within six hours", lane2);
  const W2 = (await import("./worker.js")).default;
  for (const path of ["/", "/track-record", "/paper"]) {
    const html = await (await W2.fetch(new Request("https://t.invalid" + path), {})).text();
    ok(html.includes('class="vp-nav"') && html.includes("https://q08.org/#reports"), path + " carries the shared q08 navigation");
  }
  const sj = await (await W2.fetch(new Request("https://t.invalid/api/story"), {})).json();
  ok(sj.engine === "VALUE-PIPELINE-1" && typeof sj.flow_html === "string", "/api/story serves the pipeline for q08.org", sj);
}
console.log("forecast-engine: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
