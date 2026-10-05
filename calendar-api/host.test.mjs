// calendar-api host plane suite (0.7.0, CAL-HOST-PLANE-1, charter pillar: personal).
// Proves: /health lists plane host; the host feed is tokenised and published like the other planes; it carries all-day
// "Open for guests" events and nothing else (no address, names, contact details, description or url) even when a row
// holds them; writes need the bearer; DELETE removes the day from the feed; other planes are unchanged.
// Run: node --no-warnings calendar-api/host.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const W = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const db = new DatabaseSync(":memory:");
const stmtOn = (sql) => {
  let args = [];
  const s = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  };
  return s;
};
const store = new Map();
const env = { CAL_DB: { prepare: stmtOn, async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } }, ICS_R2: { async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } }, CAL_TOKEN: "bearer-xyz" };
const A = { Authorization: "Bearer bearer-xyz", "content-type": "application/json" };
const call = (method, path, opts) => W.fetch(new Request("https://calendar-api.q08.workers.dev" + path, Object.assign({ method }, opts || {})), env);

const h = await (await call("GET", "/health", { headers: A })).json();
ok(h.planes.join() === "qnfo,personal,host", "health lists planes qnfo, personal, host: " + h.planes);
ok(h.capabilities.includes("host-plane") && /^0\.7\.\d/.test(h.version), "health version and capability");

