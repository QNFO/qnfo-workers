// INTEG-GSC-1 offline suite (qnfo-fleet-dashboard 1.72.0, agent_issues 2924). Replays the Search Console block of worker.js (gscQuery, gscRows, gscIngest) with the GA4 key helpers
// and the reach helpers against an in-memory SQLite D1 and a mocked fetch: a real RS256 JWT is signed with a generated key and verified (scope webmasters.readonly, not analytics),
// the site total, pages and queries land in reach_signals source gsc (channel search; clicks, impressions, ctr, position), the day read is three days back, an ok day is not read
// twice, a missing key or a 403 writes its reason and no number, and the 403 text names the owner card that fixes it.
// Run: node qnfo-fleet-dashboard/gsc-ingest.test.mjs   -> prints "PASS N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto, createVerify } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error("block not found: " + a); return src.slice(i, j); };
const helpers = cut("function reachErr(e) {", "// /papers/<slug> or /papers/<slug>/ on any host");
const block = cut("var GA4_SCOPE =", "async function reachIngestTick(env, opts) {");
if (block.indexOf("async function gscIngest(env, opts) {") < 0) throw new Error("gscIngest is not inside the GA4 block");
if (src.indexOf("gsc = await gscIngest(env") < 0) throw new Error("reachIngestTick does not call gscIngest");

