// REBOOK-CANCEL-1 offline fixtures (#1881 gap D): changed-date rebooking updates in place, cancellations mark never delete.
// ADVERSARIAL: fakes only; real airline/hotel cancellation wording differs. An unrecognised cancellation is simply not applied
// (the row stays confirmed), which is the safe direction. Nothing here fabricates production mail.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {itinParse,itinWrite,itineraryIngest,itinCancelIntent,VERSION};")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };
const ok = (l, c) => { if (!c) fail.push(l); };
const AR = (d) => "mx.cloudflare.net; dkim=pass header.d=" + d + "; dmarc=pass header.from=" + d + "; spf=pass";

const HOTEL = (cin, cout) => `Your booking at Hotel Perfect is confirmed.\nConfirmation number: 6609627146\nCheck-in: ${cin} (from 15:00)\nCheck-out: ${cout} (until 12:00)\nAddress: ul. Floriańska 1, 31-019 Kraków, Poland`;
const FLIGHT = (d1, d2) => `Booking code: XK4P9Z\nOutbound\nKL 1363  AMS - WAW\n${d1}\nDeparture 09:05   Arrival 10:50\n\nReturn\nKL 1364  WAW - AMS\n${d2}\nDeparture 11:20   Arrival 13:05`;

function fake(seedEvents, seedCal) {
  const events = new Map(seedEvents || []), cal = new Map(seedCal || []);
  const mk = () => ({ prepare: (q) => { let a = []; const st = { bind: (...x) => { a = x; return st },
    first: async () => null,
    all: async () => {
      if (/FROM events WHERE booking_ref = \?1 AND category/.test(q)) return { results: [...events.values()].filter((r) => r.booking_ref === a[0] && r.category === a[1]).map((r) => ({ id: r.id, title: r.title, start_date: r.start_date })) };
      if (/FROM events WHERE booking_ref IN/.test(q)) return { results: [...events.values()].filter((r) => a.includes(r.booking_ref) && ["lodging", "travel"].includes(r.category)).map((r) => ({ id: r.id, title: r.title, booking_ref: r.booking_ref })) };
      return { results: [] } },
    run: async () => {
      if (/^INSERT INTO events/.test(q)) events.set(a[0], { id: a[0], category: a[1], title: a[2], city: a[4], start_date: a[6], end_date: a[7], booking_ref: a[8], notes: a[11] });
      else if (/^UPDATE events SET title=\?2/.test(q)) { const r = events.get(a[0]); Object.assign(r, { title: a[1], city: a[3], start_date: a[5], end_date: a[6], notes: a[9] }) }
      else if (/^UPDATE events SET title = 'CANCELLED '/.test(q)) { const r = events.get(a[0]); if (!/^CANCELLED /.test(r.title)) r.title = "CANCELLED " + r.title }
      else if (/^INSERT INTO calendar/.test(q)) { const prev = cal.get(a[0]); cal.set(a[0], { uid: a[0], title: a[1], description: a[2], location: a[3], dtstart: a[4], dtend: a[5], all_day: a[6], status: "confirmed" }) }
      else if (/^UPDATE calendar SET status = 'cancelled'/.test(q)) { const c = cal.get(a[0]); if (c) { c.status = "cancelled"; if (!/^CANCELLED /.test(c.title)) c.title = "CANCELLED " + c.title } }
      return { meta: { changes: 1 } } } }; return st } });
  return { events, cal, env: { PERSONAL: mk(), AUDIT_DB: mk(), OPS_KEY: "k-test" } };
}
const ing = (F, id, from, subject, body, dom) => api.itineraryIngest(F.env, { emailId: id, from, subject, bodyText: body, bodyHtml: "", authResults: AR(dom) });

