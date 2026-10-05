// ITINERARY-INGEST-1 / SOURCE-FRESHNESS-1 offline fixtures: KLM-style flight, Booking.com-style hotel, malformed mail,
// duplicate resend, hand-entered duplicate, spoof gate, DST offsets, freshness guard. No network, no production data.
// ADVERSARIAL: this proves the parser and the idempotent write against fakes. It does not prove a real KLM or Booking.com
// mail parses (their layouts differ and change); an unparsed gated confirmation files ITINERARY-PARSE-MISS-1 instead.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {itinParse,itinGate,itinWrite,itineraryIngest,freshnessGuard,itinOffset,VERSION};")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };
const ok = (l, c) => { if (!c) fail.push(l); };

const KLM = `Booking code: XK4P9Z
Passenger: R QUNI

Outbound
KL 1363  AMS - WAW
Sat 10 Oct 2026
Departure 09:05   Arrival 10:50

Return
KL 1364  WAW - AMS
Wed 14 Oct 2026
Departure 11:20   Arrival 13:05
Customer service +31 20 474 77 47`;
const HOTEL = `Your booking at Hotel Perfect is confirmed.
Confirmation number: 6609627146
Check-in: Tue, 6 Oct 2026 (from 15:00)
Check-out: Fri, 9 Oct 2026 (until 12:00)
Address: ul. Floriańska 1, 31-019 Kraków, Poland
Phone: +48 12 345 67 89`;
const AR_OK = (d) => "mx.cloudflare.net; dkim=pass header.d=" + d + "; dmarc=pass header.from=" + d + "; spf=pass";

// 1 flight
const f = api.itinParse("Your booking confirmation", KLM, "", "KLM <no-reply@klm.com>");
eq("flight count", f.length, 2);
eq("flight0 title", f[0].title, "Flight AMS to WAW (KLM KL1363)");
eq("flight0 dates", [f[0].start_date, f[0].end_date, f[0].category, f[0].city, f[0].country], ["2026-10-10", "2026-10-10", "travel", "Amsterdam", "NL"]);
eq("flight0 cal", [f[0].cal.dtstart, f[0].cal.dtend, f[0].cal.all_day], ["2026-10-10T09:05:00+02:00", "2026-10-10T10:50:00+02:00", 0]);
eq("flight1 route", [f[1].title, f[1].start_date, f[1].city, f[1].cal.dtstart], ["Flight WAW to AMS (KLM KL1364)", "2026-10-14", "Warsaw", "2026-10-14T11:20:00+02:00"]);
eq("code", f[0].code, "XK4P9Z");
// 2 hotel
const h = api.itinParse("Booking confirmation - Hotel Perfect", HOTEL, "", "Booking.com <noreply@booking.com>");
eq("hotel count", h.length, 1);
eq("hotel row", [h[0].category, h[0].title, h[0].city, h[0].country, h[0].start_date, h[0].end_date, h[0].code], ["lodging", "Hotel Perfect", "Kraków", "PL", "2026-10-06", "2026-10-09", "6609627146"]);
eq("hotel cal", [h[0].cal.all_day, h[0].cal.dtstart, h[0].cal.dtend], [1, "2026-10-06", "2026-10-09"]);
ok("hotel notes carry times", /from 15:00/.test(h[0].notes) && /by 12:00/.test(h[0].notes) && /3 nights/.test(h[0].notes));
// html only
const hh = api.itinParse("Booking confirmation", "", "<div>" + HOTEL.replace(/\n/g, "<br>") + "</div>", "noreply@booking.com");
eq("html hotel", hh.length && hh[0].city, "Kraków");
// 3 malformed
eq("malformed 1", api.itinParse("Booking confirmation", "Hello\n\nbooking confirmation: pending\nsee you soon", "", "x@booking.com"), []);
eq("malformed 2", api.itinParse("Hi", "Booking code: ABC123\nCheck-in: someday\nCheck-out: later", "", "x@booking.com"), []);
eq("malformed 3 checkout before checkin", api.itinParse("c", HOTEL.replace("9 Oct 2026", "1 Oct 2026"), "", "x@booking.com"), []);
eq("empty", api.itinParse("c", "", "", ""), []);
eq("unknown airports", api.itinParse("c", "Booking code: ABC123\nKL 123 XXX - YYY\n10 Oct 2026 09:00 10:00", "", "x@klm.com"), []);
// DST
eq("offset summer", api.itinOffset("2026-10-24", 1), "+02:00");
eq("offset winter", api.itinOffset("2026-10-26", 1), "+01:00");
eq("offset Mar", [api.itinOffset("2026-03-28", 1), api.itinOffset("2026-03-30", 1)], ["+01:00", "+02:00"]);
// 4 gate
const env0 = {};
eq("gate booking ok", api.itinGate(env0, "Booking.com <noreply@booking.com>", AR_OK("booking.com")), "booking-domain");
eq("gate subdomain", api.itinGate(env0, "x@mail.booking.com", AR_OK("mail.booking.com")), "booking-domain");
eq("gate owner gmail forward", api.itinGate(env0, "rwnquni@gmail.com", AR_OK("gmail.com")), "owner-forward");
eq("gate dmarc fail", api.itinGate(env0, "x@booking.com", "mx.cloudflare.net; dmarc=fail header.from=booking.com"), "");
eq("gate header.from mismatch", api.itinGate(env0, "x@booking.com", "mx.cloudflare.net; dmarc=pass header.from=evil.test"), "");
eq("gate forged second AR", api.itinGate(env0, "x@booking.com", "evil.test; x=1, mx.cloudflare.net; dmarc=pass header.from=booking.com"), "");
eq("gate no header", api.itinGate(env0, "x@booking.com", ""), "");
eq("gate lookalike domain", api.itinGate(env0, "x@notbooking.com", AR_OK("notbooking.com")), "");
eq("gate stranger", api.itinGate(env0, "x@example.org", AR_OK("example.org")), "");

