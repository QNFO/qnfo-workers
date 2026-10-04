// radar-hub away-gate suite (1.2.2, AWAY-GATE-1, charter pillar: personal).
// Loads the real worker.js and drives the personal radar run through the hub's /personal route against an in-memory
// SQLite personal-life D1 (events table), a stubbed venue page and a stubbed calendar-api service binding.
// Proves: with a lodging row outside Amsterdam, Amsterdam events that start inside the window are not posted to the
// calendar and are tagged away:<city> in the report; the day before check-in and the check-out day are still posted;
// with no lodging row, or lodging in Amsterdam, nothing is gated; other categories (flights) do not create windows;
// the report names the windows.
// Run: node radar-hub/away-gate.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// The radar keeps events from today to one year ahead, so build the five dates about 200 days out, whatever today is.
const base = new Date(Date.now() + 200 * 864e5);
const Y = base.getUTCFullYear();
const MM = String(base.getUTCMonth() + 1).padStart(2, "0");
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][base.getUTCMonth()];
const iso = (d) => `${Y}-${MM}-${String(d).padStart(2, "0")}`;
const page = (
  "<html><body>" +
  `<p>Choir and orchestra concert with Brahms, 3 ${MONTH} ${Y}. Tickets are on sale now at the box office.</p>` +
  `<p>Symphony Orchestra concert with Mahler, 4 ${MONTH} ${Y}. Doors open at 19:30 and tickets are on sale.</p>` +
  `<p>Chamber music recital in the Recital Hall, 13 ${MONTH} ${Y}. The quartet plays Beethoven and Haydn.</p>` +
  `<p>Opera concert gala evening with orchestra, 14 ${MONTH} ${Y}. Soloists perform famous arias tonight.</p>` +
  `<p>Piano recital in the Main Hall, 20 ${MONTH} ${Y}. A sonata evening with Schubert and Chopin.</p>` +
  "</body></html>"
);

function makeEnv(opts) {
  const db = new DatabaseSync(":memory:");
  const audit = new DatabaseSync(":memory:");
  if (!opts.noEventsTable) db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
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
  const posted = [];
  const CAL_API = {
    async fetch(url, init) {
      if (init && init.method === "POST") { const b = JSON.parse(init.body); posted.push(b); return new Response(JSON.stringify({ id: posted.length }), { status: 201 }); }
      return new Response(JSON.stringify({ events: [] }), { status: 200 });
    }
  };
  const env = { PERSONAL_DB: wrap(db), AUDIT_DB: wrap(audit), AUDIT: wrap(audit), RADAR_DB: wrap(audit), CAL_API, CAL_TOKEN: "c", RADAR_TOKEN: "t" };
  return { db, audit, env, posted };
}
globalThis.fetch = async (url) => {
  if (new URL(String(url)).hostname === "www.concertgebouw.nl") return new Response(page, { status: 200, headers: { "content-type": "text/html" } });
  return new Response("not found", { status: 404 });
};
const runRadar = async (env) => (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), env, {})).json();
const insLodging = (db, id, cat, city, country, st, en) => db.prepare("INSERT INTO events (id, category, title, venue, city, country, start_date, end_date) VALUES (?,?,?,?,?,?,?,?)").run(id, cat, "x", "v", city, country, st, en);
const dates = (posted) => posted.map((b) => b.dtstart).sort();

// control: no lodging rows -> everything posted
let T = makeEnv({});
let out = await runRadar(T.env);
ok(out.ok === true && out.version === "1.2.7", "the personal radar run answers with its new version (" + out.version + ")");
ok(JSON.stringify(dates(T.posted)) === JSON.stringify([iso(3), iso(4), iso(13), iso(14), iso(20)]), "control: with no lodging row all five Amsterdam events are posted (got " + dates(T.posted) + ")");

// away window Oct 4 to Oct 14 (check-out day exclusive) in Krakow
T = makeEnv({});
insLodging(T.db, "l1", "lodging", "Wroclaw", "PL", iso(4), iso(6));
insLodging(T.db, "l2", "lodging", "Krakow", "PL", iso(6), iso(14));
out = await runRadar(T.env);
ok(JSON.stringify(dates(T.posted)) === JSON.stringify([iso(3), iso(14), iso(20)]), "events inside the window are not posted; the day before check-in, the check-out day and later are (got " + dates(T.posted) + ")");
const report = T.audit.prepare("SELECT report, events_json FROM personal_radar").get();
ok(/away windows \(lodging rows outside Amsterdam\): Wroclaw .*\.\..*; Krakow /.test(report.report), "the report names the away windows");
const gated = JSON.parse(report.events_json).filter((g) => !g.cleared).map((g) => g.e.startIso + ":" + g.reasons.join(","));
ok(gated.length === 2 && gated.includes(iso(4) + ":away:Wroclaw") && gated.includes(iso(13) + ":away:Krakow"), "gated events carry away:<city> as the reason (got " + gated + ")");

// lodging in Amsterdam, flights and empty or malformed rows create no window
T = makeEnv({});
insLodging(T.db, "a1", "lodging", "Amsterdam", "NL", iso(4), iso(14));
insLodging(T.db, "f1", "travel", "Gdansk", "PL", iso(4), iso(14));
insLodging(T.db, "b1", "lodging", "Krakow", "PL", iso(4), "");
insLodging(T.db, "b2", "lodging", "Krakow", "PL", iso(14), iso(4));
out = await runRadar(T.env);
ok(T.posted.length === 5, "Amsterdam lodging, travel rows and rows with a missing or reversed end date gate nothing (posted " + T.posted.length + ")");

// a trip that already ended does not matter
T = makeEnv({});
insLodging(T.db, "p1", "lodging", "Krakow", "PL", "2020-01-01", "2020-01-05");
out = await runRadar(T.env);
ok(T.posted.length === 5, "a past trip gates nothing");

// hub health still tracks the hub version
const h1 = await (await W.fetch(new Request("https://radar-hub.example/health"), {}, {})).json();
ok(h1.version === (/var VERSION = "([^"]+)"/.exec(src) || [])[1] && h1.version === "1.2.3", "hub /health reports 1.2.3");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
