// AIG-BINDING-1 (#1784) offline suite for qnfo-ai aiRunAttr. Run: node qnfo-ai/aig-binding.test.mjs
// Embedding calls go through AI Gateway "default" (cached 24h) with metadata {worker, purpose} on the log entry; a gateway
// error retries once on the plain binding; dynamic chat routes preserve explicit gateway options and attribution.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL " + m); } }

const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("async function aiRunAttr(");
const end = src.indexOf("\n// end aiRunAttr", start);
ok(start > 0 && end > start, "aiRunAttr found in worker.js");
const body = src.slice(start, end);
const spendRecords = [];
const make = new Function("AI_ATTR_DB_BINDINGS", "spendRecord", "spendUsageOf", "spendOutEstimate", "isDynamicRoute", body + "\nreturn aiRunAttr;");
const aiRunAttr = make([], (...args) => spendRecords.push(args), () => ({ in: 0, out: 0 }), () => 0, (model) => String(model).startsWith("dynamic/"));

function env(failGateway) {
  const calls = [];
  return { calls, AI: { async run(model, input, opts) { calls.push({ model, opts }); if (failGateway && opts && opts.gateway) throw new Error("gateway 429"); return { data: [[0.1]] }; } } };
}

// 1. an embedding call goes through the gateway with metadata
let e = env(false);
let r = await aiRunAttr(e, "qnfo-ai", "embed-search2", "@cf/baai/bge-base-en-v1.5", { text: ["q"] });
const g = e.calls[0] && e.calls[0].opts && e.calls[0].opts.gateway;
ok(r && r.data && e.calls.length === 1, "embedding call returns the binding result in one call");
ok(g && g.id === "default" && g.cacheTtl === 86400, "embedding call uses AI Gateway default with a 24h cache");
ok(g && g.metadata && g.metadata.worker === "qnfo-ai" && g.metadata.purpose === "embed-search2", "the gateway log entry carries metadata worker=qnfo-ai and the purpose");
ok(!g || !("skipCache" in g), "embedding calls may be served from the gateway cache");

// 2. a gateway failure falls back once to the plain binding
e = env(true);
r = await aiRunAttr(e, "qnfo-ai", "embed-index", "@cf/baai/bge-base-en-v1.5", { text: ["x"] });
ok(r && r.data && e.calls.length === 2 && e.calls[1].opts === undefined, "a gateway error retries once on the plain binding");

// 3. chat calls and explicit options are unchanged
e = env(false);
await aiRunAttr(e, "qnfo-ai", "chat", "@cf/zai-org/glm-4.7-flash", { messages: [] });
ok(e.calls.length === 1 && e.calls[0].opts === undefined, "chat calls do not go through the gateway option");
e = env(false);
const own = { gateway: { id: "other" } };
await aiRunAttr(e, "qnfo-ai", "embed-topic", "@cf/baai/bge-base-en-v1.5", { text: ["y"] }, own);
ok(e.calls.length === 1 && e.calls[0].opts === own, "a caller's own options are passed through unchanged");
e = env(false);
const gatewayOpts = { gateway: { id: "default", metadata: { worker: "qnfo-ai", purpose: "chat" } } };
await aiRunAttr(e, "qnfo-ai", "chat-dynamic", "dynamic/standard", { messages: [{ role: "user", content: "x" }] }, gatewayOpts);
const dynamicSpend = spendRecords[spendRecords.length - 1];
ok(e.calls.length === 1 && e.calls[0].model === "dynamic/standard" && e.calls[0].opts === gatewayOpts, "dynamic chat preserves its route and gateway options");
ok(dynamicSpend && dynamicSpend[1] === "gateway" && dynamicSpend[2] === "dynamic/standard", "dynamic chat accounting is attributed to the gateway route");

// 4. a chat error still propagates (no silent fallback)
const bad = { AI: { async run() { throw new Error("model down"); } } };
let threw = false;
try { await aiRunAttr(bad, "qnfo-ai", "chat", "m", {}); } catch (x) { threw = /model down/.test(String(x && x.message)); }
ok(threw, "a chat error propagates");

