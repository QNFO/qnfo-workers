// YT-REACH-ENG-1 offline suite (qnfo-social 0.28.2): ytReachRun wrote through `eng`, a closure local to collectBufferStats, so every
// hourly run threw "eng is not defined" (live log 2026-11-12T16:31Z). The run must complete and record its composer_run row.
// Run: node qnfo-social/yt-reach-eng.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
const { ytReachRun } = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + String(d).slice(0, 300))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_engagements (platform TEXT, post_id TEXT, metric TEXT, value REAL, note TEXT, collected_at TEXT, UNIQUE(platform, post_id, metric, collected_at));`);
const wrap = (d) => ({ prepare(sql) { let a = []; const s = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: d.prepare(sql).all(...a) }; }, async first() { return d.prepare(sql).get(...a) || null; }, async run() { const r = d.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; } });
const env = { DB: wrap(db) };
db.exec("CREATE TABLE IF NOT EXISTS yt_shorts_queue (id TEXT PRIMARY KEY, title TEXT, url TEXT, created_at TEXT DEFAULT (datetime('now')))");
db.exec("INSERT INTO yt_shorts_queue (id, title, url) VALUES ('s1', 'A Short', 'https://youtube.com/shorts/x')");
let err = null, out = null;
try { out = await ytReachRun(env); } catch (e) { err = e; }
ok(!err, "ytReachRun completes", err && err.message);
ok(out && out.composed === 3, "one hook per channel composed", JSON.stringify(out));
const run = db.prepare("SELECT value FROM social_engagements WHERE platform='yt_reach' AND metric='composer_run'").get();
ok(run && Number(run.value) === 3, "composer_run row recorded", JSON.stringify(run));
ok(db.prepare("SELECT COUNT(*) n FROM social_engagements WHERE metric='composer_hook'").get().n === 3, "hook rows recorded");
const again = await ytReachRun(env);
ok(again.composed === 0, "a second run composes nothing new", JSON.stringify(again));
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
