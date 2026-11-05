// PAPER-EDGE-CACHE-1 (RM-EDGE-CACHE-PAPERS-1): a paper page is served from the colo's edge cache, refreshed in the background once stale,
// and kept as the answer when the rebuild fails. A fake Cache API (caches.default) and a counting fake database stand in for Cloudflare.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

// A Map-backed Cache API: put stores a clone, match returns a clone, keyed by URL.
const store = new Map();
globalThis.caches = {
  default: {
    async match(req) { const hit = store.get(typeof req === "string" ? req : req.url); return hit ? hit.clone() : undefined; },
    async put(req, res) { store.set(typeof req === "string" ? req : req.url, res.clone()); }
  }
};
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

const row = { slug: "edge-paper", title: "Edge paper", body_md: "# Edge paper\n\n## Abstract\n\nText about coordination.", abstract: "Text about coordination.", authors: '["R"]', keywords: "[]", doi: null, status: "published", version: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01" };
let reads = 0, failing = false;
const st = (all) => ({ bind() { return st(all); }, async all() { return { results: all }; }, async first() { return all[0] || null; }, async run() { return {}; } });
const env = {
  LIVING_PAPER: { prepare(sql) { if (/FROM papers WHERE slug/i.test(sql)) { reads++; if (failing) throw new Error("D1 DB is overloaded"); } return st(/FROM papers/i.test(sql) ? [row] : []); } },
  QNFO_BUCKET: { async get() { return null; } }, RELEASES: { async head() { return null; } },
  AI: { async run() { return { response: "" }; } }
};
let pending = [];
const ctx = { waitUntil(p) { pending.push(p); } };
const settle = async () => { const p = pending; pending = []; await Promise.allSettled(p); };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + String(d).slice(0, 200))); } };
const get = (path, headers = { Accept: "text/html" }, method = "GET") => worker.fetch(new Request("https://papers.qnfo.org" + path, { method, headers }), env, ctx);
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

// 1. first view: a miss, rendered from the database, then stored after the response
let r = await get("/papers/edge-paper");
const firstBody = await r.text();
ok(r.status === 200 && r.headers.get("X-Edge-Cache") === "miss", "first view is a miss", r.headers.get("X-Edge-Cache"));
ok(/Edge paper/.test(firstBody), "the page renders the paper");
ok(r.headers.get("Cache-Control") === "public, max-age=3600", "the visitor still gets the handler's Cache-Control", r.headers.get("Cache-Control"));
await settle();
ok(store.has("https://papers.qnfo.org/__pec/v1/edge-paper"), "the page is stored under host and slug");
const readsAfterMiss = reads;
ok(readsAfterMiss >= 1, "the miss read the database", reads);

// 2. second view: a hit, no database read, same body
r = await get("/papers/edge-paper");
const hitBody = await r.text();
ok(r.status === 200 && r.headers.get("X-Edge-Cache") === "hit", "second view is a hit", r.headers.get("X-Edge-Cache"));
ok(reads === readsAfterMiss, "a hit reads no database", reads - readsAfterMiss);
ok(hitBody === firstBody, "the hit serves the stored body byte for byte");
ok(r.headers.get("Cache-Control") === "public, max-age=3600" && !r.headers.has("X-Pec-Built") && !r.headers.has("X-Pec-Version") && !r.headers.has("X-Pec-Cc"), "the internal headers never reach the visitor");

// 3. stale (older than 5 minutes): served at once, rebuilt once in the background, and a second stale view does not start a second rebuild
clock += 6 * 60 * 1000;
const readsBeforeStale = reads;
r = await get("/papers/edge-paper");
await r.text();
ok(r.headers.get("X-Edge-Cache") === "stale-revalidating", "a six-minute-old copy is served as stale-revalidating", r.headers.get("X-Edge-Cache"));
r = await get("/papers/edge-paper");
await r.text();
await settle();
ok(reads - readsBeforeStale === 1, "two stale views start exactly one background rebuild", reads - readsBeforeStale);
r = await get("/papers/edge-paper");
ok(r.headers.get("X-Edge-Cache") === "hit", "after the rebuild the copy is fresh again", r.headers.get("X-Edge-Cache"));
await r.text();

