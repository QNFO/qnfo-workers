// FLEET-CAP-STEER-1 offline suite (qnfo-ai 5.36.0, AI-SPEND-1, agent_issues 1780, 2462, 2446, 2011; pillar cost).
// The FLEET-CAP-STEER block of worker.js runs in a vm with a fake D1 and a fake Workers AI runner. Proves: while the fleet
// cap ai_spend:workers-ai is breached a router-served glm-5.3 / deepseek-v4-pro call is answered by the cheaper model of its
// own lineage; under the cap, for streams, for qnfo-ai-calibration, with pin_model or with ops_config ai_fleet_cap_steer = off
// the requested model is served; a twin error or empty reply is answered by the requested model in the same request; a twin
// that failed 20% of at least 10 steered calls today is not steered again (automatic revert); a D1 failure steers nothing;
// the paid upstreams (direct DeepSeek key, gateway compat) are skipped at the fleet cap of their provider; and the router
// wires all of it in (runWorkersAI, spendGuardPaid, _router.fleet_cap_steer).
// Run: node qnfo-ai/fleet-cap-steer.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// ---- FLEET-CAP-STEER-BEGIN"), b = src.indexOf("// ---- FLEET-CAP-STEER-END ----");
if (a < 0 || b < a) throw new Error("FLEET-CAP-STEER block not found");
const logs = [];
const sb = { console: { warn: (s) => logs.push(["warn", s]), error: (s) => logs.push(["error", s]), log() {} }, Math, Number, String, Object, JSON, Array, Date, Promise, isFinite, VERSION: "test" };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n;__x = { fleetSteerDecide, fleetPaidCapHit, fleetSteerAnswered, fleetSteerLoad, fleetSteerRun, FLEET_STEER_TWINS, FLEET_STEER_PURPOSE, FLEET_STEER_SWITCH };", sb);
const X = sb.__x;
const reset = () => vm.runInContext("__fleetSteer = { at: 0, st: null };", sb);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const GLM = "@cf/zai-org/glm-5.3", FLASH = "@cf/zai-org/glm-5.3-flash";
const PRO = "@cf/deepseek-ai/deepseek-v4-pro-0813", DSF = "@cf/deepseek-ai/deepseek-v4-flash-0731";
const over = { caps: { "workers-ai": { cap: 95, current: 113.07 } }, fails: {}, off: false };
const under = { caps: { "workers-ai": { cap: 95, current: 80 } }, fails: {}, off: false };

// 1. The decision.
let d = X.fleetSteerDecide(over, GLM, "qnfo-research-exec", false, false);
ok(d && d.from === GLM && d.to === FLASH && /113\.07 > cap 95/.test(d.reason), "over the fleet cap glm-5.3 is served by glm-5.3-flash", d);
d = X.fleetSteerDecide(over, PRO, "public", false, false);
ok(d && d.to === DSF, "over the fleet cap deepseek-v4-pro is served by deepseek-v4-flash", d);
ok(X.fleetSteerDecide(under, GLM, "public", false, false) === null, "under the fleet cap the requested model is served");
ok(X.fleetSteerDecide({ caps: {}, fails: {} }, GLM, "public", false, false) === null, "no fleet_budget row steers nothing");
ok(X.fleetSteerDecide({ caps: { "workers-ai": { cap: 0, current: 50 } }, fails: {} }, GLM, "public", false, false) === null, "a zero cap is not a breach");
for (const m of [FLASH, DSF, "@cf/moonshotai/kimi-k2.6", "@cf/moonshotai/kimi-k2.7-code", "@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"]) {
  ok(X.fleetSteerDecide(over, m, "public", false, false) === null, "a model without a cheaper same-lineage twin is served as asked: " + m);
}
ok(X.fleetSteerDecide(over, GLM, "public", true, false) === null, "a stream is never steered");
ok(X.fleetSteerDecide(over, GLM, "public", false, true) === null, "pin_model is never steered");
ok(X.fleetSteerDecide(Object.assign({}, over, { off: true }), GLM, "public", false, false) === null, "ops_config ai_fleet_cap_steer = off steers nothing");
ok(X.fleetSteerDecide(over, GLM, "qnfo-ai-calibration", false, false) === null, "calibration probes measure the named model, never a twin");
ok(X.fleetSteerDecide(Object.assign({}, over, { fails: { [FLASH]: { calls: 10, errors: 2 } } }), GLM, "public", false, false) === null, "2 failures in 10 steered calls reverts the switch for today");
ok(X.fleetSteerDecide(Object.assign({}, over, { fails: { [FLASH]: { calls: 10, errors: 1 } } }), GLM, "public", false, false) !== null, "1 failure in 10 keeps the switch");
ok(X.fleetSteerDecide(Object.assign({}, over, { fails: { [FLASH]: { calls: 9, errors: 5 } } }), GLM, "public", false, false) !== null, "fewer than 10 steered calls never revert");
ok(X.fleetSteerDecide(Object.assign({}, over, { fails: { [FLASH]: { calls: 40, errors: 20 } } }), PRO, "public", false, false) !== null, "a revert is per twin: the deepseek pair still steers");

