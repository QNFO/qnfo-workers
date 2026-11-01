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
function fnText(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } }
  return null;
}
// AI-STAGE-ATTRIBUTION-2 (qnfo-research-exec 0.16.0): the wrapper may delegate the Proxy to __aiAttrBinding(ai, db, worker, attrCtx)
// so the stage travels in a per-env context instead of a module global; the slice then carries both functions.
// SLICE-CLOSURE-1 (2026-11-01): the wrapper is cut out of the worker as text and run in a VM, so whatever it calls at module level has to be cut out with
// it. CF-OBS-ISSUE-1 (#5422) gave qnfo-ai the helper d1AttrWriteSkip and the var __d1OverloadedUntil; the slice lacked them, the wrapper's own try/catch
// swallowed the ReferenceError and the suite failed as "cached tokens recorded: 0" with nothing naming the cause (full set red on main from 2026-10-31).
// The slice now follows calls to top-level functions and reads of single-line top-level vars to a fixed point, and every run asserts the wrapper logged
// no ReferenceError, so the next helper that is missed fails by name.
function extract(src) {
  const env = fnText(src, "__aiAttrEnv");
  if (!env) return null;
  const topFns = new Set([...src.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)].map((m) => m[1]));
  // only literal initialisers are lifted (a flag, a counter, a time): anything computed is not guessed at, and fails by name in the run below
  const topVars = new Map([...src.matchAll(/^var ([A-Za-z_$][\w$]*) = (?:-?\d[\d_.]*|"[^"\n]*"|'[^'\n]*'|true|false|null|\{\}|\[\]);(?:[ \t]*\/\/[^\n]*)?[ \t]*$/gm)].map((m) => [m[1], m[0]]));
  const KEYWORDS = new Set("async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield get set from as null true false undefined".split(" "));
  const parts = [env], vars = [], seen = new Set(["__aiAttrEnv", "__AI_ATTR_RATES"]);
  const binding = fnText(src, "__aiAttrBinding");
  if (binding) { parts.push(binding); seen.add("__aiAttrBinding"); }
  for (let i = 0; i < parts.length; i++) {
    for (const m of parts[i].matchAll(/[A-Za-z_$][\w$]*/g)) {
      const id = m[0];
      if (seen.has(id) || KEYWORDS.has(id) || parts[i][m.index - 1] === ".") continue; // a property (.id) is not a variable
      seen.add(id);
      if (topFns.has(id) && parts.length < 24) {
        const t = fnText(src, id);
        if (!t) continue;
        const at = src.indexOf("function " + id + "(");
        const text = src.slice(Math.max(0, at - 6), at) === "async " ? "async " + t : t; // fnText starts at the keyword, so an async helper loses its prefix
        try { new vm.Script(text); parts.push(text); } catch (e) { /* a mention of the name, not a call to this helper: it cannot be what the wrapper needs */ }
      }
      else if (topVars.has(id)) vars.push(topVars.get(id));
    }
  }
  return vars.concat(parts).join("\n");
}
for (const w of WORKERS) {
  const src = readFileSync(new URL("../" + w + "/worker.js", import.meta.url), "utf8");
  const fn = extract(src);
  ok(!!fn && /PROMPT-CACHE-1/.test(fn), w + ": wrapper carries PROMPT-CACHE-1");
  if (!fn) continue;
  const rates = (src.match(/var __AI_ATTR_RATES = \{[^\n]*\};/) || ["var __AI_ATTR_RATES = {};"])[0];
  const logged = [];
  const cap = { log() {}, info() {}, warn() {}, error(...a) { logged.push(a.map(String).join(" ")); } };
  const ctx = vm.createContext({ Proxy, Reflect, Object, JSON, Number, String, Math, Date, __AI_ATTR_STAGE: "", console: cap });
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
  ok(!logged.some((l) => /is not defined/.test(l)), w + ": the wrapper runs with everything it calls at module level (no ReferenceError swallowed by its try/catch)", logged[0]);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
