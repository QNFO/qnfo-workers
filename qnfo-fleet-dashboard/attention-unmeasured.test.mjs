// ATTENTION-UNMEASURED-1 (qnfo-fleet-dashboard 1.74.1, agent_issues 1000458, guard metric attention_channels_stopped) offline suite. Replays the ATTENTION-LOOP-1 block from worker.js
// against an in-memory SQLite D1. State-independent: it builds its own fixture.
// Proves: atMeasuredOnly keeps an item with an engagement row (even at zero), reports an item without one as unmeasured, and an item younger than the due window as not due;
// atChannelStats counts only measured items for Bluesky and for each Buffer channel, so attention per item is not diluted by posts nobody could read, reports the excluded
// counts (stats.unmeasured, stats.not_due, a note), and leaves a channel whose posts are all unmeasured with 0 items, which atVerdict reads as INSUFFICIENT (full share), never STOP.
// Run: node qnfo-fleet-dashboard/attention-unmeasured.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- ATTENTION-LOOP-1:BEGIN"), src.indexOf("// ---- ATTENTION-LOOP-1:END"));
if (!block || block.indexOf("function atMeasuredOnly(") < 0) throw new Error("atMeasuredOnly not found in the ATTENTION-LOOP-1 block of worker.js");
const helpers = src.slice(src.indexOf("var REACH_INGEST_AFTER_UTC_HOUR"), src.indexOf("function reachRumQuery(dims, geq, leq, extraFilter) {"));
const hosts = src.slice(src.indexOf("var HA_PUBLIC_HOSTS"), src.indexOf("var HA_DAYS"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const DDL = `CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, posts TEXT, status TEXT, posted_at TEXT, post_uri TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_title TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT, post_id TEXT, buffer_id TEXT, project_id TEXT, published_at TEXT, status TEXT);
CREATE TABLE outreach_learner_sends (queue_id TEXT PRIMARY KEY, email TEXT, segment TEXT, sent_at TEXT, outcome TEXT);
CREATE TABLE outreach_learner_arms (segment TEXT PRIMARY KEY, sends INTEGER, positives INTEGER, stopped INTEGER);`;
const db = new DatabaseSync(":memory:");
db.exec(DDL);
const A = { prepare(sql) { let args = []; const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: db.prepare(sql).all(...args) }; } }; return s; } };
const sb = { console, Date, Math, JSON, Number, String, Object, Array, RegExp, Map, isFinite, VERSION: "1.74.1-test", NAME: "qnfo-fleet-dashboard", DAY_MS: 864e5, __name: (f) => f, __export: null };
sb.d1all = async function(dbx, sql, params) { let ps = dbx.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; };
vm.createContext(sb);
vm.runInContext(hosts + "\n" + helpers + "\n" + block + "\n__export = { atMeasuredOnly, atChannelStats, atVerdict, atThresholds };", sb, { filename: "attention-block" });
const T = sb.__export;

// ---------- the pure helper ----------
{
  const now = Date.parse("2026-10-27T12:00:00Z");
  const items = [{ id: "a", at: now - 5 * 864e5 }, { id: "b", at: now - 5 * 864e5 }, { id: "c", at: now - 3600e3 }, { id: "d", at: now - 5 * 864e5 }];
  const r = T.atMeasuredOnly(items, { a: { likes: 0 }, d: {} }, { nowMs: now, dueMs: 864e5 });
  ok(r.measured.map((x) => x.id).join() === "a,d", "a row, even an empty or zero one, makes an item measured", r);
  ok(r.unmeasured.map((x) => x.id).join() === "b", "an old item without a row is unmeasured");
  ok(r.not_due.map((x) => x.id).join() === "c", "an item younger than the due window without a row is not due");
  const r2 = T.atMeasuredOnly(items, { a: {} }, { nowMs: now });
  ok(r2.not_due.length === 0 && r2.unmeasured.map((x) => x.id).join() === "b,c,d", "without a due window nothing is not-due");
  const r3 = T.atMeasuredOnly([], {}, {});
  ok(r3.measured.length === 0 && r3.unmeasured.length === 0 && r3.not_due.length === 0, "empty input");
  ok(T.atMeasuredOnly(null, null, null).measured.length === 0, "null input is safe");
}

