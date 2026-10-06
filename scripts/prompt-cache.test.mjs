// PROMPT-CACHE-1 offline suite: the Workers AI attribution wrapper (__aiAttrEnv) in every worker that carries it adds a stable
// x-session-affinity key derived from model + the first 4 KB of the prompt (so Workers AI prefix caching bills repeated
// context at the cached-input rate), never overrides a caller's own key, never mutates the caller's options, leaves short
// prompts alone, and records cached tokens in ai_cache_counters (text models only).
// Run: node scripts/prompt-cache.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const WORKERS = ["errata-hub", "personal-api", "q08-signal-engine", "qnfo-ai-search", "qnfo-ai", "qnfo-ops", "qnfo-research-exec"];
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
function extract(src) {
  const i = src.indexOf("function __aiAttrEnv(");
  if (i < 0) return null;
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } }
  return null;
}
for (const w of WORKERS) {
  const src = readFileSync(new URL("../" + w + "/worker.js", import.meta.url), "utf8");
  const fn = extract(src);
  ok(!!fn && /PROMPT-CACHE-1/.test(fn), w + ": wrapper carries PROMPT-CACHE-1");
  if (!fn) continue;
  const rates = (src.match(/var __AI_ATTR_RATES = \{[^\n]*\};/) || ["var __AI_ATTR_RATES = {};"])[0];
  const ctx = vm.createContext({ Proxy, Reflect, Object, JSON, Number, String, Math, Date, __AI_ATTR_STAGE: "", console });
  vm.runInContext(rates + "\n" + fn + "\nthis.__aiAttrEnv = __aiAttrEnv;", ctx);
  const seen = [], rows = [];
  const AI = { async run(model, input, opts) { seen.push(opts); return { response: "ok", usage: { prompt_tokens: 5000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 4000 } } }; } };
  const db = { prepare(sql) { return { bind(...a) { return { async run() { rows.push({ sql, a }); return {}; } }; } }; } };
  const env = ctx.__aiAttrEnv({ AI, AUDIT: db, DB: db, QNFO_AUDIT: db, AUDIT_DB: db }, w, "AI", Object.keys({ AUDIT: 1 })[0]);
  const long = "SYSTEM: you are a careful research assistant. ".repeat(100);
  const callerOpts = { gateway: { id: "default" } };
  await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: long + " paper A" }] }, callerOpts);
  await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: long + " paper B" }] });
  await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: "x".repeat(5000) }] });
  await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: "short" }] }, { max: 1 });
  await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: long }] }, { extraHeaders: { "x-session-affinity": "mine" } });
  await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [long] });
  const k = (o) => o && o.extraHeaders && o.extraHeaders["x-session-affinity"];
  ok(/^pc-[0-9a-z]+$/.test(k(seen[0]) || "") && k(seen[0]) === k(seen[1]), w + ": same model + same 4 KB prefix -> same affinity key", [k(seen[0]), k(seen[1])]);
  ok(k(seen[2]) && k(seen[2]) !== k(seen[0]), w + ": a different prefix gets a different key");
  ok(seen[0].gateway && seen[0].gateway.id === "default" && !callerOpts.extraHeaders, w + ": caller options kept and not mutated");
  ok(!k(seen[3]) && seen[3].max === 1, w + ": short prompt left alone");
  ok(k(seen[4]) === "mine", w + ": a caller's own affinity key is never replaced");
  const cc = rows.filter((r) => /ai_cache_counters/.test(r.sql));
  ok(cc.length === 5 && cc.every((r) => r.a[5] === 4000 && r.a[3] === 1), w + ": cached tokens recorded for the 5 text calls, not the embedding", cc.length);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
