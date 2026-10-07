// COST-ATTRIBUTION-GAP-1 (transformation lever T4.7, pillar cost): cost_attribution_gap_pct compares the AI Gateway's paid
// list cost over 7 days with the fleet's own spend ledger (ai_spend_ledger) over the same days, per provider, and names the
// models with the largest unattributed cost. Run: node qnfo-fleet-control/cost-attribution.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- COST-ATTRIBUTION-GAP-1:BEGIN"), src.indexOf("// ---- COST-ATTRIBUTION-GAP-1:END"));
const byProv = src.slice(src.indexOf("function aiSpendByProvider(rows) {"), src.indexOf("__name(aiSpendByProvider"));
let fetchCalls = [];
let graphRows = null;
const sandbox = {
  VERSION: "0.4.139-test", __name: (f) => f, AbortSignal, JSON, Math, Object, Number, String, Array, Date,
  fetch: async (url, init) => { fetchCalls.push({ url, body: init && init.body }); return { json: async () => (graphRows === null ? { errors: [{ message: "boom" }] } : { data: { viewer: { accounts: [{ aiGatewayRequestsAdaptiveGroups: graphRows }] } } }) }; }
};
vm.createContext(sandbox);
vm.runInContext(byProv + "\n" + block + "\n__export = { costAttributionGap, costAttributionTick, COST_GAP_MIN_USD };", sandbox);
const { costAttributionGap, costAttributionTick, COST_GAP_MIN_USD } = sandbox.__export;
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); if (!c) fails++; };

// 1. the pure comparison (the figures read by hand on 2026-10-06: gateway $33.21 paid in 7 days, ledger $0.44 DeepSeek)
let g = costAttributionGap({ deepseek: 29.5, openai: 3.71 }, [{ provider: "deepseek", usd: 0.44 }, { provider: "workers-ai", usd: 4.08 }]);
check(g.gateway_usd === 33.21 && g.ledger_usd === 0.44 && g.gap_pct === 98.7 && g.measured === true, "gap = 100 x (1 - ledger / gateway) over paid providers; Workers AI ledger rows are not counted", g);
check(g.by_provider.deepseek.gap_pct === 98.5 && g.by_provider.deepseek.unattributed_usd === 29.06 && g.by_provider.openai.gap_pct === 100 && g.by_provider.openai.ledger_usd === 0, "per provider: DeepSeek 98.5% unattributed, OpenAI 100%", g.by_provider);
g = costAttributionGap({ deepseek: 0.3 }, []);
check(g.gap_pct === 0 && g.measured === false && COST_GAP_MIN_USD === 0.5, "under $0.50 of gateway cost the gap reads 0 and is not a measurement", g);
g = costAttributionGap({ deepseek: 2 }, [{ provider: "deepseek", usd: 2.4 }, { provider: "gateway", usd: 0.1 }]);
check(g.gap_pct === 0 && g.ledger_usd === 2.5 && g.by_provider.gateway.gateway_usd === 0 && g.by_provider.gateway.gap_pct === 0, "a ledger above the gateway (prices differ) floors at 0; a ledger provider the gateway does not name is listed with 0 gateway cost", g);
g = costAttributionGap({}, []);
check(g.gap_pct === 0 && g.gateway_usd === 0 && Object.keys(g.by_provider).length === 0, "nothing on either side is a measured zero", g);

