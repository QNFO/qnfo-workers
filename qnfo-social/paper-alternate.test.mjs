// PROMOTE-ROUTE-2 offline suite (qnfo-social 0.9.2, pillar reach). A channel whose last published post was a curated thread
// gets the newest unposted paper next; after a paper it gets a queued thread again; no history or an unreadable history keeps
// the 0.9.0 order (threads first). Run: node qnfo-social/paper-alternate.test.mjs  -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, entity_type TEXT, entity_id TEXT, metric TEXT, value REAL, quality TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_doi TEXT, paper_title TEXT, pages_url TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
INSERT INTO social_threads (slug, title, posts, status, flags, notes) VALUES
  ('thread-a', 'Thread A', '["Claim: A https://papers.qnfo.org/papers/thread-a/"]', 'queued', 'selected', 'selected: a');
INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, created_at) VALUES
  ('d1', 'new-paper', '10.5281/zenodo.9', 'A new paper', 'bluesky', 'queued', datetime('now','-1 hours'));`);
const stmt = (sql) => { let a = []; const s = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { db.prepare(sql).run(...a); return { success: true }; } }; return s; };
const env = { DB: { prepare: stmt } };
let r = await mod.pickChannelRow(env, "mastodon", "0");
ok(r && r.slug === "thread-a", "no post history: the queued curated thread goes first (0.9.0 order)", r);
db.prepare("INSERT INTO social_media_posts (id, platform, project_id, status, published_at) VALUES ('t1', 'buffer-mastodon', 'some-old-thread', 'published', datetime('now','-1 days'))").run();
r = await mod.pickChannelRow(env, "mastodon", "0");
ok(r && r.slug === "new-paper" && r.status === "paper", "last post was a thread: the newest unposted paper goes next", r);
r = await mod.pickChannelRow(env, "twitter", "0");
ok(r && r.slug === "thread-a", "another channel with no history still starts with the thread", r);
db.prepare("INSERT INTO social_media_posts (id, platform, project_id, status, published_at) VALUES ('t2', 'buffer-mastodon', 'new-paper', 'published', datetime('now'))").run();
r = await mod.pickChannelRow(env, "mastodon", "0");
ok(r && r.slug === "thread-a", "last post was a paper: a queued thread goes next", r);
db.exec("DROP TABLE dissemination_tracker");
db.prepare("INSERT INTO social_media_posts (id, platform, project_id, status, published_at) VALUES ('t3', 'buffer-twitter', 'x-thread', 'published', datetime('now'))").run();
r = await mod.pickChannelRow(env, "twitter", "0");
ok(r && r.slug === "thread-a", "an unreadable tracker falls back to the thread order", r);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
