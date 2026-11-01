import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("    var retryModels =");
const end = src.indexOf("    if (retryPiece && retryPiece.text)", start);
assert.ok(start >= 0 && end > start, "extract the essay's corrective retry, including its provider call");
const retry = new Function("compose", "COMPOSE_MODELS", "TITLE_REPAIR_ON", "composeOrder",
  "return async function(env, piece) { var retryPiece = null, retryPrompt = 'CORRECTIVE', banned = [];\n"
  + src.slice(start, end) + "\nreturn retryPiece; }")(
  mod.__title.compose, mod.__gen.COMPOSE_MODELS, { titleRepair: true }, mod.__gen.composeOrder);
const [N, G, K] = mod.__gen.COMPOSE_MODELS;
const para = (i) => `The operators of the storage cluster in paragraph ${i} chose to keep three replicas of every block because a single disk failure during a rebuild would otherwise lose data, and that choice set the cost of every write they accepted from then on. The trade is plain: each extra replica buys time during a rebuild and charges it back on every ordinary write, so the cluster paid for safety in latency long before any disk failed.`;
const valid = "# Three replicas made every write slower\n\n"
  + [1, 2, 3, 4, 5, 6, 7].map(para).join("\n\n")
  + "\n\nworth your time: yes — it names the cost of the replica choice.";
const invalid = "# Replicas cost writes\n\n" + para(1) + "\n\nworth your time: yes — x.";
assert.ok(mod.__title.gate(valid, []).ok);
assert.ok(!mod.__title.gate(invalid, []).ok);
function envFor(reply, order) {
  const calls = [], meter = { compose: 0 };
  const env = { calls, q08Meter: meter, AI: { run: async (model, input) => {
    calls.push({ model, prompt: input.messages[0].content });
    return { response: reply(model) };
  } } };
  if (order) env.AUDIT = { prepare: (sql) => {
    const st = { bind: () => st, first: async () => /ops_config/.test(sql) ? { value: order } : { n: 0 }, run: async () => ({}) };
    return st;
  } };
  return env;
}
{
  const env = envFor(() => invalid);
  const piece = await mod.__title.compose(env, "INITIAL", [], undefined, undefined, { titleRepair: true });
  assert.equal(env.calls.length, 3, "the initial writer pool is unchanged");
  assert.equal(piece.trail.length, 3);
  assert.ok(piece.trail.every((t) => t.problems.length));
  assert.equal(await retry(env, piece), null, "exhausted retries retain the rejected draft");
  assert.equal(env.calls.length, 3, "no second full writer pool is spent after every writer failed");
  assert.equal(env.q08Meter.compose, 3, "the saved provider calls are reflected in the meter");
}
{
  const env = envFor((m) => m === G ? valid : invalid, K + "," + G);
  const piece = { text: invalid, trail: [{ model: N, problems: ["writer gate failed"] }] };
  const repaired = await retry(env, piece);
  assert.deepEqual(env.calls.map((c) => c.model), [K, G], "surviving writers retain the configured order");
  assert.ok(env.calls.every((c) => c.prompt === "CORRECTIVE"));
  assert.equal(repaired.model, G, "a surviving writer can still repair the draft");
  assert.ok(mod.__title.gate(repaired.text, []).ok, "a correction still passes the full writer gate");
}
{
  const env = envFor(() => valid);
  const piece = { text: valid, trail: [
    { model: N, problems: ["title rejected"] },
    { model: N, problems: [] },
    { model: G, problems: ["empty or short reply"] },
  ] };
  const repaired = await retry(env, piece);
  assert.deepEqual(env.calls.map((c) => c.model), [K], "failed attempts, including title and short-reply failures, are not replayed");
  assert.equal(repaired.model, K);
}
{
  const env = envFor(() => valid);
  const piece = { text: invalid, trail: [N, G, K].map((model) => ({ model, problems: ["error: timeout"] })) };
  assert.equal(await retry(env, piece), null);
  assert.equal(env.calls.length, 0, "an exhausted error trail does not restart the pool");
}
{
  const env = envFor(() => valid);
  assert.ok(await retry(env, { text: invalid }), "a legacy draft with no trail retains its fallback");
  assert.deepEqual(env.calls.map((c) => c.model), [N]);
}
console.log("compose-retry.test.mjs: all passed");
