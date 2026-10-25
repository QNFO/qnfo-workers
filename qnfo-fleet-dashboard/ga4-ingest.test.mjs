// GA4-DATA-API-1 offline suite. Replays the GA4 block of worker.js (ga4B64url through ga4Ingest) with the reach helpers
// against an in-memory SQLite D1 and a mocked fetch: a real RS256 JWT is signed with a generated key and verified, rows
// land in reach_signals source ga4, the day is throttled once ok, a missing key or a 403 writes its reason and no number.
// Run: node qnfo-fleet-dashboard/ga4-ingest.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto, createVerify } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error("block not found: " + a); return src.slice(i, j); };
const helpers = cut("function reachErr(e) {", "// /papers/<slug> or /papers/<slug>/ on any host");
const ga4 = cut("var GA4_SCOPE =", "async function reachIngestTick(env, opts) {");
if (src.indexOf("ga4 = await ga4Ingest(env") < 0) throw new Error("reachIngestTick does not call ga4Ingest");
if (/fetchGa4Reports|parseGa4Report|upsertReachSignals/.test(src)) throw new Error("the empty GA4 stubs are still in worker.js");

let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("FAIL", m, d === undefined ? "" : JSON.stringify(d)); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT); CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));");
const d1 = { prepare(sql) { const st = db.prepare(sql); let args = []; return { bind(...a) { args = a; return this; }, async all() { return { results: st.all(...args) }; }, async run() { st.run(...args); return { success: true }; }, async first() { return st.get(...args) || null; } }; } };

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g).join("\n");
const spki = Buffer.from(await webcrypto.subtle.exportKey("spki", publicKey)).toString("base64").match(/.{1,64}/g).join("\n");
const pem = "-----BEGIN PRIVATE KEY-----\n" + pkcs8 + "\n-----END PRIVATE KEY-----\n";
const pubPem = "-----BEGIN PUBLIC KEY-----\n" + spki + "\n-----END PUBLIC KEY-----\n";
const SA = JSON.stringify({ type: "service_account", client_email: "fleet@qnfo.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });

let mode = "ok", adminMode = "empty", hostMode = "site"; const calls = [];
const fetchMock = async (url, init) => {
  calls.push({ url: String(url), body: init && init.body });
  if (String(url).includes("oauth2.googleapis.com")) {
    const assertion = decodeURIComponent(String(init.body).split("assertion=")[1]);
    const [h, c, s] = assertion.split(".");
    const v = createVerify("RSA-SHA256"); v.update(h + "." + c);
    const good = v.verify(pubPem, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    const claim = JSON.parse(Buffer.from(c.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    ok(good, "the JWT signature verifies with the service account's public key");
    ok(claim.scope === "https://www.googleapis.com/auth/analytics.readonly" && claim.iss === "fleet@qnfo.iam.gserviceaccount.com" && claim.exp - claim.iat === 3600, "the JWT claims read-only scope, issuer and a 1h lifetime", claim);
    return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
  }
  if (String(url).includes("analyticsadmin.googleapis.com")) {
    if (adminMode === "403") return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
    if (/accountSummaries/.test(url)) return new Response(JSON.stringify({ accountSummaries: adminMode === "found" ? [{ propertySummaries: [{ property: "properties/111" }, { property: "properties/222" }] }] : [] }), { status: 200 });
    const id = (/properties\/(\d+)\/dataStreams/.exec(url) || [])[1];
    return new Response(JSON.stringify({ dataStreams: [{ webStreamData: { measurementId: id === "222" ? "G-LV7RHRVW6R" : "G-OTHER" } }] }), { status: 200 });
  }
  if (String(url).includes("analyticsdata.googleapis.com")) {
    if (mode === "403") return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
    if (mode === "empty") return new Response(JSON.stringify({}), { status: 200 });
    const b = JSON.parse(init.body);
    if (b.dimensions[0].name === "hostName" && hostMode === "other") return new Response(JSON.stringify({ rows: [ { dimensionValues: [{ value: "qnfo-publications.pages.dev" }], metricValues: [{ value: "2" }, { value: "1" }, { value: "1" }, { value: "1" }] } ] }), { status: 200 });
    if (b.dimensions[0].name === "hostName") return new Response(JSON.stringify({ rows: [ { dimensionValues: [{ value: "qnfo.org" }], metricValues: [{ value: "120" }, { value: "40" }, { value: "55" }, { value: "30" }] }, { dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "9" }, { value: "1" }, { value: "1" }, { value: "0" }] } ] }), { status: 200 });
    return new Response(JSON.stringify({ rows: [ { dimensionValues: [{ value: "bsky.app" }], metricValues: [{ value: "12" }, { value: "7" }] } ] }), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

const factory = new Function("fetch", "crypto", "console", "AbortSignal", "TextEncoder", "btoa", "atob",
  "var NAME='qnfo-fleet-dashboard'; var VERSION='t'; var DAY_MS=" + 864e5 + "; var GA4_PROPERTY_ID_DEFAULT='486253526';" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }" +
  helpers + ga4 + "; return { ga4Ingest, ga4Rows, ga4ParseKey };");
const quiet = { log() {}, error() {} };
const G = factory(fetchMock, webcrypto, quiet, AbortSignal, TextEncoder, btoa, atob);
const now = Date.parse("2026-10-18T03:00:00Z");

let r = await G.ga4Ingest({ AUDIT: d1 }, { nowMs: now });
ok(r.error === "GA4_SA_KEY not set" && r.written === 0, "no key: the reason is recorded, nothing is written", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "no key writes no number");
ok(db.prepare("SELECT status FROM cloud_ops_events WHERE id='ga4-ingest-2026-10-17'").get().status === "error", "no key leaves an error ledger row");

db.exec("DELETE FROM cloud_ops_events");
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(!r.error && r.written === 14 && r.property === "486253526", "a granted key writes 4 host + 2 source + 8 page/channel/country/device rows", r);
ok(r.property_source === "default" && /no property the service account can read carries G-LV7RHRVW6R \(0 scanned\); reading the default 486253526/.test(r.property_warning || ""), "no accessible property carries the tag: warning, default read", r);
const rows = db.prepare("SELECT entity_type, entity_id, metric, value, quality FROM reach_signals WHERE source='ga4' ORDER BY entity_type, metric").all();
ok(rows.some((x) => x.entity_id === "qnfo.org" && x.metric === "screenPageViews" && x.value === 120 && x.quality === "human"), "page views per host", rows);
ok(!rows.some((x) => x.entity_id === "(not set)"), "a (not set) dimension is skipped");
ok(rows.some((x) => x.entity_type === "source" && x.entity_id === "bsky.app" && x.metric === "engagedSessions" && x.value === 7), "engaged sessions per source");
ok(["page", "channel", "country", "device"].every((k) => rows.some((x) => x.entity_type === k)), "the rich ingest stores page, channel, country and device rows", rows.map((x) => x.entity_type));
ok(calls.filter((c) => c.url.includes(":runReport")).every((c) => JSON.parse(c.body).dateRanges[0].startDate === "2026-10-17"), "the report reads the complete UTC day before now");


const n0 = calls.length;
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.throttled === "2026-10-17" && calls.length === n0, "an ok day is not read twice", r);

// GA4-PROPERTY-MISMATCH-1: no pinned property -> the Admin API is asked; none carries the tag -> the default is read and the ledger says so.
ok(/\(no property the service account can read/.test(db.prepare("SELECT text FROM cloud_ops_events WHERE id='ga4-ingest-2026-10-17'").get().text), "the ledger row text carries the property warning");
db.exec("INSERT INTO ops_config (key, value) VALUES ('ga4_property_id', '999')");
mode = "403";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(/runReport 403 PERMISSION_DENIED/.test(r.error || "") && r.property === "999" && r.written === 0, "a refused grant records 403 and the configured property, no rows", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE date='2026-10-18'").get().n === 0, "a refused grant writes no number");
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(r.attempts === 3 && r.error, "the third attempt still runs", r);
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(r.gave_up === "2026-10-18", "after 3 failed attempts the day is given up", r);
ok(G.ga4ParseKey("not json") === null && G.ga4ParseKey(SA).email === "fleet@qnfo.iam.gserviceaccount.com", "the key parser accepts only a service-account JSON key");


// discovery finds the property by the measurement id of its web data stream, saves it, and the next run is pinned (no Admin call)
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
mode = "ok"; adminMode = "found";
let c0 = calls.length;
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 3 * 864e5 });
ok(!r.error && r.property === "222" && r.property_source === "discovered" && r.scanned === 2, "the property whose stream carries G-LV7RHRVW6R is found among the readable ones", r);
ok(db.prepare("SELECT value FROM ops_config WHERE key='ga4_property_id'").get().value === "222", "the discovered property is saved as ops_config ga4_property_id");
ok(calls.slice(c0).some((c) => /properties\/222:runReport/.test(c.url)), "the report is read from the discovered property");
c0 = calls.length;
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 4 * 864e5 });
ok(r.property === "222" && !calls.slice(c0).some((c) => /analyticsadmin/.test(c.url)), "the next day is pinned: no Admin API call", r);
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events");
adminMode = "403";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 5 * 864e5 });
ok(!r.error && /property discovery failed: accountSummaries 403/.test(r.property_warning || "") && r.property === "486253526", "a refused Admin call is a warning, never a stop: the default is read", r);

