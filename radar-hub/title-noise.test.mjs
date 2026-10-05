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
// the title cleaner lives inside the personal-radar module scope: expose it for the stored-title fixtures below (test-only patch)
const patched = src.replace(IMPORT, "var WorkflowEntrypoint = class {};").replace(/__name\(cleanTitleText, "cleanTitleText"\);/, "$&globalThis.__cleanTitle = cleanTitleText;");
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
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
// real stored titles (qnfo-audit.calendar, plane=personal, source=personal-radar; ids as stored) for the three noisy venues:
// [id, venue, text after the venue label, expected clean title or "" = candidate skipped]
const STORED = [
  [64, "EventbriteLGBTQ", "Amsterdam Dit evenement opslaan: Pride Tour in Amsterdam SIPS & SORCERY Thu, Sep 10, 8:00", "Pride Tour in Amsterdam SIPS & SORCERY"],
  [65, "Stedelijk", "Page 3 Page 4 Page 5 Page 6 Page 7 Next page Upcoming exhibitions Yayoi Kusama Sep 11,", "Yayoi Kusama"],
  [66, "EventbriteLGBTQ", "opslaan: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour Fri, Sep 11, 5:00", "Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour"],
  [67, "Stedelijk", "Stedelijk Kids Festival Yayoi Kusama Events Every Saturday and Sunday from Sep 12", "Kids Festival Yayoi Kusama Events"],
  [69, "EventbriteLGBTQ", "& SORCERY Dit evenement opslaan: SIPS & SORCERY Opening Zanele Muholi Sat, Sep 12, 3:00", "SIPS & SORCERY Opening Zanele Muholi"],
  [71, "EventbriteLGBTQ", "opslaan: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB Sun, Sep 13, 1:30 PM", "Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB"],
  [73, "EventbriteLGBTQ", "nature connection for LGBTQ+ Out in Tech Amsterdam | Third Thursdays Thu, Sep 17, 6:00 PM", ""],
  [75, "EventbriteLGBTQ", "& Podcast Launch Funny Women Amsterdam Presents: Comedy & Games Night! Sat, Sep 19, 8:00", ""],
  [76, "EventbriteLGBTQ", "opslaan: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026 Thu, Sep 24, 6:00 PM", "Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026"],
  [78, "EventbriteLGBTQ", "Indeling Prijs Taal Valuta Touch grass: nature connection for LGBTQ+ Sun, Oct 4, 1:00 PM", "Touch grass: nature connection for LGBTQ+"],
  [79, "EventbriteLGBTQ", "Amsterdam | Sing Your Queer Heart Out! Casual Queer Networking- Potluck Thu, Oct 8, 2:00", "Sing Your Queer Heart Out! Casual Queer Networking- Potluck"],
  [80, "EventbriteLGBTQ", "History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam) Fri, Oct 9, 11:00 PM", "History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam)"],
  [82, "Stedelijk", "Sep 11, 2026 till Jan 17, 2027 Adam Pendleton Some Wild Kind of Language October 10, 2026", "Adam Pendleton Some Wild Kind of Language"],
  [83, "EventbriteLGBTQ", "Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch Sat, Oct 10, 1:30 PM", "Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch"],
  [92, "EventbriteLGBTQ", "opslaan: Casual Queer Networking- Potluck Pride Almere Diner 2026 Wed, Oct 7, 6:30 PM", "Casual Queer Networking- Potluck Pride Almere Diner 2026"],
  [93, "EventbriteLGBTQ", "opslaan: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop Sat, Sep 26, 2:00 PM", "Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop"],
  [113, "Stedelijk", "2027 Collaborative Artistic Practices - Proposals for the Museum Collection Nov 28, 2026", "2027 Collaborative Artistic Practices - Proposals for the Museum Collection"],
  [114, "Stedelijk", "than 500 works from 1870 until now Ongoing Kho Liang Ie Mid-Century Modernist May 14 till", ""],
  [115, "Stedelijk", "the Museum Collection Nov 28, 2026 till Apr 4, 2027 LUC TUYMANS SILENT MUSIC Mar 6 till", "LUC TUYMANS SILENT MUSIC"],
  [116, "Stedelijk", "SILENT MUSIC Mar 6 till Jul 11, 2027 ABN AMRO ART AWARD 2026 HEND SAMIR Mar 19 till", "SILENT MUSIC"],
  [117, "Stedelijk", "ART AWARD 2026 HEND SAMIR Mar 19 till Jun 20, 2027 Ibrahim Mahama Zilijafa Mar 21 till", "ART AWARD 2026 HEND SAMIR"],
  [118, "Iamsterdam", "Yayoi Kusama", "Yayoi Kusama"],
  [119, "Iamsterdam", "Art and Design Accessibility facilities Tickets Available 12 nov '26 - 22 nov '26 IDFA:", ""],
  [120, "EventbriteLGBTQ", "sale 7 . Speed dating 8 . Drum and bass 9 . After party 10 . Gay party 11 . August 12 .", ""]
];
const clean = globalThis.__cleanTitle;
for (const [id, venue, raw, want] of STORED) ok(clean(raw, venue) === want, "stored row " + id + " (" + venue + ") cleans to " + JSON.stringify(want) + " (got " + JSON.stringify(clean(raw, venue)) + ")");
ok(clean("Sep 11, 2026 till Jan 17, 2027 Adam Pendleton Some Wild Kind of Language October 10, 2026", "Stedelijk") === "Adam Pendleton Some Wild Kind of Language", "Stedelijk: a leading date range is dropped, the exhibition name kept (#1885)");
ok(STORED.filter(([, v]) => v === "Iamsterdam").every(([, , raw, want]) => want === "" || !/^[a-z&]/.test(want)) && clean("Art and Design Accessibility facilities Tickets Available 12 nov '26 - 22 nov '26 IDFA:", "Iamsterdam") === "", "Iamsterdam: a navigation-list fragment yields no title (candidate skipped)");
ok(clean("sale 7 . Speed dating 8 . Drum and bass 9 . After party 10 . Gay party 11 . August 12 .", "EventbriteLGBTQ") === "", "a numbered navigation list is never a title");
ok(STORED.every(([, v, , want]) => want === "" || (!want.startsWith(v) && !/^(?:EventbriteLGBTQ|Dit evenement|opslaan|Indeling)/i.test(want) && !/^[a-z&]/.test(want))), "no cleaned title starts with venue chrome, a cut word or an ampersand");

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


