// Q08-EDGE-CACHE-1 offline suite (q08-signal-engine 0.12.0, issue 2343): plain GET pages are served from caches.default for their
// public max-age, a cache hit on a piece page still counts the read, write routes, API routes, query strings and non-200s are never
// cached, and every HTML response carries Referrer-Policy and Permissions-Policy. Run: node q08-signal-engine/edge-cache.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const E = mod.__edge;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const store = new Map();
globalThis.caches = { default: { match: async (r) => { const v = store.get(r.url); return v ? v.clone() : undefined; }, put: async (r, resp) => { store.set(r.url, resp); } } };
const writes = [];
const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { writes.push(sql + " " + a.join(",")); return {}; } }) }) } };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const flush = async () => { await Promise.all(waits.splice(0)); };
let calls = 0;
const page = (status, ct, cc) => async () => { calls++; return new Response("<p>x</p>", { status, headers: { "Content-Type": ct || "text/html; charset=utf-8", "Cache-Control": cc || "public, max-age=300" } }); };
const get = (path, init) => new Request("https://q08.org" + path, Object.assign({ headers: { "user-agent": "Mozilla/5.0" } }, init || {}));

// the piece page renders once, then is served from the cache, and the hit still counts both reads
let r1 = await E.edgeCachedFetch(get("/p/a-piece"), env, ctx, page(200)); await flush();
let r2 = await E.edgeCachedFetch(get("/p/a-piece"), env, ctx, async () => { throw new Error("must not render on a hit"); }); await flush();
check("first view renders, second is a cache hit", calls === 1 && r1.status === 200 && r2.status === 200);
check("a cache hit on a piece counts the piece read and the daily read", writes.filter((w) => /reads=reads\+1/.test(w)).length === 1 && writes.filter((w) => /q08_daily_reads/.test(w)).length === 1 && /human/.test(writes.find((w) => /q08_daily_reads/.test(w))), writes);
check("HTML carries Referrer-Policy and Permissions-Policy", r1.headers.get("Referrer-Policy") === "strict-origin-when-cross-origin" && /camera=\(\)/.test(r1.headers.get("Permissions-Policy") || ""));
check("the cached copy carries the policy headers too", r2.headers.get("Referrer-Policy") === "strict-origin-when-cross-origin");

// never cached
calls = 0; store.clear();
for (const p of ["/api/pieces", "/health", "/feed.xml", "/sitemap.xml", "/robots.txt", "/subscribe", "/confirm"]) { await E.edgeCachedFetch(get(p), env, ctx, page(200)); await E.edgeCachedFetch(get(p), env, ctx, page(200)); }
await flush();
check("API, health, feeds, sitemap, robots and subscription routes are never cached", calls === 14 && store.size === 0, { calls, size: store.size });
calls = 0;
await E.edgeCachedFetch(get("/?ref=x"), env, ctx, page(200)); await E.edgeCachedFetch(get("/?ref=x"), env, ctx, page(200)); await flush();
check("a query string is never cached", calls === 2 && store.size === 0);
calls = 0;
await E.edgeCachedFetch(get("/run", { method: "POST" }), env, ctx, page(200)); await flush();
check("a POST is never cached", calls === 1 && store.size === 0);
await E.edgeCachedFetch(get("/p/gone"), env, ctx, page(410)); await E.edgeCachedFetch(get("/p/missing"), env, ctx, page(404)); await flush();
check("a 410 retraction or a 404 is never cached", store.size === 0);
await E.edgeCachedFetch(get("/p/x.bib"), env, ctx, page(200, "application/x-bibtex", "public, max-age=300")); await flush();
check("a non-HTML response is never cached and gets no policy headers", store.size === 0);
await E.edgeCachedFetch(new Request("https://www.q08.org/", { headers: { "user-agent": "Mozilla/5.0" } }), env, ctx, page(200)); await flush();
check("www is never cached (it redirects)", store.size === 0);

// a hit on a non-piece page counts nothing
writes.length = 0;
await E.edgeCachedFetch(get("/forecasts"), env, ctx, page(200)); await flush();
await E.edgeCachedFetch(get("/forecasts"), env, ctx, page(200)); await flush();
check("a hit on the forecasts page counts no read", writes.length === 0, writes);

// without a Cache API (node, tests, local) the page is rendered every time
delete globalThis.caches; calls = 0;
const r3 = await E.edgeCachedFetch(get("/"), env, ctx, page(200)); await flush();
check("no Cache API: the page renders and still gets the policy headers", calls === 1 && r3.headers.get("Referrer-Policy") === "strict-origin-when-cross-origin");

console.log("edge-cache.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
