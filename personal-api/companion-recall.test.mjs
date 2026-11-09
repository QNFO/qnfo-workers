// personal-api/companion-recall.test.mjs (RECALL-LOOP-1, PROMPTED-RECALL-1; pillar personal)
// The companion asks one tap question at a time on Today, built from his own data, and every answer changes something:
// venue and interest answers become cmp_feedback votes (For You and the taste filter read them), "Not sure" rests 14 days,
// "No" is never asked again, the questions are in export/delete, and the page carries the card.
// Run: node personal-api/companion-recall.test.mjs
import { DatabaseSync } from "node:sqlite";
import * as C from "./companion.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
function d1(db) {
  return { prepare(sql) { let args = []; const api = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) ?? null; } }; return api; } };
}
const raw = new DatabaseSync(":memory:");
const audit = new DatabaseSync(":memory:");
const env = { PERSONAL: d1(raw), AUDIT: d1(audit) };
await C.ensureSchema(env.PERSONAL);
raw.exec("CREATE TABLE IF NOT EXISTS cmp_feed (id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT, title TEXT NOT NULL, venue TEXT, kind TEXT, url TEXT, why TEXT, score REAL DEFAULT 0, state TEXT DEFAULT 'new', reason TEXT, built_at TEXT); CREATE TABLE IF NOT EXISTS cmp_feed_meta (k TEXT PRIMARY KEY, v TEXT)");
const now = new Date().toISOString();
for (let i = 0; i < 3; i++) raw.prepare("INSERT INTO cmp_feed (id, date, title, venue, built_at) VALUES (?,?,?,?,?)").run("b" + i, "2026-11-1" + i, "Late set " + i, "Bimhuis", now);
raw.prepare("INSERT INTO cmp_feed (id, date, title, venue, built_at) VALUES (?,?,?,?,?)").run("o1", "2026-11-12", "Once only", "Paradiso", now);
raw.prepare("INSERT INTO cmp_feed_meta (k, v) VALUES ('built', ?)").run(now);

