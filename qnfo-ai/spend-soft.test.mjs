// BUDGET-SOFT-ROUTE-1 offline suite (qnfo-ai 5.32.0, owner directive 2026-10-06): the spend governor never refuses a
// caller. spendDecide is pure; it is run in a vm over the worker's own source. Proves: at the total cap and at a provider
// cap every caller (critical or not) is downgraded to the cheap Workers AI model, never refused; a caller already on the
// cheap model is allowed; under the caps a premium model is allowed; the route gate has no HTTP 429 spend path.
// Run: node qnfo-ai/spend-soft.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var SPEND_DEFAULT_CAPS"), b = src.indexOf("async function spendEnsure(db)");
if (a < 0 || b < a) throw new Error("spend governor block not found");
const sb = { console, Math, Number, String, Object, JSON, isFinite, __AI_ATTR_RATES: { "@cf/moonshotai/kimi-k2.6": [100000, 400000] } };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n;__x = { spendDecide, SPEND_CHEAP_MODEL, SPEND_CHEAP_WA };", sb);
const { spendDecide, SPEND_CHEAP_MODEL, SPEND_CHEAP_WA } = sb.__x;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const caps = { "workers-ai": 35, deepseek: 15, gateway: 10, total: 60 };
const crit = { "qnfo-ops": true };
const over = { "workers-ai": 50, deepseek: 20, gateway: 12 };
for (const caller of ["idea-hub", "qnfo-ops", "public", "some-new-worker"]) {
  const d = spendDecide(over, caps, "deepseek", "deepseek-chat", caller, crit, 0.8, false);
  ok(d.action === "downgrade" && d.to === SPEND_CHEAP_MODEL, "over the total cap, " + caller + " is downgraded, not refused", d);
  const e = spendDecide(over, caps, "workers-ai", "ensemble", caller, crit, 0.8, true);
  ok(e.action === "downgrade" && e.noEnsemble === true, "over the cap, an ensemble for " + caller + " collapses to one cheap leg", e);
}
ok(spendDecide(over, caps, "workers-ai", SPEND_CHEAP_WA, "idea-hub", crit, 0.8, false).action === "allow", "a caller already on the cheap model is allowed");
const waOver = { "workers-ai": 40, deepseek: 1, gateway: 1 };
const w = spendDecide(waOver, caps, "workers-ai", "@cf/moonshotai/kimi-k2.6", "idea-hub", crit, 0.8, false);
ok(w.action === "downgrade" && w.to === SPEND_CHEAP_MODEL, "workers-ai over its own cap downgrades a non-critical caller", w);
ok(spendDecide({ "workers-ai": 1, deepseek: 1, gateway: 1 }, caps, "deepseek", "deepseek-chat", "idea-hub", crit, 0.8, false).action === "allow", "under every cap the requested model is allowed");
let never = true;
for (const t of [0, 30, 59, 60, 61, 500]) for (const p of ["workers-ai", "deepseek", "gateway"]) for (const c of ["x", "qnfo-ops"]) for (const ens of [false, true]) {
  const by = { "workers-ai": t / 2, deepseek: t / 3, gateway: t / 6 };
  if (spendDecide(by, caps, p, "m", c, crit, 0.8, ens).action === "refuse") never = false;
}
ok(never, "no input combination produces a refusal");
ok(!/insufficient_quota|"spend_cap"/.test(src), "the route gate has no HTTP 429 spend refusal");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
