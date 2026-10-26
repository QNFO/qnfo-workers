// OPS-CF-ANALYTICS-LEDGER-1 offline suite (qnfo-ops 2.59.0, agent_issues 1000043). No network: the Cloudflare GraphQL API is a stub and qnfo-audit is a real node:sqlite database with the
// cost_daily and cloud_ops_events tables. Measured 2026-10-24: cf_analytics read 3,432,758 neurons ($37.76) for 30 days while cost_daily (the same dataset, per day, 10k free neurons a day,
// $0.011 per 1k) held $288.60; the query asked for 100 groups where date x modelId over 30 days is 300 to 600 (fixed in 2.58.2 by limit 10000), and a wrong "the spend is fine" verdict
// was drawn from the feed alone. This suite proves the cross-check that keeps that from recurring unseen: the answer carries the group count and a truncated flag, the cost after the
// daily free neurons (the ledger's arithmetic), the models ranked by neurons, and the ledger total for the same window with a ratio and a mismatch flag; a ratio outside 0.9 to 1.1 or a
// full group list writes one audit row per three hours; a GraphQL error is an error, not zero spend; a missing audit binding degrades to the plain feed.
// Run: node --no-warnings qnfo-ops/cf-analytics-ledger.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const a = src.indexOf("var CF_AI_FREE_NEURONS_PER_DAY"), b = src.indexOf('__name(cfAnalytics, "cfAnalytics");', a);
ok(a > 0 && b > a, "cfAnalytics and its constants are found");
ok(src.includes("aiInferenceAdaptiveGroups(limit: 10000"), "the query asks for 10000 groups, not 100");
ok(src.indexOf('{ name: "cf_analytics", description') > 0 && /cf_analytics", description: "[^"]*ledger \{cost_usd, ratio, mismatch\}/.test(src), "the tool description names the ledger cross-check");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0, requests INTEGER DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, note TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (date, source));" +
  "CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null }; return s; } };
let gql = null, queries = [];
globalThis.fetch = async (url, init) => { queries.push(JSON.parse(init.body).query); return new Response(JSON.stringify(gql), { status: 200 }); };
let n = 0;
const make = new Function("CF_ACCOUNT_ID", "iso", "randId", "VERSION", "console", src.slice(a, b).replace(/\n__name\w*\(cfAnalytics.*$/gm, "") + "\nreturn cfAnalytics;");
const cfAnalytics = make("acct", () => new Date().toISOString(), (p) => p + (++n), "2.59.0-test", console);

const today = new Date();
const days = Array.from({ length: 30 }, (_, i) => new Date(today.getTime() - (29 - i) * 864e5).toISOString().slice(0, 10));
const models = ["@cf/zai-org/glm-5.3", "@cf/zai-org/glm-5.3-flash", "@cf/moonshotai/kimi-k2.7-code", "@cf/openai/gpt-oss-120b", "@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/baai/bge-base-en-v1.5", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/nvidia/nemotron-3-120b-a12b"];
const mkRows = (perDayModel) => days.flatMap((d, di) => models.map((m, mi) => ({ sum: { totalNeurons: perDayModel(di, mi) }, dimensions: { date: d, modelId: m } })));
const reply = (rows) => ({ data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: rows }] } } });
const seedLedger = (rows) => { db.exec("DELETE FROM cost_daily"); const byDay = {}; rows.forEach((r) => { byDay[r.dimensions.date] = (byDay[r.dimensions.date] || 0) + r.sum.totalNeurons; }); for (const d in byDay) db.prepare("INSERT INTO cost_daily (date, source, usd, requests) VALUES (?, 'workers_ai', ?, 100)").run(d, Math.max(0, byDay[d] - 1e4) * 0.011 / 1e3); };

