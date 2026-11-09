// personal-api Today trip card (TRAVEL-TRIP-STATE-1, agent_issues 1002269, charter pillar: personal).
// Loads the real companion.js and drives tripCard() against an in-memory SQLite D1. Run: node personal-api/companion-trip-card.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { tripCard } from "./companion.js";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const wrap = (d) => ({ prepare(sql) { let a = []; const s = {
  bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return s; },
  async all() { return { results: d.prepare(sql).all(...a) }; },
  async first() { return d.prepare(sql).get(...a) || null; } }; return s; } });
const db = new DatabaseSync(":memory:");
const D = wrap(db);

ok((await tripCard(D, "2026-11-09").catch(() => "threw")) === "threw", "a missing table throws, which today() turns into a null card");
db.exec("CREATE TABLE travel_stops (id TEXT PRIMARY KEY, trip TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, start_date TEXT, end_date TEXT)");
ok((await tripCard(D, "2026-11-09")) === null, "no stops means no card");
db.prepare("INSERT INTO travel_stops VALUES ('s1','next','Delhi','IN','2026-11-12','2026-11-16')").run();
db.prepare("INSERT INTO travel_stops VALUES ('s2','next','Pokhara','NP','2026-11-16','2026-11-22')").run();
let c = await tripCard(D, "2026-11-09");
ok(c && c.mode === "countdown" && c.days_to_start === 3 && c.city === "Delhi" && c.booked === false && /No stay booked yet/.test(c.line), "countdown with nothing booked", c);
db.prepare("INSERT INTO events VALUES ('e1','lodging','Hotel','2026-11-12','2026-11-16')").run();
c = await tripCard(D, "2026-11-09");
ok(c.booked === true && !/No stay booked/.test(c.line), "a covering lodging row marks it booked", c);
c = await tripCard(D, "2026-11-17");
ok(c.mode === "away" && c.city === "Pokhara" && /until 2026-11-22/.test(c.line), "inside a stop it says where you are", c);
ok((await tripCard(D, "2026-12-01")) === null, "after the plan there is no card");
ok(c.url === "https://travel.q08.org/travel", "the card links to the planner");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok(/function tripCard\(/.test(src) && /id:'trip-card'/.test(src), "worker.js carries the card and its renderer (run personal-api/inline-companion.mjs)");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
