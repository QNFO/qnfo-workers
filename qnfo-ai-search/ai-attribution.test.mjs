// WORKERS-AI-ATTRIBUTION-2 offline suite (qnfo-ai-search, agent_issues 1997): the entry wraps env.AI with __aiAttrEnv, so every Workers AI
// call is counted in qnfo-audit ai_call_counters (purpose 'binding', worker 'qnfo-ai-search'); results, streams and errors pass through.
// Run: node --no-warnings qnfo-ai-search/ai-attribution.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var __AI_ATTR_RATES = {"), b = src.indexOf("function __aiAttrEnv(env, worker, aiKey, dbKey) {");
const e = src.indexOf("\n}\n", b);
if (a < 0 || b < a || e < b) throw new Error("WORKERS-AI-ATTRIBUTION block not found in worker.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const W = vm.runInContext(src.slice(a, e + 2) + "\n;({ __aiAttrEnv, __AI_ATTR_RATES });", vm.createContext({ Proxy, Reflect, Object, JSON, Date, Number, String }));

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))");
const shim = { prepare: (sql) => { let args = []; const st = { bind: (...x) => { args = x; return st; }, run: async () => db.prepare(sql).run(...args) }; return st; } };
const stream = { locked: false, getReader() {} };
const ai = { run: async (model, input) => { if (model === "boom") throw new Error("model down"); return input.stream ? stream : { response: "ok", usage: { prompt_tokens: 1000, completion_tokens: 500 } }; }, gateway: () => "g" };
const env = { AI: ai, QNFO_AUDIT: shim, OTHER: 1 };
const wrapped = W.__aiAttrEnv(env, "qnfo-ai-search", "AI", "QNFO_AUDIT");
ok(wrapped !== env && env.AI === ai && wrapped.OTHER === 1 && wrapped.__aiAttr === 1, "returns a wrapped copy; the original env is not mutated");
ok(W.__aiAttrEnv(wrapped, "qnfo-ai-search", "AI", "QNFO_AUDIT") === wrapped, "wrapping twice is a no-op");
const r1 = await wrapped.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "user", content: "q" }] });
ok(r1.response === "ok", "the model result passes through unchanged");
const r2 = await wrapped.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "user", content: "q" }], stream: true });
ok(r2 === stream, "a streamed result is returned as the same object");
let threw = false; try { await wrapped.AI.run("boom", { messages: [] }); } catch (x) { threw = /model down/.test(x.message); }
ok(threw, "a model error is rethrown");
ok(typeof wrapped.AI.gateway === "function" && wrapped.AI.gateway() === "g", "other AI binding members still work");
const rows = db.prepare("SELECT model, calls, errors, in_tok, out_tok, neurons FROM ai_call_counters WHERE worker = 'qnfo-ai-search' AND purpose = 'binding' ORDER BY model").all();
const llama = rows.find((r) => r.model.includes("llama")), boom = rows.find((r) => r.model === "boom");
const rate = W.__AI_ATTR_RATES["@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
ok(llama && llama.calls === 2 && llama.out_tok === 500, "both llama calls are counted; the streamed one adds no output tokens");
ok(llama && Math.abs(llama.neurons - ((1000 * rate[0] + 500 * rate[1]) / 1e6 + (llama.in_tok - 1000) * rate[0] / 1e6)) < 1e-6, "neurons follow the published per-model rates");
ok(boom && boom.calls === 1 && boom.errors === 1, "a failed call is counted as an error");
// AI-METER-STREAM-1: a fake stream of known length books the expected out_tok and neurons as one 'binding-stream' row.
{
  const W2 = vm.runInContext(src.slice(a, e + 2) + "\n;({ __aiStreamOutBook });", vm.createContext({ Proxy, Reflect, Object, JSON, Date, Number, String, Math, console }));
  const m = "@cf/deepseek-ai/deepseek-v4-flash-0731", rt = W.__AI_ATTR_RATES[m];
  const booked = await W2.__aiStreamOutBook({ QNFO_AUDIT: shim }, "qnfo-ai-search", m, "x".repeat(400));
  const row = db.prepare("SELECT calls, in_tok, out_tok, neurons FROM ai_call_counters WHERE purpose = 'binding-stream' AND model = ?").get(m);
  ok(booked === 100 && row && row.out_tok === 100 && row.calls === 0 && row.in_tok === 0 && Math.abs(row.neurons - 100 * rt[1] / 1e6) < 1e-9, "400 streamed chars book 100 out_tok and the model output-rate neurons");
  ok(await W2.__aiStreamOutBook({ QNFO_AUDIT: shim }, "qnfo-ai-search", m, "") === 0 && await W2.__aiStreamOutBook({}, "w", m, "abc") === 0, "empty text or no db books nothing and never throws");
}
ok(/__aiStreamOutBook\(env, "qnfo-ai-search", model, text\)/.test(src), "ask() books the streamed output after the stream is read");
ok((src.match(/__aiAttrEnv\(env, "qnfo-ai-search", "AI", "QNFO_AUDIT"\)/g) || []).length === 2, "fetch and scheduled both wrap env at the entry");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
