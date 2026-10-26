// SOCIAL-ENGAGEMENT-COVERAGE-1 offline suite (qnfo-social 0.19.3, pillar reach, guard metric attention_channels_stopped).
// Measured cause (qnfo-audit, 2026-10-26): collectEngagement listed social_threads (LIMIT 100) first and stopped adding at 100
// URIs in all, so each daily run measured the newest 100 thread posts and none of the 203 Bluesky dissemination posts; 194 of them
// had no social_engagements row. Proves: both sources are covered and deduplicated; a JSON-wrapped post_uri is read and a
// non-Bluesky id is dropped; posts with no snapshot yet come first, then the newest; the cap is a named constant and is
// respected; the 344-post live shape fits under it; a post the AppView omits (deleted) gets no row; 429 waits are capped and
// attempts bounded; rows are written in batches of at most 400; the result reports candidates, never_measured, skipped_by_cap
// and omitted. Run: node qnfo-social/engagement-coverage.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const realLog = console.log;
const quiet = () => { console.log = () => {}; };
const loud = () => { console.log = realLog; };
const U = (n) => "at://did:plc:me/app.bsky.feed.post/" + n;

// ---- the pure plan ----
{
  ok(mod.BSKY_ENGAGEMENT_MAX_URIS === 400, "the cap is the named constant 400, got " + mod.BSKY_ENGAGEMENT_MAX_URIS);
  const threads = [
    { post_uri: U("t1"), posted_at: "2026-10-20 08:00:00" },
    { post_uri: JSON.stringify({ bluesky: U("t2"), linkedin: "buffer-draft:9" }), posted_at: "2026-10-19 08:00:00" },
    { post_uri: "buffer:7", posted_at: "2026-10-25 08:00:00" },
    { post_uri: "", posted_at: "2026-10-25 09:00:00" }
  ];
  const dissem = [
    { post_id: U("d1"), posted_at: "2026-10-21 08:00:00" },
    { post_id: U("t1"), posted_at: "2026-10-20 08:00:00" },
    { post_id: U("d2"), posted_at: "2026-10-14 08:00:00" }
  ];
  const all = mod.planEngagementUris(threads, dissem, new Set(), 400);
  ok(all.candidates === 4 && all.uris.length === 4, "both sources, deduplicated: t1 appears once, got " + JSON.stringify(all));
  ok(new Set(all.uris).size === 4 && all.uris.includes(U("d1")) && all.uris.includes(U("d2")), "dissemination posts are included, not only threads");
  ok(all.uris.includes(U("t2")), "a JSON-wrapped post_uri yields its bluesky at:// uri");
  ok(!all.uris.some((u) => u.indexOf("buffer") >= 0), "a Buffer id is not a Bluesky post and is dropped");
  ok(all.never_measured === 4 && all.skipped_by_cap === 0, "nothing measured yet: all four are new, none skipped");
  ok(all.uris.join() === [U("d1"), U("t1"), U("t2"), U("d2")].join(), "no snapshot anywhere: newest first, got " + all.uris.join());

  const first = mod.planEngagementUris(threads, dissem, new Set([U("d1"), U("t1")]), 400);
  ok(first.uris.slice(0, 2).join() === [U("t2"), U("d2")].join(), "posts with no snapshot come first (newest of them first), got " + first.uris.join());
  ok(first.uris.slice(2).join() === [U("d1"), U("t1")].join(), "then the already measured ones, newest first");
  ok(first.never_measured === 2, "never_measured counts the two without a snapshot");

  const asMap = mod.planEngagementUris(threads, dissem, { [U("d1")]: 1, [U("t1")]: 1 }, 400);
  ok(asMap.uris.join() === first.uris.join(), "measured may be a plain object keyed by uri");

  const capped = mod.planEngagementUris(threads, dissem, new Set([U("d1")]), 2);
  ok(capped.uris.length === 2 && capped.candidates === 4 && capped.skipped_by_cap === 2, "cap 2 of 4: two picked, two skipped, got " + JSON.stringify(capped));
  ok(capped.uris.join() === [U("t1"), U("t2")].join(), "under the cap the never-measured posts are kept before the measured one, got " + capped.uris.join());
  const none = mod.planEngagementUris(threads, dissem, null, 0);
  ok(none.uris.length === 0 && none.skipped_by_cap === 4, "cap 0 picks nothing");
  const mixed = mod.planEngagementUris([{ post_uri: U("a"), posted_at: "2026-10-20T09:00:00Z" }], [{ post_id: U("b"), posted_at: "2026-10-20 08:00:00" }], null, 400);
  ok(mixed.uris.join() === [U("a"), U("b")].join(), "an ISO timestamp and a space-separated one compare as the same clock, got " + mixed.uris.join());
  ok(mod.planEngagementUris(null, undefined, undefined, 5).candidates === 0, "null inputs are an empty plan");

  // the live shape of 2026-10-26: 141 thread posts and 203 dissemination posts inside 60 days, the newest 100 threads measured
  const T = Array.from({ length: 141 }, (_, i) => ({ post_uri: U("th" + i), posted_at: new Date(Date.parse("2026-10-26T00:00:00Z") - i * 36e5).toISOString() }));
  const D = Array.from({ length: 203 }, (_, i) => ({ post_id: U("di" + i), posted_at: new Date(Date.parse("2026-10-14T00:00:00Z") - i * 6e4).toISOString() }));
  const measured = new Set(T.slice(0, 100).map((r) => r.post_uri));
  const live = mod.planEngagementUris(T, D, measured, mod.BSKY_ENGAGEMENT_MAX_URIS);
  ok(live.candidates === 344 && live.uris.length === 344 && live.skipped_by_cap === 0, "all 344 posts fit under the cap, got " + JSON.stringify({ c: live.candidates, u: live.uris.length, s: live.skipped_by_cap }));
  ok(live.never_measured === 244, "244 posts (203 dissemination + 41 older threads) were never measured, got " + live.never_measured);
  ok(live.uris.slice(0, 244).every((u) => !measured.has(u)), "the 244 never-measured posts are collected before any measured one");
  ok(D.every((r) => live.uris.includes(r.post_id)), "every dissemination post is in the plan");
  const over = mod.planEngagementUris(T.concat(T.map((r, i) => ({ post_uri: U("x" + i), posted_at: r.posted_at }))), D, measured, 400);
  ok(over.uris.length === 400 && over.skipped_by_cap === 141 * 2 + 203 - 400, "above 400 candidates the cap holds, got " + JSON.stringify({ u: over.uris.length, s: over.skipped_by_cap }));
}

