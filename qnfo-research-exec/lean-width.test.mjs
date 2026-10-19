// LEAN-WIDTH-1 (qnfo-research-exec 0.20.0, pillar cost). While an ai_spend cap in fleet_budget is breached, the stage width is
// capped at ops_config research_parallel_lean (default 24) instead of RESEARCH_PARALLEL_MAX (48); with no breach the old width
// holds. Runs leanEnsemble, researchLeanWidth and researchParallel from the source against a scripted QNFO_AUDIT.
// Run: node qnfo-research-exec/lean-width.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x) : "")); } };
const grab = (name) => { const i = src.indexOf("async function " + name + "("); const j = src.indexOf("\n}\n", i); return src.slice(i, j + 2); };
const consts = ["RESEARCH_PARALLEL_DEFAULT", "RESEARCH_PARALLEL_MAX", "RESEARCH_PARALLEL_LEAN", "WIDTH_FLOOR", "WIDTH_STEP_UP", "WIDTH_RL_SHARE", "WIDTH_RL_MIN", "WIDTH_LOOKBACK_MIN", "WIDTH_PREV_MAX_MIN", "WORKER"].map((c) => { const m = new RegExp("\nvar " + c + " = ([^;\\n]+);").exec(src); return m ? "var " + c + " = " + m[1] + ";" : ""; }).join("\n");
ok(/var RESEARCH_PARALLEL_LEAN = 24;/.test(src), "lean width default is 24");
const make = new Function(consts + "\nasync function logEvent() {}\n" + grab("floorFlag") + "\n" + grab("widthGovern") + "\n" + grab("leanEnsemble") + "\n" + grab("researchLeanWidth") + "\n" + grab("researchParallel") + "\nreturn researchParallel;");
const researchParallel = make();
const envWith = (cfg0, breached) => { const cfg = Object.assign({ research_governor: "off" }, cfg0); return { QNFO_AUDIT: { prepare: (sql) => { let args = []; const q = { bind: (...a) => { args = a; return q; }, first: async () => {
  if (/fleet_budget/.test(sql)) return { n: breached ? 1 : 0 };
  const k = /key = '([a-z_]+)'/.exec(sql) || (/key = \?1/.test(sql) ? [0, args[0]] : null); return k && cfg[k[1]] != null ? { value: String(cfg[k[1]]) } : null;
} }; return q; } } }; };
console.error = () => {};
ok(await researchParallel(envWith({ research_parallel: 96 }, false)) === 48, "no breach: 96 is clamped to the 48 ceiling as before");
ok(await researchParallel(envWith({ research_parallel: 96 }, true)) === 24, "breach: the width falls to the lean default 24");
ok(await researchParallel(envWith({ research_parallel: 8 }, true)) === 8, "breach: a width under the lean cap is kept");
ok(await researchParallel(envWith({ research_parallel: 96, research_parallel_lean: 48 }, true)) === 48, "research_parallel_lean 48 restores the full width without a deploy");
ok(await researchParallel(envWith({ research_parallel: 96, research_parallel_lean: 500 }, true)) === 48, "research_parallel_lean never lifts the ceiling");
ok(await researchParallel(envWith({ research_parallel: 96, research_lean_ensemble: "off" }, true)) === 48, "research_lean_ensemble off turns the lean mode off for the width too");
ok(await researchParallel(envWith({}, true)) === 2, "unset research_parallel keeps the default 2");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
