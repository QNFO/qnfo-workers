/**
 * goal-review-empty-reply.test.mjs -- offline regression lock for REVIEW-ROTATE-1 (agent_issues 2909).
 * Slices the GOAL-REVIEW-1 block plus cmReviewRun / cmGoalReview out of worker.js and drives them with a scripted reviewer.
 * Measured 24 h to 2026-10-19: deepseek-v4-flash-0731 answered with an empty reply on 22 of 26 unreadable-reply events and
 * cmGoalReview re-ran that SAME model on all three tries, so the goal-review safety layer dropped out ("the checks decide")
 * while gpt-oss-120b read the same diffs at the first try. Proves:
 *   - the reviewer for try N rotates through the eligible models (never the proposer's family), pure and for the second reviewer;
 *   - an empty reply from the first model is followed by a different model on the next try, which yields the verdict;
 *   - the slot records finish_reason, completion_tokens and the models tried, so the cause of an empty reply is captured;
 *   - an empty content with reasoning_content that ended on its own (finish stop) is read only as a complete verdict JSON object (a recited schema or a draft is unreadable, REVIEW-STRICT-REASONING-1); one cut at the budget (length) is not;
 *   - the budget is higher than the old 3000, a retry asks for reasoning_effort low only on a model that accepts it, and a
 *     reply cut at the budget raises the budget on the next try;
 *   - a recovered no-verdict logs warn only; all tries unreadable logs one error and ends "the checks decide".
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/goal-review-empty-reply.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const g1 = src.indexOf("// ---- GOAL-REVIEW-1:BEGIN"), g2 = src.indexOf("// ---- GOAL-REVIEW-1:END ----");
const r1 = src.indexOf("async function cmReviewRun("), r2 = src.indexOf('__name(cmGoalReview, "cmGoalReview");');
if (g1 < 0 || g2 < g1 || r1 < 0 || r2 < r1) { console.error("FAIL goal-review blocks not found in worker.js"); console.log("1 failed"); process.exit(1); }

const logs = { warn: [], error: [] };
const cap = { log() {}, warn: (x) => logs.warn.push(String(x)), error: (x) => logs.error.push(String(x)) };
const store = new Map();
const AUDIT = {
  prepare(sql) {
    let args = [];
    const self = {
      bind(...x) { args = x; return self; },
      async first() { return /SELECT meta FROM cloud_ops_events/.test(sql) && store.has(args[0]) ? { meta: store.get(args[0]).meta } : null; },
      async run() { if (/INSERT INTO cloud_ops_events/.test(sql)) store.set(args[0], { text: args[2], meta: args[3], status: args[5] }); return { success: true }; }
    };
    return self;
  }
};
const calls = [];
let script = () => ({ choices: [{ message: { content: "" }, finish_reason: "stop" }] });
const sandbox = {
  __name: (f) => f, console: cap, JSON, Math, Date, Number, String, Object, Array, RegExp, isFinite, __export: null,
  CM_RUNNER: "test-runner",
  cmRead: async () => ({ text: "var x = 1;\n" }),
  aiRunAttr: async (env, worker, purpose, model, input) => { calls.push({ model, input }); const r = script(model, input, calls.length); if (r instanceof Error) throw r; return r; }
};
vm.createContext(sandbox);
vm.runInContext(src.slice(g1, g2) + "\n" + src.slice(r1, r2) + '\n__export = { cmReviewModel, cmSecondReviewer, cmReviewRun, cmGoalReview, CM_REVIEW_MODELS, CM_REVIEW_TRIES, cmReviewReply: typeof cmReviewReply === "function" ? cmReviewReply : function() { return {}; }, CM_REVIEW_MAX_TOKENS: typeof CM_REVIEW_MAX_TOKENS === "number" ? CM_REVIEW_MAX_TOKENS : 3000 };', sandbox);
const W = sandbox.__export;

let passed = 0, failed = 0;
function ok(c, label, extra) { if (c) { passed++; return; } failed++; console.error("FAIL " + label + (extra !== undefined ? "  -- " + JSON.stringify(extra) : "")); }

const GPT = "@cf/openai/gpt-oss-120b", DS = "@cf/deepseek-ai/deepseek-v4-flash-0731", NEM = "@cf/nvidia/nemotron-3-120b-a12b";
const PROPOSER = "@cf/openai/gpt-oss-20b"; // openai family: the eligible reviewers are deepseek then nemotron
const VERDICT = '{"verdict":"implements","harm":false,"defects":[]}';
const msg = (content, extra, finish, tokens) => ({ choices: [{ message: Object.assign({ content }, extra || {}), finish_reason: finish || "stop" }], usage: { completion_tokens: tokens == null ? 7 : tokens } });

// ---- pure: the reviewer rotates with the try, never into the proposer's family
ok(W.cmReviewModel(PROPOSER) === DS && W.cmReviewModel(PROPOSER, null, 0) === DS, "try 0 keeps the first eligible reviewer (deepseek for an openai proposer)");
ok(W.cmReviewModel(PROPOSER, null, 1) === NEM, "try 1 rotates to the next eligible reviewer", W.cmReviewModel(PROPOSER, null, 1));
ok(W.cmReviewModel(PROPOSER, null, 2) === DS && W.cmReviewModel(PROPOSER, null, 3) === NEM, "the rotation wraps over the eligible models only");
ok([0, 1, 2, 3].every((i) => !/openai/.test(W.cmReviewModel(PROPOSER, null, i))), "no try picks the proposer's family");
ok(W.cmReviewModel(null, null, 0) === GPT && W.cmReviewModel(null, null, 1) === DS, "no proposer recorded: every model is eligible");
ok(W.cmReviewModel("@cf/qwen/x", ["@cf/qwen/y"], 2) === null, "no eligible reviewer: null");
ok(W.cmSecondReviewer(PROPOSER, NEM, null, 0) === DS && W.cmSecondReviewer(PROPOSER, NEM, null, 1) === DS, "second reviewer: neither the proposer's nor the first reviewer's family");
ok(W.cmSecondReviewer("@cf/qwen/q", GPT, null, 0) === DS && W.cmSecondReviewer("@cf/qwen/q", GPT, null, 1) === NEM && W.cmSecondReviewer("@cf/qwen/q", GPT, null, 2) === DS, "second reviewer rotates over the families left");

// ---- pure: the reply reader
let rr = W.cmReviewReply(msg(VERDICT, null, "stop", 12));
ok(rr.text === VERDICT && rr.finish === "stop" && rr.tokens === 12 && rr.from === "content", "content is read with finish_reason and completion_tokens", rr);
rr = W.cmReviewReply(msg("", { reasoning_content: VERDICT }, "stop"));
ok(rr.text === VERDICT && rr.from === "reasoning", "empty content ending on its own: reasoning_content is read", rr);
rr = W.cmReviewReply(msg(null, { reasoning: VERDICT }, "stop"));
ok(rr.text === VERDICT && rr.from === "reasoning", "null content: message.reasoning is read", rr);
rr = W.cmReviewReply(msg("", { reasoning_content: VERDICT }, "length", 3000));
ok(rr.text === "" && rr.finish === "length" && rr.tokens === 3000, "empty content cut at the budget: the reasoning is not a conclusion and is not read", rr);
rr = W.cmReviewReply({ response: VERDICT });
ok(rr.text === VERDICT, "the legacy response field is read");
rr = W.cmReviewReply(null);
ok(rr.text === "" && rr.from === "none", "no reply reads as empty");

// ---- cmGoalReview driven across ticks (one try per call; the cached row carries the slot)
const env = { AI: {}, AUDIT };
const cfg = { goalReview: true, reviewModels: null };
const cx = { iso: "2026-10-19T06:00:00.000Z" };
const task = (id) => ({ id, model: PROPOSER, goal: "do the thing", path: "qnfo-x/worker.js" });
const files = [{ filename: "qnfo-x/worker.js", patch: "@@ -1,1 +1,2 @@\n var x = 1;\n+var y = 2;\n" }];
const reset = () => { calls.length = 0; logs.warn.length = 0; logs.error.length = 0; };
const rowOf = (id, head) => JSON.parse(store.get("goal-review-" + id + "-" + head.slice(0, 12)).meta);

// A. deepseek empty (finish length), nemotron answers: the second try uses another model and yields the verdict
reset();
script = (model) => model === DS ? msg("", { reasoning_content: "thinking..." }, "length", 3000) : msg(VERDICT);
let d = await W.cmGoalReview(env, cx, task("ct_a"), cfg, "aaaaaaaaaaaa1111", files);
ok(d.wait === true && calls.length === 1 && calls[0].model === DS, "try 1 goes to deepseek and waits", { d, models: calls.map((c) => c.model) });
let row = rowOf("ct_a", "aaaaaaaaaaaa1111");
ok(row.finish === "length" && row.completion_tokens === 3000 && /finish length/.test(row.err) && row.models.length === 1, "the unreadable try records finish_reason, completion_tokens and the model", row);
ok(calls[0].input.max_tokens > 3000 && calls[0].input.max_tokens === W.CM_REVIEW_MAX_TOKENS && !("reasoning_effort" in calls[0].input), "first try: budget above the old 3000, no reasoning_effort sent to deepseek", calls[0].input);
d = await W.cmGoalReview(env, cx, task("ct_a"), cfg, "aaaaaaaaaaaa1111", files);
row = rowOf("ct_a", "aaaaaaaaaaaa1111");
ok(calls.length === 2 && calls[1].model === NEM, "try 2 rotates to the next eligible model, not deepseek again", calls.map((c) => c.model));
ok(row.verdict === "implements" && row.model === NEM && row.models.join() === [DS, NEM].join() && d.note && /implements \(/.test(d.note), "the verdict comes from the second model and the models tried are recorded", { row, d });
ok(calls[1].input.max_tokens > calls[0].input.max_tokens, "after a reply cut at the budget the next try raises the budget", [calls[0].input.max_tokens, calls[1].input.max_tokens]);
ok(logs.error.length === 0 && logs.warn.some((w) => /no-verdict/.test(w)) && logs.warn.some((w) => /cmReviewRun:recovered/.test(w)), "a recovered no-verdict is warn only", logs);

// B. every model empty: three tries on three rotated calls, one error, "the checks decide"
reset();
script = () => msg("", null, "stop", 0);
let last;
for (let i = 0; i < 4; i++) last = await W.cmGoalReview(env, cx, task("ct_b"), cfg, "bbbbbbbbbbbb2222", files);
ok(calls.length === W.CM_REVIEW_TRIES && calls.map((c) => c.model).join() === [DS, NEM, DS].join(), "three tries rotate deepseek, nemotron, deepseek and a fourth call reads the cache", calls.map((c) => c.model));
ok(last.note && /unavailable after 3 tries; the checks decide/.test(last.note), "all unreadable: the existing 'checks decide' note", last);
ok(logs.error.length === 1 && /cmReviewRun:unreadable/.test(logs.error[0]) && /"tries":3/.test(logs.error[0]), "the final failure is one console.error", logs.error);

// C. reasoning-only reply that ended on its own is read at the first try
reset();
script = () => msg("", { reasoning_content: 'Weighing it... {"verdict":"partial","harm":false,"defects":[]}' }, "stop", 900);
await W.cmGoalReview(env, cx, task("ct_c"), cfg, "cccccccccccc3333", files);
row = rowOf("ct_c", "cccccccccccc3333");
ok(row.verdict === "partial" && row.read_from === "reasoning" && row.tries === 1, "a verdict inside reasoning_content (finish stop) is read at the first try", row);

// C2. reasoning text is read only as a strictly parsed verdict object: a recited schema or a draft is not a verdict
const SCHEMA = 'We must reply with {"verdict":"implements"|"partial"|"no","harm":true|false,"defects":[...]}. The diff looks wrong, so maybe verdict: no? harm: true';
const DRAFTS = [SCHEMA, 'Draft: verdict: implements? Let me check the diff again.', 'Draft {"verdict": "implements", "harm": false, "defects": [] but the object is never closed', 'My verdict is "verdict": "partial" for now, to be confirmed.'];
for (let i = 0; i < DRAFTS.length; i++) {
  reset();
  script = (model) => model === DS ? msg("", { reasoning_content: DRAFTS[i] }, "stop", 900) : msg(VERDICT);
  await W.cmGoalReview(env, cx, task("ct_d" + i), cfg, "c2c2c2c2c2c2c2c" + i, files);
  await W.cmGoalReview(env, cx, task("ct_d" + i), cfg, "c2c2c2c2c2c2c2c" + i, files);
  row = rowOf("ct_d" + i, "c2c2c2c2c2c2c2c" + i);
  ok(row && row.verdict === "implements" && row.tries === 2 && row.model === NEM && row.read_from === "content", "reasoning " + i + " (schema recited or draft) is unreadable: the slot rotates and takes the committed reply", row);
  ok(calls.length === 2 && calls[0].model === DS, "reasoning " + i + ": the first try was the reasoning-only reply", calls.map((c) => c.model));
}
// every try reasoning-only with a recited schema: no verdict is invented, the slot ends unreadable
reset();
script = () => msg("", { reasoning_content: SCHEMA }, "stop", 900);
for (let n = 0; n < W.CM_REVIEW_TRIES; n++) await W.cmGoalReview(env, cx, task("ct_c5"), cfg, "c5c5c5c5c5c55c5c", files);
row = rowOf("ct_c5", "c5c5c5c5c5c55c5c");
ok(row && !row.verdict && /unreadable reply/.test(String(row.err || "")), "a recited schema on every try never becomes a verdict", row);
// the last complete verdict object in the reasoning wins over an earlier draft object
reset();
script = () => msg("", { reasoning_content: 'First {"verdict":"implements","harm":false,"defects":[]} no wait. Final {"verdict":"no","harm":true,"defects":[{"line":"+x","why":"breaks it"}]}' }, "stop", 900);
await W.cmGoalReview(env, cx, task("ct_c6"), cfg, "c6c6c6c6c6c66c6c", files);
row = rowOf("ct_c6", "c6c6c6c6c6c66c6c");
ok(row && row.verdict === "no" && row.read_from === "reasoning", "the last complete verdict object in reasoning is the one read", row);
// content (committed text) keeps its tolerant parse: a verdict named outside JSON is still read
reset();
script = () => msg("Verdict: **partial**", null, "stop", 20);
await W.cmGoalReview(env, cx, task("ct_c7"), cfg, "c7c7c7c7c7c77c7c", files);
row = rowOf("ct_c7", "c7c7c7c7c7c77c7c");
ok(row && row.verdict === "partial" && row.read_from === "content", "content keeps the tolerant verdict reader", row);

// D. reasoning_effort low goes to a model that accepts it, on a retry only
reset();
script = (model) => model === GPT ? msg(VERDICT) : msg("", null, "stop", 0);
const slot = { tries: 1 };
await W.cmReviewRun(env, slot, GPT, { system: "s", user: "u" }, "", null);
ok(calls[0].input.reasoning_effort === "low" && slot.verdict === "implements", "a retry on gpt-oss-120b sends reasoning_effort low", calls[0].input);
const slot0 = {};
await W.cmReviewRun(env, slot0, GPT, { system: "s", user: "u" }, "", null);
ok(!("reasoning_effort" in calls[1].input), "a first try is sent as before, without reasoning_effort", calls[1].input);

// E. a thrown AI error is rotated too and logged as error only on the last try
reset();
script = (model) => model === DS ? new Error("AiError: capacity") : msg(VERDICT);
await W.cmGoalReview(env, cx, task("ct_e"), cfg, "eeeeeeeeeeee5555", files);
await W.cmGoalReview(env, cx, task("ct_e"), cfg, "eeeeeeeeeeee5555", files);
row = rowOf("ct_e", "eeeeeeeeeeee5555");
ok(row.verdict === "implements" && row.model === NEM && logs.error.length === 0, "a thrown error on try 1 rotates to the next model and recovers without an error log", { row, logs });

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
