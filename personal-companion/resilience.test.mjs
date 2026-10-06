// personal-companion 1.12.0 PERSONAL-RESILIENCE-1 suite (charter pillar: personal).
// Failure modes proven (each test was written failing first): the brief's claim survives a worker death (stale unsent claim is
// retried inside 08:00-12:00 Amsterdam); owner prompts claim a row before sending, roll back on a failed send and never re-send
// when only the sent_at mark failed; an undeliverable question is flagged once per row; owner_notice_enabled (qnfo-audit.calendar_meta)
// stops brief and owner questions; the daily cap uses the real Amsterdam midnight in winter; subscriber sends page past 500 rows;
// notice size is bounded.
// Run: node personal-companion/resilience.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { sendMorningBrief, sendOwnerNotice, deliverOwnerPrompts, flagUndeliverableQuestions, broadcast, confirmedSubscribers } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db, hook) => ({ prepare(sql) { const mk = (args) => ({
  bind: (...a) => mk(a),
  run: async () => { if (hook) hook(sql, args); const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
const DAY = "2026-10-06";
const at = (iso) => new Date(iso).getTime();
const T0930 = at("2026-10-06T07:30:00Z"); // 09:30 Amsterdam (CEST)
const T1500 = at("2026-10-06T13:00:00Z"); // 15:00 Amsterdam
function setup(sendImpl, auditHook) {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:"), sent = [];
  p.exec("CREATE TABLE daily_briefs (date TEXT PRIMARY KEY, payload TEXT)");
  p.prepare("INSERT INTO daily_briefs VALUES (?,?)").run(DAY, JSON.stringify({ weather: { text: "mild" }, calendar: { today: [], upcoming7: [] }, open: { tasks: [] } }));
  a.exec("CREATE TABLE calendar_meta (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER, ts TEXT); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER)");
  a.exec("CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))");
  const T = { p, a, sent };
  T.env = { PERSONAL: wrap(p), AUDIT: wrap(a, auditHook), SEND_EMAIL: { send: sendImpl ? (m) => sendImpl(m, T) : async (m) => { sent.push(m); } } };
  return T;
}
const addQ = (db, ref, subj, extra) => db.prepare("INSERT INTO owner_questions (kind, ref, subject, body, priority) VALUES ('after-event', ?, ?, ?, 5)").run(ref, subj, "body " + subj);
const brief = (T) => T.p.prepare("SELECT * FROM companion_morning_brief WHERE date = ?").get(DAY);
const mins = (n) => new Date(T0930 - n * 60000).toISOString();

// ---- (1) brief claim survives a worker death
let T = setup();
let r = await sendMorningBrief(T.env, T0930);
ok(r.ok && T.sent.length === 1, "plain send works with an injected clock (" + JSON.stringify(r) + ")");
ok(brief(T).sent === 1 && brief(T).claimed_at, "row records claimed_at and sent=1 after a send");
T = setup();
await sendMorningBrief(T.env, T0930); // creates the new-schema table
T.p.prepare("DELETE FROM companion_morning_brief").run();
T.p.prepare("INSERT INTO companion_morning_brief (date, sent_at, claimed_at, sent) VALUES (?,?,?,0)").run(DAY, mins(100), mins(100));
T.sent.length = 0;
r = await sendMorningBrief(T.env, T0930);
ok(r.ok && T.sent.length === 1 && brief(T).sent === 1, "claim older than 90 min and unsent is retried inside the window (" + JSON.stringify(r) + ")");
r = await sendMorningBrief(T.env, T0930 + 60000);
ok(r.skipped === "already sent" && T.sent.length === 1, "after the retry the day is sent once");
T.p.prepare("UPDATE companion_morning_brief SET sent=0, claimed_at=?").run(mins(30));
T.sent.length = 0;
r = await sendMorningBrief(T.env, T0930);
ok(T.sent.length === 0 && /in flight/.test(r.skipped || ""), "a fresh claim (30 min) is not retried (" + JSON.stringify(r) + ")");
T.p.prepare("UPDATE companion_morning_brief SET sent=0, claimed_at=?").run(new Date(T1500 - 200 * 60000).toISOString());
r = await sendMorningBrief(T.env, T1500);
ok(T.sent.length === 0, "a stale claim is not retried after 12:00 Amsterdam (" + JSON.stringify(r) + ")");
// legacy row (old schema, sent_at set, no new columns) counts as sent
const TL = setup();
TL.p.exec("CREATE TABLE companion_morning_brief (date TEXT PRIMARY KEY, sent_at TEXT NOT NULL)");
TL.p.prepare("INSERT INTO companion_morning_brief VALUES (?,?)").run(DAY, mins(300));
r = await sendMorningBrief(TL.env, T0930);
ok(r.skipped === "already sent" && TL.sent.length === 0, "a legacy claim row (before the ALTER) counts as sent (" + JSON.stringify(r) + ")");
// two overlapping retries: only one wins
T = setup(); await sendMorningBrief(T.env, T0930); T.p.prepare("DELETE FROM companion_morning_brief").run(); T.sent.length = 0;
T.p.prepare("INSERT INTO companion_morning_brief (date, sent_at, claimed_at, sent) VALUES (?,?,?,0)").run(DAY, mins(100), mins(100));
await Promise.all([sendMorningBrief(T.env, T0930), sendMorningBrief(T.env, T0930)]);
ok(T.sent.length === 1, "two overlapping retries send once (" + T.sent.length + ")");

// ---- (2) owner prompts: claim before send
let seen = null;
T = setup((m, t) => { seen = t.a.prepare("SELECT attempts, claimed_at, sent_at FROM owner_questions WHERE id=1").get(); t.sent.push(m); });
addQ(T.a, "a", "Q1");
r = await deliverOwnerPrompts(T.env, T0930);
ok(r.sent === 1 && seen && seen.claimed_at && seen.attempts === 1 && seen.sent_at == null, "row is claimed (attempts+1, claimed_at) BEFORE the mail leaves (" + JSON.stringify(seen) + ")");
// failed send rolls the claim back
T = setup(async () => { throw new Error("boom"); });
addQ(T.a, "a", "Q1");
r = await deliverOwnerPrompts(T.env, T0930);
let row = T.a.prepare("SELECT * FROM owner_questions WHERE id=1").get();
ok(r.error && row.claimed_at == null && row.attempts === 1 && /boom/.test(row.last_error) && row.sent_at == null, "failed send releases the claim and records the error (" + JSON.stringify(row) + ")");
// mark fails after a successful send: not re-sent next tick
let failMark = true;
T = setup(null, (sql) => { if (failMark && /SET sent_at/.test(sql)) throw new Error("d1 down"); });
addQ(T.a, "a", "Q1");
await deliverOwnerPrompts(T.env, T0930);
const after1 = T.sent.length;
failMark = true;
await deliverOwnerPrompts(T.env, T0930 + 3600e3);
ok(after1 === 1 && T.sent.length === 1, "send ok + mark failed: next hourly tick does not mail the question again (" + T.sent.length + ")");
// a claim that never completed (worker died) is retried after 6 hours, not before
T = setup(); addQ(T.a, "a", "Q1");
T.env.AUDIT.prepare("SELECT 1").first();
await deliverOwnerPrompts(T.env, T0930); T.a.prepare("UPDATE owner_questions SET sent_at=NULL, claimed_at=?, attempts=1").run(new Date(T0930 - 7 * 3600e3).toISOString().replace("T", " ").slice(0, 19));
T.sent.length = 0;
r = await deliverOwnerPrompts(T.env, T0930);
ok(T.sent.length === 1, "a claim older than 6 h with no sent_at is retried (" + JSON.stringify(r) + ")");
T.a.prepare("UPDATE owner_questions SET sent_at=NULL, claimed_at=?").run(new Date(T0930 - 3600e3).toISOString().replace("T", " ").slice(0, 19));
T.sent.length = 0;
await deliverOwnerPrompts(T.env, T0930);
ok(T.sent.length === 0, "a claim 1 h old is left alone");

// ---- (3) flag once per row
T = setup(); addQ(T.a, "x", "Stuck one"); T.a.prepare("UPDATE owner_questions SET attempts=5, last_error='email 401'").run();
r = await flagUndeliverableQuestions(T.env);
ok(r.filed === 1, "first flag files one issue (" + JSON.stringify(r) + ")");
T.a.prepare("UPDATE agent_issues SET status='closed'").run();
r = await flagUndeliverableQuestions(T.env);
ok(!r.filed && T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 1, "closing the issue while the row is still stuck does not refile it");
ok(T.a.prepare("SELECT flagged_at FROM owner_questions").get().flagged_at, "the row carries flagged_at");

// ---- (4) kill switch in calendar_meta
for (const v of ["0", "off", "FALSE", " no "]) {
  T = setup(); T.a.prepare("INSERT INTO calendar_meta VALUES ('owner_notice_enabled', ?)").run(v);
  const n = await sendOwnerNotice(T.env, "s", "t");
  ok(!n.ok && n.disabled && T.sent.length === 0, "owner_notice_enabled=" + JSON.stringify(v) + " blocks sendOwnerNotice");
}
T = setup(); T.a.prepare("INSERT INTO calendar_meta VALUES ('owner_notice_enabled', '0')").run(); addQ(T.a, "a", "Q1");
r = await sendMorningBrief(T.env, T0930);
ok(T.sent.length === 0 && /disabled/.test(r.skipped || "") && !T.p.prepare("SELECT name FROM sqlite_master WHERE name='companion_morning_brief'").get() || T.p.prepare("SELECT count(*) n FROM companion_morning_brief").get().n === 0, "switch off: the brief sends nothing and holds no claim (" + JSON.stringify(r) + ")");
r = await deliverOwnerPrompts(T.env, T0930);
ok(T.sent.length === 0 && /disabled/.test(r.skipped || "") && T.a.prepare("SELECT attempts FROM owner_questions").get().attempts === 0, "switch off: owner questions wait, attempts untouched (" + JSON.stringify(r) + ")");
T.a.prepare("UPDATE calendar_meta SET v='1' WHERE k='owner_notice_enabled'").run();
r = await deliverOwnerPrompts(T.env, T0930);
ok(r.sent === 1, "switch on again: the queued question goes out");
T = setup(); T.a.exec("DROP TABLE calendar_meta");
r = await sendOwnerNotice(T.env, "s", "t");
ok(r.ok, "an unreadable switch table defaults to on");

// ---- (5a) daily cap uses the Amsterdam midnight (winter: UTC+1)
const winter = at("2026-12-10T10:00:00Z");
T = setup(); addQ(T.a, "a", "Q1"); addQ(T.a, "b", "old1"); addQ(T.a, "c", "old2");
T.a.prepare("UPDATE owner_questions SET sent_at='2026-12-09 22:30:00', attempts=1 WHERE ref IN ('b','c')").run(); // 23:30 Amsterdam on Dec 9
r = await deliverOwnerPrompts(T.env, winter);
ok(r.sent === 1, "two mails sent 23:30 Amsterdam yesterday do not count against today's cap in winter (" + JSON.stringify(r) + ")");
T = setup(); addQ(T.a, "a", "Q1"); addQ(T.a, "b", "t1"); addQ(T.a, "c", "t2");
T.a.prepare("UPDATE owner_questions SET sent_at='2026-12-09 23:10:00', attempts=1 WHERE ref IN ('b','c')").run(); // 00:10 Amsterdam today
r = await deliverOwnerPrompts(T.env, winter);
ok(r.skipped === "daily cap", "two mails sent 00:10 Amsterdam today do count (" + JSON.stringify(r) + ")");

// ---- (5b) bounded notice size
T = setup();
await sendOwnerNotice(T.env, "S".repeat(900), "B".repeat(90000));
ok(T.sent[0].subject.length <= 200 && T.sent[0].text.length <= 20100, "subject and body are bounded (" + T.sent[0].subject.length + "/" + T.sent[0].text.length + ")");

// ---- (5c) subscriber paging past 500
T = setup();
T.p.exec("CREATE TABLE companion_subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL, created_at TEXT NOT NULL, confirmed_at TEXT)");
const ins = T.p.prepare("INSERT INTO companion_subscribers (email,status,token,created_at) VALUES (?,?,?,'x')");
for (let i = 0; i < 1203; i++) ins.run("s" + i + "@x.test", i % 10 === 0 ? "pending" : "confirmed", "t" + i);
const subs = await confirmedSubscribers(T.env);
ok(subs.length === 1082, "all confirmed subscribers are read, not the first 500 (" + subs.length + ")");
ok(new Set(subs.map((s) => s.email)).size === subs.length, "paging returns no duplicates");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
