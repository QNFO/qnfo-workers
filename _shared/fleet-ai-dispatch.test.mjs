import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../qnfo-ai/worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const helper = readFileSync(new URL("./fleet-ai-control.js", import.meta.url), "utf8");
const attr = source.slice(source.indexOf("async function aiRunAttr("), source.indexOf("\n// end aiRunAttr"));
const wrap = source.slice(source.indexOf("function __aiAttrEnv("), source.indexOf("\n// AIG-CALLER-METADATA-1"));
const context = vm.createContext({ Request, Response, Headers, URL, console, setTimeout, clearTimeout,
  FLEET_AI_AUDIT_BINDING: "QNFO_AUDIT", FLEET_AI_WORKER: "qnfo-ai",
  AI_ATTR_DB_BINDINGS: [], spendRecord() {}, spendUsageOf() { return { in: 0, out: 0 }; },
  spendOutEstimate() { return 0; }, isDynamicRoute() { return false; }, SPEND_CHEAP_WA: "cheap",
  __AI_ATTR_RATES: {}, d1AttrWriteSkip() { return true; }, d1OverloadTrip() { return false; } });
vm.runInContext(helper + "\n" + attr + "\n" + wrap, context);
let state = { paused: 0, revision: 1 }, dispatches = 0, reads = 0;
const env = { QNFO_AUDIT: { withSession(mode) {
  assert.equal(mode, "first-primary"); reads++;
  return { prepare() { return { async first() { return state; } }; } };
} }, AI: { async run() {
  dispatches++;
  state = { paused: 1, revision: state.revision + 1 };
  throw new Error("gateway failed; owner paused during the in-flight call");
} } };
await assert.rejects(context.aiRunAttr(env, "qnfo-ai", "embed-search", "model", {}), e => e.code === "ai_paused");
assert.equal(dispatches, 1, "embedding plain-binding fallback MUST recheck and must not dispatch");
assert.equal(reads, 2);
state = { paused: 1, revision: 3 };
dispatches = 0;
const wrapped = context.__aiAttrEnv(env, "qnfo-ai", "AI", "QNFO_AUDIT");
await assert.rejects(wrapped.AI.run("dynamic/standard", {}), e => e.code === "ai_paused");
assert.equal(dispatches, 0, "router retry and cheap-model fallback do not run on pause errors");
env.QNFO_AUDIT.withSession = () => { throw new Error("D1 unavailable"); };
await assert.rejects(wrapped.AI.run("model", {}), e => e.code === "ai_control_unavailable");
assert.equal(dispatches, 0, "control errors do not fall back to a billable model");
assert.match(source, /fleetAiFetch\(env, __aigBaseFetch, GW_COMPAT/);
const gatewayTool = source.slice(source.indexOf("async function executeGatewayTool("), source.indexOf('__name(executeGatewayTool,'));
vm.runInContext(gatewayTool, context);
await assert.rejects(context.executeGatewayTool(env, "run_code", { code: "return 1" }), e => e.code === "ai_control_unavailable");

const personal = readFileSync(new URL("../personal-api/worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const alarm = personal.slice(personal.indexOf("  async alarm() {"), personal.indexOf("  async _buildBrief() {"));
vm.runInContext("this.Alarm = class {\n" + alarm + "\n};", context);
const instance = new context.Alarm();
instance.env = env;
let nextAlarm = 0, sqlCalls = 0;
instance.storage = { async setAlarm(time) { nextAlarm = time; } };
instance.sql = { exec() { sqlCalls++; throw new Error("paused alarm must not claim work"); } };
const before = Date.now();
await instance.alarm();
assert.equal(sqlCalls, 0, "paused alarm leaves persisted tasks pending");
assert.ok(nextAlarm >= before + 600000 && nextAlarm <= Date.now() + 600000, "bounded alarm rearm, not immediate retry");

let sleeps = 0, checks = 0;
env.QNFO_AUDIT.withSession = mode => {
  assert.equal(mode, "first-primary"); checks++;
  return { prepare() { return { async first() { return state; } }; } };
};
state = { paused: 1, revision: 4 };
const step = {
  async do(name, options, callback) {
    assert.equal(options.retries.limit, 0);
    return callback();
  },
  async sleep(name, duration) {
    assert.equal(duration, "10 minutes");
    sleeps++;
    state = { paused: 0, revision: 5 };
  }
};
await context.fleetAiWorkflowWait(env, step, "test");
assert.equal(sleeps, 1);
assert.equal(checks, 2, "workflow resumes only after a new primary check, without model retries");
const orchestrator = readFileSync(new URL("../qnfo-code-orchestrator/worker.js", import.meta.url), "utf8");
vm.runInContext(orchestrator.match(/function fleetExecEnv\(env\) \{[^\n]+/)[0], context);
context.FLEET_AI_AUDIT_BINDING = "AUDIT_DB";
await context.fleetAiAssert(context.fleetExecEnv({ AUDIT_DB: env.QNFO_AUDIT, AI: env.AI }));
const companion = readFileSync(new URL("../personal-companion/worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
assert.match(companion, /step\.do\("generate-" \+ attempt, \{ timeout: "300 seconds", retries: \{ limit: 0 \} \}/);
assert.match(companion, /if \(!fleetAiStopped\(error\)\) throw error;\s*return \{ ok: false, deferred: true, error: error\.code \}/);
console.log("real router dispatchers: pause during call blocks fallback; pause/unavailable never retry or downgrade passed");
