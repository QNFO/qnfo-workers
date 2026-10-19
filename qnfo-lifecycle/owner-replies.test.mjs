// OWNER-REPLY-BODY-TEXT-1 offline suite (qnfo-lifecycle 1.13.1, issue 100259): slices runQuery and processOwnerReplies out of worker.js and runs them against an in-memory SQLite
// calendar D1 (node:sqlite) whose emails table is the live qnfo-audit shape: body_text and body_html, no body column and no from column (pragma_table_info read 2026-10-19 22:12Z).
// 1.12.1 selected `body` and then a nonexistent "from" column, so every hourly tick logged "no such column: body" and the owner's yes/no replies were never stored (cal 153 answered, no feedback row).
// Proves: a yes reply stores calendar_feedback (source email-reply, action went) and sets the calendar row confirmed; a no reply stores nope and cancelled; a rerun adds nothing; an unclear reply,
// a reply from another sender and an empty body_text store nothing; the newest reply wins; none of it logs an error; a schema that really lacks body_text is logged once per question as
// email_query_primary and the loop moves on without throwing; the source has no `SELECT body FROM emails` and no "from" fallback; VERSION is at least 1.13.1; the mirror is identical.
// Run: node qnfo-lifecycle/owner-replies.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const slice = (from, toMarker) => {
  const a = src.indexOf(from), b = src.indexOf(toMarker, a);
  if (a < 0 || b < a) throw new Error("block not found: " + from);
  return src.slice(a, b + toMarker.length);
};
const code = slice("async function runQuery(env, sql, params) {", '__name(runQuery, "runQuery");') + "\n" + slice("async function processOwnerReplies(env) {", '__name(processOwnerReplies, "processOwnerReplies");');
const errors = [];
const cx = vm.createContext({ Date, Number, String, JSON, parseInt, RegExp, console: { error: (x) => errors.push(String(x)), log() {} }, __name: (f) => f });
vm.runInContext(code + "\nthis.reply = processOwnerReplies;", cx);

