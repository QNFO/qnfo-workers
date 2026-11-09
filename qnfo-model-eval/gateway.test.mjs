// BP26-GW-MODEL-EVAL-1 offline suite: every env.AI.run of qnfo-model-eval carries the gateway option and the call is counted.
// Slices __gwEnv and __aiAttrEnv out of worker.js and runs them against a fake AI binding and a fake audit database.
// Run: node qnfo-model-eval/gateway.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < a) throw new Error("missing " + from); return src.slice(a, b); };
const rates = cut("var __AI_ATTR_RATES = ", "\nfunction __aiAttrEnv");
const attr = cut("function __aiAttrEnv(env, worker, aiKey, dbKey) {", "\n// BP26-GW-MODEL-EVAL-1");
const gw = cut("var __GW_OPTS = ", "\nexport default {");
const { gwEnv, attrEnv } = new Function(rates + "\n" + attr + "\n" + gw + "\nreturn { gwEnv: __gwEnv, attrEnv: __aiAttrEnv };")();

const calls = [], rows = [];
const AI = { async run(model, input, opts) { calls.push({ model, input, opts }); return { response: "ok", usage: { prompt_tokens: 10, completion_tokens: 5 } }; }, other() { return "x"; } };
const AUDIT = { prepare(sql) { const q = { bind(...a) { rows.push({ sql, a }); return q; }, async run() { return { success: true }; } }; return q; } };
const env0 = { AI, AUDIT, KEEP: 1 };
const env = attrEnv(gwEnv(env0), "qnfo-model-eval", "AI", "AUDIT");

await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [] });
ok(calls[0].opts && calls[0].opts.gateway && calls[0].opts.gateway.id === "default" && calls[0].opts.gateway.skipCache === true && calls[0].opts.gateway.metadata.worker === "qnfo-model-eval" && calls[0].opts.gateway.metadata.purpose === "battery", "a run without options gets the gateway option", calls[0]);
await env.AI.run("@cf/baai/bge", { text: "x" }, { extraHeaders: { a: "b" } });
ok(calls[1].opts.extraHeaders.a === "b" && calls[1].opts.gateway.id === "default", "existing options are kept and the gateway is added", calls[1]);
await env.AI.run("m", {}, { gateway: { id: "other" } });
ok(calls[2].opts.gateway.id === "other", "a call that names its own gateway is not overridden");
ok(rows.length === 3 && rows.every((r) => /ai_call_counters/.test(r.sql)) && rows[0].a.includes("qnfo-model-eval"), "each call writes one ai_call_counters row for qnfo-model-eval", rows.length);
ok(env.KEEP === 1 && env.AUDIT === AUDIT && env0.AI === AI && env.AI.other() === "x", "other bindings are untouched and the original env is never mutated");
ok(gwEnv({ AUDIT }) && gwEnv({ AUDIT }).AI === undefined, "an env without an AI binding is returned as is");
ok((src.match(/__aiAttrEnv\(__gwEnv\(env\), "qnfo-model-eval"/g) || []).length === 2, "both handlers (fetch and scheduled) rebind env");
ok(/BP26-GW-MODEL-EVAL-1/.test(src), "the marker BP26-GW-MODEL-EVAL-1 is in the worker");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
