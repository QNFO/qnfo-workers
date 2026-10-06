// CAL-CANCELLED-ICS-1 (#1881 gap D, charter pillar: personal). A trip cancelled by qnfo-email keeps its calendar row with
// status='cancelled'. The personal feed must emit it as STATUS:CANCELLED (same UID, so Outlook removes the copy it already
// holds); the host feed never carries it; the qnfo feed is unchanged (omits it); a cancelled row carries no booking ref,
// phone, description or feedback link.
// Run: node --no-warnings calendar-api/cancelled-ics.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const W = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const db = new DatabaseSync(":memory:");
const stmtOn = (sql) => { let args = []; const s = {
  bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return s; };
const store = new Map();
const env = { CAL_DB: { prepare: stmtOn, async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } }, ICS_R2: { async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } }, CAL_TOKEN: "bearer-xyz" };
const A = { Authorization: "Bearer bearer-xyz" };
const call = (path) => W.fetch(new Request("https://calendar-api.q08.workers.dev" + path, { headers: A }), env);
await call("/health");
const ins = (plane, uid, title, st, source) => db.prepare("INSERT INTO calendar (plane, uid, title, description, location, dtstart, dtend, all_day, source, status) VALUES (?,?,?,?,?,?,?,1,?,?)").run(plane, uid, title, "ref XK4P9Z phone +31612345678", "Hotel Perfect", "2099-10-06", "2099-10-09", source || "manual", st);
ins("personal", "trip-evt-1@qnfo.cloud", "CANCELLED Hotel Perfect", "cancelled");
ins("personal", "trip-evt-2@qnfo.cloud", "Hotel Live", "confirmed");
ins("host", "host-gone@x", "Open for guests", "cancelled");
ins("qnfo", "q-gone@x", "CANCELLED Seminar", "cancelled");
const pers = await (await call("/events.ics?plane=personal&from=2099-01-01")).text();
const evs = pers.split("BEGIN:VEVENT").slice(1);
const gone = evs.find((e) => e.includes("UID:trip-evt-1@qnfo.cloud")) || "";
const live = evs.find((e) => e.includes("UID:trip-evt-2@qnfo.cloud")) || "";
ok(/STATUS:CANCELLED/.test(gone), "personal feed emits the cancelled trip as STATUS:CANCELLED");
ok(/SUMMARY:CANCELLED Hotel Perfect/.test(gone) && /DTSTART;VALUE=DATE:20991006/.test(gone), "cancelled event keeps uid, summary and dates");
ok(!/STATUS:/.test(live), "a confirmed event carries no STATUS line");
ok(!/XK4P9Z|\+31612345678|DESCRIPTION|\/e\//.test(gone), "cancelled event has no description, ref, phone or feedback link");
const host = await (await call("/events.ics?plane=host&from=2099-01-01")).text();
ok(!/CANCELLED|host-gone/.test(host) && !/BEGIN:VEVENT/.test(host), "host feed omits cancelled rows");
const qn = await (await call("/events.ics?plane=qnfo&from=2099-01-01")).text();
ok(!qn.includes("Seminar"), "qnfo feed still omits cancelled rows");
const tok = db.prepare("SELECT v FROM calendar_meta WHERE k='ics_token_personal'").get();
ok(!tok || !store.has("calendar/personal-" + tok.v + ".ics") || /STATUS:CANCELLED/.test(store.get("calendar/personal-" + tok.v + ".ics")), "published personal feed matches");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
