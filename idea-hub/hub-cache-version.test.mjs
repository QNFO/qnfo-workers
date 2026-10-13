// HUB-CACHE-VERSION-2 (idea-hub 1.9.0, agent_issues 2484, failure mode edge-copy-version-skew) offline suite. Runs the
// worker's own ideasCached in a vm with an in-memory caches.default and a controllable build.
// Proves: the stored copy carries X-Ideas-Version = VERSION next to X-Ideas-Built; a copy stored by another version is
// rebuilt while the request waits, and a fast 200 build is served; a slow build serves the old copy marked X-Ideas-Cache
// stale-version and keeps building through ctx.waitUntil, which then stores the new version; a failed build serves the old
// copy; a same-version copy is served from cache with no build; visitors never see X-Ideas-Version or X-Ideas-Built.
// Run: node idea-hub/hub-cache-version.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
ok(src.includes("HUB-CACHE-VERSION-2"), "the worker names HUB-CACHE-VERSION-2 (the issue's code probe)");
const store = new Map();
const caches = { default: { async match(r) { const e = store.get(r.url); return e ? new Response(e.b, { headers: e.h }) : undefined; }, async put(r, res) { store.set(r.url, { b: await res.text(), h: new Headers(res.headers) }); } } };
const logs = [];
const sb = { console: { log: (m) => logs.push(String(m)) }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, setTimeout, clearTimeout, caches, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { ideasCached, VERSION, IDEAS_VERSION_WAIT_MS };", sb);
const { ideasCached, VERSION, IDEAS_VERSION_WAIT_MS } = sb.__x;
ok(IDEAS_VERSION_WAIT_MS === 2500, "a version change waits up to 2500 ms for the build", IDEAS_VERSION_WAIT_MS);
const req = new Request("https://ideas.qnfo.org/");
const page = (t) => async () => new Response(t, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
const visible = (r) => !r.headers.get("X-Ideas-Version") && !r.headers.get("X-Ideas-Built");
let waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const entry = () => [...store.values()][0];

// 1. Cold: built, stored with the version and the build stamp; the visitor sees neither.
let r = await ideasCached(req, ctx, page("v-now-1"));
ok(r.status === 200 && (await r.text()) === "v-now-1" && visible(r), "cold: the build is served, without internal stamps");
ok(entry().h.get("X-Ideas-Version") === VERSION && Number(entry().h.get("X-Ideas-Built")) > 0, "the stored copy carries X-Ideas-Version = VERSION next to X-Ideas-Built", [...entry().h]);

// 2. Same version, fresh: from cache, no build.
let builds = 0;
r = await ideasCached(req, ctx, async () => { builds++; return page("x")(); });
ok((await r.text()) === "v-now-1" && builds === 0 && waits.length === 0 && visible(r), "same version: served from cache, no build");

// 3. A copy stored by the previous version, fast build: the request waits and gets the new render.
entry().h.set("X-Ideas-Version", "0.0.1-old"); entry().b = "v-old";
r = await ideasCached(req, ctx, page("v-now-2"));
ok((await r.text()) === "v-now-2" && visible(r) && !r.headers.get("X-Ideas-Cache"), "old-version copy + fast build: the new render is served");
ok(entry().b === "v-now-2" && entry().h.get("X-Ideas-Version") === VERSION, "and stored with the new version");

// 4. Old copy, slow build: the old copy is served marked stale-version; the build continues in waitUntil and stores.
entry().h.set("X-Ideas-Version", "0.0.1-old"); entry().b = "v-old";
waits = [];
const t0 = Date.now();
r = await ideasCached(req, ctx, () => new Promise((res) => setTimeout(() => res(new Response("v-now-3", { status: 200 })), IDEAS_VERSION_WAIT_MS + 400)));
const waited = Date.now() - t0;
ok((await r.text()) === "v-old" && r.headers.get("X-Ideas-Cache") === "stale-version" && visible(r), "slow build: the old copy is served, marked X-Ideas-Cache stale-version", [...r.headers]);
ok(waited >= IDEAS_VERSION_WAIT_MS - 50 && waited < IDEAS_VERSION_WAIT_MS + 350, "the request waited about IDEAS_VERSION_WAIT_MS, not for the whole build", waited);
ok(waits.length === 1, "the build keeps running through ctx.waitUntil", waits.length);
await Promise.all(waits);
ok(entry().b === "v-now-3" && entry().h.get("X-Ideas-Version") === VERSION, "the background build stored the new version");

// 5. Old copy, failing build: the old copy is served and the failure is logged, not swallowed.
entry().h.set("X-Ideas-Version", "0.0.1-old"); entry().b = "v-old";
waits = []; logs.length = 0;
r = await ideasCached(req, ctx, async () => { throw new Error("D1 down"); });
ok((await r.text()) === "v-old" && r.headers.get("X-Ideas-Cache") === "stale-version", "failed build: the old copy is served");
await Promise.allSettled(waits);
ok(logs.some((l) => /D1 down/.test(l)), "the build failure is logged", logs);

// 6. Old copy, non-200 build: the old copy is served; nothing broken is stored.
entry().h.set("X-Ideas-Version", "0.0.1-old"); entry().b = "v-old";
r = await ideasCached(req, ctx, async () => new Response("err", { status: 500 }));
ok((await r.text()) === "v-old" && entry().b === "v-old", "a 500 build: the old copy is served and kept");

// 7. A copy with no version stamp (stored before HUB-CACHE-VERSION-2) counts as another version.
entry().h.delete("X-Ideas-Version"); entry().b = "v-unstamped";
r = await ideasCached(req, ctx, page("v-now-4"));
ok((await r.text()) === "v-now-4" && entry().h.get("X-Ideas-Version") === VERSION, "an unstamped copy is rebuilt like an old version");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
