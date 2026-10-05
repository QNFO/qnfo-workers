// personal-api WORKERS-AI-ATTRIBUTION-1 suite (4.7.2, agent_issues #1833, charter pillar: cost).
// personal-api called env.AI.run directly, so its Workers AI spend reached no fleet counter. Proves: the __aiAttrEnv shim
// records one ai_call_counters row per day/model with calls, tokens and neurons (counts only, no text); errors are counted
// and rethrown; the result is returned unchanged; without the AUDIT binding env is returned as is; the fetch and scheduled
// entry points and the Durable Object chat call go through the shim; wrangler.toml declares the AUDIT binding.
// Run: node personal-api/ai-attr.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const patched = src + "\nexport { __aiAttrEnv as __attr };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
const attr = mod.__attr;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER, errors INTEGER, in_chars INTEGER, ms INTEGER, in_tok INTEGER, out_tok INTEGER, neurons REAL, PRIMARY KEY (day, worker, purpose, model))");
const AUDIT = { prepare(sql) { let a = []; const s = { bind(...x) { a = x; return s; }, async run() { db.prepare(sql).run(...a); return { success: true }; } }; return s; } };
const calls = [];
const AI = {
  async run(model, input, opts) { calls.push({ model, opts }); if (model === "boom") throw new Error("upstream"); return { response: "hello", usage: { prompt_tokens: 1000, completion_tokens: 200 } }; },
  gateway(id) { return "gw:" + id; }
};
const env = { AI, AUDIT, PERSONAL: { tag: "personal" } };

{
  const w = attr(env, "personal-api", "AI", "AUDIT");
  ok(w !== env && env.AI === AI && !env.__aiAttr, "env is copied, never mutated");
  ok(w.PERSONAL === env.PERSONAL, "other bindings are carried over");
  const r = await w.AI.run("@cf/deepseek-ai/deepseek-v4-pro-0813", { messages: [{ role: "user", content: "private text" }] }, { gateway: { id: "default" } });
  ok(r && r.response === "hello" && calls[0].opts.gateway.id === "default", "the result and the gateway option pass through unchanged");
  await w.AI.run("@cf/deepseek-ai/deepseek-v4-pro-0813", { messages: [] });
  let threw = false;
  try { await w.AI.run("boom", { messages: [] }); } catch (e) { threw = e.message === "upstream"; }
  ok(threw, "a model error is rethrown");
  ok(w.AI.gateway("default") === "gw:default", "other AI binding methods still work");
  const rows = db.prepare("SELECT * FROM ai_call_counters ORDER BY model").all();
  const ds = rows.find((x) => x.model === "@cf/deepseek-ai/deepseek-v4-pro-0813"), bm = rows.find((x) => x.model === "boom");
  ok(ds && ds.worker === "personal-api" && ds.purpose === "binding" && ds.calls === 2 && ds.in_tok === 2000 && ds.out_tok === 400 && Math.abs(ds.neurons - (2000 * 120000 + 400 * 360000) / 1e6) < 1e-6, "one counter row per day and model with calls, tokens and neurons", ds);
  ok(bm && bm.errors === 1 && bm.calls === 1, "errors are counted", bm);
  ok(!rows.some((x) => Object.values(x).some((v) => String(v).includes("private text"))), "no prompt text is stored");
  ok(attr(w, "personal-api", "AI", "AUDIT") === w, "wrapping twice is a no-op");
}
{
  const bare = { AI, PERSONAL: {} };
  ok(attr(bare, "personal-api", "AI", "AUDIT") === bare, "without AUDIT the env is returned unchanged");
}
{
  ok(/async fetch\(request, env, ctx\) \{\n    env = __aiAttrEnv\(env, "personal-api", "AI", "AUDIT"\);/.test(src), "the fetch handler wraps env");
  ok(/async scheduled\(event, env, ctx\) \{\n    env = __aiAttrEnv\(env, "personal-api", "AI", "AUDIT"\);/.test(src), "the cron handler wraps env");
  ok(!/this\.env\.AI\.run\(/.test(src), "the Durable Object chat call is wrapped too");
  const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  ok(/binding = "AUDIT"\ndatabase_name = "qnfo-audit"/.test(toml), "wrangler.toml declares the AUDIT binding");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
