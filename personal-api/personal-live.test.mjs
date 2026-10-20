// personal-api PERSONAL-LIVE-1 suite (4.22.0, charter pillar: personal).
// Proves: the day a going-out question asks about; the date forms venue pages use; excerpts keep only the text around the
// day; liveWhatsOn reads every enabled source in parallel, labels each listed / nothing-for-day / unreachable, caches ten
// minutes and reads fresh on request, and an owner-added source is read; travel_choose records pick and no as the planner
// page does; POST /v1/tools/<name> runs a write tool with the key, refuses without it, and refuses a signed-in cookie
// without X-Companion; GET /v1/live/whatson answers JSON; the chat prompt no longer carries tasks past three days.
// Synthetic rows and stubbed pages only. Run: node personal-api/personal-live.test.mjs -> "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const patched = src + "\nexport { liveExcerpt as __excerpt, liveDayFor as __dayFor, liveWhatsOn as __whatsOn, isWhatsOnQuery as __isWhatsOn, travelChooseT as __choose, travelGetT as __travelGet, liveSourceAddT as __addSrc, liveSourceToggleT as __toggleSrc };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra).slice(0, 600) : "")); } };

const wrap = (d) => ({
  prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)); return s; },
      async all() { return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return s;
  },
  async batch(list) { return Promise.all(list.map((x) => x.run())); }
});

// ---- day and date forms
const NOW = Date.parse("2026-10-20T08:44:00Z"); // Tuesday in Amsterdam
ok(mod.__dayFor("what's on tonight", NOW) === "2026-10-20", "tonight is today");
ok(mod.__dayFor("anything tomorrow?", NOW) === "2026-10-21", "tomorrow");
ok(mod.__dayFor("concerts on friday", NOW) === "2026-10-23", "a weekday name is the next such day");
ok(mod.__dayFor("what about tuesday", NOW) === "2026-10-20", "today's weekday name is today");
ok(mod.__dayFor("gigs 2026-11-02", NOW) === "2026-11-02", "an ISO date wins");
ok(mod.__isWhatsOn("What's on today?") && mod.__isWhatsOn("any jazz tonight") && !mod.__isWhatsOn("how much did I spend on groceries"), "going-out questions are recognised, others not");

const page = "Agenda Menu Login " + "z".repeat(300) + " ma 19 okt Old Show 20:00 di 20 okt Tuesday Jam 22:00 Bimhuis Cafe wo 21 okt Martyn3024 ADE 20:30 " +
  "x".repeat(900) + " 20 October 2026 Masato Suzuki Bach Collegium Japan Brandenburg Concertos 20:15 " + "y".repeat(900) + " Tue 20 Late film 23:00";
const ex = mod.__excerpt(page, "2026-10-20");
ok(ex.includes("Tuesday Jam") && ex.includes("Masato Suzuki") && ex.includes("Late film"), "every mention of the day is kept (di 20 okt, 20 October, Tue 20)", ex);
ok(!ex.includes("Agenda Menu Login") && !ex.includes("x".repeat(400)), "text far from the day is dropped", ex);
ok(mod.__excerpt("Only 21 oktober and 3 november listed", "2026-10-20") === "", "a page without the day gives nothing");
ok(mod.__excerpt("tickets 2026-10-20 at 20:00", "2026-10-20").includes("20:00") && mod.__excerpt("op 20-10 om acht", "2026-10-20").includes("acht"), "ISO and day-month numeric forms");
ok(mod.__excerpt("room 120 oct sale", "2026-10-20") === "", "a number that merely ends in the day is not a date");

