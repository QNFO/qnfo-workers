// OBSERVABILITY-DRIFT-WATCH-1 (0.21.0, agent_issues 2394): the pure functions of the observability drift watch.
// Slices the BEGIN/END block out of worker.js so the suite runs without Workers bindings.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- OBSERVABILITY-DRIFT-WATCH-1:BEGIN", END = "// ---- OBSERVABILITY-DRIFT-WATCH-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
assert.ok(a > 0 && b > a, "block markers present");
let block = src.slice(a, b);
// Drop the two functions that need the network or D1; keep the pure ones.
block = block.slice(0, block.indexOf("async function obsDeclared("));
const mod = new Function("__name", block + "\nreturn { OBS_KEYS, OBS_DEFAULT, obsValue, obsParseToml, obsDesired, obsDiff };")(function () {});
const { obsParseToml, obsDesired, obsDiff, OBS_DEFAULT } = mod;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("FAIL", msg); } }

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 21), "VERSION is at least 0.21");

// 1. The qnfo-ai shape: top-level rate 1, logs rate 1, traces rate 0.1.
const tomlAi = [
  'name = "qnfo-ai"', 'compatibility_date = "2026-10-10"', "",
  "[observability]", "enabled = true", "head_sampling_rate = 1", "",
  "# traces need their own block", "[observability.logs]", "enabled = true", "head_sampling_rate = 1", "",
  "[observability.traces]", "enabled = true", "head_sampling_rate = 0.1", "", "[[services]]", 'binding = "X"', 'service = "y"'
].join("\n");
const dAi = obsParseToml(tomlAi);
ok(dAi && dAi.enabled === true && dAi.head_sampling_rate === 1, "parse: top-level keys");
ok(dAi && dAi.logs && dAi.logs.enabled === true && dAi.logs.head_sampling_rate === 1, "parse: logs block");
ok(dAi && dAi.traces && dAi.traces.enabled === true && dAi.traces.head_sampling_rate === 0.1, "parse: traces block");
ok(dAi && !("services" in dAi) && !dAi.binding, "parse: a later unrelated table ends the block");

// 2. Inline table form and comments.
const tomlInline = ["[observability]", "enabled = true # on", 'logs = { enabled = true, head_sampling_rate = 0.5 }', "[triggers]", 'crons = ["*/5 * * * *"]'].join("\n");
const dIn = obsParseToml(tomlInline);
ok(dIn && dIn.logs && dIn.logs.enabled === true && dIn.logs.head_sampling_rate === 0.5, "parse: inline table logs");

// 3. No block -> null; a value out of range is dropped.
ok(obsParseToml('name = "x"\ncompatibility_date = "2026-10-10"\n') === null, "parse: no block -> null");
const dBad = obsParseToml("[observability]\nenabled = true\nhead_sampling_rate = 7\n");
ok(dBad && dBad.enabled === true && dBad.head_sampling_rate === void 0, "parse: rate above 1 dropped");

// 4. Desired = declared over live; live-only keys (destinations, persist) survive.
const live = { enabled: true, head_sampling_rate: 1, redact_query_string: false, logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true, destinations: ["cloudflare"] }, traces: { enabled: true, head_sampling_rate: 1, persist: true, destinations: ["cloudflare"] }, issues: { enabled: true } };
const want = obsDesired(live, dAi);
ok(want.traces.head_sampling_rate === 0.1 && want.traces.persist === true && want.traces.destinations[0] === "cloudflare", "desired: declared rate over live, live keys kept");
ok(want.logs.invocation_logs === true && want.issues && want.issues.enabled === true, "desired: logs and issues carried from live");
ok(obsDesired(live, null) === null && obsDesired(live, {}) === null, "desired: nothing declared -> null");

// 5. Diff: the drifted key only, nothing when equal, arrays by content, numbers within tolerance.
const diff = obsDiff(live, want);
ok(diff.length === 1 && diff[0] === "traces.head_sampling_rate: 1 -> 0.1", "diff: names the drifted key: " + JSON.stringify(diff));
ok(obsDiff(want, want).length === 0, "diff: equal -> empty");
const liveOff = { enabled: true, logs: { enabled: true }, traces: { enabled: false } };
const d2 = obsDiff(liveOff, obsDesired(liveOff, dAi));
ok(d2.indexOf("traces.enabled: false -> true") >= 0 && d2.indexOf("traces.head_sampling_rate: null -> 0.1") >= 0, "diff: enabled flip and missing rate: " + JSON.stringify(d2));
ok(obsDiff({ logs: { destinations: ["cloudflare"] } }, { logs: { destinations: ["cloudflare"] } }).length === 0, "diff: arrays by content");
ok(obsDiff({ head_sampling_rate: 0.1 + 1e-12 }, { head_sampling_rate: 0.1 }).length === 0, "diff: numeric tolerance");

// 6. A worker with no declaration gets the fleet default shape (everything on at rate 1).
ok(OBS_DEFAULT.enabled === true && OBS_DEFAULT.traces.head_sampling_rate === 1 && OBS_DEFAULT.issues.enabled === true, "default shape");

// 7. The loop holds declared workers to the diff and undeclared ones to the old rule.
const loop = src.slice(src.indexOf("async function reassertObservability("));
ok(loop.indexOf("var decl = await obsDeclared(env, name);") > 0 && loop.indexOf("var diff = desired ? obsDiff(o, desired) : [];") > 0, "reassert: reads the declaration and diffs");
ok(loop.indexOf("desired = JSON.parse(JSON.stringify(OBS_DEFAULT));") > 0, "reassert: undeclared workers keep the default");
ok(loop.indexOf("await obsWriteMetric(env, unrepaired, drift, checked);") > 0, "reassert: writes the metric each run");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
