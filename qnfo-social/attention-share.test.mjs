// ATTENTION-SHARE-1 offline suite (qnfo-social 0.8.0, pillar reach; owner directive 2026-10-06 07:44Z). Drives the share
// reader, the effective-cap rule, the noticed-first ordering of the channel drain, the Bluesky gate and the learner's
// daily credit against an in-memory SQLite D1. Proves: a share scales a cap down and never up, a positive share keeps one
// slot, share 0 holds every post on that channel (held:attention-stop) and on Bluesky (attention-stop), a stale share row
// reads as 1, posted rows go noticed-first while queued selected rows stay ahead, a failed read keeps the old order, and a
// pending learner post whose 72h window closed is credited daily (not only on the weekly update) using the bot-filtered
// rows when present.
// Run: node qnfo-social/attention-share.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT, engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_doi TEXT, paper_title TEXT, pages_url TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, level TEXT, message TEXT);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT, post_id TEXT, metric TEXT, value REAL, note TEXT, collected_at TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));
-- thread 203 sits one hour inside the gate's 7-day window (ATTENTION-SHARE-FLAKE-1, GitHub 733): at exactly -7 days it fell
-- out whenever a second ticked between this insert and the gate's datetime('now','-7 days'), and posted_7d read 2.
INSERT INTO social_threads (id, slug, title, posts, status, flags, notes, posted_at, post_uri) VALUES
  (201, 'quiet-one', 'Quiet', '["Quiet paper https://papers.qnfo.org/papers/quiet-one/"]', 'posted', NULL, NULL, datetime('now','-3 days'), 'at://did:plc:q/app.bsky.feed.post/q1'),
  (202, 'noticed-one', 'Noticed', '["Noticed paper https://papers.qnfo.org/papers/noticed-one/"]', 'posted', NULL, NULL, datetime('now','-5 days'), '{"bluesky":"at://did:plc:q/app.bsky.feed.post/n1","mastodon":"buffer:zz"}'),
  (203, 'liked-one', 'Liked', '["Liked paper https://papers.qnfo.org/papers/liked-one/"]', 'posted', NULL, NULL, datetime('now','-6 days','-23 hours'), 'at://did:plc:q/app.bsky.feed.post/l1'),
  (204, 'launch', 'Launch', '["Launch https://papers.qnfo.org/papers/launch/"]', 'queued', 'selected', 'selected: launch queue', NULL, NULL);
INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES
  (date('now','-2 days'), 'cf-rum-human', 'web', 'paper', 'noticed-one', 'external_pageviews', 12, 'human'),
  (date('now','-2 days'), 'bluesky', 'bluesky', 'post', 'at://did:plc:q/app.bsky.feed.post/l1', 'likes', 3, 'human'),
  (date('now','-2 days'), 'bluesky', 'bluesky', 'post', 'at://did:plc:q/app.bsky.feed.post/l1', 'reposts', 1, 'human');`);
function stmtOn(sql) {
  let args = [];
  const s = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  };
  return s;
}
const env = { DB: { prepare: (sql) => stmtOn(sql), async batch(list) { for (const s of list) await s.run(); return []; } }, SOCIAL_WEEKLY_CAP: "2" };

// ---------- the pure cap rule ----------
ok(mod.shareCap(3, 1) === 3 && mod.shareCap(3, 0.5) === 1 && mod.shareCap(2, 0.25) === 1 && mod.shareCap(3, 0) === 1 && mod.shareCap(0, 1) === 0, "a share scales the cap down; a positive share keeps one slot; 0 is 0");
ok(mod.shareCap(3, 1.7) === 3 && mod.shareCap(3, "x") === 3 && mod.shareCap(3, -1) === 1, "a share above 1 or unreadable is 1 (never above the owner cap); a negative share is 0");

// ---------- the share reader ----------
let sh = await mod.attentionShares(env);
ok(sh.bluesky === 1 && sh.linkedin === 1 && sh.twitter === 1 && sh.source === "default", "no share row: every channel at 1");
db.prepare("INSERT INTO ops_config (key, value, updated_at) VALUES ('attention_channel_share', ?, ?)").run(JSON.stringify({ bluesky: 0, linkedin: 1, mastodon: 0.5, x: 0.25, day: "2026-10-06" }), new Date().toISOString());
sh = await mod.attentionShares(env);
ok(sh.bluesky === 0 && sh.linkedin === 1 && sh.mastodon === 0.5 && sh.twitter === 0.25 && sh.day === "2026-10-06" && sh.source === "ops_config", "the share row is read; x maps to the twitter channel key");
db.prepare("UPDATE ops_config SET updated_at = ? WHERE key = 'attention_channel_share'").run(new Date(Date.now() - 4 * 864e5).toISOString());
sh = await mod.attentionShares(env);
ok(sh.bluesky === 1 && sh.twitter === 1 && sh.source === "stale-default", "a share row older than 3 days reads as 1 everywhere (a dead scorecard never silences a channel)");
db.prepare("UPDATE ops_config SET updated_at = ? WHERE key = 'attention_channel_share'").run(new Date().toISOString().replace("T", " ").slice(0, 19));
sh = await mod.attentionShares(env);
ok(sh.bluesky === 0 && sh.source === "ops_config", "a D1 datetime('now') timestamp is read as UTC");

// ---------- the Bluesky gate ----------
let g = await mod.socialGate(env, "test");
ok(g.reason !== "attention-stop" && g.cap >= 1, "Bluesky share 0 no longer holds every post (Q08-OPEN-1): " + JSON.stringify(g));
db.prepare("UPDATE ops_config SET value = ? WHERE key = 'attention_channel_share'").run(JSON.stringify({ bluesky: 0.25, linkedin: 1, mastodon: 1, x: 1, day: "2026-10-06" }));
g = await mod.socialGate(env, "test");
ok(g.cap === 1 && g.reason === "weekly-cap", "Bluesky at a quarter share of cap 2 keeps one slot a week (the re-test); this week's three posts already fill it");
db.prepare("UPDATE ops_config SET value = ? WHERE key = 'attention_channel_share'").run(JSON.stringify({ bluesky: 1, linkedin: 1, mastodon: 1, x: 1, day: "2026-10-06" }));
g = await mod.socialGate(env, "test");
ok(g.cap === 2 && g.reason === "weekly-cap" && g.posted_7d === 3, "share 1 is the owner cap exactly (2); the three posts of the week hold the queue by the count, not the share");

// ---------- noticed-first ordering ----------
const rows = (await env.DB.prepare("SELECT id, slug, title, posts, status, doi, notes, flags, posted_at, post_uri FROM social_threads ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, posted_at DESC").all()).results;
const ordered = await mod.attentionOrder(env, rows);
ok(ordered[0].slug === "launch", "queued selected rows stay ahead of every posted row");
ok(ordered.slice(1).map((r) => r.slug).join(",") === "noticed-one,liked-one,quiet-one", "posted rows go noticed-first: 12 external loads, then 4 Bluesky engagements, then nothing: " + ordered.slice(1).map((r) => r.slug + ":" + r.attention).join(","));
ok(ordered.find((r) => r.slug === "noticed-one").attention === 12 && ordered.find((r) => r.slug === "liked-one").attention === 4, "the attention score is kept on the row");
const broken = { DB: { prepare: (sql) => (/reach_signals/.test(sql) ? { bind() { return this; }, async all() { throw new Error("no such table"); } } : stmtOn(sql)) } };
const kept = await mod.attentionOrder(broken, rows);
ok(kept.map((r) => r.slug).join(",") === rows.map((r) => r.slug).join(","), "a failed ledger read keeps the incoming order");
const picked = await mod.pickChannelRow(env, "linkedin", "0");
ok(picked && picked.slug === "launch", "pickChannelRow still hands the queued launch row to a channel first");
db.prepare("UPDATE social_threads SET status = 'posted', posted_at = datetime('now','-1 days'), post_uri = 'at://did:plc:q/app.bsky.feed.post/la' WHERE id = 204").run();
db.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, published_at, status) VALUES ('c1', 'buffer-linkedin', 'bb', 'bb', 'launch', datetime('now','-1 days'), 'published')").run();
const picked2 = await mod.pickChannelRow(env, "linkedin", "0");
ok(picked2 && picked2.slug === "noticed-one", "with every row posted and the launch row already carried, the noticed paper goes to LinkedIn next");

// ---------- the channel drain honours the shares ----------
let calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url), body = init && init.body ? String(init.body) : "";
  calls.push({ u, body });
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u === "https://api.buffer.com") {
    if (body.includes("organizations")) return J({ data: { account: { organizations: [{ id: "org1" }] } } });
    if (body.includes("channels(")) return J({ data: { channels: [{ id: "chL", service: "linkedin", isDisconnected: false }, { id: "chM", service: "mastodon", isDisconnected: false }, { id: "chT", service: "twitter", isDisconnected: false }] } });
    if (body.includes("createPost")) return J({ data: { createPost: { post: { id: "bp" + calls.length, status: "sent" } } } });
  }
  if (u.startsWith("https://papers.qnfo.org/")) return new Response("<html>paper</html>", { status: 200 });
  return new Response("nf", { status: 404 });
};
db.prepare("UPDATE ops_config SET value = ? WHERE key = 'attention_channel_share'").run(JSON.stringify({ bluesky: 1, linkedin: 0, mastodon: 1, x: 0.5, day: "2026-10-06" }));
const envB = Object.assign({}, env, { BUFFER_TOKEN: "buf" });
const d = await mod.drainChannels(envB, {});
ok(d.channels.linkedin !== "held:attention-stop", "LinkedIn at share 0 is no longer held as attention-stop: " + d.channels.linkedin);
ok(d.shares && d.shares.linkedin === 0 && d.shares.twitter === 0.5, "the drain reports the shares it applied");
ok(/^posted:/.test(String(d.channels.mastodon)) && /^posted:/.test(String(d.channels.twitter)), "Mastodon (share 1) and X (share 0.5 of 2: one slot) post: " + d.channels.mastodon + " / " + d.channels.twitter);

// ---------- the learner credits closed windows daily ----------
await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_learner_posts (post_key TEXT PRIMARY KEY, slug TEXT, bsky_uri TEXT, link_slug TEXT, topic TEXT, format TEXT, slot TEXT, n_posts INTEGER, posted_at TEXT, chosen_by TEXT, decision TEXT, status TEXT, engagement REAL, visits REAL, reward REAL, reward_detail TEXT, credited_at TEXT, created_at TEXT)").run();
// the threads the channel posts name carry a selected DOI, so their channel posts are arms (topic energy)
db.prepare("UPDATE social_threads SET doi = '10.5281/zenodo.21637028' WHERE id IN (203, 204)").run();
const posted = new Date(Date.now() - 5 * 864e5);
const d0 = posted.toISOString().slice(0, 10);
db.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at) VALUES ('thread:203', 'liked-one', 'at://did:plc:q/app.bsky.feed.post/l1', 'liked-one', 'energy', 'single', 'us-morning', 1, ?, 'learner', 'pending', ?)").run(posted.toISOString(), posted.toISOString());
db.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at) VALUES ('thread:201', 'quiet-one', 'at://did:plc:q/app.bsky.feed.post/q1', 'quiet-one', 'energy', 'single', 'us-morning', 1, ?, 'learner', 'pending', ?)").run(new Date(Date.now() - 36e5).toISOString(), new Date().toISOString());
const snapDay = new Date(posted.getTime() + 2 * 864e5).toISOString().slice(0, 10);
db.prepare("INSERT INTO social_engagements (platform, post_id, metric, value, note, collected_at) VALUES ('bluesky', 'at://did:plc:q/app.bsky.feed.post/l1', 'likes', 3, 't', ?), ('bluesky', 'at://did:plc:q/app.bsky.feed.post/l1', 'reposts', 1, 't', ?), ('bluesky', 'at://did:plc:q/app.bsky.feed.post/l1', 'replies', 0, 't', ?), ('bluesky', 'at://did:plc:q/app.bsky.feed.post/l1', 'quotes', 0, 't', ?)").run(snapDay, snapDay, snapDay, snapDay);
// bot-filtered site and paper rows for the window and a 3-day baseline (human source only)
const shift = (n) => new Date(posted.getTime() + n * 864e5).toISOString().slice(0, 10);
for (let k = -7; k <= 2; k++) { db.prepare("INSERT OR IGNORE INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'cf-rum-human', 'web', 'site', '(all)', 'pageviews', 100, 'human')").run(shift(k)); db.prepare("INSERT OR IGNORE INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'cf-rum-human', 'web', 'paper', 'liked-one', 'pageviews', ?, 'human')").run(shift(k), k >= 0 ? 10 : 2); }
const credit = await mod.learnerDailyCredit(env, Date.now());
ok(credit.credited === 1 && credit.waiting === 4 && credit.pending === 4, "the post whose 72h window closed is credited; the one posted an hour ago, the day-old LinkedIn channel post and the drain's two Buffer posts above wait: " + JSON.stringify({ c: credit.credited, w: credit.waiting, p: credit.pending }));
const row = db.prepare("SELECT status, engagement, visits, reward, reward_detail FROM social_learner_posts WHERE post_key = 'thread:203'").get();
ok(row.status === "credited" && row.engagement === 4 && row.visits === 24 && row.reward > 0.9, "credited with 4 engagements and 24 extra human views (30 in the window minus 3 x 2 baseline): " + JSON.stringify(row));
ok(/"source":"cf-rum-human"/.test(row.reward_detail), "the visit figure names the bot-filtered source");
const led = db.prepare("SELECT status FROM cloud_ops_events WHERE id LIKE 'social-learner-credit-%'").get();
ok(led && led.status === "ok", "the daily credit records its run ledger row");
const again = await mod.learnerDailyCredit(env, Date.now());
ok(again.credited === 0, "a credited post is never credited twice");
const vis = await mod.learnerVisits(env, "nowhere", "2025-01-01");
ok(vis.visits === null && /not ingested/.test(vis.status) && vis.source === "cf-rum", "with no human rows for the window the unfiltered rows are tried and the status says which source");
const visH = await mod.learnerVisits(env, "nowhere", d0);
ok(visH.visits === 0 && visH.status === "ok" && visH.source === "cf-rum-human", "a slug with human site rows but no loads reads 0 visits from the bot-filtered source (a measured zero, not a missing day)");


// ---------- LEARNER-CHANNEL-ARM-1: Buffer channel posts teach a channel arm ----------
const chRow = db.prepare("SELECT post_key, channel, buffer_id, topic, format, slot, status, chosen_by FROM social_learner_posts WHERE post_key = 'channel:c1'").get();
ok(chRow && chRow.channel === "linkedin" && chRow.buffer_id === "bb" && chRow.status === "pending" && chRow.chosen_by === "channel-drain" && chRow.format === "single", "a LinkedIn channel post becomes a learner row with the channel, the Buffer id and the thread's arms: " + JSON.stringify(chRow));
ok(db.prepare("SELECT COALESCE(channel, 'bluesky') AS ch FROM social_learner_posts WHERE post_key = 'thread:203'").get().ch === "bluesky", "rows without a channel (written before 0.8.1) read as Bluesky rows");
// an X post five days ago with Buffer metrics inside its window: credited from the buffer rows
const xPosted = new Date(Date.now() - 3 * 864e5 - 4 * 36e5);   // after LEARNER_EPOCH_SQL, window closed 4h ago
db.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, published_at, status) VALUES ('x9', 'buffer-twitter', 'bx9', 'bx9', 'liked-one', ?, 'published')").run(xPosted.toISOString().replace("T", " ").slice(0, 19));
const xDay = new Date(xPosted.getTime() + 864e5).toISOString().slice(0, 10);
db.prepare("INSERT OR IGNORE INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'buffer', 'x', 'post', 'bx9', 'reactions', 3, 'human'), (?, 'buffer', 'x', 'post', 'bx9', 'comments', 1, 'human'), (?, 'buffer', 'x', 'post', 'bx9', 'impressions', 240, 'human')").run(xDay, xDay, xDay);
// UTM-VISITS-1 (0.8.2): the gateway counted 7 human and 3 bot tagged loads of liked-one from X inside the window
db.prepare("INSERT OR IGNORE INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'utm', 'x', 'campaign', 'liked-one', 'clicks_human', 7, 'human'), (?, 'utm', 'x', 'campaign', 'liked-one', 'clicks_bot', 3, 'bot')").run(xDay, xDay);
const xD0 = xPosted.toISOString().slice(0, 10);
const vu = await mod.learnerVisits(env, "liked-one", xD0, "x");
ok(vu.visits === 7 && vu.source === "utm" && vu.bot_clicks === 3 && vu.status === "ok" && vu.channel === "x", "UTM-VISITS-1: tagged loads for the post's channel inside its window are its visits (bots apart)", vu);
const vb = await mod.learnerVisits(env, "liked-one", xD0, "bluesky");
ok(vb.source !== "utm", "a channel with no tagged load inside the window falls back to the RUM lift: " + JSON.stringify(vb));
ok((await mod.learnerVisits(env, "liked-one", xD0)).visits === 7, "without a channel every channel's tagged loads count");
const credit2 = await mod.learnerDailyCredit(env, Date.now());
const xRow = db.prepare("SELECT status, engagement, reward, reward_detail FROM social_learner_posts WHERE post_key = 'channel:x9'").get();
ok(credit2.credited === 1 && xRow && xRow.status === "credited" && xRow.engagement === 4 && xRow.reward > 0.8, "the X channel post is credited from its Buffer metrics (3 reactions + 1 comment): " + JSON.stringify(xRow));
const xVis = xRow && JSON.parse(xRow.reward_detail).visits;
ok(xVis && xVis.visits === 7 && xVis.source === "utm" && xVis.channel === "x" && xVis.bot_clicks === 3, "the credited X post's visits are its tagged loads (source utm, channel x, bots apart)", xVis);
ok(xRow && xRow.reward_detail && (/"channel":"x"/.test(xRow.reward_detail) || /"impressions":240/.test(xRow.reward_detail) || /buffer/.test(xRow.reward_detail)), "the credit detail names the channel's metrics: " + (xRow && xRow.reward_detail));
const post = await mod.learnerPosterior(env);
ok(post.channel && post.channel.x.n === 1 && post.channel.bluesky.n === 1 && post.channel.linkedin.n === 0 && post.channel.x.a > 1.8, "the posterior carries a channel dimension credited per channel: " + JSON.stringify(post.channel));
const ord = await mod.learnerChannelOrder(env, () => 0.5);
ok(ord.via === "learner" && ord.order.length === 3 && ord.order.slice().sort().join() === "linkedin,mastodon,twitter" && typeof ord.draws.twitter === "number", "the channel order is a permutation of the drain channels with one draw each: " + JSON.stringify(ord));
db.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('social_learner_enabled', '0')").run();
const ordOff = await mod.learnerChannelOrder(env);
ok(ordOff.via === "learner-off" && ordOff.order.join() === "linkedin,mastodon,twitter", "with the learner off the drain keeps its fixed order");
db.prepare("DELETE FROM ops_config WHERE key = 'social_learner_enabled'").run();

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
