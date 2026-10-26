// IDEAS-HUB-SLOW-RSS-1 offline suite (idea-hub 1.14.5, agent_issues 1000460).
// /rss.xml and /api/sessions built 500 threads and 500 archive sessions with one gate query per thread on every read (3 to 5 s, one read in four timed out for the
// remediation consumer's 20 s budget). They now go through ideasCached (IDEAS-SWR-1): the first read builds and stores, the next reads answer from the stored copy with no D1
// read, a copy older than FEED_FRESH_MS is rebuilt in the background, and the cache key carries the clamped limit so two limits never share a copy.
// Run: node idea-hub/feed-swr.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
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
const get = async (path) => { const r = await w.fetch(new Request("https://ideas.qnfo.org" + path), env, ctx); return { r, t: await r.text() }; };

// cold: one build, one stored copy
let a = await get("/rss.xml");
ok(a.r.status === 200 && reads > 0 && store.size === 1 && /^<\?xml/.test(a.t) && /<rss version="2.0">/.test(a.t), "rss cold: built once and stored", { reads, size: store.size });
ok(/rss\+xml/.test(a.r.headers.get("Content-Type")), "rss keeps its content type");
// warm: no D1 read, short visitor cache, no internal stamps
reads = 0; a = await get("/rss.xml");
ok(reads === 0 && waits.length === 0 && /<rss version="2.0">/.test(a.t), "rss warm: served from the stored copy, no D1 read");
ok(/max-age=120$/.test(a.r.headers.get("Cache-Control")) && !a.r.headers.get("X-Ideas-Built") && !a.r.headers.get("X-Ideas-Version"), "rss visitors get max-age=120 and no build stamp", a.r.headers.get("Cache-Control"));
ok(/rss\+xml/.test(a.r.headers.get("Content-Type")) && a.r.headers.get("Access-Control-Allow-Origin") !== null || a.r.headers.get("Access-Control-Allow-Headers") !== null, "rss warm keeps its content type and CORS headers");
// stale after FEED_FRESH_MS (2 minutes): answered from the copy, one background rebuild
const rssKey = [...store.keys()].find((k) => k.includes("/rss.xml"));
store.get(rssKey).h.set("X-Ideas-Built", String(Date.now() - 3 * 60 * 1000));
reads = 0; waits.length = 0; a = await get("/rss.xml");
ok(a.r.status === 200 && waits.length === 1 && /rss version="2.0"/.test(a.t), "rss older than 2 minutes: answered from the copy, one background rebuild queued");
await Promise.all(waits);
ok(reads > 0 && Date.now() - Number(store.get(rssKey).h.get("X-Ideas-Built")) < 5000, "the rebuild refreshed the stored copy");
// a copy younger than 5 minutes (the home page keeps its 15) is not rebuilt
store.get(rssKey).h.set("X-Ideas-Built", String(Date.now() - 1 * 60 * 1000));
waits.length = 0; reads = 0; await get("/rss.xml");
ok(waits.length === 0 && reads === 0, "rss younger than 2 minutes: no rebuild");

// sessions: its own copy per clamped limit
reads = 0; waits.length = 0;
let s1 = await get("/api/sessions");
ok(s1.r.status === 200 && JSON.parse(s1.t).limit === 50 && reads > 0, "sessions cold: built (default limit 50)");
reads = 0; s1 = await get("/api/sessions");
ok(reads === 0 && JSON.parse(s1.t).limit === 50 && /max-age=120$/.test(s1.r.headers.get("Cache-Control")), "sessions warm: from the copy, max-age=120");
reads = 0; let s2 = await get("/api/sessions?limit=5");
ok(reads > 0 && JSON.parse(s2.t).limit === 5, "a different limit is its own copy, not the limit 50 body", JSON.parse(s2.t).limit);
reads = 0; s2 = await get("/api/sessions?limit=5");
ok(reads === 0 && JSON.parse(s2.t).limit === 5, "limit 5 warm");
const before = store.size;
await get("/api/sessions?limit=9999"); await get("/api/sessions?limit=100"); await get("/api/sessions?limit=zzz"); await get("/api/sessions?limit=zzz2");
ok(store.size - before === 2, "limits beyond the clamp share one key and junk limits share another (cache cardinality is bounded)", store.size - before);
const f1 = await get("/api/feed?limit=7");
ok(f1.r.status === 200 && JSON.parse(f1.t).limit === 7 && [...store.keys()].some((k) => k.includes("/api/feed")), "/api/feed has its own key apart from /api/sessions");

// version skew still rebuilds (HUB-CACHE-VERSION-2 applies to the new routes too)
const e = store.get(rssKey); e.h.set("X-Ideas-Version", "0.0.1"); e.h.set("X-Ideas-Built", String(Date.now()));
reads = 0; a = await get("/rss.xml");
ok(a.r.status === 200 && reads > 0, "a copy built by another version is rebuilt");

// source shape: routes use the helper, the home page keeps the old key and its 4 hour max-age
const src = readFileSync(join(here, "worker.js"), "utf8");
ok(/if\(u\.pathname==='\/rss\.xml'\)return ideasCached\(req,ctx,function\(\)\{return rss\(env\)\}/.test(src), "the rss route goes through ideasCached");
ok(/return ideasCached\(req,ctx,function\(\)\{return ideasHome\(env\)\}\)/.test(src) && !/ideasHome\(env\)\},\{/.test(src), "the home page call is unchanged (same key, 14400)");
ok(src.includes('"?__swr=1" + (o.variant || "")'), "the variant is appended after ?__swr=1 so existing keys are unchanged");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 1 || (Number(vm[1]) === 1 && (Number(vm[2]) > 14 || (Number(vm[2]) === 14 && Number(vm[3]) >= 5)))), "VERSION is at least 1.14.5 (a later bump keeps this suite green)");
ok(readFileSync(join(here, "deployed-current.worker.js"), "utf8") === src, "the mirror is byte-identical");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
