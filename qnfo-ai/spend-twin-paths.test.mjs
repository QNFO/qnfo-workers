// QNFO-AI-SPEND-TWIN-PATHS-1 offline suite (qnfo-ai 5.40.3): the whole worker module is loaded and driven through its fetch handler with
// stub bindings (no network: global fetch is replaced); each scenario gets a fresh module because the DeepSeek 402 breaker and the spend
// ledger cache are per isolate. Covers agent_issues 1000439 (QNFO-AI-STREAM-SPEND-TWIN-1), 1000440 (QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1) and
// the revert of the 5.40.2 change that turned a binding error matching spend, budget or cap into an empty success (QNFO-AI-SWALLOW-REVERT-1).
// Proves: a streamed deepseek-v4-pro or deepseek-v4-flash request whose paid call is refused (router ledger over its cap, or the key answers
// 402) is served by its Workers AI twin with the caller's tools, the chunks name the twin, and no DeepSeek or free-chain call is made; with
// no twin the free chain answers and the chunks name the model that answered, not the requested route; a funded key streams as before; an
// oversize ensemble prompt (the context fallback) is served by the twin of deepseek-v4-flash when the paid call is refused (200, _router names
// the twin and the reason) and by DeepSeek when funded; the Workers AI binding wrapper rethrows a capacity error instead of returning an
// empty reply; VERSION is at least 5.40.3 and the mirror is identical.
// Run: node qnfo-ai/spend-twin-paths.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const here = new URL("./", import.meta.url);
const SRC = readFileSync(new URL("./worker.js", here), "utf8");
const MIRROR = readFileSync(new URL("./deployed-current.worker.js", here), "utf8");
const dir = mkdtempSync(join(tmpdir(), "qnfo-ai-twin-"));
let pass = 0, fail = 0, seq = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };

const loadWorker = async (transform) => {
  const f = join(dir, "worker-" + (++seq) + ".mjs");
  writeFileSync(f, transform ? transform(SRC) : SRC);
  return (await import(pathToFileURL(f).href)).default;
};

const calls = { ai: [], fetch: [] };
let dsMode = "ok"; // what the direct DeepSeek key answers: ok | 402
let ledgerOver = false; // the router ledger shows deepseek over its 30 day cap, so spendGuardPaid refuses before any fetch
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url)).hostname;
  calls.fetch.push(host);
  if (host === "api.deepseek.com") {
    if (dsMode === "402") return new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402 });
    let body = {};
    try { body = JSON.parse(init && init.body || "{}"); } catch (e) { body = {}; }
    if (body.stream) {
      const enc = new TextEncoder();
      const sse = new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"id":"ds","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"paid stream"},"finish_reason":null}]}\n\n')); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } });
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "paid answer" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response("blocked in test", { status: 599 });
};
const env = () => ({
  ROUTER_AUTH_KEY: "test-key",
  DEEPSEEK_API_KEY: "x",
  AI: {
    async run(model, input, opts) {
      calls.ai.push({ model, input, opts });
      if (/bge-/.test(model)) return { data: [[0.1, 0.2, 0.3]] };
      return { choices: [{ message: { content: "answer from " + model }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    }
  },
  QNFO_AUDIT: { prepare(sql) { const st = { bind(...a) { st.args = a; return st; }, async run() { return { meta: {} }; }, async all() { return { results: /FROM ai_spend_ledger/.test(sql) && ledgerOver ? [{ provider: "deepseek", usd: 20 }] : [] }; }, async first() { return null; } }; return st; } }
});
const waits = [];
const ctx = { waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); }, props: {} };
const reset = () => { calls.ai.length = 0; calls.fetch.length = 0; dsMode = "ok"; ledgerOver = false; };
// the calibration caller with no_downgrade keeps the requested route, as when the quality floor lifts a downgrade: the refusal then comes from the paid-call guard
const post = (worker, body) => worker.fetch(new Request("https://ai.test/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-key", "User-Agent": "QNFO-AI-Calibration/test" }, body: JSON.stringify({ no_downgrade: true, ...body }) }), env(), ctx);
const sse = async (r) => {
  const t = await r.text();
  const chunks = t.split("\n").filter((l) => l.startsWith("data:") && !/\[DONE\]/.test(l)).map((l) => { try { return JSON.parse(l.slice(5)); } catch (e) { return null; } }).filter(Boolean);
  return { chunks, text: chunks.map((c) => c.choices && c.choices[0] && c.choices[0].delta && c.choices[0].delta.content || "").join(""), models: [...new Set(chunks.map((c) => c.model))] };
};
const msgs = [{ role: "user", content: "Reply with exactly: OK" }];
const tool = { type: "function", function: { name: "lookup", description: "look something up", parameters: { type: "object", properties: { q: { type: "string" } } } } };
const TWIN = { "deepseek-v4-pro": ["@cf/deepseek-ai/deepseek-v4-pro-0813", "deepseek-v4-pro-wa"], "deepseek-v4-flash": ["@cf/deepseek-ai/deepseek-v4-flash-0731", "deepseek-v4-flash-wa"] };