// GA4-HONEST-1 (agent_issues 2935): discovery refused and the default property reports none of the site hosts -> a different property;
// its rows are stored as quality "unknown" and the ledger line says so. A site host in the report keeps quality "human".
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
adminMode = "403"; hostMode = "other";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 6 * 864e5 });
ok(!r.error && r.quality === "unknown" && /none of the site hosts/.test(r.property_warning || ""), "a property with no site host is flagged, not trusted", r);
const unk = db.prepare("SELECT entity_type, entity_id, quality FROM reach_signals WHERE source='ga4'").all();
ok(unk.length > 0 && unk.every((x) => x.quality === "unknown"), "every row of that property is stored as quality unknown", unk);
ok(/quality unknown/.test(db.prepare("SELECT text FROM cloud_ops_events WHERE kind='ga4-ingest'").get().text), "the ledger text says the rows are quality unknown");
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
hostMode = "site";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 7 * 864e5 });
ok(!r.error && r.quality === "human" && db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE source='ga4' AND quality='human'").get().n === 14, "a site host in the report keeps quality human", r);
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
hostMode = "other"; adminMode = "found";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 8 * 864e5 });
ok(!r.error && r.property_source === "discovered" && r.quality === "human", "a discovered property is trusted whatever its first host row is", r);

// GA4-QUALITY-1: a 0-row day is "empty", waits 6h, then retries; it is never a final ok.
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
mode = "empty";
const emptyMs = now + 9 * 864e5;
const emptyDay = new Date(emptyMs - 864e5).toISOString().slice(0, 10);
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: emptyMs });
ok(!r.error && r.written === 0 && r.status === "empty" && r.next_try_ms === emptyMs + 6 * 3600 * 1000, "a 0-row day is empty with a 6h retry", r);
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: emptyMs + 3600 * 1000 });
ok(r.waiting === emptyDay && r.written === undefined, "a retry before next_try waits", r);
mode = "ok";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: emptyMs + 6 * 3600 * 1000 + 1 });
ok(!r.error && r.written > 0 && r.status === "ok", "after next_try the day is read again", r);
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
mode = "ok";

console.log((fail ? "FAIL" : "PASS") + "  " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
