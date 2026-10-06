// ITIN-STALE-CONFIRM-1 + ITIN-CANCEL-AMBIGUOUS-1 offline fixtures (#1881 gap D). Fakes only; nothing fabricates production mail.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") + "\nreturn {itinParse,itineraryIngest,itinSentIso,VERSION};")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };
const ok = (l, c) => { if (!c) fail.push(l); };
const AR = (d) => "mx.cloudflare.net; dkim=pass header.d=" + d + "; dmarc=pass header.from=" + d + "; spf=pass";
const HOTEL = (cin, cout, ref) => `Your booking at Hotel Perfect is confirmed.\nConfirmation number: ${ref || "7700123456"}\nCheck-in: ${cin} (from 15:00)\nCheck-out: ${cout} (until 12:00)\nAddress: ul. Floriańska 1, 31-019 Kraków, Poland`;
function fake(seed) {
  const events = new Map(seed || []), cal = new Map(), issues = new Map();
  const mk = () => ({ prepare: (q) => { let a = []; const st = { bind: (...x) => { a = x; return st },
    all: async () => {
      if (/FROM events WHERE booking_ref = \?1 AND category/.test(q)) return { results: [...events.values()].filter((r) => r.booking_ref === a[0] && r.category === a[1]).map((r) => ({ id: r.id, title: r.title, start_date: r.start_date, notes: r.notes })) };
      if (/FROM events WHERE booking_ref IN/.test(q)) return { results: [...events.values()].filter((r) => a.includes(r.booking_ref) && ["lodging", "travel"].includes(r.category)).map((r) => ({ id: r.id, title: r.title, booking_ref: r.booking_ref, start_date: r.start_date, end_date: r.end_date })) };
      return { results: [] } },
    run: async () => {
      if (/^INSERT INTO events/.test(q)) events.set(a[0], { id: a[0], category: a[1], title: a[2], city: a[4], start_date: a[6], end_date: a[7], booking_ref: a[8], notes: a[11] });
      else if (/^UPDATE events SET title=\?2/.test(q)) { const r = events.get(a[0]); Object.assign(r, { title: a[1], city: a[3], start_date: a[5], end_date: a[6], notes: a[9] }) }
      else if (/^UPDATE events SET title = 'CANCELLED '/.test(q)) { const r = events.get(a[0]); if (!/^CANCELLED /.test(r.title)) r.title = "CANCELLED " + r.title }
      else if (/^INSERT INTO calendar/.test(q)) cal.set(a[0], { uid: a[0], status: "confirmed", dtstart: a[4] })
      else if (/^UPDATE calendar SET status = 'cancelled'/.test(q)) { const c = cal.get(a[0]); if (c) c.status = "cancelled" }
      else if (/^INSERT OR IGNORE INTO agent_issues/.test(q)) { if (!issues.has(a[0])) issues.set(a[0], { title: a[0], description: a[1], q }) }
      return { meta: { changes: 1 } } } }; return st } });
  return { events, cal, issues, env: { PERSONAL: mk(), AUDIT_DB: mk(), OPS_KEY: "k-test" } };
}
const ing = (F, id, subject, body, sentAt, from) => api.itineraryIngest(F.env, { emailId: id, from: from || "Booking.com <noreply@booking.com>", subject, bodyText: body, bodyHtml: "", authResults: AR(((from || "x@booking.com").match(/@([a-z.]+)/) || [])[1]), sentAt });
const D = (d) => new Date(d).toUTCString();