// 2. The twins are cheaper per token and keep the lineage (ENSEMBLE-POLICY rule 7, channel diversity unchanged).
const rates = JSON.parse("{" + /var __AI_ATTR_RATES = \{([^\n]*)\};/.exec(src)[1] + "}");
for (const [from, to] of Object.entries(X.FLEET_STEER_TWINS)) {
  ok(rates[from] && rates[to] && rates[to][0] < rates[from][0] && rates[to][1] < rates[from][1], "the twin is cheaper on input and output: " + from + " -> " + to, [rates[from], rates[to]]);
  ok(from.split("/").slice(0, 2).join("/") === to.split("/").slice(0, 2).join("/"), "the twin is the same lineage: " + from + " -> " + to);
}

// 3. The paid upstreams at the fleet caps.
const paid = { caps: { deepseek: { cap: 50, current: 60 }, openai: { cap: 60, current: 0 }, total: { cap: 150, current: 10 }, "workers-ai": { cap: 95, current: 113 } } };
ok(/ai_spend:deepseek/.test(X.fleetPaidCapHit(paid, "deepseek", "deepseek-chat")), "the direct DeepSeek key is skipped over ai_spend:deepseek");
ok(X.fleetPaidCapHit(paid, "gateway", "openai/gpt-5.5") === "", "a gateway provider under its cap and the unified total passes");
ok(/ai_spend:openai/.test(X.fleetPaidCapHit({ caps: { openai: { cap: 60, current: 61 } } }, "gateway", "openai/gpt-5.5")), "a gateway provider over its fleet cap is skipped");
ok(/ai_spend:total/.test(X.fleetPaidCapHit({ caps: { total: { cap: 150, current: 151 } } }, "gateway", "anthropic/x")), "a gateway call over the unified total is skipped");
ok(X.fleetPaidCapHit({ caps: { total: { cap: 150, current: 151 } } }, "deepseek", "deepseek-chat") === "", "the unified total does not meter the direct BYOK key");
ok(X.fleetPaidCapHit(Object.assign({ off: true }, paid), "deepseek", "deepseek-chat") === "", "the switch off leaves the paid upstreams to the router caps");

// 4. What counts as an answer.
ok(X.fleetSteerAnswered({ choices: [{ message: { content: "Yes." } }] }), "chat content is an answer");
ok(!X.fleetSteerAnswered({ choices: [{ message: { content: "", reasoning_content: "thinking..." } }] }), "reasoning only is not an answer");
ok(!X.fleetSteerAnswered({ choices: [{ message: { content: "<think>a</think>  " } }] }), "a think block alone is not an answer");
ok(X.fleetSteerAnswered({ choices: [{ message: { content: null, tool_calls: [{ id: "x" }] } }] }), "tool calls are an answer");
ok(X.fleetSteerAnswered({ response: "ok" }) && X.fleetSteerAnswered({ response: { a: 1 } }), "binding text and JSON mode are answers");
ok(X.fleetSteerAnswered({ result: { response: "ok" } }), "a wrapped result is read");
ok(!X.fleetSteerAnswered(null) && !X.fleetSteerAnswered({}) && !X.fleetSteerAnswered({ response: "  " }), "nothing is not an answer");

