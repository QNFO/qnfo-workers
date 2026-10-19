// BUDGET-PROBE-1 (qnfo-ai-calibration 1.6.0, agent_issues 2829 path A) offline suite. No network, no production data.
// Before 1.6.0 both writers of ai_model_health.status = 'ok' (the folded prober's probeOne with max_tokens 1, and the sweep's
// probeCompletion with max_tokens 16 that accepts reasoning_content as an answer) never read the reply a real caller would get,
// so glm-5.3-flash (0.53 error share over 6,000 calls on 2026-10-19) and qwen3.8-27b (0.77) read status ok. Proves: the judge
// (empty content, finish_reason length or a missing DONE marker is a failure); the prober member keeps the cheap ping and adds one
// budget probe per unique text id and none for an embedding model; the sweep adds one budget probe per text model; a failing
// budget probe takes the existing degraded -> failing path (no new status value); ai_calibration_config budget_probe = off
// restores the ping-only behaviour; the migration carries the failure mode, its fm- detector contract and the switch's registry row.
// Lane (review of 65693a88): qnfo-ai forces reasoning_effort low/none on max_tokens <= REASONING_SMALL_MAX for glm-5.3-flash, kimi-k2.6
// and gpt-oss-120b, the lane that exists because those models otherwise spend the allowance reasoning. A budget probe sent through the
// router at max_tokens 256 runs in that lane and passes. The sweep therefore probes every model that has a Workers AI id through
// env.AI.run, the request shape the prober sends, so the two writers of one ai_model_health row run one shape and a pass of one cannot
// mask a failure of the other; only the DeepSeek ids with no Workers AI id (flash, flash-thinking, written by the sweep alone) use the router.
// Run: node qnfo-ai-calibration/budget-probe.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = fs.readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let mig = "";
try { mig = fs.readFileSync(new URL("../migrations/2026-10-19-model-health-budget-probe.sql", import.meta.url), "utf8"); } catch (e) { /* absent on the base commit: the migration checks below fail */ }
const api = new Function(src.replace(/export \{\s*worker_default as default\s*\};?/, "") +
  "\nreturn { worker_default, VERSION, PROBER_VERSION, judge: typeof judgeBudgetReply === 'function' ? judgeBudgetReply : null };")();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra).slice(0, 300) : "")); } };
globalThis.fetch = async () => new Response("{}", { status: 200 });

const good = { choices: [{ message: { content: "42 DONE" }, finish_reason: "stop" }] };
const emptyLength = { choices: [{ message: { content: "", reasoning_content: "Let me think about 17 + 25 ..." }, finish_reason: "length" }] };

// 1. the judge
{
  const j = api.judge;
  ok(typeof j === "function", "judgeBudgetReply exists");
  if (j) {
    ok(j(good).ok === true, "a reply with content and DONE passes", j(good));
    ok(j({ response: "The answer is 42. DONE" }).ok === true, "a Workers AI {response} body with DONE passes");
    ok(j({ choices: [{ message: { content: [{ text: "42 " }, { text: "done" }] }, finish_reason: "stop" }] }).ok === true, "array content parts are joined and DONE is matched without case");
    const e = j(emptyLength);
    ok(e.ok === false && /empty/.test(e.reason) && /length/.test(e.reason), "empty content with finish_reason length fails (reasoning spent the budget)", e);
    ok(j({ choices: [{ message: { content: "", reasoning_content: "x" }, finish_reason: "stop" }] }).ok === false, "reasoning_content alone is not an answer");
    ok(j({ response: "" }).ok === false && j({}).ok === false && j(null).ok === false, "empty, missing and null replies fail");
    const nm = j({ choices: [{ message: { content: "42" }, finish_reason: "stop" }] });
    ok(nm.ok === false && /DONE/.test(nm.reason), "content without the DONE marker fails", nm);
    ok(j({ choices: [{ message: { content: "4" }, finish_reason: "length" }] }).ok === false, "a truncated reply without the marker fails");
  }
}

