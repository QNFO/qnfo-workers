// ITIN-AUDIT-1 offline fixtures (#1881): skewed Date, meta line, whole-booking cancel, parse-miss dedupe, forwarded gate. Fakes only; nothing fabricates production mail.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") + "\nreturn {itinParse,itineraryIngest,itinSentIso,itinGate,itinStripMeta,VERSION};")();
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
const ing = (F, id, subject, body, sentAt, from, ar) => api.itineraryIngest(F.env, { emailId: id, from: from || "Booking.com <noreply@booking.com>", subject, bodyText: body, bodyHtml: "", authResults: ar || AR(((from || "x@booking.com").match(/@([a-z.]+)/) || [])[1]), sentAt });
const HOURS = (h) => new Date(Date.now() - h * 3600e3).toUTCString();
const HOTEL2 = HOTEL;
// (1) a backwards-skewed Date on a genuinely newer mail (received later, Date 3h earlier than the stored one) is not stale
const F = fake();
await ing(F, 1, "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), HOURS(2));
const id = [...F.events.keys()][0];
const r2 = await ing(F, 2, "Booking confirmation - Hotel Perfect (modified)", HOTEL("Wed, 14 Oct 2026", "Sat, 17 Oct 2026"), HOURS(5));
eq("skewed-back newer mail rebooks", [r2.rebooked, r2.stale || 0, F.events.get(id).start_date], [1, 0, "2026-10-14"]);
// a Date older by more than 24h on a later delivery is still stale
const r3 = await ing(F, 3, "Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), HOURS(24 * 4));
eq("days-old Date stays stale", [r3.stale, F.events.get(id).start_date], [1, "2026-10-14"]);
// (2) marker is the LAST line behind a clear prefix and strips cleanly
const n = F.events.get(id).notes;
ok("marker on last line with prefix", /\nQNFO-META: .*\[dt:[^\]]+\]\s*$/.test(n) && n.split("\n").length >= 2);
ok("stripMeta removes it", !/lc:|QNFO-META/.test(api.itinStripMeta(n)) && api.itinStripMeta(n) === n.split("\nQNFO-META")[0]);
eq("stripMeta strips legacy inline marker", api.itinStripMeta("Hotel Perfect [lc:2026-09-05T10:00:00.000Z]"), "Hotel Perfect");
// (3) whole-booking cancellation of a multi-leg ref in one trip window
const trip = () => fake([
  ["evt-a", { id: "evt-a", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-10-06", end_date: "2026-10-09" }],
  ["evt-b", { id: "evt-b", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-10-09", end_date: "2026-10-12" }]]);
const W = trip();
const w1 = await ing(W, 20, "Your booking has been cancelled", "Confirmation number: 7700123456\nYour entire reservation has been cancelled.");
eq("whole booking, one window: all cancelled", [w1.cancelled, w1.ambiguous, W.events.get("evt-a").title, W.events.get("evt-b").title, W.issues.size], [2, 0, "CANCELLED Hotel Perfect", "CANCELLED Hotel Perfect", 0]);
const W2 = trip();
const w2 = await ing(W2, 21, "Your booking has been cancelled", "Confirmation number: 7700123456\nPart of your booking has been cancelled.");
eq("partial wording stays ambiguous", [w2.cancelled, w2.ambiguous], [0, 1]);
const W3 = trip();
const w3 = await ing(W3, 22, "Update on your stay", "Confirmation number: 7700123456\nSomething happened.");
eq("no cancel wording: nothing", [w3.cancelled || 0, W3.issues.size], [0, 0]);
const W4 = fake([
  ["evt-a", { id: "evt-a", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-10-06", end_date: "2026-10-09" }],
  ["evt-b", { id: "evt-b", category: "lodging", title: "Hotel Perfect", booking_ref: "7700123456", start_date: "2026-12-01", end_date: "2026-12-04" }]]);
const w4 = await ing(W4, 23, "Your booking has been cancelled", "Confirmation number: 7700123456\nYour entire reservation has been cancelled.");
eq("two trips under one ref stay ambiguous", [w4.cancelled, w4.ambiguous], [0, 1]);
const W5 = trip();
const w5 = await ing(W5, 24, "Votre r\u00e9servation est annul\u00e9e", "Num\u00e9ro de confirmation: 7700123456\nVotre r\u00e9servation a \u00e9t\u00e9 annul\u00e9e.");
eq("french whole-booking cancel", [w5.cancelled], [2]);
// (4) unrecognised layout: one issue per distinct sender+subject, never throws
const P = fake();
const p1 = await ing(P, 30, "Booking confirmation 8812345", "Nothing parseable here.");
const p2 = await ing(P, 31, "Booking confirmation 9923456", "Different mail, same layout.");
eq("same sender+subject shape: one issue", [p1.parsed, p2.parsed, P.issues.size], [0, 0, 1]);
await ing(P, 32, "Your e-ticket is ready", "Nothing parseable here.");
eq("different subject: second issue", P.issues.size, 2);
const p4 = await api.itineraryIngest(P.env, { emailId: undefined, from: "Booking.com <noreply@booking.com>", subject: undefined, bodyText: null, bodyHtml: null, authResults: AR("booking.com"), sentAt: null });
ok("null fields never throw", p4 && !p4.error);
const bad = { PERSONAL: { prepare() { throw new Error("db down") } }, AUDIT_DB: { prepare() { throw new Error("db down") } }, OPS_KEY: "k" };
const p5 = await api.itineraryIngest(bad, { emailId: 1, from: "Booking.com <noreply@booking.com>", subject: "Booking confirmation", bodyText: "x", bodyHtml: "", authResults: AR("booking.com"), sentAt: "" });
ok("db failure never throws", !!p5);
// (5) forwarded mail from the owner's own address passes even when the original sender's DKIM failed
const ARF = "mx.cloudflare.net; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com; spf=pass";
eq("owner gmail forward passes", api.itinGate({}, "Rowan <rwnquni@gmail.com>", ARF), "owner-forward");
eq("owner forward, inner dkim failure in the chain", api.itinGate({}, "rwnquni@gmail.com", "mx.cloudflare.net; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com, mx.google.com; dkim=fail header.d=booking.com; dmarc=fail header.from=booking.com"), "owner-forward");
eq("outlook owner forward with dmarc comment", api.itinGate({}, "rwnquni@outlook.com", "mx.cloudflare.net; dkim=pass header.d=outlook.com; dmarc=pass (p=none dis=none) header.from=outlook.com"), "owner-forward");
eq("spoofed owner From still refused", api.itinGate({}, "rwnquni@gmail.com", "mx.cloudflare.net; dmarc=fail header.from=gmail.com"), "");
eq("auth results not from cloudflare refused", api.itinGate({}, "rwnquni@gmail.com", "evil.example; dmarc=pass header.from=gmail.com"), "");
const FWD = fake();
const fw = await ing(FWD, 40, "Fwd: Booking confirmation - Hotel Perfect", HOTEL("Tue, 6 Oct 2026", "Fri, 9 Oct 2026"), HOURS(1), "Rowan <rwnquni@gmail.com>", ARF);
eq("forwarded booking is ingested", [fw.parsed, fw.written], [1, 1]);
console.log(JSON.stringify({ version: api.VERSION, failures: fail }));
if (fail.length) process.exit(1);