// ---- liveWhatsOn
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE events (id TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, category TEXT, start_date TEXT, end_date TEXT, energy TEXT, energy_label TEXT)");
db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, title TEXT, due TEXT, priority TEXT, status TEXT, done_at TEXT)");
const env = { PERSONAL: wrap(db), API_KEY: "k".repeat(32) };
let calls = [];
const pages = {
  "https://www.bimhuis.nl/agenda/": { text: page },
  "https://www.concertgebouw.nl/en/concerts-and-tickets": { text: "Season 20 October 2026 Masato Suzuki Brandenburg 20:15" },
  "https://www.paradiso.nl/en/program": { text: "Program 22 oktober only" },
  "https://www.melkweg.nl/en/agenda": { error: "HTTP 503" }
};
const fetchPage = async (u) => { calls.push(u); if (pages[u]) return pages[u]; return { text: "nothing dated here" }; };
let r = await mod.__whatsOn(env, { day: "2026-10-20", nowMs: NOW, fetchPage });
const by = Object.fromEntries(r.sources.map((s) => [s.id, s]));
ok(r.checked === 11 && calls.length === 11, "all eleven seeded sources are read", { checked: r.checked, calls: calls.length });
ok(by.bimhuis.status === "listed" && by.bimhuis.excerpt.includes("Tuesday Jam") && by.concertgebouw.status === "listed", "venues listing the day are listed with their excerpt", by.bimhuis);
ok(by.paradiso.status === "nothing-for-day" && by.paradiso.excerpt === "", "a venue with nothing that day says so");
ok(by.melkweg.status.startsWith("unreachable") && by.melkweg.status.includes("503"), "a failing page is unreachable with its error", by.melkweg);
ok(r.listed === 2 && r.sources.every((s) => s.url && s.fetched_at), "each source carries its URL and read time");
calls = [];
r = await mod.__whatsOn(env, { day: "2026-10-20", nowMs: NOW + 5 * 60e3, fetchPage });
ok(calls.length === 0 && r.sources.every((s) => s.cached) && r.listed === 2, "within ten minutes the cache answers");
r = await mod.__whatsOn(env, { day: "2026-10-20", nowMs: NOW + 5 * 60e3, fetchPage, fresh: true });
ok(calls.length === 11 && r.sources.every((s) => !s.cached), "fresh reads every page again");
calls = [];
await mod.__whatsOn(env, { day: "2026-10-20", nowMs: NOW + 16 * 60e3, fetchPage });
ok(calls.length === 11, "after ten minutes pages are read again");
const add = await mod.__addSrc(env, { name: "De Kleine Komedie", url: "https://www.dekleinekomedie.nl/agenda" });
ok(add.ok && add.id.startsWith("own-"), "the owner can add a source", add);
ok(!(await mod.__addSrc(env, { name: "x", url: "http://127.0.0.1/" })).ok, "a private or plain-http page is refused");
const off = await mod.__toggleSrc(env, { id: "ra-amsterdam", enabled: false });
ok(off.ok && off.updated === 1, "a source can be switched off");
calls = [];
r = await mod.__whatsOn(env, { day: "2026-10-21", nowMs: NOW, fetchPage });
ok(calls.includes("https://www.dekleinekomedie.nl/agenda") && !calls.includes("https://ra.co/events/nl/amsterdam") && r.sources[0].id === add.id, "owner sources are read first; switched-off ones are not", calls);
ok(r.sources.find((s) => s.id === "bimhuis").excerpt.includes("Martyn3024"), "tomorrow's listing is found on the same page");

// ---- travel planner
db.exec("CREATE TABLE travel_options (id TEXT PRIMARY KEY, trip_key TEXT, rank INTEGER, pick INTEGER, mode TEXT, city TEXT, country TEXT, kind TEXT, checkin TEXT, nights INTEGER, est_per_night REAL, currency TEXT, why TEXT, link TEXT, model TEXT, status TEXT, created_at TEXT, decided_at TEXT)");
db.exec("CREATE TABLE travel_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, option_id TEXT, trip_key TEXT, reaction TEXT, city TEXT, kind TEXT, ts TEXT)");
const io = db.prepare("INSERT INTO travel_options VALUES (?,?,?,0,'road',?,'PT','hotel','2099-01-02',2,80,'EUR','why','https://x',NULL,'proposed','2026-10-20',NULL)");
io.run("o1", "T", 1, "Porto"); io.run("o2", "T", 2, "Lisbon"); io.run("o3", "T", 3, "Braga");
let c = await mod.__choose(env, { id: "o2", action: "pick" });
ok(c.ok && db.prepare("SELECT status FROM travel_options WHERE id='o2'").get().status === "picked", "pick marks the option picked", c);
c = await mod.__choose(env, { id: "o3", action: "no" });
ok(c.ok && db.prepare("SELECT status FROM travel_options WHERE id='o3'").get().status === "rejected", "no rejects it");
ok(db.prepare("SELECT COUNT(*) AS n FROM travel_reactions").get().n === 2, "each answer is a travel_reactions row");
ok(!(await mod.__choose(env, { id: "o3", action: "pick" })).ok, "a rejected option cannot be picked again");
const tg = await mod.__travelGet(env);
ok(tg.ok && tg.proposals.length === 2 && Array.isArray(tg.booked), "travel_get lists open proposals (and tolerates a missing stops table)", tg);

