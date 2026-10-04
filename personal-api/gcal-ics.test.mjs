// personal-api Google Calendar ICS-bridge suite (4.7.0, GOOGLE-ICS-BRIDGE-1, 2026-10-04).
// Loads the real worker.js and drives the MCP tool calendar_today and GET /health against a minimal env with the
// secret GOOGLE_ICS_URL set and a stubbed global fetch that serves a fixed Google iCal feed. Proves: with only the
// iCal URL (no OAuth client) the twin reads the real Google Calendar (all-day + timed events on the day, other days
// excluded); /health reports google_calendar=ics and advertises the ics capability; and a failing iCal fetch does not
// break the calendar read.
// Run: node personal-api/gcal-ics.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Google Inc//Google Calendar//EN",
  "BEGIN:VEVENT",
  "UID:allday-1@google.com",
  "DTSTART;VALUE=DATE:20261008",
  "SUMMARY:Google all-day thing",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:timed-1@google.com",
  "DTSTART:20261008T090000Z",
  "DTEND:20261008T100000Z",
  "SUMMARY:Google timed thing",
  "LOCATION:Cafe",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:otherday-1@google.com",
  "DTSTART:20261009T090000Z",
  "SUMMARY:Other day event",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelled-1@google.com",
  "STATUS:CANCELLED",
  "DTSTART:20261008T120000Z",
  "SUMMARY:Cancelled thing",
  "END:VEVENT",
  "END:VCALENDAR"
].join("\r\n");

const permissiveDb = {
  prepare() { const s = { bind() { return s; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { success: true, meta: { changes: 0 } }; } }; return s; },
  async batch() { return []; }
};

function makeEnv(icsUrl, failing) {
  return {
    API_KEY: "k",
    GOOGLE_ICS_URL: icsUrl,
    PERSONAL: permissiveDb,
    AI: {},
    VZ: {},
    CAL_API: { async fetch() { return new Response(JSON.stringify({ ok: true, plane: "personal", count: 0, events: [] }), { status: 200 }); } }
  };
}
const ctx = { waitUntil() {} };

globalThis.fetch = async (u) => {
  const s = String(u && u.url || u);
  if (s.indexOf("g.test") >= 0) {
    if (makeEnv._fail) throw new Error("network down");
    return new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  }
  return new Response("{}", { status: 200 });
};

async function mcp(env, name, args) {
  const res = await W.fetch(new Request("https://p.example/mcp", { method: "POST", headers: { authorization: "Bearer k", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env, ctx);
  return (await res.json()).result.structuredContent;
}

// 1) reads the Google iCal feed with no OAuth client
makeEnv._fail = false;
let out = await mcp(makeEnv("https://g.test/cal.ics"), "calendar_today", { date: "2026-10-08" });
ok(out.google === "ics", "google field is ics (not connected): " + out.google);
const titles = (out.events || []).map((e) => e.title);
ok(titles.includes("Google all-day thing"), "all-day Google event is read: " + JSON.stringify(titles));
ok(titles.includes("Google timed thing"), "timed Google event is read: " + JSON.stringify(titles));
ok(!titles.includes("Other day event"), "event on another day is excluded");
ok(!titles.includes("Cancelled thing"), "cancelled event is excluded");
ok((out.events || []).every((e) => e.calendar === "google"), "Google events carry calendar=google");
ok((out.events || []).find((e) => e.title === "Google timed thing").location === "Cafe", "LOCATION is parsed");

// 2) /health reports the ics state and capability
const h = await (await W.fetch(new Request("https://p.example/health"), makeEnv("https://g.test/cal.ics"), ctx)).json();
ok(h.google_calendar === "ics", "/health google_calendar=ics: " + h.google_calendar);
ok((h.capabilities || []).includes("google-calendar-ics"), "/health advertises google-calendar-ics");

// 3) no iCal url -> not read, state no-client
const h2 = await (await W.fetch(new Request("https://p.example/health"), makeEnv(undefined), ctx)).json();
ok(h2.google_calendar === "no-client", "no iCal url -> no-client: " + h2.google_calendar);

// 4) a failing iCal fetch does not break the calendar read
makeEnv._fail = true;
let out2 = await mcp(makeEnv("https://g.test/cal.ics"), "calendar_today", { date: "2026-10-08" });
ok(out2.ok === true, "failing iCal fetch still returns a calendar result (store path): " + JSON.stringify(out2.ok));
ok(out2.google_error && /network down|google-ics/.test(out2.google_error), "failing iCal fetch surfaces a google error (does not throw): " + out2.google_error);
makeEnv._fail = false;

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
