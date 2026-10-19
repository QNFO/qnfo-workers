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
check(ev && ev.args[0] === "cost-attribution-2026-10-06" && ev.args[4] === "gap" && /ON CONFLICT\(id\) DO UPDATE/.test(ev.sql) && /gateway \$33\.21 paid, ledger \$0\.44 \(owner-local \$0\.00\), gap 98\.7%/.test(ev.args[2]), "the day's cost-attribution event is upserted with the figures", ev && ev.args);
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

// 4. COST-OWNER-SPLIT-1 (0.34.3): the owner's own gateway client spend (ai_spend_owner_local) is not the fleet's cost. The real functions are loaded
// from worker.js: fleetCostAfterOwner (the cost_usd_30d basis and the 30-day fallback of the ai_spend caps) and costRunRate over the migration's own
// v_cost_run_rate SQL, seeded with the 2026-10-18 shape (the gateway day total equals the owner term).
const fa = src.indexOf("function fleetCostAfterOwner(");
check(fa > 0, "worker.js defines fleetCostAfterOwner");
const fleetCostAfterOwner = fa > 0 ? new Function("__name", src.slice(fa, src.indexOf("\n}\n", fa) + 2) + "\nreturn fleetCostAfterOwner;")(() => {}) : () => ({});
let sp = fleetCostAfterOwner({ anthropic: 97.03, deepseek: 12.5, "workers-ai": 30 }, [{ provider: "anthropic", usd: 97.03 }]);
check(sp.byProv.anthropic === 0 && sp.owner.anthropic === 97.03 && sp.byProv.deepseek === 12.5 && sp.total === 42.5 && sp.ownerUsd === 97.03, "an owner term equal to the provider's gateway cost leaves the fleet 0 of it", sp);
sp = fleetCostAfterOwner({ deepseek: 10, openai: 4 }, [{ provider: "DeepSeek", usd: 3.5 }]);
check(sp.byProv.deepseek === 6.5 && sp.owner.deepseek === 3.5 && sp.byProv.openai === 4 && sp.total === 10.5, "a partial owner term is subtracted per provider, case-insensitively", sp);
sp = fleetCostAfterOwner({ deepseek: 2 }, [{ provider: "deepseek", usd: 5 }, { provider: "mistral", usd: 9 }, { provider: "workers-ai", usd: 9 }]);
check(sp.byProv.deepseek === 0 && sp.owner.deepseek === 2 && sp.ownerUsd === 2 && !("mistral" in sp.owner) && sp.total === 0, "the owner term is capped at the provider's gateway cost; providers the gateway does not name and Workers AI are never taken", sp);
sp = fleetCostAfterOwner({ deepseek: 7, "workers-ai": 3 }, []);
check(sp.byProv.deepseek === 7 && sp.total === 10 && sp.ownerUsd === 0, "no owner rows (or an unreadable table) leave the measurement as it was", sp);
check(fleetCostAfterOwner(null, null).total === 0, "null inputs are a measured zero");
// the wiring: cost_usd_30d and the cap fallback read the fleet part; the account-wide figures stay in analytics_dash_meta
check(/var split = fleetCostAfterOwner\(byProv, /.test(src) && /bind\(split\.total\.toFixed\(2\), nowIso/.test(src), "cost_usd_30d is written from the fleet part");
check(/aiSpendCaps\(db, split\.byProv, split\.total, byBill, env\)/.test(src) && /\["ai_est_cost_30d", total\.toFixed\(2\)\]/.test(src), "the cap fallback reads the fleet part; ai_est_cost_30d keeps the account-wide figure");
check(/ai_spend_owner_local WHERE day >= date\('now','-30 days'\) GROUP BY lower\(provider\)/.test(src), "the owner term is read from ai_spend_owner_local over 30 days");
// the run-rate view of the migration with the 2026-10-18 shape: the ledger (scripts/cost_ledger.py) already wrote the fleet part as ai_gateway:* and the owner part as owner_gateway:*
const { DatabaseSync } = await import("node:sqlite");
const mig = readFileSync(join(here, "..", "migrations", "2026-10-19-cost-ledger-owner-split.sql"), "utf8");
const vstart = mig.indexOf("\nCREATE VIEW v_cost_run_rate AS") + 1;
const viewSql = mig.slice(vstart, mig.indexOf(";\n", vstart));
const cdb = new DatabaseSync(":memory:");
cdb.exec("CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0, requests INTEGER DEFAULT 0, note TEXT, updated_at TEXT, PRIMARY KEY (date, source))");
for (let k = 1; k <= 8; k++) {
  const day = new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
  for (const [s, usd] of [["workers_ai", 2], ["ai_gateway:anthropic", 0], ["ai_gateway:deepseek", 0.4], ["owner_gateway:anthropic", 97.03], ["cloudflare_plan:daily", 0.2], ["direct_providers_external:daily", 15]]) cdb.prepare("INSERT INTO cost_daily (date, source, usd) VALUES (?, ?, ?)").run(day, s, usd);
}
cdb.exec(viewSql);
const rrDb = { prepare(sql) { return { all: async () => ({ results: cdb.prepare(sql).all() }) }; } };
const ca = src.indexOf("async function costRunRate(");
const costRunRate = new Function("__name", src.slice(ca, src.indexOf("\n}\n", ca) + 2) + "\nreturn costRunRate;")(() => {});
const rrAll = Object.fromEntries(cdb.prepare("SELECT source_group, run_rate_30d_7d AS v FROM v_cost_run_rate").all().map((r) => [r.source_group, r.v]));
const rr = await costRunRate(rrDb, {});
check(rr.byProv.anthropic === 0 && rr.byProv.deepseek === 12 && !("owner_gateway:anthropic" in rr.byProv), "ai_spend:anthropic reads 0 when the owner term equals the gateway total (it read 651.63 against a cap of 15)", rr);
check(rrAll["total:cloudflare+gateway"] === 30 * (2 + 0.4 + 0.2) && rrAll["total:owner-gateway"] === 30 * 97.03, "fleet_cost_run_rate_usd's group holds no owner term; the owner term is its own measured group", rrAll);
check(Math.abs(rrAll["total:all-billing"] - 30 * (2 + 0.4 + 0.2 + 97.03 + 15)) < 1e-6, "total:all-billing still includes the owner rows (the owner's total monthly budget includes actual usage)", rrAll);
const vc = ((src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1)).map(Number);
check(vc.length === 3 && (vc[0] > 0 || vc[1] > 34 || (vc[1] === 34 && vc[2] >= 3)), "VERSION is at least 0.34.3 (the owner split)", vc);

console.log(fails ? fails + " FAILED" : "cost-attribution: all assertions passed");
process.exit(fails ? 1 : 0);
