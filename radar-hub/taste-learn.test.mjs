// radar-hub taste-learning suite (1.2.2, RADAR-TASTE-LEARN-1, charter pillar: personal).
// Loads the real worker.js, drives the personal radar run through the hub's /personal route against in-memory SQLite
// (qnfo-audit as AUDIT_DB and RADAR_DB, with an optional calendar_feedback table), a stubbed venue page and a stubbed calendar-api.
// Proves: missing or empty feedback table = baseline scores and posts; three nopes lower a venue's priority, three wents raise it;
// bad-timing and too-much-effort change friction only (cap 3); multiplier clamp bounds; shrinkage below 3 samples;
// the stated-taste prior only applies once feedback exists; the report shows the weights.
// Run: node radar-hub/taste-learn.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const base = new Date(Date.now() + 200 * 864e5);
const Y = base.getUTCFullYear();
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][base.getUTCMonth()];
const page = (
  "<html><body>" +
  `<p>Symphony Orchestra concert with Mahler, 4 ${MONTH} ${Y}. Doors open at 19:30 and tickets are on sale.</p>` +
  `<p>Chamber music recital in the Recital Hall, 13 ${MONTH} ${Y}. The quartet plays Beethoven and Haydn.</p>` +
  `<p>Repair cafe hobby tech meetup for arduino fans, 20 ${MONTH} ${Y}. Bring your own broken gadget along.</p>` +
  "</body></html>"
);
const FB = "CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER NOT NULL, uid TEXT, action TEXT NOT NULL, reason TEXT, met TEXT, note TEXT, title TEXT, location TEXT, domain TEXT, source TEXT, dtstart TEXT, relevance REAL, friction REAL, ts TEXT DEFAULT (datetime('now')), synced_to_ledger INTEGER DEFAULT 0)";
function makeEnv(rows, opts = {}) {
  const db = new DatabaseSync(":memory:");
  const audit = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT)");
  if (rows) {
    audit.exec(FB);
    for (const r of rows) audit.prepare("INSERT INTO calendar_feedback (cal_id, action, reason, location, domain) VALUES (1,?,?,?,?)").run(r[0], r[1] || null, r[2] || "Concertgebouw", r[3] || "CLA");
  }
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
  const CAL_API = { async fetch(url, init) { if (init && init.method === "POST") { posted.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: posted.length }), { status: 201 }); } return new Response(JSON.stringify({ events: [] }), { status: 200 }); } };
  const env = { PERSONAL_DB: wrap(db), AUDIT_DB: wrap(audit), AUDIT: wrap(audit), RADAR_DB: opts.noRadarDb ? undefined : wrap(audit), CAL_API, CAL_TOKEN: "c", RADAR_TOKEN: "t" };
  return { audit, env, posted };
}
globalThis.fetch = async (url) => new URL(String(url)).hostname === "www.concertgebouw.nl" ? new Response(page, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 });
async function go(rows, opts) {
  const T = makeEnv(rows, opts);
  const out = await (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), T.env, {})).json();
  const rep = T.audit.prepare("SELECT report, events_json FROM personal_radar").get();
  const ev = JSON.parse(rep.events_json).map((g) => g.e);
  const by = (d) => ev.find((e) => e.startIso.slice(8) === d); // snippets bleed into neighbours, so pick by day
  return { out, T, report: rep.report, ev, sym: by("04"), rec: by("13"), rep: by("20") };
}
const times = (n, a, r, loc, dom) => Array.from({ length: n }, () => [a, r, loc, dom]);
const OTHER = [["keep", null, "Stedelijk", "FIL"]]; // an unrelated row: switches taste on without touching Concertgebouw or CLA

// control: no table, empty table, no RADAR_DB binding = identical baseline
const B = await go(null);
const E = await go([]);
const N = await go(null, { noRadarDb: true });
ok(B.out.ok === true && B.out.taste.active === false, "no calendar_feedback table: taste inactive, run still works");
ok(B.sym && B.rec && B.rep, "fixture events are all extracted");
const sig = (x) => JSON.stringify(x.ev.map((e) => [e.startIso, e.relevance, e.friction, e.priority]));
ok(sig(B) === sig(E) && sig(B) === sig(N), "missing table, empty table and missing binding give identical scores");
ok(JSON.stringify(B.T.posted.map((p) => [p.dtstart, p.relevance, p.friction])) === JSON.stringify(E.T.posted.map((p) => [p.dtstart, p.relevance, p.friction])), "empty feedback posts exactly what the baseline posts");
ok(B.ev.every((e) => !e.taste), "baseline events carry no taste block");
ok(/Taste weights/.test(B.report) && /inactive/.test(B.report), "report says taste is inactive");

