// PAPER-ROLLUP-1 offline suite (qnfo-social 0.16.0, pillar reach). Drives drainRollup against an in-memory SQLite D1 with stubbed
// Buffer and Bluesky. Proves: one Substack Note lists every queued live paper (oldest first, each link tagged utm_source=substack with
// the paper as campaign, the subscribe line last) and marks them posted with mode rollup; a gone link is suppressed and a transient one
// waits; the Bluesky thread then carries the announced papers, one post each, each row recording its own post id; the thread counts as
// one post in the Bluesky gate; the Substack roll-up waits 50 min between notes; with no Substack channel the papers stay queued and
// Bluesky takes them directly; the paused flag holds everything.
// Run: node qnfo-social/paper-rollup.test.mjs
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

function mkDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT, posted_at TEXT, flags TEXT, notes TEXT, doi TEXT, error TEXT, updated_at TEXT, post_uri TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT, _version INTEGER DEFAULT 1);
  CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_url TEXT, post_id TEXT, post_text_snippet TEXT, mode TEXT, posted_at TEXT, pages_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
  CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, level TEXT, message TEXT);`);
  const ins = db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, created_at) VALUES (?, ?, ?, 'bluesky', 'queued', datetime('now', ?))");
  ins.run("d1", "alpha-paper", "Alpha: a first result", "-5 hours");
  ins.run("d2", "beta-paper", "Beta: a second result", "-4 hours");
  ins.run("d3", "gone-paper", "Gone paper", "-3 hours");
  ins.run("d4", "flaky-paper", "Flaky paper", "-2 hours");
  ins.run("d5", "gamma-paper", "Gamma: a third result", "-1 hours");
  ins.run("old", "ancient-paper", "Ancient", "-40 days");
  return db;
}
function d1(db) {
  const stmtOn = (sql) => { let a = []; const s = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; },
    async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
  return { prepare: stmtOn, async batch(list) { const o = []; for (const x of list) o.push(await x.run()); return o; } };
}
let gql = [], records = [], substackConnected = true;
globalThis.fetch = async (u, init) => {
  const url = String(u);
  if (url === "https://api.buffer.com") {
    const q = JSON.parse(init.body).query; gql.push(q);
    if (q.indexOf("organizations") >= 0) return new Response(JSON.stringify({ data: { account: { organizations: [{ id: "o1" }] } } }), { status: 200 });
    if (q.indexOf("channels(") >= 0) return new Response(JSON.stringify({ data: { channels: substackConnected ? [{ id: "chS", service: "substack", isDisconnected: false }, { id: "chL", service: "linkedin" }] : [{ id: "chL", service: "linkedin" }] } }), { status: 200 });
    if (q.indexOf("createPost") >= 0) return new Response(JSON.stringify({ data: { createPost: { post: { id: "bS" + gql.length, status: "sent" } } } }), { status: 200 });
  }
  if (url.indexOf("createSession") >= 0) return new Response(JSON.stringify({ accessJwt: "jwt", did: "did:plc:me", handle: "qnfo.bsky.social" }), { status: 200 });
  if (url.indexOf("createRecord") >= 0) { const rec = JSON.parse(init.body).record; records.push(rec); return new Response(JSON.stringify({ uri: "at://did:plc:me/app.bsky.feed.post/r" + records.length, cid: "c" + records.length }), { status: 200 }); }
  if (url.indexOf("/papers/gone-paper/") >= 0) return new Response("gone", { status: 404 });
  if (url.indexOf("/papers/flaky-paper/") >= 0) return new Response("err", { status: 503 });
  if (url.indexOf("https://papers.qnfo.org/papers/") === 0) return new Response("<html>paper " + url + "</html>", { status: 200 });
  return new Response("nf", { status: 404 });
};
const env = (db, extra) => Object.assign({ DB: d1(db), BUFFER_TOKEN: "b", BSKY_HANDLE: "qnfo.bsky.social", BSKY_APP_PASS: "p" }, extra || {});

// Pure text
const nt = mod.rollupNoteText([{ title: "A", link: "https://papers.qnfo.org/papers/a/" }, { title: "B", link: "https://papers.qnfo.org/papers/b/" }], 9500);
ok(nt.used === 2 && /^New open-access papers from QNFO \(2\):/.test(nt.text) && /1\. A — https:\/\/papers\.qnfo\.org\/papers\/a\//.test(nt.text) && nt.text.endsWith(mod.SUBSCRIBE_LINE), "note lists numbered titles with links, subscribe line last", nt);
const many = Array.from({ length: 200 }, (_, i) => ({ title: "Paper number " + i + " with a long descriptive title for the list", link: "https://papers.qnfo.org/papers/p" + i + "/" }));
const big = mod.rollupNoteText(many, 9500);
ok(big.used > 20 && big.used < 200 && big.text.length <= 9500, "a long list keeps whole lines inside the limit", { used: big.used, len: big.text.length });

// Full run: Substack note, then Bluesky thread
let db = mkDb();
let r = await mod.drainRollup(env(db));
const note = gql.find((q) => q.indexOf("createPost") >= 0 && q.indexOf("chS") >= 0);
ok(r.substack && r.substack.papers === 3 && note, "Substack note carries the 3 live queued papers", r.substack);
ok(note && /alpha-paper\/\?utm_source=substack&utm_medium=social&utm_campaign=alpha-paper/.test(note) && note.indexOf("Alpha") < note.indexOf("Beta") && note.indexOf("Beta") < note.indexOf("Gamma") && note.indexOf("ancient") < 0, "oldest first, each link tagged with its own paper; the 40-day-old row is left out", note && note.slice(0, 300));
const rows = Object.fromEntries(db.prepare("SELECT id, action, mode, post_id FROM dissemination_tracker").all().map((x) => [x.id, x]));
ok(rows.d3.action === "suppressed" && rows.d4.action === "queued", "a gone link is suppressed, a transient one waits", [rows.d3, rows.d4]);
ok(r.bluesky && r.bluesky.papers === 3 && records.length === 3 && records[0].reply === undefined && records[1].reply && records[0].embed, "the Bluesky thread carries the 3 announced papers, one post each, card on the root", r.bluesky);
ok(/^New open-access papers \(3\), one per post\. 1\/ Alpha/.test(records[0].text) && /^2\/ Beta/.test(records[1].text), "thread text numbers the papers", records.map((x) => x.text));
ok(["d1", "d2", "d5"].every((k) => rows[k].action === "posted" && rows[k].mode === "rollup:bluesky" && /^at:\/\//.test(rows[k].post_id)) && new Set(["d1", "d2", "d5"].map((k) => rows[k].post_id)).size === 3, "each carried paper records its own Bluesky post id", rows);
const g = await mod.socialGate(env(db), "t");
ok(g.posted_7d === 1, "the thread counts as one post in the Bluesky gate", g);
ok(db.prepare("SELECT COUNT(*) n FROM social_media_posts WHERE platform = 'bluesky-rollup'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM social_media_posts WHERE platform = 'buffer-substack'").get().n === 1, "ledger: one Substack roll-up row, one Bluesky roll-up row");

// Next run within 50 min: no second note; Bluesky held by its spacing.
db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action) VALUES ('d6', 'delta-paper', 'Delta', 'bluesky', 'queued')").run();
gql = []; records = [];
r = await mod.drainRollup(env(db));
ok(r.substack.held === "spacing" && r.bluesky.held === "spacing" && records.length === 0, "inside 50 min the note waits; Bluesky waits for its spacing", r);
r = await mod.drainRollup(env(db), { nowMs: Date.now() + 55 * 6e4 });
ok(r.substack.papers === 1 && db.prepare("SELECT action, mode FROM dissemination_tracker WHERE id = 'd6'").get().mode === "rollup", "after 50 min the next note takes the new paper", r.substack);

// No Substack channel: rows stay queued and Bluesky takes them directly.
db = mkDb(); substackConnected = false; gql = []; records = [];
r = await mod.drainRollup(env(db));
ok(r.substack.held === "no-channel" && r.bluesky.papers === 3, "no Substack: Bluesky carries the queued papers directly", r);
substackConnected = true;

// Paused
db = mkDb(); db.prepare("INSERT INTO pipeline_flags VALUES ('social_paused', '1', NULL)").run(); gql = []; records = [];
r = await mod.drainRollup(env(db));
ok(r.skipped === "paused" && gql.length === 0 && records.length === 0, "paused: nothing posted", r);
ok(mod.rollupRunStatus({ substack: { posted: "x" }, bluesky: { error: "e" } }) === "degraded" && mod.rollupRunStatus({ skipped: "paused" }) === "skipped", "run status");

console.log(`paper-rollup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