// fake D1
function fakeDbs(seed) {
  const events = new Map(seed || []), cal = new Map(), issues = [], log = [];
  const mk = (kind) => ({ prepare: (q) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
    first: async () => {
      if (/FROM events WHERE booking_ref/.test(q)) { for (const [id, r] of events) if (r.booking_ref === a[0] && r.start_date === a[1] && r.category === a[2] && !id.startsWith("evt-itin-")) return { id }; return null }
      if (/max\(datetime\(received_at\)\) AS last_seen FROM emails/.test(q)) return { last_seen: kind === "audit" ? new Date(Date.now() - 1 * 864e5).toISOString().slice(0, 19).replace("T", " ") : null };
      if (/FROM events/.test(q) && /max\(datetime\(ingested_at\)/.test(q)) return { last_seen: "2026-09-01 00:00:00" };
      return null },
    all: async () => /FROM events WHERE booking_ref/.test(q) ? { results: [...events.values()].filter((r) => r.booking_ref === a[0] && r.category === a[1]).map((r) => ({ id: r.id, title: r.title, start_date: r.start_date })) } : ({ results: /GROUP BY store/.test(q) ? [{ store: "gmail", last_seen: "2026-08-18 10:12:43" }, { store: "fresh", last_seen: new Date().toISOString().slice(0, 19).replace("T", " ") }] : [] }),
    run: async () => {
      log.push(q.slice(0, 30));
      if (/^INSERT INTO events/.test(q)) events.set(a[0], { id: a[0], category: a[1], title: a[2], city: a[4], country: a[5], start_date: a[6], end_date: a[7], booking_ref: a[8], source: a[9], notes: a[11] });
      if (/^INSERT INTO calendar/.test(q)) cal.set(a[0], { uid: a[0], title: a[1], description: a[2], location: a[3], dtstart: a[4], dtend: a[5], all_day: a[6] });
      if (/INTO agent_issues/.test(q)) { if (issues.some((i) => i[0] === a[0])) return { meta: { changes: 0 } }; issues.push(a); return { meta: { changes: 1 } } }
      return { meta: { changes: 1 } } } }; return st } });
  return { events, cal, issues, env: { PERSONAL: mk("personal"), AUDIT_DB: mk("audit"), OPS_KEY: "k-test" } };
}
// 5 write + duplicate resend
const W = fakeDbs();
const meta = { gate: "booking-domain", subject: "Booking confirmation" };
const r1 = await api.itinWrite(W.env, f.concat(h), meta);
eq("first write", [r1.written, r1.duplicate, W.events.size, W.cal.size], [3, 0, 3, 3]);
const r2 = await api.itinWrite(W.env, f.concat(h), meta);
eq("resend idempotent", [r2.written, W.events.size, W.cal.size], [3, 3, 3]);
eq("same ids", r1.ids, r2.ids);
for (const [id, e] of W.events) { ok("id shape " + id, /^evt-itin-[0-9a-f]{12}$/.test(id)); ok("booking_ref kept " + id, !!e.booking_ref) }
for (const [uid, c] of W.cal) {
  ok("uid shape " + uid, /^trip-evt-itin-[0-9a-f]{12}@qnfo\.cloud$/.test(uid));
  const blob = [uid, c.title, c.description, c.location].join(" | ");
  ok("no code in feed row " + uid, !/XK4P9Z|6609627146/i.test(blob));
  ok("no phone in feed row " + uid, !/\+\d|\d{7,}/.test(blob));
}
for (const e of W.events.values()) ok("no phone in events notes", !/\+\d|\d{7,}/.test(e.notes));
// different code same day => different id
const W2 = fakeDbs();
await api.itinWrite(W2.env, api.itinParse("c", KLM.replace("XK4P9Z", "ZZ9999"), "", "x@klm.com"), meta);
await api.itinWrite(W2.env, f, meta);
eq("distinct codes distinct ids", W2.events.size, 4);
// hand-entered duplicate is not doubled
const W3 = fakeDbs([["evt-trip-pl-2026-hotel-krakow", { id: "evt-trip-pl-2026-hotel-krakow", category: "lodging", booking_ref: "6609627146", start_date: "2026-10-06" }]]);
const r3 = await api.itinWrite(W3.env, h, meta);
eq("hand row wins", [r3.written, r3.duplicate, W3.events.size, W3.cal.size], [0, 1, 1, 0]);
// missing binding / key fail closed
eq("no PERSONAL", (await api.itinWrite({ OPS_KEY: "k", AUDIT_DB: W.env.AUDIT_DB }, h, meta)).error, "PERSONAL binding missing");
eq("no key", (await api.itinWrite({ PERSONAL: W.env.PERSONAL, AUDIT_DB: W.env.AUDIT_DB }, h, meta)).error, "no HMAC key (OPS_KEY/API_KEY)");
// 6 end to end through the handler path
const W4 = fakeDbs();
const e1 = await api.itineraryIngest(W4.env, { emailId: 1, from: "Booking.com <noreply@booking.com>", subject: "Booking confirmation - Hotel Perfect", bodyText: HOTEL, bodyHtml: "", authResults: AR_OK("booking.com") });
eq("ingest ok", [e1.parsed, e1.written, W4.events.size], [1, 1, 1]);
const e2 = await api.itineraryIngest(W4.env, { emailId: 2, from: "x@booking.com", subject: "Booking confirmation", bodyText: HOTEL, bodyHtml: "", authResults: "mx.cloudflare.net; dmarc=fail header.from=booking.com" });
eq("spoof ignored", [e2.skipped, W4.events.size], ["not-gated", 1]);
const e3 = await api.itineraryIngest(W4.env, { emailId: 3, from: "x@booking.com", subject: "Your booking confirmation", bodyText: "booking confirmation: pending", bodyHtml: "", authResults: AR_OK("booking.com") });
eq("malformed files a miss issue, no rows", [e3.parsed, W4.events.size, W4.issues.length], [0, 1, 1]);
const e4 = await api.itineraryIngest(W4.env, { emailId: 4, from: "x@booking.com", subject: "Great deals this week", bodyText: "hello", bodyHtml: "", authResults: AR_OK("booking.com") });
eq("promo is silent", W4.issues.length, 1);
// 7 freshness
const W5 = fakeDbs();
const fg = await api.freshnessGuard(W5.env);
// gmail is a RETIRED_STORES member (EMAIL-INDEX-WRITER-1): not flagged; the live store qnfo.org is absent in this fake, so it is.
eq("freshness stale sources", fg.stale.map((s) => s.split(":")[0]), ["email_index store qnfo.org", "personal-life.events ingest"]);
eq("freshness retired", fg.retired, ["gmail"]);
eq("freshness filed", [fg.filed, W5.issues.length], [2, 2]);
const fg2 = await api.freshnessGuard(W5.env);
eq("freshness deduped on rerun", [fg2.filed, W5.issues.length], [0, 2]);

console.log(JSON.stringify({ version: api.VERSION, failures: fail }));
if (fail.length) process.exit(1);
