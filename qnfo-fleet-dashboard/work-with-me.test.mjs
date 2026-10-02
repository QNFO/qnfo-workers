// WORK-WITH-ME-METRIC-1 offline suite: replays the reach ingest from worker.js (REACH_DDL through ingestReachSignals, which
// now runs the work-with-me step) against an in-memory SQLite D1 with synthetic mail and RUM rows, and proves:
//   - the subject tag parser (offer keys, a bare tag is "general", an unknown key is "other", replies keep the tag);
//   - inbound_contacts_30d counts distinct senders of tagged inbound mail in the 30 days ending the ingest day: sent mail,
//     spam, the fleet's own domains, registered owner/agent senders and bounces are excluded, the window edges hold;
//   - page views of qnfo.org/work-with-me come from the cf-rum page rows in the same window, with the days covered, and a
//     window without RUM writes no page-view row (never a fabricated 0);
//   - metric_registry gets inbound_contacts_30d and work_with_me_pageviews_30d with the METRIC-INTEGRITY-1 fields, only from
//     the live (yesterday) run, and a refused registry write is reported, not assumed;
//   - a rerun of the same day rewrites the same rows (idempotent);
//   - GET /api/reach serves the latest snapshot as counts only (no address or subject).
// Dates are relative to the real clock, because GET /api/reach reads "yesterday" from Date.now().
// Run: node qnfo-fleet-dashboard/work-with-me.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const slice = (startMark, endMark) => {
  const a = src.indexOf(startMark), b = src.indexOf(endMark, a + 1);
  if (a < 0 || b < a) throw new Error("block not found in worker.js: " + startMark);
  return src.slice(a, b);
};
const helpers = slice("function reachErr(e) {", "// Keeps the `cap` largest entries");
const ingest = slice("var REACH_DDL = [", "// Q08-REVIEW-2026-10-31 (agent_issues 1716");
if (ingest.indexOf("// WORK-WITH-ME-METRIC-1 end") < 0 || ingest.indexOf("await workWithMeMeasure(env, day)") < 0) throw new Error("the work-with-me step is not inside the reach ingest");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, status TEXT DEFAULT 'received', received_at TEXT);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT CHECK (quality IN ('human','bot','unknown')), collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE email_command_senders (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'owner', enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT,
  owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);`);
// The production METRIC-INTEGRITY-1 and METRIC-CADENCE-CANONICAL-1 guards, so the registration must satisfy them.
db.exec(`CREATE TRIGGER mr_source_required BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
CREATE TRIGGER mr_cadence BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;`);

function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(sql), async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
const env = { AUDIT };

const cx = vm.createContext({ console, AbortSignal, fetch: async () => { throw new Error("no network in the offline suite"); } });
vm.runInContext("var VERSION = 'test'; var NAME = 'qnfo-fleet-dashboard'; var ACCOUNT = 'acct'; var DAY_MS = 864e5;\n" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
  helpers + "\n" + ingest + "\n;this.__api = { ingestReachSignals, workWithMeMeasure, workWithMePublish, workWithMeLatest, wwmOfferKey, wwmCount, reachShiftDay, WWM_OFFER_KEYS };", cx);
const api = cx.__api;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

// 1. The tag parser.
ok(api.wwmOfferKey("[work-with-me:jpcub] JPCUB energy assessment") === "jpcub", "an offer tag gives its key");
ok(api.wwmOfferKey("Re: [work-with-me:agent-review] Review of an AI agent operation") === "agent-review", "a reply keeps the tag");
ok(api.wwmOfferKey("[WORK-WITH-ME:Talk] talk") === "talk", "the tag is case-insensitive");
ok(api.wwmOfferKey("[work-with-me] hello") === "general", "a tag without a key is general");
ok(api.wwmOfferKey("[work-with-me:sponsorship] hi") === "other", "an unknown key is other");
ok(api.wwmOfferKey("work with me: jpcub") === null && api.wwmOfferKey(null) === null, "untagged subjects are not counted");
ok(JSON.stringify(Array.from(api.WWM_OFFER_KEYS)) === JSON.stringify(["jpcub", "agent-review", "talk", "research", "role", "general"]), "the offer keys (parity with qnfo-gateway WWM_OFFERS is checked in qnfo-gateway/work-with-me.test.mjs)");

// 2. Fixture relative to the real clock: D = yesterday (UTC), the ingest runs today at 03:00Z.
const today = new Date().toISOString().slice(0, 10);
const D = api.reachShiftDay(today, -1);
const NOW = Date.parse(today + "T03:00:00Z");
const at = (offsetDays, hhmm) => api.reachShiftDay(D, offsetDays) + "T" + (hhmm || "12:00") + ":00.000Z";
let mid = 0;
const mail = (sender, subject, status, received) => db.prepare("INSERT INTO emails (message_id, sender, recipient, subject, status, received_at) VALUES (?, ?, 'rowan.quni@qnfo.org', ?, ?, ?)").run("m" + (++mid), sender, subject, status, received);
mail("ada@uni.example", "[work-with-me:jpcub] JPCUB energy assessment", "replied", at(-4));
mail("Ada@Uni.example", "Re: [work-with-me:jpcub] JPCUB energy assessment", "received", at(-2));   // same contact, second message
mail("ben@lab.example", "[work-with-me:agent-review] Review of an AI agent operation", "archived", at(-15));
mail("cat@corp.example", "[work-with-me:role] Role in research management or applied AI", "processed", at(0, "23:59"));   // last minute of D
mail("gil@who.example", "[work-with-me:sponsorship] hi", "received", at(-10));
mail("hal@site.example", "[work-with-me] hello", "received", at(-7));
mail("dan@x.example", "[work-with-me:talk] Talk or workshop request", "received", at(1, "00:10"));   // after the window
mail("eve@old.example", "[work-with-me:research] Research collaboration", "received", at(-30));   // before the window
mail("eli@edge.example", "[work-with-me:research] Research collaboration", "received", at(-29, "00:00"));   // first minute of the window
mail("spam@bulk.example", "[work-with-me:jpcub] buy now", "spam", at(-3));
mail("rowan.quni@qnfo.org", "Re: [work-with-me:jpcub] JPCUB energy assessment", "sent", at(-3));
mail("qnfo@qnfo.org", "[work-with-me:general] test", "received", at(-1));   // own domain
mail("owner@personal.example", "[work-with-me:jpcub] test from my phone", "received", at(-1));   // registered owner sender
mail("mailer-daemon@googlemail.com", "Undeliverable: Re: [work-with-me:jpcub] JPCUB energy assessment", "archived", at(-1));
mail("ivy@site.example", "Hello", "received", at(-1));   // untagged
db.prepare("INSERT INTO email_command_senders (pattern, kind) VALUES ('owner@personal.example', 'owner')").run();

// 3. The direct measurement.
let m = await api.workWithMeMeasure(env, D);
ok(m.contacts === 6, "distinct tagged senders in the window (ada, ben, cat, gil, hal, eli)", m.contacts);
const offer = (mm, k) => mm.offers[k] || {};
ok(offer(m, "jpcub").contacts === 1 && offer(m, "jpcub").messages === 2, "a reply thread is one contact and two messages", offer(m, "jpcub"));
ok(offer(m, "agent-review").contacts === 1 && offer(m, "role").contacts === 1 && offer(m, "general").contacts === 1 && offer(m, "other").contacts === 1 && offer(m, "research").contacts === 1, "each offer is counted under its own key", m.offers);
ok(offer(m, "talk").contacts === 0 && offer(m, "talk").messages === 0, "an offer nobody used is written as 0, and mail after the window is not counted");
ok(m.rum_days === 0 && m.pageviews === null && m.notes.some((n) => /no cf-rum rows/.test(n)), "no RUM rows in the window: page views unmeasured, not 0", m.notes);
ok(!m.rows.some((r) => r.metric === "pageviews_30d"), "no page-view row without RUM");
const spamRow = m.rows.find((r) => r.metric === "tagged_spam_30d");
ok(spamRow && spamRow.value === 1, "tagged spam is reported separately (1) and not counted as a contact");

// 4. RUM rows: five read days in the window, page rows for the page (both hosts, trailing slash), one outside.
const rum = (day, type, id, v) => db.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'cf-rum', 'web', ?, ?, 'pageviews', ?, 'unknown')").run(day, type, id, v);
for (let i = 0; i < 5; i++) rum(api.reachShiftDay(D, -i), "site", "(all)", 100);
rum(api.reachShiftDay(D, -3), "page", "qnfo.org/work-with-me", 4);
rum(api.reachShiftDay(D, -1), "page", "qnfo.org/work-with-me", 3);
rum(D, "page", "www.qnfo.org/work-with-me/", 1);
rum(D, "page", "qnfo.org/about", 9);
rum(api.reachShiftDay(D, -40), "site", "(all)", 500);
rum(api.reachShiftDay(D, -40), "page", "qnfo.org/work-with-me", 100);

// 5. The real reach ingest on the cron path (no CF_TOKEN, no other source tables: those are skipped, this step runs).
let out = await api.ingestReachSignals(env, { nowMs: NOW });
ok(out.day === D && out.written["work-with-me"] === 19, "the ingest wrote the work-with-me snapshot (3 totals + 7 offers x 2 + 2 page rows)", out.written);
ok(out.notes.some((n) => /page views cover 5 of 30 days/.test(n)), "partial RUM coverage is noted", out.notes);
ok(!out.skipped.some((s) => /work-with-me/.test(s)), "the work-with-me step skipped nothing", out.skipped);
const snap = (id, metric, day) => {
  const r = db.prepare("SELECT value FROM reach_signals WHERE source = 'work-with-me' AND entity_id = ? AND metric = ? AND date = ?").get(id, metric, day || D);
  return r ? r.value : null;
};
ok(snap("work-with-me:all", "inbound_contacts_30d") === 6 && snap("work-with-me:all", "inbound_messages_30d") === 7, "reach_signals totals: 6 contacts, 7 messages");
ok(snap("qnfo.org/work-with-me", "pageviews_30d") === 8 && snap("qnfo.org/work-with-me", "rum_days_30d") === 5, "page views 4 + 3 + 1 over 5 RUM days; other pages and older days excluded");
const reg = (k) => db.prepare("SELECT * FROM metric_registry WHERE metric = ?").get(k);
let rc = reg("inbound_contacts_30d"), rp = reg("work_with_me_pageviews_30d");
ok(rc && rc.last_value === "6" && rc.refresh_cadence === "daily" && rc.layer === "fleet" && rc.source_of_truth && rc.disposition_actor && rc.formula && rc.owner === "qnfo-fleet-dashboard" && rc.state === "MEASURED", "metric_registry inbound_contacts_30d is registered with the METRIC-INTEGRITY-1 fields", rc);
ok(rp && rp.last_value === "8" && rp.last_refreshed === new Date(NOW).toISOString(), "metric_registry work_with_me_pageviews_30d", rp);

// 6. Idempotent: the next cron attempt (the day is 'partial' because the other sources were skipped) rewrites the same rows.
const count = () => db.prepare("SELECT COUNT(*) AS n FROM reach_signals WHERE source = 'work-with-me'").get().n;
const before = count();
out = await api.ingestReachSignals(env, { nowMs: NOW + 36e5 });
ok(out.attempts === 2 && count() === before && snap("work-with-me:all", "inbound_contacts_30d") === 6, "a rerun of the same day writes the same rows, not new ones", { before, after: count(), attempts: out.attempts });
ok(reg("inbound_contacts_30d").last_value === "6" && db.prepare("SELECT COUNT(*) AS n FROM metric_registry").get().n === 2, "the registry row is updated, not duplicated");

// 7. A backfill of an older day writes that day's snapshot and leaves the registry (a live-run value) alone.
const regAt = reg("inbound_contacts_30d").last_refreshed;
out = await api.ingestReachSignals(env, { nowMs: NOW + 2 * 36e5, day: api.reachShiftDay(D, -3) });
const D3 = api.reachShiftDay(D, -3);
ok(snap("work-with-me:all", "inbound_contacts_30d", D3) === 6 && snap("work-with-me:role", "inbound_contacts_30d", D3) === 0 && snap("work-with-me:research", "inbound_contacts_30d", D3) === 2, "backfill window D-32..D-3: ada, ben, gil, hal, eli and eve (cat is later, so role is 0)", { all: snap("work-with-me:all", "inbound_contacts_30d", D3), research: snap("work-with-me:research", "inbound_contacts_30d", D3) });
ok(reg("inbound_contacts_30d").last_value === "6" && reg("inbound_contacts_30d").last_refreshed === regAt, "a backfill does not move metric_registry");

// 8. A refused registry write is reported, never assumed.
db.exec("CREATE TRIGGER mr_refuse BEFORE UPDATE ON metric_registry BEGIN SELECT RAISE(ABORT, 'refused for the test'); END");
const pub = await api.workWithMePublish(env, { contacts: 6, pageviews: 8 }, new Date(NOW).toISOString());
ok(pub.done.length === 0 && pub.refused.length === 2 && /refused for the test/.test(pub.refused[0]), "refused registry writes are listed", pub);
out = await api.ingestReachSignals(env, { nowMs: NOW + 3 * 36e5, day: D });
ok(out.skipped.some((s) => /^work-with-me registry: inbound_contacts_30d/.test(s)), "the ingest reports a refused registry write as skipped", out.skipped);
db.exec("DROP TRIGGER mr_refuse");
const none = await api.workWithMePublish(env, { contacts: 6, pageviews: null }, new Date(NOW).toISOString());
ok(none.done.length === 1 && none.done[0] === "inbound_contacts_30d", "an unmeasured page-view count is not written to the registry", none);

// 9. GET /api/reach through the real fetch handler: the latest snapshot, counts only.
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const r = await worker.fetch(new Request("https://fleet.qnfo.org/api/reach"), env, { waitUntil() {}, passThroughOnException() {} });
const j = await r.json();
const w = j.work_with_me || {};
ok(r.status === 200 && w.date === D && w.contacts_30d === 6 && w.messages_30d === 7 && w.tagged_spam_30d === 1 && w.pageviews_30d === 8 && w.rum_days_30d === 5, "GET /api/reach serves the work-with-me snapshot", w);
ok(w.by_offer && w.by_offer.jpcub && w.by_offer.jpcub.contacts === 1 && w.by_offer.jpcub.messages === 2 && w.by_offer.talk.contacts === 0, "per-offer counts are served", w.by_offer);
ok(w.contact_rate === 0.75, "contact rate = contacts / page views", w.contact_rate);
const body = JSON.stringify(j);
ok(!/@(uni|lab|corp|who|site|x|old|edge|bulk|personal)\.example|googlemail|JPCUB energy assessment/.test(body), "no sender address or subject leaves D1");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
