// personal-api/companion-offline.test.mjs (COMPANION-OFFLINE-1, agent_issues 100201, pillar personal)
// The shell cache in the service worker, the offline queue (CMPQ, run in a vm exactly as the page embeds it) and the server side
// of a queued note (its own time, no duplicate on a retry).
// Run: node personal-api/companion-offline.test.mjs
import vm from "node:vm";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as C from "./companion.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; }
      };
      return api;
    }
  };
}
const Q = vm.runInNewContext(C.OFFLINE_JS + "\nCMPQ", { Date, JSON, Promise, Error, Object, console });
const memStore = () => {
  let n = 0; const items = [];
  return { items, async add(it) { items.push(Object.assign({ id: ++n }, it)); }, async all() { return items.slice(); }, async del(id) { const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1); }, async clear() { items.length = 0; } };
};

console.log("\n[what is queued]");
ok("a capture, a mood tap and a journal line (JSON POST) are queueable", ["capture", "mood", "journal"].every((x) => Q.queueable("/companion/api/" + x, { method: "POST", body: "{}" })));
ok("a voice or photo upload (FormData body) is not", !Q.queueable("/companion/api/capture", { method: "POST", body: { append() {} } }));
ok("reads and other writes are not (nothing else is held on the phone)", !Q.queueable("/companion/api/today", { method: "GET" }) && !Q.queueable("/companion/api/safety-plan", { method: "POST", body: "{}" }) && !Q.queueable("/companion/api/delete", { method: "POST", body: "{}" }) && !Q.queueable("/companion/api/chat", { method: "POST", body: "{}" }));
ok("only a network failure (TypeError) is queued, never an HTTP answer or a parse error", Q.isNetworkError(new TypeError("Failed to fetch")) && !Q.isNetworkError(new Error("sign in needed")) && !Q.isNetworkError(new SyntaxError("x")) && !Q.isNetworkError(null));
const it = Q.make("/companion/api/mood", JSON.stringify({ score: 4, note: "ok day" }), Date.parse("2026-10-19T08:10:00Z"));
ok("an item keeps the note and the time it was made", JSON.parse(it.body).score === 4 && JSON.parse(it.body).at === "2026-10-19T08:10:00.000Z" && it.path === "/companion/api/mood" && it.at === Date.parse("2026-10-19T08:10:00Z"), it);
ok("the offline confirmation says saved and carries the safety line", /Saved on this phone/.test(Q.SAVED) && /113/.test(Q.SAVED) && /112/.test(Q.SAVED));

console.log("\n[sending when the connection returns]");
{
  const st = memStore();
  const t0 = Date.parse("2026-10-19T12:00:00Z");
  await Q.add(st, "/companion/api/capture", JSON.stringify({ text: "call the dentist" }), t0 - 3 * 3600e3);
  await Q.add(st, "/companion/api/mood", JSON.stringify({ score: 2 }), t0 - 2 * 3600e3);
  await Q.add(st, "/companion/api/journal", JSON.stringify({ content: "slow day" }), t0 - 1 * 3600e3);
  ok("three notes wait", st.items.length === 3);
  const sent = [];
  const r = await Q.flush(st, async (x) => { sent.push(x.path); return { status: 200, body: { ok: true } }; }, t0);
  ok("all three go out, oldest first, and leave the queue", r.sent === 3 && r.left === 0 && sent.join() === "/companion/api/capture,/companion/api/mood,/companion/api/journal", { r, sent });
}
{
  const st = memStore();
  const t0 = Date.parse("2026-10-19T12:00:00Z");
  for (let i = 0; i < 3; i++) await Q.add(st, "/companion/api/mood", JSON.stringify({ score: 3 }), t0 - (3 - i) * 60000);
  let calls = 0;
  const r = await Q.flush(st, async () => { calls++; if (calls === 2) throw new TypeError("offline again"); return { status: 200, body: {} }; }, t0);
  ok("the connection drops mid-send: the rest stay for next time, order kept", r.sent === 1 && r.left === 2 && r.stopped === "network" && calls === 2, r);
}
{
  const st = memStore();
  const t0 = Date.parse("2026-10-19T12:00:00Z");
  await Q.add(st, "/companion/api/mood", "{\"score\":3}", t0 - 1000);
  const r401 = await Q.flush(st, async () => ({ status: 401, body: {} }), t0);
  ok("signed out (401): nothing is lost, the note waits for the next sign-in", r401.sent === 0 && r401.left === 1 && r401.stopped === 401);
  const r500 = await Q.flush(st, async () => ({ status: 503, body: {} }), t0);
  ok("a server error keeps the note too", r500.left === 1 && r500.stopped === 503);
  const r429 = await Q.flush(st, async () => ({ status: 429, body: {} }), t0);
  ok("rate limited keeps it", r429.left === 1);
  const r400 = await Q.flush(st, async () => ({ status: 400, body: {} }), t0);
  ok("a note the server can never accept (400) is dropped, not retried for ever", r400.dropped === 1 && r400.left === 0, r400);
}
{
  const st = memStore();
  const t0 = Date.parse("2026-10-19T12:00:00Z");
  await Q.add(st, "/companion/api/journal", JSON.stringify({ content: "x" }), t0 - 40 * 864e5);
  await Q.add(st, "/companion/api/journal", JSON.stringify({ content: "y" }), t0 - 1000);
  const r = await Q.flush(st, async () => ({ status: 200, body: {} }), t0);
  ok("a note older than 30 days is dropped, the recent one is sent", r.dropped === 1 && r.sent === 1 && r.left === 0, r);
}
{
  const st = memStore();
  for (let i = 0; i < Q.MAX_ITEMS; i++) st.items.push({ id: i + 1, path: "/companion/api/mood", body: "{}", at: 1 });
  const r = await Q.add(st, "/companion/api/mood", "{}", 2);
  ok("the queue is bounded", r.ok === false && r.full === true && st.items.length === Q.MAX_ITEMS);
}
{
  const st = memStore();
  const t0 = Date.parse("2026-10-19T12:00:00Z");
  await Q.add(st, "/companion/api/journal", JSON.stringify({ content: "bad night" }), t0 - 5000);
  await Q.add(st, "/companion/api/capture", JSON.stringify({ text: "bad night" }), t0 - 4000);
  const r = await Q.flush(st, async (x) => ({ status: 200, body: x.path.endsWith("journal") ? { ok: true, crisis: "CRISIS LINES" } : { ok: true, processed: { crisis: "CRISIS LINES 2" } } }), t0);
  ok("crisis lines the server returns for a delayed note are handed back to be shown", r.crisis.length === 2 && r.crisis[0] === "CRISIS LINES" && r.crisis[1] === "CRISIS LINES 2", r);
}
{
  const st = memStore();
  await Q.add(st, "/companion/api/mood", "{}", 1);
  await st.clear();
  ok("sign-out clears the queue", st.items.length === 0);
}

