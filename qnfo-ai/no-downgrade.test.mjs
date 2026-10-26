// CALIBRATION-NO-DOWNGRADE-1 offline suite (qnfo-ai 5.37.0): the router honours no_downgrade: true for the calibration caller only. Slices the spend governor block and
// spendGovern / spendGovernWA out of worker.js and runs them in a vm. Measured 2026-10-19: ai_spend:workers-ai 410.84 against a 95 cap, so every premium Workers AI call
// was downgraded to glm-5.3-flash, including the liveness probes of qnfo-ai-calibration, which sends no_downgrade: true and had it ignored (kimi-k2.6 45 of 85 probe calls
// downgraded, none on 10-18); six "[ai-cal] model probe failing" issues followed.
// Proves: over the cap a premium call is downgraded and recorded as downgraded (the defect, unchanged for every other caller); with the flag set by the handler the same
// call is allowed, nothing is recorded as downgraded, and the Workers AI chokepoint returns the requested model; the handler sets the flag only for the caller
// qnfo-ai-calibration, only with no_downgrade === true and only for at most 512 output tokens; it sets it before the governor is consulted; nothing else sets it;
// VERSION is at least 5.37.0 and the mirror is identical.
// Run: node qnfo-ai/no-downgrade.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const a = src.indexOf("var SPEND_DEFAULT_CAPS"), b = src.indexOf("async function spendEnsure(db)");
const g1 = src.indexOf("async function spendGovern(env, provider, model, wantEnsemble) {"), g2 = src.indexOf("// Chokepoint for direct-key / gateway calls", g1);
if (a < 0 || b < a || g1 < 0 || g2 < g1) throw new Error("spend blocks not found in worker.js");
const recorded = [];
const sb = {
  console, Math, Number, String, Object, JSON, isFinite,
  __AI_ATTR_RATES: { "@cf/moonshotai/kimi-k2.6": [100000, 400000], "@cf/zai-org/glm-5.3-flash": [13636, 45455] },
  spendLoad: async () => {}, __spendState: {},
  // COST-QUALITY-FLOOR-ENFORCE-1 (5.40.0): the quality floor lives in the FLEET-CAP-STEER block; here output quality holds, so no downgrade is lifted (quality-floor.test.mjs covers the floor itself).
  spendQualityBlock: async () => false, spendQualityLift: () => {}, __qualityFloor: { worse: 0 },
  spendBy: () => ({ "workers-ai": 410.84, deepseek: 0.83, gateway: 0 }),
  spendCaps: () => ({ "workers-ai": 95, deepseek: 50, gateway: 60, total: 150 }),
  spendSoft: () => 0.8, spendCritical: () => ({}),
  spendRecord: (env, provider, model, i, o, f) => recorded.push({ provider, model, f })
};
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n" + src.slice(g1, g2) + "\n;__x = { spendGovern, spendGovernWA, SPEND_CHEAP_WA };", sb);
const { spendGovern, spendGovernWA, SPEND_CHEAP_WA } = sb.__x;
const KIMI = "@cf/moonshotai/kimi-k2.6";

{
  recorded.length = 0;
  const d = await spendGovern({ __spendCaller: "idea-hub" }, "workers-ai", KIMI, false);
  ok(d.action === "downgrade" && d.to === "glm-5.3-flash", "over the cap an ordinary caller's premium call is downgraded", d);
  ok(recorded.length === 1 && recorded[0].f.downgraded === true, "and the downgrade is recorded in the ledger", recorded);
  ok(await spendGovernWA({ __spendCaller: "idea-hub" }, KIMI) === SPEND_CHEAP_WA, "the Workers AI chokepoint returns the cheap model for it");
}
{
  recorded.length = 0;
  const env = { __spendCaller: "qnfo-ai-calibration", __noDowngrade: true, __pinModel: true };
  const d = await spendGovern(env, "workers-ai", KIMI, false);
  ok(d.action === "allow" && /no_downgrade honoured/.test(d.reason) && d.to === undefined && d.noEnsemble === false, "with the flag the same call is allowed and the reason names the original decision", d);
  ok(recorded.length === 0, "nothing is recorded as downgraded or refused", recorded);
  ok(await spendGovernWA(env, KIMI) === KIMI, "the Workers AI chokepoint returns the requested model");
  const e = await spendGovern(env, "workers-ai", "ensemble", true);
  ok(e.action === "allow" && e.noEnsemble === false, "an ensemble decision is allowed too (the flag is for the probe's own request)", e);
}
{
  // the flag alone, without the handler gate, cannot be set from the request: the handler is the only place that sets __noDowngrade
  const sets = [...src.matchAll(/__noDowngrade\s*:/g)].length;
  ok(sets === 1, "exactly one place sets __noDowngrade", sets);
  const line = src.split("\n").find((l) => l.includes("body.no_downgrade === true"));
  ok(!!line, "the handler line exists");
  const gate = new Function("body", "env", line + "\nreturn env;");
  const run = (body, caller) => gate(body, { __spendCaller: caller });
  ok(run({ no_downgrade: true, max_tokens: 16 }, "qnfo-ai-calibration").__noDowngrade === true, "calibration caller, flag, 16 tokens: honoured");
  ok(run({ no_downgrade: true, max_tokens: 512 }, "qnfo-ai-calibration").__noDowngrade === true, "calibration caller, flag, 512 tokens (the edge): honoured");
  ok(run({ no_downgrade: true, max_tokens: 513 }, "qnfo-ai-calibration").__noDowngrade === undefined, "513 tokens: not honoured");
  ok(run({ no_downgrade: true }, "qnfo-ai-calibration").__noDowngrade === undefined, "no max_tokens: not honoured");
  ok(run({ no_downgrade: true, max_tokens: 16 }, "public").__noDowngrade === undefined, "a public caller: not honoured");
  ok(run({ no_downgrade: true, max_tokens: 16 }, "idea-hub").__noDowngrade === undefined && run({ no_downgrade: true, max_tokens: 16 }, "qnfo-ops").__noDowngrade === undefined, "other internal callers: not honoured");
  ok(run({ no_downgrade: "true", max_tokens: 16 }, "qnfo-ai-calibration").__noDowngrade === undefined && run({ max_tokens: 16 }, "qnfo-ai-calibration").__noDowngrade === undefined, "only the boolean true counts");
  ok(run({ no_downgrade: true, max_tokens: 16 }, "qnfo-ai-calibration").__pinModel === true, "it pins the model, so the fleet cap steer skips the probe too");
  ok(run(null, "qnfo-ai-calibration").__noDowngrade === undefined, "a missing body is safe");
}
ok(src.indexOf("body.no_downgrade === true") < src.indexOf("await spendGovern(env, _spendWantEns"), "the flag is set before the governor is consulted");
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(v && (Number(v[1]) > 5 || Number(v[2]) > 37 || (Number(v[2]) === 37 && Number(v[3]) >= 0)), "VERSION is at least 5.37.0", v && v[0]);
ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
