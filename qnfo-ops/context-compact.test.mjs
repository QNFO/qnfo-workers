// OPS-CONTEXT-COMPACT-1 (#2068), qnfo-ops 2.39.2 offline suite. No network.
// Proves: older tool results are compacted, the newest OPS_TOOL_KEEP_ROUNDS tool rounds and every non-tool message are kept
// whole, the marker says how much was cut, and a 27-call job's prompt shrinks by well over half (the 2026-10-06 jobs used
// 2.46M-2.68M prompt tokens for 27-33 tool calls).
// Run: node qnfo-ops/context-compact.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const nameShim = "function __name(f){return f}\n";
const estSrc = grab("function estTokens(text) {", "\n__name(estTokens");
const compactSrc = grab("var OPS_TOOL_KEEP_ROUNDS", "\nfunction truncateToContext(");
const truncSrc = grab("function truncateToContext(msgs, budgetTokens) {", "\n__name(truncateToContext");
ok(estSrc && compactSrc && truncSrc, "the three functions are found in worker.js");
const lib = new Function(nameShim + estSrc + "\n" + compactSrc + "\n" + truncSrc + "\nreturn { compactToolRounds, truncateToContext, OPS_TOOL_KEEP_ROUNDS, OPS_TOOL_COMPACT_CHARS, estTokens };")();

ok(lib.OPS_TOOL_KEEP_ROUNDS === 2 && lib.OPS_TOOL_COMPACT_CHARS === 1200, "defaults are 2 rounds and 1200 chars");
ok(/\n  compactToolRounds\(rounds\);\n  const kept = \[\];/.test(src), "truncateToContext compacts before the budget walk");

// A job transcript: system, user, then N assistant tool-call rounds each followed by one 16k tool result.
function job(n, size) {
  const m = [{ role: "system", content: "SYS" }, { role: "user", content: "do the thing" }];
  for (let i = 0; i < n; i++) {
    m.push({ role: "assistant", content: "", tool_calls: [{ id: "c" + i, type: "function", function: { name: "t", arguments: "{}" } }] });
    m.push({ role: "tool", tool_call_id: "c" + i, content: "R" + i + ":" + "x".repeat(size) });
  }
  return m;
}
const BIG = 262144 - 8192;
const j27 = job(27, 16384);
const out = lib.truncateToContext(j27, BIG);
const tools = out.filter((m) => m.role === "tool");
ok(tools.length === 27, "no tool message is dropped from a 27-call job", tools.length);
ok(tools.slice(-2).every((m) => m.content.length > 16000), "the newest 2 tool results are whole");
ok(tools.slice(0, -2).every((m) => m.content.length < 1500), "older tool results are compacted under 1500 chars");
ok(/\[compacted: \d+ more chars of this older tool result were dropped to save context; re-run the tool if you need the full output\]$/.test(tools[0].content), "the marker names the cut and the remedy", tools[0].content.slice(-140));
ok(tools[0].content.startsWith("R0:"), "a compacted result keeps its head");
ok(out.filter((m) => m.role !== "tool").length === j27.filter((m) => m.role !== "tool").length, "every system, user and assistant message is kept");
ok(out[1].content === "do the thing" && out[0].content === "SYS", "the instruction and system prompt are unchanged");

// Cost of one job: the prompt is resent every round, so sum the compacted prompt size over rounds 1..27.
let before = 0, after = 0;
for (let r = 1; r <= 27; r++) {
  const t = job(r, 16384);
  before += lib.estTokens(JSON.stringify(t));
  after += lib.estTokens(JSON.stringify(lib.truncateToContext(t, BIG)));
}
ok(after < before * 0.25, "a 27-round job sends under a quarter of the prompt tokens", { before, after, ratio: +(after / before).toFixed(3) });

// Small results and short jobs are untouched.
const small = job(5, 500);
ok(JSON.stringify(lib.truncateToContext(small, BIG)) === JSON.stringify(small), "results under the threshold are unchanged");
const two = job(2, 16384);
ok(JSON.stringify(lib.truncateToContext(two, BIG)) === JSON.stringify(two), "a job with 2 tool rounds is unchanged");

// Non-string tool content and non-tool long messages are never touched.
const mixed = job(4, 16384);
mixed[3] = Object.assign({}, mixed[3], { content: [{ type: "text", text: "y".repeat(5000) }] });
mixed.push({ role: "user", content: "z".repeat(20000) });
const mo = lib.truncateToContext(mixed, BIG);
ok(Array.isArray(mo[3].content) && mo[3].content[0].text.length === 5000, "array tool content is left as is");
ok(mo[mo.length - 1].content.length === 20000, "a long user message is never compacted");
ok(lib.compactToolRounds([]).length === 0, "empty input is safe");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
