// OPS-CONTEXT-COMPACT-1 (#2068, qnfo-ops 2.39.2) and OPS-CONTEXT-COMPACT-2 (2.50.5) offline suite, plus D1-LIVE-COLUMNS-1. No network.
// Proves: tool-bearing rounds age (newest 2 whole, next 4 head+tail, older a digest); the assistant message of an older round is
// compacted too (reasoning, long content, long argument strings, arguments stay valid JSON with the same keys); system, user and
// answer messages are never cut; a hard per-round budget bounds what one upstream round carries and pins the task; the loop's own
// transcript is never mutated; a 40-turn job shaped like job-27a22cfb02c6a5 (1,593,580 prompt tokens on 2026-10-17 under 2.39.2)
// sends far fewer prompt tokens; the job and chat loops send the bounded copy; ops_d1_query reads live columns for a bad column.
// Run: node qnfo-ops/context-compact.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const nameShim = "function __name(f){return f}\n";
const estSrc = grab("function estTokens(text) {", "\n__name(estTokens");
const agentSrc = grab("function isAgentTranscript(messages) {", "\nfunction isOAIUpstream");
const compactSrc = grab("var OPS_TOOL_KEEP_ROUNDS", "\nfunction truncateToContext(");
const truncSrc = grab("function truncateToContext(msgs, budgetTokens, opts) {", "\n__name(truncateToContext");
const boundSrc = grab("function opsBoundRound(msgs) {", "\n}\n") + "\n}";
ok(estSrc && agentSrc && compactSrc && truncSrc && boundSrc.length > 40, "the functions are found in worker.js");
const lib = new Function(nameShim + estSrc + "\n" + agentSrc + "\n" + compactSrc + "\n" + truncSrc + "\n" + boundSrc +
  "\nreturn { compactToolRounds, truncateToContext, opsBoundRound, opsShrinkArgs, opsExcerpt, isAgentTranscript, estTokens, KEEP: OPS_TOOL_KEEP_ROUNDS, MID: OPS_TOOL_MID_ROUNDS, COMPACT: OPS_TOOL_COMPACT_CHARS, BUDGET: OPS_ROUND_INPUT_BUDGET_TOKENS };")();

// The 2.39.2 behaviour, kept here as the "before" for the cost comparison: newest 2 tool rounds whole, older tool results cut to
// their first 1200 chars, assistant messages untouched.
function v2392(msgs, budgetTokens) {
  const sys = msgs.filter((m) => m.role === "system"), rest = msgs.filter((m) => m.role !== "system");
  const budget = Math.max(budgetTokens - lib.estTokens(JSON.stringify(sys)) - 4096, 1024);
  const rounds = []; let cur = null;
  for (const m of rest) { if (!cur || m.role !== "tool") { cur = [m]; rounds.push(cur); } else cur.push(m); }
  let seen = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (!rounds[i].some((m) => m.role === "tool")) continue;
    if (++seen <= 2) continue;
    rounds[i] = rounds[i].map((m) => m.role === "tool" && m.content.length > 1200 ? Object.assign({}, m, { content: m.content.slice(0, 1200) + "\n[compacted]" }) : m);
  }
  const kept = []; let used = 0;
  for (let i = rounds.length - 1; i >= 0; i--) { const c = lib.estTokens(JSON.stringify(rounds[i])); if (used + c > budget) break; kept.unshift(rounds[i]); used += c; }
  return sys.concat(kept.flat());
}

ok(lib.KEEP === 2 && lib.MID === 4 && lib.COMPACT === 1200 && lib.BUDGET === 32000, "defaults: keep 2, mid 4, 1200-char threshold, 32000-token round budget");
ok(/\n  compactToolRounds\(rounds\);\n  if \(hard\) opsSqueezeRounds\(rounds, budget\);/.test(src), "truncateToContext compacts before the budget walk, then squeezes on the hard path");

// A job transcript: system, user, then N assistant tool-call rounds each followed by one tool result.
function job(n, o) {
  o = Object.assign({ size: 16384, reason: 0, args: 20, content: "" }, o || {});
  const m = [{ role: "system", content: "SYS" }, { role: "user", content: "do the thing" }];
  for (let i = 0; i < n; i++) {
    const a = { role: "assistant", content: o.content, tool_calls: [{ id: "c" + i, type: "function", function: { name: "shell_exec", arguments: JSON.stringify({ cmd: "k" + i + ":" + "y".repeat(o.args), timeout: 30 }) } }] };
    if (o.reason) a.reasoning_content = "think" + i + ":" + "r".repeat(o.reason);
    m.push(a);
    m.push({ role: "tool", tool_call_id: "c" + i, content: "R" + i + ":" + "x".repeat(o.size) + ":END" + i });
  }
  return m;
}
const BIG = 262144 - 8192;