// 1 hotel rebooked to new dates: updated in place, one row, one mirror row, same uid
const F = fake();
await ing(F, 1, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), "booking.com");
const id0 = [...F.events.keys()][0], uid0 = "trip-" + id0 + "@qnfo.cloud";
const r = await ing(F, 2, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect (modified)", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), "booking.com");
eq("rebook counts", [r.parsed, r.rebooked, F.events.size, F.cal.size], [1, 1, 1, 1]);
eq("same id, new dates", [[...F.events.keys()][0], F.events.get(id0).start_date, F.events.get(id0).end_date], [id0, "2026-10-14", "2026-10-17"]);
eq("mirror new dates same uid", [F.cal.get(uid0).dtstart, F.cal.get(uid0).dtend, F.cal.get(uid0).status], ["2026-10-14", "2026-10-17", "confirmed"]);
// resend of the new mail is idempotent (no second row)
const r2 = await ing(F, 3, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect (modified)", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), "booking.com");
eq("resend after rebook idempotent", [F.events.size, F.cal.size, r2.rebooked], [1, 1, 0]);
// resend of the OLD mail after the rebook must not undo or double? it is another date for the same code: treated as rebook back (documented limit)
// 2 hand-entered row rebooked
const H = fake([["evt-trip-pl-2026-hotel-krakow", { id: "evt-trip-pl-2026-hotel-krakow", category: "lodging", title: "Hotel Perfect", booking_ref: "6609627146", start_date: "2026-10-06", end_date: "2026-10-09" }]]);
const rh = await ing(H, 4, "x@booking.com", "Booking confirmation", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), "booking.com");
eq("hand row updated, no 2nd row", [H.events.size, rh.rebooked, H.events.get("evt-trip-pl-2026-hotel-krakow").start_date], [1, 1, "2026-10-14"]);
ok("mirror created for hand row uid", H.cal.has("trip-evt-trip-pl-2026-hotel-krakow@qnfo.cloud"));
// 3 different booking code is a new trip, not a rebook
const D = fake([["evt-trip-x", { id: "evt-trip-x", category: "lodging", title: "Other", booking_ref: "1111111111", start_date: "2026-10-06" }]]);
await ing(D, 5, "x@booking.com", "Booking confirmation", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), "booking.com");
eq("different ref inserts", D.events.size, 2);
// 4 flights: both legs moved, matched by flight number, no duplicates
const FL = fake();
await ing(FL, 6, "no-reply@klm.com", "Your booking confirmation", FLIGHT("Sat 10 Oct 2026", "Wed 14 Oct 2026"), "klm.com");
eq("2 legs", FL.events.size, 2);
const rf = await ing(FL, 7, "no-reply@klm.com", "Your booking confirmation", FLIGHT("Sun 11 Oct 2026", "Thu 15 Oct 2026"), "klm.com");
eq("both legs rebooked in place", [FL.events.size, FL.cal.size, rf.rebooked, [...FL.events.values()].map((e) => e.start_date).sort()], [2, 2, 2, ["2026-10-11", "2026-10-15"]]);
// only the return moves: outbound untouched
const FM = fake();
await ing(FM, 8, "no-reply@klm.com", "Your booking confirmation", FLIGHT("Sat 10 Oct 2026", "Wed 14 Oct 2026"), "klm.com");
const rm = await ing(FM, 9, "no-reply@klm.com", "Your booking confirmation", FLIGHT("Sat 10 Oct 2026", "Fri 16 Oct 2026"), "klm.com");
eq("only return moved", [FM.events.size, rm.rebooked, [...FM.events.values()].map((e) => e.start_date).sort()], [2, 1, ["2026-10-10", "2026-10-16"]]);
// 5 cancellation
ok("intent subject", api.itinCancelIntent("Your booking has been cancelled", "", 1));
ok("intent nl", api.itinCancelIntent("Uw boeking is geannuleerd", "", 0));
ok("intent fr", api.itinCancelIntent("Réservation annulée", "", 0));
ok("intent de", api.itinCancelIntent("Ihre Buchung wurde storniert", "", 0));
ok("no intent for free-cancellation promo", !api.itinCancelIntent("Booking confirmation", "Free cancellation until 5 Oct", 1));
ok("body strong phrase only when nothing parsed", api.itinCancelIntent("Update", "Your booking has been cancelled.", 0) && !api.itinCancelIntent("Update", "Your booking has been cancelled.", 1));
const C = fake();
await ing(C, 10, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), "booking.com");
const cid = [...C.events.keys()][0];
const rc = await ing(C, 11, "Booking.com <noreply@booking.com>", "Your booking has been cancelled", "Hello,\nConfirmation number: 6609627146\nYour stay at Hotel Perfect has been cancelled.", "booking.com");
eq("cancel counts", [rc.cancel, rc.matched, rc.cancelled], [true, 1, 1]);
eq("row kept, prefixed", [C.events.size, C.events.get(cid).title], [1, "CANCELLED Hotel Perfect"]);
eq("calendar cancelled not deleted", [C.cal.size, C.cal.get("trip-" + cid + "@qnfo.cloud").status, C.cal.get("trip-" + cid + "@qnfo.cloud").title], [1, "cancelled", "CANCELLED Hotel Perfect"]);
const rc2 = await ing(C, 12, "Booking.com <noreply@booking.com>", "Your booking has been cancelled", "Confirmation number: 6609627146 cancelled", "booking.com");
eq("cancel idempotent", [rc2.cancelled, C.events.get(cid).title], [0, "CANCELLED Hotel Perfect"]);
// a re-delivered original confirmation does not resurrect it or add a row
const rz = await ing(C, 13, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), "booking.com");
eq("no resurrect", [C.events.size, C.events.get(cid).title, C.cal.get("trip-" + cid + "@qnfo.cloud").status, rz.duplicate], [1, "CANCELLED Hotel Perfect", "cancelled", 1]);
// unknown ref changes nothing
const U = fake();
await ing(U, 14, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), "booking.com");
const ru = await ing(U, 15, "noreply@booking.com", "Your booking has been cancelled", "Confirmation number: ZZ99999999", "booking.com");
eq("unknown ref no change", [ru.matched, ru.cancelled, [...U.events.values()][0].title], [0, 0, "Hotel Perfect"]);
// spoofed cancellation (dmarc fail) is ignored
const S = fake();
await ing(S, 16, "Booking.com <noreply@booking.com>", "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), "booking.com");
const rs = await api.itineraryIngest(S.env, { emailId: 17, from: "x@booking.com", subject: "Your booking has been cancelled", bodyText: "Confirmation number: 6609627146", bodyHtml: "", authResults: "mx.cloudflare.net; dmarc=fail header.from=booking.com" });
eq("spoofed cancel ignored", [rs.skipped, [...S.events.values()][0].title], ["not-gated", "Hotel Perfect"]);
// privacy: mirror never carries ref or phone after rebook
for (const c of [...F.cal.values(), ...FL.cal.values()]) ok("no ref/phone in mirror", !/6609627146|XK4P9Z|\+\d{6,}/.test([c.uid, c.title, c.description, c.location].join("|")));
console.log(JSON.stringify({ version: api.VERSION, failures: fail }));
if (fail.length) process.exit(1);