// 1 and 2: a streamed paid route the guard refuses is served by its Workers AI twin, tools kept, chunks name the twin.
for (const route of ["deepseek-v4-pro", "deepseek-v4-flash"]) {
  reset();
  ledgerOver = true;
  const w = await loadWorker();
  const r = await post(w, { model: route, messages: msgs, max_tokens: 64, stream: true, tools: [tool] });
  const s = await sse(r);
  const aiChat = calls.ai.filter((c) => !/bge-/.test(c.model));
  ok(r.status === 200 && /event-stream/.test(r.headers.get("content-type") || ""), route + ": a refused stream still answers 200 as a stream", { status: r.status });
  ok(aiChat.length >= 1 && aiChat[0].model === TWIN[route][0], route + ": the Workers AI twin serves (" + TWIN[route][0] + ")", aiChat.map((c) => c.model));
  ok(!aiChat.some((c) => c.model === "@cf/zai-org/glm-5.3-flash"), route + ": the generic free chain (glm-5.3-flash) is not used");
  ok(Array.isArray(aiChat[0] && aiChat[0].input && aiChat[0].input.tools) && aiChat[0].input.tools.length === 1, route + ": the caller's tools are kept on the twin call", aiChat[0] && aiChat[0].input && Object.keys(aiChat[0].input));
  ok(!calls.fetch.includes("api.deepseek.com"), route + ": the refusal came before any paid DeepSeek fetch", calls.fetch);
  ok(s.models.length === 1 && s.models[0] === TWIN[route][1], route + ": every chunk names the twin, not the requested route", s.models);
  ok(s.text.includes("answer from " + TWIN[route][0]), route + ": the twin's answer is the stream's content", s.text.slice(0, 200));
}

// 3: the key answers 402 at call time (the breaker is not open yet): the same twin serves the stream.
{
  reset();
  dsMode = "402";
  const w = await loadWorker();
  const r = await post(w, { model: "deepseek-v4-flash", messages: msgs, max_tokens: 64, stream: true });
  const s = await sse(r);
  const aiChat = calls.ai.filter((c) => !/bge-/.test(c.model));
  ok(r.status === 200 && calls.fetch.filter((h) => h === "api.deepseek.com").length === 1, "a 402 is fetched once", calls.fetch);
  ok(aiChat[0] && aiChat[0].model === TWIN["deepseek-v4-flash"][0] && !aiChat.some((c) => /glm-5\.3-flash/.test(c.model)), "a 402 at call time is served by the twin, not the free chain", aiChat.map((c) => c.model));
  ok(s.models.length === 1 && s.models[0] === "deepseek-v4-flash-wa", "its chunks name the twin", s.models);
}

// 4: no twin (the declaration removed): the free chain answers and the chunks name the model that answered, not the route asked for.
{
  reset();
  ledgerOver = true;
  const w = await loadWorker((s) => s.replace('waTwin: "deepseek-v4-pro-wa", ', ""));
  const r = await post(w, { model: "deepseek-v4-pro", messages: msgs, max_tokens: 64, stream: true });
  const s = await sse(r);
  const aiChat = calls.ai.filter((c) => !/bge-/.test(c.model));
  ok(r.status === 200 && aiChat[0] && aiChat[0].model === "@cf/zai-org/glm-5.3-flash", "with no twin the existing free chain answers", aiChat.map((c) => c.model));
  ok(s.models.length === 1 && s.models[0] === "@cf/zai-org/glm-5.3-flash", "its chunks name the model that answered, not deepseek-v4-pro", s.models);
}

// 5: funded key: the paid stream passes through untouched.
{
  reset();
  const w = await loadWorker();
  const r = await post(w, { model: "deepseek-v4-pro", messages: msgs, max_tokens: 64, stream: true });
  const s = await sse(r);
  ok(r.status === 200 && calls.fetch.includes("api.deepseek.com") && calls.ai.filter((c) => !/bge-/.test(c.model)).length === 0, "a funded key streams from DeepSeek with no Workers AI chat call", { f: calls.fetch, ai: calls.ai.map((c) => c.model) });
  ok(s.text.includes("paid stream"), "and the paid stream is the content", s.text.slice(0, 100));
}

