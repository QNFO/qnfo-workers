// LEARNER-ARMS-3 offline suite (qnfo-social 0.19.4, agent_issues 2722, pillar reach). A paper the Bluesky roll-up thread carries keeps the
// posted_at of the Substack roll-up that announced it (dissemination_tracker mode rollup:bluesky), days before the Bluesky post exists, so the
// learner opened its 72 hour reward window before the post and 135 posts read no-data although each had utm human clicks inside its real
// window (qnfo-audit, read 2026-10-26). This suite drives the real worker.js against an in-memory SQLite shim of the production schema and
// proves: a Bluesky record key (TID) decodes to the creation time (the real key 3myoouytiis2r is 2026-10-25T07:32:07.585Z) and anything that
// is not a TID or not plausible has no time; learnerPostedAtOf takes the key's time only when it is later than the tracker's and not in the
// future; learnerDiscover files a roll-up post under its real time, slot and with n_posts 2, and leaves a post the drain sent as it was;
// learnerCreditPending then credits the roll-up post on the utm clicks of its real window and drops the reply that is the next post of the
// same thread from its engagement; the SQL decode used by migrations/2026-10-26-learner-anchor-repair.sql agrees with blueskyTidMs.
// Run: node qnfo-social/learner-anchor.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function shim(conn) {
  const stmtOn = (sql) => {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: conn.prepare(sql).all(...args) }; },
      async first() { return conn.prepare(sql).get(...args) || null; },
      async run() { const r = conn.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _exec() { return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: conn.prepare(sql).all(...args) } : (() => { const r = conn.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; })(); }
    };
    return s;
  };
  return { prepare: (sql) => stmtOn(sql), async batch(list) { return list.map((s) => s._exec()); } };
}

// An independent encoder: a TID is (microseconds << 10 | clock id) in 13 base32-sortable characters.
const A = "234567abcdefghijklmnopqrstuvwxyz";
function tidOf(ms, clock) {
  let v = BigInt(Math.round(ms)) * 1000n * 1024n + BigInt(clock || 0);
  let s = "";
  for (let i = 0; i < 13; i++) { s = A[Number(v % 32n)] + s; v = v / 32n; }
  return s;
}
const uriOf = (key) => "at://did:plc:vad2yeqflg5uznmp557zge5c/app.bsky.feed.post/" + key;
const DAY = 864e5, HOUR = 36e5;

// ---------- 1. blueskyTidMs ----------
ok(mod.blueskyTidMs(uriOf("3myoouytiis2r")) === 1792913527585 && new Date(mod.blueskyTidMs(uriOf("3myoouytiis2r"))).toISOString() === "2026-10-25T07:32:07.585Z", "the real record key 3myoouytiis2r is 2026-10-25T07:32:07.585Z (the Bluesky roll-up of that morning)");
for (const ms of [Date.UTC(2026, 9, 14, 12, 31, 34, 123), Date.UTC(2026, 9, 25, 7, 32, 11, 999), Date.UTC(2024, 1, 29, 23, 59, 59, 1)]) {
  ok(mod.blueskyTidMs(uriOf(tidOf(ms, 517))) === ms, "a key built from " + new Date(ms).toISOString() + " decodes to the same millisecond");
}
ok(mod.blueskyTidMs("at://did:plc:me/app.bsky.feed.post/adelic") === null && mod.blueskyTidMs("") === null && mod.blueskyTidMs(null) === null && mod.blueskyTidMs(undefined) === null, "a key that is not a TID (a test slug, an empty value) has no time");
ok(mod.blueskyTidMs(uriOf("3MYOOUYTIIS2R")) === null && mod.blueskyTidMs(uriOf("3myoouytiis2")) === null && mod.blueskyTidMs(uriOf("3myoouytiis2r9")) === null && mod.blueskyTidMs(uriOf("3myoouytiis2!")) === null, "upper case, 12 or 14 characters and a character outside the alphabet are not TIDs");
ok(mod.blueskyTidMs("at://did:plc:me/app.bsky.feed.repost/3myoouytiis2r") === null && mod.blueskyTidMs("3myoouytiis2r") === null, "only an app.bsky.feed.post record key is read");
ok(mod.blueskyTidMs(uriOf(tidOf(Date.UTC(2019, 0, 1), 0))) === null, "a time before 2023 is not a plausible Bluesky post time");