// 2. stubs
function mkEnv(o) {
  o = o || {};
  const sql = [], ai = [], router = [];
  const cfg = Object.assign({}, o.cfg), prevCf = o.prevCf || {};
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() { sql.push({ q, a }); return { success: true, meta: { changes: 1 } }; },
      async first() {
        sql.push({ q, a });
        if (/FROM ai_calibration_config/.test(q)) return a[0] in cfg ? { value: cfg[a[0]] } : null;
        if (/SELECT consecutive_failures FROM ai_model_health/.test(q)) return a[0] in prevCf ? { consecutive_failures: prevCf[a[0]] } : null;
        return null;
      },
      async all() { sql.push({ q, a }); return { results: [] }; }
    };
    return s;
  };
  const scripted = o.budget || {};
  const env = {
    QNFO_AUDIT: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) },
    AI: {
      async run(model, input) {
        ai.push({ model, input });
        if (input && input.max_tokens === 256) {
          const sc = scripted[model] !== undefined ? scripted[model] : scripted[model.split("/").pop()];
          if (sc === "throw") throw new Error("budget request refused");
          return sc || good;
        }
        return { response: "ok", data: [[0.1, 0.2]] };
      }
    },
    QNFO_AI: {
      async fetch(url, init) {
        const body = init && init.body ? JSON.parse(init.body) : {};
        router.push({ url: String(url), body });
        if (/\/health$/.test(String(url))) return new Response(JSON.stringify({ status: "ok", version: "t" }), { status: 200 });
        if (/\/v1\/models$/.test(String(url))) return new Response(JSON.stringify({ data: [] }), { status: 200 });
        const reply = body.max_tokens === 256 ? (scripted[body.model] || good) : { choices: [{ message: { content: "OK" }, finish_reason: "stop" }] };
        return new Response(JSON.stringify(Object.assign({ model: body.model }, reply)), { status: 200 });
      }
    },
    QNFO_OPS: { async fetch() { return new Response("{}", { status: 200 }); } },
    PT_API: { async fetch() { return new Response("{}", { status: 200 }); } },
    QNFO_ROUTER_KEY: "calib-key"
  };
  return { env, sql, ai, router };
}
const req = (path, method) => new Request("https://qnfo-ai-calibration.q08.workers.dev" + path, { method: method || "GET", headers: { Authorization: "Bearer calib-key" } });
const proberStatus = (t, id) => { const w = t.sql.find((x) => /INSERT INTO ai_model_health/.test(x.q) && !/ctx_override/.test(x.q) && x.a[0] === id); return w ? w.a[4] : null; };
const sweepWrite = (t, id) => t.sql.filter((x) => /INSERT INTO ai_model_health/.test(x.q) && x.a[0] === id && x.a.length === 5 && /ctx_override/.test(x.q)).map((x) => ({ status: x.a[1], failures: x.a[4] }));