console.log("\n[the IndexedDB adapter]");
function fakeIdb() {
  const stores = {}; let seq = 0;
  const reqOf = (fn) => { const rq = { result: undefined }; queueMicrotask(() => { rq.result = fn(); if (rq.onsuccess) rq.onsuccess(); }); return rq; };
  const db = { createObjectStore(name) { stores[name] = new Map(); return {}; }, transaction(name) { const m = stores[name]; const tx = { objectStore() { return {
    add: (v) => { const x = Object.assign({}, v, { id: ++seq }); m.set(x.id, x); return { result: x.id }; },
    getAll: () => ({ result: [...m.values()] }), delete: (k) => { m.delete(k); return { result: undefined }; }, clear: () => { m.clear(); return { result: undefined }; } }; } };
    Promise.resolve().then(() => Promise.resolve()).then(() => tx.oncomplete && tx.oncomplete()); return tx; } };
  return { stores, open(name, ver) { const rq = { result: db }; queueMicrotask(() => { if (rq.onupgradeneeded) rq.onupgradeneeded(); if (rq.onsuccess) rq.onsuccess(); }); rq.name = name; rq.ver = ver; return rq; } };
}
{
  const f = fakeIdb();
  const st = Q.idb(f);
  ok("no IndexedDB means no queue (the page then shows the plain error)", Q.idb(null) === null && Q.idb(undefined) === null);
  await Q.add(st, "/companion/api/mood", JSON.stringify({ score: 5 }), 10);
  await Q.add(st, "/companion/api/capture", JSON.stringify({ text: "idea" }), 20);
  const all = await st.all();
  ok("add and read back through the adapter", all.length === 2 && all[0].path === "/companion/api/mood" && typeof all[0].id === "number", all);
  const r = await Q.flush(st, async () => ({ status: 200, body: {} }), 30);
  ok("flush deletes through the adapter", r.sent === 2 && (await st.all()).length === 0);
  await Q.add(st, "/companion/api/mood", "{}", 40);
  await st.clear();
  ok("clear empties the store", (await st.all()).length === 0);
}

