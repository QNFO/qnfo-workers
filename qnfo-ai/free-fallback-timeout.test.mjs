import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = src.indexOf("async function qnfoAiFreeFallback");
const end = src.indexOf('__name(qnfoAiFreeFallback, "qnfoAiFreeFallback");', start);
if (start < 0 || end < start) throw new Error("free fallback function not found");

function load(plan) {
  let now = 0;
  const calls = [];
  const timeouts = [];
  const logs = [];
  const sandbox = {
    Date: { now: () => now },
    console: { log: (message) => logs.push(String(message)), error: (message) => logs.push(String(message)) },
    reasoningEffortFor: () => null,
    async runDynamicChat(_env, model, messages, max_tokens) {
      calls.push({ model, input: { messages, max_tokens } });
      return plan.shift() || { elapsedMs: 0, response: null };
    },
    async withTimeout(promise, ms, label) {
      timeouts.push(ms);
      const result = await promise;
      const elapsed = result.elapsedMs || 0;
      if (elapsed > ms) {
        now += ms;
        throw new Error(`${label} timed out after ${ms}ms`);
      }
      now += elapsed;
      if (result.error) throw new Error(result.error);
      return result.response;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + "\nthis.fallback = qnfoAiFreeFallback;", sandbox);
  return { fallback: sandbox.fallback, getNow: () => now, calls, timeouts, logs };
}

const response = (content) => ({ choices: [{ message: { content } }] });
let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error("FAIL " + message);
  }
};

const slow = load([{ elapsedMs: 35e3, response: response("completed after 35 seconds") }]);
const answer = await slow.fallback({ AI: {} }, [{ role: "user", content: "test" }], 100);
ok(answer === "completed after 35 seconds", "a successful fallback leg may exceed the old 30-second cutoff");
ok(slow.timeouts[0] === 120e3 && slow.calls.length === 1, "the first fallback leg receives the shared 120-second deadline");
ok(!slow.logs.some((message) => message.includes("timed out") || message.includes("caught")), "a completed slow leg is not logged as a timeout");

const exhausted = load([
  { elapsedMs: 130e3, response: response("too late") },
  { elapsedMs: 0, response: response("should not run") }
]);
const noAnswer = await exhausted.fallback({ AI: {} }, [{ role: "user", content: "test" }], 100);
ok(noAnswer === null && exhausted.getNow() === 120e3, "fallback attempts share one bounded 120-second budget");
ok(exhausted.timeouts.length === 1 && exhausted.timeouts[0] === 120e3, "the gateway owns all fallback legs within the shared budget");
ok(exhausted.logs.some((message) => message.includes('"evt":"ai:qnfoAiFreeFallback:caught"') && message.includes("timed out after 120000ms")), "an exhausted deadline remains logged");
ok(exhausted.calls.length === 1 && exhausted.calls[0].model === "dynamic/value", "no local provider candidate starts after gateway exhaustion");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
