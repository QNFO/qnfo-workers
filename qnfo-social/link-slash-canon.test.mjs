// LINK-SLASH-CANON-1 offline suite (qnfo-social 0.19.2, pillar reach). qnfo-gateway SEO-INDEX-1 (2026-10-25) answers
// /papers/<slug>/ with a 308 to /papers/<slug>, and every dissemination_tracker pages_url ends in a slash. probeLink read every one
// of them as 'misrouted', so the channel drain held link-misrouted, both roll-ups held no-live-links and retractDeadLinks overwrote
// post_text_snippet of posted rows with a MISROUTED note. Proves: the probe follows a redirect that only drops (or adds) the trailing
// slash, once, and judges the page it lands on (200 live, marker still required, 404 gone, 503 transient); any other redirect (other
// path, other host, other query, a loop) stays 'misrouted' (NEVER-RETIRE-ON-REDIRECT-1); the Substack note and the Bluesky thread
// carry slash-link papers against a gateway that redirects; retractDeadLinks leaves a live paper's snippet alone and still
// retracts only a hard 404.
// Run: node qnfo-social/link-slash-canon.test.mjs
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

// ---- a gateway double: /papers/<slug>/ -> 308 /papers/<slug> (query kept); the slugless page answers by slug ----
const hits = [];
let gql = [], records = [], deletes = [];
globalThis.fetch = async (u, init) => {
  const url = String(u);
  hits.push(url);
  if (url === "https://api.buffer.com") {
    const q = JSON.parse(init.body).query; gql.push(q);
    if (q.indexOf("organizations") >= 0) return new Response(JSON.stringify({ data: { account: { organizations: [{ id: "o1" }] } } }), { status: 200 });
    if (q.indexOf("channels(") >= 0) return new Response(JSON.stringify({ data: { channels: [{ id: "chS", service: "substack", isDisconnected: false }] } }), { status: 200 });
    if (q.indexOf("createPost") >= 0) return new Response(JSON.stringify({ data: { createPost: { post: { id: "bS" + gql.length, status: "sent" } } } }), { status: 200 });
  }
  if (url.indexOf("createSession") >= 0) return new Response(JSON.stringify({ accessJwt: "jwt", did: "did:plc:me", handle: "qnfo.bsky.social" }), { status: 200 });
  if (url.indexOf("createRecord") >= 0) { const rec = JSON.parse(init.body).record; records.push(rec); return new Response(JSON.stringify({ uri: "at://did:plc:me/app.bsky.feed.post/r" + records.length, cid: "c" + records.length }), { status: 200 }); }
  if (url.indexOf("deleteRecord") >= 0) { deletes.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
  const m = /^https:\/\/papers\.qnfo\.org(\/papers\/([^/?#]+))(\/*)(\?[^#]*)?$/.exec(url);
  if (m) {
    const slug = m[2];
    if (m[3]) return new Response(null, { status: 308, headers: { Location: "https://papers.qnfo.org" + m[1] + (m[4] || "") } });
    if (slug === "gone-paper") return new Response('{"error":"Paper not found"}', { status: 404 });
    if (slug === "flaky-paper") return new Response("err", { status: 503 });
    if (slug === "catchall-paper") return new Response("<html>a list page with no slug</html>", { status: 200 });
    if (slug === "moved-paper") return new Response(null, { status: 301, headers: { Location: "https://papers.qnfo.org/papers/elsewhere" } });
    if (slug === "loop-paper") return new Response(null, { status: 308, headers: { Location: "https://papers.qnfo.org/papers/loop-paper/" } });
    return new Response("<html>paper " + slug + "</html>", { status: 200 });
  }
  if (url === "https://other.example/x/") return new Response(null, { status: 308, headers: { Location: "https://elsewhere.example/x" } });
  if (url === "https://papers.qnfo.org/old/") return new Response(null, { status: 301, headers: { Location: "https://papers.qnfo.org/new" } });
  if (url === "https://papers.qnfo.org/q/?a=1") return new Response(null, { status: 308, headers: { Location: "https://papers.qnfo.org/q?a=2" } });
  return new Response("nf", { status: 404 });
};
const P = "https://papers.qnfo.org/papers/";

// ---- slashCanonTarget: pure ----
const T = mod.slashCanonTarget;
ok(T(P + "a/", P + "a") === P + "a", "drop of the trailing slash is canonical");
ok(T(P + "a", P + "a/") === P + "a/", "add of the trailing slash is canonical");
ok(T(P + "a/", "/papers/a") === P + "a", "a relative Location resolves against the probed URL");
ok(T(P + "a/?utm_source=x", P + "a?utm_source=x") === P + "a?utm_source=x", "the query must be identical");
ok(T(P + "a/?x=1", P + "a?x=2") === null, "a changed query is not canonical");
ok(T(P + "a/", "https://papers.qnfo.org/papers/b") === null, "another path is not canonical");
ok(T(P + "a/", "https://elsewhere.example/papers/a") === null, "another host is not canonical");
ok(T(P + "a/", "http://papers.qnfo.org/papers/a") === null, "another scheme is not canonical");
ok(T(P + "a/", P + "a/") === null && T(P + "a/", "") === null && T(P + "a/", "http://[") === null, "same URL, empty or unparseable Location: null");

// ---- probeLink ----
let p = await mod.probeLink(P + "alpha-paper/");
ok(p.verdict === "live" && p.status === 200, "a slash link whose page answers 200 after the 308 is live", p);
p = await mod.probeLink(P + "alpha-paper/", "alpha-paper");
ok(p.verdict === "live", "the slug marker is found on the landing page", p);
p = await mod.probeLink(P + "catchall-paper/", "catchall-paper");
ok(p.verdict === "misrouted", "the marker check still rejects a catch-all 200", p);
p = await mod.probeLink(P + "gone-paper/", "gone-paper");
ok(p.verdict === "gone" && p.status === 404, "a hard 404 behind the canonical redirect is gone", p);
p = await mod.probeLink(P + "flaky-paper/");
ok(p.verdict === "transient" && p.status === 503, "a 503 behind the canonical redirect is transient", p);
p = await mod.probeLink(P + "moved-paper/");
ok(p.verdict === "misrouted", "a slash redirect that then lands on a real redirect is misrouted (one hop only)", p);
p = await mod.probeLink(P + "loop-paper/");
ok(p.verdict === "misrouted" && p.status === 308, "a slash loop stops after one hop and is misrouted", p);
p = await mod.probeLink("https://papers.qnfo.org/old/");
ok(p.verdict === "misrouted" && p.status === 301 && p.final === "https://papers.qnfo.org/new", "a redirect to another path stays misrouted with its target", p);
p = await mod.probeLink("https://other.example/x/");
ok(p.verdict === "misrouted" && p.final === "https://elsewhere.example/x", "a redirect to another host stays misrouted", p);
p = await mod.probeLink("https://papers.qnfo.org/q/?a=1");
ok(p.verdict === "misrouted", "a redirect that also changes the query stays misrouted", p);
hits.length = 0;
await mod.probeLink(P + "alpha-paper/");
ok(hits.length === 2 && hits[0] === P + "alpha-paper/" && hits[1] === P + "alpha-paper", "exactly two requests: the link, then its canonical form", hits);

// ---- the roll-ups against that gateway ----
function mkDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT, posted_at TEXT, flags TEXT, notes TEXT, doi TEXT, error TEXT, updated_at TEXT, post_uri TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, abstract TEXT);
  CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
  CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_url TEXT, post_id TEXT, post_text_snippet TEXT, mode TEXT, posted_at TEXT, pages_url TEXT, retry_count INTEGER DEFAULT 0, fallback TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
  CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, level TEXT, message TEXT);`);
  return db;
}
function d1(db) {
  const stmtOn = (sql) => { let a = []; const s = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; },
    async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
  return { prepare: stmtOn, async batch(list) { const o = []; for (const x of list) o.push(await x.run()); return o; } };
}
const env = (db) => ({ DB: d1(db), BUFFER_TOKEN: "b", BSKY_HANDLE: "qnfo.bsky.social", BSKY_APP_PASS: "p" });
const ins = (db, id, slug, title, hoursAgo, extra) => db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, pages_url, created_at) VALUES (?, ?, ?, 'bluesky', 'queued', ?, datetime('now', ?))")
  .run(id, slug, title, extra || (P + slug + "/"), "-" + hoursAgo + " hours");

let db = mkDb();
ins(db, "d1", "alpha-paper", "Alpha: a first result", 5);
ins(db, "d2", "beta-paper", "Beta: a second result", 4);
ins(db, "d3", "gone-paper", "Gone paper", 3);
ins(db, "d4", "flaky-paper", "Flaky paper", 2);
gql = []; records = [];
let r = await mod.drainRollup(env(db));
ok(r.substack && r.substack.papers === 2, "Substack note carries the 2 slash-link papers that exist", r.substack);
const note = gql.find((q) => q.indexOf("createPost") >= 0 && q.indexOf("chS") >= 0);
ok(note && /alpha-paper\/\?utm_source=substack&utm_medium=social&utm_campaign=alpha-paper/.test(note) && note.indexOf("gone-paper") < 0, "the note keeps the posted slash link, tagged, and omits the missing paper", note && note.slice(0, 300));
const rows = Object.fromEntries(db.prepare("SELECT id, action, mode, post_id, post_text_snippet FROM dissemination_tracker").all().map((x) => [x.id, x]));
ok(rows.d3.action === "suppressed" && /target paper gone/.test(rows.d3.post_text_snippet) && rows.d4.action === "queued", "a hard 404 is suppressed as before, a 503 waits", [rows.d3, rows.d4]);
ok(r.bluesky && r.bluesky.papers === 2 && records.length === 2 && rows.d1.action === "posted", "the Bluesky thread carries them too", r.bluesky);

// A queue where every link is a slash link and nothing is wrong must not hold as no-live-links (the 2026-10-25 outage shape).
db = mkDb();
for (let i = 1; i <= 5; i++) ins(db, "n" + i, "ok-paper-" + i, "Paper " + i, i);
gql = []; records = [];
r = await mod.drainRollup(env(db));
ok(r.substack.held === undefined && r.substack.papers === 5 && r.bluesky.held === undefined, "five healthy slash-link papers are not held as no-live-links", r);

// ---- retractDeadLinks: a live paper's as-posted text is left alone; only a hard 404 retracts ----
db = mkDb();
const posted = db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, pages_url, post_id, post_text_snippet, posted_at, updated_at) VALUES (?, ?, ?, 'bluesky', 'posted', ?, ?, ?, datetime('now', '-1 hours'), datetime('now', ?))");
posted.run("l1", "alpha-paper", "Alpha", P + "alpha-paper/", "at://did:plc:me/app.bsky.feed.post/a1", "Alpha — https://papers.qnfo.org/papers/alpha-paper/?utm_source=bluesky", "-30 hours");
posted.run("l2", "gone-paper", "Gone", P + "gone-paper/", "at://did:plc:me/app.bsky.feed.post/g1", "Gone — https://papers.qnfo.org/papers/gone-paper/?utm_source=bluesky", "-29 hours");
posted.run("l3", "moved-paper", "Moved", P + "moved-paper/", "at://did:plc:me/app.bsky.feed.post/m1", "Moved — as posted", "-28 hours");
deletes = [];
const rr = await mod.retractDeadLinks(env(db));
const after = Object.fromEntries(db.prepare("SELECT id, action, post_text_snippet FROM dissemination_tracker").all().map((x) => [x.id, x]));
ok(after.l1.action === "posted" && /utm_source=bluesky/.test(after.l1.post_text_snippet) && !/MISROUTED/.test(after.l1.post_text_snippet), "a live paper keeps its as-posted text (no MISROUTED overwrite)", after.l1);
ok(after.l2.action === "link-dead" && rr.retracted === 1 && deletes.length === 1 && /g1$/.test(deletes[0].rkey || ""), "a hard 404 is still retracted", { rr, deletes, row: after.l2 });
ok(after.l3.action === "posted" && /^MISROUTED \(redirect 301/.test(after.l3.post_text_snippet) && rr.misrouted === 1, "a real redirect is still only flagged, never deleted", { rr, row: after.l3 });

// ---- version ----
const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) > 19 || (Number(vm[2]) === 19 && Number(vm[3]) >= 2)), "VERSION is at least 0.19.2", vm && vm[0]);

console.log(`link-slash-canon: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
