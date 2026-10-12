// PROBE-CADENCE-COST-1 (qnfo-ai-calibration 1.4.0) offline suite: the full model sweep runs on one 30-minute tick in N,
// manual runs and a cadence of 1 always sweep fully, and the lean ticks re-probe exactly the models that are not ok. No network.
// Run: node qnfo-ai-calibration/probe-cadence.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const grab = (name) => {
  const i = src.indexOf("function " + name + "(");
  const j = src.indexOf("__name(" + name + ",", i);
  return src.slice(i, j);
};
const mod = new Function(
  "var CAL_TICK_MS = 18e5;\n" + grab("fullSweepDue") + "\n" + grab("leanSweepModels") + "\nreturn { fullSweepDue, leanSweepModels };"
)();
const T = 1791800000000 - (1791800000000 % 18e5); // a tick boundary
const tickOf = (ms) => Math.round(ms / 18e5);

// cadence
ok(mod.fullSweepDue(T, "4", "manual") === true, "a manual run is always a full sweep");
ok(mod.fullSweepDue(T, "1", "cron") === true && mod.fullSweepDue(T + 18e5, "1", "cron") === true, "cadence 1 restores a full sweep on every tick");
ok(mod.fullSweepDue(T, "junk", "cron") === true, "an unreadable cadence falls back to the full sweep");
let full = 0;
for (let k = 0; k < 48; k++) if (mod.fullSweepDue(T + k * 18e5 + 4000, "4", "cron")) full++;
ok(full === 12, "cadence 4 gives 12 full sweeps in 48 ticks (one a 2 h), even when the cron fires seconds late", full);
const due = [0, 1, 2, 3].map((k) => mod.fullSweepDue(T + k * 18e5 - 3000, "4", "cron"));
ok(due.filter(Boolean).length === 1, "a cron firing early still lands on its own tick", due);
ok(mod.fullSweepDue(T, "4", "cron") === (tickOf(T) % 4 === 0), "the full tick is the tick index modulo the cadence");

// lean ticks
const models = ["a", "b", "c", "d"];
const rows = [
  { model_id: "a", status: "ok", consecutive_failures: 0 },
  { model_id: "b", status: "degraded", consecutive_failures: 1 },
  { model_id: "c", status: "ok", consecutive_failures: 2 },
];
ok(JSON.stringify(mod.leanSweepModels(models, rows)) === JSON.stringify(["b", "c", "d"]), "a lean tick re-probes degraded, failing and never-probed models only", mod.leanSweepModels(models, rows));
ok(mod.leanSweepModels(models, models.map((m) => ({ model_id: m, status: "ok", consecutive_failures: 0 }))).length === 0, "an all-healthy roster spends no model call on a lean tick");

// wiring
ok(/var sweepEvery = await cfgGet\(env, "model_sweep_every_ticks"/.test(src), "the cadence is read from ai_calibration_config (revert without a deploy)");
ok(/if \(fullSweep\) \{\s*await runPool\(visionModels/.test(src), "vision, tools, stream and routing probes run on the full tick only");
ok(/fullSweep = true;/.test(src), "an unreadable ai_model_health falls back to the full sweep");
const v = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
ok(versionAtLeast(v, "1.4.0"), "VERSION is at least 1.4.0", v);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
