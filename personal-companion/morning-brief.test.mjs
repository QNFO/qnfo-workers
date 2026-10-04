// personal-companion 1.9.3 MORNING-BRIEF-OWNER-NOTICE-1 suite (charter pillar: personal).
// Proves: the morning brief is sent through the owner-notice path (native SEND_EMAIL, to the owner only) even when the owner's
// address sits in email_suppression; once per Amsterdam day; the suppression table is never written (nor read by the brief);
// waiting owner questions are listed; a failed send leaves no companion_morning_brief row so the next tick retries.
// Run: node personal-companion/morning-brief.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { sendMorningBrief, sendOwnerNotice } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db, log) => ({ prepare(sql) { if (log) log.push(sql); const mk = (args) => ({
  bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
function setup(sendImpl) {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:"), sqls = [], sent = [];
  p.exec("CREATE TABLE daily_briefs (date TEXT PRIMARY KEY, payload TEXT)");
  p.prepare("INSERT INTO daily_briefs VALUES (?,?)").run(today, JSON.stringify({ weather: { text: "mild" }, calendar: { today: [], upcoming7: [] }, open: { tasks: [] } }));
  a.exec("CREATE TABLE email_suppression (email TEXT PRIMARY KEY, source TEXT); INSERT INTO email_suppression VALUES ('rwnquni@outlook.com','owner-request-2026-09-22'); CREATE TABLE calendar_meta (k TEXT PRIMARY KEY, v TEXT)");
  a.exec("CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))");
  return { p, a, sqls, sent, env: { PERSONAL: wrap(p), AUDIT: wrap(a, sqls), SEND_EMAIL: { send: sendImpl || (async (m) => { sent.push(m); }) } } };
}
let T = setup();
let r = await sendMorningBrief(T.env);
ok(r.ok && r.via === "send_email" && T.sent.length === 1, "brief sent through the owner-notice path although the address is suppressed (" + JSON.stringify(r) + ")");
ok(T.sent[0].to === "rwnquni@outlook.com" && T.sent[0].from === "rowan.quni@qnfo.org" && T.sent[0].subject === "Morning - " + today, "to the owner only, dated subject");
ok(/Weather: mild/.test(T.sent[0].text), "brief body carries the weather");
ok(T.p.prepare("SELECT date FROM companion_morning_brief").all().length === 1, "once-a-day row written");
r = await sendMorningBrief(T.env);
ok(r.skipped === "already sent" && T.sent.length === 1, "second call the same day sends nothing");
ok(T.a.prepare("SELECT count(*) n FROM email_suppression").get().n === 1 && T.a.prepare("SELECT source FROM email_suppression").get().source === "owner-request-2026-09-22", "suppression row untouched");
ok(!T.sqls.some((q) => /(insert|update|delete|drop|alter)[^;]*email_suppression/i.test(q)), "no statement writes email_suppression");
ok(!T.sqls.some((q) => /email_suppression/i.test(q)), "the brief path does not even read email_suppression");

T = setup();
T.a.prepare("INSERT INTO owner_questions (kind, ref, subject, body, priority) VALUES ('after-event','e1','Did you go to the meetup?','b',3)").run();
await sendMorningBrief(T.env);
ok(/Questions waiting:/.test(T.sent[0].text) && /Did you go to the meetup\? \(queued\)/.test(T.sent[0].text), "waiting owner questions are listed");
T = setup(); await sendMorningBrief(T.env);
ok(!/Questions waiting/.test(T.sent[0].text), "no questions section when none are waiting");

T = setup(async () => { throw new Error("E_SEND rejected"); });
r = await sendMorningBrief(T.env);
ok(!r.ok && /E_SEND rejected/.test(r.error) && T.p.prepare("SELECT date FROM companion_morning_brief").all().length === 0, "failed send writes no once-a-day row, so the next tick retries");

T = setup(); T.env.PERSONAL.prepare("DELETE FROM daily_briefs"); T.p.exec("DELETE FROM daily_briefs");
r = await sendMorningBrief(T.env); ok(r.skipped === "no brief yet" && T.sent.length === 0, "no brief yet is a skip");
r = await sendOwnerNotice({}, "s", "t"); ok(!r.ok && r.error === "no mail binding", "no mail binding is an error value, not a throw");
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