// ---------- 2. learnerPostedAtOf ----------
const NOW = Date.UTC(2026, 9, 26, 18, 0, 0);
const announced = "2026-10-18 20:01:20";
const real = Date.UTC(2026, 9, 25, 7, 32, 7, 585);
ok(mod.learnerPostedAtOf(uriOf(tidOf(real, 0)), announced, NOW) === "2026-10-25T07:32:07.585Z", "a roll-up post carried a week after its announcement is filed under the key's time");
const sent = "2026-10-20 15:20:00";
ok(mod.learnerPostedAtOf(uriOf(tidOf(Date.UTC(2026, 9, 20, 15, 20, 4), 0)), sent, NOW) === sent, "a post the drain sent (key and tracker within seconds) keeps the tracker's value, byte for byte");
ok(mod.learnerPostedAtOf(uriOf(tidOf(Date.UTC(2026, 9, 20, 16, 0, 0), 0)), sent, NOW) === sent, "a key under an hour after the tracker's value is not moved");
ok(mod.learnerPostedAtOf(uriOf(tidOf(Date.UTC(2026, 9, 20, 14, 0, 0), 0)), sent, NOW) === sent, "a key earlier than the tracker's value is not moved (the tracker's time is the later one)");
ok(mod.learnerPostedAtOf(uriOf(tidOf(NOW + 3 * DAY, 0)), announced, NOW) === announced, "a key in the future is not a post time: the tracker's value stays");
ok(mod.learnerPostedAtOf("at://did:plc:me/app.bsky.feed.post/adelic", announced, NOW) === announced, "a key that is not a TID leaves the tracker's value");
ok(mod.learnerPostedAtOf(uriOf(tidOf(real, 0)), null, NOW) === "2026-10-25T07:32:07.585Z", "a tracker row with no posted_at takes the key's time");

