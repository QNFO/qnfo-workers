// OWNER-LOCAL-INGEST-1 offline suite (qnfo-fleet-control 0.11.0, 1b in 0.11.1, agent_issues 2080, pillar cost).
// Replays the COST-ATTRIBUTION-GAP-1 and OWNER-LOCAL-INGEST-1 blocks of worker.js in a sandbox with a scripted Cloudflare
// API (gateway list, gateway logs, GraphQL) and real SQL (node:sqlite behind a D1-shaped shim). Proves: a log row is classed
// by its cf-aig-metadata tag (untagged -> owner-local, tagged by a fleet worker with no ledger of its own -> that worker,
// tagged by a self-writing router -> skipped); cached, Workers AI and costless rows are skipped; rows at or before the cursor
// are skipped and the cursor advances to the newest row; the ingest writes ai_spend_owner_local and ai_spend_ledger, saves a
// per-gateway cursor, is idempotent on a second run, fails soft on a logs error and hard on an unreadable gateway list; and
// the gap tick counts the owner-local table as attributed. 1b: the logs request carries the API filters (cost gt 0, provider
// neq workers-ai, created_at gt cursor) and pages oldest first; a backfill larger than OL_MAX_PAGES pages continues on the
// next run from the cursor with nothing lost or double counted (more/remaining); the v1 cursor key is removed.
// Run: node --no-warnings qnfo-fleet-control/owner-local-ingest.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const A = src.indexOf("// ---- COST-ATTRIBUTION-GAP-1:BEGIN");
const END = "// ---- OWNER-LOCAL-INGEST-1:END ----";
const B = src.indexOf(END);
if (A < 0 || B < A) { console.error("FAIL blocks not found in worker.js"); console.log("1 failed"); process.exit(1); }
const vmatch = /^var VERSION = "([^"]+)"/m.exec(src);
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; };

let passed = 0, failed = 0;
function ok(c, label, extra) { if (c) { passed++; return; } failed++; console.error("FAIL " + label + (extra !== undefined ? "  -- " + JSON.stringify(extra).slice(0, 500) : "")); }
ok(vmatch && atLeast(vmatch[1], "0.11.0"), "VERSION is 0.11.0 or later", vmatch && vmatch[1]);

