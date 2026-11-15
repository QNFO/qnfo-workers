// KPI-COLO-CACHE-1: a cold isolate reads the colo copy before recomputing; a stale or missing copy recomputes and writes one.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const pick = (re) => { const m = src.match(re); assert.ok(m, "found " + re); return m[0]; };
const consts = pick(/var KPI_TTL_MS = [^;]+;/) + "\n" + pick(/var KPI_COLO_TTL_MS = [^;]+;/) + "\n" + pick(/var KPI_COLO_KEY = [^;]+;/);
const fn = pick(/async function kpiData\(env, nowMs\) \{[\s\S]*?\n\}\n/);

function makeCtx() {
  const store = new Map();
  const ctx = {
    computes: 0, Response, Number, String, JSON,
    caches: { default: {
      match: async (k) => { const e = store.get(k); return e ? new Response(e.body, { headers: e.headers }) : undefined; },
      put: async (k, r) => { store.set(k, { body: await r.text(), headers: Object.fromEntries(r.headers) }); }
    } },
    store
  };
  vm.createContext(ctx);
  vm.runInContext(consts + "\nvar kpiCache = null;\nasync function kpiCompute(env, now) { computes++; return { ok: true, as_of: now }; }\n" + fn
    + "\nthis.K = { kpiData, reset: function() { kpiCache = null; } };", ctx);
  return ctx;
}

const T0 = Date.parse("2026-11-15T09:00:00Z");
const c = makeCtx();
let v = await c.K.kpiData({}, T0);
assert.equal(c.computes, 1, "first read computes");
assert.equal(c.store.size, 1, "and writes the colo copy");

c.K.reset(); // a new isolate in the same colo
v = await c.K.kpiData({}, T0 + 120e3);
assert.equal(c.computes, 1, "a cold isolate inside the colo TTL reads the colo copy, no recompute");
assert.equal(v.as_of, T0, "the copy keeps its own as_of");

c.K.reset();
v = await c.K.kpiData({}, T0 + 300e3 + 1);
assert.equal(c.computes, 2, "past the colo TTL it recomputes");
assert.equal(v.as_of, T0 + 300e3 + 1);

c.K.reset();
await c.K.kpiData({}, T0 - 1);
assert.equal(c.computes, 3, "an instant before the copy was made does not read it");

const broken = makeCtx();
broken.caches.default.match = async () => { throw new Error("cache down"); };
broken.caches.default.put = async () => { throw new Error("cache down"); };
v = await broken.K.kpiData({}, T0);
assert.equal(v.ok, true, "a failing colo cache never fails the page");
console.log("ok kpi-colo-cache");
