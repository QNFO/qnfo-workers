// qnfo-social 0.14.0 offline suite: SOCIAL-CHECK-FAIL-CLOSED-1 (agent_issues 2501), MASTODON-PUBLIC-STATS-1 (2481, 2374),
// LEARNER-COVERAGE-1 (2381) and UTM-CREDIT-1 (2036).
// Proves: a stray "[1]" never reads as a clean thread and an issue list after it is found; an issue keyed problem / claim /
// text counts; only a reply that is exactly [] is clean; the Mastodon public status counts become platform buffer rows for
// posts Buffer left without metrics, bounded at 30 a run, newest first, a non-200 answer counted as an error; a post the
// drain sent without a learner decision gets a backfill decision; a post with no engagement snapshot but utm clicks is
// credited with source utm (a pending row and a no-data row re-read), a row with neither stays no-data.
// Run: node qnfo-social/fail-closed-utm.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// ---- SOCIAL-CHECK-FAIL-CLOSED-1 ----
{
  const P = mod.parseCheckerIssues;
  const a = P('See [1] for the method. [{"post": 2, "issue": "invented figure"}]');
  ok(Array.isArray(a) && a.length === 1 && a[0].issue === "invented figure" && a[0].post === 2, "see [1] then an issue list returns that list: " + JSON.stringify(a));
  ok(P("see [1]") === null, "see [1] alone returns null (not clean)");
  ok(P('["a", "b"]') === null, "an array of strings is not an issue list");
  ok(JSON.stringify(P("[]")) === "[]", "exactly [] is clean");
  ok(JSON.stringify(P("```json\n[]\n```")) === "[]", "fenced [] is clean");
  ok(P("The thread is faithful: []") === null, "an embedded [] in prose is not a clean verdict (fail-closed)");
  ok(P("no brackets at all") === null, "no array returns null");
  ok(P("") === null && P(null) === null, "empty reply returns null");
  const b = P('[{"post": 1, "problem": "overclaim"}, {"post": 3, "claim": "first ever"}, {"post": 4, "text": "x"}]');
  ok(b && b.length === 3 && b[0].issue === "overclaim" && b[1].issue === "first ever" && b[2].issue === "x", "problem / claim / text keys count as issues");
  const c = P('[{"post": 2, "severity": "high"}]');
  ok(c && c.length === 1 && /unparsed checker finding/.test(c[0].issue), "an object with no known key is kept as an issue, never dropped");
  const d = P('Note [sic] and [1, 2]: [{"issue": "y"}]');
  ok(d && d.length === 1 && d[0].issue === "y", "non-JSON brackets and number arrays are skipped");
}

