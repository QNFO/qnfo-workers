// IDEAS reach + SWR offline suite (idea-hub 1.5.4; #1919 share image, #1920 flagship link, ~12 s uncached build).
// Run: node idea-hub/reach-swr.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
let reads = 0;
const stmt = { bind() { return stmt; }, async all() { reads++; return { results: [] }; }, async first() { reads++; return null; }, async run() { return {}; } };
const env = { QNFO_AUDIT: { prepare: () => stmt } };
const store = new Map();
globalThis.caches = { default: { async match(r) { const e = store.get(r.url); return e ? new Response(e.b, { headers: e.h }) : undefined; }, async put(r, res) { store.set(r.url, { b: await res.text(), h: new Headers(res.headers) }); } } };
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const waits = [], ctx = { waitUntil(p) { waits.push(p); } };
const get = async () => { const r = await w.fetch(new Request("https://ideas.qnfo.org/"), env, ctx); return { r, t: await r.text() }; };
let a = await get();
ok(a.r.status === 200 && reads > 0 && store.size === 1, "cold: built once and stored", { reads, size: store.size });
ok(/property="og:image" content="https:\/\/qnfo\.org\/og\.jpg"/.test(a.t) && /twitter:card" content="summary_large_image"/.test(a.t), "share card on the QNFO page (#1919)");
ok(/ipatent\.qnfo\.org\/\?utm_source=ideas\.qnfo\.org/.test(a.t), "iPatent link in the footer (#1920)");
reads = 0; a = await get();
ok(reads === 0 && waits.length === 0 && /og:image/.test(a.t), "warm: served from cache, no D1 read");
ok(!a.r.headers.get("X-Ideas-Built") && /max-age=14400/.test(a.r.headers.get("Cache-Control")), "visitors get max-age=14400 and no build stamp");
const e = [...store.values()][0]; e.h.set("X-Ideas-Built", String(Date.now() - 20 * 60 * 1000));
reads = 0; a = await get();
ok(a.r.status === 200 && waits.length === 1, "stale: answered from cache, one background rebuild");
await Promise.all(waits);
ok(reads > 0 && Date.now() - Number([...store.values()][0].h.get("X-Ideas-Built")) < 5000, "rebuild refreshed the stored copy");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
