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
ok(/env\.AI\.run\(model, input, opts\)/.test(helper) && /gateway: gw/.test(helper), "that one call carries the gateway option");
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
const env = { AI: { run: async (model, input, options) => { calls.push(options); return { response: "ok" }; } } };
await run(env, "test-model", {}, { deterministic: true, cacheKey: "cached" });
ok(calls[0].gateway.cacheKey === "cached" && !calls[0].gateway.skipCache, "deterministic review can use a cache");
await run(env, "test-model", {}, { deterministic: true, skipCache: true, cacheKey: "forbidden" });
ok(calls[1].gateway.skipCache === true && !("cacheKey" in calls[1].gateway) && !("cacheTtl" in calls[1].gateway), "explicit skipCache overrides deterministic caching");
ok(/purpose: "compose", skipCache: true/.test(src), "compose explicitly bypasses gateway caching");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
