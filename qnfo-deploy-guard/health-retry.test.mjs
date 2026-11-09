// REGISTRY-HEALTH-RETRY-1: readLiveHealthVersion retries one aborted/failed /health read, never retries a worker that answered, and logs once with the worker name.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = source.indexOf("async function readLiveHealthVersion(");
const end = source.indexOf("async function refreshRegistryVersion(", start);
assert.ok(start >= 0 && end > start, "readLiveHealthVersion found");
const helper = source.slice(start, end);
function make(fetch, logs) {
  const ctx = vm.createContext({ fetch, console: { error: (l) => logs.push(JSON.parse(l)) }, setTimeout, clearTimeout, AbortController, String, Promise });
  vm.runInContext(helper + "\nthis.read = readLiveHealthVersion;", ctx);
  return ctx.read;
}
const abortErr = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
{ // first read aborts, second answers: version returned, nothing logged
  const logs = []; let n = 0;
  const read = make(async () => { n++; if (n === 1) throw abortErr(); return { ok: true, json: async () => ({ version: "1.2.3" }) }; }, logs);
  assert.equal(await read("qnfo-x", 1), "1.2.3"); assert.equal(n, 2); assert.equal(logs.length, 0);
}
{ // both reads abort: empty version, one log line carrying the worker and the attempts
  const logs = []; let n = 0;
  const read = make(async () => { n++; throw abortErr(); }, logs);
  assert.equal(await read("qnfo-x", 1), ""); assert.equal(n, 2);
  assert.deepEqual(logs, [{ evt: "deploy-guard:refreshRegistryVersion:caught", worker: "qnfo-x", attempts: 2, error: "The operation was aborted" }]);
}
{ // a worker that answers with an error status is not retried and is not logged
  const logs = []; let n = 0;
  const read = make(async () => { n++; return { ok: false, json: async () => ({}) }; }, logs);
  assert.equal(await read("qnfo-x", 1), ""); assert.equal(n, 1); assert.equal(logs.length, 0);
}
{ // a health body without a version gives an empty version, one read
  const logs = []; let n = 0;
  const read = make(async () => { n++; return { ok: true, json: async () => ({ ok: true }) }; }, logs);
  assert.equal(await read("qnfo-x", 1), ""); assert.equal(n, 1);
}
console.log("health-retry: passed");
