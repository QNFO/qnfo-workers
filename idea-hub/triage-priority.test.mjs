// IDEA-TRIAGE-PRIORITY-1: slow proposal producers must not spend the consumer's cycle budget.
// Run: node idea-hub/triage-priority.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";

const source = stripWorkerDefaultExport(readFileSync(new URL("worker.js", import.meta.url), "utf8"));
const start = Date.parse("2026-10-30T00:00:00Z");
async function cycle({ slow, throws, triageMs = 0 } = {}) {
  let now = start;
  const calls = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const env = {};
  const sb = { console: { log() {}, error() {} }, Date: Clock, URL, Response, Request, Headers, TextEncoder, crypto };
  vm.createContext(sb);
  vm.runInContext(source + "\nthis.cycle = ideationCycle;", sb);
  for (const name of ["runReentry", "recordReentryEvent", "triageProposals", "runConsume", "runAskGap", "runOwnerCorpus", "thinkLoop"]) {
    sb[name] = async (receivedEnv, deadline) => {
      assert.equal(receivedEnv, env);
      calls.push({ name, deadline });
      if (name === slow) now += 230000;
      if (name === "triageProposals") now += triageMs;
      if (name === throws) throw new Error("producer unavailable");
      return name === "triageProposals" ? { triaged: 6 } : { ok: true };
    };
  }
  return { result: await sb.cycle(env), calls };
}

for (const slow of [undefined, "runConsume", "runAskGap", "runOwnerCorpus", "thinkLoop"]) {
  const { result, calls } = await cycle({ slow });
  assert.equal(result.triage.triaged, 6, `${slow || "normal cycle"} must not skip triage`);
  assert.equal(calls.filter((c) => c.name === "triageProposals").length, 1, "one triage batch per cycle");
  const names = calls.map((c) => c.name);
  assert.ok(names.indexOf("recordReentryEvent") < names.indexOf("triageProposals"), "re-entry evidence is retained first");
  assert.ok(names.indexOf("triageProposals") < names.indexOf("runConsume"), "drain existing proposals before filling");
  assert.equal(calls.find((c) => c.name === "triageProposals").deadline, start + 840000, "keep the hard wall deadline");
}

for (const throws of ["runReentry", "runConsume", "runAskGap", "runOwnerCorpus", "thinkLoop"]) {
  const { result } = await cycle({ throws });
  assert.equal(result.triage.triaged, 6, `${throws} failure must not suppress triage`);
}

const { result, calls } = await cycle({ triageMs: 230000 });
assert.equal(result.triage.triaged, 6);
assert.equal(result.consume.skipped, "budget", "slow triage still leaves production subject to its soft budget");
assert.equal(result.askgap.skipped, "budget");
assert.equal(result.corpus.skipped, "budget");
assert.ok(!calls.some((c) => c.name === "thinkLoop"));
console.log("triage priority checks passed");