// 3. the prober member
{
  const t = mkEnv({ budget: { "@cf/zai-org/glm-5.3-flash": emptyLength, "@cf/qwen/qwen3.8-27b": { choices: [{ message: { content: "42" }, finish_reason: "stop" }] } } });
  const r = await api.worker_default.fetch(req("/prober/run?force=1"), t.env, { waitUntil() {} });
  ok(r.status === 200, "/prober/run answers", r.status);
  const pings = t.ai.filter((c) => c.input && c.input.max_tokens === 1), budgets = t.ai.filter((c) => c.input && c.input.max_tokens === 256);
  ok(pings.length > 0 && pings.some((c) => c.model === "@cf/zai-org/glm-5.3-flash"), "the cheap max_tokens 1 ping stays for reachability", pings.length);
  ok(budgets.length > 0 && budgets.every((c) => !/bge/.test(c.model)), "no budget probe for the embedding model", budgets.map((c) => c.model));
  const ids = budgets.map((c) => c.model);
  ok(new Set(ids).size === ids.length, "one budget probe per unique model id per run (deepseek-v4-pro shares one id)", ids);
  ok(budgets[0] && /DONE/.test(JSON.stringify(budgets[0].input)), "the budget body asks for the DONE marker", budgets[0] && budgets[0].input);
  ok(proberStatus(t, "glm-5.3-flash") === "degraded", "glm-5.3-flash answering empty under the budget is written degraded, not ok", proberStatus(t, "glm-5.3-flash"));
  ok(proberStatus(t, "qwen3.8-27b") === "degraded", "a reply without the DONE marker is degraded", proberStatus(t, "qwen3.8-27b"));
  ok(proberStatus(t, "gpt-oss-120b") === "ok" && proberStatus(t, "kimi-k2.6") === "ok", "a model that answers with the marker stays ok", [proberStatus(t, "gpt-oss-120b"), proberStatus(t, "kimi-k2.6")]);
  ok(proberStatus(t, "bge-base-en-v1.5") === "ok", "the embedding model is judged by the ping alone");
  const stray = t.sql.filter((x) => /INSERT INTO ai_model_health/.test(x.q) && !/ctx_override/.test(x.q)).every((x) => ["ok", "degraded", "failing"].indexOf(x.a[4]) >= 0);
  ok(stray, "no new status value: only ok, degraded and failing are written");
  ok(t.sql.some((x) => /INSERT INTO ai_calibration_results/.test(x.q) && x.a.indexOf("model-budget") >= 0 && x.a.indexOf("glm-5.3-flash") >= 0 && x.a.indexOf("fail") >= 0), "the budget verdict is recorded in ai_calibration_results so a degraded row has a reason");
}
{
  const t = mkEnv({ budget: { "@cf/zai-org/glm-5.3-flash": "throw" } });
  await api.worker_default.fetch(req("/prober/run?force=1"), t.env, { waitUntil() {} });
  ok(proberStatus(t, "glm-5.3-flash") === "degraded", "a budget request that throws on both body shapes is a failed probe");
  const glm = t.ai.filter((c) => c.model === "@cf/zai-org/glm-5.3-flash" && c.input.max_tokens === 256);
  ok(glm.length === 2 && !!glm[0].input.messages && typeof glm[1].input.prompt === "string", "the budget probe tries messages, then prompt", glm.map((c) => Object.keys(c.input)));
}
{
  const t = mkEnv({ cfg: { budget_probe: "off" }, budget: { "@cf/zai-org/glm-5.3-flash": emptyLength } });
  await api.worker_default.fetch(req("/prober/run?force=1"), t.env, { waitUntil() {} });
  ok(t.ai.every((c) => !(c.input && c.input.max_tokens === 256)), "budget_probe = off spends no budget call");
  ok(proberStatus(t, "glm-5.3-flash") === "ok", "budget_probe = off restores the ping-only verdict (the revert path)");
}

