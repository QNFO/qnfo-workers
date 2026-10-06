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
const { sendMorningBrief, sendOwnerNotice, flagUndeliverableQuestions } = mod;
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
  a.exec("CREATE TABLE email_suppression (email TEXT PRIMARY KEY, source TEXT); INSERT INTO email_suppression VALUES ('rwnquni@outlook.com','owner-request-2026-09-22'); CREATE TABLE calendar_meta (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER, ts TEXT DEFAULT (datetime('now'))); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER)");
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

// MORNING-BRIEF-CLAIM-1: concurrent ticks send once; the claim exists before the send; failure releases it for retry
T = setup(async (m) => { T.claimDuringSend = T.p.prepare("SELECT count(*) n FROM companion_morning_brief").get().n; await new Promise((res) => setTimeout(res, 20)); T.sent.push(m); });
const both = await Promise.all([sendMorningBrief(T.env), sendMorningBrief(T.env)]);
ok(T.sent.length === 1, "two concurrent ticks send exactly one brief (sent " + T.sent.length + ")");
ok(T.claimDuringSend === 1, "the day is claimed before the send happens");
ok(both.filter((x) => x.skipped === "already sent").length === 1, "the losing tick skips");
let n = 0; T = setup(async (m) => { if (n++ === 0) throw new Error("E_ONCE"); T.sent.push(m); });
r = await sendMorningBrief(T.env); ok(!r.ok && T.p.prepare("SELECT date FROM companion_morning_brief").all().length === 0, "failed send deletes the claim");
r = await sendMorningBrief(T.env); ok(r.ok && T.sent.length === 1 && T.p.prepare("SELECT date FROM companion_morning_brief").all().length === 1, "next tick retries and keeps the claim after success");

// answered after-event questions drop out; triage/follow-up stay
T = setup();
T.a.exec("INSERT INTO owner_questions (kind, ref, subject, body) VALUES ('after-event','7','Answered one','b'),('after-event','8','Open one','b'),('triage','2026-W40','Triage stays','b'),('follow-up','5-2026-W40','Follow stays','b'); INSERT INTO calendar_feedback (cal_id) VALUES (7)");
await sendMorningBrief(T.env);
ok(!/Answered one/.test(T.sent[0].text) && /Open one/.test(T.sent[0].text) && /Triage stays/.test(T.sent[0].text) && /Follow stays/.test(T.sent[0].text), "answered after-event dropped, others kept");

// OWNER-QUESTION-UNDELIVERABLE-1
T = setup();
T.a.exec("INSERT INTO owner_questions (kind, ref, subject, body, attempts, last_error) VALUES ('after-event','1','Stuck q','b',5,'boom'),('after-event','2','Fine q','b',2,NULL),('after-event','3','Sent q','b',6,NULL); UPDATE owner_questions SET sent_at='2026-10-01 00:00:00' WHERE ref='3'");
let f = await flagUndeliverableQuestions(T.env);
let iss = T.a.prepare("SELECT * FROM agent_issues").all();
ok(f.filed === 1 && iss.length === 1 && iss[0].title === "OWNER-QUESTION-UNDELIVERABLE-1: Stuck q" && iss[0].source === "personal-companion" && iss[0].category === "personal" && iss[0].priority === "medium" && iss[0].status === "open", "one medium personal issue for the stuck question only");
f = await flagUndeliverableQuestions(T.env); ok(f.filed === 0 && T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 1, "no duplicate while an open one exists");
T.a.exec("UPDATE agent_issues SET status='closed'"); f = await flagUndeliverableQuestions(T.env); ok(f.filed === 1, "a closed one is refiled if still stuck");
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
