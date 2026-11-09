// RM-AUTOROUTER-EVAL-1: bounded, authenticated replay of logged prompts against AI Gateway Auto Router.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "qnfo-ai-autorouter-"));
writeFileSync(join(dir, "worker.mjs"), readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const worker = (await import(pathToFileURL(join(dir, "worker.mjs")).href)).default;
const checks = [];
const ok = (condition, name, actual) => checks.push({ condition, name, actual });
const rows = [
  { id: "private-email", prompt: "Please email me at user@example.org", response: "Not replayed" },
  ...Array.from({ length: 6 }, (_, i) => ({
    id: "sample-" + i,
    ts: new Date().toISOString(),
    model: "dynamic/value",
    strategy: "ladder",
    complexity: "chat",
    domain: "general",
    prompt: "A safe evaluation prompt " + i,
    response: "Historical answer " + i,
    prompt_tokens: 8,
    completion_tokens: 4,
    cost_usd: 0.01,
    latency_ms: 100,
    streamed: 0
  }))
];
const calls = [];
const events = [];
let failAutoRouter = false;
let judgeMode = "auto"; // auto | baseline | tie | split | fail
let selectedModel = "@cf/deepseek-ai/deepseek-v4-flash-0731";
const waits = [];
const ctx = { props: {}, waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); } };
const env = () => ({
  ROUTER_AUTH_KEY: "test-key",
  SPEND_CAP_GATEWAY_USD: "100000",
  SPEND_CAP_TOTAL_USD: "100000",
  QNFO_AUDIT: {
    prepare(sql) {
      const st = { args: [] };
      st.bind = (...args) => { st.args = args; return st; };
      st.all = async () => ({ results: /FROM ai_queries/.test(sql) ? rows : [] });
      st.first = async () => null;
      st.run = async () => {
        if (/INSERT INTO cloud_ops_events/.test(sql)) events.push({ sql, args: st.args });
        return { meta: {} };
      };
      return st;
    }
  },
  AI: {
    async run(model, input, opts) {
      calls.push({ model, input, opts });
      if (failAutoRouter && model === "cloudflare/auto") throw new Error("provider details not returned");
      if (model === "@cf/zai-org/glm-5.3-flash" || model === "@cf/openai/gpt-oss-20b") {
        if (judgeMode === "fail") throw new Error("judge down");
        const c = input.messages[0].content;
        const autoFirst = c.indexOf("Answer A:\nA comparable") >= 0;
        const v = judgeMode === "tie" ? "tie" : judgeMode === "split" ? "B" : judgeMode === "auto" ? (autoFirst ? "A" : "B") : (autoFirst ? "B" : "A");
        return { response: v, usage: { prompt_tokens: 10, completion_tokens: 1 } };
      }
      return {
        model: selectedModel,
        response: "A comparable evaluation response",
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      };
    }
  }
});
const post = async (body, key = "test-key") => {
  const response = await worker.fetch(new Request("https://ai.test/internal/eval/autorouter-shadow", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body)
  }), env(), ctx);
  return { status: response.status, json: await response.json() };
};

