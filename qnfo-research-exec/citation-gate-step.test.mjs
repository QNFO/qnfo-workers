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
assert.equal(r.proceed, false, "an unconfirmed citation does not publish (CITATION-UNVERIFIED-HOLD-1)");
assert.equal(r.retry, true); assert.equal(r.unverified, true);
r = await citationGateStep(mk("measure"), row, dead);
assert.equal(r.proceed, true, "measure mode never blocks");
// The arXiv API refusing while DataCite knows the id: the citation is confirmed by the second lookup.
globalThis.fetch = async (url) => String(url).startsWith("https://api.datacite.org/dois/")
  ? res(200, JSON.stringify({ data: { attributes: { titles: [{ title: "Generalised Probabilistic Theories" }] } } }))
  : res(429, "Rate exceeded.");
r = await citationGateStep(mk(null), row, dead);
assert.equal(r.proceed, true, "DataCite confirms the id when the arXiv API refuses");
// DataCite answering with a different title for a labelled reference: a mismatch holds.
r = await citationGateStep(mk(null), row, "- [Recursive distinctioning and the crossing law](https://arxiv.org/abs/2606.31097)");
assert.equal(r.proceed, false); assert.equal(!!r.retry, false); assert.match(r.note, /title-mismatch/);
// Both lookups failing: unconfirmed, retry.
globalThis.fetch = async (url) => String(url).startsWith("https://api.datacite.org/") ? res(404, "{}") : res(503, "down");
r = await citationGateStep(mk(null), row, dead);
assert.equal(r.proceed, false); assert.equal(r.retry, true); assert.match(r.note, /unverified: 2606\.31097/);
globalThis.fetch = async () => res(200, "<feed></feed>");
r = await citationGateStep(mk(null), row, "No references here.");
assert.equal(r.proceed, true);
globalThis.fetch = realFetch;
console.log("citation-gate-step tests passed");
