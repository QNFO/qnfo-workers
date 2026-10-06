// LEGAL-URL-1 + LEGAL-VERSIONS-1 offline suite (qnfo-gateway 3.11.0). No network: fetch and R2 are stubbed.
// Proves: qnfo.org/legal/license (the address the license names for itself) redirects to legal.qnfo.org; a version path
// keeps its version; legal.qnfo.org serves v2.0 exactly as before while v2.1 is not on QNFO/license, and remembers the
// miss for an hour (one GitHub read, not one per request); once QNFO/license carries v2.1 the root serves v2.1, caches
// it in R2, and /v2.0 still serves v2.0; unknown versions are 404.
// Run: node qnfo-gateway/legal-versions.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const V20 = "# QNFO Unified License Agreement (QNFO-ULA) — Version 2.0\n\n" + "Section text v2.0. ".repeat(200);
const V21 = "# QNFO Unified License Agreement (QNFO-ULA) — Version 2.1\n\n## 12. Software Terms\n\n" + "Section text v2.1. ".repeat(200);
const r2 = new Map([["legal/ula-v2.0.md", V20]]);
const env = { QNFO_BUCKET: { get: async (k) => (r2.has(k) ? { text: async () => r2.get(k) } : null), put: async (k, v) => { r2.set(k, v); } }, DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) } };
let ghReads = 0, ghHas21 = false;
globalThis.fetch = async (url) => {
  if (/raw\.githubusercontent\.com\/QNFO\/license\/HEAD\/QNFO-ULA-v2\.1\.md/.test(String(url))) { ghReads++; return ghHas21 ? new Response(V21, { status: 200 }) : new Response("404: Not Found", { status: 404 }); }
  return new Response("", { status: 404 });
};
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const req = async (u) => { const r = await gw.fetch(new Request(u, { redirect: "manual" }), env, { waitUntil() {} }); return { s: r.status, loc: r.headers.get("Location"), t: await r.text() }; };

// LEGAL-URL-1
let r = await req("https://qnfo.org/legal/license");
ok(r.s === 301 && r.loc === "https://legal.qnfo.org/", "qnfo.org/legal/license -> legal.qnfo.org/", r);
ok((await req("https://qnfo.org/legal")).loc === "https://legal.qnfo.org/", "qnfo.org/legal -> legal.qnfo.org/");
ok((await req("https://qnfo.org/license")).loc === "https://legal.qnfo.org/", "qnfo.org/license -> legal.qnfo.org/");
ok((await req("https://qnfo.org/legal/license/v2.0")).loc === "https://legal.qnfo.org/v2.0", "a version path keeps its version");
ok((await req("https://qwav.tech/legal/license/v2.0")).loc === "https://legal.qnfo.org/v2.0", "qwav.tech keeps the version too");
ok((await req("https://qnfo.org/legal/license/v9.9")).loc === "https://legal.qnfo.org/", "an unknown version goes to the current one");
ok((await req("https://qnfo.org/privacy")).s === 200, "qnfo.org/privacy is untouched");

// v2.1 not posted: everything serves v2.0 as before, and the miss is remembered.
r = await req("https://legal.qnfo.org/");
ok(r.s === 200 && /version 2\.0/.test(r.t) && /Section text v2\.0/.test(r.t), "root serves v2.0 while v2.1 is not posted");
ok((await req("https://legal.qnfo.org/plain")).t === V20, "/plain is the v2.0 markdown");
ok((await req("https://legal.qnfo.org/v2.1")).s === 404, "/v2.1 is 404 while not posted");
await req("https://legal.qnfo.org/"); await req("https://legal.qnfo.org/");
ok(ghReads === 1, "one GitHub read for an unposted version within the hour", ghReads);
ok((await req("https://legal.qnfo.org/v3.0")).s === 404, "unknown version 404");
ok((await req("https://legal.qnfo.org/zz-nope")).s === 404, "unknown path 404");

// v2.1 posted on QNFO/license (the hour has passed).
ghHas21 = true;
const RealNow = Date.now; Date.now = () => RealNow() + 2 * 3600 * 1000;
r = await req("https://legal.qnfo.org/");
ok(r.s === 200 && /version 2\.1/.test(r.t) && /Software Terms/.test(r.t), "root serves v2.1 once posted", r.t.slice(0, 200));
ok(r2.get("legal/ula-v2.1.md") === V21, "v2.1 is kept in R2");
ok(/href="\/v2\.0"/.test(r.t), "the v2.1 page links v2.0");
const before = ghReads;
ok((await req("https://legal.qnfo.org/v2.1/plain")).t === V21, "/v2.1/plain is the v2.1 markdown");
ok(ghReads === before, "served from R2, no further GitHub read");
r = await req("https://legal.qnfo.org/v2.0");
ok(r.s === 200 && /version 2\.0/.test(r.t), "/v2.0 still serves v2.0");
Date.now = RealNow;

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