// 5. transient 502/504 errors retry the same dynamic route without adding a local fallback
const retryStart = src.indexOf("function __aiAttrEnv(");
const retryEnd = src.indexOf("\n// AIG-CALLER-METADATA-1", retryStart);
ok(retryStart > 0 && retryEnd > retryStart, "AI binding retry wrapper found in worker.js");
const retryContext = vm.createContext({
  SPEND_CHEAP_WA: "cheap-model",
  __AI_ATTR_RATES: {},
  d1AttrWriteSkip: () => true,
  setTimeout: (fn) => { queueMicrotask(fn); return 1; },
  clearTimeout() {},
  console: { log() {}, error() {} }
});
vm.runInContext(src.slice(retryStart, retryEnd) + "\nthis.wrapAI = __aiAttrEnv;", retryContext);
const wrappedCalls = (run) => {
  const calls = [];
  const wrapped = retryContext.wrapAI({ AI: { async run(model, input, opts) { calls.push(model); return run(model, input, opts); } }, QNFO_AUDIT: {} }, "qnfo-ai", "AI", "QNFO_AUDIT");
  return { calls, ai: wrapped.AI };
};
{
  let attempts = 0;
  const x = wrappedCalls(async () => {
    if (++attempts === 1) throw new Error("HttpServerError · HTTP 504");
    return { choices: [{ message: { content: "recovered" } }] };
  });
  const response = await x.ai.run("dynamic/standard", {}, {});
  ok(response.choices[0].message.content === "recovered" && x.calls.join() === "dynamic/standard,dynamic/standard", "dynamic route retries a transient HTTP 504 and returns its successful retry");
}
{
  let attempts = 0;
  const x = wrappedCalls(async () => {
    if (++attempts === 1) throw new Error("HttpServerError · HTTP 502");
    return { choices: [{ message: { content: "recovered from bad gateway" } }] };
  });
  const response = await x.ai.run("dynamic/standard", {}, {});
  ok(response.choices[0].message.content === "recovered from bad gateway" && x.calls.join() === "dynamic/standard,dynamic/standard", "dynamic route retries a transient HTTP 502 and returns its successful retry");
}
{
  const x = wrappedCalls(async () => { throw new Error("HttpServerError · HTTP 504"); });
  let failed504 = false;
  try { await x.ai.run("dynamic/standard", {}, {}); } catch (e) { failed504 = /HTTP 504/.test(e.message); }
  ok(failed504 && x.calls.length === 4 && x.calls.every((model) => model === "dynamic/standard"), "exhausted dynamic-route retries propagate without a provider fallback");
}
{
  const x = wrappedCalls(async (model) => {
    if (model === "primary") throw new Error("HttpServerError · HTTP 502");
    if (model === "cheap-model" && x.calls.filter((name) => name === model).length === 1) throw new Error("HTTP 502 Bad Gateway");
    return { choices: [{ message: { content: "fallback recovered" } }] };
  });
  const response = await x.ai.run("primary", {}, {});
  ok(response.choices[0].message.content === "fallback recovered" && x.calls.filter((model) => model === "primary").length === 4 && x.calls.filter((model) => model === "cheap-model").length === 2, "non-dynamic fallback also retries transient HTTP 502 responses");
}
{
  const x = wrappedCalls(async () => { throw new Error("invalid request"); });
  let failed = false;
  try { await x.ai.run("dynamic/standard", {}, {}); } catch (e) { failed = /invalid request/.test(e.message); }
  ok(failed && x.calls.length === 1, "non-transient dynamic-route errors are not retried");
}

ok(/var gwOpts = /.test(src), "the deployed source names gwOpts (the issue's source check)");

// 6. AI Gateway fetch retries 502 responses while preserving replayable request bodies.
const fetchStart = src.indexOf("var __aigBaseFetch =");
const fetchEnd = src.indexOf("\n// SPEND-GOVERNOR-1", fetchStart);
ok(fetchStart > 0 && fetchEnd > fetchStart, "AI Gateway fetch retry wrapper found in worker.js");
function wrappedFetch(statuses) {
  const calls = [];
  const context = vm.createContext({
    Headers, Request, Response, Date, Promise, Object, String, JSON, __AIG_WORKER: "qnfo-ai",
    setTimeout: (fn) => { queueMicrotask(fn); return 1; }
  });
  context.fetch = async (input, init) => {
    const request = typeof input === "string" ? new Request(input, init) : input;
    calls.push({ method: request.method, body: await request.clone().text(), metadata: request.headers.get("cf-aig-metadata") });
    return new Response("upstream", { status: statuses.shift() });
  };
  vm.runInContext(src.slice(fetchStart, fetchEnd), context);
  return { calls, fetch: context.fetch };
}
{
  const x = wrappedFetch([502, 200]);
  const response = await x.fetch("https://gateway.ai.cloudflare.com/v1/test", { method: "POST", body: "payload" });
  ok(response.status === 200 && x.calls.length === 2 && x.calls.every((call) => call.method === "POST" && call.body === "payload" && JSON.parse(call.metadata).worker === "qnfo-ai"), "a string-based gateway POST retries HTTP 502 and preserves its body and metadata");
}
{
  const x = wrappedFetch([502, 200]);
  const request = new Request("https://gateway.ai.cloudflare.com/v1/test", { method: "POST", body: "payload" });
  const response = await x.fetch(request);
  ok(response.status === 200 && x.calls.length === 2 && x.calls.every((call) => call.method === "POST" && call.body === "payload" && JSON.parse(call.metadata).worker === "qnfo-ai"), "a Request-based gateway POST retries HTTP 502 and preserves its body and metadata");
}
{
  const x = wrappedFetch([502, 502, 502]);
  const response = await x.fetch("https://gateway.ai.cloudflare.com/v1/test", { method: "POST", body: "payload" });
  ok(response.status === 502 && x.calls.length === 3, "gateway retries stop after two attempts when HTTP 502 persists");
}
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
