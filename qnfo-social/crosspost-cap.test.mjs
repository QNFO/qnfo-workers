// CROSSPOST-CAP-1 (qnfo-social 0.21.2, agent_issues 1000610, chaos drill control social-weekly-caps) offline suite. No network, synthetic rows.
// Proves: windowHold applies the channel drain's two holds (weekly cap, then spacing of 7 days / cap less one hour) to the Bluesky cross-post; crossPostHold reads the channel's real window and cap
// from the database, holds a channel that posted 5 hours ago under a cap of 7 a week (the 2026-10-27 LinkedIn pair), lets it through after the spacing, holds at the weekly cap, never holds a channel outside
// the drain order (Substack Notes), and holds when the gate cannot be read; and bufferPost sends nothing to a held channel.
// Run: node qnfo-social/crosspost-cap.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

// ---------- pure ----------
const H = 36e5, D = 864e5, now = Date.parse("2026-10-27T21:31:00Z");
ok(mod.windowHold(7, { n: 1, lastMs: now - 5 * H }, now) !== null && /^held:spacing\(next 2026-10-28T/.test(mod.windowHold(7, { n: 1, lastMs: now - 5 * H }, now)), "5 hours after a post under a cap of 7 a week (spacing 23 h): held", mod.windowHold(7, { n: 1, lastMs: now - 5 * H }, now));
ok(mod.windowHold(7, { n: 1, lastMs: now - 24 * H }, now) === null, "24 hours after: open");
ok(mod.windowHold(7, { n: 7, lastMs: now - 30 * H }, now) === "held:weekly-cap(7/7)", "at the weekly cap: held whatever the spacing");
ok(mod.windowHold(14, { n: 3, lastMs: now - 10 * H }, now) !== null && mod.windowHold(14, { n: 3, lastMs: now - 11 * H }, now) === null, "cap 14: spacing is 11 hours (7 d / 14 less 1 h)");
ok(mod.windowHold(0, { n: 0, lastMs: null }, now) === "held:cap-0" && mod.windowHold(3, { n: 0, lastMs: null }, now) === null, "cap 0 holds, an empty window is open");

// ---------- against a database ----------
function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT, engagement_metrics TEXT, created_at TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, posts TEXT, status TEXT, posted_at TEXT, post_uri TEXT, error TEXT, updated_at TEXT);`);
  const prep = (sql) => { let a = []; const s = { bind: (...x) => { a = x.map((v) => (v === undefined ? null : v)); return s; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
  return { db, env: { DB: { prepare: prep } } };
}
const post = (db, platform, ago) => db.prepare("INSERT INTO social_media_posts (id, platform, post_id, published_at, status, project_id) VALUES (?, ?, ?, datetime('now', ?), 'published', ?)").run("p" + Math.random().toString(36).slice(2), platform, "x", ago, "slug");
const realErr = console.error; console.error = () => {};
{
  const { db, env } = mk();
  post(db, "buffer-linkedin", "-5 hours");
  const h = await mod.crossPostHold(env, "linkedin", Date.now());
  ok(h && /^held:spacing/.test(h), "LinkedIn posted 5 hours ago: the cross-post is held", h);
  ok((await mod.crossPostHold(env, "mastodon", Date.now())) === null, "Mastodon has no post: open");
  ok((await mod.crossPostHold(env, "substack", Date.now())) === null, "Substack Notes are outside the drain order: never held here");
}
{
  const { db, env } = mk();
  post(db, "buffer-linkedin", "-26 hours");
  ok((await mod.crossPostHold(env, "linkedin", Date.now())) === null, "LinkedIn posted 26 hours ago: open");
}
{
  const { db, env } = mk();
  db.exec("INSERT INTO pipeline_flags (key, value) VALUES ('social_channel_caps', '{\"linkedin\":2}')");
  post(db, "buffer-linkedin", "-60 hours"); post(db, "buffer-linkedin", "-100 hours");
  const h = await mod.crossPostHold(env, "linkedin", Date.now());
  ok(h && /^held:weekly-cap\(2\/2\)/.test(h), "two posts in the week under a cap of 2: held at the cap", h);
}
{
  const { env } = mk();
  const bad = { DB: { prepare() { throw new Error("db down"); } } };
  ok((await mod.crossPostHold(bad, "linkedin", Date.now())) === "held:gate-error", "an unreadable gate holds");
  void env;
}
{
  // bufferPost: a held LinkedIn is not created in Buffer; the free channels are
  const { db, env } = mk();
  post(db, "buffer-linkedin", "-2 hours");
  const created = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = init && init.body ? String(init.body) : "";
    if (/organizations \{ id \}/.test(body)) return new Response(JSON.stringify({ data: { account: { organizations: [{ id: "org1" }] } } }));
    if (/channels\(input/.test(body)) return new Response(JSON.stringify({ data: { channels: [{ id: "chL", service: "linkedin", isDisconnected: false }, { id: "chT", service: "twitter", isDisconnected: false }, { id: "chM", service: "mastodon", isDisconnected: false }] } }));
    if (/createPost/.test(body)) { created.push(body); return new Response(JSON.stringify({ data: { createPost: { post: { id: "bp" + created.length, status: "ok" } } } })); }
    return new Response("{}");
  };
  try {
    const r = await mod.bufferPost({ ...env, BUFFER_TOKEN: "t" }, "A post. https://papers.qnfo.org/papers/s/", "fresh-slug");
    const li = r.results.find((x) => x.platform === "linkedin");
    ok(li && li.status === "skipped" && /^held:spacing/.test(li.reason) && !created.some((b) => b.includes("chL")), "bufferPost: LinkedIn (posted 2 h ago) is held and nothing is sent to its channel", r.results);
    ok(created.some((b) => b.includes("chT")) || created.some((b) => b.includes("chM")), "bufferPost: a channel with an open window still gets the cross-post", created.length);
  } finally { globalThis.fetch = realFetch; }
}
console.error = realErr;

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
