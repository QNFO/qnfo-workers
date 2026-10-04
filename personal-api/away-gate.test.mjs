// personal-api away-gate suite (4.5.2, AWAY-GATE-2, charter pillar: personal, agent_issues #1884).
// Loads the real worker.js and drives GET /v1/brief?force=1 against an in-memory SQLite personal-life D1 (events table)
// and a stubbed calendar-api service binding, with Date.now pinned. Proves: a brief built for a date inside a lodging
// window (city not Amsterdam, end date exclusive) lists no Amsterdam events (SQL rows and calendar rows); the day before
// check-in and the check-out day are still listed; Amsterdam lodging, malformed lodging rows and travel rows create no
// window; Polish or lodging/travel rows inside the window stay; a failing events query means no filtering.
// Run: node personal-api/away-gate.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const wrap = (d, opts) => ({
  prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { if (opts && opts.failEvents && /FROM events/i.test(sql) && /lodging/.test(sql)) throw new Error("boom"); return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return s;
  }
});
function makeEnv(opts) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, energy INTEGER, energy_label TEXT)");
  db.exec("CREATE TABLE daily_briefs (date TEXT PRIMARY KEY, payload TEXT, built_at TEXT)");
  const calRows = [];
  const CAL_API = { async fetch(url) { return new Response(JSON.stringify({ events: calRows }), { status: 200 }); } };
  const env = { PERSONAL: wrap(db, opts), CAL_API, CAL_TOKEN: "c", API_KEY: "k" };
  return { db, env, calRows };
}
const ins = (db, id, cat, title, venue, city, st, en) => db.prepare("INSERT INTO events (id, category, title, venue, city, country, start_date, end_date) VALUES (?,?,?,?,?,?,?,?)").run(id, cat, title, venue, city, "x", st, en);
globalThis.fetch = async () => new Response("{}", { status: 200 });
const RealDate = Date;
async function briefOn(T, day) {
  const fixed = new RealDate(day + "T08:00:00Z").getTime();
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } };
  try {
    const res = await W.fetch(new Request("https://p.example/v1/brief?force=1", { headers: { authorization: "Bearer k" } }), T.env, { waitUntil() {} });
    return await res.json();
  } finally { globalThis.Date = RealDate; }
}
const titles = (b) => [...b.calendar.today, ...b.calendar.tomorrow, ...b.calendar.upcoming7].map((e) => e.title);

function seed(T) {
  ins(T.db, "l1", "lodging", "Hotel Wroclaw", "Hotel", "Wroclaw", "2026-10-04", "2026-10-06");
  ins(T.db, "l2", "lodging", "Hotel Krakow", "Hotel", "Krakow", "2026-10-06", "2026-10-14");
  ins(T.db, "t1", "travel", "Flight EIN to WRO", "Eindhoven Airport", "Eindhoven", "2026-10-04", "2026-10-04");
  ins(T.db, "e3", "music", "AMS Oct 3", "Bimhuis", "Amsterdam", "2026-10-03", "2026-10-03");
  ins(T.db, "e5", "music", "AMS Oct 5", "Bimhuis", "Amsterdam", "2026-10-05", "2026-10-05");
  ins(T.db, "e5b", "music", "NOCITY Oct 5", "Bimhuis, Piet Heinkade 3", "", "2026-10-05", "2026-10-05");
  ins(T.db, "e5c", "conference", "PL conf Oct 5", "Wroclaw University", "Wroclaw", "2026-10-05", "2026-10-09");
  ins(T.db, "e14", "music", "AMS Oct 14", "Bimhuis", "Amsterdam", "2026-10-14", "2026-10-14");
}
// control: no lodging rows
let T = makeEnv({});
ins(T.db, "e5", "music", "AMS Oct 5", "Bimhuis", "Amsterdam", "2026-10-05", "2026-10-05");
let b = await briefOn(T, "2026-10-05");
ok(titles(b).includes("AMS Oct 5"), "control: no lodging row, the Amsterdam event is listed (" + titles(b) + ")");

// inside the window
T = makeEnv({}); seed(T);
T.calRows.push({ title: "CAL AMS Oct 5", location: "Concertgebouw, Amsterdam", dtstart: "2026-10-05T20:00:00", status: "confirmed", source: "personal-radar" });
T.calRows.push({ title: "CAL Warsaw Oct 5", location: "Warsaw", dtstart: "2026-10-05T20:00:00", status: "confirmed", source: "twin" });
b = await briefOn(T, "2026-10-05");
let t = titles(b);
ok(!t.includes("AMS Oct 5") && !t.includes("NOCITY Oct 5") && !t.includes("CAL AMS Oct 5"), "inside the window no Amsterdam event is listed (" + t + ")");
ok(t.includes("PL conf Oct 5") && t.includes("CAL Warsaw Oct 5"), "non-Amsterdam events inside the window stay (" + t + ")");
ok(Array.isArray(b.away_windows) && b.away_windows.length === 2 && b.away_windows[0].city === "Wroclaw", "the brief names the away windows");

// day before check-in: Oct 3 sees Oct 3 and tomorrow Oct 4 (flight, travel row stays)
b = await briefOn(T, "2026-10-03");
t = titles(b);
ok(t.includes("AMS Oct 3"), "the day before check-in still lists the Amsterdam event (" + t + ")");
ok(t.includes("Flight EIN to WRO"), "travel rows are never hidden (" + t + ")");
ok(!t.includes("AMS Oct 5"), "an Oct 5 event is hidden even when seen from Oct 3 (upcoming7)");

// check-out day Oct 14 (end exclusive)
b = await briefOn(T, "2026-10-14");
ok(titles(b).includes("AMS Oct 14"), "the check-out day lists the Amsterdam event again (" + titles(b) + ")");

// Amsterdam lodging, malformed, reversed rows create no window
T = makeEnv({});
ins(T.db, "a1", "lodging", "Home stay", "x", "Amsterdam", "2026-10-04", "2026-10-14");
ins(T.db, "m1", "lodging", "bad", "x", "Krakow", "2026-10-04", "");
ins(T.db, "m2", "lodging", "bad", "x", "Krakow", "2026-10-14", "2026-10-04");
ins(T.db, "m3", "lodging", "bad", "x", "Krakow", "soon", "later");
ins(T.db, "e5", "music", "AMS Oct 5", "Bimhuis", "Amsterdam", "2026-10-05", "2026-10-05");
b = await briefOn(T, "2026-10-05");
ok(titles(b).includes("AMS Oct 5") && !b.away_windows, "Amsterdam lodging and malformed rows create no window (" + titles(b) + ")");

// fail safe: lodging query errors -> no filtering
T = makeEnv({ failEvents: true }); seed(T);
b = await briefOn(T, "2026-10-05");
ok(titles(b).includes("AMS Oct 5"), "a failing lodging query means no filtering (" + titles(b) + ")");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
