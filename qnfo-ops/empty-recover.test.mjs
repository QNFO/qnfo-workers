// OPS-AGENT-EMPTY-RECOVER-1 offline suite (qnfo-ops 2.58.3, agent_issues 1000390, metric ops_agent_empty_answers_7d).
// finalize() ran its no-tools recovery round only when the answer was tool-call markup. A turn that ended with NO text after tool calls (five agent-tools rows with ok=0
// between 2026-10-19 and 2026-10-24: 43 to 72 tool calls, 234 to 507 s) went straight to the EMPTY-FINAL-GUARD-1 placeholder ("please re-send your request").
// This suite slices the REAL recovery block out of worker.js and replays it with stubbed model calls. Proves: an empty answer after tool calls takes the recovery round and
// the owner gets the recovered text (ok); when the recovery returns nothing or throws, the placeholder is still written, never a blank; a turn with no tool calls and no text
// does not spend a model call; markup-only answers recover as before; a real answer, a client handoff and a cache hit are untouched; the mirror is identical.
// Output MUST contain "0 failed" on success.   node qnfo-ops/empty-recover.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
const ver = (src.match(/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 2 || (ver[0] === 2 && (ver[1] > 58 || (ver[1] === 58 && ver[2] >= 3)))), "VERSION is at least 2.58.3", ver);

const a = src.indexOf("// OPS-AGENT-EMPTY-RECOVER-1 (2.58.3");
const b = src.indexOf("    const promptTokens = cacheHit ? 0", a);
ok(a > 0 && b > a, "the worker carries the OPS-AGENT-EMPTY-RECOVER-1 block ahead of the log record");
const block = src.slice(a, b);
ok(block.includes("// EMPTY-FINAL-GUARD-1 (2026-10-01") && block.indexOf("if (!clientHandoff && !cacheHit && (_markupOnly || _emptyAfterTools))") < block.indexOf("// EMPTY-FINAL-GUARD-1 (2026-10-01") && block.includes("the model produced no final answer within this turn"), "the recovery round comes before the EMPTY-FINAL-GUARD-1 placeholder, which stays as the last resort");
ok(/BUDGET_EXHAUSTED_DIRECTIVE \+ " Answer in plain prose; do not emit tool-call markup\."/.test(block) && block.includes("callDeepSeek(env, sendWork(_w6)"), "the recovery round is the existing no-tools call with the budget directive");

// the real helpers
const f0 = src.indexOf("function firstFrameIdx(s) {"), f1 = src.indexOf("__name(stripToolFrames", f0);
ok(f0 > 0 && f1 > f0, "the tool-frame helpers are found");
const helpers = src.slice(f0, f1).replace(/^__name\w*\(.*$/gm, "");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runBlock = new AsyncFunction("o", `
  const stripToolFrames = (function () { ${helpers}\n return stripToolFrames; })();
  let content = o.content, finishReason = o.finishReason || null, escalations = 0, servedBy = "", upstreamUsage = null, streamedTokens = false;
  const toolLog = o.toolLog, clientHandoff = o.clientHandoff || null, cacheHit = !!o.cacheHit, isStream = !!o.isStream, t0 = Date.now() - 5000;
  const work = [{ role: "user", content: "q" }], env = {}, sendWork = (w) => w, answerCap = 100, temperature = 0, topP = 1, codeMode = false, execUpstream = null, pub = false;
  const BUDGET_EXHAUSTED_DIRECTIVE = "TOOL BUDGET EXHAUSTED";
  const callDeepSeek = o.callDeepSeek, emitChunk = o.emitChunk;
  ${block}
  return { content, finishReason, escalations, servedBy, streamedTokens };
`);
const okTool = (n) => Array.from({ length: n }, (_, i) => ({ name: "ops_d1_query", ok: i % 5 !== 4 }));
const reply = (text) => async () => ({ resp: { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 5 } }, servedBy: "stub-model" });
async function run(o) {
  const calls = [], chunks = [];
  const out = await runBlock({ ...o, callDeepSeek: async (...args) => { calls.push(args); return o.callDeepSeek(...args); }, emitChunk: (c) => chunks.push(c) });
  return { ...out, calls: calls.length, chunks };
}

// A. the owner's case: tool calls, then nothing
{
  const r = await run({ content: "", toolLog: okTool(46), isStream: true, callDeepSeek: reply("Fleet is healthy: 3 breaches open, details above.") });
  ok(r.calls === 1 && r.content === "Fleet is healthy: 3 breaches open, details above." && r.escalations === 1, "empty answer after 46 tool calls takes the recovery round and the owner gets its text", r);
  ok(r.chunks.length === 1 && r.chunks[0].content === r.content && r.streamedTokens === true, "a streamed turn emits the recovered text as a chunk");
  ok(!/re-send your request/.test(r.content) && r.servedBy === "stub-model", "the recovered answer is not the placeholder (so ok_flag reads 1) and the serving model is recorded");
}
// B. recovery returns nothing: placeholder, never blank
{
  const r = await run({ content: "", toolLog: okTool(25), callDeepSeek: reply("") });
  ok(r.calls === 1 && /^The agent ran 25 tool call\(s\) \(20 ok: ops_d1_query\) but the model produced no final answer within this turn \(\d+s\)\. The tool results are recorded; please re-send your request for a concise answer\.$/.test(r.content), "an empty recovery still ends in the explicit placeholder with the tool counts", r.content);
}
// C. recovery throws: placeholder, no crash
{
  const r = await run({ content: "", toolLog: okTool(3), callDeepSeek: async () => { throw new Error("upstream 500"); } });
  ok(r.calls === 1 && /please re-send your request/.test(r.content), "a recovery call that throws is swallowed and the placeholder is written");
}
// D. no tool calls, no text: no spend
{
  const r = await run({ content: "", toolLog: [], callDeepSeek: reply("should not be called") });
  ok(r.calls === 0 && /^The model returned no answer for this turn \(\d+s\)\. Please re-send your request\.$/.test(r.content), "no tool calls and no text: no model call, the short placeholder");
}
// E. whitespace only after tool calls counts as empty
{
  const r = await run({ content: " \n ", toolLog: okTool(2), callDeepSeek: reply("Recovered.") });
  ok(r.calls === 1 && r.content === "Recovered.", "whitespace only after tool calls recovers too");
}
// F. markup only recovers as before, also with no tool log
{
  const r = await run({ content: "<tool_call>{\"name\":\"x\"}</tool_call>", toolLog: [], callDeepSeek: reply("Plain prose answer.") });
  ok(r.calls === 1 && r.content === "Plain prose answer.", "an answer that is only tool-call markup still takes the recovery round");
}
// G. real answer, client handoff, cache hit
{
  const real = await run({ content: "Here is your answer.", toolLog: okTool(4), callDeepSeek: reply("no") });
  ok(real.calls === 0 && real.content === "Here is your answer.", "a real answer is untouched and costs no extra call");
  const hand = await run({ content: "", toolLog: okTool(4), clientHandoff: { tool_calls: [{}] }, callDeepSeek: reply("no") });
  ok(hand.calls === 0, "a client handoff is never recovered");
  const cache = await run({ content: "", toolLog: okTool(4), cacheHit: true, callDeepSeek: reply("no") });
  ok(cache.calls === 0, "a cache hit is never recovered");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
