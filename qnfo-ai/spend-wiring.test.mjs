// AI-METER-KIMI-1, AI-ROUTER-REASONING-EFFORT-1, MODEL-MATRIX-1, spend-price-fallback tokens (issues 8124, 6171, 5733, 8465).
import fs from "node:fs";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(src.includes("AI-METER-KIMI-1"), "AI-METER-KIMI-1 marker");
assert.ok(/d1AttrWriteSkip\(\) && typeof aiMeterWrite[^\n]*aiMeterWrite\(env, aiMeterPoint\("workers-ai"/.test(src), "wrapper writes an AE point while the breaker is open");
assert.ok(src.includes("reasoning_effort: reasoningEffortFor("), "reasoningEffortFor is called on the chat path");
assert.ok(src.includes("MODEL-MATRIX-1") && src.includes('"@cf/google/gemma-4-26b-a4b-it"') && src.includes('"@cf/deepseek-ai/deepseek-v4-pro-0813": ['), "rates present");
assert.ok(/'spend-price-fallback', \?2, 1, 0, \?3, \?4, \?5\)/.test(src), "fallback counter records tokens and neurons");
console.log("spend-wiring ok");
