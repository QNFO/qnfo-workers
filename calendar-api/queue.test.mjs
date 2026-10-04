// calendar-api owner-question producer suite (0.6.0, CONNECTION-PRODUCER-1, charter pillar: personal).
// Loads the real worker.js, runs scheduled() against an in-memory SQLite D1 with a frozen clock.
// Run: node --no-warnings calendar-api/queue.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const W = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const RealDate = Date;
let NOW = RealDate.parse("2026-10-07T20:00:00Z");
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};
const at = (iso) => { NOW = RealDate.parse(iso); };

function makeEnv(token) {
  const db = new DatabaseSync(":memory:");
  const stmtOn = (sql) => {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return s;
  };
  const env = { CAL_DB: { prepare: stmtOn, async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } }, ICS_R2: { async put() {}, async delete() {} }, CAL_TOKEN: token };
  return { db, env };
}
async function tick(env) {
  const ps = [];
  await W.scheduled({}, env, { waitUntil: (p) => ps.push(p) });
  await Promise.all(ps);
}
const mk = async (token) => { const t = makeEnv(token === undefined ? "tok-1" : token); await W.fetch(new Request("https://calendar-api.q08.workers.dev/health"), t.env); return t; };
let n = 0;
const add = (db, o) => db.prepare("INSERT INTO calendar (plane, uid, title, location, dtstart, dtend, all_day, source, status, relevance) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run(o.plane || "personal", o.uid || "u" + (++n) + "@x", o.title || "Jazz night", o.location === undefined ? "Bimhuis, Piet Heinkade 3, Amsterdam" : o.location, o.dtstart, o.dtend || null, o.all_day || 0, o.source || "personal-twin", o.status || "confirmed", o.relevance ?? null);
const oq = (db, kind) => db.prepare("SELECT * FROM owner_questions WHERE kind=? ORDER BY id").all(kind);

// ---- after-event: Wed 2026-10-07 20:00Z = 22:00 Amsterdam (CEST) ----
{
  const { db, env } = await mk();
  const good = add(db, { title: "Bimhuis jam", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" }).lastInsertRowid; // ended 20:00 local = 18:00Z, 2h ago
  add(db, { title: "all-day", dtstart: "2026-10-07", all_day: 1 });
  add(db, { title: "date-only radar row", dtstart: "2026-10-07", source: "personal-radar" });
  add(db, { title: "manual", source: "manual", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "trip", uid: "trip-pl@qnfo.cloud", source: "personal-radar", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "future", dtstart: "2026-10-08T19:00:00+02:00", dtend: "2026-10-08T20:00:00+02:00" });
  add(db, { title: "too old", dtstart: "2026-10-07T08:00:00+02:00", dtend: "2026-10-07T09:00:00+02:00" });
  add(db, { title: "not yet 1h", dtstart: "2026-10-07T20:00:00+02:00", dtend: "2026-10-07T21:30:00+02:00" });
  add(db, { title: "tentative", status: "tentative", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "cancelled", status: "cancelled", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "Krakow gig", location: "Krakow, Poland", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "qnfo plane", plane: "qnfo", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  add(db, { title: "foreign offset", dtstart: "2026-10-07T19:00:00+09:00", dtend: "2026-10-07T20:00:00+09:00" });
  add(db, { title: "other source", source: "notes-intake", dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  await tick(env);
  const rows = oq(db, "after-event");
  ok(rows.length === 1, "exactly one after-event row for the qualifying event, got " + rows.length);
  const r = rows[0] || {};
  ok(r.ref === String(good), "ref is the calendar id");
  ok(r.subject === "Did you go to Bimhuis jam?", "subject: " + r.subject);
  ok(r.priority === 3, "priority 3");
  ok(/https:\/\/calendar-api\.q08\.workers\.dev\/e\/\d+\?s=[0-9a-f]{24}/.test(r.body || ""), "body carries the signed link");
  ok(/Tap "I went" and say who you talked to\./.test(r.body || ""), "body carries the instruction sentence");
  ok(r.not_before === "2026-10-07 19:00:00", "not_before = end + 1h in UTC (end 18:00Z): " + r.not_before);
  ok(r.sent_at === null && r.attempts === 0, "row is unsent");
  await tick(env); await tick(env);
  ok(oq(db, "after-event").length === 1, "idempotent on rerun");
  ok(oq(db, "triage").length === 0, "no triage on a Wednesday");
  db.prepare("INSERT INTO calendar_feedback (cal_id, action) VALUES (?, 'went')").run(good);
  db.prepare("DELETE FROM owner_questions").run();
  await tick(env);
  ok(oq(db, "after-event").length === 0, "no question once the owner already answered");
}

// ---- no end time: default 2h length; boundaries at 1h and 6h ----
{
  const { db, env } = await mk();
  at("2026-10-07T21:00:00Z");
  const a = add(db, { dtstart: "2026-10-07T20:00:00+02:00" }).lastInsertRowid; // start 18:00Z, end 20:00Z -> exactly 1h ago: included
  const b = add(db, { dtstart: "2026-10-07T20:01:00+02:00" }).lastInsertRowid; // end 20:01Z -> 59 min ago: excluded
  const c = add(db, { dtstart: "2026-10-07T13:00:00+02:00" }).lastInsertRowid; // end 13:00Z+... start 11:00Z end 13:00Z -> 8h ago excluded
  const d = add(db, { dtstart: "2026-10-07T17:00:00+02:00" }).lastInsertRowid; // start 15:00Z end 17:00Z -> 4h ago included
  const e = add(db, { dtstart: "2026-10-07T15:00:00Z", dtend: "2026-10-07T15:00:00Z" }).lastInsertRowid; // end<=start -> default 2h: end 17:00Z, 4h ago, included
  await tick(env);
  const refs = oq(db, "after-event").map((x) => x.ref).sort();
  ok(JSON.stringify(refs) === JSON.stringify([String(a), String(d), String(e)].sort()), "1h boundary inclusive, 59min and 8h excluded: " + refs);
  ok(b && c, "fixtures");
  at("2026-10-07T20:00:00Z");
}

// ---- Amsterdam wall-clock (no offset) and DST boundary ----
{
  const { db, env } = await mk();
  // summer: wall 22:00 = 20:00Z. now 2026-10-08T00:30Z; end wall 23:00 = 21:00Z -> 3.5h ago: included
  at("2026-10-08T00:30:00Z");
  const s = add(db, { dtstart: "2026-10-07T22:00:00", dtend: "2026-10-07T23:00:00" }).lastInsertRowid;
  // winter (CET, DST ended 2026-10-25): wall 22:00 = 21:00Z; now 2026-10-26T01:30Z; end wall 23:00 = 22:00Z -> 3.5h ago: included
  // and the same wall time read as CEST (+2) would be 21:00Z -> 4.5h ago, still inside, so pin it with a tight bound:
  const { db: db2, env: env2 } = await mk();
  at("2026-10-25T22:30:00Z"); // 23:30 CET; wall end 22:30 CET = 21:30Z => 1h ago, included only if CET offset is used
  const w = add(db2, { dtstart: "2026-10-25T21:30:00", dtend: "2026-10-25T22:30:00" }).lastInsertRowid;
  ok(true, "fixtures");
  at("2026-10-08T00:30:00Z"); await tick(env);
  at("2026-10-25T22:30:00Z"); await tick(env2);
  ok(oq(db, "after-event").map((x) => x.ref).join() === String(s), "wall-clock summer event queued");
  ok(oq(db2, "after-event").map((x) => x.ref).join() === String(w), "wall-clock winter event uses CET (+01:00), 1h boundary");
  ok(oq(db2, "after-event")[0].not_before === "2026-10-25 22:30:00", "winter not_before: " + oq(db2, "after-event")[0].not_before);
  // a +02:00 offset in winter is not Amsterdam: skipped
  const { db: db3, env: env3 } = await mk();
  at("2026-12-10T22:00:00Z");
  add(db3, { dtstart: "2026-12-10T19:00:00+02:00", dtend: "2026-12-10T20:00:00+02:00" });
  add(db3, { dtstart: "2026-12-10T19:00:00+01:00", dtend: "2026-12-10T20:00:00+01:00" });
  await tick(env3);
  ok(oq(db3, "after-event").length === 1, "offset must match Amsterdam at that date (CET in December)");
}

// ---- triage: Sundays only, max 5, within 14 days, radar tentative only ----
{
  const { db, env } = await mk();
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push(add(db, { source: "personal-radar", status: "tentative", title: "Concertgebouw: Piece " + i + " Mon", location: "Concertgebouw", dtstart: "2026-10-1" + i % 5, relevance: i }).lastInsertRowid);
  add(db, { source: "personal-radar", status: "tentative", title: "Stedelijk: far away", dtstart: "2026-12-01", relevance: 9 });
  add(db, { source: "personal-radar", status: "tentative", title: "Stedelijk: too late", dtstart: "2026-10-26", relevance: 9 });
  add(db, { source: "personal-radar", status: "tentative", title: "Stedelijk: yesterday", dtstart: "2026-10-03", relevance: 9 });
  add(db, { source: "personal-radar", status: "cancelled", title: "Stedelijk: cancelled", dtstart: "2026-10-12", relevance: 9 });
  add(db, { source: "personal-twin", status: "tentative", title: "Twin tentative", dtstart: "2026-10-12", relevance: 9 });
  add(db, { source: "personal-radar", status: "tentative", title: "EventbriteLGBTQ: Amsterdam Dit evenement opslaan: Pride Tour SIPS & SORCERY Thu, Sep 10", dtstart: "2026-10-12", relevance: 20 });
  for (const day of ["2026-10-05T10:00:00Z", "2026-10-06T10:00:00Z", "2026-10-10T10:00:00Z"]) { at(day); await tick(env); }
  ok(oq(db, "triage").length === 0, "no triage Mon/Tue/Sat");
  at("2026-10-11T10:00:00Z"); // Sunday 12:00 Amsterdam
  await tick(env);
  let t = oq(db, "triage");
  ok(t.length === 1 && t[0].ref === "2026-W41", "one triage row for ISO week 2026-W41: " + JSON.stringify(t.map((x) => x.ref)));
  const links = (t[0].body.match(/\/e\/\d+\?s=[0-9a-f]{24}/g) || []);
  ok(links.length === 5 && new Set(links).size === 5, "five distinct signed links, got " + links.length);
  ok(t[0].priority === 5 && t[0].not_before === null, "priority 5");
  ok(!/opslaan|Eventbrite|Concertgebouw: /.test(t[0].body.replace(/, Concertgebouw\)/g, "")), "title noise and venue prefix stripped");
  ok(/Pride Tour/.test(t[0].body) && !/far away|too late|yesterday|cancelled|Twin tentative/.test(t[0].body), "window and filters respected");
  await tick(env); await tick(env);
  ok(oq(db, "triage").length === 1, "triage idempotent within the week");
  at("2026-10-18T10:00:00Z");
  await tick(env);
  ok(oq(db, "triage").map((x) => x.ref).join() === "2026-W41,2026-W42", "next Sunday adds the next week's row");
}

// ---- Sunday boundaries in Amsterdam time ----
{
  const { db, env } = await mk();
  add(db, { source: "personal-radar", status: "tentative", title: "V: Sunday boundary", dtstart: "2026-10-14" });
  at("2026-10-10T22:30:00Z"); // Saturday 22:30 UTC = Sunday 00:30 Amsterdam (CEST)
  await tick(env);
  ok(oq(db, "triage").length === 1, "Sat 22:30Z is already Sunday in Amsterdam: triage queued");
  const { db: d2, env: e2 } = await mk();
  add(d2, { source: "personal-radar", status: "tentative", title: "V: Sunday boundary", dtstart: "2026-10-14" });
  at("2026-10-11T22:30:00Z"); // Sunday 22:30 UTC = Monday 00:30 Amsterdam
  await tick(e2);
  ok(oq(d2, "triage").length === 0, "Sun 22:30Z is already Monday in Amsterdam: no triage");
  const { db: d3, env: e3 } = await mk();
  add(d3, { source: "personal-radar", status: "tentative", title: "V: week 53", dtstart: "2027-01-02" });
  at("2026-12-27T10:00:00Z");
  await tick(e3);
  ok(oq(d3, "triage").map((x) => x.ref).join() === "2026-W52", "ISO week label across year end: " + oq(d3, "triage").map((x) => x.ref));
  const { db: d4, env: e4 } = await mk();
  add(d4, { source: "personal-radar", status: "tentative", title: "V: nothing", dtstart: "2030-01-01" });
  at("2026-10-11T10:00:00Z");
  await tick(e4);
  ok(oq(d4, "triage").length === 0, "no triage row when nothing qualifies");
}

// ---- guards ----
{
  const t = await mk(null);
  add(t.db, { dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" });
  at("2026-10-07T20:00:00Z");
  await tick(t.env);
  ok(oq(t.db, "after-event").length === 0, "no CAL_TOKEN: no links can be signed, nothing queued");
  const tb = await mk();
  at("2026-10-07T20:00:00Z"); await tick(tb.env);
  tb.db.prepare("INSERT INTO owner_questions (kind, ref, subject, body) VALUES ('daily-nudge','x','s','b')").run();
  const ddl = tb.db.prepare("SELECT sql FROM sqlite_master WHERE name='owner_questions'").get().sql;
  ok(/UNIQUE\(kind, ref\)/.test(ddl) && /last_error TEXT/.test(ddl), "owner_questions created with the delivery columns and UNIQUE(kind, ref)");
  const h = await (await W.fetch(new Request("https://calendar-api.q08.workers.dev/health"), tb.env)).json();
  ok(h.version === "0.6.0-queue", "health version");
}
globalThis.Date = RealDate;
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
