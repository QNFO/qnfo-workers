// RUN-INTERNAL-1 (qnfo-research-exec 0.9.54, #1783): POST /run?sync=1 and POST /run/drain-v2 refuse public hostnames;
// internal callers (service bindings: the request host is the binding name) still reach the handler.
// Run: node qnfo-research-exec/run-internal.test.mjs   -> prints "N passed, 0 failed"
import worker from "./worker.js";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d) : "")); } };
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
// An env whose bindings throw, so a request that gets past the guard is seen as "reached the handler".
const trap = new Proxy({}, { get(_t, k) { if (k === "then") return undefined; return { prepare() { throw new Error("reached-handler"); }, fetch() { throw new Error("reached-handler"); }, get() { throw new Error("reached-handler"); }, put() { throw new Error("reached-handler"); }, run() { throw new Error("reached-handler"); } }; } });
async function hit(url) {
  try { const r = await worker.fetch(new Request(url, { method: "POST" }), trap, ctx); return { status: r.status, body: await r.text() }; }
  catch (e) { return { status: "threw", body: String(e && e.message || e) }; }
}

for (const host of ["https://qnfo-research-exec.q08.workers.dev", "https://research.qnfo.org", "https://qnfo.org"]) {
  const a = await hit(host + "/run/drain-v2");
  ok(a.status === 403 && /RUN-INTERNAL-1/.test(a.body), "P " + host + " /run/drain-v2 is refused", a);
  const b = await hit(host + "/run?sync=1");
  ok(b.status === 403 && /RUN-INTERNAL-1/.test(b.body), "P " + host + " /run?sync=1 is refused", b);
}
for (const host of ["https://RESEARCH_EXEC", "https://qnfo-research-exec.internal"]) {
  const a = await hit(host + "/run/drain-v2");
  ok(a.status !== 403, "I " + host + " /run/drain-v2 (service binding) is not refused", a);
  const b = await hit(host + "/run?sync=1");
  ok(b.status !== 403, "I " + host + " /run?sync=1 (service binding) is not refused", b);
}
const d = await hit("https://qnfo-research-exec.q08.workers.dev/run");
ok(d.status !== 403, "the deferred POST /run kick stays open (it only wakes the cron)", d);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