// ---------- 3. learnerDiscover files a roll-up post under its real time ----------
function fixture() {
  const conn = new DatabaseSync(":memory:");
  conn.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_url TEXT, post_id TEXT, post_text_snippet TEXT, mode TEXT, fallback INTEGER DEFAULT 0, posted_at TEXT, pages_url TEXT, github_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));`);
  return conn;
}
const isoTs = (ms) => new Date(ms).toISOString();
const conn = fixture();
const FIVE_AGO = NOW - 5 * DAY;
const ROLL_REAL = FIVE_AGO - (FIVE_AGO % DAY) + 15 * HOUR + 18 * 6e4;                      // 15:18 UTC five days ago: slot us-morning
const ROLL_SLUG = "casimir-energy-of-a-thin-wire", SINGLE_SLUG = "landauer-limit-of-a-neuromorphic-array", ODD_SLUG = "a-paper-with-a-test-key";
const ins = conn.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_url, post_id, mode, posted_at, pages_url) VALUES (?, ?, ?, 'bluesky', 'posted', ?, ?, ?, ?, ?)");
// a roll-up post: announced by the Substack roll-up 12 days ago, carried by the Bluesky thread 5 days ago
ins.run("res-roll", ROLL_SLUG, "Casimir Energy of a Wire", "https://bsky.app/profile/qnfo.org/post/x", uriOf(tidOf(ROLL_REAL, 33)), "rollup:bluesky", isoTs(NOW - 12 * DAY), "https://papers.qnfo.org/papers/" + ROLL_SLUG + "/");
// a post the drain sent 2 days ago (key and tracker agree to the second)
const SENT = NOW - 2 * DAY;
ins.run("res-single", SINGLE_SLUG, "Landauer Limit of a Neuromorphic Array", "https://bsky.app/profile/qnfo.org/post/y", uriOf(tidOf(SENT + 4000, 7)), "auto", isoTs(SENT), "https://papers.qnfo.org/papers/" + SINGLE_SLUG + "/");
// a roll-up post whose key is not a TID (a legacy or test row): the tracker's time stays
ins.run("res-odd", ODD_SLUG, "A Paper With A Test Key", "https://bsky.app/profile/qnfo.org/post/z", "at://did:plc:me/app.bsky.feed.post/oddkey", "rollup:bluesky", isoTs(NOW - 3 * DAY), "https://papers.qnfo.org/papers/" + ODD_SLUG + "/");
const env = { DB: shim(conn), AI: {} };
await mod.ensureLearnerSchema(env);
const n = await mod.learnerDiscover(env, NOW);
const row = (k) => conn.prepare("SELECT * FROM social_learner_posts WHERE post_key = ?").get(k);
ok(n === 3, "discover files the three Bluesky posts (got " + n + ")");
const r = row("dissem:res-roll");
ok(r.posted_at === isoTs(ROLL_REAL) && r.slot === "us-morning", "the roll-up post is filed under the time it went out on Bluesky (" + r.posted_at + "), not the day its paper was announced, and its slot follows (" + r.slot + ")");
ok(r.n_posts === 2 && r.status === "pending" && r.link_slug === ROLL_SLUG && r.chosen_by === "scheduler" && r.channel === "bluesky", "it is pending with n_posts 2 (the next post of the thread is the fleet's own reply), its link slug and channel bluesky");
const s = row("dissem:res-single");
ok(s.posted_at === isoTs(SENT) && s.n_posts === 1, "a post the drain sent is filed under the tracker's own time with n_posts 1");
const o = row("dissem:res-odd");
ok(o.posted_at === isoTs(NOW - 3 * DAY) && o.n_posts === 2, "a roll-up row whose key has no time keeps the tracker's time (the n_posts still reads the roll-up thread)");
ok(await mod.learnerDiscover(env, NOW) === 0, "a second discover files nothing again");

// ---------- 4. the credit reads the real window and drops the thread's own reply ----------
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const rollDay = day(ROLL_REAL);
const putUtm = conn.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'utm', 'bluesky', 'campaign', ?, ?, ?, 'human')");
putUtm.run(rollDay, ROLL_SLUG, "clicks_human", 7);
putUtm.run(day(ROLL_REAL + DAY), ROLL_SLUG, "clicks_human", 3);
const eng = conn.prepare("INSERT INTO social_engagements (platform, post_id, metric, value, collected_at) VALUES ('bluesky', ?, ?, ?, ?)");
const rollUri = uriOf(tidOf(ROLL_REAL, 33));
eng.run(rollUri, "likes", 0, day(ROLL_REAL + DAY)); eng.run(rollUri, "reposts", 0, day(ROLL_REAL + DAY)); eng.run(rollUri, "quotes", 0, day(ROLL_REAL + DAY)); eng.run(rollUri, "replies", 1, day(ROLL_REAL + DAY));
const out = { credited: 0, no_data: 0, waiting: 0, rewards: [] };
await mod.learnerCreditPending(env, NOW, out);
const rc = row("dissem:res-roll"), rd = JSON.parse(rc.reward_detail || "{}");
ok(rc.status === "credited" && rd.visits && rd.visits.visits === 10 && rd.visits.source === "utm", "the roll-up post is credited on the 10 human utm clicks of its real window (status " + rc.status + ")");
ok(rd.engagement && rd.engagement.replies === 1 && rd.engagement.self_replies === 1 && rd.engagement.e === 0, "the one reply it has is the next post of its own thread: it is not engagement (e " + (rd.engagement && rd.engagement.e) + ")");
ok(Math.abs(rc.reward - (1 - Math.exp(-(10 / 5) / 2))) < 1e-3, "the reward is the clicks' alone: x = 10 / 5 (" + rc.reward + ")");
// the same post filed the old way (announcement day) has no clicks in that window and no snapshot: no-data
const oldConn = fixture();
const oldEnv = { DB: shim(oldConn), AI: {} };
await mod.ensureLearnerSchema(oldEnv);
oldConn.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'utm', 'bluesky', 'campaign', ?, 'clicks_human', 7, 'human')").run(rollDay, ROLL_SLUG);
oldConn.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel) VALUES ('dissem:res-roll', ?, ?, ?, 'physics', 'single', 'us-morning', 1, ?, 'scheduler', 'pending', ?, 'bluesky')").run(ROLL_SLUG, rollUri, ROLL_SLUG, isoTs(NOW - 12 * DAY), isoTs(NOW));
await mod.learnerCreditPending(oldEnv, NOW, { credited: 0, no_data: 0, waiting: 0, rewards: [] });
ok(oldConn.prepare("SELECT status FROM social_learner_posts WHERE post_key = 'dissem:res-roll'").get().status === "no-data", "the same post filed under the announcement day reads no-data although the clicks exist (the defect this change removes)");

// ---------- 5. the repair migration decodes the key the way the worker does ----------
const mig = readFileSync(new URL("../migrations/2026-10-26-learner-anchor-repair.sql", import.meta.url), "utf8");
ok(mig.indexOf("instr('234567abcdefghijklmnopqrstuvwxyz'") >= 0, "the migration decodes the key with the same alphabet");
const mult = ["1125899906842624", "35184372088832", "1099511627776", "34359738368", "1073741824", "33554432", "1048576", "32768", "1024", "32", "1"];
const decodeSql = (key) => {
  const q = new DatabaseSync(":memory:");
  const terms = mult.map((m, i) => "(instr('234567abcdefghijklmnopqrstuvwxyz', substr(k, " + (i + 1) + ", 1)) - 1) * " + m);
  return q.prepare("WITH t(k) AS (SELECT ?) SELECT (" + terms.join(" + ") + ") / 1000 AS ms FROM t").get(key).ms;
};
for (const ms of [real, ROLL_REAL, Date.UTC(2026, 9, 14, 12, 31, 34, 123)]) ok(Math.floor(decodeSql(tidOf(ms, 9))) === ms, "the SQL decode of a key built from " + new Date(ms).toISOString() + " equals the worker's (" + Math.floor(decodeSql(tidOf(ms, 9))) + ")");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
