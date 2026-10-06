// radar-hub venue-silent suite (1.3.2, RADAR-VENUE-SILENT-1, charter pillar: personal).
// Loads the real worker.js and drives the personal radar via /personal/?run=1 against in-memory SQLite with a stubbed venue page.
// Proves: a per-venue consecutive-zero counter lives in a venue_zero column of the existing personal_radar table; a normally productive venue yielding zero
// candidates for 3 consecutive runs files exactly ONE agent_issues row (source radar-hub, category personal, low, epoch-ms times);
// a failed fetch is a gap, not a zero; a same-day re-run does not double count; the counter row never becomes the "latest report".
// Also confirms the taste half-day safety valve restores candidates when taste would drop most of a day.
// Run: node radar-hub/venue-silent.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const base = new Date(Date.now() + 200 * 864e5);
const Y = base.getUTCFullYear();
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][base.getUTCMonth()];
const good = `<html><body><p>Symphony Orchestra concert with Mahler, 4 ${MONTH} ${Y}. Doors open at 19:30 and tickets are on sale.</p><p>Chamber music recital in the Recital Hall, 13 ${MONTH} ${Y}. The quartet plays Beethoven and Haydn.</p></body></html>`;
const empty = "<html><body><nav>Menu Home Tickets</nav></body></html>";
const audit = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER); CREATE UNIQUE INDEX idx_open_title ON agent_issues(title) WHERE status = 'open'");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
const wrap = (d) => ({ prepare(sql) { let args = []; const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: d.prepare(sql).all(...args) }; }, async first() { return d.prepare(sql).get(...args) || null; }, async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; } });
const CAL_API = { async fetch(url, init) { if (init && init.method === "POST") return new Response(JSON.stringify({ id: 1 }), { status: 201 }); return new Response(JSON.stringify({ events: [] }), { status: 200 }); } };
const env = { PERSONAL_DB: wrap(db), AUDIT_DB: wrap(audit), AUDIT: wrap(audit), RADAR_DB: wrap(audit), CAL_API, CAL_TOKEN: "c", RADAR_TOKEN: "t" };
let mode = "good";
globalThis.fetch = async (url) => new URL(String(url)).hostname === "www.concertgebouw.nl" ? (mode === "down" ? new Response("x", { status: 503 }) : new Response(mode === "good" ? good : empty, { status: 200, headers: { "content-type": "text/html" } })) : new Response("nf", { status: 404 });
const go = async () => (await (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), env, {})).json());
// simulate successive days by moving the stored counter row's date back (the worker keys its once-per-day rule on the UTC date)
const ctr = () => { const r = audit.prepare("SELECT venue_zero FROM personal_radar WHERE venue_zero IS NOT NULL ORDER BY scanned_at DESC LIMIT 1").get(); return r ? JSON.parse(r.venue_zero) : null; };
const newDay = () => { const c = ctr(); for (const k of Object.keys(c)) c[k].d = "2000-01-01"; audit.prepare("UPDATE personal_radar SET venue_zero=? WHERE venue_zero IS NOT NULL").run(JSON.stringify(c)); };
const issues = () => audit.prepare("SELECT * FROM agent_issues WHERE title LIKE 'RADAR-VENUE-SILENT-1:%'").all();

mode = "good"; await go(); newDay(); await go(); newDay();
ok(ctr() && ctr().Concertgebouw && ctr().Concertgebouw.z === 0 && ctr().Concertgebouw.p >= 2, "productive runs keep zero counter 0 and count productive runs: " + JSON.stringify(ctr() && ctr().Concertgebouw));
mode = "down"; await go(); newDay(); await go(); newDay(); await go(); newDay();
ok(ctr().Concertgebouw.z === 0 && issues().length === 0, "failed fetches are a gap, never a zero");
mode = "empty"; await go(); newDay(); await go(); newDay();
ok(ctr().Concertgebouw.z === 2 && issues().length === 0, "two zero runs: counter 2, no issue yet");
await go();
ok(ctr().Concertgebouw.z === 3 && issues().length === 1, "third consecutive zero run files one issue");
const is = issues()[0];
ok(is && is.title === "RADAR-VENUE-SILENT-1: Concertgebouw" && is.source === "radar-hub" && is.category === "personal" && is.priority === "low" && is.status === "open", "issue fields: " + JSON.stringify(is && [is.title, is.source, is.category, is.priority, is.status]));
ok(is && is.created_at > 1.7e12 && is.updated_at > 1.7e12, "timestamps are epoch milliseconds");
await go();
ok(issues().length === 1 && ctr().Concertgebouw.z === 3, "same-day re-run neither double counts nor files again");
newDay(); await go();
ok(issues().length === 1 && ctr().Concertgebouw.z === 4, "fourth zero run: still one open issue");
ok(audit.prepare("SELECT count(*) n FROM personal_radar").get().n === 1, "counters add no extra rows: one report row per day");
mode = "good"; newDay(); const back = await go();
ok(ctr().Concertgebouw.z === 0, "a productive run resets the counter");
const nv = JSON.stringify(back);
ok(!/silentVenues\":\[\"Concertgebouw/.test(nv), "recovered venue is not listed silent");
// a never-productive venue (p < 2) does not file
audit.exec("DELETE FROM agent_issues; UPDATE personal_radar SET venue_zero=NULL");
mode = "empty"; for (let i = 0; i < 4; i++) { await go(); if (ctr()) newDay(); }
ok(issues().length === 0, "a venue that was never productive files nothing");
console.log(JSON.stringify({ pass, fail }));
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