// live path (#1885): Stedelijk leading date range, Iamsterdam navigation list, Eventbrite chrome
pages["www.stedelijk.nl"] = "<html><body><p>" + M3 + " 11, " + Y + " till " + M3 + " 20, " + (Y + 1) + " Adam Pendleton Some Wild Kind of Language " + M + " 13, " + Y + " exhibition at the museum.</p></body></html>";
pages["www.iamsterdam.com"] = "<html><body><p>sale 7 . Speed dating 8 . Drum and bass 9 . After party 10 . Gay party 11 . " + M + " 14 " + Y + " festival concert music</p></body></html>";
const live = await go();
const st = live.find((p) => p.location === "Stedelijk");
ok(!st || st.title === "Stedelijk: Adam Pendleton Some Wild Kind of Language", "live Stedelijk title drops the leading date range (got " + (st && st.title) + ")");
ok(!live.some((p) => p.location === "Iamsterdam"), "a navigation-list fragment at Iamsterdam is skipped, not posted with a snippet title");
ok(live.filter((p) => p.location === "EventbriteLGBTQ").every((p) => p.title.indexOf("EventbriteLGBTQ", 5) === -1 && !/^EventbriteLGBTQ: *(?:Dit evenement|opslaan|Indeling|Amsterdam *:)/i.test(p.title)), "Eventbrite rows carry only the venue label as prefix");
console.log("live Stedelijk posted: " + (st ? st.title : "none (not cleared by relevance)"));

const h = await (await W.fetch(new Request("https://radar-hub.example/health"), {}, {})).json();
ok(h.version === "1.2.4", "hub /health reports 1.2.4");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
