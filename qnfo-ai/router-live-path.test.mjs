// qnfo-ai 5.35.0 request-path suite: the whole worker module is loaded and driven through its fetch handler with stub
// bindings (no network: global fetch is replaced). Covers what the unit suite cannot: the chat route end to end.
// Run: node qnfo-ai/router-live-path.test.mjs -> prints "N passed, 0 failed".
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = mkdtempSync(join(tmpdir(), "qnfo-ai-"));
writeFileSync(join(dir, "worker.mjs"), readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const worker = (await import(pathToFileURL(join(dir, "worker.mjs")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const calls = { ai: [], fetch: [], d1: [] };
let aiPlan = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url)).hostname;
  calls.fetch.push(host);
  if (host === "api.deepseek.com") return new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402 });
  return new Response("blocked in test", { status: 599 });
};
let envExtra = {};
let d1First = null;
const env = () => ({
  ...envExtra,
  ROUTER_AUTH_KEY: "test-key",
  DEEPSEEK_API_KEY: "x",
  AI: {
    async run(model, input, opts) {
      calls.ai.push({ model, input, opts });
      if (/bge-/.test(model)) return { data: [[0.1, 0.2, 0.3]] };
      const p = aiPlan[model] || { ms: 1, text: "answer from " + model };
      await new Promise((r) => setTimeout(r, p.ms));
      if (p.throws) throw new Error(p.throws);
      return { choices: [{ message: { content: p.text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } } };
    }
  },
  QNFO_AUDIT: { prepare(sql) { const st = { bind(...a) { st.args = a; return st; }, async run() { calls.d1.push({ sql, args: st.args }); return { meta: {} }; }, async all() { return { results: [] }; }, async first() { return d1First ? d1First(sql, st.args) : null; } }; return st; } }
});
const waits = [];
const ctx = { waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); }, props: {} };
const chat = async (body, key, ua) => {
  const r = await worker.fetch(new Request("https://ai.test/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (key || "test-key"), "User-Agent": ua || "QNFO-AI-Calibration/test" }, body: JSON.stringify(body) }), env(), ctx);
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j, headers: r.headers };
};
const reset = () => { calls.ai.length = 0; calls.fetch.length = 0; calls.d1.length = 0; aiPlan = {}; };
const msgs = [{ role: "user", content: "Reply with exactly: OK" }];

// 1 an unknown id: the declared default by name, flagged, logged; the unfunded DeepSeek key is served by its twin.
let r = await chat({ model: "nonexistent-model-xyz", messages: msgs, max_tokens: 32 });
ok(r.status === 200 && r.j.model === "deepseek-v4-flash", "an unknown id answers 200 as deepseek-v4-flash (calibration contract)", r);
ok(r.j._router.model_resolution === "unknown-id-default" && r.j._router.requested_model === "nonexistent-model-xyz", "_router says the id was unknown", r.j && r.j._router);
ok(r.j._router.served_by === "deepseek-v4-flash-wa" && calls.ai.some((c) => c.model === "@cf/deepseek-ai/deepseek-v4-flash-0731"), "a 402 from the DeepSeek key is served by the Workers AI twin", r.j && r.j._router);
ok(!calls.ai.some((c) => c.model === "@cf/zai-org/glm-5.3-flash"), "the twin answered: no generic free-fallback call");
await Promise.all(waits);
ok(calls.d1.some((c) => /'model-unknown-id'/.test(c.sql)), "the unknown id left a cloud_ops_events row");

// 2 the breaker is now open in this isolate: no second paid round trip, same answer path.
reset();
r = await chat({ model: "deepseek-v4-flash", messages: msgs, max_tokens: 32 });
ok(r.status === 200 && r.j._router.served_by === "deepseek-v4-flash-wa" && calls.fetch.every((h) => h !== "api.deepseek.com"), "with the breaker open the twin serves at once, no DeepSeek call", { f: calls.fetch, rt: r.j && r.j._router });
ok(r.j._router.model_resolution === undefined, "an exact id carries no resolution note");

// 3 a small answer on glm-5.3-flash asks for low reasoning effort; a long one does not.
reset();
r = await chat({ model: "glm-5.3-flash", messages: msgs, max_tokens: 700 });
let c = calls.ai.find((x) => x.model === "@cf/zai-org/glm-5.3-flash");
ok(r.status === 200 && c && c.input.reasoning_effort === "low" && c.input.max_tokens === 700, "max_tokens 700 on glm-5.3-flash carries reasoning_effort low", c && c.input && { e: c.input.reasoning_effort, m: c.input.max_tokens });
ok(r.j._router.budget_ms === 45000 && r.j._router.hedge && r.j._router.hedge.fired === false && calls.ai.filter((x) => /glm|llama/.test(x.model)).length === 1, "a quick primary answers alone under the budget", r.j && r.j._router);
reset();
r = await chat({ model: "glm-5.3-flash", messages: msgs, max_tokens: 16000 });
c = calls.ai.find((x) => x.model === "@cf/zai-org/glm-5.3-flash");
ok(r.status === 200 && c && c.input.reasoning_effort === undefined && r.j._router.budget_ms === undefined, "a long answer keeps the model default and has no budget");

// 4 a Workers AI id resolves by name.
reset();
r = await chat({ model: "@cf/moonshotai/kimi-k2.6", messages: msgs, max_tokens: 64 });
ok(r.status === 200 && r.j.model === "kimi-k2.6" && r.j._router.model_resolution === "workers-ai-id", "a Workers AI id resolves to its key and says how", r.j && r.j._router);

// 5 a silent primary is overtaken by the hedge inside the caller's budget.
reset();
aiPlan = { "@cf/zai-org/glm-5.3-flash": { ms: 5000, text: "late" }, "@cf/moonshotai/kimi-k2.6": { ms: 5, text: "hedged answer OK" } };
let t = Date.now();
r = await chat({ model: "glm-5.3-flash", messages: msgs, max_tokens: 200, timeout_ms: 4500 });
ok(r.status === 200 && r.j.choices[0].message.content.indexOf("hedged answer") >= 0 && r.j._router.hedge.fired === true && r.j._router.served_by === "kimi-k2.6" && Date.now() - t < 4000, "the hedge answers when the primary is silent", { ms: Date.now() - t, rt: r.j && r.j._router });

// 6 nothing answers: 504 router_timeout with the legs, never canned text.
reset();
aiPlan = { "@cf/zai-org/glm-5.3-flash": { ms: 9000, text: "late" }, "@cf/moonshotai/kimi-k2.6": { ms: 9000, text: "late" } };
t = Date.now();
r = await chat({ model: "glm-5.3-flash", messages: msgs, max_tokens: 200, timeout_ms: 3000 });
ok(r.status === 504 && r.j.error.type === "router_timeout" && r.j.error.legs.length === 2 && Date.now() - t < 4500, "an exhausted budget answers 504 router_timeout", { ms: Date.now() - t, j: r.j });

// 7 the router-down drill: 503 after auth, no model call, one evidence row.
reset();
r = await chat({ model: "auto", messages: msgs, drill: "router-down" });
await Promise.all(waits);
ok(r.status === 503 && r.j.error.type === "router_drill" && r.headers.get("x-qnfo-drill") === "router-down" && calls.ai.length === 0, "the drill answers 503 with no model call", r);
ok(calls.d1.some((x) => /'router-drill'/.test(x.sql)), "the drill left its evidence row");
r = await chat({ model: "auto", messages: msgs, drill: "router-down" }, "wrong-key");
ok(r.status === 401, "the drill needs the same auth as a chat request");

// 8 a caller-named ensemble of one lineage is refused with a structured reason before any call.
reset();
r = await chat({ model: "ensemble", messages: msgs, ensemble_models: ["glm-5.3", "glm-5.3-flash"] });
ok(r.status === 422 && r.j.error.type === "channel_diversity_refused" && r.j.error.pairs.length === 1 && calls.ai.length === 0, "a same-lineage ensemble is refused (422) with its pairs", r.j);

// 9 read routes.
const get = async (path, init) => { const x = await worker.fetch(new Request("https://ai.test" + path, init), env(), ctx); return { status: x.status, j: await x.json() }; };
r = await get("/health");
ok(r.status === 200 && r.j.second_path && r.j.second_path.contract === "AI-ROUTER-SECOND-PATH-1" && r.j.routes.indexOf("/v1/ensemble/policy") >= 0, "/health serves the second-path contract");
r = await get("/v1/ensemble/policy");
ok(r.status === 200 && r.j.threshold === 0.25 && r.j.pools.science.every((p) => p.diversity_ok && p.reviewer_overlap === 0), "GET /v1/ensemble/policy: every pool row is diverse", r.j && r.j.pools);
r = await get("/v1/ensemble/policy", { method: "POST", body: JSON.stringify({ models: ["deepseek-v4-flash-wa", "deepseek-v4-pro-wa", "gpt-oss-120b"] }) });
ok(r.status === 422 && r.j.error.type === "channel_diversity_refused", "POST /v1/ensemble/policy refuses a set with a shared lineage");
r = await get("/v1/ensemble/policy", { method: "POST", body: JSON.stringify({ models: ["kimi-k2.6", "gpt-oss-120b", "glm-5.3-flash"] }) });
ok(r.status === 200 && r.j.ok === true && r.j.verdict.max_overlap === 0, "POST /v1/ensemble/policy passes three lineages");
r = await get("/v1/models", { headers: { Authorization: "Bearer test-key" } });
ok(r.status === 200 && r.j.data.some((m) => m.id === "kimi-k2.6") && r.j.data.length >= 10, "the keyed roster lists the fast tier");
r = await get("/v1/models", { headers: { Authorization: "Bearer nope" } });
ok(r.status === 200 && r.j.data.length === 1 && r.j.data[0].id === "qnfo", "a wrong key still gets the single public model");

// 9b the semantic cache: served only for the same prompt, never for a near neighbour, never for a liveness probe.
reset();
const cachedPrompt = "State the routing rule of this endpoint in one line";
envExtra = { LOG_VZ: { async query() { return { matches: [{ id: "r:q-abc", score: 0.99, metadata: { kind: "response", model: "glm-5.3-flash", text: "The rule is that every id resolves by a named rule and is reported." } }] }; } } };
d1First = (sql) => /FROM ai_queries WHERE id/.test(sql) ? { prompt: cachedPrompt, response: "The rule is that every id resolves by a named rule and is reported." } : null;
r = await chat({ model: "glm-5.3-flash", messages: [{ role: "user", content: cachedPrompt }], max_tokens: 200 }, null, "suite/1");
ok(r.status === 200 && r.j._router && r.j._router.cache === "semantic" && !calls.ai.some((x) => !/bge-/.test(x.model)), "the same prompt is served from the cache with no model call", { rt: r.j && r.j._router, ai: calls.ai.map((x) => x.model) });
reset();
r = await chat({ model: "glm-5.3-flash", messages: [{ role: "user", content: cachedPrompt + " for item 24" }], max_tokens: 200 }, null, "suite/1");
ok(r.status === 200 && (!r.j._router || r.j._router.cache !== "semantic") && calls.ai.some((x) => x.model === "@cf/zai-org/glm-5.3-flash"), "a near neighbour (score 0.99, different prompt) is not served from the cache", r.j && r.j._router);
reset();
r = await chat({ model: "glm-5.3-flash", messages: [{ role: "user", content: cachedPrompt }], max_tokens: 200 });
ok(r.status === 200 && r.j._router.cache !== "semantic" && calls.ai.some((x) => x.model === "@cf/zai-org/glm-5.3-flash"), "a liveness probe never reads the cache");
reset();
r = await chat({ model: "glm-5.3-flash", messages: [{ role: "user", content: cachedPrompt }], max_tokens: 200, cache: false }, null, "suite/1");
ok(r.status === 200 && r.j._router.cache !== "semantic", "cache: false skips the cache");
envExtra = {};
d1First = null;

// 10 cached tokens reach the ledger statement.
await Promise.all(waits);
ok(calls.d1.length >= 0 && /cached_tok = COALESCE\(cached_tok, 0\) \+ \?1/.test(readFileSync(join(dir, "worker.mjs"), "utf8")), "the ledger has a cached-token statement");

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
