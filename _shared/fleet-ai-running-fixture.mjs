import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Existing model/SQL suites isolate their original behavior from the new prerequisite.
// Emergency-control suites must use the real gate, not this explicitly running fixture.
export const RUNNING_AI_FIXTURE = `
var fleetAiAssert = async function () {};
var fleetAiStopped = function (error) { return !!error && (error.code === "ai_paused" || error.code === "ai_control_unavailable"); };
var fleetAiRun = async function (env, binding, ...args) { return binding.run(...args); };
var fleetAiFetch = async function (env, fetcher, ...args) { return fetch(...args); };
var fleetAiServiceFetch = async function (env, binding, ...args) { return binding.fetch(...args); };
var fleetAiBackground = async function () { return true; };
var __aigBaseFetch = (...args) => fetch(...args);
var fleetAiWorkflowWait = async function () {};
var FLEET_AI_AUDIT_BINDING = "QNFO_AUDIT";
`;

export function runningAiSource(source) {
  const binding = /var FLEET_AI_AUDIT_BINDING = "[A-Z0-9_]+";/.exec(source)?.[0] || "";
  return RUNNING_AI_FIXTURE + binding + "\n" +
    source.replace(/\/\/ BEGIN FLEET-AI-CONTROL-1[\s\S]*?\/\/ END FLEET-AI-CONTROL-1/g, "");
}
// Fold tests compare historical algorithms separately from the independently tested dispatch gate.
export function dispatchComparisonSource(source) {
  return source.replaceAll("fleetAiRun(env, env.AI, ", "env.AI.run(")
    .replace(/ if \(fleetAiStopped\((\w+)\)\) throw \1;/g, "");
}

export async function importRunningWorker(path, base) {
  const raw = String(path);
  const url = path instanceof URL ? path : /^[A-Z]:[\\/]/i.test(raw) ? pathToFileURL(path) : new URL(path, base);
  const source = url.protocol === "data:"
    ? Buffer.from(url.href.slice(url.href.indexOf(",") + 1), url.href.includes(";base64,") ? "base64" : "utf8").toString("utf8")
    : readFileSync(url, "utf8");
  if (!source.includes("// BEGIN FLEET-AI-CONTROL-1") && !/await fleetAiRun\(/.test(source)) return import(url.href);
  return import("data:text/javascript;base64," + Buffer.from(runningAiSource(source)).toString("base64") +
    (url.protocol === "file:" ? "#" + encodeURIComponent(url.href) : ""));
}

export function runningWorkerHarness(importer, load, ...args) {
  return importer(() => runningAiSource(typeof load === "function" ? load() : load), ...args);
}