// ---------- one window over a fixture ----------
const day = "2026-10-26";
const ins = db.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, ?, ?, ?, ?, ?, ?, 'human')");
// Bluesky: 3 threads (one with a like and rows), one with rows at zero, one with no row at all; plus a dissemination post with no row
for (let i = 1; i <= 3; i++) db.prepare("INSERT INTO social_threads (id, slug, title, posts, status, posted_at, post_uri) VALUES (?, ?, ?, ?, 'posted', ?, ?)").run(i, "s" + i, "T" + i, JSON.stringify(["a", "b"]), "2026-10-1" + i + " 09:00:00", "at://did:plc:q/app.bsky.feed.post/" + i);
db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_id, posted_at) VALUES ('d1', 'p1', 'P1', 'bluesky', 'posted', 'at://did:plc:q/app.bsky.feed.post/d1', '2026-10-15 09:00:00')").run();
ins.run(day, "bluesky", "bluesky", "post", "at://did:plc:q/app.bsky.feed.post/1", "likes", 3);
ins.run(day, "bluesky", "bluesky", "post", "at://did:plc:q/app.bsky.feed.post/2", "likes", 0);
// Buffer: LinkedIn 1 measured (2 reactions), 1 old without a row, 1 posted 3 hours before the window end without a row; X 2 old without any row
const bp = db.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, published_at, status) VALUES (?, ?, ?, ?, ?, ?, 'published')");
bp.run("l1", "buffer-linkedin", "b1", "b1", "s1", "2026-10-20 09:00:00");
bp.run("l2", "buffer-linkedin", "b2", "b2", "s2", "2026-10-21 09:00:00");
bp.run("l3", "buffer-linkedin", "b3", "b3", "s3", "2026-10-26 21:00:00");
bp.run("x1", "buffer-twitter", "bx1", "bx1", "s1", "2026-10-20 09:00:00");
bp.run("x2", "buffer-twitter", "bx2", "bx2", "s2", "2026-10-21 09:00:00");
ins.run(day, "buffer", "linkedin", "post", "b1", "likes", 2);

const L = await T.atChannelStats({ AUDIT: A }, "2026-10-01", day);
const bs = L.stats.bluesky, li = L.stats.linkedin, xx = L.stats.x;
ok(bs.items === 2 && bs.unmeasured === 2 && bs.attention === 3 && bs.per_item === 1.5, "Bluesky: 2 measured items (one at zero), 2 unmeasured, attention 3 over 2 items = 1.5, not 3 over 4", { items: bs.items, unmeasured: bs.unmeasured, attention: bs.attention, per_item: bs.per_item });
ok(li.items === 1 && li.unmeasured === 1 && li.not_due === 1 && li.attention === 2 && li.per_item === 2, "LinkedIn: 1 measured, 1 old unmeasured, 1 not yet due; per item 2", { items: li.items, unmeasured: li.unmeasured, not_due: li.not_due, per_item: li.per_item });
ok(xx.items === 0 && xx.unmeasured === 2 && xx.per_item === 0, "X: both posts unmeasured, so 0 items", { items: xx.items, unmeasured: xx.unmeasured });
ok(L.notes.some((n) => /^bluesky: 2 of 4 posted item/.test(n)) && L.notes.some((n) => /^linkedin: 1 channel post/.test(n)) && L.notes.some((n) => /^x: 2 channel post/.test(n)), "the exclusions are reported as notes", L.notes);
ok(!L.notes.some((n) => /^mastodon:/.test(n)), "no note for a channel with nothing excluded");

// ---------- the verdict on measured items ----------
{
  const th = T.atThresholds(null);
  const vx = T.atVerdict({ items: xx.items, attention: xx.attention, visits: 0, clicks_human: 0, items7: 0, attention7: 0, visits7: 0, clicks_human7: 0 }, null, th, "2026-10-27T05:00:00Z");
  ok(vx.verdict === "INSUFFICIENT" && vx.share === 1, "a channel whose posts are all unmeasured reads INSUFFICIENT with the full share, never STOP", vx);
  const vstop = T.atVerdict({ items: 20, attention: 0, visits: 0, clicks_human: 0, items7: 5, attention7: 0, visits7: 0, clicks_human7: 0 }, null, th, "2026-10-27T05:00:00Z");
  ok(vstop.verdict === "STOP", "twenty measured items with no attention still stop (the rule itself is unchanged)", vstop);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
