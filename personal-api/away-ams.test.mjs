// personal-api AWAY-AMS-1 suite (4.8.2, charter pillar: personal, agent_issues #1883). Same harness as away-gate.test.mjs.
// Proves: inside an away window the brief still lists Amsterdam events the owner owns (Google/ICS calendar rows, manual rows,
// Outlook rows in personal-life) and hides only radar/twin suggestions and web-catalog rows; outside the window nothing changes.
// Run: node personal-api/away-ams.test.mjs   -> prints "N passed, 0 failed"
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
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, energy INTEGER, energy_label TEXT, source TEXT)");
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

const insS = (db, id, title, venue, city, src) => db.prepare("INSERT INTO events (id, category, title, venue, city, country, start_date, end_date, source) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "music", title, venue, city, "x", "2026-10-05", "2026-10-05", src);
const T = makeEnv({});
ins(T.db, "l1", "lodging", "Hotel Krakow", "Hotel", "Krakow", "2026-10-04", "2026-10-14");
insS(T.db, "s1", "OUTLOOK dentist", "Tandarts", "Amsterdam", "outlook-calendar");
insS(T.db, "s2", "CATALOG Bimhuis", "Bimhuis", "Amsterdam", "qnfo-ops:web:bimhuis.nl");
insS(T.db, "s3", "LEGACY nosource", "Bimhuis", "Amsterdam", null);
const cal = (title, loc, src) => T.calRows.push({ title, location: loc, dtstart: "2026-10-05T20:00:00", status: "confirmed", source: src });
cal("GOOGLE Concertgebouw", "Concertgebouw, Amsterdam", "google");
cal("GOOGLE Diemen", "Diemen", "google");
cal("MANUAL Amstelveen", "Amstelveen", "manual");
cal("RADAR Paradiso", "Paradiso, Amsterdam", "personal-radar");
cal("TWIN Melkweg", "Melkweg, Amsterdam", "personal-twin");
cal("GOOGLE Warsaw", "Warsaw", "google");
let b = await briefOn(T, "2026-10-05");
let t = titles(b);
ok(["GOOGLE Concertgebouw", "GOOGLE Diemen", "MANUAL Amstelveen", "GOOGLE Warsaw", "OUTLOOK dentist"].every((x) => t.includes(x)), "the owner's own Amsterdam-area events stay inside the window (" + t + ")");
ok(!t.includes("RADAR Paradiso") && !t.includes("TWIN Melkweg") && !t.includes("CATALOG Bimhuis") && !t.includes("LEGACY nosource"), "only suggestions and catalog rows are hidden (" + t + ")");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