// 27 tool rounds of 16k results (the 2026-10-06 jobs): bands by age.
const j27 = job(27);
const j27json = JSON.stringify(j27);
const out = lib.truncateToContext(j27, BIG);
ok(JSON.stringify(j27) === j27json, "the input transcript is not mutated");
const tools = out.filter((m) => m.role === "tool");
ok(tools.length === 27, "no tool message is dropped from a 27-call job", tools.length);
ok(tools.slice(-2).every((m) => m.content.length > 16000), "the newest 2 tool results are whole");
const mid = tools.slice(-6, -2), old = tools.slice(0, -6);
ok(mid.every((m) => m.content.length > 1000 && m.content.length < 1500), "the next 4 are head+tail excerpts under 1500 chars", mid.map((m) => m.content.length));
ok(old.every((m) => m.content.length < 500), "older ones are digests under 500 chars", old.map((m) => m.content.length).slice(0, 3));
ok(/\[compacted: \d+ chars from the middle of this older tool result were dropped to save context; re-run the tool if you need the full output\]/.test(mid[0].content), "a mid note names the cut and the remedy");
ok(/\[compacted \d+ chars; re-run the tool for the full output\]/.test(old[0].content), "a digest note names the cut and the remedy");
ok(mid[0].content.startsWith("R21:") && mid[0].content.endsWith(":END21"), "a compacted result keeps its head and its tail");
ok(old[0].content.startsWith("R0:") && old[0].content.endsWith(":END0"), "a digest keeps its head and its tail");
ok(out.filter((m) => m.role !== "tool").length === j27.filter((m) => m.role !== "tool").length, "every system, user and assistant message is kept");
ok(out[1].content === "do the thing" && out[0].content === "SYS", "the instruction and system prompt are unchanged");

// The assistant side of an older round.
const rich = job(12, { size: 5000, reason: 3000, args: 2500, content: "c".repeat(3000) });
const ro = lib.truncateToContext(rich, BIG);
const asst = ro.filter((m) => m.role === "assistant");
const newestA = asst.slice(-2), midA = asst.slice(-6, -2), oldA = asst.slice(0, -6);
ok(newestA.every((m) => m.reasoning_content.length > 3000 && m.content.length === 3000 && m.tool_calls[0].function.arguments.length > 2500), "the newest 2 assistant messages are whole");
ok(midA.every((m) => m.reasoning_content.startsWith("[reasoning compacted: ") && m.reasoning_content.length < 400 && m.content.length < 1300), "mid assistant messages keep a short reasoning tail and an excerpt of long content", midA.map((m) => m.reasoning_content.length));
ok(oldA.every((m) => m.reasoning_content.length < 60 && m.content.length < 500), "old assistant messages keep a marker for reasoning and a short content", oldA.map((m) => [m.reasoning_content.length, m.content.length]));
const argsOf = (m) => m.tool_calls[0].function.arguments;
ok(midA.concat(oldA).every((m) => { try { const o = JSON.parse(argsOf(m)); return Object.keys(o).join() === "cmd,timeout" && o.timeout === 30; } catch (e) { return false; } }), "compacted arguments stay valid JSON with the same keys and small values");
ok(oldA.every((m) => argsOf(m).length < 300) && midA.every((m) => argsOf(m).length < 700), "long argument strings are shortened by age");
ok(oldA.every((m, i) => m.tool_calls[0].id === "c" + i && m.reasoning_content.length > 0), "tool_call ids and the presence of reasoning_content survive");
ok(lib.opsShrinkArgs("{not json" + "x".repeat(2000), 400).startsWith("{not json"), "unparseable arguments are left alone");
ok(lib.opsShrinkArgs(JSON.stringify({ __proto__x: "a".repeat(900), n: 5, a: ["b".repeat(900)] }), 400).includes("chars compacted"), "nested and array strings are shortened");
const answer = { role: "assistant", content: "A".repeat(5000) };
const mixedAns = job(8).concat([]);
mixedAns.splice(2, 0, answer);
const ma = lib.truncateToContext(mixedAns, BIG);
ok(ma.some((m) => m.role === "assistant" && !m.tool_calls && m.content.length === 5000), "an assistant answer without tool calls is never compacted");