console.log("[shape]");
let threw = false; try { C.recallOptions([{ key: "yes", label: "Yes" }]); } catch (e) { threw = true; }
ok("one option is refused (2 to 4 required)", threw);
const o = C.recallOptions([{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]);
ok("Not sure is always the last option", o.length === 3 && o[2].key === "unsure" && o[2].label === "Not sure");
ok("ISO week key", C.isoWeekKey("2026-11-09") === "2026-W46" && C.isoWeekKey("2027-01-01") === "2026-W53");

console.log("[generate]");
let r = await C.recallNext(env);
ok("questions come back, at most " + C.RECALL_OPEN_MAX + " open", r.ok && r.asks.length >= 1 && r.asks.length <= C.RECALL_OPEN_MAX, r.asks.length);
const venueQ = r.asks.find((q) => q.kind === "venue");
ok("a venue seen twice or more is asked about, with a concrete cue", venueQ && /Bimhuis/.test(venueQ.question) && /3 times/.test(venueQ.cue), venueQ);
ok("a venue seen once is not asked", !r.asks.some((q) => /Paradiso/.test(q.question)));
ok("every question offers Not sure last", r.asks.every((q) => q.options[q.options.length - 1].key === "unsure" && q.options.length >= 3 && q.options.length <= 5));
ok("no typed field: options only", r.asks.every((q) => q.options.every((x) => typeof x.label === "string")));

console.log("[answer changes something]");
let a = await C.recallAnswer(env, { id: venueQ.id, key: "no" });
const fb = raw.prepare("SELECT kind, label, vote FROM cmp_feedback WHERE key = ?").get(C.fbKey("Bimhuis"));
ok("No on a venue is a -1 cmp_feedback vote", fb && fb.vote === -1 && fb.kind === "event", fb);
ok("the For You cache is cleared so the next build uses it", !raw.prepare("SELECT 1 FROM cmp_feed_meta WHERE k = 'built'").get());
ok("the reply says what changed", /drops out of For You/.test(a.reply), a.reply);
r = await C.recallNext(env);
ok("No is never asked again", !r.asks.some((q) => /Bimhuis/.test(q.question)));
const intQ = r.asks.find((q) => q.kind === "interest");
ok("an unrated For You interest is asked", !!intQ, r.asks.map((q) => q.kind));
a = await C.recallAnswer(env, { id: intQ.id, key: "yes" });
const iv = raw.prepare("SELECT vote FROM cmp_feedback WHERE label = ?").get("interest: " + intQ.question.replace(/^More /, "").replace(/ in your For You list\?$/, ""));
ok("Yes on an interest switches it on (+1), as the For You chip does", iv && iv.vote === 1, iv);

console.log("[not sure rests 14 days]");
r = await C.recallNext(env);
const q3 = r.asks[0];
await C.recallAnswer(env, { id: q3.id, key: "unsure" });
r = await C.recallNext(env);
ok("Not sure is not asked again the same day", !r.asks.some((q) => q.id === q3.id));
raw.prepare("UPDATE cmp_asks SET answered_at = ? WHERE id = ?").run(new Date(Date.now() - 15 * 864e5).toISOString(), q3.id);
r = await C.recallNext(env);
ok("Not sure comes back after 14 days", r.asks.some((q) => q.id === q3.id));
const bad = await C.recallAnswer(env, { id: q3.id, key: "maybe" });
ok("an answer that is not a button is refused", bad.ok === false);

console.log("[other surfaces on the same card]");
audit.exec("CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref TEXT, subject TEXT, body TEXT, created_at TEXT DEFAULT (datetime('now'))); CREATE TABLE calendar_feedback (cal_id INTEGER, action TEXT)");
audit.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER DEFAULT 0, revise_count INTEGER DEFAULT 0, context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, publish_due_at TEXT, UNIQUE(source, source_id));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_crons (name TEXT PRIMARY KEY, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, surfaces_tested TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
audit.prepare("INSERT INTO research_queue (id, source, source_id, idea, status) VALUES ('rq1','proposal','1','Quantum binning and Planck. Note','queued')").run();
audit.exec(readFileSync(new URL("../migrations/2026-11-09-recall-loop.sql", import.meta.url), "utf8"));
audit.prepare("INSERT INTO owner_questions (kind, ref, subject, body) VALUES ('after-event', '7', 'Did you go to Jazz at Bimhuis?', 'Jazz\nhttps://cal.example/fb/7?sig=x\n\nTap')").run();
r = await C.recallNext(env);
ok("a calendar after-event question shows as a link", r.links.some((l) => l.url === "https://cal.example/fb/7?sig=x"), r.links);
ok("the card links to the fleet's focus", r.links.some((l) => l.url === "https://fleet.qnfo.org/focus"));
const fq = r.asks.find((q) => q.src === "fleet" && q.kind === "research-line");
ok("research questions are on the same card, answerable by tap", !!fq && fq.options.length === 4 && r.research_waiting >= 9, { n: r.research_waiting, kinds: r.asks.map((q) => q.src + ":" + q.kind) });
const qf = r.asks.find((q) => q.src === "fleet" && /Quantum foundations/.test(q.question));
const qa = qf || (audit.prepare("SELECT id, question FROM owner_asks WHERE ref LIKE 'quantum-foundations@%'").get());
a = await C.recallAnswer(env, { src: "fleet", id: qa.id, key: "pause" });
const fr = audit.prepare("SELECT answer, answered_via FROM owner_asks WHERE id = ?").get(qa.id);
ok("a tap on the companion answers the fleet question", fr.answer === "pause" && fr.answered_via === "me.q08.org" && /Paused/.test(a.reply), fr);
ok("and the research queue follows it", audit.prepare("SELECT status FROM research_queue WHERE id = 'rq1'").get().status === "owner_paused");
ok("nothing from personal-life is written to qnfo-audit", audit.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'cmp_%'").get().n === 0);
const badF = await C.recallAnswer(env, { src: "fleet", id: qa.id, key: "maybe" });
ok("a fleet answer that is not a button is refused", badF.ok === false);
audit.prepare("INSERT INTO calendar_feedback VALUES (7, 'went')").run();
r = await C.recallNext(env);
ok("an answered calendar question leaves the card", !r.links.some((l) => /cal\.example/.test(l.url)));
const envNoAudit = { PERSONAL: env.PERSONAL };
r = await C.recallNext(envNoAudit);
ok("no AUDIT binding is not an error", r.ok === true && r.research_waiting === 0 && r.asks.every((q) => q.src === "me"));

console.log("[privacy and page]");
ok("cmp_asks is in the privacy view, export and delete", C.PRIVACY_TABLES.some((t) => t.table === "cmp_asks"));
const sum = await C.recallSummary(env);
ok("summary lists what he answered", sum.ok && sum.answered.length >= 2);
const page = await C.handleCompanion(new Request("https://me.q08.org/companion"), env, { waitUntil() {} }, { version: "t" });
const html = await page.text();
ok("Today carries the Quick question card", html.includes("recallQs()") && html.includes("/companion/api/recall/answer") && html.includes("Quick question") && html.includes("src:q.src"));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
