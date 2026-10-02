// SOCIAL-RUN-LEDGER-1 offline suite (qnfo-social 0.7.27). Drives the real scheduled handler and recordSocialRun against
// an in-memory SQLite D1 (the real upsert SQL, json_set included) with a stubbed fetch. Proves: one row per operation per
// UTC day; meta.last_ok carries the last completed run across a later failure; runs counts the day's runs; the 2-hourly
// tick records profile-sync and drain, 06:00 the scan, 07:00 the engagement collector; a failed Zenodo read is an error
// run; the watchmaker's proof query reads the row; a ledger failure never stops a run.
// Run: node qnfo-social/run-ledger.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
const W = mod.default;
const VERSION = (/var VERSION = "([^"]+)"/.exec(readFileSync(new URL("./worker.js", import.meta.url), "utf8")) || [])[1];

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted',
  post_url TEXT, post_id TEXT, post_text_snippet TEXT, posted_at TEXT, pages_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT, digested INTEGER, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE scan_state (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
  note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));`);
function stmtOn(conn, sql) {
  let args = [];
  const s = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: conn.prepare(sql).all(...args) }; },
    async first() { return conn.prepare(sql).get(...args) || null; },
    async run() { const r = conn.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    _run() { return conn.prepare(sql).run(...args); }
  };
  return s;
}
const DB = { prepare: (sql) => stmtOn(db, sql), async batch(list) { for (const s of list) s._run(); return []; } };
const env = { DB, BSKY_HANDLE: "qnfo.bsky.social", BSKY_APP_PASS: "x", BUFFER_TOKEN: "buf", AI: {} };

let zenodoStatus = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url), body = init && init.body ? String(init.body) : "";
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u.includes("public.api.bsky.app/xrpc/app.bsky.actor.getProfile")) return J({ handle: "qnfo.bsky.social", description: mod.PROFILE_DESCRIPTION });
  if (u.includes("public.api.bsky.app/xrpc/app.bsky.feed.getPosts")) {
    const uris = new URL(u).searchParams.getAll("uris");
    return J({ posts: uris.map((x) => ({ uri: x, likeCount: 3, repostCount: 1, replyCount: 0, quoteCount: 0 })) });
  }
  if (u === "https://api.buffer.com") {
    if (body.includes("organizations")) return J({ data: { account: { organizations: [{ id: "org1" }] } } });
    if (body.includes("channels(")) return J({ data: { channels: [{ id: "chL", service: "linkedin", name: "Rowan", isDisconnected: false }] } });
  }
  if (u.startsWith("https://zenodo.org/api/records?")) return zenodoStatus === 200 ? J({ hits: { hits: [] } }) : new Response("busy", { status: zenodoStatus });
  return new Response("not found", { status: 404 });
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const row = (id) => db.prepare("SELECT id, ts, kind, job, status, meta, text FROM cloud_ops_events WHERE id = ?").get(id);
const meta = (id) => JSON.parse(row(id).meta);
// The exact proof query qnfo-fleet-dashboard WATCHMAKER_OPS runs for each social op.
const proof = (op) => db.prepare("SELECT MAX(json_extract(meta, '$.last_ok')) AS last FROM cloud_ops_events WHERE id >= 'social-" + op + "-' AND id < 'social-" + op + ".'").get().last;

// 1. The upsert: one row per op per day, last_ok carried across a failure, runs counted.
const T1 = Date.parse("2026-10-02T10:30:00Z"), T2 = T1 + 2 * 36e5, T3 = T2 + 2 * 36e5, NEXT = Date.parse("2026-10-03T00:30:00Z");
await mod.recordSocialRun(env, "profile-sync", "ok", { unchanged: true }, T1);
let r = row("social-profile-sync-2026-10-02");
ok(r && r.kind === "social-run" && r.job === "qnfo-social" && r.status === "ok" && r.ts === new Date(T1).toISOString(), "an ok run writes social-<op>-<day> with kind social-run, job qnfo-social");
ok(meta(r.id).last_ok === new Date(T1).toISOString() && meta(r.id).runs === 1 && meta(r.id).version === VERSION, "meta.last_ok is the run time, runs 1, version recorded");
await mod.recordSocialRun(env, "profile-sync", "error", { error: "putRecord 400" }, T2);
r = row("social-profile-sync-2026-10-02");
ok(r.status === "error" && r.ts === new Date(T2).toISOString() && meta(r.id).last_ok === new Date(T1).toISOString() && meta(r.id).runs === 2, "a failed run updates status and ts but keeps the last good time (last_ok) and counts the run");
ok(proof("profile-sync") === new Date(T1).toISOString(), "the watchmaker proof query reads the last completed run, not the failed one");
await mod.recordSocialRun(env, "profile-sync", "degraded", { held: "owner-edited" }, T3);
ok(meta("social-profile-sync-2026-10-02").last_ok === new Date(T3).toISOString() && meta("social-profile-sync-2026-10-02").runs === 3, "a degraded run is a completed run");
await mod.recordSocialRun(env, "profile-sync", "error", { error: "session 401" }, NEXT);
ok(row("social-profile-sync-2026-10-03") && meta("social-profile-sync-2026-10-03").last_ok === null && meta("social-profile-sync-2026-10-03").runs === 1, "a new UTC day starts a new row");
ok(proof("profile-sync") === new Date(T3).toISOString(), "MAX over the id range spans days, so a failing new day still shows yesterday's last good run");
ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE id LIKE 'social-profile-sync-%'").get().n === 2, "two days, two rows: the ledger grows by a row per op per day, not per run");
await mod.recordSocialRun(env, "drain", "ok", { big: "x".repeat(5000) }, T1);
ok(db.prepare("SELECT json_valid(meta) v FROM cloud_ops_events WHERE id = 'social-drain-2026-10-02'").get().v === 1, "an oversized result is clipped inside valid JSON");
db.exec("DELETE FROM cloud_ops_events");

// 2. Status rules.
ok(mod.profileRunStatus({ unchanged: true }) === "ok" && mod.profileRunStatus({ updated: true }) === "ok" && mod.profileRunStatus({ held: "owner-edited" }) === "ok", "profile sync: unchanged, updated and owner-held are ok");
ok(mod.profileRunStatus({ skipped: "no credentials" }) === "skipped" && mod.profileRunStatus({ error: "x" }) === "error" && mod.profileRunStatus(null) === "error", "profile sync: no credentials is skipped, an error is an error");
ok(mod.drainRunStatus({ skipped: "weekly-cap" }, { skipped: "paused" }) === "ok", "drain held by the weekly cap or the pause flag still ran");
ok(mod.drainRunStatus({ skipped: "gate-error" }, { posted: 0, failed: 0 }) === "error" && mod.drainRunStatus({ error: "boom" }, { posted: 0 }) === "error", "drain: a gate read failure or a throw is an error");
ok(mod.drainRunStatus({ posted: 1, failed: 0, buffer: ["mastodon:ok", "linkedin:error"] }, { posted: 0, failed: 0 }) === "degraded", "drain: a Buffer platform refusing the cross-post is degraded");
ok(mod.engagementRunStatus({ posts_found: 3, errors: 0 }) === "ok" && mod.engagementRunStatus({ posts_found: 3, errors: 1 }) === "degraded" && mod.engagementRunStatus({ posts_found: 0, errors: 2 }) === "error", "engagement: all chunks failing is an error");

// 3. The real scheduled handler.
const today = new Date().toISOString().slice(0, 10);
await W.scheduled({ cron: "30 */2 * * *" }, env);
ok(row("social-profile-sync-" + today) && row("social-profile-sync-" + today).status === "ok" && JSON.parse(row("social-profile-sync-" + today).meta).result.unchanged === true, "the 2-hourly tick records the profile sync (bio already in sync)");
const dr = row("social-drain-" + today);
ok(dr && dr.status === "ok" && JSON.parse(dr.meta).result.queue.posted === 0 && "dissemination" in JSON.parse(dr.meta).result, "the 2-hourly tick records the posting drain with both queues");
ok(db.prepare("SELECT connected FROM social_channels WHERE channel_id = 'chL'").get().connected === 1, "the channel audit still writes social_channels in the same tick");
await W.scheduled({ cron: "0 6 * * *" }, env);
ok(row("social-scan-" + today) && row("social-scan-" + today).status === "ok" && JSON.parse(row("social-scan-" + today).meta).result.records === 0, "06:00 records the Zenodo scan");
zenodoStatus = 503;
await W.scheduled({ cron: "0 6 * * *" }, env);
ok(row("social-scan-" + today).status === "error" && JSON.parse(row("social-scan-" + today).meta).runs === 2 && JSON.parse(row("social-scan-" + today).meta).last_ok, "a failed Zenodo read is an error run that keeps the earlier good time");
db.prepare("INSERT INTO social_threads (slug, title, posts, status, posted_at, post_uri) VALUES ('t1', 't', '[]', 'posted', datetime('now'), 'at://did:plc:me/app.bsky.feed.post/a1')").run();
await W.scheduled({ cron: "0 7 * * *" }, env);
const en = row("social-engagement-" + today);
ok(en && en.status === "ok" && JSON.parse(en.meta).result.posts_found === 1 && db.prepare("SELECT COUNT(*) n FROM social_engagements WHERE note = 'qnfo-social'").get().n === 4, "07:00 records the engagement collector and its four metrics");
ok(["profile-sync", "drain", "scan", "engagement"].every((op) => proof(op)), "every social op has a proof the watchmaker can read");

// 4. A ledger failure never stops a run.
const noLedger = { prepare(sql) { if (/cloud_ops_events/.test(sql)) throw new Error("no such table: cloud_ops_events"); return DB.prepare(sql); }, batch: DB.batch };
ok((await mod.recordSocialRun({ DB: noLedger }, "drain", "ok", {}, T1)) === null, "a ledger write failure returns null instead of throwing");
let threw = false;
try { await W.scheduled({ cron: "30 */2 * * *" }, Object.assign({}, env, { DB: noLedger })); } catch (e) { threw = true; }
ok(!threw, "the tick completes when the ledger table is missing");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