// ---- collectEngagement against a real SQLite and a fake public AppView ----
function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, posts TEXT, status TEXT, posted_at TEXT, post_uri TEXT);
  CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, channel TEXT, action TEXT, post_id TEXT, posted_at TEXT);
  CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
    note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));`);
  const batches = [];
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _run() { return db.prepare(sql).run(...args); }
    };
    return s;
  };
  return { db, batches, DB: { prepare: stmt, async batch(list) { batches.push(list.length); for (const s of list) s._run(); return []; } } };
}
function seed(db, nThreads, nDissem, measuredThreads) {
  for (let i = 0; i < nThreads; i++) {
    const uri = i % 2 ? JSON.stringify({ bluesky: U("th" + i), linkedin: "buffer-draft:" + i }) : U("th" + i);
    db.prepare("INSERT INTO social_threads (slug, title, posts, status, posted_at, post_uri) VALUES (?, ?, '[]', 'posted', datetime('now', ?), ?)").run("s" + i, "t" + i, "-" + (i + 1) + " hours", uri);
  }
  for (let i = 0; i < nDissem; i++) db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, post_id, posted_at) VALUES (?, ?, 'bluesky', 'posted', ?, datetime('now', ?))").run("d" + i, "p" + i, U("di" + i), "-" + (20 * 24 + i) + " hours");
  db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, post_id, posted_at) VALUES ('dx', 'px', 'bluesky', 'posted', '', datetime('now', '-2 hours'))").run();
  db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, post_id, posted_at) VALUES ('dm', 'pm', 'mastodon', 'posted', 'https://m/1', datetime('now', '-2 hours'))").run();
  for (let i = 0; i < measuredThreads; i++) db.prepare("INSERT INTO social_engagements (platform, post_id, metric, value, collected_at) VALUES ('bluesky', ?, 'likes', 0, '2026-10-25')").run(U("th" + i));
}
const appview = (calls, opts) => async (url) => {
  const u = String(url);
  calls.push(u);
  if (!u.includes("public.api.bsky.app/xrpc/app.bsky.feed.getPosts")) return new Response("nf", { status: 404 });
  if (opts && opts.status429) return new Response("slow down", { status: 429, headers: opts.retryAfter ? { "Retry-After": opts.retryAfter } : {} });
  const uris = new URL(u).searchParams.getAll("uris");
  const gone = (opts && opts.gone) || [];
  return new Response(JSON.stringify({ posts: uris.filter((x) => !gone.includes(x)).map((x, i) => ({ uri: x, likeCount: i + 1, repostCount: 0, replyCount: 0, quoteCount: 0 })) }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;

{
  const m = makeDb();
  seed(m.db, 141, 203, 100);
  const calls = [];
  globalThis.fetch = appview(calls, { gone: [U("di5"), U("th130")] });
  quiet();
  const r = await mod.collectEngagement({ DB: m.DB });
  loud();
  globalThis.fetch = realFetch;
  ok(r.candidates === 344 && r.uris === 344 && r.skipped_by_cap === 0, "all 344 Bluesky posts are collected, got " + JSON.stringify(r));
  ok(r.never_measured === 244, "244 had no snapshot, got " + r.never_measured);
  ok(calls.length === 14, "344 uris are 14 getPosts calls of 25, got " + calls.length);
  ok(r.omitted === 2 && r.posts_found === 342, "the two deleted posts are counted as omitted, got omitted " + r.omitted + " found " + r.posts_found);
  ok(r.rows === 342 * 4 && r.errors === 0, "four metric rows per answered post, no error, got rows " + r.rows + " errors " + r.errors);
  const measuredNow = m.db.prepare("SELECT COUNT(DISTINCT post_id) AS n FROM social_engagements WHERE platform = 'bluesky' AND collected_at = ?").get(r.day).n;
  ok(measuredNow === 342, "342 posts have a snapshot for today (was 100 per run before the fix), got " + measuredNow);
  const dissemMeasured = m.db.prepare("SELECT COUNT(DISTINCT post_id) AS n FROM social_engagements WHERE post_id LIKE '%.post/di%' AND collected_at = ?").get(r.day).n;
  ok(dissemMeasured === 202, "202 of the 203 dissemination posts are measured, the deleted one is not, got " + dissemMeasured);
  const goneRows = m.db.prepare("SELECT COUNT(*) AS n FROM social_engagements WHERE post_id IN (?, ?) AND collected_at = ?").get(U("di5"), U("th130"), r.day).n;
  ok(goneRows === 0, "a post the AppView omits gets no row, not a row of zeros, got " + goneRows);
  ok(m.batches.length === 4 && Math.max(...m.batches) <= 400 && m.batches.reduce((a, b) => a + b, 0) === 342 * 4, "1368 statements are written in four batches of at most 400, got " + JSON.stringify(m.batches));
  ok(calls.every((u) => u.startsWith("https://public.api.bsky.app/")), "only the public AppView is read, no credential");
}

// ---- a rate limit: attempts are bounded and every wait is capped ----
{
  const m = makeDb();
  seed(m.db, 3, 2, 0);
  const calls = [], waits = [];
  globalThis.fetch = appview(calls, { status429: true, retryAfter: "9999" });
  globalThis.setTimeout = (fn, ms) => { waits.push(ms); return realSetTimeout(fn, 0); };
  quiet();
  const r = await mod.collectEngagement({ DB: m.DB });
  loud();
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  ok(calls.length === 3, "a chunk that keeps answering 429 is tried three times, not forever, got " + calls.length);
  ok(waits.length === 2 && waits.every((w) => w === 30000), "a Retry-After of 9999 s waits the 30 s cap, got " + JSON.stringify(waits));
  ok(r.errors >= 1 && r.posts_found === 0 && r.rows === 0, "the failed chunk is counted as an error and writes nothing, got " + JSON.stringify(r));
  ok(mod.engagementRunStatus(r) === "error", "no post answered at all: the run reads error");
}

// ---- above the cap: the never-measured posts are the ones kept ----
{
  const m = makeDb();
  seed(m.db, 450, 0, 400);
  const calls = [];
  globalThis.fetch = appview(calls);
  quiet();
  const r = await mod.collectEngagement({ DB: m.DB });
  loud();
  globalThis.fetch = realFetch;
  ok(r.candidates === 450 && r.uris === 400 && r.skipped_by_cap === 50, "450 candidates, 400 collected, 50 skipped, got " + JSON.stringify(r));
  ok(r.never_measured === 50, "the 50 without a snapshot are all collected (they sort first), got never_measured " + r.never_measured);
  const newIds = Array.from({ length: 50 }, (_, i) => U("th" + (400 + i)));
  const gotNew = m.db.prepare("SELECT COUNT(DISTINCT post_id) AS n FROM social_engagements WHERE collected_at = ? AND post_id IN (" + newIds.map(() => "?").join(",") + ")").get(r.day, ...newIds).n;
  ok(gotNew === 50, "each of the 50 never-measured posts has today's snapshot, got " + gotNew);
  const today = m.db.prepare("SELECT COUNT(DISTINCT post_id) AS n FROM social_engagements WHERE collected_at = ?").get(r.day).n;
  ok(today === 400, "400 posts have today's snapshot, got " + today);
  ok(calls.length === 16, "400 uris are 16 calls, the most the cap allows, got " + calls.length);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