// writes need the bearer
const noAuth = await call("POST", "/events?plane=host", { headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x", dtstart: "2099-01-01" }) });
ok(noAuth.status === 401, "POST without bearer refused");
const badTok = await call("POST", "/events?plane=host", { headers: { Authorization: "Bearer nope", "content-type": "application/json" }, body: JSON.stringify({ dtstart: "2099-01-01" }) });
ok(badTok.status === 401, "POST with a wrong bearer refused");
ok((await call("GET", "/events.ics?plane=host")).status === 401, "direct host feed without bearer refused (the public route is the tokenised URL)");
ok((await call("GET", "/events?plane=host")).status === 401, "listing host rows needs the bearer");
ok((await call("GET", "/events?plane=nope", { headers: A })).status === 400, "unknown plane refused");

// a write with every kind of personal detail stores and publishes dates only
const body = { title: "Rowan and Partner flat", description: "Call +31 6 12345678 or guest@example.com", location: "Prinsengracht 123, Amsterdam", url: "https://example.com/private", dtstart: "2099-03-10T14:00:00+01:00", dtend: "2099-03-12", domain: "secret-domain", source: "personal-radar" };
const post = await call("POST", "/events?plane=host", { method: "POST", headers: A, body: JSON.stringify(body) });
const pj = await post.json();
ok(post.status === 201 && pj.plane === "host", "authenticated POST creates a host event");
const row = db.prepare("SELECT * FROM calendar WHERE id=?").get(pj.id);
ok(row.plane === "host" && row.title === "Open for guests" && row.all_day === 1 && row.location === null && row.description === null && row.url === null && row.domain === null && row.dtstart === "2099-03-10" && row.dtend === "2099-03-12" && row.source === "host", "stored row holds dates only: " + JSON.stringify(row));
const badDate = await call("POST", "/events?plane=host", { method: "POST", headers: A, body: JSON.stringify({ dtstart: "next tuesday" }) });
ok(badDate.status === 400, "non-date dtstart refused");
const feb30 = await call("POST", "/events?plane=host", { method: "POST", headers: A, body: JSON.stringify({ dtstart: "2099-02-30" }) });
ok(feb30.status === 400, "impossible date refused");

// a legacy or directly edited row with personal detail is scrubbed at read time
db.prepare("INSERT INTO calendar (plane, uid, title, description, location, dtstart, dtend, all_day, url, source, status) VALUES ('host','legacy@x','Marie stays here','phone 0612345678','Keizersgracht 1','2099-05-05T10:00:00+02:00','2099-05-05',0,'https://private.example','manual','confirmed')").run();
db.prepare("INSERT INTO calendar (plane, uid, title, dtstart, status) VALUES ('host','junk@x','x','not a date','confirmed')").run();
db.prepare("INSERT INTO calendar (plane, uid, title, dtstart, status) VALUES ('host','gone@x','x','2099-06-06','cancelled')").run();
db.prepare("INSERT INTO calendar (plane, uid, title, location, dtstart, source, status) VALUES ('personal','p@x','Dentist Prinsengracht','Prinsengracht 9','2099-03-10','manual','confirmed')").run();

const one = await (await call("POST", "/events?plane=host", { method: "POST", headers: A, body: JSON.stringify({ dtstart: "2099-04-01" }) })).json();
ok(db.prepare("SELECT dtend FROM calendar WHERE id=?").get(one.id).dtend === "2099-04-02", "missing dtend becomes the next day (iCal DTEND is exclusive)");

const tok = db.prepare("SELECT v FROM calendar_meta WHERE k='ics_token_host'").get().v;
const key = "calendar/host-" + tok + ".ics";
ok(store.has(key) && tok.length === 24, "feed is published at calendar/host-<token>.ics");
const published = store.get(key);
const direct = await (await call("GET", "/events.ics?plane=host&from=2099-01-01", { headers: A })).text();
for (const ics of [published, direct]) {
  ok(ics.includes("X-WR-CALNAME:Open House Availability"), "host calendar name");
  ok((ics.match(/BEGIN:VEVENT/g) || []).length === 3, "three dated events (the junk-date and cancelled rows are left out): " + (ics.match(/BEGIN:VEVENT/g) || []).length);
  ok((ics.match(/SUMMARY:Open for guests/g) || []).length === 3, "every event is titled Open for guests");
  ok(ics.includes("DTSTART;VALUE=DATE:20990310") && ics.includes("DTEND;VALUE=DATE:20990312") && ics.includes("DTSTART;VALUE=DATE:20990505") && ics.includes("DTEND;VALUE=DATE:20990506"), "all-day dates with exclusive end");
  ok(!/LOCATION|DESCRIPTION|URL:|ATTENDEE|ORGANIZER|CONTACT/.test(ics), "no location, description, url or contact property");
  for (const leak of ["Rowan", "Partner", "flat", "Prinsengracht", "Keizersgracht", "example.com", "31 6", "0612345678", "Marie", "secret", "private", "Dentist", "/e/"]) ok(!ics.includes(leak), "feed does not contain " + leak);
}
// the personal and qnfo feeds are untouched
const pers = await (await call("GET", "/events.ics?plane=personal&from=2099-01-01", { headers: A })).text();
ok(pers.includes("SUMMARY:Dentist Prinsengracht") && pers.includes("LOCATION:Prinsengracht 9") && !pers.includes("Open for guests"), "personal feed unchanged and free of host rows");
const qn = await (await call("GET", "/events.ics?plane=qnfo&from=2099-01-01")).text();
ok(qn.includes("BEGIN:VCALENDAR") && !qn.includes("Open for guests"), "qnfo feed public and free of host rows");

// DELETE removes it from the feed
const del = await call("DELETE", "/events/" + pj.id, { method: "DELETE", headers: A });
ok(del.status === 200, "authenticated DELETE");
ok(!store.get(key).includes("DTSTART;VALUE=DATE:20990310") && store.get(key).includes("20990401"), "deleted day is gone from the published feed, others remain");
ok((await call("DELETE", "/events/" + one.id, { method: "DELETE" })).status === 401, "DELETE without bearer refused");

// feed rotation still works for the new plane
db.prepare("UPDATE calendar_meta SET k='ics_token_host_prev' WHERE k='ics_token_host'").run();
await call("GET", "/events?plane=host", { headers: A });
await call("PUT", "/events/" + one.id, { method: "PUT", headers: A, body: JSON.stringify({ title: "Dr Smith lives here", location: "Secret street 1" }) });
const tok2 = db.prepare("SELECT v FROM calendar_meta WHERE k='ics_token_host'").get().v;
ok(tok2 !== tok && !store.has(key) && store.has("calendar/host-" + tok2 + ".ics"), "rotating the host token retires the old URL");
const afterPut = store.get("calendar/host-" + tok2 + ".ics");
ok(!afterPut.includes("Smith") && !afterPut.includes("Secret street"), "a PUT that sets a title or location still cannot leak into the feed");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
