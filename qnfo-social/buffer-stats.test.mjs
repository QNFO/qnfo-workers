// BUFFER-POST-STATS-1 offline suite (qnfo-social 0.13.0, agent_issues 2374). The response shapes are the ones Buffer's
// documentation gives (developers.buffer.com: Post.metrics [{ type name value unit }], Post.externalLink, posts edges /
// pageInfo, the 429 body with extensions.code RATE_LIMIT_EXCEEDED); none was recorded from the live API.
// Proves: one social_engagements row per post and metric in the Bluesky row shape; no zero row for a post without
// statistics (buffer_channel rows say unmeasured / pending instead); the public link fills an empty social_media_posts.url
// and never overwrites one; auth_status every run; a refused field is dropped and the query repeated once; a 429 ends the
// run; the token never reaches a log line, a row or the result; the request count is bounded; the 07:00 cron runs it.
// Run: node qnfo-social/buffer-stats.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const VERSION = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
const TOKEN = "tok-SECRET-9f3a";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
    note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));
  CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT,
    status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);`);
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
  return { db, DB: { prepare: stmt, async batch(list) { for (const s of list) s._run(); return []; } } };
}
const J = (o, st, h) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ "Content-Type": "application/json" }, h || {}) });
const NOW = Date.parse("2026-10-12T07:00:00Z");
const iso = (hAgo) => new Date(NOW - hAgo * 36e5).toISOString();
const metric = (type, name, value, unit) => ({ type, name, value, unit: unit || "count" });

const logs = [];
const realLog = console.log;
function capture() { console.log = (...a) => { logs.push(a.map(String).join(" ")); }; }
function release() { console.log = realLog; }

// ---- pure plan ----
{
  const plan = mod.bufferStatsPlan([
    { id: "p1", status: "sent", sentAt: iso(72), externalLink: "https://mastodon.social/@qnfo/1", metrics: [metric("reactions", "Favorites", 4), metric("reposts", "Reblogs", 0), metric("engagementRate", "Engagement Rate", 1.5, "percentage")] },
    { id: "p2", status: "sent", sentAt: iso(72), externalLink: null, metrics: null },
    { id: "p3", status: "sent", sentAt: iso(5), metrics: [] },
    { id: "p4", status: "sent", sentAt: iso(24 * 45), metrics: [metric("reactions", "Likes", 9)] },
    { id: "p5", status: "draft", metrics: null },
    { id: "p6", metrics: null },
    { id: "p7", sentAt: iso(50), externalLink: "javascript:alert(1)", metrics: [{ type: "reactions", name: "Likes", value: null, unit: "count" }] }
  ], "Mastodon", NOW, { p6: "2026-10-09 14:30:23" });
  ok(plan.rows.length === 3, "three metric rows for the one measured post, got " + plan.rows.length);
  ok(plan.rows.some((r) => r.post_id === "p1" && r.metric === "reposts" && r.value === 0), "a zero Buffer reported is kept as a measurement");
  ok(plan.rows.every((r) => r.post_id === "p1"), "no row for a post without statistics");
  ok(plan.rows.some((r) => r.metric === "engagementrate" && /percentage/.test(r.note)), "metric key is the lowercased type and the note carries the unit");
  ok(plan.rows[0].note.indexOf("qnfo-social mastodon") === 0, "note names the collector and the network");
  ok(plan.measured === 1 && plan.unmeasured === 3 && plan.pending === 1 && plan.skipped_old === 1, "counts: " + JSON.stringify({ m: plan.measured, u: plan.unmeasured, p: plan.pending, o: plan.skipped_old }));
  ok(plan.sent === 5, "draft and 45-day-old posts are not counted, sent=" + plan.sent);
  ok(plan.urls.length === 1 && plan.urls[0].id === "p1", "only an https link is taken");
  const unknown = mod.bufferStatsPlan([{ id: "q", metrics: null }], "x", NOW, {});
  ok(unknown.age_unknown === 1 && unknown.unmeasured === 0, "a post of unknown age is not called unmeasured");
}
ok(mod.bufferRefusedFields(['Cannot query field "externalLink" on type "Post".', 'Cannot query field "sentAt" on type "Post". Did you mean "dueAt"?']).join(",") === "externalLink,sentAt", "refused field names are read from the validation errors");
ok(/after: "c1"/.test(mod.bufferStatsQuery("o", "c", ["id"], "c1")) && /status: \[sent\]/.test(mod.bufferStatsQuery("o", "c", ["id"])) && !/after:/.test(mod.bufferStatsQuery("o", "c", ["id"])), "query carries the documented filter and the cursor only when given");

// ---- full run against documented shapes ----
function bufferStub(opts) {
  const calls = [];
  const f = async (url, init) => {
    const u = String(url), body = init && init.body ? String(init.body) : "";
    if (u !== "https://api.buffer.com") return new Response("not found", { status: 404 });
    calls.push({ body, auth: init.headers.Authorization, signal: !!init.signal });
    if (opts.http) return J(opts.httpBody || { errors: [{ message: "Unauthorized" }] }, opts.http, opts.httpHeaders);
    if (body.includes("organizations")) return J({ data: { account: { organizations: [{ id: "org1" }] } } });
    if (body.includes("channels(")) return J({ data: { channels: opts.channels } });
    if (body.includes("posts(")) return opts.posts(body, calls);
    return J({ errors: [{ message: "unknown query" }] });
  };
  f.calls = calls;
  return f;
}
const edges = (nodes, pageInfo) => J({ data: { posts: { edges: nodes.map((n) => ({ node: n })), pageInfo: pageInfo || { hasNextPage: false, endCursor: null } } } });
const CHANNELS = [{ id: "chM", service: "mastodon", isDisconnected: false }, { id: "chX", service: "twitter", isDisconnected: false }, { id: "chL", service: "linkedin", isDisconnected: false }, { id: "chD", service: "threads", isDisconnected: true }];

{
  const { db, DB } = makeDb();
  db.exec(`INSERT INTO social_media_posts (id, platform, post_id, url, buffer_id, published_at) VALUES
    ('ch-m-1','buffer-mastodon','m1',NULL,'m1',datetime('now','-3 days')),
    ('ch-x-1','buffer-x','x1','https://kept.example/1','x1',datetime('now','-3 days')),
    ('ch-l-1','buffer-linkedin','l1',NULL,'l1',datetime('now','-3 days'))`);
  const stub = bufferStub({ channels: CHANNELS, posts: (body) => {
    if (body.includes('chM')) return edges([{ id: "m1", channelId: "chM", status: "sent", sentAt: iso(72), externalLink: "https://mastodon.social/@qnfo/111", metricsUpdatedAt: iso(20), metrics: [metric("reactions", "Favorites", 3), metric("reposts", "Reblogs", 1), metric("comments", "Replies", 0)] }]);
    if (body.includes('chX')) return edges([{ id: "x1", channelId: "chX", status: "sent", sentAt: iso(72), externalLink: "https://x.com/qnfo/status/9", metricsUpdatedAt: null, metrics: null }, { id: "x2", channelId: "chX", status: "sent", sentAt: iso(3), externalLink: null, metricsUpdatedAt: null, metrics: null }]);
    return edges([{ id: "l1", channelId: "chL", status: "sent", sentAt: iso(60), externalLink: "https://www.linkedin.com/feed/update/urn:li:share:1", metricsUpdatedAt: null, metrics: [] }]);
  } });
  globalThis.fetch = stub;
  capture();
  const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW);
  release();
  const rows = db.prepare("SELECT platform, post_id, metric, value, note, collected_at FROM social_engagements ORDER BY id").all();
  const post = rows.filter((r) => r.platform === "buffer" && r.metric !== "auth_status");
  ok(post.length === 3 && post.every((r) => r.post_id === "m1" && r.collected_at === "2026-10-12"), "three per-post rows, keyed by the Buffer post id and the UTC day");
  ok(post.some((r) => r.metric === "reactions" && r.value === 3) && post.some((r) => r.metric === "comments" && r.value === 0), "values as Buffer reported them");
  ok(!rows.some((r) => r.platform === "buffer" && (r.post_id === "x1" || r.post_id === "l1" || r.post_id === "x2")), "no zero rows for posts Buffer gave no statistics for");
  // the issue's closing probe and the dashboard read only platform 'buffer' with a metric other than auth_status
  const probe = db.prepare("SELECT COUNT(DISTINCT post_id) AS n FROM social_engagements WHERE platform = 'buffer' AND metric <> 'auth_status'").get().n;
  ok(probe === 1, "the closing probe counts measured posts only, got " + probe);
  const auth = rows.filter((r) => r.metric === "auth_status");
  ok(auth.length === 1 && auth[0].value === 1 && auth[0].post_id === "auth" && auth[0].platform === "buffer", "auth_status ok row");
  const chan = (svc, m) => rows.filter((r) => r.platform === "buffer_channel" && r.post_id === svc && r.metric === m)[0];
  ok(chan("mastodon", "posts_with_metrics").value === 1 && /measured/.test(chan("mastodon", "sent_posts").note), "mastodon marked measured");
  ok(chan("twitter", "posts_unmeasured").value === 1 && /^qnfo-social unmeasured: Buffer returned no statistics/.test(chan("twitter", "posts_unmeasured").note), "x marked unmeasured in words");
  ok(chan("twitter", "sent_posts").value === 2 && chan("linkedin", "posts_unmeasured").value === 1, "channel counts");
  ok(!rows.some((r) => r.post_id === "threads"), "a disconnected channel is not read");
  const urls = Object.fromEntries(db.prepare("SELECT buffer_id, url FROM social_media_posts").all().map((r) => [r.buffer_id, r.url]));
  ok(urls.m1 === "https://mastodon.social/@qnfo/111" && urls.l1 === "https://www.linkedin.com/feed/update/urn:li:share:1", "public link stored where url was empty");
  ok(urls.x1 === "https://kept.example/1", "an existing url is not overwritten");
  ok(out.requests === 5 && stub.calls.length === 5, "five requests for three channels, got " + stub.calls.length);
  ok(stub.calls.every((c) => c.auth === "Bearer " + TOKEN && c.signal), "every call is authorised and carries a timeout signal");
  ok(out.shape && out.shape.post.includes("externalLink") && out.shape.metric.join(",") === "type,name,value,unit" && out.shape.types.includes("reactions"), "first response field names recorded");
  ok(logs.some((l) => l.indexOf("BUFFER-POST-STATS-1 first response field names") === 0), "field names are logged");
  ok(!logs.join("\n").includes(TOKEN) && !JSON.stringify(out).includes(TOKEN) && !JSON.stringify(rows).includes(TOKEN), "the token is in no log line, result or row");
  ok(!logs.join("\n").includes("mastodon.social/@qnfo/111"), "the shape log carries names, not values");
  ok(out.channels.twitter.unmeasured === 1 && out.channels.twitter.pending === 1 && out.errors === 0, "result summarises each channel");
  ok(mod.engagementRunStatus({ posts_found: 3, buffer: out }) === "ok", "a clean Buffer read keeps the run ok");
  // second run the same day upserts
  globalThis.fetch = bufferStub({ channels: CHANNELS.slice(0, 1), posts: () => edges([{ id: "m1", status: "sent", sentAt: iso(72), metrics: [metric("reactions", "Favorites", 5)] }]) });
  capture(); await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  const again = db.prepare("SELECT COUNT(*) AS n, MAX(value) AS v FROM social_engagements WHERE platform='buffer' AND post_id='m1' AND metric='reactions'").get();
  ok(again.n === 1 && again.v === 5, "a second run the same day updates the row");
}

// ---- a field the schema refuses ----
{
  const { db, DB } = makeDb();
  const stub = bufferStub({ channels: CHANNELS.slice(0, 2), posts: (body) => {
    if (/externalLink|sentAt/.test(body)) return J({ errors: [{ message: 'Cannot query field "externalLink" on type "Post".' }, { message: 'Cannot query field "sentAt" on type "Post".' }] });
    return edges([{ id: "m9", channelId: "chM", status: "sent", metricsUpdatedAt: null, metrics: [metric("reactions", "Favorites", 2)] }]);
  } });
  globalThis.fetch = stub;
  capture(); const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  ok(out.refused && out.refused.fields.join(",") === "externalLink,sentAt", "the refusal is in the result for the run ledger");
  ok(db.prepare("SELECT COUNT(*) AS n FROM social_engagements WHERE platform='buffer' AND post_id='m9'").get().n === 1, "the reduced query still collects");
  ok(stub.calls.length === 5, "one retry only, then the reduced field set is reused: " + stub.calls.length);
}

// ---- rate limit, auth failure, no token, oversized pagination ----
{
  const { db, DB } = makeDb();
  let n = 0;
  globalThis.fetch = bufferStub({ channels: CHANNELS, posts: () => { n++; return J({ errors: [{ message: "Too many requests from this client. Please try again later.", extensions: { code: "RATE_LIMIT_EXCEEDED", window: "15m" } }] }, 429, { "Retry-After": "600" }); } });
  capture(); const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  ok(out.rate_limited === true && n === 1, "a 429 ends the run after one posts call");
  const e = db.prepare("SELECT note FROM social_engagements WHERE platform='buffer_channel' AND metric='collect_error'").get();
  ok(e && /http 429 retry-after 600/.test(e.note), "the channel error is stored");
  ok(mod.engagementRunStatus({ posts_found: 3, buffer: out }) === "degraded", "a failed Buffer read degrades the run");
}
{
  const { db, DB } = makeDb();
  globalThis.fetch = bufferStub({ http: 401 });
  capture(); const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  const a = db.prepare("SELECT value, note FROM social_engagements WHERE metric='auth_status'").get();
  ok(out.error === "http 401" && a && a.value === 0 && /http 401/.test(a.note), "a rejected token writes auth_status 0 with the HTTP status");
  ok(!logs.join("\n").includes(TOKEN), "still no token in the logs");
}
{
  const { DB } = makeDb();
  let called = 0;
  globalThis.fetch = async () => { called++; return J({}); };
  const out = await mod.collectBufferStats({ DB }, NOW);
  ok(out.skipped === "no BUFFER_TOKEN" && called === 0, "no token, no call");
}
{
  const { DB } = makeDb();
  const many = Array.from({ length: 12 }, (_, i) => ({ id: "c" + i, service: "mastodon", isDisconnected: false }));
  const stub = bufferStub({ channels: many, posts: () => edges([{ id: "z" + Math.random(), status: "sent", sentAt: iso(50), metrics: [metric("reactions", "Favorites", 1)] }], { hasNextPage: true, endCursor: "cur" }) });
  globalThis.fetch = stub;
  capture(); const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  ok(stub.calls.length === 2 + mod.BUFFER_STATS_CHANNELS * 3 && out.truncated === mod.BUFFER_STATS_CHANNELS, "requests are bounded at channels x pages: " + stub.calls.length);
  ok(stub.calls.some((c) => c.body.includes('after: \\"cur\\"')), "the cursor is followed");
}
{
  const { DB } = makeDb();
  globalThis.fetch = async () => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; };
  capture(); const out = await mod.collectBufferStats({ DB, BUFFER_TOKEN: TOKEN }, NOW); release();
  ok(out.error === "fetch TimeoutError", "a timeout is reported, not thrown");
}

// ---- wiring ----
ok(/event\.cron === '0 7 \* \* \*'[\s\S]{0,900}collectBufferStats\(env\)/.test(src), "the 07:00 cron runs the Buffer collector");
ok(/AbortSignal\.timeout\(BUFFER_STATS_TIMEOUT_MS\)/.test(src) && /readTextCapped\(r, BUFFER_STATS_BODY_CAP\)/.test(src), "timeout and body cap are in the call");
{
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(VERSION);
  ok(m && (Number(m[1]) > 0 || Number(m[2]) >= 13), "VERSION is at least 0.13.0, got " + VERSION);
}

release();
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