// 5. The run, end to end, against a fake D1.
function fakeDb(o) {
  o = o || {};
  const writes = [];
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind: (...xs) => { args = xs; return s; },
      first: async () => { if (o.throws) throw new Error("D1 down"); if (/FROM ops_config/.test(sql)) return o.switch == null ? null : { value: o.switch }; return null; },
      all: async () => {
        if (o.throws) throw new Error("D1 down");
        if (/FROM fleet_budget/.test(sql)) return { results: o.budget || [] };
        if (/FROM ai_call_counters/.test(sql)) return { results: o.fails || [] };
        return { results: [] };
      },
      run: async () => { writes.push({ sql, args }); return { success: true }; },
    };
    return s;
  };
  return { prepare: stmt, writes };
}
const breached = [{ node_class: "ai_spend:workers-ai", cap: 95, current: 113.07 }, { node_class: "ai_spend:deepseek", cap: 50, current: 0 }];
const mkEnv = (db, caller, extra) => Object.assign({ QNFO_AUDIT: db, __spendCaller: caller || "qnfo-research-exec", __fleetSteers: [], __spendCtx: { waitUntil() {} } }, extra || {});
const runner = (plan) => { const calls = []; return { calls, run: async (m) => { calls.push(m); const p = plan[m]; if (p instanceof Error) throw p; return p; } }; };
const ANS = (t) => ({ choices: [{ message: { content: t } }] });

reset();
let db = fakeDb({ budget: breached });
let env = mkEnv(db);
let r = runner({ [FLASH]: ANS("flash answer"), [GLM]: ANS("glm answer") });
let out = await X.fleetSteerRun(env, GLM, false, r.run);
ok(out.choices[0].message.content === "flash answer" && r.calls.join() === FLASH, "over the cap the twin answers and the requested model is not called", r.calls);
const w = db.writes.find((x) => /INSERT INTO ai_call_counters/.test(x.sql));
ok(w && w.args[1] === X.FLEET_STEER_PURPOSE && w.args[2] === FLASH && w.args[3] === 0, "a steered success is counted with no error", w && w.args);
ok(env.__fleetSteers.length === 1 && env.__fleetSteers[0].to === FLASH, "the switch is reported for _router.fleet_cap_steer", env.__fleetSteers);

reset();
db = fakeDb({ budget: breached });
env = mkEnv(db);
r = runner({ [FLASH]: new Error("3046 timeout"), [GLM]: ANS("glm answer") });
out = await X.fleetSteerRun(env, GLM, false, r.run);
ok(out.choices[0].message.content === "glm answer" && r.calls.join() === FLASH + "," + GLM, "a twin error is answered by the requested model in the same request", r.calls);
ok(db.writes.some((x) => /INSERT INTO ai_call_counters/.test(x.sql) && x.args[3] === 1), "the twin failure is counted as an error");
ok(logs.some((l) => l[0] === "warn" && /fleet-cap-steer-fallback/.test(l[1])), "the fallback is logged");

reset();
db = fakeDb({ budget: breached });
env = mkEnv(db);
r = runner({ [FLASH]: { choices: [{ message: { content: "", reasoning_content: "long thought" } }] }, [GLM]: ANS("glm answer") });
out = await X.fleetSteerRun(env, GLM, false, r.run);
ok(out.choices[0].message.content === "glm answer" && r.calls.length === 2, "an empty twin reply is answered by the requested model", r.calls);

reset();
db = fakeDb({ budget: [{ node_class: "ai_spend:workers-ai", cap: 95, current: 80 }] });
r = runner({ [GLM]: ANS("glm answer") });
out = await X.fleetSteerRun(mkEnv(db), GLM, false, r.run);
ok(r.calls.join() === GLM && !db.writes.length, "under the cap only the requested model runs and nothing is counted", r.calls);

reset();
db = fakeDb({ budget: breached, switch: "off" });
r = runner({ [GLM]: ANS("glm answer") });
await X.fleetSteerRun(mkEnv(db), GLM, false, r.run);
ok(r.calls.join() === GLM, "ops_config off: the requested model runs", r.calls);

