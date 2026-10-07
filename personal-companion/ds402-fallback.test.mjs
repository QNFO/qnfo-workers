// personal-companion 1.13.0 COMPANION-DEEPSEEK-402-FALLBACK-1 suite (charter pillar: core).
// Failure mode proven: with the DeepSeek balance empty every callModel returned HTTP 402 and generate() published nothing
// (2026-10-05 08:06Z .. 2026-10-07). Now a 402 falls through to Workers AI, opens a breaker (no second paid call), the
// writer and critic land on different models, and a total failure reports every model's error.
// Run: node personal-companion/ds402-fallback.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const load = async () => import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const PROSE = "x".repeat(400);
const msgs = [{ role: "user", content: "hi" }];

// (1) 402 -> Workers AI, breaker opens, second call makes no paid fetch
{
  const { callModel } = await load();
  let fetches = 0; const aiCalls = [];
  globalThis.fetch = async () => { fetches++; return new Response('{"error":{"message":"Insufficient Balance"}}', { status: 402 }); };
  const env = { DEEPSEEK_API_KEY: "k", AI: { run: async (m) => { aiCalls.push(m); return { response: PROSE }; } } };
  const r1 = await callModel(env, msgs, 4000, 1000, "deepseek-reasoner", "essay");
  ok(r1 && r1.text === PROSE, "402 falls through to Workers AI text");
  ok(r1.model === "@cf/moonshotai/kimi-k2.6", "essay fallback starts at kimi-k2.6, got " + r1.model);
  const r2 = await callModel(env, msgs, 900, 1000, "deepseek-chat", "critic");
  ok(fetches === 1, "breaker: one paid 402 only, got " + fetches);
  ok(r2.model === "@cf/openai/gpt-oss-120b", "critic uses a different model than the essay writer, got " + r2.model);
  const r3 = await callModel(env, msgs, 900, 1000, "deepseek-chat", "writer");
  ok(r3.model === "@cf/moonshotai/kimi-k2.6", "notes writer fallback is kimi-k2.6, got " + r3.model);
}
// (2) DeepSeek healthy -> DeepSeek used, no Workers AI call
{
  const { callModel } = await load();
  let ai = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: PROSE } }] }), { status: 200 });
  const r = await callModel({ DEEPSEEK_API_KEY: "k", AI: { run: async () => { ai++; return { response: PROSE }; } } }, msgs, 4000, 1000, "deepseek-chat", "writer");
  ok(r.model === "deepseek-chat" && ai === 0, "healthy DeepSeek is used first");
}
// (3) first fallback model empty/throws -> next model; all fail -> error names each
{
  const { callModel } = await load();
  globalThis.fetch = async () => new Response("down", { status: 503 });
  const seen = [];
  const env = { DEEPSEEK_API_KEY: "k", AI: { run: async (m) => { seen.push(m); if (m.includes("kimi")) throw new Error("timeout"); if (m.includes("gpt-oss")) return { choices: [{ message: { content: "", reasoning_content: "r".repeat(500) } }] }; return { choices: [{ message: { content: PROSE } }] }; } } };
  const r = await callModel(env, msgs, 4000, 1000, "deepseek-reasoner", "essay");
  ok(r.model === "@cf/zai-org/glm-5.3" && r.text === PROSE, "skips a throwing and a reasoning-only model, got " + r.model);
  const env2 = { DEEPSEEK_API_KEY: "k", AI: { run: async () => { throw new Error("boom"); } } };
  const r2 = await callModel(env2, msgs, 4000, 1000, "deepseek-reasoner", "essay");
  ok(r2.text === null && /HTTP 503/.test(r2.error) && /kimi-k2\.6: boom/.test(r2.error) && /gpt-oss-120b: boom/.test(r2.error), "total failure reports every error: " + r2.error);
  // 503 is not a funding error: breaker stays shut, DeepSeek is tried again
  let f = 0; globalThis.fetch = async () => { f++; return new Response("down", { status: 503 }); };
  await callModel(env, msgs, 900, 1000, "deepseek-chat", "critic");
  ok(f === 1, "a 503 does not open the breaker");
}
// (3b) a fallback call gets room to reason: tokens and timeout floors
{
  const { callModel } = await load();
  globalThis.fetch = async () => new Response("", { status: 402 });
  let seenInput = null;
  await callModel({ DEEPSEEK_API_KEY: "k", AI: { run: async (m, input) => { seenInput = input; return { response: PROSE }; } } }, msgs, 900, 3e4, "deepseek-chat", "critic");
  ok(seenInput && seenInput.max_tokens === 4000, "critic fallback max_tokens floored at 4000, got " + (seenInput && seenInput.max_tokens));
}
// (4) no key -> straight to Workers AI
{
  const { callModel } = await load();
  let f = 0; globalThis.fetch = async () => { f++; return new Response("", { status: 200 }); };
  const r = await callModel({ AI: { run: async () => ({ response: PROSE }) } }, msgs, 900, 1000, "deepseek-chat", "critic");
  ok(f === 0 && r.text === PROSE, "no DeepSeek key: no paid fetch");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