// 2. the tick: one 7-day GraphQL read, one ledger read, the metric and the day's event
const writes = [];
let ownerRows = [];
const db = {
  prepare(sql) {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      // OWNER-LOCAL-INGEST-1 (0.11.0): the tick also reads ai_spend_owner_local; ownerRows scripts that answer
      async all() { return { results: /ai_spend_owner_local/.test(sql) ? ownerRows : [{ provider: "deepseek", usd: 0.44 }, { provider: "workers-ai", usd: 4.08 }] }; },
      async run() { writes.push({ sql, args }); return { meta: { changes: 1 } }; }
    };
    return s;
  }
};
graphRows = [
  { count: 12246, sum: { cost: 19.87 }, dimensions: { provider: "deepseek", model: "deepseek-flash" } },
  { count: 1076, sum: { cost: 9.63 }, dimensions: { provider: "deepseek", model: "deepseek-v4-pro" } },
  { count: 745, sum: { cost: 3.71 }, dimensions: { provider: "compat", model: "openai/gpt-5.6" } },
  { count: 1301, sum: { cost: 1.75 }, dimensions: { provider: "workers-ai", model: "@cf/deepseek-ai/deepseek-v4-flash-0731" } }
];
const r = await costAttributionTick({}, db, "acct1", { Authorization: "Bearer x" }, "2026-10-06T10:00:00Z");
check(fetchCalls.length === 1 && /graphql/.test(fetchCalls[0].url) && /aiGatewayRequestsAdaptiveGroups/.test(fetchCalls[0].body) && /datetime_geq/.test(fetchCalls[0].body), "one GraphQL read over the gateway requests", fetchCalls);
const since = /datetime_geq: \\"([^"\\]+)/.exec(fetchCalls[0].body);
check(since && Math.abs(Date.parse("2026-10-06T10:00:00Z") - Date.parse(since[1]) - 7 * 864e5) < 1000, "the read covers the 7 days before the tick", since && since[1]);
check(r.gap_pct === 98.7 && r.gateway_usd === 33.21 && r.ledger_usd === 0.44, "the tick reports the gap from the gateway rows (compat rows credited to their model's provider) and the ledger", r);
const m = writes.find((w) => /metric='cost_attribution_gap_pct'/.test(w.sql));
check(m && m.args[0] === "98.7" && m.args[1] === "2026-10-06T10:00:00Z" && /state='MEASURED'/.test(m.sql), "cost_attribution_gap_pct is written with the tick", m);
const ev = writes.find((w) => /cloud_ops_events/.test(w.sql));
check(ev && ev.args[0] === "cost-attribution-2026-10-06" && ev.args[4] === "gap" && /ON CONFLICT\(id\) DO UPDATE/.test(ev.sql) && /gateway \$33\.21 paid, ledger \$0\.44, gap 98\.7%/.test(ev.args[2]), "the day's cost-attribution event is upserted with the figures", ev && ev.args);
const meta = JSON.parse(ev.args[3]);
check(meta.top_models[0].model === "deepseek/deepseek-flash" && meta.top_models[0].gateway_usd === 19.87 && meta.top_models[2].model === "openai/openai/gpt-5.6" && meta.by_provider.openai.gap_pct === 100 && meta.v === "0.4.139-test", "the meta names the models with the largest cost and the per-provider gap", meta);
// 2b. OWNER-LOCAL-INGEST-1 (0.11.0): the owner's untagged client spend, attributed in ai_spend_owner_local, counts as attributed
writes.length = 0; fetchCalls = []; ownerRows = [{ provider: "deepseek", usd: 29.06 }];
const r2 = await costAttributionTick({}, db, "acct1", { Authorization: "Bearer x" }, "2026-10-06T10:00:00Z");
check(r2.gap_pct === 11.2 && r2.ledger_usd === 29.5 && r2.gateway_usd === 33.21, "the gap counts the owner-local table next to the ledger (0.44 + 29.06 of 33.21)", r2);
const ev2 = writes.find((w) => /cloud_ops_events/.test(w.sql));
check(ev2 && ev2.args[4] === "ok" && /ledger \$29\.50 \(owner-local \$29\.06\), gap 11\.2%/.test(ev2.args[2]) && JSON.parse(ev2.args[3]).owner_local_usd === 29.06, "the event names the owner-local share and reads ok under 25", ev2 && ev2.args[2]);
ownerRows = [];
// 3. an unreadable gateway writes nothing and reports why
writes.length = 0; fetchCalls = []; graphRows = null;
let threw = null;
try { await costAttributionTick({}, db, "acct1", {}, "2026-10-06T11:00:00Z"); } catch (e) { threw = String(e && e.message || e); }
check(threw && /aiGatewayRequestsAdaptiveGroups unreadable/.test(threw) && writes.length === 0, "an unreadable GraphQL answer throws (the caller records it under skipped) and writes nothing", { threw, writes: writes.length });

console.log(fails ? fails + " FAILED" : "cost-attribution: all assertions passed");
process.exit(fails ? 1 : 0);
