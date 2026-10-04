// radar-hub title-noise suite (1.2.3, RADAR-TITLE-NOISE-1, charter pillar: personal).
// Loads the real worker.js, runs the personal radar through the hub's /personal route with stubbed venue pages that reproduce
// the noisy stored titles of qnfo-audit.calendar rows 78-83, 92, 108 and 130, and reads the titles posted to the stubbed calendar-api.
// Proves: titles are readable event names (no dates, menu chrome, repeated venue prefix or dangling fragments), capped at 80+venue,
// prefer the nearest heading or link text, and the dedupe key (location|dtstart) is unchanged so rows already in the calendar are
// not posted again.
// Run: node radar-hub/title-noise.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const base = new Date(Date.now() + 200 * 864e5);
const Y = base.getUTCFullYear();
const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][base.getUTCMonth()];
const M3 = M.slice(0, 3);
const iso = (d) => `${Y}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const pages = {
  // Eventbrite: no year, chrome in front, previous card bleeding in, repeated "Amsterdam |" prefix
  "www.eventbrite.nl": "<html><body><nav>Indeling Prijs Taal Valuta</nav> Touch grass: nature connection for LGBTQ+ Sun, " + M3 + " 4, 1:00 PM " +
    "Amsterdam | Sing Your Queer Heart Out! Casual Queer Networking- Potluck Thu, " + M3 + " 8, 2:00 PM " +
    "Queer Parenthood Conference & Podcast Launch Sat, " + M3 + " 10, 1:30 PM</body></html>",
  // Concertgebouw: the card puts the date first and the heading or link text after it (titleDir: after)
  "www.concertgebouw.nl": "<html><body><article><span>Fri, " + M3 + " 2, " + Y + "</span><h3>Myriam Fares, presented by SOUK</h3><p>including Radio France and Detroit Symphony Orchestra) concert</p></article>" +
    "<article><span>Sat, " + M3 + " 12, " + Y + "</span><a href=\"/x\">Schubert's Trout Quintet</a> chamber music recital</article></body></html>",
  // Van Gogh: previous sentence in front of the title, trailing date range
  "www.vangoghmuseum.nl": "<html><body><p>Pick works up close and tick everything off the list. Celebrate Autumn Break 15 " + M + " " + Y + " museum activities for all.</p></body></html>",
  // Rijksmuseum: "Now on view" chrome and a trailing "From"
  "www.rijksmuseum.nl": "<html><body><p>Drawing Book Till 29 " + M + " Now on view Willem de Kooning at work From 21 " + M + " exhibition in the museum.</p></body></html>"
};
function makeEnv(existing) {
  const db = new DatabaseSync(":memory:");
  const audit = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
  const wrap = (d) => ({
    prepare(sql) {
      let args = [];
      const s = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
        async all() { return { results: d.prepare(sql).all(...args) }; },
        async first() { return d.prepare(sql).get(...args) || null; },
        async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
      return s;
    }
  });
  const posted = [];
  const CAL_API = { async fetch(url, init) { if (init && init.method === "POST") { posted.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: posted.length }), { status: 201 }); } return new Response(JSON.stringify({ events: existing || [] }), { status: 200 }); } };
  const env = { PERSONAL_DB: wrap(db), AUDIT_DB: wrap(audit), AUDIT: wrap(audit), RADAR_DB: wrap(audit), CAL_API, CAL_TOKEN: "c", RADAR_TOKEN: "t" };
  return { env, posted };
}
globalThis.fetch = async (url) => { const p = pages[new URL(String(url)).hostname]; return p ? new Response(p, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
const go = async (existing) => { const T = makeEnv(existing); await (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), T.env, {})).json(); return T.posted; };

const posted = await go();
const t = (venue, d) => (posted.find((p) => p.location === venue && p.dtstart === iso(d)) || {}).title;
console.log(posted.map((p) => p.dtstart + " " + p.title).join("\n"));
ok(t("EventbriteLGBTQ", 4) === "EventbriteLGBTQ: Touch grass: nature connection for LGBTQ+", "Eventbrite chrome and date removed (got " + t("EventbriteLGBTQ", 4) + ")");
ok(t("EventbriteLGBTQ", 8) === "EventbriteLGBTQ: Sing Your Queer Heart Out! Casual Queer Networking- Potluck", "repeated Amsterdam prefix and previous card removed (got " + t("EventbriteLGBTQ", 8) + ")");
ok(t("EventbriteLGBTQ", 10) === "EventbriteLGBTQ: Queer Parenthood Conference & Podcast Launch", "plain card title kept (got " + t("EventbriteLGBTQ", 10) + ")");
ok(t("Concertgebouw", 2) === "Concertgebouw: Myriam Fares, presented by SOUK", "the heading after the date is the title, not the details (got " + t("Concertgebouw", 2) + ")");
ok(t("Concertgebouw", 12) === "Concertgebouw: Schubert's Trout Quintet", "link text is used as the title (got " + t("Concertgebouw", 12) + ")");
ok(t("VanGoghMuseum", 15) === "VanGoghMuseum: Celebrate Autumn Break", "previous sentence and trailing date dropped (got " + t("VanGoghMuseum", 15) + ")");
ok(t("Rijksmuseum", 21) === "Rijksmuseum: Willem de Kooning at work", "Now on view chrome and trailing From dropped (got " + t("Rijksmuseum", 21) + ")");
const noisy = /indeling|valuta|opslaan|next page|cookie|\b(?:mon|tue|wed|thu|fri|sat|sun)\b,|\b20[0-9]{2}\b|\d{1,2}:\d{2}/i;
ok(posted.length >= 7 && posted.every((p) => !noisy.test(p.title.slice(p.location.length + 2))), "no posted title holds a weekday-date, year, time or navigation words");
ok(posted.every((p) => p.title.length <= p.location.length + 2 + 80 && p.title.indexOf(p.location + ": " + p.location) === -1), "titles are capped and never repeat the venue prefix");
ok(posted.every((p) => p.description && p.description.length > 0), "the description still carries the raw snippet");

// dedupe key unchanged: rows already in the calendar for location|date are not posted again, whatever their old titles said
const existing = [
  { source: "personal-radar", location: "EventbriteLGBTQ", dtstart: iso(4), title: "EventbriteLGBTQ: Indeling Prijs Taal Valuta Touch grass: nature connection for LGBTQ+ Sun, Oct 4, 1:00 PM" },
  { source: "personal-radar", location: "Rijksmuseum", dtstart: iso(21), title: "Rijksmuseum: Drawing Book Till 29 november Now on view Willem de Kooning at work From 9 October" }
];
const again = await go(existing);
ok(!again.some((p) => (p.location === "EventbriteLGBTQ" && p.dtstart === iso(4)) || (p.location === "Rijksmuseum" && p.dtstart === iso(21))), "events already in the calendar under a noisy title are not re-posted");
ok(again.length === posted.length - 2, "only the two existing keys are skipped (" + again.length + " of " + posted.length + ")");

const h = await (await W.fetch(new Request("https://radar-hub.example/health"), {}, {})).json();
ok(h.version === "1.2.3", "hub /health reports 1.2.3");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
