// personal-api/companion-ask-fast.test.mjs (ASK-FAST-1, pillar personal)
// Rowan's screenshot 2026-11-13: "What's on tonight?" sat on "Looking..." while the model read venue pages, and the mic-blocked
// message was a tall dark box over the input. This holds: schedule questions answer from data with no model call, the slow path
// hands back a pending answer the page fetches later, the page never waits without a limit, and mic-blocked is a short inline note
// with one-tap questions.
// Run: node personal-api/companion-ask-fast.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import * as C from "./companion.js";

function d1(db) {
  return { prepare(sql) { let args = []; const api = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) ?? null; } }; return api; } };
}
const raw = new DatabaseSync(":memory:");
const env = { PERSONAL: d1(raw) };
await C.ensureSchema(env.PERSONAL);

// 1. which questions take the fast path
for (const [q, w] of [["What's on tonight?", "tonight"], ["whats on this evening", "tonight"], ["What is on today?", "today"], ["Anything on tomorrow?", "tomorrow"], ["What can I do this evening?", "tonight"]]) assert.equal(C.askFastWhen(q), w, q);
for (const q of ["Search venue listings for tonight", "What lifts my mood?", "Add dentist Friday 3pm to my calendar", "what's on tonight at the Bimhuis and is it sold out"]) assert.equal(C.askFastWhen(q), null, q);
console.log("ok   schedule questions are recognised; the live look-up chip and other questions are not");

// 2. the answer comes from the listings feed, with no model
const day = await C.localDay(env, new Date().toISOString());
raw.prepare("CREATE TABLE IF NOT EXISTS cmp_feed (id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT, title TEXT NOT NULL, venue TEXT, kind TEXT, url TEXT, why TEXT, score REAL DEFAULT 0, state TEXT DEFAULT 'new', reason TEXT, built_at TEXT)").run();
raw.prepare("INSERT INTO cmp_feed (id, date, time, title, venue, url, score) VALUES ('a', ?, '20:15', 'Duo Zeffiretti', 'Concertgebouw', 'https://www.concertgebouw.nl/', 3), ('b', ?, '11:00', 'Morning talk', 'Stedelijk', null, 2), ('c', ?, '21:00', 'Hidden gig', 'Melkweg', null, 1)").run(day, day, day);
raw.prepare("UPDATE cmp_feed SET state = 'down' WHERE id = 'c'").run();
let llmCalls = 0;
const deps = { llm: async () => { llmCalls++; return "{}"; }, chat: async () => { llmCalls++; return new Response("{}"); } };
const t0 = Date.now();
const fast = await C.askFast(env, deps, "What's on tonight?");
assert.ok(Date.now() - t0 < 7000, "answers within the 6 s calendar limit");
assert.ok(fast && fast.ok && fast.fast, "fast answer");
assert.ok(fast.reply.includes("Duo Zeffiretti") && fast.reply.includes("20:15"), fast.reply);
assert.ok(!fast.reply.includes("Morning talk"), "a morning item is not 'tonight'");
assert.ok(!fast.reply.includes("Hidden gig"), "a thumbed-down listing stays hidden");
assert.ok(fast.chips.includes("Search venue listings for tonight"), "one tap runs the live look-up");
console.log("ok   tonight answers from the listings feed, evening only, taste respected, with a live look-up chip");

// 3. the HTTP route: fast path without the model; slow path returns pending and the answer is fetched later
const bg = []; const ctx = { waitUntil(p) { bg.push(p); } };
const post = (path, body, d) => C.handleCompanion(new Request("https://me.q08.org/companion/api/" + path, { method: "POST", headers: { Authorization: "Bearer k", "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, ctx, d);
const base = { auth: async (r) => r.headers.get("Authorization") === "Bearer k", version: "t", doStub: () => ({ fetch: async () => new Response("{}") }) };
llmCalls = 0;
const r1 = await (await post("chat", { thread_id: "companion-t", messages: [{ role: "user", content: "What's on tonight?" }] }, Object.assign({}, base, deps))).json();
assert.ok(r1.ok && r1.fast && r1.reply.includes("Duo Zeffiretti"), JSON.stringify(r1));
assert.equal(llmCalls, 0, "no model call for a schedule question");
const slow = Object.assign({}, base, { askWaitMs: 50, chat: async () => { await new Promise((r) => setTimeout(r, 200)); raw.prepare("INSERT INTO chat (id, thread, ts, role, content, model) VALUES ('x-a', 'companion-t', ?, 'assistant', 'Here is the slow answer', 'm')").run(new Date().toISOString()); return new Response(JSON.stringify({ choices: [{ message: { content: "Here is the slow answer" } }] })); } });
const r2 = await (await post("chat", { thread_id: "companion-t", messages: [{ role: "user", content: "Search venue listings for tonight" }] }, slow)).json();
assert.ok(r2.pending && r2.since && r2.thread_id === "companion-t", JSON.stringify(r2));
assert.ok(bg.length >= 1, "the slow answer keeps running in the background");
const none = await (await post("chat/latest", { thread_id: "companion-t", since: r2.since }, slow)).json();
assert.equal(none.reply, null, "nothing yet");
await Promise.all(bg);
const got = await (await post("chat/latest", { thread_id: "companion-t", since: r2.since }, slow)).json();
assert.equal(got.reply, "Here is the slow answer");
console.log("ok   slow answers return pending at once and the page fetches the saved answer from chat/latest");

// 4. the page: every chat call has a time limit, pending is polled, a failure offers a retry chip, mic-blocked is short and inline
const html = await (await C.handleCompanion(new Request("https://me.q08.org/companion"), { PERSONAL: null }, { waitUntil() {} }, {})).text();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
for (const sc of scripts) new Function(sc);
assert.match(html, /api\('\/companion\/api\/chat',\{json:\{[^]*?\},timeout:60000\}\)/, "chat call has a 60 s limit");
assert.ok(html.includes("new AbortController()") && html.includes("throw new Error('timeout')"), "api() aborts on its limit");
assert.ok(html.includes("/companion/api/chat/latest") && html.includes("askLater(r,q,0)"), "pending answers are polled");
assert.ok(html.includes("That took too long, so I stopped waiting.") && html.includes("Tap to try again."), "timeout leaves a retry, never a spinner");
assert.ok(!html.includes("The microphone is blocked for this site. Tap the lock icon"), "the long covering mic message is gone");
assert.ok(html.includes("Voice is switched off for this site, so tap a question instead.") && html.includes("chipList(micChips())"), "mic-blocked: short note plus one-tap questions");
assert.ok(!/#toast\{[^}]*left:50%/.test(html) && html.includes("#dock:not(.hide)~#toast{bottom:"), "toasts sit above the composer at full width, never over it");
console.log("ok   page: time limits, pending poll, retry chip, short inline mic-blocked note, toast clears the composer");