// ---- MASTODON-PUBLIC-STATS-1 ----
const NOW = Date.parse("2026-10-13T07:00:00Z");
const iso = (hAgo) => new Date(NOW - hAgo * 36e5).toISOString();
{
  const R = mod.mastodonStatusRef;
  ok(JSON.stringify(R("https://mastodon.social/@qnfo/115123456789012345")) === JSON.stringify({ host: "mastodon.social", id: "115123456789012345" }), "status link parsed");
  ok(R("https://mastodon.social/@qnfo") === null && R("http://mastodon.social/@q/1") === null && R("https://x.com/qnfo/status/1") === null, "non-status links refused");
}
const realFetch = globalThis.fetch;
const realLog = console.log;
{
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (/\/404$/.test(url)) return new Response("not found", { status: 404 });
    const id = String(url).split("/").pop();
    return new Response(JSON.stringify({ id, favourites_count: 4, reblogs_count: 1, replies_count: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  console.log = () => {};
  const nodes = [
    { id: "b1", status: "sent", sentAt: iso(10), externalLink: "https://mastodon.social/@qnfo/101", metrics: null },
    { id: "b2", status: "sent", sentAt: iso(5), externalLink: "https://mastodon.social/@qnfo/102", metrics: [{ type: "reactions", value: 2 }] },
    { id: "b3", status: "sent", sentAt: iso(5), externalLink: "https://bsky.app/profile/x/post/1", metrics: null },
    { id: "b4", status: "sent", sentAt: iso(3), externalLink: "https://mastodon.social/@qnfo/404", metrics: null },
    { id: "b5", status: "draft", externalLink: "https://mastodon.social/@qnfo/105", metrics: null }
  ];
  const r = await mod.mastodonPublicStats(nodes, NOW);
  console.log = realLog;
  ok(r.requests === 2 && calls.length === 2, "only sent posts with null metrics and a status link are read: " + JSON.stringify(calls));
  ok(calls[0].endsWith("/api/v1/statuses/404") && calls[1] === "https://mastodon.social/api/v1/statuses/101", "newest first, public API path");
  ok(r.errors === 1, "a 404 counts as an error and is skipped");
  ok(r.rows.length === 3 && r.rows.every((x) => x.post_id === "b1") && r.rows.some((x) => x.metric === "favourites" && x.value === 4) && r.rows.some((x) => x.metric === "replies" && x.value === 0), "favourites, reblogs, replies rows keyed by the Buffer id (a zero is kept)");
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ id: "m" + i, status: "sent", sentAt: iso(i + 1), externalLink: "https://mastodon.social/@qnfo/" + (1000 + i), metrics: null });
  calls.length = 0;
  console.log = () => {};
  const r2 = await mod.mastodonPublicStats(many, NOW);
  console.log = realLog;
  ok(r2.requests === mod.MASTODON_PUBLIC_MAX && mod.MASTODON_PUBLIC_MAX === 30, "bounded at 30 statuses a run");
  ok(calls[0].endsWith("/1000") && !calls.some((u) => u.endsWith("/1039")), "the newest 30 are read");
  globalThis.fetch = realFetch;
}

// ---- LEARNER-COVERAGE-1 ----
{
  const dec = mod.learnerBackfillDecision({ id: 7, slug: "jps-metric", title: "A metric for quantum states", posts: JSON.stringify(["What is a metric? https://papers.qnfo.org/papers/jps-metric/", "more"]) }, "thread", Date.parse("2026-10-13T14:30:00Z"));
  ok(dec.chosen_by === "backfill" && dec.source === "thread" && dec.id === 7 && dec.link_slug && dec.slot === mod.learnerSlotOf(Date.parse("2026-10-13T14:30:00Z")), "backfill decision from the row: " + JSON.stringify(dec).slice(0, 200));
  const dd = mod.learnerBackfillDecision({ id: "d1", paper_slug: "qec-landauer", paper_title: "QEC and Landauer", pages_url: "https://papers.qnfo.org/papers/qec-landauer/" }, "dissem", NOW);
  ok(dd.link_slug === "qec-landauer" && dd.source === "dissem", "dissem backfill link slug = the utm campaign");
}

// ---- record + UTM-CREDIT-1 against an in-memory D1 ----
function makeEnv() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
    note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));
  CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL,
    quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));`);
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
  return { db, env: { DB: { prepare: stmt, async batch(list) { for (const s of list) s._run(); return []; } } } };
}
{
  const { db, env } = makeEnv();
  await mod.ensureLearnerSchema(env);
  // a backfilled record never sets the spacing marker
  const r = await mod.learnerRecordPost(env, mod.learnerBackfillDecision({ id: "d9", paper_slug: "qec-landauer", paper_title: "Quantum error correction and the Landauer bound", pages_url: "https://papers.qnfo.org/papers/qec-landauer/" }, "dissem", NOW), "at://did/app.bsky.feed.post/9", NOW);
  const row = db.prepare("SELECT chosen_by, link_slug FROM social_learner_posts WHERE post_key = 'dissem:d9'").get();
  ok(row && row.chosen_by === "backfill" && row.link_slug === "qec-landauer" && r.chosen_by === "backfill", "backfill row recorded: " + JSON.stringify(row));
  ok(!db.prepare("SELECT 1 FROM ops_config WHERE key = 'social_learner_pending'").get(), "a backfilled post leaves the 24h spacing marker alone");

  const ins = db.prepare("INSERT INTO social_learner_posts (post_key, slug, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, channel, buffer_id, created_at) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?)");
  ins.run("channel:m1", "jps-metric", "jps-metric", "quantum", "single", "afternoon", iso(24 * 6), "channel-drain", "no-data", "mastodon", "bm1", iso(24 * 6));
  ins.run("channel:x1", "qec-landauer", "qec-landauer", "quantum", "single", "afternoon", iso(24 * 5), "channel-drain", "pending", "x", "bx1", iso(24 * 5));
  ins.run("channel:l1", "nothing", "nothing", "quantum", "single", "afternoon", iso(24 * 5), "channel-drain", "pending", "linkedin", "bl1", iso(24 * 5));
  ins.run("channel:old", "jps-metric", "jps-metric", "quantum", "single", "afternoon", iso(24 * 20), "channel-drain", "no-data", "mastodon", "bo1", iso(24 * 20));
  const day = (h) => iso(h).slice(0, 10);
  const rs = db.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value) VALUES (?, 'utm', ?, 'campaign', ?, 'clicks_human', ?)");
  rs.run(day(24 * 6 - 2), "mastodon", "jps-metric", 5);
  rs.run(day(24 * 5 - 2), "twitter", "qec-landauer", 3);
  rs.run(day(24 * 20 - 2), "mastodon", "jps-metric", 9);
  const out = { credited: 0, no_data: 0, waiting: 0, rewards: [] };
  console.log = () => {};
  await mod.learnerCreditPending(env, NOW, out);
  console.log = realLog;
  const st = (k) => db.prepare("SELECT status, visits, reward_detail FROM social_learner_posts WHERE post_key = ?").get(k);
  const m1 = st("channel:m1"), x1 = st("channel:x1"), l1 = st("channel:l1"), old = st("channel:old");
  ok(m1.status === "credited" && m1.visits === 5 && /"source":"utm"/.test(m1.reward_detail) && /recredited_from/.test(m1.reward_detail), "a no-data row with utm clicks is re-credited with source utm: " + JSON.stringify(m1));
  ok(x1.status === "credited" && x1.visits === 3 && /"source":"utm"/.test(x1.reward_detail), "a pending channel row with no engagement but utm clicks (x via utm_source twitter) is credited: " + JSON.stringify(x1));
  ok(l1.status === "no-data", "no engagement and no utm click: no-data as before");
  ok(old.status === "no-data", "a no-data row older than 14 days is not re-read");
  ok(out.credited === 2 && out.no_data === 1, "counts: " + JSON.stringify(out));
  const n = db.prepare("SELECT COUNT(*) AS n FROM social_learner_posts WHERE status = 'credited' AND COALESCE(chosen_by, '') <> 'learner'").get().n;
  ok(n === 2, "the issue-2381 probe shape passes on this data");
  const out2 = { credited: 0, no_data: 0, waiting: 0, rewards: [] };
  await mod.learnerCreditPending(env, NOW + 864e5, out2);
  ok(out2.credited === 0, "a credited row is never credited twice");
}

// ---- CRON-ONLY-HEARTBEAT-1 (#2397) ----
{
  const { db, env } = makeEnv();
  db.exec("CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER)");
  await mod.socialHeartbeat(env, true);
  let hb = db.prepare("SELECT * FROM fleet_heartbeat WHERE worker = 'qnfo-social'").get();
  ok(hb && hb.ok === 1 && hb.version && hb.ts, "heartbeat row written ok=1");
  await mod.socialHeartbeat(env, false);
  hb = db.prepare("SELECT ok, COUNT(*) OVER () AS n FROM fleet_heartbeat").get();
  ok(hb.ok === 0 && hb.n === 1, "a failed run upserts ok=0 on the same row");
  const errs = [];
  const realErr = console.error;
  console.error = (m) => errs.push(String(m));
  let threw = false;
  try { await mod.socialHeartbeat({ DB: { prepare() { throw new Error("d1 down"); } } }, true); } catch (e) { threw = true; }
  console.error = realErr;
  ok(!threw && errs.some((m) => /fleet_heartbeat write failed: d1 down/.test(m)), "a heartbeat write error is logged, never thrown");
  // the default scheduled handler: a run that throws still writes ok=0, then rethrows
  const calls = [];
  const env2 = { DB: { prepare(sql) { calls.push(sql); return { bind(...a) { calls.push(a); return { async run() { return { meta: { changes: 1 } }; } }; } }; } } };
  console.error = () => {};
  console.log = () => {};
  let rethrown = false;
  try { await mod.default.scheduled(null, env2); } catch (e) { rethrown = e instanceof TypeError; }   // a null event throws inside the run
  console.error = realErr;
  console.log = realLog;
  const hbArgs = calls.find((x) => Array.isArray(x) && x[0] === "qnfo-social");
  ok(rethrown && hbArgs && hbArgs[3] === 0, "scheduled: a thrown run writes ok=0 and still surfaces the error");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