let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("FAIL", m, d === undefined ? "" : JSON.stringify(d)); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT); CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric))");
const d1 = { prepare(sql) { const st = db.prepare(sql); let args = []; return { bind(...a) { args = a; return this; }, async all() { return { results: st.all(...args) }; }, async run() { st.run(...args); return { success: true }; } }; } };

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g).join("\n");
const spki = Buffer.from(await webcrypto.subtle.exportKey("spki", publicKey)).toString("base64").match(/.{1,64}/g).join("\n");
const pem = "-----BEGIN PRIVATE KEY-----\n" + pkcs8 + "\n-----END PRIVATE KEY-----\n";
const pubPem = "-----BEGIN PUBLIC KEY-----\n" + spki + "\n-----END PUBLIC KEY-----\n";
const SA = JSON.stringify({ type: "service_account", client_email: "fleet@qnfo.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });

let mode = "ok"; const calls = [];
const fetchMock = async (url, init) => {
  calls.push({ url: String(url), body: init && init.body });
  if (String(url).includes("oauth2.googleapis.com")) {
    const assertion = decodeURIComponent(String(init.body).split("assertion=")[1]);
    const [h, c, s] = assertion.split(".");
    const v = createVerify("RSA-SHA256"); v.update(h + "." + c);
    const good = v.verify(pubPem, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    const claim = JSON.parse(Buffer.from(c.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    ok(good, "the JWT signature verifies with the service account's public key");
    ok(claim.scope === "https://www.googleapis.com/auth/webmasters.readonly" && claim.iss === "fleet@qnfo.iam.gserviceaccount.com" && claim.exp - claim.iat === 3600, "the JWT claims the read-only Search Console scope, the issuer and a 1h lifetime", claim);
    return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
  }
  if (String(url).includes("www.googleapis.com/webmasters/v3/sites/")) {
    if (mode === "403") return new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permission for site 'sc-domain:qnfo.org'." } }), { status: 403 });
    if (mode === "disabled") return new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Google Search Console API has not been used in project 254457120993 before or it is disabled." } }), { status: 403 });
    if (mode === "500") return new Response(JSON.stringify({ error: { status: "INTERNAL" } }), { status: 500 });
    if (mode === "empty") return new Response(JSON.stringify({}), { status: 200 });
    const b = JSON.parse(init.body);
    if (!b.dimensions) return new Response(JSON.stringify({ rows: [{ clicks: 31, impressions: 940, ctr: 0.033, position: 14.2 }] }), { status: 200 });
    if (b.dimensions[0] === "page") return new Response(JSON.stringify({ rows: [{ keys: ["https://papers.qnfo.org/papers/Joules-Per-Solution-Metric"], clicks: 9, impressions: 210, ctr: 0.0429, position: 8.1 }, { keys: [""], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] }), { status: 200 });
    return new Response(JSON.stringify({ rows: [{ keys: ["Joules Per Solution"], clicks: 4, impressions: 51, ctr: 0.078, position: 5.5 }, { keys: ["landauer limit benchmark"], clicks: 2, impressions: 40, ctr: 0.05, position: 9.9 }] }), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

const factory = new Function("fetch", "crypto", "console", "AbortSignal", "TextEncoder", "btoa", "atob",
  "var NAME='qnfo-fleet-dashboard'; var VERSION='t'; var DAY_MS=" + 864e5 + "; var GA4_PROPERTY_ID_DEFAULT='486253526';" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }" +
  helpers + block + "; return { gscIngest, gscRows, gscQuery, ga4ParseKey, GSC_LAG_DAYS };");
const quiet = { log() {}, error() {} };
const G = factory(fetchMock, webcrypto, quiet, AbortSignal, TextEncoder, btoa, atob);
const now = Date.parse("2026-10-26T03:00:00Z");

// the pure row builder
const sample = G.gscRows("2026-10-23", { rows: [{ keys: ["A Page"], clicks: 3, impressions: 10, ctr: 0.3, position: 2 }, { keys: [""], clicks: 1 }, { keys: ["x"], clicks: "n/a", impressions: 4 }] }, "page");
ok(sample.length === 5 && sample.every((x) => x.source === "gsc" && x.channel === "search" && x.entity_type === "page" && x.quality === "human"), "rows: four metrics for a page, an empty key skipped, a non-number skipped", sample);
ok(sample.some((x) => x.entity_id === "a page" && x.metric === "position" && x.value === 2), "the page key is lower-cased");
ok(G.gscRows("2026-10-23", { rows: [{ clicks: 5, impressions: 50, ctr: 0.1, position: 7 }] }, "site").every((x) => x.entity_id === "(all)") && G.gscRows("d", {}, "site").length === 0 && G.gscRows("d", null, "page").length === 0, "the site total has no key and is stored as (all); no report is no rows");
ok(G.GSC_LAG_DAYS === 3, "Search Console data is read three days back");

// no key: the reason is recorded, nothing is written
let r = await G.gscIngest({ AUDIT: d1 }, { nowMs: now });
ok(r.error === "GA4_SA_KEY not set" && r.written === 0 && r.status === "error", "no key: the reason is recorded, nothing is written", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "no key writes no number");
ok(db.prepare("SELECT status FROM cloud_ops_events WHERE id='gsc-ingest-2026-10-23'").get().status === "error", "no key leaves an error ledger row for the day read (three days back)");

// a granted key
db.exec("DELETE FROM cloud_ops_events");
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(!r.error && r.status === "ok" && r.day === "2026-10-23" && r.site === "sc-domain:qnfo.org" && r.written === 4 + 4 + 8 && r.pages === 2 && r.queries === 2, "a granted key writes the site total (4), one page (4, the empty key skipped) and two queries (8)", r);
const rows = db.prepare("SELECT date, entity_type, entity_id, metric, value, quality, channel FROM reach_signals WHERE source='gsc' ORDER BY entity_type, entity_id, metric").all();
ok(rows.every((x) => x.date === "2026-10-23" && x.channel === "search" && x.quality === "human"), "every row is the day read, channel search, quality human", rows[0]);
ok(rows.some((x) => x.entity_type === "site" && x.entity_id === "(all)" && x.metric === "clicks" && x.value === 31) && rows.some((x) => x.entity_type === "page" && x.entity_id === "https://papers.qnfo.org/papers/joules-per-solution-metric" && x.metric === "impressions" && x.value === 210), "site clicks and a page's impressions", rows);
ok(rows.some((x) => x.entity_type === "query" && x.entity_id === "joules per solution" && x.metric === "position" && x.value === 5.5), "queries are stored (top queries are what the Invest page needs)");
const reqs = calls.filter((c) => c.url.includes("/searchAnalytics/query"));
ok(reqs.length === 3 && reqs.every((c) => c.url.includes("sites/sc-domain%3Aqnfo.org/searchAnalytics/query") && JSON.parse(c.body).startDate === "2026-10-23" && JSON.parse(c.body).endDate === "2026-10-23"), "three reads (total, pages, queries), the encoded property, the one day", reqs.map((c) => c.url));
ok(/GSC ingest 2026-10-23: 16 rows \(2 pages, 2 queries\) from sc-domain:qnfo.org/.test(db.prepare("SELECT text FROM cloud_ops_events WHERE id='gsc-ingest-2026-10-23'").get().text), "the ledger row says what was read");

// an ok day is not read twice
const n0 = calls.length;
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.throttled === "2026-10-23" && calls.length === n0, "a day that has a ledger row is not read twice", r);

// ops_config gsc_site_url overrides the domain property
db.exec("DELETE FROM cloud_ops_events; DELETE FROM reach_signals");
db.exec("INSERT INTO ops_config (key, value) VALUES ('gsc_site_url', 'https://papers.qnfo.org/')");
const c0 = calls.length;
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.site === "https://papers.qnfo.org/" && calls.slice(c0).some((c) => c.url.includes("sites/https%3A%2F%2Fpapers.qnfo.org%2F/searchAnalytics/query")), "a configured property is read instead of the domain property", r);
db.exec("DELETE FROM ops_config; DELETE FROM cloud_ops_events; DELETE FROM reach_signals");

// the service account is not a user of the property: denied, the owner card is named, no number
mode = "403";
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.status === "denied" && /searchAnalytics 403 PERMISSION_DENIED/.test(r.error || "") && r.written === 0, "a 403 is denied with the Google status, no rows", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "a refusal writes no number");
const led = db.prepare("SELECT status, text FROM cloud_ops_events WHERE id='gsc-ingest-2026-10-23'").get();
ok(led.status === "denied" && /gsc-service-account-user/.test(led.text) && /Search Console API is not enabled/.test(led.text), "the ledger names the two fixes and the owner card", led);
const n1 = calls.length;
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 3600 * 1000 });
ok(r.throttled === "2026-10-23" && r.status === "denied" && calls.length === n1, "a denied day is not hammered: one attempt a day", r);
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now, force: true });
ok(r.status === "denied" && calls.length > n1, "force reads again");
db.exec("DELETE FROM cloud_ops_events");
mode = "disabled";
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.status === "denied" && /Search Console API has not been used in project/.test(r.error || ""), "the API-not-enabled answer carries Google's own message", r);

