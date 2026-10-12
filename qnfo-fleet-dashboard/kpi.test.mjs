// FLEET-KPI-1 offline suite (qnfo-fleet-dashboard 1.30.0): the Metrics tab's SQL and shaping against node:sqlite, the JSON
// contract of /api/kpi (null = not measured, never 0), the page, the cache and the per-host ingest rows.
// Run: node --no-warnings qnfo-fleet-dashboard/kpi.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < a) throw new Error("not found in worker.js: " + from); return src.slice(a, b); };
const block = cut("// ---- FLEET-KPI-1:BEGIN ----", "// ---- FLEET-KPI-1:END ----");
const d1allSrc = cut("async function d1all(db, sql, params) {", "__name(d1all, \"d1all\");");
const escSrc = cut("function esc(s) {", "__name(esc, \"esc\");");
const rowSrc = cut("function reachRow(day, source, channel, type, id, metric, value, quality) {", "// /papers/<slug>");
const hostSrc = cut("function reachRumHostRows(groups, day) {", "function reachRumReferrerRows(");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const NOW = Date.parse("2026-10-12T09:00:00Z");
const ms = (iso) => Date.parse(iso);
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
  CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, merge_state TEXT, updated_at TEXT);
  CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
  CREATE TABLE outreach_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);
  CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, status TEXT, posted_at TEXT, post_uri TEXT);
  CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, status TEXT, engagement_metrics TEXT);
  CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, channel TEXT, action TEXT, posted_at TEXT);
  CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT, post_id TEXT, metric TEXT, value REAL, note TEXT, collected_at TEXT);
  CREATE TABLE social_channels (channel_id TEXT PRIMARY KEY, service TEXT, name TEXT, connected INTEGER, checked_at TEXT);
  CREATE TABLE subscribers (email TEXT PRIMARY KEY, status TEXT, source TEXT, created_at TEXT, confirmed_at TEXT);
  CREATE TABLE external_mentions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, title TEXT, url TEXT, first_seen TEXT);
  CREATE TABLE outreach_learner_sends (queue_id TEXT PRIMARY KEY, outcome TEXT);`);
const ins = (sql, ...a) => db.prepare(sql).run(...a);
// Issues: 5 open (ages 2 h, 10 h, 30 h, 50 h, 400 h; one created_at in seconds), 3 closed.
const issue = (pri, cat, status, createdMs) => ins("INSERT INTO agent_issues (title, category, priority, status, created_at) VALUES (?, ?, ?, ?, ?)", "T " + pri, cat, pri, status, createdMs).lastInsertRowid;
const iA = issue("critical", "reliability", "open", NOW - 2 * 36e5);
issue("high", "reliability", "open", NOW - 10 * 36e5);
issue("high", "reach", "open", NOW - 30 * 36e5);
issue("medium", "", "open", Math.round((NOW - 50 * 36e5) / 1e3));
const iOld = issue("low", "cost", "open", NOW - 400 * 36e5);
const c1 = issue("high", "bug", "closed", NOW - 60 * 36e5), c2 = issue("high", "bug", "closed", NOW - 70 * 36e5), c3 = issue("medium", "bug", "resolved", NOW - 5 * 864e5);
const life = (id, ev, to, evd, ts) => ins("INSERT INTO issue_lifecycle (issue_id, event, to_status, has_evidence, ts) VALUES (?, ?, ?, ?, ?)", id, ev, to, evd, ts);
life(c3, "opened", "open", null, "2026-10-08T15:34:26Z"); // the ledger's first row
life(c1, "dispositioned", "closed", 1, "2026-10-12T03:00:00Z");
life(c1, "dispositioned", "closed", 1, "2026-10-12T04:00:00Z"); // the same issue twice in a day counts once
life(c2, "dispositioned", "closed", 0, "2026-10-11T20:00:00Z");
life(c3, "dispositioned", "resolved", 1, "2026-10-09T10:00:00Z");
life(iA, "dispositioned", "closed", 1, "2026-10-12T01:00:00Z"); life(iA, "reopened", "open", 1, "2026-10-12T02:00:00Z"); // closed, then reopened: open now
for (const [id, st, at] of [["a", "merged", "2026-10-11T00:00:00.000Z"], ["b", "merged", "2026-09-01T00:00:00.000Z"], ["c", "failed", "2026-10-12T00:00:00.000Z"], ["d", "publish_failed", "2026-10-10T00:00:00.000Z"], ["e", "queued", "2026-10-12T08:00:00.000Z"], ["f", "closed", "2026-10-01T00:00:00.000Z"]]) ins("INSERT INTO code_tasks (id, status, updated_at) VALUES (?, ?, ?)", id, st, at);
// Reach: 10-10 has only page rows (page-rows basis), 10-11 has host rows (host basis, with visits). Nothing before 10-10.
const rs = (date, source, channel, type, id, metric, value) => ins("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, ?, ?, ?, ?, ?, ?, 'human')", date, source, channel, type, id, metric, value);
rs("2026-10-10", "cf-rum-human", "web", "site", "(all)", "pageviews", 100);
rs("2026-10-10", "cf-rum-human", "web", "page", "q08.org/", "pageviews", 40);
rs("2026-10-10", "cf-rum-human", "web", "page", "q08.org/a/b", "pageviews", 5);
rs("2026-10-10", "cf-rum-human", "web", "page", "reading.q08.org/", "pageviews", 20);
rs("2026-10-10", "cf-rum-human", "web", "paper", "some-paper", "pageviews", 30);
rs("2026-10-10", "cf-rum-human", "web", "page", "(other)", "pageviews", 5);
rs("2026-10-10", "cf-rum", "web", "page", "q08.org/", "pageviews", 999); // unfiltered rows are never read
rs("2026-10-11", "cf-rum-human", "web", "site", "(all)", "pageviews", 80);
rs("2026-10-11", "cf-rum-human", "web", "page", "q08.org/", "pageviews", 777); // ignored: the day has host rows
for (const [h, pv, vi] of [["q08.org", 30, 12], ["www.q08.org", 2, 1], ["ipatent.qnfo.org", 8, 4], ["ask.qwav.tech", 10, 5], ["papers.qnfo.org", 25, 9], ["example.net", 5, 2]]) { rs("2026-10-11", "cf-rum-human", "web", "host", h, "pageviews", pv); rs("2026-10-11", "cf-rum-human", "web", "host", h, "visits", vi); }
rs("2026-10-11", "utm", "bluesky", "campaign", "slug-one", "clicks_human", 4);
rs("2026-10-10", "utm", "mastodon", "campaign", "proj-m", "clicks_human", 7);
rs("2026-10-10", "utm", "mastodon", "campaign", "proj-m", "clicks_bot", 50);
rs("2026-10-11", "utm", "probe", "campaign", "t79", "clicks_human", 9);
const LONG = "a-very-long-campaign-slug-that-the-gateway-cuts-at-sixty-four-characters-exactly";
rs("2026-10-11", "utm", "linkedin", "campaign", LONG.slice(0, 64), "clicks_human", 2);
rs("2026-10-11", "mention-radar", "bluesky", "site", "qnfo", "mentions", 2);
rs("2026-10-11", "openalex", "openalex", "doi", "10.1/a", "citations", 3); rs("2026-10-11", "openalex", "openalex", "doi", "10.1/b", "citations", 0); rs("2026-10-01", "openalex", "openalex", "doi", "10.1/a", "citations", 99);
for (const [at, st] of [["2026-10-08 09:00:51", "sent"], ["2026-10-08 09:00:55", "sent"], ["2026-10-09 09:00:31", "followup"], ["2026-10-10 09:00:10", "replied"], ["2026-10-09 08:00:00", "heartbeat"], ["2026-08-01 09:00:00", "sent"]]) ins("INSERT INTO outreach_log (email, sent_at, status) VALUES ('person@example.org', ?, ?)", at, st);
const U1 = "at://did:plc:abc123/app.bsky.feed.post/3aaa", U2 = "at://did:plc:abc123/app.bsky.feed.post/3bbb", U3 = "at://did:plc:abc123/app.bsky.feed.post/3ccc";
ins("INSERT INTO social_threads (slug, title, status, posted_at, post_uri) VALUES ('slug-one', 'Thread one <b>', 'posted', '2026-10-11 08:30:32', ?)", U1);
ins("INSERT INTO social_threads (slug, title, status, posted_at, post_uri) VALUES ('slug-two', 'Thread two', 'posted', '2026-10-03 18:30:21', ?)", JSON.stringify({ bluesky: U2, mastodon: "buffer:xyz" }));
ins("INSERT INTO social_threads (slug, title, status, posted_at, post_uri) VALUES ('slug-q', 'Queued', 'queued', NULL, NULL)");
const eng = (plat, post, metric, value, at, note) => ins("INSERT INTO social_engagements (platform, post_id, metric, value, note, collected_at) VALUES (?, ?, ?, ?, ?, ?)", plat, post, metric, value, note || null, at);
for (const [u, l, rp, q, re] of [[U1, 2, 1, 0, 1], [U2, 5, 0, 1, 0], [U3, 0, 0, 0, 1]]) { eng("bluesky", u, "likes", l, "2026-10-12"); eng("bluesky", u, "reposts", rp, "2026-10-12"); eng("bluesky", u, "quotes", q, "2026-10-12"); eng("bluesky", u, "replies", re, "2026-10-12"); }
eng("bluesky", U1, "likes", 50, "2026-10-11"); // an older snapshot is never read
eng("buffer", "auth", "auth_status", 1, "2026-09-20", "ok (graphql)");
const smp = (id, plat, bid, proj, at, status, em) => ins("INSERT INTO social_media_posts (id, platform, post_id, url, content_preview, published_at, buffer_id, project_id, status, engagement_metrics) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)", id, plat, bid, "Preview of " + proj, at, bid, proj, status, em);
smp("ch-m-1", "buffer-mastodon", "buf-m-1", "proj-m", "2026-10-10 14:30:31", "published", '{"via":"channel-drain","buffer_status":"ok"}');
smp("ch-l-1", "buffer-linkedin", "buf-l-1", LONG, "2026-10-12 00:30:53", "published", "not json");
smp("ch-x-0", "buffer-x", "buf-x-0", "proj-x", "2026-08-27 04:51:26", "failed", "{}");
ins("INSERT INTO dissemination_tracker (id, channel, action, posted_at) VALUES ('d1', 'bluesky', 'posted', '2026-09-29 12:30:44'), ('d2', 'bluesky', 'queued', NULL)");
ins("INSERT INTO social_channels (channel_id, service, name, connected, checked_at) VALUES ('1', 'mastodon', 'QNFO', 1, '2026-10-12T00:30:52.379Z'), ('2', 'twitter', 'Handle', 0, '2026-10-12T00:30:52.379Z')");
ins("INSERT INTO subscribers (email, status, source, created_at, confirmed_at) VALUES ('a@example.org', 'subscribed', 'qnfo.org', '2026-09-12 10:35:36', '2026-09-12 10:40:00'), ('b@example.org', 'pending', 'papers', '2026-09-26 14:48:51', NULL), ('c@example.org', 'pending', NULL, '2026-09-26 14:44:58', NULL)");
ins("INSERT INTO external_mentions (source, title, url, first_seen) VALUES ('openalex-citation', 'A citing work', 'https://example.org/w1', '2026-10-12T07:30:30.262Z'), ('bluesky', 'Old', 'javascript:alert(1)', '2026-08-01T00:00:00Z')");
ins("INSERT INTO outreach_learner_sends (queue_id, outcome) VALUES ('q1', 'positive'), ('q2', NULL), ('q3', 'no-reply')");

let reads = 0;
const shim = {
  prepare: (sql) => {
    let args = [];
    const st = { bind: (...x) => { args = x; return st; }, all: async () => { reads++; return { results: db.prepare(sql).all(...args) }; } };
    return st;
  }
};
const ctx = vm.createContext({ VERSION: "1.30.0-test", FLEET_SHELL_JS: "", fleetHead: (t) => "<html><title>" + t + "</title><body>", fleetTop: (cur) => "<nav data-current=\"" + cur + "\"></nav>", console, Date, JSON, Math, Object, Promise, String, Number, isFinite });
vm.runInContext(d1allSrc + escSrc + rowSrc + hostSrc + block + "\nthis.K = { kpiData, kpiCompute, kpiHtml, kpiProperty, kpiBskyUrl, kpiHttpUrl, kpiChannel, kpiMedian, kpiDays, kpiBufferMetric, kpiFmt, reachRumHostRows, KPI_SQL, KPI_TTL_MS, KPI_CSS, reset: function() { kpiCache = null; } };", ctx);
const K = ctx.K, env = { AUDIT: shim };
const j = (x) => JSON.parse(JSON.stringify(x));

// ---- helpers
ok(K.kpiProperty("WWW.Q08.org") === "q08" && K.kpiProperty("reading.q08.org") === "reading" && K.kpiProperty("papers.qnfo.org") === "qnfo" && K.kpiProperty("ask.qwav.tech") === "qwav" && K.kpiProperty("ipatent.qnfo.org") === "ipatent" && K.kpiProperty("example.net") === "other" && K.kpiProperty("ideas.qnfo.org") === "qnfo" && K.kpiProperty("deep.qwav.tech") === "qwav" && K.kpiProperty("fleet.qnfo.org") === "fleet" && K.kpiProperty("notq08.org") === "other", "hosts map to the owner's five properties, the dashboard, or other");
ok(K.kpiBskyUrl(U1) === "https://bsky.app/profile/did:plc:abc123/post/3aaa" && K.kpiBskyUrl("buffer:xyz") === null && K.kpiBskyUrl("at://x\"/app.bsky.feed.post/1") === null, "a Bluesky uri becomes its public link; anything else has none");
ok(K.kpiHttpUrl("https://example.org/a") === "https://example.org/a" && K.kpiHttpUrl("javascript:alert(1)") === null && K.kpiHttpUrl("https://e.org/\"><script>") === null, "only plain http(s) links are kept");
ok(K.kpiChannel("buffer-linkedin") === "linkedin" && K.kpiChannel("twitter") === "x" && K.kpiChannel("buffer/twitter") === "x" && K.kpiChannel("mastodon/mstdn.science") === "mastodon", "platform names fold to channels");
ok(K.kpiMedian([1, 3, null, 2]) === 2 && K.kpiMedian([1, 2, 3, 4]) === 2.5 && K.kpiMedian([]) === null, "median ignores nulls and is null for no data");
ok(j(K.kpiDays(NOW, 3)).join() === "2026-10-10,2026-10-11,2026-10-12", "kpiDays ends today, oldest first");
ok(K.kpiBufferMetric("Impressions") === "impressions" && K.kpiBufferMetric("Link clicks") === "clicks" && K.kpiBufferMetric("Retweets") === "reposts" && K.kpiBufferMetric("Comments") === "replies" && K.kpiBufferMetric("engagement rate") === null, "Buffer metric labels fold to columns");
ok(K.kpiFmt(1234567) === "1,234,567" && K.kpiFmt(2.25) === "2.3" && K.kpiFmt(null) === null, "numbers are grouped; null stays null");
const maxTerms = Math.max(...Object.values(K.KPI_SQL).map((s) => (s.match(/\bUNION\b/gi) || []).length));
ok(maxTerms === 0 && Object.values(K.KPI_SQL).every((s) => /^SELECT /.test(s) && !/\b(insert|delete|drop|alter|replace into)\b/i.test(s) && !/\bupdate\s/i.test(s)), "every KPI statement is one plain SELECT (no compound select, no write)");
ok(!/qnfo-outreach|OUTREACH\b/.test(block.replace(/\/\/[^\n]*/g, "")) && !/SELECT[^"]*\bemail\b/i.test(Object.values(K.KPI_SQL).join("\n")), "the block never reads the private outreach database or an address column");
ok(!/[^\x00-\x7F]/.test(block), "the block is ASCII (ASCII-SOURCE-1)");

// ---- first read: social_replies and subscribe_funnel do not exist yet
const v = j(await K.kpiData(env, NOW));
const I = v.issues;
ok(v.ok === true && v.as_of === "2026-10-12T09:00:00.000Z" && v.cache_ttl_s === 60 && v.days.length === 14 && v.days[13] === "2026-10-12", "envelope: ok, as_of, ttl, 14 days ending today");
ok(/^\d+\.\d+\.\d+/.test(v.version) && Number(src.match(/var VERSION = "(\d+)\.(\d+)/).slice(1).join(".")) >= 1.3, "VERSION is at least 1.30");
ok(I.open_total === 5 && I.by_priority.map((p) => p.priority + p.n).join() === "critical1,high2,medium1,low1", "open total and priority order critical, high, medium, low");
ok(I.by_category[0].category === "reliability" && I.by_category[0].n === 2 && I.by_category.some((c) => c.category === "(none)" && c.n === 1), "categories ranked, empty category named (none)");
ok(I.median_age_h === 30 && I.oldest.id === Number(iOld) && I.oldest.age_h === 400 && I.over_24h === 3 && I.undated_open === 0, "median age 30 h, oldest 400 h, 3 over 24 h (a created_at in seconds is read as seconds)");
const day = (d) => I.daily.find((x) => x.day === d);
ok(day("2026-10-12").opened === 1 && day("2026-10-11").opened === 2 && day("2026-10-01").opened === 0, "opened per day from created_at; a day with none is a measured 0");
ok(day("2026-10-12").closed === 2 && day("2026-10-12").closed_with_evidence === 2 && day("2026-10-11").closed === 1 && day("2026-10-11").closed_with_evidence === 0 && day("2026-10-10").closed === 0, "closed per day counts each issue once, evidence split out");
ok(day("2026-10-07").closed === null && day("2026-10-07").closed_with_evidence === null && day("2026-10-08").closed === 0 && I.ledger_since === "2026-10-08T15:34:26Z", "a day before the ledger's first row is not measured (null), not 0");
ok(I.closed_24h.closed === 3 && I.closed_24h.still_closed === 2 && I.closed_24h.with_evidence === 1 && I.closed_24h.reopened_since === 1 && I.closed_24h.complete === true, "24 h: 3 closed, 2 still closed, 1 of those with evidence, 1 reopened since");
ok(I.closed_7d.closed === 4 && I.closed_7d.with_evidence === 2 && I.closed_7d.complete === false && I.notes.some((n) => /younger than 7 days/.test(n)), "7 d: counted, and flagged as covering less than 7 days of ledger");
ok(I.code_tasks.merged.total === 2 && I.code_tasks.merged.last_7d === 1 && I.code_tasks.failed.total === 2 && I.code_tasks.failed.last_7d === 2 && I.code_tasks.in_flight.total === 1 && I.code_tasks.closed_unmerged.total === 1, "code tasks: merged, failed (with failed publish), in flight, closed");
const P = v.reach.pageviews, prop = (k) => P.properties.find((p) => p.key === k), pd = (k, d) => prop(k).daily.find((x) => x.day === d);
ok(P.basis[P.days.indexOf("2026-10-10")] === "page-rows" && P.basis[P.days.indexOf("2026-10-11")] === "host" && P.basis[P.days.indexOf("2026-10-12")] === null && P.data_through === "2026-10-11", "each day names its basis; a day with no ingest has none");
ok(pd("q08", "2026-10-10").pageviews === 45 && pd("reading", "2026-10-10").pageviews === 20 && pd("qnfo", "2026-10-10").pageviews === 30 && pd("other", "2026-10-10").pageviews === 5 && pd("q08", "2026-10-10").visits === null, "page-rows day: hosts from page ids, papers under QNFO, overflow under other, visits not measured");
ok(pd("q08", "2026-10-11").pageviews === 32 && pd("q08", "2026-10-11").visits === 13 && pd("ipatent", "2026-10-11").pageviews === 8 && pd("qwav", "2026-10-11").visits === 5 && pd("other", "2026-10-11").pageviews === 5 && pd("reading", "2026-10-11").pageviews === 0 && pd("reading", "2026-10-11").visits === 0, "host day: host rows win over page rows, visits measured, an absent host is a measured 0");
ok(pd("q08", "2026-10-12").pageviews === null && pd("q08", "2026-10-05").pageviews === null && prop("q08").pageviews === 77 && prop("q08").visits === 13, "days without an ingest are null and stay out of the totals");
ok(P.all.find((x) => x.day === "2026-10-10").pageviews === 100 && P.all.find((x) => x.day === "2026-10-09").pageviews === null, "the all-sites row is carried, null where absent");
const A = v.reach.actions, E = v.reach.events, ser = (list, k, key) => list.find((s) => s[key] === k);
ok(ser(A.series, "email (first message)", "channel").total === 2 && ser(A.series, "email (follow-up)", "channel").total === 1 && ser(A.series, "bluesky", "channel").total === 2 && ser(A.series, "mastodon (via Buffer)", "channel").total === 1 && ser(A.series, "linkedin (via Buffer)", "channel").total === 1 && A.total === 7, "actions per channel: mail, direct posts, Buffer posts; heartbeat, failed and out-of-window rows left out");
ok(ser(A.series, "bluesky", "channel").daily[v.days.indexOf("2026-10-11")] === 1 && ser(A.series, "bluesky", "channel").daily[v.days.indexOf("2026-10-12")] === 0, "an action series is per day");
ok(ser(E.series, "link clicks from mastodon", "event").total === 7 && ser(E.series, "link clicks from bluesky", "event").total === 4 && ser(E.series, "email replies", "event").total === 1 && ser(E.series, "mentions found on bluesky", "event").total === 2 && !ser(E.series, "link clicks from probe", "event"), "events: human link clicks (bot and probe clicks left out), mail replies, mentions");
const sr = ser(E.series, "replies by other accounts", "event");
ok(sr && sr.total === null && sr.daily === null && sr.reason === "table not created yet" && E.total === 16, "a table that does not exist yet is an unmeasured series, and the total leaves it out");
const T = v.reach.top_posts;
ok(T.top.length === 4 && T.top[1].title === "Preview of proj-m" && T.top[1].score === 7 && T.top[1].url === null && T.top[1].likes === null && T.top[1].impressions === null, "a Buffer post ranks on the fleet's click count; its platform figures and link are null, not 0");
ok(T.top[0].id === U1 && T.top[0].score === 7 && T.top[0].clicks === 4 && T.top[0].likes === 2 && T.top[0].url === "https://bsky.app/profile/did:plc:abc123/post/3aaa" && T.top[0].replies_by_others === null && T.top[0].replies_all === 1, "a Bluesky post: latest snapshot only, link built, clicks by campaign, own-thread replies not scored");
ok(T.top[2].id === U2 && T.top[2].title === "Thread two" && T.top[2].score === 6 && T.top[3].id === "buf-l-1" && T.top[3].clicks === 2 && T.ranked_of === 5, "a uri inside a JSON post_uri still finds its thread; a tie goes to the newer post; a campaign tag cut at 64 characters still matches its post");
ok(!T.top.some((p) => p.id === U3) && T.snapshot === "2026-10-12" && T.top.every((p, i) => p.rank === i + 1), "a post with no reader action is not ranked; ranks are 1..n");
const ppc = v.reach.posts_per_channel.rows, pr = (ch, tb) => ppc.find((x) => x.channel === ch && x.table === tb);
ok(pr("bluesky", "social_threads").total === 2 && pr("bluesky", "social_threads").last_7d === 1 && pr("mastodon", "social_media_posts").via === "Buffer" && pr("mastodon", "social_media_posts").last_7d === 1 && !pr("x", "social_media_posts") && pr("bluesky", "dissemination_tracker").total === 1 && pr("bluesky", "dissemination_tracker").last_30d === 1, "posts per channel, each ledger on its own, failed posts left out");
const S = v.reach.subscribers, C = v.reach.credibility;
ok(S.total === 3 && S.subscribed === 1 && S.pending === 2 && S.funnel_30d === null && S.notes.some((n) => /not measured/.test(n)) && !JSON.stringify(S).includes("example.org"), "subscribers by state, counts only; the funnel is unmeasured while its table is missing");
ok(C.citations.citations === 3 && C.citations.works === 2 && C.citations.day === "2026-10-11" && C.mentions.find((m) => m.source === "openalex-citation").last_30d === 1 && C.mentions.find((m) => m.source === "bluesky").last_30d === 0 && C.recent[0].url === "https://example.org/w1" && C.recent[1].url === null, "credibility: latest citation day, mentions by source, unsafe link dropped");
ok(C.mail_outcomes.find((m) => m.outcome === "(awaiting)").n === 1 && C.mail_outcomes.find((m) => m.outcome === "positive").n === 1, "mail outcomes counted, a null outcome is awaiting");
const B = v.buffer;
ok(B.integration.posting === true && B.integration.per_post_statistics === false && B.statistics_collector.posts_with_statistics_30d === 0 && B.statistics_collector.last_run === "2026-09-20" && B.notes.some((n) => /not measured/.test(n)), "Buffer: posting works, per-post statistics are reported as not collected");
ok(B.channels.length === 2 && B.channels.find((c) => c.service === "x").connected === false && B.posts.length === 2 && B.posts.find((p) => p.id === "buf-m-1").buffer_status === "ok" && B.posts.find((p) => p.id === "buf-l-1").buffer_status === null && B.posts.every((p) => p.impressions === null && p.likes === null && p.buffer_clicks === null), "Buffer channels and posts; a bad engagement_metrics JSON is tolerated; no statistic is invented");
ok(v.unreadable.map((u) => u.read).sort().join() === "funnel,other_replies,social_reply_day" && v.unreadable.every((u) => u.reason === "table not created yet"), "the envelope lists exactly the reads that returned nothing");
ok(!JSON.stringify(v).includes("person@example.org"), "no outreach address leaves the block");

// ---- cache
const before = reads;
await K.kpiData(env, NOW + 30e3);
ok(reads === before, "a second read inside the TTL costs no query");
await K.kpiData(env, NOW + K.KPI_TTL_MS + 1);
ok(reads > before, "after the TTL the data is computed again");

// ---- page
const html = K.kpiHtml(v, false);
ok(html.includes('data-current="kpi"') && html.includes('id="issues"') && html.includes('id="reach"') && html.includes('id="buffer"') && html.includes('href="/api/kpi"'), "the page has the three sections, the nav state and the JSON link");
ok((html.match(/class="kp-src"/g) || []).length >= 13 && html.includes("As of 2026-10-12 09:00 UTC"), "every panel states its source and as-of time");
ok(html.includes('<abbr class="kp-u"') && html.includes(">not measured</abbr>") && html.includes('class="u" title="2026-10-07: closed not measured"'), "unmeasured values and days are shown as not measured");
ok(html.includes("Thread one &lt;b&gt;") && !html.includes("Thread one <b>") && !html.includes("javascript:"), "titles are escaped and unsafe links never rendered");
ok(html.includes('href="https://bsky.app/profile/did:plc:abc123/post/3aaa"') && html.includes("(no post link stored)"), "a ranked post links to the post when a link exists and says so when none is stored");
ok(!/<script/i.test(html.replace(/^.*?<main/s, "<main")) && !/claude\.ai|anthropic\.com/.test(html), "the page body carries no script and no off-fleet runtime link");
ok(/--kp-a:#008A7B;--kp-b:#B5562A/.test(K.KPI_CSS) && /data-theme=\\?"dark\\?"\]\{--kp-a:#2AA595;--kp-b:#D06C3E/.test(K.KPI_CSS) && /@media \(max-width:560px\)/.test(K.KPI_CSS), "chart colours are set for light and dark (validated pairs) and the layout has a phone breakpoint");
if (process.env.KPI_HTML_OUT) writeFileSync(process.env.KPI_HTML_OUT, html);

// ---- second read: the two new tables exist, Buffer statistics arrive
db.exec(`CREATE TABLE social_replies (reply_uri TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT NOT NULL, created_at TEXT, collected_at TEXT);
  CREATE TABLE subscribe_funnel (day TEXT NOT NULL, stage TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, stage, source));
  INSERT INTO social_replies VALUES ('r1', 'bluesky', '${U3}', '2026-10-11T10:00:00Z', '2026-10-12'), ('r2', 'bluesky', '${U3}', '2026-10-11T11:00:00Z', '2026-10-12');
  INSERT INTO subscribe_funnel VALUES ('2026-10-12', 'confirmed', '', 1), ('2026-10-12', 'submit', 'qnfo.org', 3), ('2026-10-11', 'submit', 'papers', 1), ('2026-10-12', 'confirm_mail_sent', '', 2), ('2026-08-01', 'submit', '', 50);`);
eng("buffer", "buf-m-1", "Impressions", 120, "2026-10-11", "count"); eng("buffer", "buf-m-1", "Impressions", 150, "2026-10-12", "count"); eng("buffer", "buf-m-1", "Likes", 3, "2026-10-12", "count"); eng("buffer", "buf-m-1", "Clicks", 6, "2026-10-12", "count");
K.reset();
const w = j(await K.kpiData(env, NOW));
ok(w.unreadable.length === 0, "with both tables present every read succeeds");
ok(w.reach.events.series.find((s) => s.event === "replies by other accounts on bluesky").total === 2, "replies by other accounts are counted per day once the table exists");
ok(w.reach.subscribers.funnel_30d.map((f) => f.stage + f.n).join() === "submit4,confirm_mail_sent2,confirmed1", "the funnel is in step order over 30 days");
const u3 = w.reach.top_posts.top.find((p) => p.id === U3), bm = w.buffer.posts.find((p) => p.id === "buf-m-1");
ok(u3 && u3.replies_by_others === 2 && u3.score === 2, "a post with replies by others now ranks");
ok(bm.impressions === 150 && bm.likes === 3 && bm.buffer_clicks === 6 && w.buffer.integration.per_post_statistics === true && w.buffer.statistics_collector.posts_with_statistics_30d === 1 && !w.buffer.notes.some((n) => /not measured/.test(n)), "Buffer statistics, once collected, are shown per post (latest value) and the gap note goes");
ok(w.reach.top_posts.top[0].id === "buf-m-1" && w.reach.top_posts.top[0].score === 10, "the ranking uses the Buffer figures when they exist");

// ---- a D1 failure leaves the page standing
K.reset();
const broken = { AUDIT: { prepare: (sql) => { if (/FROM agent_issues/.test(sql)) throw new Error("D1_ERROR: boom"); return shim.prepare(sql); } } };
const x = j(await K.kpiData(broken, NOW));
ok(x.ok === true && x.issues.open_total === null && x.issues.by_priority === null && x.issues.median_age_h === null && x.reach.pageviews.properties.length === 7 && x.unreadable.some((u) => u.read === "open_priority" && u.reason === "query failed"), "a failed read makes its values null (never 0) and the rest still answers");
ok(!JSON.stringify(x).includes("boom"), "a D1 error text is never echoed");
ok(K.kpiHtml(x, false).includes("agent_issues could not be read"), "the page says which read failed instead of showing a number");

// ---- the ingest's per-host rows
const hr = j(K.reachRumHostRows([{ count: 10, sum: { visits: 4 }, dimensions: { requestHost: "Q08.org" } }, { count: 2, sum: { visits: 1 }, dimensions: { requestHost: "q08.org" } }, { count: 5, dimensions: { requestHost: "" } }], "2026-10-11"));
ok(hr.length === 3 && hr.find((r) => r.entity_id === "q08.org" && r.metric === "pageviews").value === 12 && hr.find((r) => r.entity_id === "q08.org" && r.metric === "visits").value === 5 && hr.every((r) => r.entity_type === "host" && r.source === "cf-rum-human" && r.quality === "human") && !hr.some((r) => r.entity_id === "(unknown-host)" && r.metric === "visits"), "host rows: page loads always, visits only where the response carried them");
ok(/hq\.replace\("\{ count dimensions", "\{ count sum \{ visits \} dimensions"\)/.test(src) && src.includes('reachRumQuery("requestHost", geq, leq, "bot: 0")') && /\{ count dimensions \{ " \+ dims/.test(src), "the ingest asks for the visit sum per host with bots excluded, on the query shape reachRumQuery really builds");
ok(/path === "\/kpi" \|\| path === "\/kpi\/" \|\| path === "\/api\/kpi"/.test(src) && /\["Metrics", "\/kpi", "kpi"\]/.test(src), "the routes and the nav tab are wired");
const routeAt = src.indexOf('path === "/api/kpi") && request.method === "GET"'), routeEnd = src.indexOf("\n  }\n", routeAt);
ok(routeAt > 0 && !/LOOP_TOKEN|x-loop-token|owner\.authed\) return|401|403/.test(src.slice(routeAt, routeEnd)), "the read is open: no token, key or login on the route (OPEN-ACCESS-1)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