console.log("\n[the service worker keeps the shell, not the data]");
function makeSw(opts) {
  const o = opts || {};
  const handlers = {}, cache = new Map(), cachesMap = new Map([["cmp-shell-v0", new Map()], ["other-app", new Map()]]);
  cachesMap.set("cmp-shell-v1", cache);
  const fetched = [];
  const fakeCaches = {
    async open(n) { if (!cachesMap.has(n)) cachesMap.set(n, new Map()); const m = cachesMap.get(n); return { async put(u, r) { m.set(typeof u === "string" ? u : new URL(u.url).pathname, r); } }; },
    async keys() { return [...cachesMap.keys()]; },
    async delete(n) { return cachesMap.delete(n); },
    async match(u) { return cache.get(u) || undefined; }
  };
  const self = { addEventListener(t, f) { handlers[t] = f; }, skipWaiting() { self.skipped = true; }, clients: { claim() { self.claimed = true; } }, location: { origin: "https://me.q08.org" } };
  const fetchFn = async (req) => {
    const url = typeof req === "string" ? req : req.url;
    fetched.push(url);
    if (o.offline) throw new TypeError("offline");
    return new Response("shell:" + url, { status: o.status || 200 });
  };
  const ctx = vm.createContext({ self, caches: fakeCaches, fetch: fetchFn, Response, URL, Promise, console, JSON, Number, setTimeout });
  vm.runInContext(C.SW_JS, ctx);
  return { handlers, cache, cachesMap, fetched, self };
}
{
  const sw = makeSw();
  let p; sw.handlers.install({ waitUntil(x) { p = x; } }); await p;
  ok("install caches the page, manifest and icon", ["/companion", "/companion/manifest.webmanifest", "/companion/icon.svg"].every((u) => sw.cache.has(u)) && sw.cache.size === 3, [...sw.cache.keys()]);
  ok("install fetched only those three, none of them an API route", sw.fetched.length === 3 && sw.fetched.every((u) => !u.includes("/api/")), sw.fetched);
  ok("the new worker takes over at once", sw.self.skipped === true);
  sw.handlers.activate({ waitUntil(x) { p = x; } }); await p;
  ok("activate removes older shell caches and leaves other caches alone", !sw.cachesMap.has("cmp-shell-v0") && sw.cachesMap.has("other-app") && sw.cachesMap.has("cmp-shell-v1"));
}
{
  const sw = makeSw({ status: 500 });
  let p; sw.handlers.install({ waitUntil(x) { p = x; } }); await p;
  ok("a failing install fetch caches nothing but does not fail the install", sw.cache.size === 0);
}
async function doFetch(sw, url, method) {
  let responded = null;
  sw.handlers.fetch({ request: { url, method: method || "GET" }, respondWith(x) { responded = x; } });
  return responded ? await responded : "pass-through";
}
{
  const sw = makeSw();
  sw.cache.set("/companion", new Response("cached shell"));
  const online = await doFetch(sw, "https://me.q08.org/companion");
  ok("online: the network answer is used, and it refreshes the cache", (await online.text()) === "shell:https://me.q08.org/companion" && sw.cache.has("/companion") && (await sw.cache.get("/companion").text()) === "shell:https://me.q08.org/companion");
}
{
  const sw = makeSw({ offline: true });
  sw.cache.set("/companion", new Response("cached shell"));
  const off = await doFetch(sw, "https://me.q08.org/companion");
  ok("offline: the cached shell opens", (await off.text()) === "cached shell");
  const icon = await doFetch(sw, "https://me.q08.org/companion/icon.svg");
  ok("offline with nothing cached for a shell file: an error response, not a hang", icon && icon.type === "error");
  ok("API reads are never intercepted or cached", (await doFetch(sw, "https://me.q08.org/companion/api/today")) === "pass-through" && (await doFetch(sw, "https://me.q08.org/companion/api/export")) === "pass-through");
  ok("writes are never intercepted", (await doFetch(sw, "https://me.q08.org/companion", "POST")) === "pass-through");
  ok("other origins and the worker script itself are left alone", (await doFetch(sw, "https://example.com/companion")) === "pass-through" && (await doFetch(sw, "https://me.q08.org/companion/sw.js")) === "pass-through");
  ok("no personal data in the cache keys", [...sw.cache.keys()].every((k) => !k.includes("/api/")));
}

