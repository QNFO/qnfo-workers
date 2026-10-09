// DAILY-DISTRIBUTION-1 offline suite (qnfo-social 0.7.37, pillar reach; owner directive 2026-10-06 "persistent, routine,
// daily" outreach). Drives drainChannels, bufferPost and channelText against an in-memory SQLite D1 with a stubbed Buffer.
// Proves: each Buffer channel has its own weekly cap (LinkedIn 3, Mastodon 2, X 2) counted from its own ledger plus the
// Bluesky cross-posts; posts are spaced over the week; the queued launch rows reach LinkedIn first with the subscribe
// offer; a channel never carries a slug twice in 30 days and bufferPost honours the same rule; the pause flag and
// pipeline_flags.social_channel_caps hold; the tick runs the drain after the Bluesky drains and records it.
// Run: node qnfo-social/daily-distribution.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, level TEXT, message TEXT);
INSERT INTO social_threads (id, slug, title, posts, status, flags, notes) VALUES
  (149, 'jps-metric', 'Joules per solution', '["JPS: energy per useful answer, one number for every platform. Claim, test, status. https://papers.qnfo.org/papers/joules-per-solution-metric/", "Second post: the test is a measured run, not a model."]', 'queued', 'selected', 'selected: STRATEGY-1 launch queue post 1'),
  (150, 'qec-landauer', 'QEC and the Landauer floor', '["Error correction has an energy floor. https://papers.qnfo.org/papers/qec-landauer/"]', 'queued', 'selected', 'selected: STRATEGY-1 launch queue post 2'),
  (160, 'not-selected', 'Not selected', '["Plain queued row https://papers.qnfo.org/papers/not-selected/"]', 'queued', NULL, NULL),
  (161, 'q08-abc', 'q08 essay', '["Essay https://q08.org/p/2026-10-01-x"]', 'posted', NULL, NULL);