try {
  let r = await post({ confirm: true }, "wrong-key");
  ok(r.status === 401 && calls.length === 0, "unauthorized requests do not inspect or replay logs", r);
  r = await post({});
  ok(r.status === 400 && calls.length === 0, "prompt replay requires explicit confirmation", r);
  r = await post({ confirm: true, limit: 999 });
  await Promise.all(waits);
  ok(r.status === 200 && r.json.sampled === 5 && r.json.results.length === 5, "a requested limit above five is capped at five", r.json);
  ok(calls.filter((c) => c.model === "cloudflare/auto").length === 5, "only Auto Router is called for sampled records", calls.map((c) => c.model));
  ok(calls.filter((c) => c.model === "cloudflare/auto").every((c) => c.opts.gateway.id === "default" && c.opts.gateway.cacheTtl === 0), "replays use uncached Cloudflare Auto Router on the existing gateway", calls.map((c) => c.opts));
  ok(calls.every((c) => c.input.messages.length === 1 && !/user@example.org/.test(JSON.stringify(c.input))), "obvious email addresses are excluded and each replay is bounded to one logged prompt");
  ok(events.length === 5 && events.every((e) => e.args[2].indexOf("A safe evaluation prompt") < 0 && !e.args[3].includes("Historical answer")), "event records contain hashes and metrics, not prompts or responses", events);
  ok(r.json.results.every((x) => x.quality_verdict === "better" && x.judge_orders.join() === "better,better" && x.quality_judge_model === "@cf/zai-org/glm-5.3-flash" && x.exact_match === false && x.auto_cost_estimate_usd > 0 && x.cost_delta_usd === Math.round((x.auto_cost_estimate_usd - x.baseline_cost_usd) * 1e6) / 1e6), "each replay is judged pairwise by a disjoint-family model and known model costs are compared with the historical ladder cost", r.json.results);
  ok(calls.filter((c) => c.model === "@cf/zai-org/glm-5.3-flash").length === 10, "a disjoint-family judge scores every successful replay once per answer order", calls.map((c) => c.model));
  ok(r.json.quality_comparison.includes("disjoint"), "the recorded quality comparison states how it was judged", r.json.quality_comparison);

  ok(calls.filter((c) => c.model === "cloudflare/auto").every((c) => c.opts.extraHeaders && c.opts.extraHeaders["cf-aig-allowed-providers"] === "workers-ai"), "AUTOROUTER-EVAL-1.3: every replay restricts the Auto Router pool to Workers AI by header", calls.map((c) => c.opts));
  ok(events.every((e) => JSON.parse(e.args[3]).judge_model === "@cf/zai-org/glm-5.3-flash" && JSON.parse(e.args[3]).judge_orders.length === 2), "the event meta carries judge_model and both order verdicts");

  // AUTOROUTER-QUALITY-1: the other verdicts and the failure case
  const one = async (mode) => {
    judgeMode = mode; calls.length = 0; events.length = 0;
    const rr = await post({ confirm: true, limit: 1 });
    await Promise.all(waits);
    return rr.json.results[0];
  };
  let x = await one("baseline");
  ok(x.quality_verdict === "worse" && x.judge_orders.join() === "worse,worse", "baseline preferred in both orders reads worse", x);
  x = await one("tie");
  ok(x.quality_verdict === "same", "tie in both orders reads same", x);
  x = await one("split");
  ok(x.quality_verdict === "split" && x.judge_orders.join() === "better,worse", "a position-biased judge reads split", x);
  x = await one("fail");
  ok(x.quality_verdict === "unjudged" && x.status === "ok", "a judge failure reads unjudged and keeps the replay", x);
  judgeMode = "auto";

  // AUTOROUTER-EVAL-1.3: a non-@cf selected model is skipped with no hashes and no judge
  selectedModel = "anthropic/claude-haiku-5.5";
  x = await one("auto");
  ok(x.status === "skipped_pool" && x.auto_response_sha256 === null && x.baseline_response_sha256 === null && x.quality_verdict === "unjudged" && calls.filter((c) => c.model !== "cloudflare/auto").length === 0, "a non-@cf selected model is recorded as skipped_pool without hashes or a judge", x);
  ok(events.length === 1 && events[0].args[4] === "skipped_pool" && JSON.parse(events[0].args[3]).auto_response_sha256 === null, "the skipped_pool event is written with status skipped_pool");
  selectedModel = "@cf/deepseek-ai/deepseek-v4-flash-0731";

  rows.splice(0, rows.length, { ...rows[1], id: "failed-sample" });
  calls.length = 0;
  events.length = 0;
  failAutoRouter = true;
  r = await post({ confirm: true, limit: 1 });
  await Promise.all(waits);
  ok(r.status === 200 && r.json.results[0].status === "failed" && events.length === 1, "provider errors are recorded without returning provider text", r.json);
  ok(calls.length === 1 && calls[0].model === "cloudflare/auto", "Auto Router failures do not fall back to another model", calls.map((c) => c.model));

  const failed = checks.filter((c) => !c.condition);
  for (const c of failed) console.log("FAIL " + c.name + (c.actual !== undefined ? " :: " + JSON.stringify(c.actual).slice(0, 500) : ""));
  console.log((checks.length - failed.length) + " passed, " + failed.length + " failed");
  process.exitCode = failed.length ? 1 : 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