// ---- D1 shim ----
function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));
    CREATE TABLE ai_spend_owner_local (day TEXT NOT NULL, gateway TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, PRIMARY KEY (day, gateway, provider, model));
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE analytics_dash_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
    INSERT INTO metric_registry (metric) VALUES ('cost_attribution_gap_pct');`);
  const wrap = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a.map((v) => (v === undefined ? null : v)); return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return st;
  };
  return { prepare: wrap, _db: db };
}

// ---- the scripted Cloudflare API ----
const api = { gateways: [{ id: "qnfo" }], logs: {}, gatewayStatus: 200, logsStatus: 200, graphql: null, calls: [] };
const resp = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeFetch = async (url, opts) => {
  const u = String(url); api.calls.push(u);
  if (u.indexOf("/ai-gateway/gateways?") >= 0) return api.gatewayStatus === 200 ? resp(200, { success: true, result: api.gateways }) : resp(api.gatewayStatus, { success: false, errors: [{ message: "nope" }] });
  // OWNER-LOCAL-INGEST-1b: the API applies the request's filters (cost gt 0, provider neq workers-ai, created_at gt cursor)
  // and pages oldest first; result_info.total_count is the filtered total, as the live API answers (probed 2026-10-07).
  const m = /\/ai-gateway\/gateways\/([^/]+)\/logs\?per_page=(\d+)&page=(\d+)&order_by=created_at&order_by_direction=asc&filters=([^&]+)$/.exec(u);
  if (m) {
    if (api.logsStatus !== 200) return resp(api.logsStatus, { success: false, errors: [{ message: "forbidden" }] });
    const per = Number(m[2]), page = Number(m[3]), filters = JSON.parse(decodeURIComponent(m[4]));
    const keep = (r) => filters.every((f) => {
      const v = r[f.key];
      if (f.operator === "gt") return typeof v === "string" ? v > String(f.value[0]) : Number(v) > Number(f.value[0]);
      if (f.operator === "neq") return v !== f.value[0];
      if (f.operator === "eq") return v === f.value[0];
      throw new Error("unexpected filter " + JSON.stringify(f));
    });
    const all = (api.logs[decodeURIComponent(m[1])] || []).filter(keep).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    return resp(200, { success: true, result: all.slice((page - 1) * per, page * per), result_info: { page, per_page: per, count: Math.min(per, Math.max(0, all.length - (page - 1) * per)), total_count: all.length } });
  }
  if (u.indexOf("/graphql") >= 0) return resp(200, api.graphql || { data: { viewer: { accounts: [{ aiGatewayRequestsAdaptiveGroups: [] }] } } });
  return resp(404, { success: false });
};
const sandbox = { __name: (f) => f, fetch: fakeFetch, AbortSignal, console, __export: null, VERSION: vmatch ? vmatch[1] : "0.11.0", encodeURIComponent };
vm.createContext(sandbox);
vm.runInContext(src.slice(A, B + END.length) + "\n__export = { olMeta, olProvider, olClassify, olAggregate, olLogsUrl, ownerLocalIngest, costAttributionTick, costAttributionGap, OL_PAGE, OL_MAX_PAGES, OL_SELF_WRITERS, OL_CURSOR_KEY, OL_CURSOR_KEY_V1 };", sandbox);
const W = sandbox.__export;

// ---- 1. pure parts ----
ok(JSON.stringify(W.olMeta({ worker: "x" })) === '{"worker":"x"}' && W.olMeta('{"worker":"y"}').worker === "y" && JSON.stringify(W.olMeta("{bad")) === "{}" && JSON.stringify(W.olMeta(null)) === "{}", "olMeta reads an object, a JSON string, and nothing from a bad or absent value");
ok(W.olProvider({ provider: "compat", model: "deepseek/deepseek-flash" }) === "deepseek" && W.olProvider({ provider: "Workers-AI" }) === "workers-ai" && W.olProvider({ provider: "openai", model: "gpt-5.5" }) === "openai", "olProvider normalises compat and case");
const row = (over) => Object.assign({ created_at: "2026-10-07T08:00:00Z", provider: "deepseek", model: "deepseek-flash", cost: 0.01, tokens_in: 1000, tokens_out: 100, cached: false, metadata: null }, over || {});
ok(W.olClassify(row()).kind === "owner-local" && W.olClassify(row()).caller === "owner-local", "an untagged paid request is owner-local");
ok(W.olClassify(row({ metadata: { worker: "qnfo-ops" } })).kind === "fleet" && W.olClassify(row({ metadata: { worker: "qnfo-ops" } })).caller === "qnfo-ops", "a request tagged by a fleet worker with no ledger of its own is that worker's");
ok(W.olClassify(row({ metadata: '{"caller":"personal-api"}' })).caller === "personal-api", "a metadata string with a caller key is read");
ok(W.olClassify(row({ metadata: { worker: "qnfo-ai" } })).kind === "skip" && /self-writer/.test(W.olClassify(row({ metadata: { worker: "qnfo-ai" } })).why), "a request tagged by the router is left to the router's own ledger rows");
ok(W.olClassify(row({ provider: "workers-ai", model: "@cf/x" })).kind === "skip" && W.olClassify(row({ cached: true })).kind === "skip" && W.olClassify(row({ cost: 0 })).kind === "skip" && W.olClassify(row({ cost: null })).kind === "skip", "Workers AI, cached and costless rows are skipped");
const rows = [
  row({ created_at: "2026-10-07T08:03:00Z", cost: 0.5 }),
  row({ created_at: "2026-10-07T08:02:00Z", cost: 0.25, model: "deepseek-v4-pro" }),
  row({ created_at: "2026-10-06T23:59:00Z", cost: 0.1 }),
  row({ created_at: "2026-10-07T08:01:00Z", cost: 0.02, metadata: { worker: "qnfo-ops" } }),
  row({ created_at: "2026-10-07T08:01:30Z", cost: 0.03, metadata: { worker: "qnfo-ai" } }),
  row({ created_at: "2026-10-07T07:00:00Z", cost: 9 }),   // at the cursor: already ingested
  row({ created_at: "2026-10-07T06:00:00Z", cost: 9 }),   // before the cursor
];
const agg = W.olAggregate(rows, "2026-10-07T07:00:00Z");
ok(agg.seen === 7 && agg.taken === 3 && agg.skipped.cursor === 3 && agg.skipped["self-writer qnfo-ai"] === 1 && agg.max === "2026-10-07T08:03:00Z", "olAggregate takes the rows after the cursor (the 2026-10-06 row is before it), skips the self-writer, advances the cursor to the newest row", agg);
const ownerKeys = Object.keys(agg.owner).sort();
ok(ownerKeys.length === 2 && agg.owner["2026-10-07|deepseek|owner-local|deepseek-flash"].usd === 0.5 && agg.owner["2026-10-07|deepseek|owner-local|deepseek-v4-pro"].usd === 0.25 && Math.abs(agg.owner_usd - 0.75) < 1e-9, "owner-local rows are bucketed per day and model", ownerKeys);
const agg2 = W.olAggregate(rows, "2026-10-06T00:00:00Z");
ok(agg2.taken === 6 && Object.keys(agg2.owner).length === 3 && agg2.owner["2026-10-06|deepseek|owner-local|deepseek-flash"].usd === 0.1, "an older cursor takes the 2026-10-06 row into its own day bucket", Object.keys(agg2.owner));
ok(Object.keys(agg.ledger).length === 1 && agg.ledger["2026-10-07|deepseek|qnfo-ops|deepseek-flash"].calls === 1 && Math.abs(agg.fleet_usd - 0.02) < 1e-9, "the fleet direct caller gets its own ledger bucket", agg.ledger);
ok(W.olAggregate([], "c").taken === 0 && W.olAggregate(null, "c").max === "c", "no rows: nothing taken, cursor kept");

// ---- 2. the ingest end to end ----
const env = { CF_API_TOKEN: "t" };
const NOW = "2026-10-07T09:00:00.000Z";
{
  const d1 = makeD1();
  api.logs = { qnfo: rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
  api.calls = [];
  const r = await W.ownerLocalIngest(env, d1, "acct", NOW);
  const owner = d1._db.prepare("SELECT day, gateway, provider, model, calls, ROUND(usd, 4) AS usd FROM ai_spend_owner_local ORDER BY day, model").all();
  const ledger = d1._db.prepare("SELECT day, provider, caller, model, calls, ROUND(usd, 4) AS usd FROM ai_spend_ledger").all();
  const cur = d1._db.prepare("SELECT value FROM ops_config WHERE key = 'owner_local_cursor_v2:qnfo'").get();
  // first run: cursor = now - 7d, so every row in the fixture is after it (the two 'cursor' rows above are after too)
  ok(r.gateways === 1 && r.taken === 6 && r.pages === 1 && Math.abs(r.owner_usd - 18.85) < 1e-9 && Math.abs(r.fleet_usd - 0.02) < 1e-9, "first run reaches back 7 days and takes every paid, tagged-or-not, non-router row", r);
  // 1b: the request carries the three API filters with the 7-day cursor, oldest first
  const q = /[?&]filters=([^&]+)/.exec(api.calls.find((u) => /\/logs\?/.test(u)) || "");
  const flt = q ? JSON.parse(decodeURIComponent(q[1])) : null;
  ok(flt && flt.length === 3 && flt[0].key === "cost" && flt[0].operator === "gt" && flt[0].value[0] === 0 && flt[1].key === "provider" && flt[1].operator === "neq" && flt[1].value[0] === "workers-ai" && flt[2].key === "created_at" && flt[2].operator === "gt" && flt[2].value[0] === "2026-09-30T09:00:00.000Z", "1b: the logs request filters cost gt 0, provider neq workers-ai, created_at gt the cursor (now - 7d on the first run)", flt);
  ok(/order_by=created_at&order_by_direction=asc&filters=/.test(api.calls.find((u) => /\/logs\?/.test(u)) || "") && W.olLogsUrl("B", "g w", "C", 2).indexOf("B/ai-gateway/gateways/g%20w/logs?per_page=" + W.OL_PAGE + "&page=2&order_by=created_at&order_by_direction=asc&filters=") === 0, "1b: oldest first, gateway id and filters URL-encoded", api.calls);
  ok(r.by_gateway.qnfo.more === false && r.by_gateway.qnfo.remaining === 0, "1b: one page: nothing more, nothing remaining", r.by_gateway);
  ok(owner.length === 3 && owner.every((o) => o.gateway === "qnfo" && o.provider === "deepseek") && ledger.length === 1 && ledger[0].caller === "qnfo-ops", "owner-local rows go to ai_spend_owner_local, the fleet direct caller to ai_spend_ledger", { owner, ledger });
  ok(cur && cur.value === "2026-10-07T08:03:00Z", "the per-gateway cursor is the newest created_at", cur);
  const meta = d1._db.prepare("SELECT value FROM analytics_dash_meta WHERE key = 'owner_local_cost_usd_30d'").get();
  ok(meta && meta.value === "18.85", "owner_local_cost_usd_30d is written for the dashboard", meta);
  const ev = d1._db.prepare("SELECT id, text, status FROM cloud_ops_events WHERE kind = 'owner-local-ingest'").all();
  ok(ev.length === 1 && ev[0].id === "owner-local-ingest-2026-10-07" && /6 paid requests attributed/.test(ev[0].text) && /owner-local \$18\.85/.test(ev[0].text), "one owner-local-ingest event per day", ev);
  // second run: the same log, nothing after the cursor
  api.calls = [];
  const r2 = await W.ownerLocalIngest(env, d1, "acct", NOW);
  const owner2 = d1._db.prepare("SELECT ROUND(SUM(usd), 4) AS usd, SUM(calls) AS calls FROM ai_spend_owner_local").get();
  ok(r2.taken === 0 && Math.abs(owner2.usd - 18.85) < 1e-9 && owner2.calls === 5, "a second run over the same log adds nothing (cursor)", { r2, owner2 });
  ok(api.calls.filter((u) => /\/logs\?/.test(u)).length === 1, "the second run stops at the first page, at the cursor", api.calls);
  // a new request after the cursor is added, nothing re-counted
  api.logs.qnfo.unshift(row({ created_at: "2026-10-07T08:30:00Z", cost: 1 }));
  const r3 = await W.ownerLocalIngest(env, d1, "acct", NOW);
  const owner3 = d1._db.prepare("SELECT ROUND(SUM(usd), 4) AS usd, SUM(calls) AS calls FROM ai_spend_owner_local").get();
  ok(r3.taken === 1 && Math.abs(owner3.usd - 19.85) < 1e-9 && owner3.calls === 6 && d1._db.prepare("SELECT value FROM ops_config WHERE key = 'owner_local_cursor_v2:qnfo'").get().value === "2026-10-07T08:30:00Z", "a newer request is added and moves the cursor", { r3, owner3 });
}
// paging: more rows than one page after the cursor; the row before the cursor is filtered by the API; the v1 key is removed
{
  const d1 = makeD1();
  d1._db.prepare("INSERT INTO ops_config (key, value) VALUES ('owner_local_cursor_v2:qnfo', '2026-10-07T00:00:00Z')").run();
  d1._db.prepare("INSERT INTO ops_config (key, value) VALUES ('owner_local_cursor:qnfo', '2026-10-07T16:00:28.873Z')").run(); // 0.11.0's cursor
  const many = [];
  for (let i = 0; i < W.OL_PAGE + 10; i++) many.push(row({ created_at: "2026-10-07T0" + (i < 60 ? "1" : "2") + ":" + String(59 - (i % 60)).padStart(2, "0") + ":00Z", cost: 0.01 }));
  many.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  many.push(row({ created_at: "2026-10-06T23:00:00Z", cost: 5 })); // before the cursor: the API filter leaves it out
  many.push(row({ created_at: "2026-10-07T01:30:30Z", cost: 0, provider: "deepseek" })); // costless: left out
  many.push(row({ created_at: "2026-10-07T01:30:40Z", cost: 0.2, provider: "workers-ai", model: "@cf/x" })); // Workers AI: left out
  api.logs = { qnfo: many };
  api.calls = [];
  const r = await W.ownerLocalIngest(env, d1, "acct", NOW);
  ok(r.pages === 2 && r.taken === W.OL_PAGE + 10 && r.by_gateway.qnfo.seen === W.OL_PAGE + 10 && Math.abs(r.owner_usd - (W.OL_PAGE + 10) * 0.01) < 1e-6 && r.by_gateway.qnfo.more === false, "paging continues while pages are full; the API filters leave the pre-cursor, costless and Workers AI rows out", r);
  ok(api.calls.filter((u) => /\/logs\?/.test(u)).every((u) => /created_at%22%2C%22operator%22%3A%22gt%22%2C%22value%22%3A%5B%222026-10-07T00%3A00%3A00Z%22%5D/.test(u)), "every page of one tick filters on the same cursor", api.calls);
  ok(d1._db.prepare("SELECT value FROM ops_config WHERE key = 'owner_local_cursor_v2:qnfo'").get().value === "2026-10-07T01:59:00Z" && !d1._db.prepare("SELECT value FROM ops_config WHERE key = 'owner_local_cursor:qnfo'").get(), "the v2 cursor is the newest row ingested (the 60 fixture rows are 01:00..01:59) and the v1 key is gone", d1._db.prepare("SELECT key, value FROM ops_config").all());
}
// 1b: a backfill larger than OL_MAX_PAGES pages continues on the next run from the cursor, nothing lost, nothing double counted
{
  const d1 = makeD1();
  const cap = W.OL_MAX_PAGES * W.OL_PAGE, extra = 7, t0 = Date.parse("2026-10-05T00:00:00Z");
  const many = [];
  for (let i = 0; i < cap + extra; i++) many.push(row({ created_at: new Date(t0 + i * 1000).toISOString(), cost: 0.001 }));
  api.logs = { qnfo: many };
  api.calls = [];
  const r1 = await W.ownerLocalIngest(env, d1, "acct", NOW);
  ok(r1.pages === W.OL_MAX_PAGES && r1.taken === cap && r1.by_gateway.qnfo.more === true && r1.by_gateway.qnfo.remaining === extra && r1.by_gateway.qnfo.cursor === new Date(t0 + (cap - 1) * 1000).toISOString(), "a first run reads OL_MAX_PAGES full pages, reports more and the rows remaining, and leaves the cursor on the last row it ingested", { pages: r1.pages, taken: r1.taken, gw: r1.by_gateway.qnfo });
  api.calls = [];
  const r2 = await W.ownerLocalIngest(env, d1, "acct", NOW);
  const tot = d1._db.prepare("SELECT SUM(calls) AS calls, ROUND(SUM(usd), 6) AS usd FROM ai_spend_owner_local").get();
  ok(r2.pages === 1 && r2.taken === extra && r2.by_gateway.qnfo.more === false && r2.by_gateway.qnfo.remaining === 0 && tot.calls === cap + extra && Math.abs(tot.usd - (cap + extra) * 0.001) < 1e-6, "the next run takes the rest from the cursor: every row counted once", { r2: r2.by_gateway.qnfo, tot });
  const r3 = await W.ownerLocalIngest(env, d1, "acct", NOW);
  ok(r3.taken === 0 && r3.pages === 1, "and then nothing", r3.by_gateway);
}
// two gateways, one with a logs error: the other is still ingested and the error is recorded
{
  const d1 = makeD1();
  api.gateways = [{ id: "qnfo" }, { id: "personal" }];
  api.logs = { qnfo: [row({ created_at: "2026-10-07T08:00:00Z", cost: 0.4 })], personal: [row({ created_at: "2026-10-07T08:00:00Z", cost: 0.6 })] };
  const r = await W.ownerLocalIngest(env, d1, "acct", NOW);
  ok(r.gateways === 2 && r.taken === 2 && Math.abs(r.owner_usd - 1) < 1e-9 && d1._db.prepare("SELECT COUNT(*) AS n FROM ai_spend_owner_local WHERE gateway = 'personal'").get().n === 1, "every gateway is read; rows carry their gateway", r);
  api.logsStatus = 403;
  const d2 = makeD1();
  const r2 = await W.ownerLocalIngest(env, d2, "acct", NOW);
  ok(r2.taken === 0 && r2.by_gateway.qnfo.error === "logs HTTP 403" && r2.by_gateway.personal.error === "logs HTTP 403", "a logs error is recorded per gateway, nothing thrown, nothing written", r2);
  api.logsStatus = 200; api.gatewayStatus = 500;
  let threw = null;
  try { await W.ownerLocalIngest(env, d2, "acct", NOW); } catch (e) { threw = String(e.message); }
  ok(/gateway list unreadable HTTP 500/.test(threw || ""), "an unreadable gateway list throws (the tick records it as skipped)", threw);
  api.gatewayStatus = 200; api.gateways = [{ id: "qnfo" }];
  const r4 = await W.ownerLocalIngest({}, d2, "acct", NOW);
  ok(r4.skipped === "no CF_API_TOKEN" && r4.taken === 0, "no token: skipped, not thrown", r4);
}

// ---- 3. the gap tick counts the owner-local table ----
{
  const d1 = makeD1();
  d1._db.prepare("INSERT INTO ai_spend_ledger (day, provider, caller, model, calls, usd) VALUES (date('now'), 'deepseek', 'qnfo-research-exec', 'deepseek-chat', 10, 0.44)").run();
  api.graphql = { data: { viewer: { accounts: [{ aiGatewayRequestsAdaptiveGroups: [{ count: 100, sum: { cost: 22.21 }, dimensions: { provider: "deepseek", model: "deepseek-flash" } }, { count: 5, sum: { cost: 0 }, dimensions: { provider: "workers-ai", model: "@cf/x" } }] }] } } };
  const before = await W.costAttributionTick({}, d1, "acct", { Authorization: "Bearer t" }, NOW);
  ok(before.gap_pct === 98 && before.ledger_usd === 0.44, "without owner-local rows the gap reads 98 (the 2026-10-07 measurement)", before);
  d1._db.prepare("INSERT INTO ai_spend_owner_local (day, gateway, provider, model, calls, usd) VALUES (date('now'), 'qnfo', 'deepseek', 'deepseek-flash', 90, 21.5)").run();
  const after = await W.costAttributionTick({}, d1, "acct", { Authorization: "Bearer t" }, NOW);
  const ev = d1._db.prepare("SELECT text, meta, status FROM cloud_ops_events WHERE kind = 'cost-attribution'").get();
  ok(after.gap_pct === 1.2 && after.ledger_usd === 21.94 && ev.status === "ok" && /owner-local \$21\.50/.test(ev.text) && JSON.parse(ev.meta).owner_local_usd === 21.5, "with the owner-local table attributed the gap reads 1.2 and the event names the owner-local share", { after, ev });
  ok(d1._db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'cost_attribution_gap_pct'").get().last_value === "1.2", "metric_registry carries the new value");
}

console.log("owner-local-ingest: " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