// (1) stale confirmation after a rebooking is ignored
const F = fake();
await ing(F, 1, "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), D("2026-09-01T10:00:00Z"));
const id = [...F.events.keys()][0];
const r2 = await ing(F, 2, "Booking confirmation - Hotel Perfect (modified)", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), D("2026-09-03T10:00:00Z"));
eq("rebooked by the newer mail", [r2.rebooked, F.events.get(id).start_date], [1, "2026-10-14"]);
const r3 = await ing(F, 3, "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), D("2026-09-01T10:00:00Z"));
eq("stale re-delivery ignored", [r3.rebooked, r3.stale, F.events.size, F.events.get(id).start_date, F.events.get(id).end_date], [0, 1, 1, "2026-10-14", "2026-10-17"]);
const r4 = await ing(F, 4, "Booking confirmation - Hotel Perfect", HOTEL("Mon, 19 Oct 2026", "Thu, 22 Oct 2026"), D("2026-09-05T10:00:00Z"));
eq("a genuinely newer mail still rebooks", [r4.rebooked, F.events.get(id).start_date], [1, "2026-10-19"]);
ok("marker kept in notes, no ref or phone", /\[lc:2026-09-05T10:00:00\.000Z\]/.test(F.events.get(id).notes) && !/7700123456/.test(F.events.get(id).notes));
// stale mail whose dates equal the current row (same-id path) does not refresh it either
const r5 = await ing(F, 5, "Booking confirmation - Hotel Perfect", HOTEL("Mon, 19 Oct 2026", "Thu, 22 Oct 2026"), D("2026-09-02T10:00:00Z"));
eq("older same-date mail is a duplicate", [r5.duplicate, F.events.get(id).notes.includes("2026-09-05")], [1, true]);
// future-dated or missing Date header falls back to the receive time
const now = new Date().toISOString();
eq("future Date clamped", api.itinSentIso("Fri, 01 Jan 2100 00:00:00 GMT", now), now);
eq("missing Date -> now", api.itinSentIso("", now), now);
eq("valid Date kept", api.itinSentIso("Tue, 01 Sep 2026 10:00:00 GMT", now), "2026-09-01T10:00:00.000Z");
// legacy row without a marker still rebooks (no baseline to compare)
const L = fake([["evt-hand", { id: "evt-hand", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-10-06", end_date: "2026-10-09" }]]);
const rl = await ing(L, 6, "Booking confirmation", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), D("2020-01-01T00:00:00Z"));
eq("no baseline -> rebook", [rl.rebooked, L.events.get("evt-hand").start_date], [1, "2026-10-14"]);

// (2) a cancellation quoting a ref shared by two trips
const two = () => fake([
  ["evt-a", { id: "evt-a", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-10-06", end_date: "2026-10-09" }],
  ["evt-b", { id: "evt-b", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-12-01", end_date: "2026-12-04" }]]);
const T = two();
const c1 = await ing(T, 10, "Your booking has been cancelled", "Confirmation number: 7700123456\nYour stay from 6 October 2026 to 9 October 2026 has been cancelled.");
eq("only the named trip is cancelled", [c1.cancelled, c1.ambiguous, T.events.get("evt-a").title, T.events.get("evt-b").title, T.issues.size], [1, 0, "CANCELLED Hotel Perfect", "Hotel Perfect", 0]);
const U = two();
const c2 = await ing(U, 11, "Your booking has been cancelled", "Confirmation number: 7700123456\nYour stay at Hotel Perfect has been cancelled.");
eq("nothing named -> none cancelled", [c2.cancelled, c2.ambiguous, U.events.get("evt-a").title, U.events.get("evt-b").title], [0, 1, "Hotel Perfect", "Hotel Perfect"]);
eq("one medium issue filed", [[...U.issues.keys()], /source|'qnfo-email','personal','medium'/.test([...U.issues.values()][0].q)], [["ITINERARY-CANCEL-AMBIGUOUS-1: 7700123456"], true]);
await ing(U, 12, "Your booking has been cancelled", "Confirmation number: 7700123456\nYour stay at Hotel Perfect has been cancelled.");
eq("repeat mail files no second issue", U.issues.size, 1);
// flights: two legs, one ref; mail names only the return flight number
const FL = fake([
  ["evt-o", { id: "evt-o", category: "travel", title: "Flight AMS to WAW (KLM KL1363)", booking_ref: "XK4P9Z", start_date: "2026-10-10", end_date: "2026-10-10" }],
  ["evt-r", { id: "evt-r", category: "travel", title: "Flight WAW to AMS (KLM KL1364)", booking_ref: "XK4P9Z", start_date: "2026-10-14", end_date: "2026-10-14" }]]);
const c3 = await ing(FL, 13, "Flight cancelled", "Booking code: XK4P9Z\nYour flight KL 1364 has been cancelled.", "", "no-reply@klm.com");
eq("flight number picks the leg", [c3.cancelled, FL.events.get("evt-o").title, FL.events.get("evt-r").title], [1, "Flight AMS to WAW (KLM KL1363)", "CANCELLED Flight WAW to AMS (KLM KL1364)"]);
// a whole-booking mail naming both legs cancels both
const FB = fake([...FL.events.entries()].map(([k, v]) => [k, { ...v, title: v.title.replace(/^CANCELLED /, "") }]));
const c4 = await ing(FB, 14, "Booking cancelled", "Booking code: XK4P9Z\nKL 1363 on 10 Oct 2026 and KL 1364 on 14 Oct 2026 have been cancelled.", "", "no-reply@klm.com");
eq("both named legs cancelled", [c4.cancelled, c4.ambiguous], [2, 0]);
console.log(JSON.stringify({ version: api.VERSION, failures: fail }));
if (fail.length) process.exit(1);
