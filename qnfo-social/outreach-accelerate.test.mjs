// OUTREACH-ACCELERATE-1 offline suite (qnfo-social 0.15.0, pillar reach). Proves: the attention share steers between the floor and
// the cap (share 0 keeps half the cap at the default floor; no floor keeps the old scaling); the defaults are Bluesky 14 and the
// Buffer channels LinkedIn 7, Mastodon 14, X 14, Substack 14; a Substack channel connected in Buffer is found and gets the long text
// with the subscribe line; MASTODON-DIRECT-1 posts to the instance API with the token and records the status link, and without the
// token the Buffer channel is used; BSKY-SPACING-1 holds a Bluesky post inside 7 days / cap minus 1 h of the last one.
// Run: node qnfo-social/outreach-accelerate.test.mjs
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

// shareCap with a floor
ok(mod.shareCap(14, 0, 0.5) === 7 && mod.shareCap(14, 0.5, 0.5) === 10 && mod.shareCap(14, 1, 0.5) === 14, "floor 0.5: share 0 -> 7, 0.5 -> 10, 1 -> 14 of 14");
ok(mod.shareCap(14, 0) === 1 && mod.shareCap(14, 0, null) === 1 && mod.shareCap(0, 0, 0.5) === 0, "no floor keeps the old scaling; cap 0 stays 0");
ok(mod.shareCap(14, 0, 2) === 14 && mod.shareCap(14, 0, -1) === 1, "a floor above 1 is 1, below 0 is 0");

// defaults
ok(mod.weeklyCap({}) === 14 && mod.weeklyCap({ SOCIAL_WEEKLY_CAP: "3" }) === 3, "Bluesky defaults to 14 a week; the env var still overrides");
ok(mod.CHANNEL_WEEKLY_CAP.linkedin === 7 && mod.CHANNEL_WEEKLY_CAP.mastodon === 14 && mod.CHANNEL_WEEKLY_CAP.twitter === 14 && mod.CHANNEL_WEEKLY_CAP.substack === 14, "Buffer defaults 7/14/14/14", mod.CHANNEL_WEEKLY_CAP);
ok(mod.CHANNEL_ORDER.indexOf("substack") >= 0 && mod.CHANNEL_PLATFORM.substack === "buffer-substack", "Substack is a drain channel with its own ledger platform");

// Substack channel lookup and text
const chans = [{ id: "a", service: "linkedin" }, { id: "b", service: "substack_notes", isDisconnected: false }, { id: "c", service: "twitter", isDisconnected: true }];
ok(mod.findChannel(chans, "substack").id === "b" && mod.findChannel(chans, "linkedin").id === "a" && mod.findChannel(chans, "twitter") === null && mod.findChannel(chans, "mastodon") === null, "findChannel matches Substack by substring and skips disconnected channels");
const posts = ["First sentence of the thread about energy per answer.", "Second post with more detail.", "Read it: https://papers.qnfo.org/papers/x/"];
const sub = mod.channelText("substack", posts, "https://papers.qnfo.org/papers/x/", "X"), mas = mod.channelText("mastodon", posts, "https://papers.qnfo.org/papers/x/", "X");
ok(sub.indexOf("Second post") >= 0 && sub.endsWith(mod.SUBSCRIBE_LINE) && sub.length <= 1300, "Substack gets the whole thread and the subscribe line", sub);
ok(mas.length <= 280 && mas.indexOf(mod.SUBSCRIBE_LINE) < 0, "Mastodon keeps the 280-character fit");

// Mastodon direct
const calls = [];
globalThis.fetch = async (u, init) => {
  calls.push({ u: String(u), init: init || {} });
  if (String(u) === "https://mstdn.science/api/v1/statuses" && init && init.method === "POST") return new Response(JSON.stringify({ id: "1133", url: "https://mstdn.science/@QNFO/1133" }), { status: 200 });
  if (String(u) === "https://mstdn.science/api/v1/statuses/1133") return new Response(JSON.stringify({ favourites_count: 4, reblogs_count: 2, replies_count: 1 }), { status: 200 });
  if (String(u).indexOf("https://example.social/") === 0) return new Response("forbidden", { status: 403 });
  return new Response("nf", { status: 404 });
};
let r = await mod.channelCreate({ MASTODON_TOKEN: "t0k" }, { id: "mastodon-direct", service: "mastodon" }, "mastodon", "hello https://papers.qnfo.org/papers/x/?utm_source=mastodon", "publish");
const post = calls.find((c) => c.init.method === "POST");
ok(r.status === "ok" && r.post_id === "1133" && r.url === "https://mstdn.science/@QNFO/1133" && r.via === "mastodon-direct", "direct post returns the status id and link", r);
ok(post && post.init.headers.Authorization === "Bearer t0k" && /status=hello/.test(post.init.body) && /visibility=public/.test(post.init.body) && post.init.headers["Idempotency-Key"].length === 40, "token, public visibility and an idempotency key", post && post.init);
r = await mod.mastodonCreate({ MASTODON_TOKEN: "t", MASTODON_HOST: "example.social" }, "x");
ok(r.status === "error" && /mastodon 403/.test(r.error), "a refused post is an error with the status, never ok", r);