// ---- REST
const ctx = { waitUntil() {} };
const call = (path, init) => W.fetch(new Request("https://me.q08.org" + path, init), env, ctx);
let res = await call("/v1/tools/task_add", { method: "POST", body: JSON.stringify({ title: "Book Bimhuis" }) });
ok(res.status === 401, "no key, no device: refused");
res = await call("/v1/tools/task_add", { method: "POST", headers: { Cookie: "cmp_s=" + "a".repeat(64) }, body: JSON.stringify({ title: "x" }) });
ok(res.status === 401, "a cookie without X-Companion is refused");
res = await call("/v1/tools/nope", { method: "POST", headers: { Authorization: "Bearer " + env.API_KEY }, body: "{}" });
ok(res.status === 404, "an unknown tool is a 404");
res = await call("/v1/tools/travel_choose", { method: "POST", headers: { Authorization: "Bearer " + env.API_KEY }, body: JSON.stringify({ id: "o1", action: "pick" }) });
let j = await res.json();
ok(res.status === 200 && j.ok && j.recorded === "pick", "a write tool runs over REST with the key", j);
res = await call("/v1/tools/travel_choose", { method: "POST", headers: { Authorization: "Bearer " + env.API_KEY }, body: "{bad" });
ok(res.status === 400, "bad JSON is a 400");

// ---- chat context: stale tasks stay out unless asked
db.exec("CREATE TABLE IF NOT EXISTS profile (facet TEXT, label TEXT, statement TEXT, confidence REAL, evidence TEXT); CREATE TABLE IF NOT EXISTS notes (id TEXT, ts TEXT, kind TEXT, content TEXT, source TEXT); CREATE TABLE IF NOT EXISTS activity (date TEXT, title TEXT, category TEXT, venue TEXT, notes TEXT); CREATE TABLE IF NOT EXISTS chat (id TEXT PRIMARY KEY, thread TEXT, ts TEXT, role TEXT, content TEXT, model TEXT, source TEXT, ua TEXT); CREATE TABLE IF NOT EXISTS facts (id TEXT, statement TEXT, ts TEXT); CREATE TABLE IF NOT EXISTS proactive_signals (id TEXT, ts TEXT, kind TEXT, payload TEXT, shown INTEGER)");
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
db.prepare("INSERT INTO tasks (id, ts, kind, title, due, priority, status) VALUES (?,?,?,?,?,?,?)").run("t1", daysAgo(50), "reminder", "Stevie Wonder tickets", daysAgo(40), "normal", "open");
db.prepare("INSERT INTO tasks (id, ts, kind, title, due, priority, status) VALUES (?,?,?,?,?,?,?)").run("t2", daysAgo(3), "task", "Call the plumber", daysAgo(1), "normal", "open");
const seen = [];
env.AI = { run: async (model, input) => { seen.push(input && input.messages ? input.messages.map((m) => m.content).join("\n") : ""); return { response: "Here is your day." }; } };
env.CAL_API = { fetch: async () => new Response(JSON.stringify({ ok: true, events: [] }), { headers: { "content-type": "application/json" } }) };
env.VZ = { query: async () => ({ matches: [] }), upsert: async () => ({}) };
const origFetch = globalThis.fetch;
globalThis.fetch = async (u) => { const s = String(u && u.url || u); if (s.includes("bimhuis")) return new Response("<html><body>di 20 okt Tuesday Jam 22:00</body></html>", { headers: { "content-type": "text/html" } }); return new Response("{}", { status: 404 }); };
const chat = async (q) => { seen.length = 0; const rr = await call("/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + env.API_KEY, "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: q }] }) }); await rr.text(); return seen.join("\n"); };
let sys = await chat("Anything good to do " + today + "?");
ok(sys.length > 0, "the chat reached the model", sys.length);
ok(!sys.includes("Stevie Wonder") && sys.includes("Call the plumber"), "a task 40 days past its date is not in the prompt; one from yesterday is", sys.match(/OVERDUE[\s\S]{0,200}/));
ok(sys.includes("LIVE PROGRAMMES for " + today), "a going-out question carries the live programmes block");
ok(!/QUNIVERSE CONTEXT|qnfo-ai\.q08\.workers\.dev/.test(sys), "no QNFO routing text in the personal prompt");
sys = await chat("which tasks are still open?");
ok(sys.includes("Stevie Wonder") && sys.includes("(id t1)"), "asked about tasks, old ones are listed with the id that closes them");
globalThis.fetch = origFetch;

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