// another error is an error, not a denial
db.exec("DELETE FROM cloud_ops_events");
mode = "500";
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.status === "error" && /searchAnalytics 500/.test(r.error || "") && !/gsc-service-account-user/.test(db.prepare("SELECT text FROM cloud_ops_events WHERE id='gsc-ingest-2026-10-23'").get().text), "a 500 is an error and does not blame the owner step", r);

// a day with no search traffic is empty, never a fabricated zero
db.exec("DELETE FROM cloud_ops_events");
mode = "empty";
r = await G.gscIngest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(!r.error && r.status === "empty" && r.written === 0 && db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "an empty answer writes nothing and says empty", r);
mode = "ok";
ok(G.ga4ParseKey(SA).email === "fleet@qnfo.iam.gserviceaccount.com", "the GA4 key parser is shared");

// the worker source stays ASCII and the key never reaches a log line or a row
ok(!/[^\x00-\x7F]/.test(src), "worker.js is ASCII-only");
ok(!JSON.stringify(db.prepare("SELECT * FROM cloud_ops_events").all()).includes("BEGIN PRIVATE KEY") && !JSON.stringify(db.prepare("SELECT * FROM reach_signals").all()).includes("BEGIN PRIVATE KEY"), "no key material reaches the ledger or reach_signals");

console.log((fail ? "FAIL" : "PASS") + "  " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