UPDATE social_threads SET posted_at = datetime('now','-1 days') WHERE id = 161;
INSERT INTO social_threads (id, slug, title, posts, status, flags, notes, posted_at, post_uri) VALUES
  (152, 'fleet-lessons', 'Fleet lessons', '["Running a research fleet: what broke. https://papers.qnfo.org/papers/quniverse-fleet-lessons/"]', 'posted', 'selected', 'selected: launch queue post 4', datetime('now','-3 days'), '{"bluesky":"at://did:plc:me/app.bsky.feed.post/a","mastodon":"buffer:m152","linkedin":"buffer:l152","x":"buffer:x152"}'),
  (154, 'living-papers', 'Living papers', '["Living papers: every claim versioned. https://papers.qnfo.org/papers/living-papers/"]', 'posted', 'selected', 'selected: owner-approved launch', datetime('now','-4 days'), '{"bluesky":"at://did:plc:me/app.bsky.feed.post/b","mastodon":"buffer:m154","linkedin":"buffer:l154","x":"buffer:x154"}');`);
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
const env = { DB: { prepare: (sql) => stmtOn(sql), async batch(list) { for (const s of list) await s.run(); return []; } }, BUFFER_TOKEN: "buf", BSKY_HANDLE: "qnfo.bsky.social", BSKY_APP_PASS: "x" };
let calls = [];
let nextId = 1;
globalThis.fetch = async (url, init) => {
  const u = String(url), body = init && init.body ? String(init.body) : "";
  calls.push({ u, body });
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u === "https://api.buffer.com") {
    if (body.includes("organizations")) return J({ data: { account: { organizations: [{ id: "org1" }] } } });
    if (body.includes("channels(")) return J({ data: { channels: [{ id: "chL", service: "linkedin", isDisconnected: false }, { id: "chM", service: "mastodon", isDisconnected: false }, { id: "chT", service: "twitter", isDisconnected: false }] } });
    if (body.includes("createPost")) { const id = "bp" + (nextId++); return J({ data: { createPost: { post: { id, status: body.includes("chL") ? "queued" : "sent" } } } }); }
  }
  if (u.startsWith("https://papers.qnfo.org/")) return new Response("<html>paper</html>", { status: 200 });
  return new Response("nf", { status: 404 });
};
const createPosts = () => calls.filter((c) => c.body.includes("createPost")).map((c) => c.body);

// ---------- channelText ----------
const li = mod.channelText("linkedin", ["First post. https://papers.qnfo.org/papers/x/", "Second post."], "https://papers.qnfo.org/papers/x/", "T");
ok(li.indexOf("First post.") === 0 && li.indexOf("Second post.") > 0 && li.endsWith(mod.SUBSCRIBE_LINE) && Array.from(li).length <= 1300, "LinkedIn text is the whole thread plus the subscribe line, inside 1300 characters");
const ma = mod.channelText("mastodon", ["First post with enough words to be a sentence. https://papers.qnfo.org/papers/x/", "Second post."], "https://papers.qnfo.org/papers/x/", "T");
ok(Array.from(ma).length <= 280 && ma.indexOf(mod.SUBSCRIBE_LINE) < 0, "Mastodon text is the 280-character pick without the subscribe line");

// The scenarios below were written for the pre-Q08-OPEN-1 caps; pin them through the override the drain reads.
db.exec("INSERT OR REPLACE INTO pipeline_flags (key, value) VALUES ('social_channel_caps', '{\"linkedin\":3,\"mastodon\":2,\"twitter\":2}');");
// ---------- run 1: LinkedIn has room (2 cross-posts of 3), the mirrors are at their cap ----------
let r = await mod.drainChannels(env);
ok(r.posted === 1 && /^posted:queued:jps-metric:bp1$/.test(r.channels.linkedin), "run 1: LinkedIn gets the oldest queued selected row (jps-metric) through the Buffer queue: " + JSON.stringify(r.channels));
ok(/^held:weekly-cap\(2\/2\)/.test(r.channels.mastodon) && /^held:weekly-cap\(2\/2\)/.test(r.channels.twitter), "run 1: Mastodon and X are held at their weekly cap by the two Bluesky cross-posts: " + JSON.stringify(r.channels));
let cp = createPosts();
ok(cp.length === 1 && cp[0].includes("chL") && cp[0].includes("mode: addToQueue") && !cp[0].includes("shareNow"), "LinkedIn post goes to the Buffer queue (publish mode)");
ok(cp[0].includes("utm_source=linkedin") && cp[0].includes("utm_campaign=jps-metric") && cp[0].includes("Second post") && cp[0].includes("https://qnfo.org/?utm_source=linkedin"), "LinkedIn text carries the whole thread, per-channel UTM and the tagged subscribe link");
let led = db.prepare("SELECT platform, project_id, post_id, status FROM social_media_posts").all();
ok(led.length === 1 && led[0].platform === "buffer-linkedin" && led[0].project_id === "jps-metric" && led[0].post_id === "bp1", "the channel post is recorded in social_media_posts (platform buffer-linkedin, project_id slug)");
ok(db.prepare("SELECT status FROM social_threads WHERE id=149").get().status === "queued", "the queued row stays queued for Bluesky (its status is never changed here)");

// ---------- run 2 right after: LinkedIn is at its cap (2 cross-posts + its own post) ----------
r = await mod.drainChannels(env);
ok(r.posted === 0 && /^held:weekly-cap\(3\/3\)/.test(r.channels.linkedin), "run 2: LinkedIn is held at 3/3 (two Bluesky cross-posts plus its own post): " + r.channels.linkedin);

// ---------- run 3: a week later the mirrors have room; LinkedIn skips the slug it already carried ----------
db.exec("UPDATE social_threads SET posted_at = datetime('now','-9 days') WHERE id IN (152, 154); UPDATE social_media_posts SET published_at = datetime('now','-3 days');");
calls = [];
r = await mod.drainChannels(env);
ok(r.posted === 3, "run 3: all three channels post: " + JSON.stringify(r.channels));
ok(/^posted:queued:qec-landauer:/.test(r.channels.linkedin), "LinkedIn takes the next queued row, not jps-metric again (carried 3 days ago)");
ok(/^posted:ok:jps-metric:/.test(r.channels.mastodon) && /^posted:ok:jps-metric:/.test(r.channels.twitter), "Mastodon and X take jps-metric (never carried there) and share now");
cp = createPosts();
ok(cp.some((b) => b.includes("chM") && b.includes("shareNow") && b.includes("utm_source=mastodon")) && cp.some((b) => b.includes("chT") && b.includes("shareNow") && b.includes("utm_source=x")), "Mastodon and X posts share now with their own utm_source");
ok(!cp.some((b) => /2026-10-01-x/.test(b) || /not-selected/.test(b)), "q08 rows (slug q08-abc, essay 2026-10-01-x) and unselected queued rows are never chosen");
ok(cp.filter((b) => b.includes("chM")).every((b) => !b.includes(mod.SUBSCRIBE_LINE.split(" ")[0] + " notes by email")), "short channels carry no subscribe line");
ok(calls.filter((c) => c.body.includes("organizations")).length === 1, "the Buffer organisation and channels are read once per run");

// ---------- run 4 right after run 3: every channel that just posted is held by spacing ----------
r = await mod.drainChannels(env);
ok(r.posted === 0 && /^held:spacing/.test(r.channels.linkedin) && /^held:spacing/.test(r.channels.mastodon) && /^held:spacing/.test(r.channels.twitter), "run 4: the 7d/cap spacing holds every channel that just posted: " + JSON.stringify(r.channels));

// ---------- bufferPost (the Bluesky cross-post) skips channels that already carry the slug ----------
calls = [];
const bp = await mod.bufferPost(env, "JPS: energy per useful answer. https://papers.qnfo.org/papers/joules-per-solution-metric/", "jps-metric");
ok(bp.results.every((x) => x.status === "skipped" && /carried-30d/.test(x.reason)) && createPosts().length === 0, "bufferPost skips every channel that carried jps-metric in 30 days: " + JSON.stringify(bp.results));
const bp2 = await mod.bufferPost(env, "New slug. https://papers.qnfo.org/papers/new-one/", "new-one");
ok(bp2.results.filter((x) => x.post_id).length === 3 && db.prepare("SELECT COUNT(*) AS n FROM social_media_posts WHERE project_id='new-one'").get().n === 3, "bufferPost still posts a new slug to all three and records each in the channel ledger");

// ---------- caps and the pause flag ----------
db.exec("INSERT OR REPLACE INTO pipeline_flags (key, value) VALUES ('social_channel_caps', '{\"linkedin\":0,\"mastodon\":9,\"twitter\":\"x\"}');");
const caps = await mod.channelCaps(env);
ok(caps.linkedin === 0 && caps.mastodon === 9 && caps.twitter === 10, "pipeline_flags.social_channel_caps overrides per channel, clamped to 0..14, bad values ignored: " + JSON.stringify(caps));
r = await mod.drainChannels(env);
ok(r.channels.linkedin === "held:cap-0", "a cap of 0 holds the channel");
db.exec("DELETE FROM pipeline_flags; INSERT INTO pipeline_flags (key, value) VALUES ('social_paused', '1');");
r = await mod.drainChannels(env);
ok(r.skipped === "paused" && createPosts().length === 3, "social_paused=1 posts nothing");
db.exec("DELETE FROM pipeline_flags;");
ok((await mod.drainChannels({ DB: env.DB })).skipped === "no BUFFER_TOKEN", "no BUFFER_TOKEN skips the drain");

// ---------- run status + the tick ----------
ok(mod.channelsRunStatus({ posted: 0, channels: { linkedin: "held:weekly-cap(3/3)" } }) === "ok" && mod.channelsRunStatus({ skipped: "paused", channels: {} }) === "skipped" && mod.channelsRunStatus({ error: "x" }) === "error" && mod.channelsRunStatus({ channels: { linkedin: "error:buffer gql 500(x)" } }) === "degraded", "channelsRunStatus maps held to ok, paused to skipped, a Buffer error to degraded");
const tick = src.slice(src.indexOf("await recordSocialRun(env, 'drain'"), src.indexOf("await retractDeadLinks(env)"));
ok(/drainChannels\(env\)/.test(tick) && /recordSocialRun\(env, 'channels'/.test(tick), "the 2-hourly tick runs the channel drain after the Bluesky drains and records social-channels-<day>");
ok(mod.CHANNEL_WEEKLY_CAP.linkedin === 5 && mod.CHANNEL_WEEKLY_CAP.mastodon === 10 && mod.CHANNEL_WEEKLY_CAP.twitter === 10, "default caps are LinkedIn 5, Mastodon 10, X 10 (Q08-OPEN-1)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
