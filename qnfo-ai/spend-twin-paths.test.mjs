import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const calls = [], records = [];
let response, rejected = false, action = "allow", fleetHit = null;
const sb = {
  console, Response, ReadableStream, AbortSignal, setTimeout, clearTimeout, DEFAULT_MAX_OUT: 8192,
  DYNAMIC_ROUTES: ["dynamic/value", "dynamic/standard", "dynamic/premium"],
  GW_COMPAT: "https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions",
  clampTokens: (n) => n || 2048,
  spendGovern: async () => ({ action }),
  fleetSteerLoad: async () => ({}),
  fleetPaidCapHit: () => fleetHit,
  spendInEstimate: () => 10,
  spendOutEstimate: () => 5,
  spendUsageOf: () => ({ in: 10, out: 5, cached: 2 }),
  spendRecord: (...args) => records.push(args),
  spendMeterStream: (_env, resp) => resp,
  extractWAContent: (r) => r?.choices?.[0]?.message?.content || "",
  extractWAToolCalls: (r) => r?.choices?.[0]?.message?.tool_calls || null,
  async aiRunAttr(_env, worker, purpose, model, input, opts) {
    calls.push({ worker, purpose, model, input, opts });
    if (rejected) throw new Error("route exhausted");
    return response;
  },
  async fetch(url, opts) {
    calls.push({ url, input: JSON.parse(opts.body), headers: opts.headers });
    return response;
  }
};
vm.createContext(sb);
vm.runInContext(cut("function isDynamicRoute(", "var MODEL_ALIASES") +
  cut("async function runDynamicChat(", "function stripToolMarkup(") +
  "\nthis.run = runDynamicChat;", Object.assign(sb, { __name() {}, __name2() {}, __name22() {} }));

const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }];
for (const route of sb.DYNAMIC_ROUTES) {
  calls.length = 0;
  response = { model: "actual-serving-model", choices: [{ message: { content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }] } }] };
  const result = await sb.run({ AI: {} }, route, [{ role: "user", content: "look up" }], 512, false, { tools, tool_choice: "required", temperature: 0.2, top_p: 0.9, reasoning_effort: "high" });
  assert.equal(result, response);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, route);
  assert.equal(calls[0].opts.gateway.id, "default");
  assert.equal(calls[0].input.tools, tools);
  assert.equal(calls[0].input.tool_choice, "required");
  assert.equal(calls[0].input.reasoning_effort, "high");
  assert.equal(calls[0].input.model, undefined);
}
for (const hit of ["ledger", "fleet"]) {
  calls.length = 0;
  action = hit === "ledger" ? "downgrade" : "allow";
  fleetHit = hit === "fleet" ? "cap reached" : null;
  await sb.run({ AI: {} }, "dynamic/premium", [], 512, false);
  assert.equal(calls[0].model, "dynamic/value");
}
action = "allow"; fleetHit = null;
rejected = true; calls.length = 0;
await assert.rejects(sb.run({ AI: {} }, "dynamic/standard", [], 512, false), /route exhausted/);
assert.equal(calls.length, 1);
rejected = false;
response = { choices: [{ message: { content: "" } }] };
await assert.rejects(sb.run({ AI: {} }, "dynamic/standard", [], 512, false), /no content or tool calls/);

calls.length = 0;
response = new Response(JSON.stringify({ model: "actual-serving-model", choices: [{ message: { content: "OK" } }] }), { headers: { "cf-aig-model": "gpt-example", "cf-aig-provider": "openai" } });
await sb.run({ CF_API_TOKEN: "test" }, "dynamic/standard", [], 512, false, { tools, tool_choice: "required" });
assert.equal(calls[0].url, sb.GW_COMPAT);
assert.equal(calls[0].input.model, "dynamic/standard");
assert.equal(calls[0].input.tools[0].function.name, "lookup");
assert.equal(records.at(-1)[1], "openai");
assert.equal(records.at(-1)[2], "gpt-example");

const sse = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n';
response = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } });
const stream = await sb.run({ AI: {} }, "dynamic/premium", [], 512, true, { tools });
assert.equal(await stream.text(), sse);
assert.match(stream.headers.get("content-type"), /event-stream/);
assert.ok(!src.includes('model: "workers-ai/" + modelId'));
assert.ok(src.includes('primaryKey: _primaryKey, hedgeKey: null'));
assert.equal(src, readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"));
console.log("dynamic transport: binding/compat/tools/stream/spend/errors passed");