(async () => {
  // 1. 300 groups, the ledger holds the same dataset: ratio 1, no mismatch, no audit row, models ranked
  let rows = mkRows((di, mi) => 40000 + mi * 5000 + di * 100);
  gql = reply(rows); seedLedger(rows); db.exec("DELETE FROM cloud_ops_events"); queries = [];
  let r = await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: AUDIT });
  const neurons = rows.reduce((s, x) => s + x.sum.totalNeurons, 0);
  ok(r.ok && r.ai_30d.neurons === neurons && r.ai_30d.groups === 300 && r.ai_30d.truncated === false, "the feed sums every group and reports 300 groups, not truncated", r.ai_30d && { n: r.ai_30d.neurons, g: r.ai_30d.groups });
  const billable = days.reduce((s, d) => s + Math.max(0, rows.filter((x) => x.dimensions.date === d).reduce((t, x) => t + x.sum.totalNeurons, 0) - 1e4), 0);
  ok(Math.abs(r.ai_30d.billable_cost_usd - Math.round(billable * 0.011 / 1e3 * 100) / 100) < 0.011 && r.ai_30d.billable_cost_usd < r.ai_30d.est_cost_usd, "billable_cost_usd takes the 10k free neurons off each day", { b: r.ai_30d.billable_cost_usd, e: r.ai_30d.est_cost_usd });
  ok(r.ai_30d.ledger && r.ai_30d.ledger.mismatch === false && Math.abs(r.ai_30d.ledger.ratio - 1) < 0.02 && r.ai_30d.ledger.days === 30, "the ledger total for the same window agrees (ratio near 1)", r.ai_30d.ledger);
  ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n === 0, "no audit row while the feed and the ledger agree");
  ok(r.ai_30d.by_model.length === 8 && r.ai_30d.by_model[0].neurons >= r.ai_30d.by_model[7].neurons && r.ai_30d.by_model[0].model === "@cf/nvidia/nemotron-3-120b-a12b" && r.ai_30d.other_neurons > 0 && r.ai_30d.by_model.reduce((s, m) => s + m.neurons, 0) + r.ai_30d.other_neurons === neurons, "by_model is ranked by neurons and the rest is other_neurons (the models add up to the total)", r.ai_30d.by_model.map((m) => m.neurons));
  ok(/limit: 10000/.test(queries[0]) && /date_geq/.test(queries[0]), "the query keeps limit 10000 and the 30 day window");

  // 2. the 2026-10-24 shape: the feed reads far below the ledger -> mismatch, one audit row, deduped for three hours
  const shortRows = rows.slice(0, 40);
  gql = reply(shortRows);
  r = await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: AUDIT });
  ok(r.ai_30d.ledger.mismatch === true && r.ai_30d.ledger.ratio < 0.5, "a feed far below the ledger is flagged as a mismatch", r.ai_30d.ledger);
  let ev = db.prepare("SELECT kind, text, status FROM cloud_ops_events").all();
  ok(ev.length === 1 && ev[0].kind === "cf_analytics_ledger_mismatch" && /ratio/.test(ev[0].text) && ev[0].status === "warn", "one cf_analytics_ledger_mismatch audit row is written", ev);
  await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: AUDIT });
  ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n === 1, "a second call inside three hours writes no second row");

  // 3. a full group list is flagged as truncated, whatever the ledger says
  db.exec("DELETE FROM cloud_ops_events");
  const big = Array.from({ length: 10000 }, (_, i) => ({ sum: { totalNeurons: 100 }, dimensions: { date: days[i % 30], modelId: "m" + (i % 333) } }));
  gql = reply(big); seedLedger(big);
  r = await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: AUDIT });
  ok(r.ai_30d.truncated === true && r.ai_30d.groups === 10000, "10000 groups is reported as truncated", { t: r.ai_30d.truncated, g: r.ai_30d.groups });
  ev = db.prepare("SELECT kind FROM cloud_ops_events").all();
  ok(ev.length === 1 && ev[0].kind === "cf_analytics_truncated", "a truncated feed writes a cf_analytics_truncated audit row", ev);

  // 4. a GraphQL error answer is an error, not zero spend
  gql = { errors: [{ message: "rate limit" }], data: null };
  r = await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: AUDIT });
  ok(r.ok && r.ai_30d && r.ai_30d.error && /GraphQL/.test(r.ai_30d.error) && r.ai_30d.neurons === undefined, "an errors-only GraphQL answer reads as an error and not as zero neurons", r.ai_30d);

  // 5. no audit binding: the plain feed, no ledger field, no crash; no token: the old refusal
  gql = reply(rows);
  r = await cfAnalytics({ CF_API_TOKEN: "x" });
  ok(r.ok && r.ai_30d.neurons === neurons && r.ai_30d.ledger === undefined, "without QNFO_AUDIT the feed answers without a ledger field", r.ai_30d && Object.keys(r.ai_30d));
  r = await cfAnalytics({ QNFO_AUDIT: AUDIT });
  ok(r.ok === false && /CF_API_TOKEN/.test(r.error), "without CF_API_TOKEN the tool refuses as before");

  // 6. a broken ledger read is reported on the ledger field and does not fail the feed
  gql = reply(rows);
  r = await cfAnalytics({ CF_API_TOKEN: "x", QNFO_AUDIT: { prepare() { throw new Error("D1 down"); } } });
  ok(r.ok && r.ai_30d.neurons === neurons && r.ai_30d.ledger && /D1 down/.test(r.ai_30d.ledger.error), "a failing ledger read is reported on ai_30d.ledger.error and the feed still answers", r.ai_30d.ledger);

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