// neutral reference: taste on through an unrelated row
const R = await go(OTHER);
ok(R.out.taste.active === true, "an unrelated feedback row switches taste on");
ok(R.sym.relevance >= B.sym.relevance, "the stated-taste prior lifts classical music a little (" + B.sym.relevance + " -> " + R.sym.relevance + ")");
ok(R.rep.relevance < B.rep.relevance, "the repair cafe / hobby-tech prior pushes that event down (" + B.rep.relevance + " -> " + R.rep.relevance + ")");

// three nopes lower, three wents raise
const NO = await go(times(3, "nope", "not-my-thing"));
const WENT = await go(times(3, "went"));
ok(NO.sym.priority < R.sym.priority && NO.sym.priority < B.sym.priority, "three nopes lower the venue's priority (" + B.sym.priority + " -> " + NO.sym.priority + ")");
ok(WENT.sym.priority > R.sym.priority && WENT.sym.priority > B.sym.priority, "three wents raise the venue's priority (" + B.sym.priority + " -> " + WENT.sym.priority + ")");
ok(NO.sym.taste.mult === 0.3, "multiplier floor is 0.3 (got " + NO.sym.taste.mult + ")");
ok(WENT.sym.taste.mult === 1.5, "multiplier ceiling is 1.5 (got " + WENT.sym.taste.mult + ")");
ok(WENT.sym.relevance <= 10, "relevance never exceeds 10");
ok(NO.sym.friction === B.sym.friction && WENT.sym.friction === B.sym.friction, "taste answers do not change friction");
const N3 = NO.ev.filter((e) => e.venue === "Concertgebouw").length === B.ev.length;
ok(N3, "every event keeps its venue");

// shrinkage below three samples
const ONE = await go(times(1, "nope", "not-my-crowd"));
ok(ONE.sym.taste.mult > NO.sym.taste.mult && ONE.sym.taste.mult < R.sym.taste.mult, "one nope pulls less than three (" + ONE.sym.taste.mult + " between " + NO.sym.taste.mult + " and " + R.sym.taste.mult + ")");

// bad-timing and too-much-effort: friction only, +1 each, cap 3
const BT = await go(times(2, "nope", "bad-timing").concat(OTHER));
ok(BT.sym.friction === R.sym.friction + 2 && BT.sym.relevance === R.sym.relevance, "two bad-timing nopes add 2 friction and leave relevance alone (friction " + R.sym.friction + " -> " + BT.sym.friction + ")");
ok(BT.sym.taste.score === R.sym.taste.score, "bad-timing does not move the taste score");
const EF = await go(times(5, "nope", "too-much-effort").concat(times(1, "nope", "bad-timing")));
ok(EF.sym.friction === Math.min(10, R.sym.friction + 3) && EF.sym.taste.frictionAdd === 3, "friction addition is capped at 3 (got +" + EF.sym.taste.frictionAdd + ")");
ok(EF.sym.priority < R.sym.priority, "added friction lowers priority");

// a nope without a taste reason counts for nothing; other venues untouched
const NR = await go([["nope", null, "Concertgebouw", "CLA"]]);
ok(NR.out.taste.active === false || NR.sym.taste.score === R.sym.taste.score, "a nope with no reason carries no taste weight");

// report shows the weights
ok(/## Taste weights/.test(NO.report) && /Concertgebouw score -/.test(NO.report) && /CLA score -/.test(NO.report), "the run report lists venue and domain weights");
ok(/stated-taste prior/.test(NO.report), "the run report names the prior");

// failure: a table with a broken shape falls back to baseline
const BAD = makeEnv(null);
BAD.audit.exec("CREATE TABLE calendar_feedback (id INTEGER)");
const bo = await (await W.fetch(new Request("https://radar-hub.example/personal/?run=1", { headers: { authorization: "Bearer t" } }), BAD.env, {})).json();
ok(bo.ok === true && bo.taste.active === false, "a malformed feedback table fails safe");

const h = await (await W.fetch(new Request("https://radar-hub.example/health"), {}, {})).json();
ok(h.version === "1.2.2", "hub /health reports 1.2.2");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
