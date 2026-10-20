// radar-hub venue-recovered suite (1.5.0, RADAR-VENUE-RECOVERED-1, agent_issues 2573, charter pillar: personal).
// Loads the real worker.js and drives the personal radar via /personal/?run=1 against in-memory SQLite with a stubbed venue page.
// Before 1.5.0 the radar filed RADAR-VENUE-SILENT-1 when a productive venue yielded nothing for 3 runs and reset the counter when it yielded
// again, but nothing closed the issue (its contract is loop-owned for 48 h, then "stale"). Proves: the run that sees the venue yield again
// closes the open issue through issue_triage.close_evidence (close_channel auto-recovery) and names it in recoveredVenues; a venue that never
// had an issue closes nothing; a failed fetch is a gap and closes nothing; a same-day re-run does not close twice; an issue left open from
// before the counter reset (recovery happened under the old code) is closed by the next productive run; another venue's issue is untouched.
// Run: node radar-hub/venue-recovered.test.mjs   -> prints "N passed, 0 failed"
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
audit.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, close_channel TEXT, created_at INTEGER, updated_at INTEGER)");
audit.exec("CREATE UNIQUE INDEX ux_open_title ON agent_issues(title) WHERE status = 'open'");
audit.exec("CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER)");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
const wrap = (d) => ({ prepare(sql) { let args = []; const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: d.prepare(sql).all(...args) }; }, async first() { return d.prepare(sql).get(...args) || null; }, async run() { const r = d.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } }; return s; }, async batch(a) { for (const s of a) await s.run(); return []; }, async exec(sql) { d.exec(sql); } });
const CAL_API = { async fetch(url, init) { if (init && init.method === "POST") return new Response(JSON.stringify({ id: 1 }), { status: 201 }); return new Response(JSON.stringify({ events: [] }), { status: 200 }); } };
const env = { PERSONAL_DB: wrap(db), AUDIT_DB: wrap(audit), AUDIT: wrap(audit), RADAR_DB: wrap(audit), CAL_API, CAL_TOKEN: "c", RADAR_TOKEN: "t" };
let mode = "good";
globalThis.fetch = async (url) => new URL(String(url)).hostname === "www.concertgebouw.nl" ? (mode === "down" ? new Response("x", { status: 503 }) : new Response(mode === "good" ? good : empty, { status: 200, headers: { "content-type": "text/html" } })) : new Response(empty, { status: 200, headers: { "content-type": "text/html" } });
const go = async () => (await (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), env, {})).json());
const ctr = () => { const r = audit.prepare("SELECT venue_zero FROM personal_radar WHERE venue_zero IS NOT NULL ORDER BY scanned_at DESC LIMIT 1").get(); return r ? JSON.parse(r.venue_zero) : null; };
const newDay = () => { const c = ctr(); for (const k of Object.keys(c)) c[k].d = "2000-01-01"; audit.prepare("UPDATE personal_radar SET venue_zero=? WHERE venue_zero IS NOT NULL").run(JSON.stringify(c)); };
const issue = (v) => audit.prepare("SELECT * FROM agent_issues WHERE title = ?").get("RADAR-VENUE-SILENT-1: " + v);
const triage = (id) => audit.prepare("SELECT * FROM issue_triage WHERE issue_id = ?").get(id);

// 1. two productive days, three zero days: one issue; then the venue yields again
mode = "good"; await go(); newDay(); await go(); newDay();
mode = "empty"; await go(); newDay(); await go(); newDay(); await go();
const filed = issue("Concertgebouw");
ok(filed && filed.status === "open", "the third zero run filed an open issue");
newDay(); mode = "good";
const back = await go();
const closed = issue("Concertgebouw");
ok(closed.status === "closed" && closed.close_channel === "auto-recovery", "the first productive run closes the issue with close_channel auto-recovery: " + JSON.stringify(closed && [closed.status, closed.close_channel]));
const tr = triage(filed.id);
ok(tr && tr.triage_state === "closed" && tr.rc === "RADAR-VENUE-RECOVERED-1" && /Concertgebouw/.test(tr.close_evidence) && /yielded \d+ usable candidate/.test(tr.close_evidence), "close_evidence names the venue and the yield: " + JSON.stringify(tr && tr.close_evidence));
ok(Array.isArray(back.recoveredVenues) && back.recoveredVenues.includes("Concertgebouw"), "the run result lists recoveredVenues: " + JSON.stringify(back.recoveredVenues));
ok(closed.updated_at > 1.7e12, "updated_at is epoch milliseconds");
ok(ctr().Concertgebouw.z === 0, "the counter is reset");

// 2. same-day re-run: nothing more to close
const again = await go();
ok(Array.isArray(again.recoveredVenues) && again.recoveredVenues.length === 0, "a same-day re-run closes nothing: " + JSON.stringify(again.recoveredVenues));
ok(audit.prepare("SELECT count(*) n FROM issue_triage").get().n === 1, "one triage row only");

// 3. a productive venue with no issue closes nothing and writes no triage row
newDay(); const calm = await go();
ok(calm.recoveredVenues.length === 0 && audit.prepare("SELECT count(*) n FROM issue_triage").get().n === 1, "no issue, no close, no triage row");

// 4. another venue's open issue is untouched by Concertgebouw yielding
audit.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES ('RADAR-VENUE-SILENT-1: Stedelijk', 'x', 'radar-hub', 'personal', 'low', 'open', ?, ?)").run(Date.now(), Date.now());
newDay(); await go();
ok(issue("Stedelijk").status === "open", "another venue's open issue stays open while that venue yields nothing");

// 5. an issue left open from before the counter reset is closed by the next productive run of its venue
audit.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES ('RADAR-VENUE-SILENT-1: Concertgebouw', 'old', 'radar-hub', 'personal', 'low', 'open', ?, ?)").run(Date.now(), Date.now());
newDay(); const late = await go();
ok(late.recoveredVenues.includes("Concertgebouw") && audit.prepare("SELECT status FROM agent_issues WHERE title = 'RADAR-VENUE-SILENT-1: Concertgebouw' ORDER BY id DESC LIMIT 1").get().status === "closed", "an issue left open after an earlier recovery is closed by the next productive run");

// 6. a failed fetch is a gap: it closes nothing
audit.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES ('RADAR-VENUE-SILENT-1: Concertgebouw', 'again', 'radar-hub', 'personal', 'low', 'open', ?, ?)").run(Date.now(), Date.now());
mode = "down"; newDay(); const gap = await go();
ok(gap.recoveredVenues.length === 0 && audit.prepare("SELECT status FROM agent_issues WHERE title = 'RADAR-VENUE-SILENT-1: Concertgebouw' ORDER BY id DESC LIMIT 1").get().status === "open", "a failed fetch closes nothing");
mode = "empty"; newDay(); const quiet = await go();
ok(quiet.recoveredVenues.length === 0 && audit.prepare("SELECT status FROM agent_issues WHERE title = 'RADAR-VENUE-SILENT-1: Concertgebouw' ORDER BY id DESC LIMIT 1").get().status === "open", "a silent run closes nothing");

// 7. the version says what changed (a suite never pins an exact VERSION)
const m = String(src.match(/^var VERSION = "([^"]+)"/m)[1]).match(/^(\d+)\.(\d+)\./);
ok(Number(m[1]) > 1 || (Number(m[1]) === 1 && Number(m[2]) >= 5), "VERSION is at least 1.5.0 (minor: a decision the worker now takes on its own)");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