// 6 and 7: an oversize ensemble prompt takes the context fallback; a refused paid call is served by the twin (200), not HTTP 502.
const big = "lorem ipsum dolor sit amet ".repeat(32000); // about 864k characters, about 288k estimated tokens, past the ensemble primary context
for (const [label, setup, why] of [["ledger over the cap", () => { ledgerOver = true; }, "spend-cap"], ["402 from the key", () => { dsMode = "402"; }, "deepseek-402"]]) {
  reset();
  setup();
  const w = await loadWorker();
  const r = await post(w, { model: "ensemble", messages: [{ role: "user", content: big }], max_tokens: 64, no_downgrade: false });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const aiChat = calls.ai.filter((c) => !/bge-/.test(c.model));
  ok(r.status === 200, "ensemble context fallback, " + label + ": 200 and not 502", { status: r.status, j });
  ok(j && j._router && j._router.strategy === "ensemble-context-fallback" && j._router.served_by === "deepseek-v4-flash-wa" && j._router.twin_reason === why, "ensemble context fallback, " + label + ": _router names the twin and the reason (" + why + ")", j && j._router);
  ok(aiChat.length === 1 && aiChat[0].model === "@cf/deepseek-ai/deepseek-v4-flash-0731", "ensemble context fallback, " + label + ": one call to the Workers AI twin of deepseek-v4-flash", aiChat.map((c) => c.model));
  ok(j && j.choices && String(j.choices[0].message.content).includes("answer from @cf/deepseek-ai/deepseek-v4-flash-0731"), "ensemble context fallback, " + label + ": the twin's answer is the reply", j && j.choices);
}
{
  reset();
  const w = await loadWorker();
  const r = await post(w, { model: "ensemble", messages: [{ role: "user", content: big }], max_tokens: 64, no_downgrade: false });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  ok(r.status === 200 && j && j._router && j._router.strategy === "ensemble-context-fallback" && j._router.served_by === undefined && j._router.twin_reason === undefined, "ensemble context fallback with a funded key is unchanged (no twin named)", j && j._router);
  ok(calls.fetch.includes("api.deepseek.com") && j && j.choices && String(j.choices[0].message.content).includes("paid answer"), "and DeepSeek answers it", { f: calls.fetch });
}

// 8: the Workers AI binding wrapper rethrows a capacity (or spend, or budget) error; 5.40.2 returned an empty success for any message matching cap.
{
  const a = SRC.indexOf("function __aiAttrEnv(");
  const b = SRC.indexOf("// AIG-CALLER-METADATA-1", a);
  ok(a > 0 && b > a, "__aiAttrEnv found in worker.js");
  const make = new Function("SPEND_CHEAP_WA", "__AI_ATTR_RATES", SRC.slice(a, b) + "\nreturn __aiAttrEnv;");
  const aiEnv = (msg) => ({ AI: { async run() { throw new Error(msg); } }, DB: { prepare() { const st = { bind() { return st; }, async run() { return {}; } }; return st; } } });
  for (const msg of ["3040: Capacity temporarily exceeded, please try again.", "spend-governor: deepseek 30d spend 20.00 (cap 15)", "daily budget exhausted"]) {
    for (const model of ["@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3"]) {
      const wrapped = make("@cf/zai-org/glm-5.3-flash", {})(aiEnv(msg), "t", "AI", "DB");
      let thrown = null, res = null;
      try { res = await wrapped.AI.run(model, { messages: msgs }, {}); } catch (e) { thrown = e; }
      ok(thrown && String(thrown.message).includes(msg) && res === null, "the binding wrapper rethrows '" + msg.slice(0, 40) + "' for " + model, { thrown: thrown && thrown.message, res });
    }
  }
}

// 9: version and mirror.
{
  const v = (SRC.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  ok(v[0] > 5 || (v[0] === 5 && (v[1] > 40 || (v[1] === 40 && v[2] >= 3))), "VERSION is at least 5.40.3", v);
  ok(SRC === MIRROR, "deployed-current.worker.js is identical to worker.js");
  ok(/QNFO-AI-STREAM-SPEND-TWIN-1/.test(SRC) && /QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1/.test(SRC), "both code markers are in worker.js");
  ok(!/return \{ text: "", usage: \{\} \}/.test(SRC), "the empty-success return is gone from worker.js");
}

await Promise.all(waits);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
