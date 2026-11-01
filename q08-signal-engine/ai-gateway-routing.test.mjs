// BP26-AI-GATEWAY-BUDGETS-1 (agent_issues 1000614, 1000351): every model call of q08-signal-engine goes through aiGatewayRun.
// Offline source check: env.AI.run appears exactly once (inside aiGatewayRun) and the helper passes the gateway option.
// Output MUST contain "0 failed" on success.   node q08-signal-engine/ai-gateway-routing.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const direct = src.match(/env\.AI\.run\(/g) || [];
ok(direct.length === 1, "env.AI.run is called in one place only (aiGatewayRun), found " + direct.length);
const helper = src.slice(src.indexOf("async function aiGatewayRun"), src.indexOf("async function readerTest"));
ok(/env\.AI\.run\(model, callInput, opts\)/.test(helper) && /gateway: gw/.test(helper), "that one call carries the gateway option");
for (const purpose of ["compose", "title-repair", "forecast", "factcheck", "judge", "panel"]) {
  ok(new RegExp("purpose: \"" + purpose + "\"").test(src), "purpose " + purpose + " is labelled for gateway logs");
}
const constants = ["AIG_BUDGET_FALLBACK_MODEL", "AIG_GATEWAY_DEFAULT_ID", "AIG_CACHE_TTL_SECONDS"].map((name) => {
  const line = src.split("\n").find((text) => text.startsWith("var " + name + " = "));
  if (!line) throw new Error("Missing gateway constant: " + name);
  return line;
}).join("\n");
const run = new Function(constants + "\nvar seedOf = () => 'seed';\n" + helper + "\nreturn aiGatewayRun;")();
const calls = [];
const env = { AI: { run: async (model, input, options) => { calls.push({ model, input, options }); return { response: "ok" }; } } };
await run(env, "test-model", {}, { deterministic: true, cacheKey: "cached" });
ok(calls[0].options.gateway.cacheKey === "cached" && !calls[0].options.gateway.skipCache, "deterministic review can use a cache");
await run(env, "test-model", {}, { deterministic: true, skipCache: true, cacheKey: "forbidden" });
ok(calls[1].options.gateway.skipCache === true && !("cacheKey" in calls[1].options.gateway) && !("cacheTtl" in calls[1].options.gateway), "explicit skipCache overrides deterministic caching");
ok(/purpose: "compose",[^}]*skipCache: true/.test(src), "compose explicitly bypasses gateway caching");
const pressureEnv = { ...env, __q08BudgetPressure: true };
const budgetResponse = await run(pressureEnv, "premium-writer", { chat_template_kwargs: { enable_thinking: false }, reasoning: { effort: "high" } }, { purpose: "compose", budgetFallback: true });
ok(calls[2].model === "@cf/openai/gpt-oss-20b", "budget pressure routes the first writer call to the measured lower-neuron fallback");
ok(calls[2].input.reasoning.effort === "low" && !("chat_template_kwargs" in calls[2].input), "fallback receives its own generation settings, not the original model's");
ok(budgetResponse && budgetResponse.__q08Model === calls[2].model, "the response records the actual model for yield and family attribution");
await run(pressureEnv, "independent-reviewer", {}, { purpose: "panel", budgetFallback: true });
ok(calls[3].model === "independent-reviewer", "budget routing does not collapse an independent reviewer family");
const tokenLimited = { ...env, __aigLoopBudget: { used: 60, max: 60 } };
await run(tokenLimited, "premium-writer", {}, { purpose: "compose", budgetFallback: true });
ok(calls[4].model === "@cf/openai/gpt-oss-20b", "per-loop token pressure also selects the lower-cost writer fallback");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