reset();
db = fakeDb({ budget: breached, fails: [{ model: FLASH, calls: 12, errors: 4 }] });
r = runner({ [GLM]: ANS("glm answer") });
await X.fleetSteerRun(mkEnv(db), GLM, false, r.run);
ok(r.calls.join() === GLM, "a twin over the failure share today is reverted automatically", r.calls);

reset();
db = fakeDb({ throws: true });
r = runner({ [GLM]: ANS("glm answer") });
out = await X.fleetSteerRun(mkEnv(db), GLM, false, r.run);
ok(r.calls.join() === GLM && out.choices[0].message.content === "glm answer", "a D1 failure steers nothing", r.calls);
ok(logs.some((l) => l[0] === "error" && /fleet-cap-steer-load-failed/.test(l[1])), "the D1 failure is logged");

reset();
db = fakeDb({ budget: breached });
r = runner({ [GLM]: ANS("glm answer") });
await X.fleetSteerRun(mkEnv(db, "qnfo-ai-calibration"), GLM, false, r.run);
ok(r.calls.join() === GLM, "calibration: the requested model runs", r.calls);
reset();
r = runner({ [GLM]: ANS("glm answer") });
await X.fleetSteerRun(mkEnv(fakeDb({ budget: breached }), "public", { __pinModel: true }), GLM, false, r.run);
ok(r.calls.join() === GLM, "pin_model: the requested model runs", r.calls);
reset();
r = runner({ [GLM]: "stream-response" });
await X.fleetSteerRun(mkEnv(fakeDb({ budget: breached })), GLM, true, r.run);
ok(r.calls.join() === GLM, "a stream: the requested model runs", r.calls);

// The in-isolate count reaches the revert rule before the next D1 read.
reset();
db = fakeDb({ budget: breached });
env = mkEnv(db);
for (let i = 0; i < 10; i++) await X.fleetSteerRun(env, GLM, false, runner({ [FLASH]: new Error("boom"), [GLM]: ANS("g") }).run);
r = runner({ [GLM]: ANS("g") });
await X.fleetSteerRun(env, GLM, false, r.run);
ok(r.calls.join() === GLM, "ten failed twins in this isolate revert the switch at once", r.calls);

// 6. The router is wired to the block.
ok(/async function runWorkersAI\(env, modelId, messages, maxTokens, stream, opts = \{\}\) \{\s*\/\/[^\n]*\n\s*return fleetSteerRun\(env, modelId, !!stream, \(m\) => runWorkersAICore\(/.test(src), "runWorkersAI routes every Workers AI call through fleetSteerRun");
ok(/async function runWorkersAICore\(env, modelId/.test(src), "the original runner is runWorkersAICore");
const guard = src.slice(src.indexOf("async function spendGuardPaid"), src.indexOf("function spendMeterStream"));
ok(/fleetPaidCapHit\(await fleetSteerLoad\(env\), provider, model\)/.test(guard) && /throw new Error\("spend-governor: fleet "/.test(guard), "spendGuardPaid skips a paid upstream at its fleet cap with a spend-governor error (the Workers AI twin answers)");
ok(/\^spend-governor/.test(src), "runModelTurn still serves a spend-governor DeepSeek skip by its Workers AI twin");
ok(/fleet_cap_steer: env\.__fleetSteers\.slice\(0, 8\)/.test(src), "_router names each switch");
ok(/__fleetSteers: \[\]/.test(src) && /__pinModel: true/.test(src), "the request env carries the switch list and pin_model");
ok(/fleet_cap_steer: \{ twins: FLEET_STEER_TWINS, switch_key: FLEET_STEER_SWITCH, state: __fleetSteer\.st \?/.test(src), "/health shows the cached fleet-cap state without a D1 read");
ok(!/insufficient_quota|"spend_cap"/.test(src), "still no HTTP 429 spend refusal anywhere");
const ver = /var VERSION = "([^"]+)"/.exec(src);
ok(ver && versionAtLeast(ver[1], "5.36.0"), "VERSION is at least 5.36.0", ver && ver[1]);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
