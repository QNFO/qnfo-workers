// calendar-api trip-window suite (0.7.3, OQ-TRIP-WINDOW-1, charter pillar: personal): the owner-question producer decides "local or away" from the
// trip windows already in the calendar (domain travel / trip- uids) and an explicit Amsterdam-area list, not a country-name heuristic.
// Run: node --no-warnings calendar-api/trip-window.test.mjs   -> prints "N passed, 0 failed"
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


// Now: Wed 2026-10-07 20:00Z = 22:00 Amsterdam. Trip: Oct 4..Oct 14 (banner all-day, dtend exclusive 15) + Krakow hotel Oct 6..9.
const W1 = (loc, t, extra) => Object.assign({ title: t, location: loc, dtstart: "2026-10-07T19:00:00+02:00", dtend: "2026-10-07T20:00:00+02:00" }, extra || {});
async function run(setup) {
  const { db, env } = await mk();
  setup && setup(db);
  await tick(env);
  return db.prepare("SELECT subject, ref FROM owner_questions WHERE kind='after-event'").all().map((r) => r.subject);
}
const trip = (db) => {
  add(db, { uid: "trip-pl-2026-banner@qnfo.cloud", title: "Away: Poland trip", location: "Poland", dtstart: "2026-10-04", dtend: "2026-10-15", all_day: 1, source: "manual" });
  db.prepare("UPDATE calendar SET domain='travel' WHERE uid LIKE 'trip-%'").run();
};
// 1. no trip: Amsterdam asked; a place not on the Amsterdam list (Zwolle, Dutch town the old regex never named) is not asked; empty location asked
let q = await run((db) => { add(db, W1("Bimhuis, Piet Heinkade 3, Amsterdam", "AMS")); add(db, W1("Concertgebouw, Concertgebouwplein 10, 1071 LN", "POSTCODE")); add(db, W1("Zwolle", "ZWOLLE")); add(db, W1("Gent, België", "GENT")); add(db, W1(null, "NOLOC")); add(db, W1("Amstelveen", "AMSTELVEEN")); });
ok(q.some((s) => /AMS/.test(s)) && q.some((s) => /POSTCODE/.test(s)) && q.some((s) => /AMSTELVEEN/.test(s)) && q.some((s) => /NOLOC/.test(s)), "local events asked: " + q);
ok(!q.some((s) => /ZWOLLE|GENT/.test(s)), "locations outside the Amsterdam-area list are not asked: " + q);
// 2. during a trip: a foreign place the old regex did not know (Gdansk spelled Danzig, Praha) and empty-location rows are not asked; so is an Amsterdam-named one
q = await run((db) => { trip(db); add(db, W1("Praha, Czechia", "PRAHA")); add(db, W1("Danzig", "DANZIG")); add(db, W1(null, "NOLOC")); add(db, W1("Bimhuis, Amsterdam", "AMS-DURING-TRIP")); });
ok(q.length === 0, "inside a trip window nothing is asked, Amsterdam-located included (he is away): " + q);
// 3. return day: window end is exclusive, so an Amsterdam event on Oct 15 evening is asked
at("2026-10-15T20:00:00Z");
q = await run((db) => { trip(db); add(db, { title: "BACK-HOME", location: "Amsterdam", dtstart: "2026-10-15T19:00:00+02:00", dtend: "2026-10-15T20:00:00+02:00" }); });
ok(q.length === 1 && /BACK-HOME/.test(q[0]), "the first day after the window asks again: " + q);
at("2026-10-07T20:00:00Z");
// 4. a cancelled trip row opens no window; an Amsterdam hotel row opens none
q = await run((db) => { trip(db); db.prepare("UPDATE calendar SET status='cancelled'").run(); add(db, W1("Bimhuis, Amsterdam", "AMS-CANCELLED-TRIP")); });
ok(q.length === 1, "a cancelled trip row opens no window: " + q);
q = await run((db) => { add(db, { uid: "trip-home@qnfo.cloud", title: "Staycation hotel", location: "Amsterdam", dtstart: "2026-10-05", dtend: "2026-10-10", all_day: 1, source: "manual" }); db.prepare("UPDATE calendar SET domain='travel'").run(); add(db, W1("Amsterdam", "AMS-STAY")); });
ok(q.length === 1, "a travel row located in Amsterdam opens no window: " + q);
// 5. /feedback paging: after_id walks 1,200 rows ascending, once each, in bounded pages; the legacy call is unchanged
{
  const { db, env } = await mk();
  const ins = db.prepare("INSERT INTO calendar_feedback (cal_id, action, ts) VALUES (1,'went',?)");
  for (let i = 0; i < 1200; i++) ins.run("2026-10-0" + (1 + (i % 5)) + " 10:00:00");
  const H = { Authorization: "Bearer tok-1" };
  const get = async (q) => (await W.fetch(new Request("https://calendar-api.q08.workers.dev/feedback" + q, { headers: H }), env)).json();
  const seen = new Set(); let after = 0, pages = 0, more = true;
  while (more && pages < 10) { const j = await get("?after_id=" + after + "&limit=500"); pages++; for (const r of j.feedback) seen.add(r.id); more = j.more; after = j.next_after_id; ok(j.order === "asc", "page is ascending"); }
  ok(seen.size === 1200 && pages === 3 && after === 1200 && !more, "after_id drains 1200 rows in 3 pages: " + seen.size + "/" + pages);
  const legacy = await get("?limit=500");
  ok(legacy.count === 500 && legacy.feedback[0].id === 1200 && legacy.more === undefined, "legacy call is newest-first and unchanged");
  const empty = await get("?after_id=1200");
  ok(empty.count === 0 && empty.more === false && empty.next_after_id === 1200, "past the end: empty page keeps the cursor");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