// 4. stale-if-error: the rebuild fails, the stored copy is the answer
clock += 30 * 60 * 1000;
failing = true;
r = await get("/papers/edge-paper");
ok(r.status === 200 && r.headers.get("X-Edge-Cache") === "stale-revalidating", "a thirty-minute-old copy is still served while the database fails", r.headers.get("X-Edge-Cache"));
await r.text();
await settle();
clock += 25 * 3600 * 1000;
r = await get("/papers/edge-paper");
ok(r.status === 200 && r.headers.get("X-Edge-Cache") === "stale-if-error", "a day-old copy is the answer when the rebuild answers 5xx", r.status + " " + r.headers.get("X-Edge-Cache"));
ok(/Edge paper/.test(await r.text()), "the stale-if-error body is the stored page");
failing = false;

// 5. no copy and a failing database: the failure is passed through, not hidden
store.clear();
failing = true;
r = await get("/papers/edge-paper");
ok(r.status >= 500, "no copy and a failing database answers 5xx", r.status);
await settle();
ok(!store.has("https://papers.qnfo.org/__pec/v1/edge-paper"), "a 5xx is never stored");
failing = false;

// 6. a copy built by another VERSION is not served as fresh
await get("/papers/edge-paper").then((x) => x.text());
await settle();
const key = "https://papers.qnfo.org/__pec/v1/edge-paper";
const old = store.get(key);
const oh = new Headers(old.headers);
oh.set("X-Pec-Version", "0.0.1");
store.set(key, new Response(await old.clone().text(), { status: 200, headers: oh }));
const readsBeforeVersion = reads;
r = await get("/papers/edge-paper");
await r.text();
ok(r.headers.get("X-Edge-Cache") === "miss" && reads > readsBeforeVersion, "a copy of another version is rebuilt before it is served", r.headers.get("X-Edge-Cache"));
await settle();

// 7. bypasses: JSON Accept, token query, HEAD, pdf, tags, unknown paper, other methods
store.clear();
const before = reads;
r = await get("/papers/edge-paper", { Accept: "application/json" });
await r.text();
ok(!r.headers.has("X-Edge-Cache"), "a JSON request is not cached", r.headers.get("X-Edge-Cache"));
r = await get("/papers/edge-paper?token=abc");
await r.text();
ok(!r.headers.has("X-Edge-Cache"), "a token query is not cached");
r = await get("/papers/edge-paper?utm_source=x");
await r.text();
await settle();
ok(r.headers.get("X-Edge-Cache") === "miss" && store.has(key), "a UTM query shares the one cached page");
store.clear();
r = await get("/papers/edge-paper", { Accept: "text/html" }, "HEAD");
ok(!r.headers.has("X-Edge-Cache"), "HEAD is not cached");
r = await get("/papers/tags");
await r.text();
ok(!r.headers.has("X-Edge-Cache"), "the tag catalogue is not cached");
await settle();
ok(![...store.keys()].some((k) => /tags/.test(k)), "nothing stored for the tag catalogue");
r = await get("/papers/edge-paper.pdf");
ok(!r.headers.has("X-Edge-Cache"), "the pdf is not cached");

// 8. a Cache API that throws never breaks the page
const realCaches = globalThis.caches;
globalThis.caches = { default: { async match() { throw new Error("cache down"); }, async put() { throw new Error("cache down"); } } };
r = await get("/papers/edge-paper");
const downBody = await r.text();
await settle();
ok(r.status === 200 && /Edge paper/.test(downBody), "a failing Cache API still serves the page", r.status);
globalThis.caches = realCaches;

// 9. an unknown paper is a 404 and is not stored
store.clear();
const savedFirst = row.slug;
const envMissing = { ...env, LIVING_PAPER: { prepare() { return st([]); } } };
r = await worker.fetch(new Request("https://papers.qnfo.org/papers/no-such-paper", { headers: { Accept: "text/html" } }), envMissing, ctx);
await r.text();
await settle();
ok(r.status === 404 && ![...store.keys()].some((k) => /no-such-paper/.test(k)), "a 404 is not stored", r.status);

Date.now = realNow;
console.log("paper-edge-cache: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