console.log("\n[a queued note keeps its own time on the server]");
{
  const raw = new DatabaseSync(":memory:");
  const env = { PERSONAL: d1(raw) };
  await C.ensureSchema(env.PERSONAL, true);
  const now = Date.now();
  const at = new Date(now - 4 * 3600e3).toISOString();
  ok("clientStamp accepts a recent past time", C.clientStamp(at) === at);
  ok("clientStamp refuses the future, junk and anything older than 30 days", C.clientStamp(new Date(now + 3600e3).toISOString()) === null && C.clientStamp("soon") === null && C.clientStamp(undefined) === null && C.clientStamp(new Date(now - 31 * 864e5).toISOString()) === null);
  const m1 = await C.recordMood(env, null, { score: 4, note: "out for a walk", at });
  const row = raw.prepare("SELECT ts, day FROM cmp_mood WHERE id = ?").get(m1.id);
  ok("a mood tap made offline is stored at the time it was made", m1.ok && row.ts === at && row.day === C.dayKey(at), { row, at });
  const m2 = await C.recordMood(env, null, { score: 4, note: "out for a walk", at });
  ok("the same note arriving twice (a lost reply) is answered as a duplicate, not stored again", m2.ok && m2.duplicate === true && raw.prepare("SELECT COUNT(*) AS n FROM cmp_mood").get().n === 1);
  const m3 = await C.recordMood(env, null, { score: 2 });
  ok("a normal tap is stamped now", m3.ok && !m3.duplicate && Math.abs(Date.parse(raw.prepare("SELECT ts FROM cmp_mood WHERE id = ?").get(m3.id).ts) - Date.now()) < 5000);
  const j1 = await C.addJournal(env, null, { content: "slow day on the train", at });
  const j2 = await C.addJournal(env, null, { content: "slow day on the train", at });
  ok("journal: own time, and a retry is a duplicate", j1.ok && j2.duplicate === true && raw.prepare("SELECT ts FROM journal WHERE id = ?").get(j1.id).ts === at && raw.prepare("SELECT COUNT(*) AS n FROM journal").get().n === 1);
  const c1 = await C.capture(env, { llm: async () => null }, { text: "call the dentist", at, source: "api" });
  const c2 = await C.capture(env, { llm: async () => null }, { text: "call the dentist", at, source: "api" });
  ok("capture: own time, and a retry is a duplicate", c1.ok && raw.prepare("SELECT ts FROM cmp_inbox WHERE id = ?").get(c1.id).ts === at && c2.duplicate === true && raw.prepare("SELECT COUNT(*) AS n FROM cmp_inbox").get().n === 1);
  const old = new Date(now - 2 * 864e5).toISOString();
  raw.prepare("INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, state, sent_at) VALUES (?, ?, 'cmp-checkin', 0, 'How are you?', 'sent', ?)").run(new Date().toISOString(), C.dayKey(new Date().toISOString()), new Date().toISOString());
  await C.recordMood(env, null, { score: 3, at: old });
  ok("a backdated tap does not close today's open check-in", raw.prepare("SELECT state FROM companion_nudges WHERE kind = 'cmp-checkin'").get().state === "sent");
  await C.recordMood(env, null, { score: 3 });
  ok("a tap made now still does", raw.prepare("SELECT state FROM companion_nudges WHERE kind = 'cmp-checkin'").get().state === "done");
}

console.log("\n[the page]");
{
  const html = C.PAGE_HTML;
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  let parses = true; try { new Function(script); } catch (e) { parses = String(e); }
  ok("the page script parses", parses === true, parses);
  ok("the queue core is embedded once, ahead of its first use", html.split("var CMPQ=(function(){").length === 2 && html.indexOf("var CMPQ=") < html.indexOf("function api(path,opt)"));
  ok("api() queues a note on a network failure and tells the page it was saved", /CMPQ\.queueable\(path,opt\)/.test(html) && /CMPQ\.add\(qstore,path,opt\.body,Date\.now\(\)\)/.test(html) && /queued:true,reply:CMPQ\.SAVED/.test(html));
  ok("capture, journal and the mood tap show the saved line instead of an error", /if\(r\.queued\)\{say\(o,r\.reply\);return\}/.test(html) && /r\.queued\?r\.reply/.test(html) && /if\(!r\.queued\)setTimeout\(load,1800\)/.test(html));
  ok("Today shows an offline view with the mood card when the server cannot be reached", /function renderOffline\(\)/.test(html) && /isNetworkError\(e\)\)renderOffline\(\)/.test(html) && /moodCard\(\{mood:null\}\)/.test(html));
  ok("the queue is sent when the connection returns, when the app comes forward and after Today loads", /addEventListener\('online',flushQueue\)/.test(html) && /visibilitychange/.test(html) && /renderToday\(t\);flushQueue\(\)/.test(html));
  ok("sign-out clears the unsent queue first", /function signOut\(\)\{\(qstore\?qstore\.clear\(\)/.test(html));
  ok("a sent note's crisis lines are shown", /showPending\('Sent '/.test(html) && /cls:'warn',text:t/.test(html));
  ok("the CSP already allows what this needs (worker-src and connect-src self; no new origin)", /connect-src 'self'; worker-src 'self'/.test(fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8")));
  ok("OFFLINE_JS has no template-literal hazards or backslash escapes", !C.OFFLINE_JS.includes("`") && !C.OFFLINE_JS.includes("${") && !C.OFFLINE_JS.includes("\\"));
}

console.log("\n[worker.js parity]");
{
  const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  ok("worker.js carries COMPANION-OFFLINE-1 (the issue's closing probe)", w.includes("COMPANION-OFFLINE-1"));
  ok("worker.js carries the queue core and the shell cache", w.includes("var CMPQ=(function(){") && w.includes("const SHELL = 'cmp-shell-v1';"));
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
