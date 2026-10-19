// KIMI-TIMEOUT-FALLBACK-1 (qnfo-research-exec 0.21.1, pillar research). A 3046 timeout on kimi-k2.6 (the revise stage's second
// model) goes straight to glm-5.3-flash instead of three retries; other models keep AI-BACKOFF-1's retries.
// Runs aiText from the source against a scripted env.AI. Run: node qnfo-research-exec/kimi-timeout.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x) : "")); } };
const line = (name) => { const m = new RegExp("\\nvar " + name + " = [^\\n]*").exec(src); if (!m) throw new Error("missing " + name); return m[0]; };
const i = src.indexOf("\nasync function aiText(env, model, prompt, maxTokens, effort) {"); const j = src.indexOf("\n}\n", i);
const fn = (head) => { const a = src.indexOf("\n" + head); if (a < 0) throw new Error("missing " + head); return src.slice(a, src.indexOf("\n}\n", a) + 2); };
const body = line("__AI_ATTR_RATES") + line("AI_RATE_FALLBACK") + line("AI_TIMEOUT_SKIP") + line("AI_TRANSIENT_RE") + line("AI_MODEL_SKIP_MS") + line("_aiRateSkip") + line("_aiSkipLogged")
  + fn("function aiInputRate(") + fn("function aiFallbackFor(") + fn("async function aiSkipLog(")
  + "\nvar AI_TEXT_MAX_OUT = {};\nasync function aiRunOpts() { return undefined; }\nasync function logEvent() {}\n" + src.slice(i, j + 2)
  + "\nreturn { aiText, reset: function() { for (var k in _aiRateSkip) delete _aiRateSkip[k]; for (var k2 in _aiSkipLogged) delete _aiSkipLogged[k2]; } };";
const { aiText, reset } = new Function(body)();
const realSet = globalThis.setTimeout; globalThis.setTimeout = (f) => realSet(f, 0);
const KIMI = "@cf/moonshotai/kimi-k2.6", GLM = "@cf/zai-org/glm-5.3-flash", OSS = "@cf/openai/gpt-oss-120b";
const env = (script) => { reset(); const calls = []; return { calls, AI: { run: async (model) => { calls.push(model); const r = script(model, calls.length); if (r instanceof Error) throw r; return r; } } }; };
{
  const e = env((m) => m === KIMI ? new Error("3046: Request timeout") : { response: "[{\"edit\":1}]" });
  const out = await aiText(e, KIMI, "p", 100, "low");
  ok(out === "[{\"edit\":1}]", "a kimi timeout returns the fallback's answer", out);
  ok(JSON.stringify(e.calls) === JSON.stringify([KIMI, GLM]), "one kimi call, then glm-5.3-flash, no retries", e.calls);
}
{
  const e = env((m, n) => n === 1 ? new Error("3021: rate limit") : { response: "ok" });
  const out = await aiText(e, KIMI, "p", 100, "low");
  ok(out === "ok" && JSON.stringify(e.calls) === JSON.stringify([KIMI, KIMI]), "a kimi rate limit is still retried", e.calls);
}
{
  const e = env((m, n) => n === 1 ? new Error("3046: Request timeout") : { response: "ok" });
  const out = await aiText(e, GLM, "p", 100, "low");
  ok(out === "ok" && JSON.stringify(e.calls) === JSON.stringify([GLM, GLM]), "a glm timeout keeps its retry (AI-BACKOFF-1)", e.calls);
}
{
  const e = env(() => new Error("3046: Request timeout"));
  const out = await aiText(e, KIMI, "p", 100, "low");
  ok(out === "" && e.calls[0] === KIMI && e.calls[1] === GLM && e.calls.indexOf(OSS) < 0, "when the fallback also times out the answer is empty and no third model runs", e.calls);
}
globalThis.setTimeout = realSet;
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