// Small results and short jobs are untouched.
const small = job(5, { size: 500 });
ok(JSON.stringify(lib.truncateToContext(small, BIG)) === JSON.stringify(small), "results under the threshold are unchanged");
const two = job(2);
ok(JSON.stringify(lib.truncateToContext(two, BIG)) === JSON.stringify(two), "a job with 2 tool rounds is unchanged");

// Non-string tool content and non-tool long messages are never touched.
const mixed = job(9);
mixed[3] = Object.assign({}, mixed[3], { content: [{ type: "text", text: "y".repeat(5000) }] });
mixed.push({ role: "user", content: "z".repeat(20000) });
const mo = lib.truncateToContext(mixed, BIG);
ok(Array.isArray(mo[3].content) && mo[3].content[0].text.length === 5000, "array tool content is left as is");
ok(mo[mo.length - 1].content.length === 20000, "a long user message is never compacted");
ok(lib.compactToolRounds([]).length === 0, "empty input is safe");

// Idempotent: callDeepSeek runs truncateToContext again on the copy a loop already bounded, and compaction must not drift or nest.
const idem = job(30, { size: 5000, reason: 2500, args: 2000, content: "c".repeat(2000) });
const once = lib.opsBoundRound(idem);
ok(JSON.stringify(lib.opsBoundRound(once)) === JSON.stringify(once), "bounding a bounded transcript changes nothing");
ok(JSON.stringify(lib.truncateToContext(once, BIG)) === JSON.stringify(once), "the context walk after the bound changes nothing");
ok(!/\[reasoning compacted[^\]]*\] \[reasoning compacted/.test(JSON.stringify(once)) && !/compacted[^"]{0,60}compacted \d+ chars/.test(JSON.stringify(once).replace(/\[compacted: \d+ chars from the middle[^\]]*\]/g, "")), "no marker is nested inside another");

// Plain chat passes through the hard path untouched; an agent transcript is bounded.
const chat = [{ role: "system", content: "S" }, { role: "user", content: "hi" }, { role: "assistant", content: "x".repeat(50000) }, { role: "user", content: "again" }];
ok(lib.opsBoundRound(chat) === chat, "a transcript with no tool traffic is returned as is");
ok(lib.isAgentTranscript(j27) && !lib.isAgentTranscript(chat), "isAgentTranscript tells them apart");

// Hard per-round budget: a 40-turn job with large results and reasoning. Every round stays inside the budget and the task survives.
const big40 = job(40, { size: 16384, reason: 4000, args: 1500, content: "c".repeat(600) });
let worst = 0, taskKept = true, newestKept = true, noOrphans = true;
for (let r = 1; r <= 40; r++) {
  const t = big40.slice(0, 2 + 2 * r);
  const b = lib.opsBoundRound(t);
  worst = Math.max(worst, lib.estTokens(JSON.stringify(b)));
  if (!b.some((m) => m.role === "user" && m.content.endsWith("do the thing"))) taskKept = false;
  const lastTool = t[t.length - 1];
  if (!b.some((m) => m.role === "tool" && m.tool_call_id === lastTool.tool_call_id)) newestKept = false;
  const ids = new Set(); for (const m of b) if (m.role === "assistant" && m.tool_calls) for (const c of m.tool_calls) ids.add(c.id);
  for (const m of b) if (m.role === "tool" && !ids.has(m.tool_call_id)) noOrphans = false;
}
ok(worst <= lib.BUDGET + 4096, "no round of a 40-turn job carries more than the budget (plus the 4096 reserve)", worst);
ok(taskKept, "the task message is kept on every round, even when old rounds are dropped");
ok(newestKept, "the newest tool result is kept on every round");
ok(noOrphans, "a tool message never appears without the assistant message that called it");
const lastB = lib.opsBoundRound(big40);
ok(/history truncated/.test(JSON.stringify(lastB)) === (lastB.length < big40.length), "dropped rounds are announced when any are dropped");
ok(lastB.length === big40.length, "a 40-turn job fits the budget as digests, so no round is dropped");
// A 200-round transcript cannot fit even as digests: the oldest rounds are dropped, announced, and the task stays.
const long200 = job(200, { size: 3000, reason: 800, args: 300 });
const l200 = lib.opsBoundRound(long200);
ok(l200.length < long200.length && lib.estTokens(JSON.stringify(l200)) <= lib.BUDGET + 4096, "a 200-round transcript is cut to the budget", [l200.length, long200.length]);
ok(l200.some((m) => m.role === "user" && m.content.includes("do the thing")) && /\[history truncated: \d+ earlier messages dropped to fit model context\]/.test(l200.find((m) => m.role === "user").content), "dropped rounds are announced on the pinned task");
ok(l200[l200.length - 1].tool_call_id === "c199" && l200.some((m) => m.role === "tool" && m.content.startsWith("R199:") && m.content.length > 2900), "the newest round is kept whole");

// A newest round that alone exceeds the budget is squeezed, not dropped.
const huge = job(3, { size: 16384 });
const hIds = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
huge.push({ role: "assistant", content: "", tool_calls: hIds.map((id) => ({ id, type: "function", function: { name: "t", arguments: "{}" } })) });
for (const id of hIds) huge.push({ role: "tool", tool_call_id: id, content: "H" + id + ":" + "z".repeat(16384) });
const hb = lib.opsBoundRound(huge);
const hTools = hb.filter((m) => m.role === "tool" && /^Hh/.test(m.content));
ok(hTools.length === 8 && hTools.every((m) => m.content.startsWith("Hh") && m.content.length < 7000), "the newest round's results are squeezed to about 6000 chars when the budget needs it", hTools.map((m) => m.content.length));

// Cost of a job: the prompt is resent every round, so sum the prompt over rounds 0..40 for a job shaped like job-27a22cfb02c6a5
// (40 turns, 54 tool calls, about 870 completion tokens a turn, mostly short shell results).
function jobCost(opts, n) {
  const t = job(n, opts);
  let before = 0, raw = 0, after = 0;
  for (let r = 1; r <= n; r++) {
    const part = t.slice(0, 2 + 2 * r);
    raw += lib.estTokens(JSON.stringify(part));
    before += lib.estTokens(JSON.stringify(v2392(part, BIG)));
    after += lib.estTokens(JSON.stringify(lib.opsBoundRound(part)));
  }
  return { raw, before, after, ratio: +(after / before).toFixed(3) };
}
const shape = { size: 1500, reason: 1500, args: 700, content: "c".repeat(300) };
const c1 = jobCost(shape, 40);
ok(c1.after < c1.before * 0.65, "a 40-turn shell-heavy job sends under 65 percent of the 2.39.2 prompt tokens", c1);
const c2 = jobCost({ size: 16384, reason: 300, args: 300, content: "c" }, 40);
ok(c2.after < c2.before * 0.8, "a 40-turn job with 16k results (two whole newest rounds dominate) sends under 80 percent of the 2.39.2 prompt tokens", c2);
const c3 = jobCost({ size: 2500, reason: 4000, args: 600, content: "c".repeat(400) }, 40);
ok(c3.after < c3.before * 0.55, "a 40-turn job with long reasoning sends under 55 percent of the 2.39.2 prompt tokens", c3);
const c4 = jobCost({ size: 3000, reason: 1500, args: 600, content: "c".repeat(300) }, 12);
ok(c4.after <= c4.before, "a short job never sends more than 2.39.2 did", c4);

// Wiring: the loops send the bounded copy; the job cost projection prices it.
ok(/callDeepSeek\(env, opsBoundRound\(work\), capNow, withTools \? toolsPayload\(\) : null,/.test(src), "the job loop sends opsBoundRound(work) each round");
ok(/callDeepSeek\(env, opsBoundRound\(work\), answerCap, null, \{ temperature, topP, upstreamModel: execUpstream/.test(src), "the job loop's length retry sends the bounded copy");
ok(/_jobEstNext = costUsdCalc\(\(upUsage && upUsage\.prompt_tokens \|\| 0\) \+ estTokens\(JSON\.stringify\(opsBoundRound\(work\)\)\)/.test(src), "the job cost projection prices the bounded copy");
ok(/const sendWork = function\(w\) \{ return clientTools \? w : opsBoundRound\(w\); \};/.test(src), "the chat loop bounds its copy unless a client runs its own tool loop");
ok(/callDeepSeekStream\(env, sendWork\(work\), capNow, toolsNow, _dsOpts,/.test(src) && /_r1 = await callDeepSeek\(env, sendWork\(work\), capNow, toolsNow, _dsOpts\);/.test(src), "both chat-round upstream calls send sendWork(work)");
ok(!/callDeepSeek(Stream)?\(env, work, (capNow|answerCap)/.test(src), "no loop call still sends the raw transcript");

// D1-LIVE-COLUMNS-1: a bad column answers with the live columns of the right table.
const tabSrc = grab("function d1TablesIn(sql) {", "\nasync function d1LiveColumns(");
const liveSrc = grab("async function d1LiveColumns(db, sql, msg) {", "\nasync function d1Query(env, args) {");
ok(tabSrc && liveSrc, "d1TablesIn and d1LiveColumns are found in worker.js");
const d1 = new Function(tabSrc + "\n" + liveSrc + "\nreturn { d1TablesIn, d1LiveColumns };")();
const t1 = d1.d1TablesIn("SELECT w.id, t.status FROM work_claims w LEFT JOIN code_tasks AS t ON w.holder = t.id WHERE 1 ORDER BY w.id");
ok(JSON.stringify(t1) === JSON.stringify([{ name: "work_claims", alias: "w" }, { name: "code_tasks", alias: "t" }]), "d1TablesIn reads tables and aliases, not keywords", t1);
ok(d1.d1TablesIn("select a from (select 1 as a) x").length === 0, "a subquery in FROM is not a table");
const TABLES = { work_claims: "id, path, holder, expires_at", code_tasks: "id, status, step", fleet_runs: "id, task_id, cron_name, status, started_at", v_metric_trigger_state: "metric, hit" };
const calls = [];
const db = { prepare(sql) { const m = /pragma_table_info\('([^']+)'\)/.exec(sql); calls.push(m && m[1]); return { all: async () => ({ results: [{ cols: m && TABLES[m[1]] || null }] }) }; } };
const l1 = await d1.d1LiveColumns(db, "SELECT w.id, w.task_id FROM work_claims w LEFT JOIN code_tasks t ON w.holder = t.id", "D1_ERROR: no such column: w.task_id at offset 13: SQLITE_ERROR");
ok(l1 && l1.available_columns === TABLES.work_claims && l1.available_columns_table === "work_claims" && !l1.available_columns_by_table, "an aliased column resolves to its own table", l1);
const l2 = await d1.d1LiveColumns(db, "SELECT ts, task_id FROM fleet_runs WHERE 1", "D1_ERROR: no such column: ts at offset 7: SQLITE_ERROR");
ok(l2 && l2.available_columns === TABLES.fleet_runs && /no|not/.test(l2.hint), "a single-table query returns that table's live columns", l2);
const l3 = await d1.d1LiveColumns(db, "SELECT ts FROM work_claims a JOIN code_tasks b ON a.id = b.id", "D1_ERROR: no such column: ts at offset 7: SQLITE_ERROR");
ok(l3 && l3.available_columns_by_table && Object.keys(l3.available_columns_by_table).join() === "work_claims,code_tasks" && !l3.available_columns, "an unqualified column in a join lists every table's live columns", l3);
const l4 = await d1.d1LiveColumns(db, "SELECT metric, bogus FROM v_metric_trigger_state", "D1_ERROR: no such column: bogus at offset 15: SQLITE_ERROR");
ok(l4 && l4.available_columns === TABLES.v_metric_trigger_state, "a view works the same way", l4);
const before = calls.length;
const l5 = await d1.d1LiveColumns(db, "SELECT * FROM _cf_KV", "D1_ERROR: no such column: x at offset 1: SQLITE_ERROR");
ok(l5 === null && calls.length === before, "an internal table is never described");
const l6 = await d1.d1LiveColumns(db, "SELECT a FROM not_a_table", "D1_ERROR: no such column: a");
ok(l6 === null, "an unknown table yields nothing, so the index fallback runs");
ok(/let _live = null;\n\s+if \(\/no such column\/i\.test\(msg\)\) \{\n\s+try \{ _live = await d1LiveColumns\(env\[bind\], sqlEff, msg\);/.test(src) && /if \(!_live && \/no such \(column\|table\)\/i\.test\(msg\) && env\.QNFO_AUDIT\)/.test(src), "d1Query asks the live columns first and keeps the index as the fallback");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
