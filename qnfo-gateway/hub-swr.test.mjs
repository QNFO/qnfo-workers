// HUB-SWR-1 offline suite (qnfo-gateway 3.9.4, GATEWAY-COLD-TTFB-1 #1910): the qnfo.org home is served from the edge cache
// and rebuilt in the background once stale; a cold colo builds it once; a failed build never overwrites a good copy;
// without a Cache API (tests, workers.dev) the handler still answers from D1.
// Run: node qnfo-gateway/hub-swr.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
let d1Reads = 0, d1Fail = false;
const stmt = { bind() { return stmt; }, async all() { d1Reads++; if (d1Fail) throw new Error("d1 down"); return { results: [{ slug: "a-paper", title: "A paper", created_at: "2026-10-01" }] }; }, async first() { d1Reads++; if (d1Fail) throw new Error("d1 down"); return { cnt: 451, count: 8349 }; }, async run() { return {}; } };
const env = { LIVING_PAPER: { prepare: () => stmt }, DB: { prepare: () => stmt } };
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (ctx) => { const r = await gw.fetch(new Request("https://qnfo.org/"), env, ctx); return { r, t: await r.text() }; };

// 1. no Cache API: answers from D1
let a = await get({ waitUntil() {} });
ok(a.r.status === 200 && /A paper/.test(a.t) && d1Reads > 0 && !a.r.headers.get("X-Hub-Cache"), "no Cache API: served from D1");

// fake caches.default
const store = new Map();
globalThis.caches = { default: { async match(req) { const e = store.get(req.url); return e ? new Response(e.body, { headers: e.headers }) : undefined; }, async put(req, res) { store.set(req.url, { body: await res.text(), headers: new Headers(res.headers) }); } } };
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };

// 2. cold colo: builds once, stores, answers
d1Reads = 0;
a = await get(ctx);
ok(a.r.status === 200 && /A paper/.test(a.t) && d1Reads === 3 && store.size === 1, "cold: one D1 build, stored", { d1Reads, size: store.size });
ok(!/X-Hub-Built/i.test([...a.r.headers.keys()].join(",")), "the internal build stamp is not sent to visitors");

// 3. warm: no D1 read, fresh
d1Reads = 0;
a = await get(ctx);
ok(a.r.status === 200 && /A paper/.test(a.t) && d1Reads === 0 && a.r.headers.get("X-Hub-Cache") === "fresh" && waits.length === 0, "warm: served from cache, no D1 read", { d1Reads, h: a.r.headers.get("X-Hub-Cache") });
ok(/max-age=300/.test(a.r.headers.get("Cache-Control")), "visitors get max-age=300, not the cache's 86400");
ok(a.r.headers.get("X-Reach-Layer") === "applied" || a.r.headers.get("X-Reach-Layer") === "none", "the reach layer still runs on the cached page");

// 4. stale: answers instantly from cache, rebuilds in the background
const e = store.get("https://qnfo.org/__hub-cache-v1"); e.headers.set("X-Hub-Built", String(Date.now() - 6 * 60 * 1000));
d1Reads = 0;
a = await get(ctx);
ok(a.r.headers.get("X-Hub-Cache") === "stale-revalidating" && /A paper/.test(a.t) && waits.length === 1, "stale: cached answer, one background rebuild scheduled");
await Promise.all(waits); waits.length = 0;
ok(d1Reads === 3 && Date.now() - Number(store.get("https://qnfo.org/__hub-cache-v1").headers.get("X-Hub-Built")) < 5000, "the background rebuild refreshed the stored copy");

// 5. failed rebuild does not overwrite the good copy
store.get("https://qnfo.org/__hub-cache-v1").headers.set("X-Hub-Built", "1");
d1Fail = true;
a = await get(ctx);
await Promise.all(waits); waits.length = 0;
d1Fail = false;
const kept = store.get("https://qnfo.org/__hub-cache-v1");
ok(/A paper/.test(kept.body) && kept.headers.get("X-Hub-Built") === "1", "a failed rebuild (empty hub, max-age=60) is not cached over the good copy");
ok(/A paper/.test(a.t), "the visitor still gets the good copy while D1 is down");

// 6. HUB-CACHE-VERSION-1: a copy built by another gateway version is rebuilt before it is served
const KEY = "https://qnfo.org/__hub-cache-v1";
const fresh = store.get(KEY);
fresh.headers.set("X-Hub-Built", String(Date.now()));
ok(/^\d/.test(fresh.headers.get("X-Hub-Version") || ""), "a stored copy carries the VERSION that built it", fresh.headers.get("X-Hub-Version"));
store.set(KEY, { body: fresh.body.replace("A paper", "An old render"), headers: new Headers(fresh.headers) });
store.get(KEY).headers.set("X-Hub-Version", "3.15.0-old");
d1Reads = 0;
a = await get(ctx);
ok(a.r.headers.get("X-Hub-Cache") === "rebuilt-version" && /A paper/.test(a.t) && !/An old render/.test(a.t) && d1Reads === 3, "an older version's copy is rebuilt while the request waits", { h: a.r.headers.get("X-Hub-Cache"), d1Reads });
ok(store.get(KEY).headers.get("X-Hub-Version") !== "3.15.0-old" && !/An old render/.test(store.get(KEY).body), "the rebuilt copy replaced the old one");
ok(!a.r.headers.get("X-Hub-Version") && !a.r.headers.get("X-Hub-Built"), "no internal stamp reaches the visitor");
ok(/max-age=300/.test(a.r.headers.get("Cache-Control") || ""), "the rebuilt answer keeps max-age=300");
await Promise.all(waits); waits.length = 0;
a = await get(ctx);
ok(a.r.headers.get("X-Hub-Cache") === "fresh", "the next request is served fresh from the rebuilt copy", a.r.headers.get("X-Hub-Cache"));

// 7. an older copy is still served when the rebuild fails, and the rebuild is not cached over it
store.get(KEY).headers.set("X-Hub-Version", "3.15.0-old");
d1Fail = true;
a = await get(ctx);
await Promise.all(waits); waits.length = 0;
d1Fail = false;
ok(a.r.status === 200 && /A paper/.test(a.t) && a.r.headers.get("X-Hub-Cache") === "stale-version", "D1 down: the older copy is served, marked stale-version", a.r.headers.get("X-Hub-Cache"));
ok(store.get(KEY).headers.get("X-Hub-Version") === "3.15.0-old", "a failed rebuild does not overwrite the older good copy");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
