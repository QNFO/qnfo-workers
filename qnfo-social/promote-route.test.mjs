// PROMOTE-ROUTE-1 offline suite (qnfo-social 0.9.0, pillar reach). Drives pickChannelRow and pickPaperRow against an
// in-memory SQLite D1. Proves: a queued curated thread still goes first; with none queued, the newest queued research paper
// in dissemination_tracker is offered before any recycled posted thread; the candidate has the thread shape (one post with
// the papers.qnfo.org link); a paper already carried on a channel is not offered there again but still is on another; papers
// older than PAPER_PROMOTE_DAYS, posted rows and q08 slugs are never offered; an unreadable tracker falls back to threads.
// Run: node qnfo-social/promote-route.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), doi TEXT, flags TEXT, notes TEXT, post_uri TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT, engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, entity_type TEXT, entity_id TEXT, metric TEXT, value REAL, quality TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_doi TEXT, paper_title TEXT, pages_url TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT, created_at TEXT DEFAULT (datetime('now')));
INSERT INTO social_threads (slug, title, posts, status, flags, notes, posted_at) VALUES
  ('old-thread', 'Old', '["Old https://papers.qnfo.org/papers/old-thread/"]', 'posted', NULL, NULL, datetime('now','-2 days'));
INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, pages_url, channel, action, created_at) VALUES
  ('d1', 'older-paper', '10.5281/zenodo.1', 'Older paper', NULL, 'bluesky', 'queued', datetime('now','-3 days')),
  ('d2', 'newest-paper', '10.5281/zenodo.2', 'Boundary-crossing paths bound emergence', NULL, 'bluesky', 'queued', datetime('now','-1 hours')),
  ('d3', 'ancient-paper', '10.5281/zenodo.3', 'Ancient', NULL, 'bluesky', 'queued', datetime('now','-40 days')),
  ('d4', 'done-paper', '10.5281/zenodo.4', 'Done', NULL, 'bluesky', 'posted', datetime('now')),
  ('d5', 'q08-essay', NULL, 'Essay', NULL, 'bluesky', 'queued', datetime('now'));`);
const stmt = (sql) => { let a = []; const s = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
const env = { DB: { prepare: stmt } };
let r = await mod.pickChannelRow(env, "linkedin", "0");
ok(r && r.slug === "newest-paper" && r.status === "paper" && r.id === "dissem:d2", "with no queued thread, the newest queued paper goes before a recycled posted thread", r);
const posts = JSON.parse(r.posts);
ok(Array.isArray(posts) && posts.length === 1 && posts[0].includes("https://papers.qnfo.org/papers/newest-paper/") && posts[0].startsWith("Boundary-crossing paths bound emergence"), "the candidate is one post with the title and the papers.qnfo.org link", posts);
db.prepare("INSERT INTO social_media_posts (id, platform, project_id, status, published_at) VALUES ('p1', 'buffer-linkedin', 'newest-paper', 'published', datetime('now'))").run();
r = await mod.pickChannelRow(env, "linkedin", "0");
ok(r && r.slug === "older-paper", "a paper carried on LinkedIn is not offered there again; the next newest is", r);
r = await mod.pickChannelRow(env, "mastodon", "0");
ok(r && r.slug === "newest-paper", "the same paper is still offered on another channel", r);
db.prepare("INSERT INTO social_media_posts (id, platform, project_id, status, published_at) VALUES ('p2', 'buffer-linkedin', 'older-paper', 'published', datetime('now'))").run();
r = await mod.pickChannelRow(env, "linkedin", "0");
ok(r && r.slug === "old-thread", "once every recent paper is carried, recycled threads are offered again (ancient, posted and q08 rows never are)", r);
db.prepare("INSERT INTO social_threads (slug, title, posts, status, flags, notes) VALUES ('launch', 'Launch', '[\"Launch https://papers.qnfo.org/papers/launch/\"]', 'queued', 'selected', 'selected: launch')").run();
r = await mod.pickChannelRow(env, "mastodon", "0");
ok(r && r.slug === "launch", "a queued curated thread still goes first", r);
const p = await mod.pickPaperRow({ DB: { prepare: () => ({ bind() { return this; }, async all() { throw new Error("no table"); } }) } }, "x");
ok(p === null, "an unreadable tracker yields no paper (threads are used)");
ok(mod.PAPER_PROMOTE_DAYS === 30, "papers are promoted for 30 days after publication");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