// 4. the sweep
const GLM = "@cf/zai-org/glm-5.3-flash";
const sweepBudgetsDirect = (t) => t.ai.filter((c) => c.input && c.input.max_tokens === 256 && c.input.messages);
const routerBudgets = (t) => t.router.filter((c) => c.body && c.body.max_tokens === 256);
{
  const t = mkEnv({ budget: { "glm-5.3-flash": emptyLength } });
  const r = await api.worker_default.fetch(req("/run", "POST"), t.env, { waitUntil() {} });
  const j = await r.json();
  const direct = sweepBudgetsDirect(t).map((c) => c.model);
  const viaRouter = routerBudgets(t).map((c) => c.body.model);
  ok(r.status === 200 && direct.length === 8, "the sweep sends one direct budget probe per sweep model with a Workers AI id (seven TIER0 ids and deepseek-v4-pro)", direct);
  ok(direct.indexOf(GLM) >= 0 && direct.indexOf("@cf/deepseek-ai/deepseek-v4-pro-0813") >= 0, "glm-5.3-flash and deepseek-v4-pro (a row the prober also writes) are probed direct", direct);
  ok(viaRouter.slice().sort().join() === "deepseek-v4-flash,deepseek-v4-flash-thinking" && routerBudgets(t).every((c) => c.body.hedge === false && c.body.stream === false), "only the two DeepSeek ids the prober never writes use the router, unhedged", viaRouter);
  // the lane: qnfo-ai gives a request at or below REASONING_SMALL_MAX the small-answer effort for these models
  const qai = fs.readFileSync(new URL("../qnfo-ai/worker.js", import.meta.url), "utf8");
  const smallMax = Number((qai.match(/var REASONING_SMALL_MAX = (\d+);/) || [])[1]);
  const laneIds = Object.keys(JSON.parse((qai.match(/var WA_SMALL_ANSWER_EFFORT = (\{[^}]*\});/) || [])[1] || "{}"));
  ok(smallMax >= 256 && laneIds.indexOf(GLM) >= 0, "qnfo-ai still has a small-answer lane that covers max_tokens 256 for glm-5.3-flash", { smallMax, laneIds });
  const laneRouted = t.router.filter((c) => c.body && c.body.max_tokens <= smallMax && c.body.messages && /DONE/.test(JSON.stringify(c.body.messages)) && laneIds.some((id) => id.split("/").pop() === c.body.model));
  ok(laneRouted.length === 0, "no budget probe reaches a lane model through the router at max_tokens <= REASONING_SMALL_MAX (that lane hides the failure)", laneRouted.map((c) => c.body.model));
  const w = sweepWrite(t, "glm-5.3-flash");
  ok(w.length === 1 && w[0].status === "degraded" && w[0].failures === 1, "the sweep writes degraded (failures 1) for an empty budget reply", w);
  const g = sweepWrite(t, "gpt-oss-120b");
  ok(g.length === 1 && g[0].status === "ok" && g[0].failures === 0, "the sweep writes ok for a model that answers with the marker", g);
  const rows = (j.digest && j.digest.results || []).filter((x) => x.probe === "model-budget");
  ok(rows.some((x) => x.target === "glm-5.3-flash" && x.status === "fail" && /empty/.test(x.detail) && /direct/.test(x.detail)) && rows.some((x) => x.target === "gpt-oss-120b" && x.status === "pass"), "model-budget result rows carry the verdict, the reason and the lane", rows.slice(0, 3));
  ok((j.digest && j.digest.results || []).some((x) => x.probe === "model" && x.target === "glm-5.3-flash" && x.status === "pass"), "the ping row still passes: reachability is unchanged");
  // one shape for the two writers of a shared row: the sweep's body for an id equals the prober's body for it
  const sweepBody = t.ai.find((c) => c.model === GLM && c.input.max_tokens === 256);
  const tp = mkEnv({});
  await api.worker_default.fetch(req("/prober/run?force=1"), tp.env, { waitUntil() {} });
  const proberBody = tp.ai.find((c) => c.model === GLM && c.input.max_tokens === 256);
  ok(sweepBody && proberBody && JSON.stringify(sweepBody.input) === JSON.stringify(proberBody.input), "the sweep and the prober send the same request to a model whose health row both write", [sweepBody && sweepBody.input, proberBody && proberBody.input]);
}
{
  // a DeepSeek id with no Workers AI id keeps the router path and its verdict
  const t = mkEnv({ budget: { "deepseek-v4-flash": emptyLength } });
  await (await api.worker_default.fetch(req("/run", "POST"), t.env, { waitUntil() {} })).json();
  const w = sweepWrite(t, "deepseek-v4-flash");
  ok(w.length === 1 && w[0].status === "degraded", "an empty router-lane budget reply degrades deepseek-v4-flash", w);
}
{
  const t = mkEnv({ prevCf: { "glm-5.3-flash": 1 }, budget: { "glm-5.3-flash": emptyLength } });
  const r = await api.worker_default.fetch(req("/run", "POST"), t.env, { waitUntil() {} });
  await r.json();
  const w = sweepWrite(t, "glm-5.3-flash");
  ok(w.length === 1 && w[0].status === "failing" && w[0].failures === 2, "a second consecutive budget failure reaches failing at the existing fail_threshold", w);
  ok(t.sql.some((x) => /issue_ledger/.test(x.q) && x.a.some((v) => typeof v === "string" && /model probe failing: glm-5.3-flash/.test(v) || /budget/.test(String(v)))), "failing files the existing [ai-cal] model probe failing issue with the budget reason");
}
{
  const t = mkEnv({ prevCf: { "glm-5.3-flash": 1 }, budget: { "glm-5.3-flash": good } });
  await (await api.worker_default.fetch(req("/run", "POST"), t.env, { waitUntil() {} })).json();
  const w = sweepWrite(t, "glm-5.3-flash");
  ok(w.length === 1 && w[0].status === "ok" && w[0].failures === 0, "a model that now answers within the budget recovers to ok", w);
}
{
  const t = mkEnv({ cfg: { budget_probe: "off" }, budget: { "glm-5.3-flash": emptyLength } });
  await (await api.worker_default.fetch(req("/run", "POST"), t.env, { waitUntil() {} })).json();
  ok(routerBudgets(t).length === 0 && sweepBudgetsDirect(t).length === 0, "budget_probe = off: the sweep sends no budget probe");
  const w = sweepWrite(t, "glm-5.3-flash");
  ok(w.length === 1 && w[0].status === "ok", "budget_probe = off: the sweep writes the ping-only verdict", w);
}

