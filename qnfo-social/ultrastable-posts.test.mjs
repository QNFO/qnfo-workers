// ULTRASTABLE-POSTS-1 offline suite (owner, 2026-11-10): one Ultrastable thread a week, built only from the live claims, with its limits and the case study;
// nothing is queued when the claims cannot be read, and a second run in the same week queues nothing.
// Run: node qnfo-social/ultrastable-posts.test.mjs
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT)");
const env = { DB: { prepare(sql) { let a = []; const s = { bind(...x) { a = x; return s; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { db.prepare(sql).run(...a); return { meta: {} }; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return s; } } };
const claims = { passing: 7, total: 7, claims: [
  { id: "predictions-scored", claim: "It scores its decisions.", pass: true, detail: "285 scored in 7 days, all time 774 of 1059 matched" },
  { id: "no-silent-drop", claim: "It loses nothing.", pass: true, detail: "570 open, 6041 closed with a disposition, 0 silent drops" },
  { id: "own-work", claim: "It finds its own work.", pass: true, detail: "549 issues with a code-task line filed in the last 7 days" }] };
const now = Date.UTC(2026, 10, 10, 9);
ok(mod.ultrastableWeekSlug(now) === "ultrastable-2026-w46", "ISO week slug " + mod.ultrastableWeekSlug(now));
const th = mod.ultrastableThread(claims);
ok(th.posts.length === 3 && th.posts.every((p) => p.length <= 300), "three posts, each within 300 characters: " + th.posts.map((p) => p.length).join(","));
ok(/7 of 7/.test(th.posts[0]) && /ultrastable\.io/.test(th.posts[0]), "lead post carries the live pass count and the link");
ok(/774 of 1059/.test(th.posts[1]) && /0 silent drops/.test(th.posts[1]), "numbers come only from the claims");
ok(/does not do yet/.test(th.posts[2]) && /rwnq8\.github\.io\/ultrastable/.test(th.posts[2]), "limits and the case study are stated");
ok(!/engineer|developer|coder/i.test(th.posts.join(" ")), "no engineer framing");
let r = await mod.ultrastableEnqueue(env, { nowMs: now, fetch: async () => ({ ok: true, json: async () => claims }) });
ok(r.queued === "ultrastable-2026-w46", "queued this week");
r = await mod.ultrastableEnqueue(env, { nowMs: now + 3600e3, fetch: async () => { throw new Error("should not fetch"); } });
ok(r.skipped === "queued this week", "a second run in the week queues nothing and does not fetch");
const db2 = await mod.ultrastableEnqueue(env, { nowMs: now + 7 * 864e5, fetch: async () => ({ ok: false, status: 503 }) });
ok(db2.skipped === "claims 503" && db.prepare("SELECT COUNT(*) n FROM social_threads").get().n === 1, "unreadable claims queue nothing");
ok(mod.ultrastableThread({ claims: [] }) === null, "no claims, no thread");
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
