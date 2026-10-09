// CITATION-EXISTENCE-GATE-1 (issue 2052) wiring suite: citationGateStep in worker.js. Offline: global fetch is stubbed, ops_config is a stub.
// Run: node qnfo-research-exec/citation-gate-step.test.mjs
import assert from "node:assert/strict";
import { citationGateStep } from "./worker.js";

const events = [];
const mk = (mode) => ({ QNFO_AUDIT: { prepare: (sql) => ({
  first: async () => (/ops_config/.test(sql) && mode ? { value: mode } : null),
  bind: (...a) => ({ run: async () => { events.push(a); return {}; } }),
}) } });
const row = { id: "row-12345678" };
const res = (s, b) => ({ ok: s >= 200 && s < 300, status: s, text: async () => b, json: async () => JSON.parse(b) });
const realFetch = globalThis.fetch;
const atomErr = '<feed><entry><id>http://arxiv.org/api/errors#x</id><title>Error</title></entry></feed>';
globalThis.fetch = async () => res(200, atomErr);
const dead = "See [arXiv 2606.31097](https://arxiv.org/abs/2606.31097).";

let r = await citationGateStep(mk(null), row, dead);
assert.equal(r.proceed, false); assert.equal(!!r.retry, false); assert.match(r.note, /2606\.31097 not-found/);
r = await citationGateStep(mk("measure"), row, dead);
assert.equal(r.proceed, true, "measure mode never blocks");
r = await citationGateStep(mk("off"), row, dead);
assert.equal(r.proceed, true, "off skips");
globalThis.fetch = async () => { throw new Error("network down"); };
r = await citationGateStep(mk(null), row, dead);
assert.equal(r.proceed, true); assert.equal(r.unverified, true, "lookup failure fails open and is flagged, never holds");
globalThis.fetch = async () => res(200, "<feed></feed>");
r = await citationGateStep(mk(null), row, "No references here.");
assert.equal(r.proceed, true);
globalThis.fetch = realFetch;
console.log("citation-gate-step tests passed");
