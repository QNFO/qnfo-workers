import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("async function callDeepSeek(");
const end = src.indexOf('__name(callDeepSeek, "callDeepSeek");', start);
const calls = [];
const make = new Function("runDynamicChat", "chatRoute", src.slice(start, end) + "\nreturn callDeepSeek;");
const run = make(async (...args) => { calls.push(args); return "gateway answer"; }, (m) => /pro|reasoner/.test(m) ? "dynamic/premium" : "dynamic/value");
for (const [model, route] of [["deepseek-chat", "dynamic/value"], ["deepseek-v4-pro", "dynamic/premium"]]) {
  const tools = [{ type: "function", function: { name: "lookup" } }];
  assert.equal(await run({}, model, [], 512, true, tools, { tool_choice: "required" }), "gateway answer");
  assert.equal(calls.at(-1)[1], route);
  assert.equal(calls.at(-1)[4], true);
  assert.equal(calls.at(-1)[5].tools, tools);
}
assert.ok(!src.includes("await fetch(DEEPSEEK_URL"));
const failing = make(async () => { throw new Error("route exhausted"); }, () => "dynamic/value");
await assert.rejects(failing({}, "deepseek-chat", [], 512, false), /route exhausted/);
console.log("DeepSeek compatibility aliases: dynamic dispatch and error propagation passed");
