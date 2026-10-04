// personal-api ledger-sync suite (4.6.0, CONNECTION-LEDGER-1 step 1, charter pillar: personal, agent_issues #1951).
// Loads the real worker.js; drives the daily cron (scheduled) against an in-memory SQLite personal-life D1 with the Ledger
// tables and a stubbed calendar-api service binding that serves calendar_feedback rows through GET /feedback?since=.
// Proves: name splitting (comma, "and", "&", "with", dedupe, junk); a went row with names creates people and in_person
// interactions; reruns never duplicate (boundary row is refetched); an existing person (any case) is reused; the cursor
// advances to the newest ts and is sent as ?since=; malformed rows are counted and skipped; rows without met or with other
// actions create nothing; a CAL_API error leaves the cursor alone; /health shows ledger counts; the MCP ledger tools work.
// Run: node personal-api/ledger-sync.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const wrap = (d) => ({
  prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return s;
  }
});
function makeEnv() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ledger_people (id TEXT PRIMARY KEY, name TEXT NOT NULL, met_where TEXT, met_on TEXT, interests TEXT, how_to_reach TEXT, cadence_days INTEGER NOT NULL DEFAULT 21, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE ledger_interactions (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, ts TEXT NOT NULL DEFAULT (datetime('now')), kind TEXT NOT NULL DEFAULT 'in_person', note TEXT, FOREIGN KEY (person_id) REFERENCES ledger_people(id));
  CREATE VIEW v_ledger_due AS SELECT p.id, p.name, p.met_where, p.interests, p.how_to_reach, p.cadence_days, COALESCE(MAX(i.ts), p.created_at) AS last_contact, CAST(julianday('now') - julianday(COALESCE(MAX(i.ts), p.created_at)) AS INTEGER) AS days_since FROM ledger_people p LEFT JOIN ledger_interactions i ON i.person_id = p.id WHERE p.status = 'active' GROUP BY p.id HAVING days_since >= p.cadence_days ORDER BY days_since DESC;
  CREATE VIEW v_ledger_seen_twice AS SELECT (SELECT COUNT(*) FROM ledger_people WHERE status = 'active') AS people_total, (SELECT COUNT(*) FROM (SELECT person_id FROM ledger_interactions WHERE kind = 'in_person' GROUP BY person_id HAVING COUNT(*) >= 2)) AS seen_twice, 0 AS seen_three_plus;
  CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT);
  CREATE TABLE daily_briefs (date TEXT PRIMARY KEY, payload TEXT, built_at TEXT)`);
  const st = { rows: [], sinces: [], status: 200 };
  const CAL_API = { async fetch(url) {
    const u = new URL(String(url));
    if (u.pathname === "/feedback") {
      st.sinces.push(u.searchParams.get("since"));
      if (st.status !== 200) return new Response("{}", { status: st.status });
      const since = u.searchParams.get("since");
      return new Response(JSON.stringify({ ok: true, feedback: st.rows.filter((r) => !r || typeof r.ts !== "string" || r.ts >= since).slice().reverse() }), { status: 200 });
    }
    return new Response(JSON.stringify({ events: [] }), { status: 200 });
  } };
  return { db, st, env: { PERSONAL: wrap(db), CAL_API, CAL_TOKEN: "c", API_KEY: "k" } };
}
globalThis.fetch = async () => new Response("{}", { status: 200 });
const cron = (env) => W.scheduled({}, env, { waitUntil() {} });
const count = (db, t) => db.prepare("SELECT COUNT(*) n FROM " + t).get().n;
const state = (db, k) => (db.prepare("SELECT v FROM ledger_sync_state WHERE k=?").get(k) || {}).v;
const went = (id, ts, met, extra) => Object.assign({ id, cal_id: id, action: "went", met, note: "n" + id, title: "Jazz night " + id, location: "Bimhuis", dtstart: ts.slice(0, 10) + "T20:00:00", ts }, extra || {});

// name splitting (observed through the sync)
let T = makeEnv();
T.st.rows = [went(1, "2026-10-05 21:00:00", "Anna, Bob and Chloe & Dmitri; with Eva, anna, ,  , 12345678901234567890123456789012345678901234567890123456789012345", { note: "Great talk" })];
await cron(T.env);
const names = T.db.prepare("SELECT name FROM ledger_people ORDER BY name").all().map((r) => r.name);
ok(JSON.stringify(names) === JSON.stringify(["Anna", "Bob", "Chloe", "Dmitri", "Eva"]), "splits on comma, and, &, ';', strips 'with', dedupes case-insensitively, drops empty and over-long parts (got " + names + ")");
ok(count(T.db, "ledger_interactions") === 5, "one interaction per person (" + count(T.db, "ledger_interactions") + ")");
const p = T.db.prepare("SELECT * FROM ledger_people WHERE name='Anna'").get();
ok(p.id === "anna-2026-10-05" && p.met_on === "2026-10-05" && p.met_where === "Jazz night 1" && p.notes === "Great talk" && p.status === "active", "person id slug-met_on, met_where = event title, notes = note (" + JSON.stringify(p) + ")");
const ia = T.db.prepare("SELECT * FROM ledger_interactions WHERE person_id='anna-2026-10-05'").get();
ok(ia.kind === "in_person" && ia.note === "Great talk" && ia.ts === "2026-10-05 21:00:00", "interaction is in_person with the note");
ok(state(T.db, "feedback_cursor") === "2026-10-05 21:00:00", "cursor advanced to the newest ts");
const lr = JSON.parse(state(T.db, "last_run"));
ok(lr.people_created === 5 && lr.interactions_added === 5 && lr.went === 1 && lr.version, "last_run row records counters and version");

// idempotency: rerun with the same data (boundary row is refetched with ts >= cursor)
await cron(T.env);
ok(T.st.sinces[1] === "2026-10-05 21:00:00", "second run sends the cursor as ?since= (" + T.st.sinces + ")");
ok(count(T.db, "ledger_people") === 5 && count(T.db, "ledger_interactions") === 5, "rerun never duplicates people or interactions");
ok(JSON.parse(state(T.db, "last_run")).interactions_added === 0, "rerun adds nothing");

// reuse: same name, other case, later meeting, new feedback row -> same person, second interaction; seen twice
T.st.rows.push(went(2, "2026-10-12 21:00:00", "ANNA", { note: "Again" }));
await cron(T.env);
ok(count(T.db, "ledger_people") === 5, "existing active person reused case-insensitively");
ok(T.db.prepare("SELECT COUNT(*) n FROM ledger_interactions WHERE person_id='anna-2026-10-05'").get().n === 2, "second meeting logged on the same person");
ok(state(T.db, "feedback_cursor") === "2026-10-12 21:00:00", "cursor moved forward");
const h = await (await W.fetch(new Request("https://p.example/health"), T.env, { waitUntil() {} })).json();
ok(h.ledger && h.ledger.people === 5 && h.ledger.seen_twice === 1 && h.ledger.last_sync && h.ledger.last_sync.version, "/health reports ledger people and seen twice (" + JSON.stringify(h.ledger) + ")");

// archived person with same name is not reused
T = makeEnv();
T.db.prepare("INSERT INTO ledger_people (id,name,status) VALUES ('old','Zed','archived')").run();
T.st.rows = [went(1, "2026-10-05 21:00:00", "Zed")];
await cron(T.env);
ok(count(T.db, "ledger_people") === 2 && T.db.prepare("SELECT status FROM ledger_people WHERE id='zed-2026-10-05'").get().status === "active", "an archived person is not reused; a new active row is created");

// ignored and malformed rows
T = makeEnv();
T.st.rows = [
  went(1, "2026-10-05 21:00:00", ""),
  went(2, "2026-10-05 21:01:00", null),
  went(3, "2026-10-05 21:02:00", "Ignored", { action: "nope" }),
  went(4, "2026-10-05 21:03:00", 42),
  { action: "went", met: "NoId" },
  null,
  "junk",
  went(6, "2026-10-05 21:04:00", "Good", { note: null, dtstart: "garbage" })
];
await cron(T.env);
const lr2 = JSON.parse(state(T.db, "last_run"));
ok(JSON.stringify(T.db.prepare("SELECT name, met_on, notes FROM ledger_people").all().map((r) => [r.name, r.met_on, r.notes])) === JSON.stringify([["Good", "2026-10-05", null]]), "only the valid went row with names creates a person; bad dtstart falls back to the answer date");
ok(lr2.skipped_malformed === 4 && lr2.skipped_no_met === 2 && lr2.went === 4, "malformed rows counted (" + lr2.skipped_malformed + ") and rows without met counted (" + lr2.skipped_no_met + ")");
ok(count(T.db, "ledger_interactions") === 1, "exactly one interaction");

// calendar-api failure: cursor untouched, error recorded, brief cron still ran
T = makeEnv();
T.st.rows = [went(1, "2026-10-05 21:00:00", "Ann")];
await cron(T.env);
T.st.status = 503; T.st.rows.push(went(2, "2026-10-06 21:00:00", "Ben"));
await cron(T.env);
ok(state(T.db, "feedback_cursor") === "2026-10-05 21:00:00" && /HTTP 503/.test(state(T.db, "last_run")) && count(T.db, "ledger_people") === 1, "a calendar-api error keeps the cursor and creates nothing");
T.st.status = 200;
await cron(T.env);
ok(count(T.db, "ledger_people") === 2, "the next healthy run catches up");
ok(T.db.prepare("SELECT COUNT(*) n FROM daily_briefs").get().n >= 1, "the daily brief is still built");

// MCP tools
const mcp = async (env, name, args) => {
  const r = await W.fetch(new Request("https://p.example/mcp", { method: "POST", headers: { authorization: "Bearer k", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env, { waitUntil() {} });
  return (await r.json()).result.structuredContent;
};
T = makeEnv();
let r = await mcp(T.env, "ledger_add_person", { name: "Mira Kowalska", met_where: "Warsaw", notes: "likes jazz" });
ok(r.ok && /^mira-kowalska-\d{4}-\d{2}-\d{2}$/.test(r.id) && r.reused === false, "ledger_add_person creates");
r = await mcp(T.env, "ledger_add_person", { name: "mira kowalska" });
ok(r.ok && r.reused === true && count(T.db, "ledger_people") === 1, "ledger_add_person reuses by name");
r = await mcp(T.env, "ledger_log", { name: "MIRA KOWALSKA", note: "coffee" });
ok(r.ok && count(T.db, "ledger_interactions") === 1, "ledger_log logs an in_person interaction");
r = await mcp(T.env, "ledger_log", { name: "Nobody" });
ok(r.ok === false && /ledger_add_person/.test(r.error), "ledger_log on an unknown name explains itself");
T.db.prepare("UPDATE ledger_people SET created_at = datetime('now','-40 days')").run();
T.db.prepare("UPDATE ledger_interactions SET ts = datetime('now','-30 days')").run();
r = await mcp(T.env, "ledger_due", {});
ok(r.ok && r.count === 1 && r.due[0].name === "Mira Kowalska", "ledger_due lists a person past cadence");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