// 5. versions and mirror
ok(versionAtLeast(api.VERSION, "1.6.0"), "qnfo-ai-calibration is at least 1.6.0 (new capability: what ok means)", api.VERSION);
ok(versionAtLeast(api.PROBER_VERSION, "2.3.16"), "the member PROBER_VERSION is at least 2.3.16", api.PROBER_VERSION);
ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
ok(!/\*\//.test(src.split("\n")[5].replace(/\/\*[\s\S]*?\*\//g, "")), "the VERSION note closes every block comment it opens");

// 6. the migration
ok(/^-- APPLY-BY: ci$/m.test(mig) && /^-- DB: qnfo-audit$/m.test(mig) && /^-- Rollback: .+/m.test(mig), "migration carries APPLY-BY, DB and Rollback headers");
ok(!/\b(DELETE|DROP)\b/i.test(mig.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "migration deletes and drops nothing (no BACKUP line needed)");
ok(/INTO failure_modes[\s\S]*health-ok-but-empty/.test(mig), "a failure_modes row health-ok-but-empty");
ok(/INTO remediation_contracts[\s\S]*fm-health-ok-but-empty[\s\S]*ai_model_health[\s\S]*ai_call_counters/.test(mig) && /c\.model LIKE ''%\/'' \|\| h\.model_id/.test(mig), "its fm- detector contract joins ai_model_health to ai_call_counters");
ok(/INTO control_registry[\s\S]*kill-switch[\s\S]*budget_probe/.test(mig) && /INTO ai_calibration_config[\s\S]*budget_probe/.test(mig), "the budget_probe switch has its ai_calibration_config row and its control_registry row");
ok(/neurons/i.test(mig) && /per day/i.test(mig), "the migration states the probe's cost per day");
ok(/rate.limit/i.test(mig) && /not (a )?measured|cannot (see|tell)|not recorded/i.test(mig), "the migration separates rate-limit errors from empty replies and says the counters do not record the class");
const dl = (mig.match(/INTO decision_log[\s\S]*$/) || [""])[0];
ok(/qwen3\.8-27b/.test(dl) && /nemotron-3-120b-a12b/.test(dl) && !/glm-5\.3-flash and qwen3\.8-27b read degraded/.test(dl), "decision_log predicts only what the probe can flip (qwen3.8-27b, nemotron), not glm-5.3-flash");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