// The drain posts Mastodon direct (no Buffer createPost) and records the link; Substack goes through Buffer.
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT, posted_at TEXT, flags TEXT, notes TEXT, doi TEXT, error TEXT, updated_at TEXT, post_uri TEXT, retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT, _version INTEGER DEFAULT 1);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_title TEXT, paper_doi TEXT, pages_url TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT, created_at TEXT, updated_at TEXT, post_text_snippet TEXT);
CREATE TABLE social_engagements (platform TEXT, post_id TEXT, metric TEXT, value REAL, note TEXT, collected_at TEXT, PRIMARY KEY (platform, post_id, metric, collected_at));
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, level TEXT, message TEXT);
INSERT INTO social_threads (slug, title, posts, status, flags) VALUES ('jps', 'Joules per solution', '["Energy per useful answer, one number. https://papers.qnfo.org/papers/jps/"]', 'queued', 'selected');`);
function stmtOn(sql) {
  let args = [];
  const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const q = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(q.changes) } }; } };
  return s;
}
const D1 = { prepare: stmtOn, async batch(list) { const out = []; for (const x of list) out.push(await x.run()); return out; } };
const gql = [];
globalThis.fetch = async (u, init) => {
  const url = String(u);
  if (url === "https://api.buffer.com") {
    const q = JSON.parse(init.body).query; gql.push(q);
    if (q.indexOf("organizations") >= 0) return new Response(JSON.stringify({ data: { account: { organizations: [{ id: "o1" }] } } }), { status: 200 });
    if (q.indexOf("channels(") >= 0) return new Response(JSON.stringify({ data: { channels: [{ id: "chS", service: "substack", isDisconnected: false }, { id: "chM", service: "mastodon", isDisconnected: false }] } }), { status: 200 });
    if (q.indexOf("createPost") >= 0) return new Response(JSON.stringify({ data: { createPost: { post: { id: "bS1", status: "sent" } } } }), { status: 200 });
  }
  if (url === "https://mstdn.science/api/v1/statuses") return new Response(JSON.stringify({ id: "1133", url: "https://mstdn.science/@QNFO/1133" }), { status: 200 });
  if (url === "https://mstdn.science/api/v1/statuses/1133") return new Response(JSON.stringify({ favourites_count: 4, reblogs_count: 2, replies_count: 1 }), { status: 200 });
  if (url.indexOf("https://papers.qnfo.org/") === 0) return new Response("<html>paper</html>", { status: 200 });
  return new Response("nf", { status: 404 });
};
const env = { DB: D1, BUFFER_TOKEN: "b", MASTODON_TOKEN: "m" };
const out = await mod.drainChannels(env, {});
ok(/^posted:ok:jps:1133$/.test(out.channels.mastodon || ""), "Mastodon posted direct", out.channels);
ok(/^posted:ok:jps:bS1$/.test(out.channels.substack || ""), "Substack posted through Buffer", out.channels);
ok(gql.filter((q) => q.indexOf("createPost") >= 0 && q.indexOf("chM") >= 0).length === 0 && gql.some((q) => q.indexOf("createPost") >= 0 && q.indexOf("chS") >= 0 && q.indexOf("utm_source=substack") >= 0), "no Buffer post on the Mastodon channel; the Substack post is tagged utm_source=substack");
const led = db.prepare("SELECT platform, buffer_id, url, engagement_metrics FROM social_media_posts ORDER BY platform").all();
ok(led.length === 2 && led[0].platform === "buffer-mastodon" && led[0].url === "https://mstdn.science/@QNFO/1133" && /mastodon-direct/.test(led[0].engagement_metrics) && led[1].platform === "buffer-substack", "ledger rows: Mastodon with its status link and transport, Substack", led);
const st = await mod.mastodonDirectStats(env);
const eng = db.prepare("SELECT metric, value FROM social_engagements WHERE platform = 'buffer' AND post_id = '1133' ORDER BY metric").all();
ok(st.posts === 1 && eng.length === 3 && eng.find((x) => x.metric === "favourites").value === 4, "07:00 reads the direct post's public counts", { st, eng });
// Without the token the Buffer Mastodon channel is used.
db.exec("DELETE FROM social_media_posts; INSERT INTO social_threads (slug, title, posts, status, flags) VALUES ('qec', 'QEC floor', '[\"Error correction has an energy floor. https://papers.qnfo.org/papers/qec/\"]', 'queued', 'selected')");
gql.length = 0;
const out2 = await mod.drainChannels({ DB: D1, BUFFER_TOKEN: "b" }, {});
ok(/^posted:ok:/.test(out2.channels.mastodon || "") && gql.some((q) => q.indexOf("createPost") >= 0 && q.indexOf("chM") >= 0), "no token: Mastodon goes through Buffer", out2.channels);

// Bluesky spacing
db.exec("INSERT INTO social_threads (slug, title, posts, status, posted_at) VALUES ('old', 't', '[]', 'posted', datetime('now', '-3 hours'))");
let sp = await mod.blueskySpacing(env, 14, Date.now());
ok(sp.wait === true && /Z$/.test(sp.next), "a post 3 h ago holds the next at cap 14 (gap 11 h)", sp);
db.exec("UPDATE social_threads SET posted_at = datetime('now', '-12 hours') WHERE slug = 'old'");
sp = await mod.blueskySpacing(env, 14, Date.now());
ok(sp.wait === false, "12 h later the next may go", sp);
db.exec("INSERT INTO pipeline_flags VALUES ('social_share_floor', '0.25', NULL)");
const sh = await mod.attentionShares(env);
ok(sh.floor === 0.25 && sh.substack === 1, "pipeline_flags.social_share_floor sets the floor; Substack defaults to share 1", sh);

console.log(`outreach-accelerate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