function mk(emailCols = "id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, subject TEXT, body_text TEXT, body_html TEXT") {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(kind, ref));
CREATE TABLE calendar (id INTEGER PRIMARY KEY, uid TEXT, title TEXT, location TEXT, domain TEXT, dtstart TEXT, relevance REAL, friction REAL, status TEXT DEFAULT 'tentative', updated TEXT);
CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER NOT NULL, uid TEXT, action TEXT NOT NULL, reason TEXT, met TEXT, note TEXT, title TEXT, location TEXT, domain TEXT, source TEXT, dtstart TEXT, relevance REAL, friction REAL, ts TEXT DEFAULT (datetime('now')), synced_to_ledger INTEGER DEFAULT 0);
CREATE TABLE emails (${emailCols});`);
  const stmt = (sql) => {
    let args = [];
    const self = {
      sql, bind(...x) { args = x; return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _run() { db.prepare(sql).run(...args); }
    };
    return self;
  };
  const CAL_DB = { prepare: stmt, async batch(list) { db.exec("BEGIN"); try { list.forEach((s) => s._run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return list.map(() => ({ success: true })); } };
  return { db, env: { CAL_DB } };
}
const cal = (db, id, title) => db.prepare("INSERT INTO calendar (id, uid, title, location, domain, dtstart, relevance, friction) VALUES (?, ?, ?, 'Amsterdam', 'music', '2026-10-18T19:00:00', 0.5, 0.1)").run(id, "uid-" + id, title);
const oq = (db, ref, subject) => db.prepare("INSERT INTO owner_questions (kind, ref, subject, body) VALUES ('after-event', ?, ?, 'did you go?')").run(String(ref), subject);
const mail = (db, sender, subject, text, html = null) => db.prepare("INSERT INTO emails (sender, subject, body_text, body_html) VALUES (?, ?, ?, ?)").run(sender, subject, text, html);
const fb = (db) => db.prepare("SELECT cal_id, action, source FROM calendar_feedback ORDER BY cal_id").all();
const status = (db, id) => db.prepare("SELECT status FROM calendar WHERE id = ?").get(id).status;
const OWNER = "rwnquni@gmail.com";

{
  const { db, env } = mk();
  cal(db, 153, "Concert A"); cal(db, 154, "Concert B"); cal(db, 155, "Concert C"); cal(db, 156, "Concert D"); cal(db, 157, "Concert E"); cal(db, 158, "Concert F"); cal(db, 159, "Concert G");
  for (const [id, t] of [[153, "Concert A"], [154, "Concert B"], [155, "Concert C"], [156, "Concert D"], [157, "Concert E"], [158, "Concert F"], [159, "Concert G"]]) oq(db, id, "Did you go to " + t + "?");
  mail(db, OWNER, "Re: Did you go to Concert A?", "Yes, it was great\n\nOn Sun wrote: did you go?");
  mail(db, OWNER, "Re: Did you go to Concert B?", "nope\r\nsecond line");
  mail(db, OWNER, "Re: Did you go to Concert C?", "maybe next time");
  mail(db, "someone@example.com", "Re: Did you go to Concert D?", "yes");
  mail(db, OWNER, "Re: Did you go to Concert E?", "no");
  mail(db, OWNER, "Re: Did you go to Concert E?", "yes I did");
  mail(db, OWNER, "Re: Did you go to Concert F?", "", "<p>yes</p>");
  // Concert G: no reply at all

  const n = await cx.reply(env);
  const f = fb(db);
  ok(n === 3, "three answers stored (A went, B nope, E newest yes)", n);
  ok(f.length === 3, "three feedback rows", f);
  ok(f.find((x) => x.cal_id === 153)?.action === "went" && f.find((x) => x.cal_id === 153)?.source === "email-reply", "a yes reply stores went with source email-reply", f);
  ok(status(db, 153) === "confirmed", "went sets the calendar row confirmed", status(db, 153));
  ok(f.find((x) => x.cal_id === 154)?.action === "nope" && status(db, 154) === "cancelled", "a no reply stores nope and cancels the row");
  ok(!f.some((x) => x.cal_id === 155) && status(db, 155) === "tentative", "an unclear reply stores nothing");
  ok(!f.some((x) => x.cal_id === 156), "a reply from another sender stores nothing");
  ok(f.find((x) => x.cal_id === 157)?.action === "went", "the newest reply wins", f);
  ok(!f.some((x) => x.cal_id === 158), "an empty body_text stores nothing (the html part is not parsed)");
  ok(!f.some((x) => x.cal_id === 159), "an unanswered question stores nothing");
  ok(errors.length === 0, "the live emails shape logs no error", errors);

  const again = await cx.reply(env);
  ok(again === 0 && fb(db).length === 3, "a rerun adds nothing", { again, rows: fb(db).length });
  ok(errors.length === 0, "the rerun logs no error", errors);
}

{
  errors.length = 0;
  const { db, env } = mk("id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, subject TEXT, body TEXT");
  cal(db, 1, "Concert A"); cal(db, 2, "Concert B");
  oq(db, 1, "Did you go to Concert A?"); oq(db, 2, "Did you go to Concert B?");
  let n = -1, threw = false;
  try { n = await cx.reply(env); } catch { threw = true; }
  ok(!threw && n === 0 && fb(db).length === 0, "a schema without body_text stores nothing and does not throw", { n, threw });
  ok(errors.length === 2 && errors.every((e) => e.includes("email_query_primary") && e.includes("no such column")), "the failure is logged once per question as email_query_primary", errors);
}

{
  ok(!/SELECT body FROM emails/.test(src), "the source no longer selects a body column from emails");
  ok(/SELECT body_text AS body FROM emails WHERE subject=\? AND sender LIKE/.test(src), "the query reads body_text aliased to body");
  ok(!/email_query_fallback/.test(src) && !/"from" LIKE/.test(src), "the dead from-column fallback is gone");
  const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(v && (Number(v[1]) > 1 || Number(v[2]) > 13 || (Number(v[2]) === 13 && Number(v[3]) >= 1)), "VERSION is at least 1.13.1", v && v[0]);
  ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
